---
name: clean-shell
description: "Defensive Bash and POSIX shell rules: strict-mode flags, traps, idempotent mutation, ShellCheck discipline, bats tests."
when_to_use: "Use when writing, hardening, reviewing, or testing shell scripts, or wiring shellcheck and bats into CI."
metadata:
  author: uwuclxdy
  version: "1.2"
---

# Clean Shell

Shell-specific conventions for writing, hardening, reviewing, and testing scripts. The core rules below always apply. Load the one reference file matching the task; don't load them all.

| Task touches | File |
|---|---|
| Scripts that run as root or mutate live systems: deploy/apply, firewall/sshd/sudoers edits, systemd oneshot+timer units, ssh remote-exec, rollback, cleanup traps, idempotency, parsing input a foreign process controls (`/proc`, argv, filenames) | `references/defensive.md` |
| `.shellcheckrc`, `# shellcheck disable=` directives, severity floors, exit codes, CI gating | `references/shellcheck.md` |
| Bats tests: `.bats` files, `run`, `setup`/`teardown`, PATH-stub mocking, parallel jobs | `references/bats.md` |

## Core Rules

- Pick `set` flags by intent and comment the reason next to them: `set -euo pipefail` for orchestration where any failure aborts; drop `-e` when steps may fail without aborting; `set -u` alone for long-running loops. A thin wrapper sets no flags and ends with `exec`.
- Quote every expansion (`"$var"`, `"${arr[@]}"`, `"$(cmd)"`); `--` end-of-options guard before untrusted operands.
- Validate input at the boundary into a checked value (`"${1:?msg}"`, a `case` integer guard); no call site re-tests a raw string. `$(( ))` executes its operand, so anything reaching arithmetic gets the integer guard first.
- Text another process controls is untrusted input even when a local file carries it (`/proc/*/comm`, `/proc/*/cmdline`, filenames); strip every delimiter you later split on.
- Every `mktemp` gets an EXIT trap right after creation. Traps are best-effort: SIGKILL, OOM-kill, and power loss skip them.
- Anything that mutates system state is check-then-act idempotent; add `flock` where concurrent runs are possible.
- Never echo a generated secret; `set -x` tracing and `ps`/`/proc/*/cmdline` argv leak it too.
- Every `# shellcheck disable=` carries a same-line reason comment.
- Non-trivial scripts get bats tests covering the error paths, not just the happy path.
