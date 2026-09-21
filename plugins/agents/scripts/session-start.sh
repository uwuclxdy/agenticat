#!/usr/bin/env bash

# shellcheck disable=SC2016  # backticks are literal markdown code spans, not substitution
REMINDER_TEXT='Remember to spawn agents with the type exactly as the roster lists it: include the `agents:` prefix where shown.'

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${REMINDER_TEXT}"
  }
}
EOF

exit 0
