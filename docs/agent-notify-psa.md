:loudspeaker: *PSA: Stop staring at your terminal waiting for AI agents to finish*

If you're using Claude Code, OpenCode, or any AI coding tool — you've probably alt-tabbed away and forgotten an agent was waiting for input. Or missed that it finished 10 minutes ago.

`agent-notify` solves this. It's a tiny CLI that sends native macOS notifications when your AI agent:
• :white_check_mark: *finishes a task* (`done`)
• :question: *needs your input* (`question` — permission prompts, clarifications)

It tells you _which project_ triggered the notification, so you can run multiple agents across repos without confusion.

*Why not just use terminal-notifier / ntfy / built-in notifications?*
• Built-in notifications are fragmented — each tool has its own (or none at all)
• terminal-notifier has no concept of "done vs needs input"
• ntfy requires running an HTTP server — overkill for local dev
• `agent-notify` is a single binary, zero dependencies, zero config, works with _any_ harness

*Currently wired for:*
• *Claude Code* — via hooks (automatic: fires on task completion + permission requests)
• *OpenCode* — via plugin system (same behavior)
• Adding a new tool = writing a thin adapter that calls the same CLI

*Setup (2 minutes):*
```
brew tap piqusy/tap && brew install agent-notify
```
Then wire it into your tool — ping me and I'll walk you through it for your specific setup.

Repo: https://github.com/piqusy/agent-notify
