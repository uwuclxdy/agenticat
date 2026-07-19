#!/usr/bin/env bash

# shellcheck disable=SC2016  # backticks are literal markdown code spans, not substitution
REMINDER_TEXT='Remember to use the correct namespace when spawning agents (e.g. `agents:rust-pro`; NOT `rust-pro`)'

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${REMINDER_TEXT}"
  }
}
EOF

exit 0
