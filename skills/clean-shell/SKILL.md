---
name: clean-shell
description: "Defensive Bash and shell script quality: strict-mode `set` flags, traps, idempotent mutation of live systems (deploy, firewall/sshd/sudoers edits, systemd units, ssh remote-exec), ShellCheck rc-file and `# shellcheck disable=` discipline, bats-core tests (`.bats`, `run`, PATH-stub mocking). Use when writing, hardening, reviewing, or testing shell scripts, or wiring shellcheck/bats into CI."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Clean Shell

Shell-specific conventions for writing, hardening, reviewing, and testing scripts. The core rules below always apply. Load the one reference file matching the task; don't load them all.

| Task touches | File |
|---|---|
| Scripts that mutate live systems: deploy/apply, firewall/sshd/sudoers edits, systemd oneshot+timer units, ssh remote-exec, rollback, cleanup traps, idempotency | `references/defensive.md` |
| `.shellcheckrc`, `# shellcheck disable=` directives, severity floors, exit codes, CI gating | `references/shellcheck.md` |
| Bats tests: `.bats` files, `run`, `setup`/`teardown`, PATH-stub mocking, parallel jobs | `references/bats.md` |

## Core Rules

- Pick `set` flags by intent and comment the reason next to them: `set -euo pipefail` for orchestration where any failure aborts; drop `-e` when steps may fail without aborting; `set -u` alone for long-running loops. A thin wrapper sets no flags and ends with `exec`.
- Quote every expansion (`"$var"`, `"${arr[@]}"`, `"$(cmd)"`); `--` end-of-options guard before untrusted operands.
- Validate input at the boundary into a checked value (`"${1:?msg}"`, a `case` integer guard); no call site re-tests a raw string.
- Every `mktemp` gets an EXIT trap right after creation. Traps are best-effort: SIGKILL, OOM-kill, and power loss skip them.
- Anything that mutates system state is check-then-act idempotent; add `flock` where concurrent runs are possible.
- Never echo a generated secret; `set -x` tracing and `ps`/`/proc/*/cmdline` argv leak it too.
- Every `# shellcheck disable=` carries a same-line reason comment.
- Non-trivial scripts get bats tests covering the error paths, not just the happy path.
