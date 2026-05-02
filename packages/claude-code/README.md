# agent-notify — Claude Code plugin

This directory contains shell hooks for Claude Code integration.

## Installation

Recommended:

```sh
agent-notify install claude-code
```

This installs the hook scripts into `~/.claude/hooks/agent-notify/` and updates `~/.claude/settings.json`.

The `PermissionRequest` hook sends a distinct `permission` notification, so you can configure its sound and enablement separately from normal `question` notifications.

Manual wiring is also possible. Add these hooks to your Claude Code settings (`.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/agent-notify/packages/claude-code/hooks/stop.sh"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/agent-notify/packages/claude-code/hooks/notification.sh"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/agent-notify/packages/claude-code/hooks/permission_request.sh"
          }
        ]
      }
    ]
  }
}
```

Make sure the `agent-notify` CLI is in your PATH.

If you installed via Homebrew, this is automatic. If you built from source, use the linked CLI from `install.sh` or the full path to the built CLI binary.
