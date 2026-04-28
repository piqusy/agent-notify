# agent-notify

Desktop notifications for AI coding agents — get notified when [Claude Code](https://claude.ai/code), [OpenCode](https://opencode.ai), or [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) finishes a task or needs your attention.

`agent-notify` is **macOS-first**, with **basic notification support on Linux and Windows**.

## Why

AI agents can take minutes on complex tasks. Instead of watching the terminal, you get a desktop notification the moment your attention is needed — with a distinct sound per event type and smart suppression when you're already at the keyboard. On macOS, this uses a bundled native helper for the best experience.

## Features

- Native macOS notifications via a bundled helper app
- Basic Linux support via `notify-send`
- Basic Windows support via PowerShell / BurntToast fallback
- Three event types: **done**, **question**, and **permission**
- Compact context rows in the notification body for the current tab/project and Git branch
- Configurable sound per event (with live preview in the setup wizard)
- Bundled Agent Notify app icon on macOS
- Quiet hours
- Cooldown to avoid notification spam
- Focus detection — skips notification if your terminal is already in focus
- Optional macOS click-to-restore for the terminal app and Zellij tab
- Works with Claude Code and OpenCode out of the box
- Supports Pi via a tiny auto-discovered extension

## Platform support

- **macOS** — full feature set: native helper, app icon, sounds, and optional click-to-restore
- **Linux** — basic notifications only via `notify-send`
- **Windows** — basic notifications only via PowerShell / BurntToast

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

This walks you through backend selection, terminal app focus detection, quiet hours, sound selection (with live preview), event selection, and optional macOS click-to-restore.

Config is saved to `~/.config/agent-notify/config.json`.

## Usage

```sh
agent-notify done                              # send a "done" notification
agent-notify question                          # send a "question" notification
agent-notify permission                        # send a "permission request" notification
agent-notify test done                         # send a test notification
agent-notify test permission                   # send a permission test notification
agent-notify sounds            # list available sounds
agent-notify sounds --play Morse
agent-notify status            # explain whether notifications would send right now
agent-notify explain           # alias for status
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
| `PermissionRequest` | Agent needs permission — sends **permission** notification |

## OpenCode

Install with:

```sh
agent-notify install opencode
```

This copies the plugin into `~/.config/opencode/plugins/opencode-agent-notify/` and updates `~/.config/opencode/opencode.json`. It listens to `session.idle`, `session.error`, and `permission.asked` events.

It emits:

- **done** for `session.idle` and `session.error`
- **permission** for `permission.asked`

## Pi

Install with:

```sh
agent-notify install pi
```

This copies `agent-notify.ts` into `~/.pi/agent/extensions/`, which Pi auto-discovers on startup.

It emits:

- **done** when Pi finishes a turn
- **question** when the last assistant line ends with `?`
- nothing for aborted/error turns or assistant turns with no visible text, avoiding false-positive completion notifications

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
  "backend": null,
  "clickRestore": {
    "enabled": false
  }
}
```

`terminalApp: null` — auto-detected via `$TERM_PROGRAM`. Set to e.g. `"iTerm2"` to override.  
`backend: null` — auto-detected. On modern macOS this prefers the bundled native helper app, then falls back to `osascript` only if the helper is unavailable.  
`clickRestore.enabled: true` — on macOS helper notifications, clicking the notification restores the terminal app and attempts to switch to the originating Zellij tab.  
`sounds.permission: null` — falls back to the question sound.  
`quietHours: null` — disables quiet hours entirely (sounds play at all times).

Missing config fields are merged with defaults automatically. If the config contains invalid JSON or invalid values, `agent-notify doctor` reports the exact problems and invalid settings fall back to defaults until you save a corrected config.

## Requirements

- [bun](https://bun.sh) (for source install only — Homebrew install is standalone)
- **macOS (source install):** Xcode Command Line Tools / Swift so the native helper app can be built
- **Linux:** `notify-send` available on `PATH`
- **Windows:** PowerShell available; BurntToast recommended for native toast notifications

## Troubleshooting

Run the built-in diagnostic tool:

```sh
agent-notify doctor
```

It checks config validity, backend detection, notification permissions, focus state, quiet hours, helper availability, and sound files in one pass.

For a faster "would this notify right now?" view, run:

```sh
agent-notify status
agent-notify status --tool claude-code
agent-notify explain --tool opencode
```

This reports the effective backend, detected terminal app, current focus state, quiet-hours state, cooldown state, and whether `done`, `question`, and `permission` would currently send or be suppressed.

### Config errors

If `~/.config/agent-notify/config.json` contains invalid JSON or bad values, `agent-notify` no longer silently resets everything. Invalid settings are reported by `agent-notify doctor`, and only those broken settings fall back to defaults until you fix and save the file again.

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
- **macOS native helper missing** — if you installed from source on macOS, rerun `bun run build` and make sure the helper app was built successfully.
- **Linux backend** — make sure `notify-send` is installed and available on `PATH`.
- **Windows backend** — make sure PowerShell is available. BurntToast is preferred; without it, agent-notify falls back to a message box.
- **Fallback backend** — if the macOS helper app is unavailable, agent-notify can fall back to `osascript`, but the bundled helper is the supported macOS path.
- **Focus detection** — if your terminal is the frontmost app, notifications are suppressed by design. Switch to another app or set `"terminalApp": null` in config to disable focus detection entirely.

### No sound

- Check that **Sounds** is toggled on in **System Settings → Notifications → Agent Notify**.
- Check that your system volume is not muted.
- Verify your sound config refers to a valid built-in name: `agent-notify sounds`.
- During quiet hours, sounds are muted (notifications still appear silently).
- Linux and Windows backends are more limited than macOS; sound behavior is currently macOS-first.

### macOS Sequoia / Tahoe

On modern macOS, agent-notify uses its bundled native helper app by default. This is the supported path for reliable notifications, the branded Agent Notify app icon, and click-to-restore when enabled.

### "Sent test notification" but nothing appeared

The `test` command now reports whether the notification was actually sent or suppressed (and why). If you see `Notification suppressed (reason)`, the notification was intentionally skipped — run `agent-notify doctor` to understand why.

## License

MIT © [Ivan Ramljak](https://github.com/piqusy)
