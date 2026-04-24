# agent-notify — Pi Coding Agent extension

This integration adds desktop notifications to [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## What it does

- Sends **done** notifications when Pi finishes a turn.
- Sends **question** notifications when the last assistant line ends with a `?`.
- Uses the `agent-notify` CLI, so all existing cooldown, quiet hours, sounds, and focus detection rules still apply.

Pi does not have a built-in permission-request event, so this integration does not emit `permission` notifications.

## Installation

Recommended:

```sh
agent-notify install pi
```

Manual install also works. Copy the extension into Pi's global extensions directory:

```sh
mkdir -p ~/.pi/agent/extensions
cp /path/to/agent-notify/packages/pi-coding-agent/src/agent-notify.ts \
  ~/.pi/agent/extensions/agent-notify.ts
```

Pi auto-discovers `~/.pi/agent/extensions/*.ts`, so no settings change is required.
