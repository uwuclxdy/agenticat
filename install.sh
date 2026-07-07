#!/usr/bin/env bash
# crosskit agent installer for opencode + codex (harnesses without a native installer).
# claude code:  /plugin marketplace add uwuclxdy/crosskit && /plugin install crosskit@crosskit
# gemini cli:   gemini extensions install https://github.com/uwuclxdy/crosskit --auto-update
set -euo pipefail
cd "$(dirname "$0")"
command -v bun >/dev/null 2>&1 || { echo "bun is required: https://bun.sh" >&2; exit 1; }
exec bun bin/install-agents.ts "$@"
