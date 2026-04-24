#!/usr/bin/env bash
# agent-notify installer
# Builds the project, links the CLI, runs setup, and wires detected integrations.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

ok()   { echo -e "  ${GREEN}✔${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $*"; }
info() { echo -e "     $*"; }
fail() { echo -e "  ${RED}✘${RESET}  $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

run_cli() {
  if command -v agent-notify &>/dev/null; then
    agent-notify "$@"
  else
    (
      cd "$REPO_DIR/cli"
      bun run src/index.ts "$@"
    )
  fi
}

header "Checking prerequisites"

if ! command -v bun &>/dev/null; then
  fail "bun is not installed. Install it from https://bun.sh and re-run."
  exit 1
fi
ok "bun $(bun --version)"

if ! command -v jq &>/dev/null; then
  warn "jq is not installed. Claude Code hooks need jq at runtime."
  info "Install it with: brew install jq"
else
  ok "jq $(jq --version)"
fi

header "Building agent-notify"
cd "$REPO_DIR"
bun install --frozen-lockfile 2>&1 | tail -3
bun run build 2>&1 | grep -E "(Build success|Build failed|error)" || true
ok "Build complete"

header "Linking CLI"
cd "$REPO_DIR/cli"
bun link 2>/dev/null || true
if command -v agent-notify &>/dev/null; then
  ok "agent-notify CLI available at $(command -v agent-notify)"
else
  warn "CLI not found in PATH after linking."
  info "Try: export PATH=\"\$HOME/.bun/bin:\$PATH\""
fi

header "Configuration"
CONFIG_PATH="$HOME/.config/agent-notify/config.json"
if [ -f "$CONFIG_PATH" ]; then
  ok "Config already exists at $CONFIG_PATH — skipping wizard"
  info "Run 'agent-notify init' to reconfigure."
else
  info "Launching setup wizard…"
  run_cli init || true
fi

header "Installing integrations"

INSTALLED=0

if command -v claude &>/dev/null || [ -d "$HOME/.claude" ]; then
  run_cli install claude-code
  ok "Claude Code integration installed"
  INSTALLED=$((INSTALLED + 1))
else
  warn "Claude Code not detected — skipping"
fi

if command -v opencode &>/dev/null || [ -d "$HOME/.config/opencode" ]; then
  run_cli install opencode
  ok "OpenCode integration installed"
  INSTALLED=$((INSTALLED + 1))
else
  warn "OpenCode not detected — skipping"
fi

if command -v pi &>/dev/null || [ -d "$HOME/.pi/agent" ]; then
  run_cli install pi
  ok "Pi integration installed"
  INSTALLED=$((INSTALLED + 1))
else
  warn "Pi not detected — skipping"
fi

if [ "$INSTALLED" -eq 0 ]; then
  warn "No supported agents detected"
  info "You can install integrations manually later:"
  info "  agent-notify install claude-code"
  info "  agent-notify install opencode"
  info "  agent-notify install pi"
fi

echo ""
echo -e "${BOLD}Setup complete.${RESET}"
echo ""
echo "  Next steps:"
echo "  • Start a new Claude Code, OpenCode, or Pi session — notifications will fire automatically"
echo "  • Run 'agent-notify sounds' to see available sounds"
echo "  • Run 'agent-notify init' to reconfigure at any time"
echo "  • Run 'agent-notify test done' to send a test notification"
echo ""
