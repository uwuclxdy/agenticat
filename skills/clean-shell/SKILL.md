---
name: clean-shell
description: "Defensive Bash and POSIX shell rules: strict-mode flags, traps, idempotent mutation, ShellCheck discipline, bats tests."
when_to_use: "Use when writing, hardening, reviewing, or testing shell scripts, or wiring shellcheck and bats into CI."
metadata:
  author: uwuclxdy
  version: "1.9"
---

# Clean Shell

Shell-specific conventions for writing, hardening, reviewing, and testing scripts. The core rules below always apply. Load the one reference file matching the task; don't load them all.

| Task touches | File |
|---|---|
| Scripts that run as root or mutate live systems: deploy/apply, firewall/sshd/sudoers edits, systemd oneshot+timer units, ssh remote-exec, rollback, cleanup traps, idempotency, parsing input a foreign process controls (`/proc`, argv, filenames), checking a path stays under a directory | `references/defensive.md` |
| `.shellcheckrc`, `# shellcheck disable=` directives, severity floors, exit codes, CI gating | `references/shellcheck.md` |
| Bats tests: `.bats` files, `run`, `setup`/`teardown`, PATH-stub mocking, parallel jobs | `references/bats.md` |

## Core Rules

- Pick `set` flags by intent and comment the reason next to them: `set -euo pipefail` for orchestration where any failure aborts; drop `-e` when steps may fail without aborting; `set -u` alone for long-running loops. A thin wrapper sets no flags and ends with `exec`.
- Quote every expansion (`"$var"`, `"${arr[@]}"`, `"$(cmd)"`); `--` end-of-options guard before untrusted operands.
- Validate input at the boundary into a checked value (`"${1:?msg}"`, a `case` guard `*[!0123456789]*|''`, since a locale's `[0-9]` can match other digits); no call site re-tests a raw string. Arithmetic executes text it evaluates (`a[$(cmd)]` runs `cmd`): `$(( ))`, `(( ))`, `let`, `[[ -eq/-lt/... ]]`, an indexed-array subscript, a `${s:off:len}` offset, and any assignment to a `declare -i`/`local -i` variable; anything reaching one gets, in order: the guard; a leading-zero strip (octal in sh and bash: `08` errors, `010` is 8) with `v=${v#"${v%%[!0]*}"}; v=${v:-0}`; a digit count (at most 18) before any arithmetic, `10#` included (19+ digits can overflow silently, comparisons too); the domain's range check. `references/defensive.md` holds the code for the first three steps and the 19-digit case.
- Text another process controls is untrusted input even when a local file carries it (`/proc/*/comm`, `/proc/*/cmdline`, filenames); strip every delimiter you later split on.
- Whether a path is or lies under a directory is a question of identity, never of strings: make `$dir` absolute (`$PWD/$dir`), then in a subshell `cd -P` into the path (`CDPATH=''`, `./` before a relative path), walk `cd -P ..` up to `/`, and test `[ . -ef "$dir" ]` at each step, the start included. Never capture `$(pwd -P)`: it strips a trailing newline from the name. `//`, `/./`, `..` and a symlink each spell the same directory differently, and a lexical `dirname` walk over `..` visits directories the path never enters. `references/defensive.md` holds the code, the non-directory cases and the race.
- Every `mktemp` gets an EXIT trap right after creation. Traps are best-effort: SIGKILL, OOM-kill, and power loss skip them.
- Anything that mutates system state is check-then-act idempotent; add `flock` where concurrent runs are possible.
- Never echo a generated secret; `set -x` tracing and `ps`/`/proc/*/cmdline` argv leak it too.
- Every `# shellcheck disable=` carries a same-line reason comment.
- Non-trivial scripts get bats tests covering the error paths, not just the happy path.
