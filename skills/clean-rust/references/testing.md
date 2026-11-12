# Testing

Load when writing, reviewing or debugging tests, a nextest test group, or a first fuzz target.
Covers placement, what a test must assert, test doubles, determinism, lint interplay, and the infra gotchas that pass locally then fail in CI.

## Placement

- Public-API tests live in `tests/` (each `tests/*.rs` file compiles as its own crate against the pub surface, and `cargo test` runs those binaries one after another: prefer one `tests/<name>/main.rs` with modules over many files). Private internals get inline `#[cfg(test)]` modules next to the code they test.
- Helpers shared by integration tests go in `tests/common/mod.rs`, pulled in with `mod common;`: a `tests/common.rs` compiles and runs as a test crate of its own.
- Test-only crates go in `[dev-dependencies]`, never `[dependencies]`.
- An example in a doc comment is a doctest. `cargo nextest run` runs none: add a `cargo test --doc` step. Benchmarks run under `cargo nextest run` only with `--all-targets` or `--benches`.
- Non-trivial logic ships with tests that fail if the logic breaks. Assert exact expected values and the edge/error paths; then watch the test fail once against the code before the change (never by breaking the assertion) before trusting green. A test that can't fail is a bug in the test.
- Reproduce a reported bug with a failing test *before* fixing it.
- One behavior per test, named `behavior_condition_outcome` (`rejects_empty_email`, `reports_error_when_invalid_syntax_encountered`): a multi-path test hides which path failed, and `functionality_works` names nothing.
- Never test what the type system or an upstream dependency already guarantees: an unrepresentable invalid state has no test that can reach it, and a dependency's behavior is its maintainers' test to write; spot-check only the behavior you rely on.
- A smoke test proving only "doesn't panic" is a floor, never coverage.
- Cover boundary values deliberately: `None`/empty, `-1`/`0`/`1`, `min`/`max`, one case per error class. Bugs live on the edges; a random or property sweep misses them.
- Read what the existing suite pins before adding a test: a new test re-pinning a covered path is redundancy, not signal.
- Many input/output pairs under one behavior: a table-driven test, one case per row, each row carrying a failure message naming the case. Keep tables short: cargo runs one test function on one thread.

## Assert the Contract, Not the Plumbing

Pinning an error string that leaks from a lower layer cements bugs as "expected": a feature path that silently no-ops can pass green because the test asserts the underlying library's message instead of the feature's intended end state. Assert what the feature promises (final state, emitted output, the domain error variant), not incidental strings from a dependency.

Related conflation to check explicitly: EOF versus error on reads. A test asserting "returns error" that's actually seeing clean EOF hides the real failure path.

- The expected value comes from an independent source: a hand-computed literal, a spec-pinned fixture, golden data. An expectation computed by the code under test (or its helpers) passes no matter what that code does.
- Mirror image: don't assert incidental implementation detail. A test that pins internals reds every benign refactor; keep only tests that still validate the behavior after the implementation is swapped for an opaque model.
- No logic in test bodies: no conditionals or arithmetic deriving the expected value, and no loop but one over table rows; keep expectations explicit and literal.

## Assertions

- `assert_eq!`/`assert_ne!` print both values on failure: prefer them over `assert!` on a comparison; attach a custom message naming what the assertion means. Pin panic tests with `#[should_panic(expected = "...")]` (a substring of the panic message; `clippy::should_panic_without_expect`), never bare: a bare `should_panic` passes on any unrelated panic, and an overflow panic only fires with debug checks on. Error-path tests return `Result` and use `?`: never combined with `should_panic`. Assert the error itself: `assert!(matches!(value, Err(ParseError::Empty)))`, or `value.unwrap_err()` when any error will do; never `assert!(value.is_err())`. `clippy::assertions_on_result_states`
- `#[test]` marks only a free, non-generic function with no arguments, returning `()` or `Result<(), E>` with `E: Debug`.
- Property tests complement, never replace, hand-picked cases: `proptest` for invariants over large input spaces; keep the edge cases as unit tests.
- See the captured output of passing tests with `cargo test -- --show-output`; by default only failing tests show theirs.
- Never rely on `panic = "abort"` in a test: cargo ignores a profile's `panic` setting for tests and benchmarks, since the test harness needs `unwind`.

## Test Doubles

- Preference order: real implementation > in-memory fake > stub > interaction mock. Reach for a mock only when the real thing is slow, non-deterministic, or an external system outside your control.
- Mock your own code and the test proves less: hand-rolled trait doubles in unit tests, real dependencies in integration tests.
- A mock earns no assertions: asserting on the double passes when the double is present and fails when it is absent; it says nothing about the component. Assert the behavior the double feeds.
- A partial mock fails silently: mirror the complete real structure (all documented fields), not just the fields the test reads.
- A connection handler is generic over `AsyncRead + Unpin` / `AsyncWrite + Unpin`, never a concrete `TcpStream`, so a test can pass a mock.

## Lint Interplay

With `clippy::unwrap_used` at `warn` and CI running `-D warnings`, `allow-unwrap-in-tests = true` in `clippy.toml` (`lints.md`) exempts every `#[test]` fn and `#[cfg(test)]` module: test bodies need no `allow`, and never a crate-root `cfg_attr`. A helper outside both (a function in `tests/common/mod.rs`, a non-test fn in a `tests/*.rs` file) gets, at the top of its file,

```rust
// fragment
#![expect(clippy::unwrap_used, reason = "test helper: a panic fails the test")]
```

never a bare `#![allow(..)]`: the `expect` (1.81) warns once the file holds no `unwrap`.

## Process-Global State Races

All tests in one binary share one process, and cargo runs them on parallel threads by default:

- **Env vars**: a test's `remove_var` lands mid another test's env-dependent path: intermittent failures that a single-threaded run hides; reproduce suspected races with `cargo test -- --test-threads=8` in a loop. Edition 2024 makes `set_var`/`remove_var` `unsafe`: outside Windows neither is sound in this multi-threaded process, even under `#[serial_test::serial(key)]`, since other threads still read the environment. Under `unsafe_code = "forbid"` (`lints.md`) neither compiles, in tests either, and no `allow` lifts it: keep it and pass the value in (below). Only a crate without `forbid` runs such tests under nextest (below).
- **Global overrides** (color/terminal detection, loggers): don't toggle them per-test; make assertions insensitive instead (strip ANSI codes rather than forcing color off).
- **Real `$HOME`**: tests that resolve paths through home-dir helpers write to the real home unless sandboxed. Redirect `$HOME` to a tempdir (env-var rule above) before touching path helpers.

Under `cargo nextest run` every test is its own process: `#[serial]` and a `static Mutex` guard nothing there. Mutual exclusion is a test group in `.config/nextest.toml`:

```toml
[test-groups]
serial-db = { max-threads = 1 }

[[profile.default.overrides]]
filter = 'test(/^db::/)'
test-group = 'serial-db'
```

In a crate without `forbid`, a test there sets the environment as its first statement:

```rust
#[test]
fn reads_config_path() {
    // SAFETY: own process under nextest; this test has started no thread, and the harness thread never touches the environment.
    unsafe { std::env::set_var("APP_CONFIG", "test.toml") };
    // wrong: the same call after a `thread::spawn`, or under `cargo test`
}
```

Under `forbid`, code that needs a variable takes its value as a parameter or a config struct, and its unit test passes the value in:

```rust
use std::path::PathBuf;

// `main` passes `std::env::var_os("APP_CONFIG")`, the one read of the variable
fn config_path(app_config: Option<std::ffi::OsString>) -> PathBuf {
    app_config.map_or_else(|| PathBuf::from("app.toml"), PathBuf::from)
}

#[test]
fn config_path_uses_the_value_passed_in() {
    // wrong: `unsafe { std::env::set_var(..) }`: an error under `forbid`
    assert_eq!(config_path(Some("test.toml".into())), PathBuf::from("test.toml"));
}
```

Test the read itself in `tests/*.rs`: run the binary as a child with the variable set. Cargo builds it for the test and sets `CARGO_BIN_EXE_<name>` to its path.

```rust
// fragment
// tests/config.rs: assumes a binary target named `app` that prints the config path it reads
use std::process::Command;

#[test]
fn app_reads_config_path_from_env() {
    let out = Command::new(env!("CARGO_BIN_EXE_app"))
        .env("APP_CONFIG", "test.toml")
        .output()
        .expect("run the app binary");
    assert!(out.status.success(), "app exited with {}", out.status);
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim_end(), "test.toml");
}
```

## Determinism

- No sleeps or wall-clock waits to synchronize a test: if the code spawns work without handing back a way to await it, change the API to return the join handle or future. For time-owned logic, inject the clock or tick and drive it explicitly (tokio timers: `#[tokio::test(start_paused = true)]` (tokio 1.2), not a leading `tokio::time::pause()`, then `advance(d).await`; all need tokio's `test-util` feature).
- RAII guard fixtures restore global state (cwd, not env vars) even when the test panics.
- A test server binds port 0 and reads the port back from `local_addr()`: never a fixed port behind a lock.
- A spawned `Child` is not killed on drop: `kill()` it, then `wait()`.

```rust
let mut child = std::process::Command::new("sleep").arg("30").spawn().expect("spawn helper");
// wrong: letting `child` fall out of scope here
child.kill().expect("kill helper");
child.wait().expect("reap helper");
```

## Paths to Built Binaries

Never hardcode `target/debug/<name>`: it breaks under a shared/overridden `CARGO_TARGET_DIR`. Use `env!("CARGO_BIN_EXE_<name>")` in integration tests, or resolve `cargo metadata`'s `target_directory`. A test binary archived and run on another machine reads it at run time instead (`test-tooling.md`).

A test binary that runs on another machine (a nextest archive) reads paths at runtime: `std::env::var("CARGO_MANIFEST_DIR")`, never `env!("CARGO_MANIFEST_DIR")`, which bakes in the build machine's path.

## `#[path]`-Linked Tests Double-Compile

Test bodies in `tests/` linked into `#[cfg(test)]` modules via `#[path = "../tests/..."]` are *also* autodiscovered by cargo as standalone integration crates, where `super::*` doesn't resolve, so `cargo check --tests` errors. Either set `autotests = false` in `[package]`, or put linked bodies in subdirectories (`tests/unit/…`; cargo autodiscovers `tests/*.rs` and `tests/*/main.rs`, so subdir bodies dodge the double-compile only if none is named `main.rs`), with a thin top-level aggregator per real integration crate.

## Network-Dependent Tests

Keep live end-to-end tests in-tree without making the suite flaky: `#[ignore = "network: hits <host>"]`. They compile under the default gate, get skipped by `cargo test`, and run explicitly via `cargo test -- --ignored` (`--include-ignored` runs both sets). The reason string documents why they're out of the default run.

## Dependency Bumps

Gate dep bumps on `cargo test`, not `cargo build`: a minor bump can compile clean while silently dropping a transitively-enabled feature and breaking behavior only tests observe.

## Platform-Gated Test Code

A suite can lint clean on one OS and red another on code the cfg gates hide: `#[cfg(unix)]` items and their helpers read unused on windows, and windows-only lints (platform-sized enum variants) never fire on linux. Cross-`--target` clippy closes most of it, except crates whose C build scripts need the target's own compiler. The local approximation: flip `#[cfg(unix)]` to `#[cfg(any())]` across the test files only, run `cargo clippy --all-targets --all-features --release -- -D warnings`, then restore byte-identically (python `s.replace` + count asserts + snapshot). That surfaces exactly the dead-code/unused-import class the other platform's leg reds on. Never flip src/ gates: production cfg pairs keep each other used, so flipping one side manufactures false dead-code.

## Fuzzing

A parser or decoder of untrusted bytes gets a `cargo fuzz` target in `fuzz/fuzz_targets/` (nightly toolchain). The file starts with `#![no_main]`. The closure handles `Err`, with no `unwrap` and no `expect`: a panic is a reported crash.

```rust
// fragment
#![no_main]

libfuzzer_sys::fuzz_target!(|data: &[u8]| {
    // wrong: `std::str::from_utf8(data).unwrap()`
    if let Ok(text) = std::str::from_utf8(data) {
        if let Err(_e) = my_crate::parse(text) {}
    }
});
```

In CI bound the run: `cargo +nightly fuzz run parse -- -max_total_time=60` (libFuzzer flags go after `--`).

Profiles, override order, retries, timeouts, default filters, sharding, archives, fuzz oracles, `cfg(fuzzing)` and fuzz CI artifacts: `test-tooling.md`.

## Checklist

- [ ] Each new test was seen failing against the code before the change.
- [ ] Expected values are literals; panic tests pin `expected`; no test asserts on a mock.
- [ ] No sleep, fixed port, leaked `Child`, or hardcoded `target/` path.
- [ ] Under `forbid`, no test sets a variable: it passes the value in, or spawns the binary; without `forbid`, env-mutating tests run under nextest and call `set_var` first.
- [ ] No bare unwrap `allow` in test code; a `tests/` helper outside `#[test]` and `#[cfg(test)]` carries the `expect`.
