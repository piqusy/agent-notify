# agent-notify

Desktop notifications for AI coding agents — get notified when [Claude Code](https://claude.ai/code), [OpenCode](https://opencode.ai), or [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) finishes a task or needs your attention.

## Why

AI agents can take minutes on complex tasks. Instead of watching the terminal, you get a native macOS notification the moment your attention is needed — with a distinct sound per event type and smart suppression when you're already at the keyboard.

## Features

- Native macOS notifications (terminal-notifier or osascript)
- Three event types: **done**, **question**, **permission request**
- Configurable sound per event (with live preview in the setup wizard)
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

This walks you through backend selection, terminal app focus detection, quiet hours, sound selection (with live preview), and which events to enable.

Config is saved to `~/.config/agent-notify/config.json`.

## Usage

```sh
agent-notify done              # send a "done" notification
agent-notify question          # send a "question" notification
agent-notify test done         # send a test notification
agent-notify sounds            # list available sounds
agent-notify sounds --play Morse
agent-notify init              # re-run setup wizard
agent-notify install all       # install all supported integrations
agent-notify uninstall pi      # remove one integration
```

## Claude Code

Install with:

```sh
agent-notify install claude-code
```

Hooks are configured in `~/.claude/settings.json`:

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
`backend: null` — auto-detected (prefers `terminal-notifier` if installed, falls back to `osascript`).  
`sounds.permission: null` — falls back to the question sound.  
`quietHours: null` — disables quiet hours entirely (sounds play at all times).

## Requirements

- macOS
- [bun](https://bun.sh) (for source install only — Homebrew install is standalone)
- [terminal-notifier](https://github.com/julienXX/terminal-notifier) (optional, for richer notifications — `brew install terminal-notifier`)

## Troubleshooting

Run the built-in diagnostic tool:

```sh
agent-notify doctor
```

It checks config validity, backend detection, notification permissions, focus state, quiet hours, and sound files in one pass.

## Local testing

```sh
bun install
bun run build
bun run test
```

For OpenCode specifically, rerun `./install.sh` after building so `~/.config/opencode/opencode.json` points at local plugin path, then start fresh OpenCode session and trigger `session.idle` or `permission.asked`.

For Pi specifically, rerun `./install.sh` after editing `packages/pi-coding-agent/src/agent-notify.ts` so the latest extension is copied into `~/.pi/agent/extensions/agent-notify.ts`.

### No notifications appear

- **macOS notification permissions** — the most common issue. Open **System Settings → Notifications → terminal-notifier** and enable **Allow Notifications**. Set the alert style to **Banners** or **Alerts**.
- **Backend not installed** — if using `terminal-notifier` (recommended), install it: `brew install terminal-notifier`.
- **Focus detection** — if your terminal is the frontmost app, notifications are suppressed by design. Switch to another app or set `"terminalApp": null` in config to disable focus detection entirely.

### No sound

- Check that **Sounds** is toggled on in **System Settings → Notifications → terminal-notifier**.
- Check that your system volume is not muted.
- Verify your sound config refers to a valid built-in name: `agent-notify sounds`.
- During quiet hours, sounds are muted (notifications still appear silently).

### macOS Sequoia (15.x)

Sequoia restricts some notification APIs. Use `terminal-notifier` as the backend — `osascript` notifications may not work. Install it with `brew install terminal-notifier`.

### "Sent test notification" but nothing appeared

The `test` command now reports whether the notification was actually sent or suppressed (and why). If you see `Notification suppressed (reason)`, the notification was intentionally skipped — run `agent-notify doctor` to understand why.

## License

MIT © [Ivan Ramljak](https://github.com/piqusy)
