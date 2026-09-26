# Testing

Test placement, what a test must assert, test doubles, determinism, lint interplay, and the infra gotchas that pass locally then fail in CI.

## Placement

- Public-API tests live in `tests/` (each `tests/*.rs` file compiles as its own crate against the pub surface). Private internals get inline `#[cfg(test)]` modules next to the code they test.
- Benchmarks (criterion, `#[bench]`) aren't tests: they live in `benches/`, not `tests/`. See `performance.md`'s Benchmarks section.
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
- No logic in test bodies: no loops, conditionals, or arithmetic deriving the expected value; keep expectations explicit and literal.

## Assertions

- `assert_eq!`/`assert_ne!` print both values on failure: prefer them over `assert!` on a comparison; attach a custom message naming what the assertion means. Pin panic tests with `#[should_panic(expected = "...")]`, never bare: a bare `should_panic` passes on any unrelated panic, and an overflow panic only fires with debug checks on. Error-path tests return `Result` and use `?`: never combined with `should_panic`; assert `value.is_err()` instead.
- Property tests complement, never replace, hand-picked cases: `proptest` for invariants over large input spaces; keep the edge cases as unit tests.

## Test Doubles

- Preference order: real implementation > in-memory fake > stub > interaction mock. Reach for a mock only when the real thing is slow, non-deterministic, or an external system outside your control.
- Mock your own code and the test proves less: hand-rolled trait doubles in unit tests, real dependencies in integration tests.
- A mock earns no assertions: asserting on the double passes when the double is present and fails when it is absent; it says nothing about the component. Assert the behavior the double feeds.
- A partial mock fails silently: mirror the complete real structure (all documented fields), not just the fields the test reads.

## Lint Interplay

With `clippy::unwrap_used`/`expect_used` at `warn` and CI running `-D warnings`, test code gets rejected for the unwraps it legitimately uses. Exempt it where it lives, never with a crate-root `cfg_attr`: every file carrying test bodies (a `tests/*.rs` crate, a `tests/*/main.rs` crate or one of its `mod` subfiles, a test module linked in by `#[path]`) opens with

```rust
#![allow(clippy::unwrap_used, clippy::expect_used)]
```

and an inline `mod tests { … }` takes the same allow as its first inner attribute.

## Process-Global State Races

All tests in one binary share one process, and cargo runs them on parallel threads by default:

- **Env vars**: a test's `remove_var` lands mid another test's env-dependent path: intermittent failures that a single-threaded run hides. Serialize every env-mutating test (e.g. `#[serial_test::serial(key)]` on a shared key); reproduce suspected races with `--test-threads=8` in a loop. Edition 2024 makes `set_var`/`remove_var` `unsafe` for exactly this reason.
- **Global overrides** (color/terminal detection, loggers): don't toggle them per-test; make assertions insensitive instead (strip ANSI codes rather than forcing color off).
- **Real `$HOME`**: tests that resolve paths through home-dir helpers write to the real home unless sandboxed. Redirect `$HOME` (tempdir + shared lock) before touching path helpers.

## Determinism

- No sleeps or wall-clock waits to synchronize a test: if the code spawns work without handing back a way to await it, change the API to return the join handle or future. For time-owned logic, inject the clock or tick and drive it explicitly (`tokio::time::pause`/`advance` for tokio timers).
- RAII guard fixtures restore global state (env vars, cwd) even when the test panics.

## Paths to Built Binaries

Never hardcode `target/debug/<name>`: it breaks under a shared/overridden `CARGO_TARGET_DIR`. Use `env!("CARGO_BIN_EXE_<name>")` in integration tests, or resolve `cargo metadata`'s `target_directory`.

## `#[path]`-Linked Tests Double-Compile

Test bodies in `tests/` linked into `#[cfg(test)]` modules via `#[path = "../tests/..."]` are *also* autodiscovered by cargo as standalone integration crates, where `super::*` doesn't resolve, so `cargo check --tests` errors. Either set `autotests = false` in `[package]`, or put linked bodies in subdirectories (`tests/unit/…`; cargo autodiscovers `tests/*.rs` and `tests/*/main.rs`, so subdir bodies dodge the double-compile only if none is named `main.rs`), with a thin top-level aggregator per real integration crate.

## Network-Dependent Tests

Keep live end-to-end tests in-tree without making the suite flaky: `#[ignore = "network: hits <host>"]`. They compile under the default gate, get skipped by `cargo test`, and run explicitly via `cargo test -- --ignored`. The reason string documents why they're out of the default run.

## Dependency Bumps

Gate dep bumps on `cargo test`, not `cargo build`: a minor bump can compile clean while silently dropping a transitively-enabled feature and breaking behavior only tests observe.

## Platform-Gated Test Code

A suite can lint clean on one OS and red another on code the cfg gates hide: `#[cfg(unix)]` items and their helpers read unused on windows, and windows-only lints (platform-sized enum variants) never fire on linux. Cross-`--target` clippy closes most of it, except crates whose C build scripts need the target's own compiler. The local approximation: flip `#[cfg(unix)]` to `#[cfg(any())]` across the test files only, run `cargo clippy --all-targets --all-features --release -- -D warnings`, then restore byte-identically (python `s.replace` + count asserts + snapshot). That surfaces exactly the dead-code/unused-import class the other platform's leg reds on. Never flip src/ gates: production cfg pairs keep each other used, so flipping one side manufactures false dead-code.
