---
name: bats-testing-patterns
description: "Bats test patterns for shell scripts and CLI tools (`.bats` files, `run`, `setup`/`teardown`, PATH-stub mocking, CI wiring). Use when adding tests to a bash/shell script, hardening its error paths, or wiring `bats-core` into CI."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Bats Testing Patterns

Bats (`bats-core`) runs `.bats` files as TAP-compliant Bash tests. Each `@test` block runs in its own subshell/process; state never leaks between tests. `export` a variable when a command run via `run` within the same test needs to see it.

## Test File Anatomy

```bash
#!/usr/bin/env bats
setup() {                      # before EACH test
    export SCRIPT="${BATS_TEST_DIRNAME}/../bin/script.sh"
}
setup_file() {                 # once, before the file's first test
    export FIXTURE_DB="$BATS_FILE_TMPDIR/seed.db"
}

@test "script exits 0 with a valid config" {
    run "$SCRIPT" --config "$BATS_TEST_TMPDIR/valid.conf"
    [ "$status" -eq 0 ]
}
```

`teardown` mirrors `setup` and runs after every test; skip it when `$BATS_TEST_TMPDIR` already covers cleanup. Use `$BATS_TEST_TMPDIR` (unique per test) instead of hand-rolled `mktemp -d`/`rm -rf`: bats creates and clears it automatically, so a test can't leak state into the next one even if `teardown` never runs. `$BATS_FILE_TMPDIR` is the per-file equivalent for `setup_file`/`teardown_file`; `$BATS_SUITE_TMPDIR` spans the whole suite.

## The `run` Helper

`run` captures a command's exit status into `$status` and its combined stdout+stderr into `$output` (also split into the `$lines` array). It always returns 0, so the test keeps going after a failing command.

```bash
@test "rejects an unknown flag" {
    run -1 my_script --bogus          # -N: assert exit status N; bare `!` asserts any nonzero
    [[ "$output" == *"Usage:"* ]]
}
```

`run --separate-stderr` routes stderr into `$stderr`/`$stderr_lines` instead of merging it into `$output`, for tests that need to assert on each stream independently. Prefer `run -N`/`run !` over a bare `run` plus a manual `[ "$status" -eq N ]`: the check happens inline and fails loudly if left out, instead of a test that only checks output and would pass regardless of exit code.

## Making Scripts Testable

Source the script instead of executing it so its functions become directly callable. Guard `main` so sourcing alone doesn't run it:

```bash
# script.sh
main() { ... }
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
# test file
setup() {
    source "${BATS_TEST_DIRNAME}/../bin/script.sh"   # main() never fires
}
@test "parse_args rejects a negative count" {
    run parse_args --count -1
    [ "$status" -ne 0 ]
}
```

## Mocking External Commands

Prepend a stub directory to `PATH` so the script under test picks up a fake `curl`, `docker`, or similar instead of the real binary. For a function mock, defining the function in the test file is enough when the code under test is sourced; `export -f` exists to carry the mock into a child bash process.

```bash
setup() {
    STUB_DIR="$BATS_TEST_TMPDIR/stubs"
    mkdir -p "$STUB_DIR"
    PATH="$STUB_DIR:$PATH"
}
@test "handles a failed docker pull" {
    printf '#!/bin/sh\nexit 1\n' > "$STUB_DIR/docker"
    chmod +x "$STUB_DIR/docker"
    run "$BATS_TEST_DIRNAME/../bin/deploy.sh"
    [ "$status" -ne 0 ]
}
```

`chmod 000` a `$BATS_TEST_TMPDIR` subdir before `run` to simulate an unreadable/unwritable path.

## Shared Helpers

Put fixtures and assertion helpers used by multiple test files in `test/test_helper.bash`, loaded per file with `load test_helper`. Reach for `bats-support` + `bats-assert` (`assert_success`/`assert_output`/`assert_line`) and `bats-file` (`assert_file_exist`, `assert_file_empty`, permission checks) once assertions get repetitive, rather than writing another home-grown `assert_*` helper. `load` is for files local to the test dir; libraries installed system-wide load with `bats_load_library` off `BATS_LIB_PATH` instead. Pin the floor with `bats_require_minimum_version` when a test relies on a newer feature like `--separate-stderr` or `run -N`.

## Parallel Execution Gotchas

`bats --jobs N test/` parallelizes across and within files; it needs GNU parallel or a compatible replacement (`shenwei356/rush`) on `PATH`. Ordering across tests is not guaranteed, so a suite with inter-test dependencies or shared-file writes needs one of:

- `--no-parallelize-across-files`: files run one at a time; tests inside each file still run in parallel.
- `--no-parallelize-within-files`: tests inside every file run serially; files still run in parallel.
- `export BATS_NO_PARALLELIZE_WITHIN_FILE=true` in a file's `setup_file`: serialize just that one file.

Run a new `--jobs` suite several times before trusting it; flaky ordering surfaces as intermittent failures, not deterministic ones.

## CI Wiring

```yaml
jobs:
  test:
    runs-on: ubuntu-latest   # any runner with bash + node works, this isn't OS-specific
    steps:
      - uses: actions/checkout@v7
      - run: npm install --global bats
      - run: bats --recursive test/
```
