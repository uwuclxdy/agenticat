# Test Tooling

Load when writing or reviewing `.config/nextest.toml`, a `cargo nextest` command, or a fuzz harness past its first target.
Covers nextest profiles, overrides, retries, timeouts and selection, plus fuzz oracles and fuzz CI. Test rules, test groups and the basic `cargo fuzz` target are in `testing.md`.

## Nextest Config Files

- A parenthesized `0.9.x` is the nextest release that added the feature. In a repo pinned below it, keep the older form.
- Run settings shared with CI (profiles, retries, timeouts, overrides) go in `.config/nextest.toml` at the workspace root, committed. Never in `Cargo.toml`, never in the user config: CI does not read it.
- `~/.config/nextest/config.toml` (or the platform's equivalent) holds personal preferences only: UI, progress display, run recording. Never commit those into the repo file.
- First line of the repo file: `nextest-version = { required = "<version>" }` (0.9.55), naming the oldest nextest that supports every key in the file. An older nextest then stops with an error; one below 0.9.55 warns "unknown configuration" or ignores the key.
- CI runs a profile with `fail-fast = false`: `cargo nextest run --profile ci`. The default cancels the run at the first failure and hides every later one.
- A second CI profile sets `inherits = "ci"` (0.9.115) instead of copying the keys of `ci`.

```toml
nextest-version = { required = "0.9.100" } # 0.9.100 added `global-timeout`

[profile.ci]
fail-fast = false
global-timeout = "1h"
slow-timeout = { period = "30s", terminate-after = 4 }
```

## Timeouts

- `slow-timeout = "30s"` only labels a test SLOW. To kill a hung test add `terminate-after` inside the map: the block above kills at 4 periods, 120s.
- Bound the whole run with `global-timeout` (0.9.100) in place of the older `timeout 1h cargo nextest run` wrapper: the config key also works on Windows.

## Per-Test Overrides

- Policy for a subset of tests (retries, timeouts, priority) is an `[[profile.<name>.overrides]]` block selected by `filter`, `platform` or both. Never a watcher thread or a retry constant in the test source.
- For each key, the first matching block that sets it wins. Put the most specific filter first: a later block never overwrites an earlier one. The selected profile's blocks are read before those of the profiles it inherits from, `default` last.
- `platform` is a target triple or a `cfg()` expression, never a bare name like `'macos'`. A string filters the target platform. To match the host, which differs from the target only when cross-compiling, use the map form (0.9.58).
- Mutual exclusion is the `test-group` key: its block is in `testing.md`.

```toml
# most specific first: with these two blocks swapped, flaky tests get 2
[[profile.default.overrides]]
filter = 'package(my-package) and test(/^flaky::/)'
retries = 3

[[profile.default.overrides]]
filter = 'package(my-package)'
retries = 2

# macOS hosts; the string form `platform = 'cfg(target_os = "macos")'` means the target
[[profile.default.overrides]]
platform = { host = 'cfg(target_os = "macos")' }
slow-timeout = { period = "60s", terminate-after = 2 }
```

## Retries

- `retries = 2` is 2 retries after the first failure: 3 attempts. For 2 attempts write `retries = 1`.
- Retry delay and backoff go in config, on the profile or in an override: `retries = { backoff = "exponential", count = 3, delay = "5s", max-delay = "30s" }`.
- Tests that hit a rate-limited service add `jitter = true` (0.9.38) to that map, so parallel retries do not arrive together.
- Never pass `--retries N` or set `NEXTEST_RETRIES` in a repo that configures retries: both discard the configured delays and disable every per-test override.

## Default Filter

Slow or resource-bound tests in a suite that runs only under nextest: exclude them per profile with `default-filter` (0.9.77; 0.9.75 and 0.9.76 spell it `default-set`) and let the CI profile run everything. Run the excluded tests with `--ignore-default-filter`: a `-E` expression alone still selects inside the default filter. `#[ignore]` is global: it hides the test in every profile. Keep it for a known-broken test, and for the network tests in `testing.md`, which stay skipped under `cargo test` too.

```toml
[profile.default]
default-filter = 'not package(special-tests)'

[profile.ci]
default-filter = 'all()'
```

## Running and Selecting

| Need | Use | Never |
|---|---|---|
| Live output while debugging | `cargo nextest run --no-capture`: runs serially, output never interleaves | `cargo test -- --nocapture` |
| Repeat a test to catch a flake | `cargo nextest run --stress-count 100 -E 'test(flaky_)'`, or `--stress-duration 90m` (0.9.103) | a shell `for` loop around `cargo nextest run` |
| Split a run across CI jobs | `--partition slice:1/3` for even buckets (0.9.127); `--partition hash:1/3` when a test must keep its bucket as tests are added or removed | `--partition count:1/3` (deprecated, still supported: keep it only in a repo pinned below 0.9.127) |
| A job that may select zero tests | `--no-tests=warn` (or `pass`) | the default, `fail` since 0.9.85: exit code 4 |
| Tests matching either of two filtersets | `-E 'test(my_test)' -E 'package(my-crate)'`, or `-E 'test(my_test) + package(my-crate)'` | `-E 'test(my_test), package(my-crate)'` |
| A package plus some named tests | `-E 'package(foo) + test(test_bar) + test(test_baz)'` | `-E 'package(foo)' -- test_bar test_baz`: a filterset and name filters intersect |
| Build once, test on other machines | `cargo nextest archive --archive-file tests.tar.zst`, then `cargo nextest run --archive-file tests.tar.zst` there; `-E '<filterset>'` on `archive` stores only the matching binaries (0.9.109) | build options such as `--all-features` on that `run`: the archive records them |
| Benchmarks run as tests | `cargo nextest run --all-targets`, or `--benches` for benchmarks alone | plain `cargo nextest run`: it skips them |
| Coverage that includes doctests | the three commands below | `cargo llvm-cov nextest` alone |

```sh
cargo llvm-cov --no-report nextest
cargo llvm-cov --no-report --doc # nightly toolchain
cargo llvm-cov report --doctests --lcov --output-path lcov.info
```

## Test Runtime

- An integration test or benchmark that finds a workspace binary at run time (an archived run) reads `std::env::var("NEXTEST_BIN_EXE_my_program")` for the binary `my-program`: hyphens become underscores (0.9.113; below it the name keeps its hyphens). Some shells and debuggers drop a variable with a hyphen in its name. A test that must also pass under `cargo test` reads `CARGO_BIN_EXE_my-program`: set at run time from nextest 0.9.130 and from Cargo 1.94. Below Cargo 1.94 it uses `env!("CARGO_BIN_EXE_my-program")`, set at build time and never relocated by an archive.
- No test reads state another test wrote, even when `priority` or a serial group orders them: a filtered run executes it alone. Each test builds its own fixture, or a setup script seeds the shared data:

```toml
experimental = ["setup-scripts"] # top level; off without it (0.9.98 form)

[scripts.setup.seed-db]
command = 'cargo run -p seed-db'

[[profile.default.scripts]]
filter = 'package(db-tests)'
setup = 'seed-db'
```

- An archive holds test binaries, never the source: the target machine checks out the same revision and runs the same nextest version. Artifacts that a build step outside Cargo leaves in the target directory go in the profile's `archive.include = [{ path = "<path>", relative-to = "target" }]` (0.9.70).
- A portable recording (`cargo nextest store export`, 0.9.125) holds the full captured output of every test, unredacted. Check it for secrets and personal data before it leaves the organization.

## Fuzz Oracles

- Read every reference the code under test hands back, through a return value or a callback. A sanitizer reports invalid memory only when it is read: an empty callback passes over a dangling slice.

```rust
// fragment
#![no_main]

libfuzzer_sys::fuzz_target!(|data: &[u8]| {
    // wrong: `my_crate::api_with_callback(data, |_lib_data| {});`
    my_crate::api_with_callback(data, |lib_data| {
        lib_data.iter().for_each(|byte_ref| {
            core::hint::black_box(*byte_ref);
        });
    });
});
```

- The library side of that rule: a reference or `Box<T>` is aligned, non-null, not dangling and points to a valid value. Building one from a null, zeroed or dangling pointer "just to pass it along" is undefined behavior even if nothing reads it.
- A custom data structure gets a differential target: run every fuzzer-chosen operation on it and on a known-correct `std` type, and assert equal results. Hand-picked invariants ("get after insert is `Some`") miss a wrong return value. The target deserializes the operation list from its input, as below.

```rust
// fragment
// body of the fuzz target: `data` is its `&[u8]` input, `MapMethod` derives `serde::Deserialize`, with exactly these two variants
// `ours`: the persistent map under test; `theirs`: a `std::collections::HashMap`
let methods: Vec<MapMethod<String, u32>> = serde_json::from_slice(data).unwrap_or_default();
for method in methods {
    match method {
        MapMethod::Insert { key, value } => {
            let their_old = theirs.insert(key.clone(), value);
            let (new_ours, our_old) = ours.insert(key, value); // a persistent map returns the new map
            assert_eq!(their_old, our_old);
            ours = new_ours;
        }
        MapMethod::Get { key } => assert_eq!(theirs.get(&key), ours.get(&key)),
    }
}
```

## Fuzz-Only Code Paths

- `cargo fuzz` and `cargo afl` build every crate in the graph with `--cfg fuzzing`. Gate fuzz-only helpers with `#[cfg(fuzzing)]`, and switch off a path that stops the fuzzer (signature verification) with `#[cfg(not(fuzzing))]`. Never a public Cargo feature for this: every dependent has to forward it.

```rust
#[cfg(not(fuzzing))]
fn signature_ok(sig: &[u8]) -> bool {
    !sig.is_empty() // stands in for the real check
}

#[cfg(fuzzing)]
fn signature_ok(_sig: &[u8]) -> bool {
    true
}
```

- Declare the name (Cargo 1.80), or every normal build warns: `unexpected_cfgs = { level = "warn", check-cfg = ['cfg(fuzzing)'] }` under `[lints.rust]` in that crate's `Cargo.toml`. `unexpected_cfgs`
- With `[lints] workspace = true` the line goes under `[workspace.lints.rust]` in the root manifest: a `[lints.rust]` table beside that key is a manifest error.
- Where the table already has an `unexpected_cfgs` line (`lints.md`), add `'cfg(fuzzing)'` to its `check-cfg` list.

## Fuzz in CI

- A fuzz run needs nightly: `cargo +nightly fuzz run <target>`, never `rustup default nightly`, which changes the user's default toolchain.
- libFuzzer flags go after `--`. `-max_total_time` bounds the run.
- A CI fuzz job uploads `fuzz/artifacts` when the run fails: the crashing input exists nowhere else.
- Replay a crash on its artifact file: `cargo +nightly fuzz run <target> fuzz/artifacts/<target>/crash-<hash>`: cargo-fuzz prints it, without `+nightly`, for each failing input.

```yaml
- run: rustup toolchain install nightly
- run: cargo +nightly fuzz run parse -- -max_total_time=60
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: fuzz-artifacts-${{ github.sha }}
    path: fuzz/artifacts
```

## Checklist

- [ ] Shared settings are in `.config/nextest.toml`, and its first line pins `nextest-version`.
- [ ] The CI profile sets `fail-fast = false`; hung tests die by `terminate-after` in `slow-timeout`, the run by `global-timeout`.
- [ ] Override blocks go most specific first; `platform` is a triple or a `cfg()`.
- [ ] No `--retries` where retries are configured, no shell loop; a shell `timeout` only in a repo pinned below 0.9.100, a `count:` partition below 0.9.127.
- [ ] No test depends on another test's state.
- [ ] A fuzz target reads every reference it receives; a data-structure target compares against `std`.
- [ ] `cfg(fuzzing)` is declared under `unexpected_cfgs`; the CI fuzz job uploads `fuzz/artifacts`.
