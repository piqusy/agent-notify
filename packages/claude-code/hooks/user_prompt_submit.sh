#!/usr/bin/env bash
# agent-notify hook: Claude Code UserPromptSubmit → mark current Zellij pane/tab as working

set -euo pipefail

agent-notify working-start 2>/dev/null || true
