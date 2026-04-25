# Release checklist

## macOS helper app

The macOS notification path depends on `AgentNotify.app` shipped inside the release artifact.

### Invariants

- Keep the bundle ID stable: `io.github.piqusy.agentnotify`
- Keep the app name stable: `AgentNotify.app`
- Build the helper on macOS only
- Sign the helper during the macOS build step
- Do **not** re-sign the helper in the Homebrew formula

Reason: macOS notification permission is tied to app identity. Re-signing or renaming the helper can trigger a fresh permission prompt or break permission continuity.

## Before tagging

- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run cli/src/index.ts doctor`
- Run `bun run cli/src/index.ts test done --force`

## CI / release verification

- Confirm `packages/macos-helper/dist/AgentNotify.app` was built on the macOS runner
- Confirm release tarballs contain `agent-notify-helper/AgentNotify.app`
- Confirm Homebrew formula installs `agent-notify-helper`
- Confirm the formula does not run `codesign` on install

## Post-install smoke test

On a clean machine:

- `agent-notify doctor`
- verify backend resolves to `macos-helper`
- `agent-notify test done --force`
- verify macOS prompt appears on first run
- click **Allow**
- rerun `agent-notify test done --force`
- verify notification appears with the Agent Notify app icon

## Future hardening

If permission continuity across upgrades becomes noisy, move from ad-hoc signing to a stable Developer ID signature in CI.
