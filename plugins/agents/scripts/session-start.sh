#!/usr/bin/env bash

REMINDER_TEXT="You need to use the correct namespace for the specialist agents (e.g. `agents:rust-pro`, not `rust-pro`)"

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${REMINDER_TEXT}"
  }
}
EOF

exit 0
