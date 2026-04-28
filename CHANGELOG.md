# Changelog

## [0.2.2] — 2026-04-28

### Added
- New combined GitHub issue template for Linux/Windows standalone binary reports, collecting environment details and diagnostic output needed for cross-platform triage

### Changed
- macOS helper discovery now verifies the expected bundle structure and bundle identifier before trusting a helper app candidate
- Installer asset resolution now validates bundled integration files before copying them into user-owned locations

## [0.2.1] — 2026-04-28

### Added
- Release smoke tests now verify the Linux `notify-send` and Windows PowerShell backend command paths from the shipped binaries before publishing

### Changed
- Windows standalone install docs now cover zip extraction, PATH/manual launch, BurntToast setup, and fallback behavior more explicitly

## [0.2.0] — 2026-04-28

### Added
- Standalone release binaries are now published for Linux (`x64`, `arm64`) and Windows (`x64`) in addition to the existing macOS archives

### Changed
- GitHub Release packaging now uploads multi-platform archives and checksums, while keeping the existing Homebrew/macOS release flow unchanged

## [0.1.50] — 2026-04-28

### Added
- CI now runs on both `ubuntu-latest` and `macos-latest`, so the macOS helper build path is exercised on every push and pull request instead of only during release builds

### Changed
- The workspace root `package.json` is now the canonical version source, with `bun run sync:version` updating all package versions and the generated CLI version constant from one place

## [0.1.49] — 2026-04-28

### Added
- New `agent-notify status` command plus `agent-notify explain` alias to show whether `done`, `question`, and `permission` notifications would send right now, including backend, focus, quiet-hours, and cooldown state

## [0.1.48] — 2026-04-28

### Changed
- Config loading now validates JSON structure and field values, reports exact problems via `agent-notify doctor`, and falls back only for invalid settings instead of silently resetting the whole config

## [0.1.47] — 2026-04-28

### Added
- First-class `permission` notifications in the CLI via `agent-notify permission`, including distinct Permission titles and test-mode support

### Changed
- Claude Code `PermissionRequest` hooks now emit `permission` notifications instead of reusing `question`

## [0.1.46] — 2026-04-28

### Added
- Optional macOS click-to-restore for native helper notifications, with terminal foregrounding and Zellij tab/session restore when clicking a notification
- `clickRestore.enabled` in config plus a setup-wizard toggle to enable or disable click-to-restore explicitly

### Fixed
- Harden macOS click-to-restore by trusting only fixed absolute `zellij` locations, rejecting stale notification clicks older than five minutes, and reducing sensitive click payload/logging data

## [0.1.45] — 2026-04-27

### Fixed
- Pi no longer sends false-positive notifications for aborted or errored runs, and it now only classifies the final assistant message instead of falling back to older assistant text

### Added
- Pi can now log raw `agent_end` payloads to `AGENT_NOTIFY_PI_DEBUG_LOG` for field verification while debugging notification classification issues

## [0.1.44] — 2026-04-27

### Fixed
- The Release workflow now explicitly dispatches the separate Homebrew Tap workflow after publishing the GitHub Release, so automatic tap updates no longer depend on `release.published` events triggered by `GITHUB_TOKEN`
- Homebrew publishing remains a separate workflow, but now runs reliably for new releases while still supporting manual tag-based reruns

## [0.1.43] — 2026-04-27

### Changed
- Release automation now separates GitHub Release publishing from Homebrew tap publishing, with manual tag-based reruns for both workflows

### Fixed
- Release and Homebrew reruns now work against existing tags by checking the target tag into a separate directory while keeping helper scripts from the current workflow branch
- Homebrew tap publishing now requires pinned `release` environment secrets and no longer falls back to runtime `ssh-keyscan` host trust
- CI now validates release files on every push and pull request to catch version/changelog drift earlier

## [0.1.42] — 2026-04-26

### Added
- `agent-notify config edit` as an explicit alias for reopening the interactive setup wizard to update an existing config

### Changed
- `agent-notify init` now prepopulates all prompts from the existing config instead of resetting most fields back to built-in defaults when rerun

### Fixed
- Re-running the setup wizard now preserves existing backend, terminal app, quiet hours, sounds, events, cooldown, and Zellij settings unless you actively change them

## [0.1.41] — 2026-04-26

### Changed
- `agent-notify init` now exposes a compact Zellij indicator section with modes for tab-only, tab + pane tint, or disabled, plus pane tint color selection when enabled

### Fixed
- Zellij session pollers no longer time out after five minutes, so tab badges and pane indicators continue clearing correctly even if you return to the pane much later
- Pane indicator config is now bg-only, removing the unused foreground override from the public config surface

## [0.1.40] — 2026-04-26

### Added
- Optional configurable Zellij pane background indicators with exact origin-pane tracking, so the triggering pane can stay marked until it is focused again

### Changed
- Notification bodies now use separate compact context rows for tab/project (`▣`) and Git branch (`⎇`) instead of a single combined project/branch line

### Fixed
- Zellij notification state now tracks pending panes per tab, so tab badges only clear after all pending panes in that tab are resolved and pane indicators clear only when the exact origin pane is focused
- macOS `osascript` fallback now preserves multiline notification bodies so compact context rows render correctly when the native helper is unavailable

## [0.1.39] — 2026-04-26

### Fixed
- Make Zellij badge cleanup query live client pane-to-tab mapping with a scrubbed environment and explicit session targeting, so `●` clears reliably when returning to a badged tab

## [0.1.38] — 2026-04-26

### Fixed
- Update pinned GitHub Actions to Node 24-based releases so CI and release workflows no longer rely on deprecated Node 20 action runtimes

## [0.1.37] — 2026-04-26

### Fixed
- Opt GitHub Actions into the Node 24 JavaScript runtime so CI and release workflows stop emitting the Node 20 deprecation warning on hosted runners

## [0.1.36] — 2026-04-26

### Fixed
- Restore the executable bit for the bundled `AgentNotify.app` helper during Homebrew install so macOS notifications work after upgrading to `0.1.35`
- Make Zellij tab badge cleanup reliable again by simplifying the background poller that strips the `●` marker when the tab becomes active

## [0.1.35] — 2026-04-26

### Fixed
- Claude Code hook installs now colocate copied hook scripts under `~/.claude/hooks/agent-notify/` instead of `~/.config/agent-notify/...`, with migration cleanup for legacy installs

## [0.1.34] — 2026-04-25

### Fixed
- Stop trusting `process.cwd()` for macOS helper discovery and bundled integration asset lookup, blocking malicious repositories from hijacking helper apps, Claude Code hooks, OpenCode plugins, or Pi extensions during runtime or install
- Replace Zellij tab rename shell interpolation with argv-safe process execution and validate install home directories before writing integration files

### Changed
- Upgrade dev tooling to `vitest@4.1.5` and `postcss@8.5.10`, clearing audit findings
- Harden GitHub Actions by pinning action SHAs, using frozen lockfiles in CI, disabling credential persistence, and scoping workflow permissions more tightly

## [0.1.33] — 2026-04-25

### Changed
- Removed `terminal-notifier` as a macOS backend; the bundled native helper app is now the supported macOS path, with `osascript` kept only as a minimal fallback when the helper is unavailable

## [0.1.32] — 2026-04-25

### Fixed
- macOS helper app release artifacts are now built as universal binaries (`arm64` + `x86_64`), fixing Intel Sequoia installs where the bundled helper app could not launch or register as a notification sender

## [0.1.31] — 2026-04-25

### Added
- Native macOS notification delivery now uses a bundled `AgentNotify.app` helper backed by `UNUserNotificationCenter`, including the branded Agent Notify app icon on modern macOS
- Release docs now include a macOS helper checklist covering bundle identity, signing, packaging, and post-install verification

### Changed
- Removed custom notification icon configuration and CLI overrides; macOS now always uses the bundled Agent Notify app icon and other platforms use their default icon
- Homebrew and release artifacts now ship the macOS helper app directly without re-signing it at install time, preserving a stable notification app identity

## [0.1.30] — 2026-04-24

### Added
- `agent-notify install|uninstall [all|claude-code|opencode|pi]` for one-command integration management from the CLI
- Claude Code hooks are now bundled in release artifacts and Homebrew installs, matching OpenCode and Pi integration assets

### Fixed
- `install.sh` now delegates to the CLI installer and only wires tools detected on the current machine

## [0.1.29] — 2026-04-21

### Fixed
- Version sources now stay aligned across CLI, workspace packages, tests, and release validation

## [0.1.28] — 2026-04-21

### Added
- CONTRIBUTING.md now documents local work and release procedure

## [0.1.27] — 2026-04-21

### Fixed
- Zellij tab notification symbol now keeps a space before tab title

## [0.1.26] — 2026-04-20

### Fixed
- Zellij tab marker now appears before macOS notification send, so tab state updates sooner

## [0.1.25] — 2026-04-20

### Fixed
- Zellij tab marker cleanup now strips marker from current tab name instead of restoring a stale snapshot, so user renames survive

## [0.1.24] — 2026-04-20

### Fixed
- CLI version output now matches current release after stale baked-in `0.1.14` value in built binary

## [0.1.23] — 2026-04-20

### Fixed
- OpenCode plugin now loads from `~/.config/opencode/plugins/` and badge clear poller uses runtime-agnostic shell process, so notification indicator clears after focus returns

## [0.1.22] — 2026-04-19

### Added
- Zellij tab notification indicator: adds `●` prefix to the tab name when a notification fires from a background pane; auto-removes when the user focuses that tab

## [0.1.21] — 2026-04-19

### Fixed
- Add release-time changelog validation so future tags must carry a top release entry

## [0.1.20] — 2026-04-19

### Fixed
- Unify workspace package versions and release docs around `0.1.20`

## [0.1.19] — 2026-04-19

### Fixed
- Make Homebrew exact-version docs generic and correct release workflow formula naming after `v0.1.18` tap update failure

## [0.1.18] — 2026-04-19

### Added
- Add versioned Homebrew formulas so exact release installs like `brew install piqusy/tap/agent-notify@<version>` are published alongside the main formula
- Add exact-version install docs to the release flow and README

## [0.1.17] — 2026-04-19

### Fixed
- Homebrew formula now installs from unpacked tarball root, matching how brew extracts the release archive

## [0.1.16] — 2026-04-19

### Fixed
- Fix Homebrew formula install paths for bundled binary and OpenCode plugin after release tarball packaging change

## [0.1.15] — 2026-04-19

### Fixed
- Stop OpenCode from resolving `opencode-agent-notify` through npm; installer now rewrites config to Homebrew local plugin path and release bundle ships plugin under `libexec`

## [0.1.14] — 2026-04-14

### Fixed
- Revert per-arch runners — `macos-13` is retired; both arches build on `macos-latest` with Bun 1.3.9 (codesign works for both arm64 and x64 on arm64 host with this version)

## [0.1.13] — 2026-04-14

### Fixed
- Pin Bun to `1.3.9` in release workflow — `1.3.10+` produces binaries that `codesign` rejects with "invalid or unsupported format"

## [0.1.12] — 2026-04-14

### Fixed
- Sign each binary on its native runner (arm64 on `macos-latest`, x64 on `macos-13`) — `codesign` cannot sign cross-arch binaries

## [0.1.11] — 2026-04-14

### Fixed
- Remove `--preserve-metadata` from `codesign` step — flag errors on unsigned binaries with no existing metadata

## [0.1.10] — 2026-04-14

### Fixed
- Ad-hoc codesign compiled binary in release workflow to prevent macOS Gatekeeper SIGKILL (exit 137)

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

## [0.1.1] — 2026-04-08

### Fixed
- Replace remaining shell-string process calls with argument-safe `spawnSync` usage across notification backends and CLI sound playback
- Use PowerShell `-EncodedCommand` on Windows to avoid quoting issues in notification and sound commands
- Sanitize cooldown file names and use `os.tmpdir()` instead of a hardcoded `/tmp` path

## [0.1.0] — 2026-04-08

### Fixed
- Point release automation at `piqusy/homebrew-tap`, replacing the earlier separate tap repository setup
