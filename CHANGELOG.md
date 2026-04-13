# Changelog

## [0.1.9] — 2026-04-13

### Added
- Notification title now shows the AI tool name instead of the CLI package name (e.g. `OpenCode — Done`, `Claude Code — Question`)
- `--tool <name>` flag on `done`/`question` commands for per-integration display names
- `force` option on `NotifyInput` bypasses both focus and cooldown checks
- `--force`/`-f` flag on `test` command for testing from a focused terminal

## [0.1.8] — 2026-04-10

### Fixed
- `-v`/`--version` now works in the compiled standalone binary — replaced tsup `define` injection with a `version.ts` module that is resolved correctly by both `tsup` and `bun build --compile`

## [0.1.7] — 2026-04-10

### Added
- `agent-notify -v` / `--version` prints the current version

### Fixed
- `agent-notify test` and the init wizard test send no longer get suppressed when the terminal is frontmost (`skipFocusCheck` added to `NotifyInput`)
- `agent-notify init`: answering No to "Enable quiet hours?" now correctly writes `"quietHours": null` instead of keeping the default 22–8 range
- `agent-notify init`: config preview now shows what `terminalApp: null` will auto-resolve to at runtime, and confirms when quiet hours are disabled

## [0.1.6] — 2026-04-10

### Fixed
- `doctor`: notification permission check now reads `src[].flags` instead of the top-level `flags` field in `com.apple.ncprefs`, which has an undocumented bitmask layout that varies across macOS versions and produced false DISABLED results
- `quietHours` can now be set to `null` in config to disable quiet hours entirely; previously there was no opt-out and the default 22:00–8:00 window could not be removed

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
