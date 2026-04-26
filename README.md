# agent-notify

Desktop notifications for AI coding agents — get notified when [Claude Code](https://claude.ai/code), [OpenCode](https://opencode.ai), or [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) finishes a task or needs your attention.

## Why

AI agents can take minutes on complex tasks. Instead of watching the terminal, you get a native macOS notification the moment your attention is needed — with a distinct sound per event type and smart suppression when you're already at the keyboard.

## Features

- Native macOS notifications via a bundled helper app
- Three event types: **done**, **question**, **permission request**
- Compact context rows in the notification body for the current tab/project and Git branch
- Configurable sound per event (with live preview in the setup wizard)
- Bundled Agent Notify app icon on macOS
- Quiet hours
- Cooldown to avoid notification spam
- Focus detection — skips notification if your terminal is already in focus
- Works with Claude Code and OpenCode out of the box
- Supports Pi via a tiny auto-discovered extension

## Install

### Homebrew (recommended)

```sh
brew tap piqusy/tap
brew install agent-notify
```

Exact release pinning:

```sh
brew install piqusy/tap/agent-notify@<version>
```

### From source

Requires [bun](https://bun.sh).

```sh
git clone https://github.com/piqusy/agent-notify.git
cd agent-notify
./install.sh
```

`install.sh` builds the project, links the CLI, runs the setup wizard, and installs integrations for detected tools.

Manual integration wiring is also available:

```sh
agent-notify install all
agent-notify install claude-code
agent-notify install opencode
agent-notify install pi
```

## Setup

Run the interactive wizard:

```sh
agent-notify init
```

This walks you through backend selection, terminal app focus detection, quiet hours, sound selection (with live preview), and event selection.

Config is saved to `~/.config/agent-notify/config.json`.

## Usage

```sh
agent-notify done                              # send a "done" notification
agent-notify question                          # send a "question" notification
agent-notify test done                         # send a test notification
agent-notify sounds            # list available sounds
agent-notify sounds --play Morse
agent-notify init              # re-run setup wizard
agent-notify install all       # install all supported integrations
agent-notify uninstall pi      # remove one integration
```

## Notification layout

Notifications use the title for the agent + event, and the body for compact context:

```text
Pi — Done
▣  editor
⎇  main
```

- `▣` shows the current Zellij tab name when available; otherwise it falls back to the project directory name
- `⎇` shows the current Git branch, or `—` when no branch is available

## Claude Code

Install with:

```sh
agent-notify install claude-code
```

Hooks are configured in `~/.claude/settings.json`, and the hook scripts are copied into `~/.claude/hooks/agent-notify/`:

| Hook | Event |
|------|-------|
| `Stop` | Agent finished — sends **done** notification |
| `Notification` | Agent waiting for input — sends **question** notification |
| `PermissionRequest` | Agent needs permission — sends **question** notification |

## OpenCode

Install with:

```sh
agent-notify install opencode
```

This copies the plugin into `~/.config/opencode/plugins/opencode-agent-notify/` and updates `~/.config/opencode/opencode.json`. It listens to `session.idle`, `session.error`, and `permission.asked` events.

## Pi

Install with:

```sh
agent-notify install pi
```

This copies `agent-notify.ts` into `~/.pi/agent/extensions/`, which Pi auto-discovers on startup.

It emits:

- **done** when Pi finishes a turn
- **question** when the last assistant line ends with `?`

Pi does not have a built-in permission-request event, so there is no Pi `permission` notification.

Remove it later with:

```sh
agent-notify uninstall pi
```

## Configuration

`~/.config/agent-notify/config.json`:

```json
{
  "cooldownSeconds": 3,
  "quietHours": { "start": 22, "end": 8 },
  "sounds": {
    "done": "Morse",
    "question": "Submarine",
    "permission": null
  },
  "events": {
    "done": true,
    "question": true,
    "permission": true
  },
  "terminalApp": null,
  "backend": null
}
```

`terminalApp: null` — auto-detected via `$TERM_PROGRAM`. Set to e.g. `"iTerm2"` to override.  
`backend: null` — auto-detected. On modern macOS this prefers the bundled native helper app, then falls back to `osascript` only if the helper is unavailable.  
`sounds.permission: null` — falls back to the question sound.  
`quietHours: null` — disables quiet hours entirely (sounds play at all times).

## Requirements

- macOS
- [bun](https://bun.sh) (for source install only — Homebrew install is standalone)
- Xcode Command Line Tools / Swift (for source install on macOS so the helper app can be built)

## Troubleshooting

Run the built-in diagnostic tool:

```sh
agent-notify doctor
```

It checks config validity, backend detection, notification permissions, focus state, quiet hours, helper availability, and sound files in one pass.

## Local testing

```sh
bun install
bun run build
bun run test
```

For OpenCode specifically, rerun `./install.sh` after building so `~/.config/opencode/opencode.json` points at local plugin path, then start fresh OpenCode session and trigger `session.idle` or `permission.asked`.

For Pi specifically, rerun `./install.sh` after editing `packages/pi-coding-agent/src/agent-notify.ts` so the latest extension is copied into `~/.pi/agent/extensions/agent-notify.ts`.

### No notifications appear

- **macOS notification permissions** — the most common issue. Open **System Settings → Notifications → Agent Notify** and enable **Allow Notifications**. Set the alert style to **Banners** or **Alerts**.
- **Native helper missing** — if you installed from source on macOS, rerun `bun run build` and make sure the helper app was built successfully.
- **Fallback backend** — if the helper app is unavailable, agent-notify can fall back to `osascript`, but the bundled helper is the supported macOS path.
- **Focus detection** — if your terminal is the frontmost app, notifications are suppressed by design. Switch to another app or set `"terminalApp": null` in config to disable focus detection entirely.

### No sound

- Check that **Sounds** is toggled on in **System Settings → Notifications → Agent Notify**.
- Check that your system volume is not muted.
- Verify your sound config refers to a valid built-in name: `agent-notify sounds`.
- During quiet hours, sounds are muted (notifications still appear silently).

### macOS Sequoia / Tahoe

On modern macOS, agent-notify uses its bundled native helper app by default. This is the supported path for reliable notifications and the branded Agent Notify app icon.

### "Sent test notification" but nothing appeared

The `test` command now reports whether the notification was actually sent or suppressed (and why). If you see `Notification suppressed (reason)`, the notification was intentionally skipped — run `agent-notify doctor` to understand why.

## License

MIT © [Ivan Ramljak](https://github.com/piqusy)
