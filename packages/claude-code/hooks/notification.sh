#!/usr/bin/env bash
# agent-notify hook: Claude Code Notification → question notification

set -euo pipefail

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -n "$CWD" ]; then
  agent-notify question "$CWD" --tool claude-code 2>/dev/null || true
else
  agent-notify question --tool claude-code 2>/dev/null || true
fi
