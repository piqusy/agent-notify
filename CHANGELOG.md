# Changelog

## [0.1.5] — 2026-04-10

### Added
- `agent-notify doctor` command — runs diagnostics covering config validity, macOS version, backend detection, notification permissions (reads `ncprefs` flags), focus detection state, quiet hours, event filter, sound file paths, and cooldown setting
- `NotifyResult` return type on `notify()` — callers can now inspect whether a notification was sent and why it was suppressed (`event-disabled`, `terminal-focused`, `cooldown`)

### Fixed
- `agent-notify test` now reports the actual outcome (`Notification suppressed (reason)`) instead of always printing "Sent test notification"
- `agent-notify init` wizard hints at `doctor` command if test notification may not have appeared
- Cooldown tests used hardcoded `/tmp` path instead of `os.tmpdir()`, causing failures on macOS

## [0.1.4] — 2026-04-09

### Fixed
- macOS: replaced `execSync` shell string with `spawnSync` for osascript to avoid shell injection and improve reliability

## [0.1.3] — 2026-04-09

### Added
- Zellij multiplexer support — notify when the agent pane's tab is not active, suppress when it is
- Focus detection now auto-detects terminal app from `$TERM_PROGRAM` when `terminalApp` is null in config

## [0.1.2] — 2026-04-08

### Fixed
- Focus detection: compare app names case-insensitively to fix mismatch between `TERM_PROGRAM_MAP` and osascript output
