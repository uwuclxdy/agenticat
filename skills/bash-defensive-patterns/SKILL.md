---
name: bash-defensive-patterns
description: "Defensive Bash for scripts that mutate live systems. Use when writing, hardening, or reviewing scripts (deploy/apply, systemd oneshot+timer units, firewall/sshd/sudoers edits, ssh remote-exec)."
metadata:
  author: uwuclxdy
  version: "1.0"
---

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

## Idempotency

Check-then-act so a re-run is a no-op.

```bash
have(){ docker inspect "$1" >/dev/null 2>&1; }
have web || docker run --name web "$image"
iptables -C FORWARD -i eth0 -j ACCEPT 2>/dev/null || iptables -I FORWARD -i eth0 -j ACCEPT
```

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

Prove a new connection rather than trusting the session you already hold. Defer any session-dropping restart to the last step:

```bash
edit_sshd_config             # do not restart yet
# ... every other step ...
systemctl restart sshd       # LAST: a dropped session cannot skip earlier steps
```

## Long-Running and Best-Effort

```bash
wait_for(){ local d=$((SECONDS+${2:-30})); until "$1"; do ((SECONDS<d)) || return 1; sleep 1; done; }
up(){ timeout 1 bash -c "exec 3<>/dev/tcp/$HOST/22"; }
wait_for up 60 || exit 1

curl -fsS -m 10 "$HEARTBEAT" || true         # fail-open best-effort op
systemctl is-active --quiet svc || exit 0    # health-gated: stay silent so a watchdog fires

lock=/run/app.lock                           # debounce via mtime
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

## Pitfalls

- never echo a generated secret; write it to a file with tight perms or a secret store.
- `curl | sh` floor is `--proto '=https' --tlsv1.2`; checksum-pin the payload when you can.
- assert the post-condition (rule present, port open) instead of documenting ordering in a comment nothing enforces.
- centralize host/user/path config in one file; literals sprinkled across scripts turn a rename into a multi-file sweep.
