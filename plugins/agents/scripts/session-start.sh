#!/usr/bin/env bash

exec cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Copy each agent type exactly as the roster prints it: a type listed with `agents:` keeps the prefix, one listed without it takes none."
  }
}
EOF
