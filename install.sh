#!/usr/bin/env bash
# agent-notify installer
# Installs the CLI, links the OpenCode plugin, wires Claude Code hooks,
# and patches opencode.json — with graceful fallbacks if tools are absent.

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

# ── 1. Prerequisites ──────────────────────────────────────────────────────────

header "Checking prerequisites"

if ! command -v bun &>/dev/null; then
  fail "bun is not installed. Install it from https://bun.sh and re-run."
  exit 1
fi
ok "bun $(bun --version)"

if ! command -v jq &>/dev/null; then
  fail "jq is not installed. Install it (brew install jq / apt install jq) and re-run."
  exit 1
fi
ok "jq $(jq --version)"

# ── 2. Build ──────────────────────────────────────────────────────────────────

header "Building agent-notify"

cd "$REPO_DIR"
bun install --frozen-lockfile 2>&1 | tail -3
bun run build 2>&1 | grep -E "(Build success|Build failed|error)" || true

ok "Build complete"

# ── 3. Link CLI globally ──────────────────────────────────────────────────────

header "Linking CLI"

cd "$REPO_DIR/cli"
bun link 2>/dev/null || true

if command -v agent-notify &>/dev/null; then
  ok "agent-notify CLI available at $(command -v agent-notify)"
else
  warn "CLI not found in PATH after linking."
  info "Try: export PATH=\"\$HOME/.bun/bin:\$PATH\""
fi

# ── 4. Link OpenCode plugin ───────────────────────────────────────────────────

header "Linking OpenCode plugin"

cd "$REPO_DIR/packages/opencode"
bun link 2>/dev/null || true
ok "opencode-agent-notify linked"

# ── 5. Run init wizard (skip if config already exists) ───────────────────────

header "Configuration"

CONFIG_PATH="$HOME/.config/agent-notify/config.json"
if [ -f "$CONFIG_PATH" ]; then
  ok "Config already exists at $CONFIG_PATH — skipping wizard"
  info "Run 'agent-notify init' to reconfigure."
else
  info "Launching setup wizard…"
  agent-notify init || true
fi

# ── 6. Wire Claude Code hooks ─────────────────────────────────────────────────

header "Claude Code hooks"

CLAUDE_SETTINGS="$HOME/.claude/settings.json"
HOOK_STOP="$REPO_DIR/packages/claude-code/hooks/stop.sh"
HOOK_NOTIFICATION="$REPO_DIR/packages/claude-code/hooks/notification.sh"
HOOK_PERMISSION="$REPO_DIR/packages/claude-code/hooks/permission_request.sh"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
  warn "Claude Code settings not found at $CLAUDE_SETTINGS"
  info "Claude Code is not installed, or settings file doesn't exist yet."
  info "To wire hooks manually, add the following to $CLAUDE_SETTINGS:"
  echo ""
  cat <<MANUAL
  "hooks": {
    "Stop": [{"hooks": [{"type": "command", "command": "$HOOK_STOP"}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "$HOOK_NOTIFICATION"}]}],
    "PermissionRequest": [{"matcher": "*", "hooks": [{"type": "command", "command": "$HOOK_PERMISSION"}]}]
  }
MANUAL
  echo ""
else
  # Patch each hook command if the old legacy script is still referenced
  PATCHED=0

  patch_hook() {
    local event="$1"
    local hook_path="$2"

    # Check if any entry already points to our hook (by basename match to handle ~/... vs absolute)
    local hook_base
    hook_base=$(basename "$hook_path")
    if jq -e --arg event "$event" --arg base "$hook_base" \
      '.hooks[$event] // [] | .[].hooks // [] | .[].command | endswith($base)' \
      "$CLAUDE_SETTINGS" 2>/dev/null | grep -q true; then
      return 0  # already present
    fi

    # Replace legacy agent-notify.sh entry for this event if present, else append
    if jq -e --arg event "$event" \
      '.hooks[$event] // [] | .[].hooks // [] | .[].command | contains("agent-notify.sh")' \
      "$CLAUDE_SETTINGS" 2>/dev/null | grep -q true; then
      local tmp
      tmp=$(mktemp)
      jq --arg event "$event" --arg newcmd "$hook_path" \
        '(.hooks[$event] // []) |= map(
          .hooks |= map(
            if (.command | contains("agent-notify.sh")) then .command = $newcmd
            else . end
          )
        )' "$CLAUDE_SETTINGS" > "$tmp" && mv "$tmp" "$CLAUDE_SETTINGS"
    else
      local tmp
      tmp=$(mktemp)
      jq --arg event "$event" --arg newcmd "$hook_path" \
        '.hooks[$event] = ((.hooks[$event] // []) + [{"hooks": [{"type": "command", "command": $newcmd}]}])' \
        "$CLAUDE_SETTINGS" > "$tmp" && mv "$tmp" "$CLAUDE_SETTINGS"
    fi
    PATCHED=$((PATCHED + 1))
  }

  patch_hook "Stop"              "$HOOK_STOP"
  patch_hook "Notification"      "$HOOK_NOTIFICATION"
  patch_hook "PermissionRequest" "$HOOK_PERMISSION"

  if [ "$PATCHED" -gt 0 ]; then
    ok "Patched $PATCHED hook(s) in $CLAUDE_SETTINGS"
  else
    ok "Claude Code hooks already configured"
  fi
fi

# ── 7. Wire OpenCode plugin ───────────────────────────────────────────────────

header "OpenCode plugin"

OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"
PLUGIN_NAME="opencode-agent-notify"

resolve_opencode_plugin_path() {
  local brew_prefix plugin_path

  if command -v brew &>/dev/null; then
    brew_prefix=$(brew --prefix agent-notify 2>/dev/null || true)
    if [ -n "$brew_prefix" ]; then
      plugin_path="$brew_prefix/libexec/opencode-agent-notify"
      if [ -d "$plugin_path" ]; then
        printf '%s\n' "$plugin_path"
        return 0
      fi
    fi
  fi

  plugin_path="$REPO_DIR/packages/opencode"
  if [ -d "$plugin_path" ]; then
    printf '%s\n' "$plugin_path"
    return 0
  fi

  return 1
}

OPENCODE_PLUGIN_PATH="$(resolve_opencode_plugin_path || true)"

if [ ! -f "$OPENCODE_CONFIG" ]; then
  warn "OpenCode config not found at $OPENCODE_CONFIG"
  info "OpenCode is not installed, or config doesn't exist yet."
  info "To wire the plugin manually, add \"$OPENCODE_PLUGIN_PATH\" to the \"plugin\" array"
  info "in $OPENCODE_CONFIG"
else
  # Replace legacy package-name entry or append local path.
  if jq -e --arg p "$OPENCODE_PLUGIN_PATH" '.plugin | index($p) != null' "$OPENCODE_CONFIG" &>/dev/null 2>&1; then
    ok "OpenCode plugin already configured"
  elif jq -e --arg legacy "$PLUGIN_NAME" '.plugin | index($legacy) != null' "$OPENCODE_CONFIG" &>/dev/null 2>&1; then
    tmp=$(mktemp)
    jq --arg legacy "$PLUGIN_NAME" --arg p "$OPENCODE_PLUGIN_PATH" '.plugin = (.plugin | map(if . == $legacy then $p else . end))' \
      "$OPENCODE_CONFIG" > "$tmp" && mv "$tmp" "$OPENCODE_CONFIG"
    ok "Replaced legacy OpenCode plugin entry with \"$OPENCODE_PLUGIN_PATH\""
  else
    tmp=$(mktemp)
    jq --arg p "$OPENCODE_PLUGIN_PATH" '.plugin = ((.plugin // []) + [$p])' \
      "$OPENCODE_CONFIG" > "$tmp" && mv "$tmp" "$OPENCODE_CONFIG"
    ok "Added \"$OPENCODE_PLUGIN_PATH\" to OpenCode plugins"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Setup complete.${RESET}"
echo ""
echo "  Next steps:"
echo "  • Start a new Claude Code or OpenCode session — notifications will fire automatically"
echo "  • Run 'agent-notify sounds' to see available sounds"
echo "  • Run 'agent-notify init' to reconfigure at any time"
echo "  • Run 'agent-notify test done' to send a test notification"
echo ""
