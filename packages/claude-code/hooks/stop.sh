#!/usr/bin/env bash
# agent-notify hook: Claude Code Stop → done notification
# Reads JSON from stdin, extracts cwd, calls agent-notify done

set -euo pipefail

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -n "$CWD" ]; then
  agent-notify done "$CWD" 2>/dev/null || true
else
  agent-notify done 2>/dev/null || true
fi
