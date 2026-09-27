#!/usr/bin/env bash

# shellcheck disable=SC2016  # backticks are literal markdown code spans, not substitution
REMINDER_TEXT='Copy each agent type exactly as the roster prints it: a type listed with `agents:` keeps the prefix, one listed without it takes none.'

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${REMINDER_TEXT}"
  }
}
EOF

exit 0
