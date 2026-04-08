# agent-notify

Desktop notifications for AI coding agents — get notified when [Claude Code](https://claude.ai/code) or [OpenCode](https://opencode.ai) finishes a task, asks a question, or needs your permission.

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

## Install

### Homebrew (recommended)

```sh
brew tap piqusy/tap
brew install agent-notify
```

### From source

Requires [bun](https://bun.sh).

```sh
git clone https://github.com/piqusy/agent-notify.git
cd agent-notify
./install.sh
```

`install.sh` builds the project, links the CLI, runs the setup wizard, and wires Claude Code hooks and the OpenCode plugin automatically — with graceful fallbacks if either tool isn't installed.

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
```

## Claude Code

Hooks are configured in `~/.claude/settings.json`. After running `./install.sh` or wiring manually:

| Hook | Event |
|------|-------|
| `Stop` | Agent finished — sends **done** notification |
| `Notification` | Agent waiting for input — sends **question** notification |
| `PermissionRequest` | Agent needs permission — sends **question** notification |

## OpenCode

The `opencode-agent-notify` plugin is added to `~/.config/opencode/opencode.json` automatically by `install.sh`. It listens to `session.idle` and `permission.updated` events.

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

## Requirements

- macOS
- [bun](https://bun.sh) (for source install only — Homebrew install is standalone)
- [terminal-notifier](https://github.com/julienXX/terminal-notifier) (optional, for richer notifications — `brew install terminal-notifier`)

## License

MIT © [Ivan Ramljak](https://github.com/piqusy)
