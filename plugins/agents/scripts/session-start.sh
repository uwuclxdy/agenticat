#!/usr/bin/env bash
# the quoted delimiter keeps the payload literal JSON: an unquoted one would run the
# backticks in it as command substitution.

exec cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Copy each agent type exactly as the roster prints it: a type listed with `agents:` keeps the prefix, one listed without it takes none."
  }
}
EOF
