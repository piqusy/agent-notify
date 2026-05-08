# Test Map

## Snapshot

- Default suite status: `129 passed / 129`, `3 skipped` (`ZELLIJ_E2E` gated)
- Full suite with Zellij E2E enabled: `132 passed / 132`
- Test files: `25`
- Mix, roughly:
  - **13 unit / mocked boundary tests**
  - **9 component-style tests**
  - **3 end-to-end / smoke test files**

## How to read the labels

- **Unit** = tests one module or decision path, usually with mocks/spies.
- **Component** = exercises multiple functions/modules together and/or real temp files, but not a full external runtime.
- **E2E / smoke** = runs through real shipped entrypoints or installed artifacts with minimal mocking.

## File-by-file map

| File | Type | Why |
|---|---|---|
| `cli/src/__tests__/config.test.ts` | Unit | Command dispatch only; `cmdInit` mocked. |
| `cli/src/__tests__/doctor.test.ts` | Unit | Output formatting + status reporting; core APIs mocked. |
| `cli/src/__tests__/init.test.ts` | Component | Command wizard flow with real config file write, but prompts/core mocked. |
| `cli/src/__tests__/install.test.ts` | Component | Real temp dirs/files/config mutation; verifies installer wiring across integrations. |
| `cli/src/__tests__/notify.test.ts` | Unit | CLI command routing; core APIs mocked. |
| `cli/src/__tests__/status.test.ts` | Unit | CLI output formatting; `inspectStatus` mocked. |
| `cli/src/__tests__/black-box-harness.test.ts` | Component | Verifies the shared subprocess harness: temp HOME/PATH, git repos, capture shims, cooldown isolation, cleanup. |
| `cli/src/__tests__/cli-black-box.test.ts` | E2E / smoke | Runs the real CLI as a subprocess; verifies titles, bodies, git branch context, cooldown, and `--force`. |
| `cli/src/__tests__/integrations-smoke.test.ts` | E2E / smoke | Installs real Claude/OpenCode/Pi artifacts into a temp home and executes them against capture shims / live Zellij state files. |
| `packages/core/src/__tests__/config.test.ts` | Component | Real temp config files; validates config parsing/merge behavior. |
| `packages/core/src/__tests__/cooldown.test.ts` | Component | Real temp cooldown files; validates cooldown persistence logic. |
| `packages/core/src/__tests__/detect.test.ts` | Unit | Backend/helper detection logic with mocked `fs`/`child_process`; now includes helper discovery via `agent-notify` on PATH. |
| `packages/core/src/__tests__/focus.test.ts` | Unit | Terminal detection/focus logic with mocked process calls. |
| `packages/core/src/__tests__/macos-multiline.test.ts` | Unit | Asserts AppleScript command construction only. |
| `packages/core/src/__tests__/notify-layout.test.ts` | Unit | Verifies notification title/body layout with mocked zellij/platform calls. |
| `packages/core/src/__tests__/notify.test.ts` | Component | Exercises notify orchestration across config/cooldown/zellij/platform boundaries; OS delivery mocked, some real debug-log file I/O. |
| `packages/core/src/__tests__/platform.test.ts` | Component | Verifies backend dispatch and command args; child processes mocked, debug log file real. |
| `packages/core/src/__tests__/sounds.test.ts` | Unit | Pure lookup/resolve behavior. |
| `packages/core/src/__tests__/status.test.ts` | Unit | Status synthesis logic with mocked dependencies. |
| `packages/core/src/__tests__/version.test.ts` | Component | Reads real workspace/package files to enforce version alignment. |
| `packages/core/src/__tests__/zellij.test.ts` | Component | Uses fake zellij binary/session metadata + real temp cache files; still not a live zellij session. |
| `packages/core/src/__tests__/zellij.e2e.test.ts` | E2E / smoke | Runs against a real live Zellij session, gated by `ZELLIJ_E2E=1`; verifies working, notified, and restore flows. |
| `packages/opencode/src/__tests__/index.test.ts` | Unit | Plugin hook wiring + event mapping; core mocked. Confirms `session.responseReady` done behavior and ignores `session.idle`. |
| `packages/pi-coding-agent/src/__tests__/agent-notify-events.test.ts` | Unit | Extension lifecycle wiring; `spawn` mocked. |
| `packages/pi-coding-agent/src/__tests__/agent-notify.test.ts` | Unit | Pure classification logic. |

## Confidence by layer

- **High confidence**
  - Message classification
  - Command routing
  - Config merge/validation
  - Cooldown logic
  - Notification payload/layout generation
  - OpenCode / Pi / Claude integration mapping at the artifact level
  - Helper discovery logic, including Homebrew-installed helper lookup via `agent-notify` on PATH

- **Medium-high confidence**
  - Real CLI behavior in isolated subprocesses
  - Installer behavior
  - Zellij metadata parsing / rename command construction
  - Backend argument construction
  - Workspace version consistency

- **Medium confidence**
  - Live Zellij runtime behavior under an isolated session
  - OpenCode working-state lifecycle, with better confidence after switching done notifications from `session.idle` to `session.responseReady`

- **Lower confidence**
  - Actual desktop notification rendering on macOS/Linux/Windows
  - Real click-to-restore behavior in terminal apps
  - Full end-to-end behavior inside a live OpenCode / Claude Code host with a real model session

## Main remaining gaps

1. **Desktop UI is still mostly indirect**
   - we verify command invocation / helper launch intent, not Notification Center rendering itself
   - click-to-restore is still not covered end-to-end

2. **OpenCode / Claude host behavior is only partially end-to-end**
   - installed artifacts are exercised directly
   - a full live host session with real model execution is still not in CI

3. **Some modules still have no direct dedicated tests**
   - `cli/src/prompts/*.ts`
   - `cli/src/sounds/play.ts`
   - platform-specific real behavior on Linux/Windows/macOS helper UI

## Bottom line

If someone asks, “How much confidence do we get from the current TDD/test setup?”, the honest answer is now:

> Strong confidence in **logic, local wiring, installed artifact behavior, and subprocess-level CLI behavior**. Good confidence in **live Zellij behavior** through gated E2E coverage. Still limited confidence in **real desktop UI behavior and full live agent-host sessions** until those boundaries get true end-to-end coverage.
