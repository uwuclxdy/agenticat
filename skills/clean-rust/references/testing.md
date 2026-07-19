# Testing

Test placement, lint interplay, and the infra gotchas that pass locally then fail in CI.

## Placement

- Public-API tests live in `tests/` (each `tests/*.rs` file compiles as its own crate against the pub surface). Private internals get inline `#[cfg(test)]` modules next to the code they test.
- Benchmarks (criterion, `#[bench]`) aren't tests: they live in `benches/`, not `tests/`. See `performance.md`'s Benchmarks section.
- Non-trivial logic ships with tests that fail if the logic breaks. Assert exact expected values and the edge/error paths; then watch the test fail once (break the code or the assertion) before trusting green. A test that can't fail is a bug in the test.
- Reproduce a reported bug with a failing test *before* fixing it.

## Assert the Contract, Not the Plumbing

Pinning an error string that leaks from a lower layer cements bugs as "expected": a feature path that silently no-ops can pass green because the test asserts the underlying library's message instead of the feature's intended end state. Assert what the feature promises (final state, emitted output, the domain error variant), not incidental strings from a dependency.

Related conflation to check explicitly: EOF versus error on reads. A test asserting "returns error" that's actually seeing clean EOF hides the real failure path.

## Lint Interplay

With `clippy::unwrap_used`/`expect_used` at `warn` and CI running `-D warnings`, test code gets rejected for the unwraps it legitimately uses. One crate-root attribute covers everything:

```rust
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used))]
```

Integration test files (their own crates) instead take a file-top `#![allow(clippy::unwrap_used, clippy::expect_used)]`.

## Process-Global State Races

All tests in one binary share one process, and cargo runs them on parallel threads by default:

- **Env vars**: a test's `remove_var` lands mid another test's env-dependent path: intermittent failures that a single-threaded run hides. Serialize every env-mutating test (e.g. `#[serial_test::serial(key)]` on a shared key); reproduce suspected races with `--test-threads=8` in a loop. Edition 2024 makes `set_var`/`remove_var` `unsafe` for exactly this reason.
- **Global overrides** (color/terminal detection, loggers): don't toggle them per-test; make assertions insensitive instead (strip ANSI codes rather than forcing color off).
- **Real `$HOME`**: tests that resolve paths through home-dir helpers write to the real home unless sandboxed. Redirect `$HOME` (tempdir + shared lock) before touching path helpers.

## Paths to Built Binaries

Never hardcode `target/debug/<name>`: it breaks under a shared/overridden `CARGO_TARGET_DIR`. Use `env!("CARGO_BIN_EXE_<name>")` in integration tests, or resolve `cargo metadata`'s `target_directory`.

## `#[path]`-Linked Tests Double-Compile

Test bodies in `tests/` linked into `#[cfg(test)]` modules via `#[path = "../tests/..."]` are *also* autodiscovered by cargo as standalone integration crates, where `super::*` doesn't resolve, so `cargo check --tests` errors. Either set `autotests = false` in `[package]`, or put linked bodies in subdirectories (`tests/unit/…`; cargo autodiscovers `tests/*.rs` and `tests/*/main.rs`, so subdir bodies dodge the double-compile only if none is named `main.rs`), with a thin top-level aggregator per real integration crate.

## Network-Dependent Tests

Keep live end-to-end tests in-tree without making the suite flaky: `#[ignore = "network: hits <host>"]`. They compile under the default gate, get skipped by `cargo test`, and run explicitly via `cargo test -- --ignored`. The reason string documents why they're out of the default run.

## Dependency Bumps

Gate dep bumps on `cargo test`, not `cargo build`: a minor bump can compile clean while silently dropping a transitively-enabled feature and breaking behavior only tests observe.
