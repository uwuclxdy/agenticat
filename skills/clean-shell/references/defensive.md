# Bash Defensive Patterns

Defensive idioms for Bash that changes real systems. Pick each guard by intent and keep its reason next to the code.

## `set` Flags by Intent

Comment the intent beside the flags so nobody cargo-cults the wrong one.

```bash
set -euo pipefail   # orchestration/deploy: any failed step aborts the run
set -uo pipefail    # drop -e: steps may fail without aborting (optional installs, fail-open heartbeats)
set -u              # long-running/interactive loop: -e would kill on a benign non-zero
```

A thin wrapper sets no flags and ends with `exec` so the wrapped tool's exit code reaches the supervisor verbatim:

```bash
exec tool "$@"      # no set flags; propagate the real exit code to systemd
```

`set -x`/`bash -x` traces every expanded command to stderr, secrets included. Scope it tightly around the code that needs it and turn it back off with `set +x` before anything secret-handling runs (see Pitfalls).

## Quoting and Expansion

End-of-options guard against argument injection:

```bash
cp -- "$src" "$dst"
```

## Input Guards

Validate at the boundary; parse into a checked value so no call site re-tests a raw string.

```bash
HOST="${1:?host ip required}"        # required positional arg
: "${DB_URL:?set DB_URL in $CONF}"   # required env/config var

case "$MIN" in *[!0-9]*|'') echo "MIN must be integer" >&2; exit 2;; esac

safe="${HOST//[^0-9A-Za-z]/_}"       # sanitize untrusted string used as a filename
```

## Cleanup with Trap

Every `mktemp` gets an EXIT trap. Manual per-path `rm` leaks the moment someone adds a new early exit.

```bash
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
```

EXIT traps do not fire on SIGKILL, SIGSTOP, OOM-kill, or power loss; bash cannot catch those. The same limit applies to any other guard that claims to always clean up. Treat cleanup as best-effort.

## Idempotency

Check-then-act so a re-run is a no-op.

```bash
have(){ docker inspect "$1" >/dev/null 2>&1; }
have web || docker run --name web "$image"
iptables -C FORWARD -i eth0 -j ACCEPT 2>/dev/null || iptables -I FORWARD -i eth0 -j ACCEPT
```

Check-then-act is not race-free under concurrent runs (cron overlap, two operators): both can pass the check before either acts. Use `flock` for real mutual exclusion, e.g. `exec 9>"$lock"; flock -n 9 || exit 0`. The `lock=/run/app.lock` pattern under Long-Running and Best-Effort is a time-window debounce; it doesn't stop this race.

## Risky Changes to Live Systems

Validate with the format's own checker before overwriting a live file:

```bash
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
build_config > "$tmp"
visudo -cf "$tmp" || { echo "sudoers invalid" >&2; exit 1; }
nft -c -f "$tmp"  || { echo "nftables invalid" >&2; exit 1; }
install -m 0440 "$tmp" /etc/sudoers.d/app   # not-world-writable is what sudo enforces; 0440 is just the safe conventional mode
```

Arm an auto-rollback before a connectivity-affecting change; cancel it only after a brand-new connection proves access survived:

```bash
systemd-run --on-active=300 --unit=rollback bash -c 'nft -f /etc/nftables.prev'
apply_firewall_change
ssh -o BatchMode=yes -o ConnectTimeout=8 "$HOST" true \
  && systemctl stop rollback.timer \
  || echo "no fresh connection; letting rollback fire" >&2
```

Prove a new connection rather than trusting the session you already hold. Order the steps so the one you cannot walk back runs last, whether it drops your session or breaks the next boot. An abort partway through then lands on a box that still boots and still answers:

```bash
edit_sshd_config             # do not restart yet
# ... every other step ...
systemctl restart sshd       # LAST: a dropped session cannot skip earlier steps
```

Generate into a temp file and check it there; overwrite the live one only once it passes. For a bootloader, preserve the mode you found rather than imposing one:

```bash
grub-mkconfig -o "$tmp"
grep -q "$expected_param" "$tmp"        || { echo "param missing" >&2; exit 1; }
[ "$(count_entries "$tmp")" -ge "$old" ] || { echo "lost entries" >&2; exit 1; }
cp -a -- "$cfg" "$cfg.bak-$STAMP"
install -m"$(stat -c %a "$cfg")" -- "$tmp" "$cfg"
```

## Long-Running and Best-Effort

```bash
wait_for(){ local d=$((SECONDS+${2:-30})); until "$1"; do ((SECONDS<d)) || return 1; sleep 1; done; }
up(){ timeout 1 bash -c "exec 3<>/dev/tcp/$HOST/22"; }
wait_for up 60 || exit 1

curl -fsS -m 10 "$HEARTBEAT" || true         # fail-open best-effort op
systemctl is-active --quiet svc || exit 0    # health-gated: stay silent so a watchdog fires

lock=/run/app.lock                           # time-window debounce via mtime; not a mutex, races under concurrent runs (see flock under Idempotency)
[ -f "$lock" ] && [ $(( $(date +%s) - $(stat -c %Y "$lock") )) -lt 300 ] && exit 0
touch "$lock"

exec >>"$LOG" 2>&1                           # capture all output of a long run
```

## Remote Execution

Single-quote the heredoc delimiter so the local shell expands nothing before it reaches the remote:

```bash
ssh "$HOST" bash -s <<'REMOTE'
  set -euo pipefail
  systemctl restart app
REMOTE
```

To pass a local value into the single-quoted heredoc, pass it as a positional arg. Switching the delimiter to unquoted just to interpolate reopens injection.

```bash
ssh "$HOST" bash -s -- "$SERVICE_NAME" <<'REMOTE'
  set -euo pipefail
  systemctl restart "$1"
REMOTE
```

## Pitfalls

- never echo a generated secret; write it to a file with tight perms or a secret store. it still leaks via `set -x`/`bash -x` tracing to stderr/logs and via `ps`/`/proc/*/cmdline` when passed as a bare CLI arg. scope `set -x` around secret-handling code with `set +x` first; prefer env/fd/file over argv.
- `curl | sh` floor is `--proto '=https' --tlsv1.2`; checksum-pin the payload when you can.
- assert the post-condition (rule present, port open) instead of documenting ordering in a comment nothing enforces. check that the assertion itself runs: under `set -e` a readback that errors for its own reasons (write-only sysfs attr, absent tool) aborts the script exactly as if the mutation had failed.
- centralize host/user/path config in one file; literals sprinkled across scripts turn a rename into a multi-file sweep.
- `EXIT` traps are best-effort: SIGKILL, SIGSTOP, OOM-kill, and power loss skip them; a guard that claims to always clean up still isn't guaranteed to run.
