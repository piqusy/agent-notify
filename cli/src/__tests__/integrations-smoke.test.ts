import { chmod, mkdir, writeFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { installTargets, resolveBundledAssets } from "../commands/install.js"
import type { BlackBoxHarness, CapturedInvocation } from "./helpers/black-box.js"
import { createBlackBoxHarness } from "./helpers/black-box.js"

const describeIfSupported = process.platform === "darwin" || process.platform === "linux"
  ? describe
  : describe.skip

const bundledAssets = resolveBundledAssets()

function configPathForHarness(harness: BlackBoxHarness): string {
  return join(harness.homeDir, ".config", "agent-notify", "config.json")
}

function decodeAppleScriptStringExpression(expression: string): string {
  return expression
    .split(" & linefeed & ")
    .map((part) => {
      const trimmed = part.trim()
      const match = trimmed.match(/^"(.*)"$/)
      return (match?.[1] ?? trimmed).replace(/\\"/g, '"')
    })
    .join("\n")
}

function capturedNotification(entry: CapturedInvocation): { title: string; body: string } {
  if (process.platform === "linux") {
    return {
      title: entry.args[0] ?? "",
      body: entry.args[1] ?? "",
    }
  }

  const script = entry.args[1] ?? ""
  const bodyExpression = script.match(/^display notification (.*?) with title /)?.[1] ?? ""
  const titleExpression = script.match(/ with title (.*?)(?: sound name .*)?$/)?.[1] ?? ""

  return {
    title: decodeAppleScriptStringExpression(titleExpression),
    body: decodeAppleScriptStringExpression(bodyExpression),
  }
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
  await chmod(path, 0o755)
}

async function installJqShim(harness: BlackBoxHarness): Promise<void> {
  await writeExecutable(join(harness.binDir, "jq"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'query=""',
    'file=""',
    'for arg in "$@"; do',
    '  if [ "$arg" = "-r" ]; then',
    '    continue',
    '  fi',
    '  if [ -z "$query" ]; then',
    '    query="$arg"',
    '    continue',
    '  fi',
    '  if [ -z "$file" ]; then',
    '    file="$arg"',
    '    continue',
    '  fi',
    'done',
    'if [ "$query" != ".cwd // empty" ]; then',
    '  exit 1',
    'fi',
    'if [ -n "$file" ] && [ -f "$file" ]; then',
    '  input=$(cat "$file")',
    'else',
    '  input=$(cat)',
    'fi',
    'node -e \'const input = process.argv[1] ?? ""; try { const parsed = JSON.parse(input); process.stdout.write(`${typeof parsed.cwd === "string" ? parsed.cwd : ""}\\n`) } catch { process.exit(1) }\' "$input"',
    "",
  ].join("\n"))
}

async function installZellijShim(harness: BlackBoxHarness): Promise<void> {
  await writeExecutable(join(harness.binDir, "zellij"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "exit 0",
    "",
  ].join("\n"))
}

async function writeZellijSessionMetadata(cacheRoot: string, sessionName: string, paneId: number, tabId: number, tabName: string): Promise<void> {
  const sessionDir = join(
    cacheRoot,
    "org.Zellij-Contributors.Zellij",
    "contract_version_1",
    "session_info",
    sessionName,
  )

  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, "session-metadata.kdl"), `tabs {
  tab {
    position 2
    name "${tabName}"
    active true
    tab_id ${tabId}
  }
}
panes {
  pane {
    id ${paneId}
    is_plugin false
    tab_position 2
  }
}
`, "utf8")
}

async function waitFor<T>(readValue: () => Promise<T>, isReady: (value: T) => boolean, description: string, timeoutMs = 2500): Promise<T> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const value = await readValue()
    if (isReady(value)) return value
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function waitForCommandEntries(harness: BlackBoxHarness, commandName: string, count: number): Promise<CapturedInvocation[]> {
  return waitFor(
    () => harness.readCaptureLog(commandName),
    (entries) => entries.length >= count,
    `${count} ${commandName} invocation(s)`,
  )
}

function sessionStateRoot(harness: BlackBoxHarness, sessionName: string): string {
  return join(harness.tempDir, `agent-notify-zellij-state-${sessionName}`)
}

async function stopSessionPoller(harness: BlackBoxHarness, sessionName: string): Promise<void> {
  const pidFile = join(sessionStateRoot(harness, sessionName), "poller.pid")
  if (!existsSync(pidFile)) return

  const rawPid = readFileSync(pidFile, "utf8").trim()
  const pid = Number.parseInt(rawPid, 10)
  if (!Number.isFinite(pid)) return

  try {
    process.kill(pid)
  } catch {
    // best effort
  }
}

describeIfSupported("installed integration smoke tests", () => {
  const harnesses: BlackBoxHarness[] = []

  async function createHarness(): Promise<BlackBoxHarness> {
    const harness = await createBlackBoxHarness()
    harnesses.push(harness)
    return harness
  }

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()?.cleanup()
    }
  })

  it("Claude Code installed hooks invoke the expected agent-notify subcommands", async () => {
    const harness = await createHarness()
    await harness.writeConfig()
    await harness.installCaptureCommand("agent-notify")
    await installJqShim(harness)

    installTargets("claude-code", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    const hooksDir = join(harness.homeDir, ".claude", "hooks", "agent-notify")
    await harness.clearCaptureLog()

    await harness.runCommand(join(hooksDir, "user_prompt_submit.sh"))
    await harness.runCommand(join(hooksDir, "stop.sh"), [], {
      stdin: JSON.stringify({ cwd: "/tmp/claude-stop" }),
    })
    await harness.runCommand(join(hooksDir, "notification.sh"), [], {
      stdin: JSON.stringify({ cwd: "/tmp/claude-question" }),
    })
    await harness.runCommand(join(hooksDir, "permission_request.sh"), [], {
      stdin: JSON.stringify({ cwd: "/tmp/claude-permission" }),
    })

    const entries = await harness.readCaptureLog("agent-notify")

    expect(entries.map((entry) => entry.args)).toEqual([
      ["working-start"],
      ["done", "/tmp/claude-stop", "--tool", "claude-code"],
      ["question", "/tmp/claude-question", "--tool", "claude-code"],
      ["permission", "/tmp/claude-permission", "--tool", "claude-code"],
    ])
  })

  it("OpenCode installed plugin marks working state for root sessions", async () => {
    const harness = await createHarness()
    const sessionName = "opencode-smoke"
    const paneId = 11
    const tabId = 7
    const tabName = "editor"
    const cacheRoot = join(harness.rootDir, "zellij-cache")
    const pluginPath = join(harness.homeDir, ".config", "opencode", "plugins", "opencode-agent-notify", "index.js")
    const pendingPanePath = join(sessionStateRoot(harness, sessionName), `tab-${tabId}`, `pane-${paneId}.json`)

    await harness.writeConfig()
    await installJqShim(harness)
    await installZellijShim(harness)
    await writeZellijSessionMetadata(cacheRoot, sessionName, paneId, tabId, tabName)

    installTargets("opencode", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    const result = await harness.runCommand("bun", ["-e", `
      const mod = await import(${JSON.stringify(pathToFileURL(pluginPath).href)})
      const plugin = await mod.default({
        client: {
          session: {
            get: async ({ path }) => ({ data: { id: path.id } }),
          },
        },
      })
      await plugin["chat.message"]({ sessionID: "root-session" }, { message: {}, parts: [] })
    `], {
      env: {
        ZELLIJ: "1",
        ZELLIJ_SESSION_NAME: sessionName,
        ZELLIJ_PANE_ID: String(paneId),
        XDG_CACHE_HOME: cacheRoot,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(existsSync(pendingPanePath)).toBe(true)

    const pendingPaneState = JSON.parse(readFileSync(pendingPanePath, "utf8")) as {
      paneId: number
      workingAt: number | null
      indicatorTabName: string | null
      restoreTabName: string | null
    }

    expect(pendingPaneState).toEqual(expect.objectContaining({
      paneId,
      workingAt: expect.any(Number),
      indicatorTabName: tabName,
      restoreTabName: tabName,
    }))

    await stopSessionPoller(harness, sessionName)
  })

  it("OpenCode installed plugin sends done and permission notifications only for root sessions", async () => {
    const harness = await createHarness()
    const repo = await harness.createGitRepo({
      name: "opencode-session",
      branch: "feature/opencode-smoke",
    })
    const pluginPath = join(harness.homeDir, ".config", "opencode", "plugins", "opencode-agent-notify", "index.js")

    await harness.writeConfig()

    installTargets("opencode", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    await harness.clearCaptureLog()

    const result = await harness.runCommand("bun", ["-e", `
      const mod = await import(${JSON.stringify(pathToFileURL(pluginPath).href)})
      const plugin = await mod.default()
      await plugin.event({ event: { type: "session.idle", session: { id: "root-session", cwd: ${JSON.stringify(repo.path)} } } })
      await plugin.event({ event: { type: "permission.asked", session: { id: "root-session", cwd: ${JSON.stringify(repo.path)} } } })
      await plugin.event({ event: { type: "session.responseReady", session: { id: "root-session", cwd: ${JSON.stringify(repo.path)} } } })
      await plugin.event({ event: { type: "permission.asked", session: { id: "child-session", parentID: "root-session", cwd: ${JSON.stringify(repo.path)} } } })
      await plugin.event({ event: { type: "session.error", session: { id: "child-session", parentID: "root-session", cwd: ${JSON.stringify(repo.path)} } } })
    `])

    expect(result.exitCode).toBe(0)

    const entries = await harness.readCaptureLog(harness.backendCommand)
    const notifications = entries.map(capturedNotification)

    expect(entries).toHaveLength(2)
    expect(notifications).toEqual(expect.arrayContaining([
      {
        title: "OpenCode — Permission",
        body: `▣  ${basename(repo.path)}\n⎇  ${repo.branch}`,
      },
      {
        title: "OpenCode — Done",
        body: `▣  ${basename(repo.path)}\n⎇  ${repo.branch}`,
      },
    ]))
  })

  it("Pi installed extension maps start and done events to agent-notify", async () => {
    const harness = await createHarness()
    const extensionPath = join(harness.homeDir, ".pi", "agent", "extensions", "agent-notify.ts")

    await harness.writeConfig()
    await harness.installCaptureCommand("agent-notify")

    installTargets("pi", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    await harness.clearCaptureLog()

    const result = await harness.runCommand("bun", ["-e", `
      const mod = await import(${JSON.stringify(pathToFileURL(extensionPath).href)})
      const handlers = {}
      mod.default({ on(event, handler) { handlers[event] = handler } })
      await handlers.agent_start?.({}, { cwd: "/tmp/pi-project" })
      await handlers.agent_end?.({
        messages: [{
          role: "assistant",
          content: [{ type: "text", text: "Implemented the feature." }],
        }],
      }, { cwd: "/tmp/pi-project" })
    `])

    expect(result.exitCode).toBe(0)

    const entries = await waitForCommandEntries(harness, "agent-notify", 2)
    const argsList = entries.slice(0, 2).map((entry) => entry.args)

    expect(argsList).toHaveLength(2)
    expect(argsList).toEqual(expect.arrayContaining([
      ["working-start"],
      ["done", "/tmp/pi-project", "--tool", "pi-coding-agent"],
    ]))
  })

  it("Pi installed extension maps trailing questions to question notifications", async () => {
    const harness = await createHarness()
    const extensionPath = join(harness.homeDir, ".pi", "agent", "extensions", "agent-notify.ts")

    await harness.writeConfig()
    await harness.installCaptureCommand("agent-notify")

    installTargets("pi", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    await harness.clearCaptureLog()

    const result = await harness.runCommand("bun", ["-e", `
      const mod = await import(${JSON.stringify(pathToFileURL(extensionPath).href)})
      const handlers = {}
      mod.default({ on(event, handler) { handlers[event] = handler } })
      await handlers.agent_end?.({
        messages: [{
          role: "assistant",
          content: [
            { type: "text", text: "I found two options." },
            { type: "text", text: "Which one should I ship?" },
          ],
        }],
      }, { cwd: "/tmp/pi-question" })
    `])

    expect(result.exitCode).toBe(0)

    const entries = await waitForCommandEntries(harness, "agent-notify", 1)
    expect(entries[0]?.args).toEqual(["question", "/tmp/pi-question", "--tool", "pi-coding-agent"])
  })

  it("Pi installed extension uses working-stop for aborted or empty assistant endings", async () => {
    const harness = await createHarness()
    const extensionPath = join(harness.homeDir, ".pi", "agent", "extensions", "agent-notify.ts")

    await harness.writeConfig()
    await harness.installCaptureCommand("agent-notify")

    installTargets("pi", {
      homeDir: harness.homeDir,
      assets: bundledAssets,
      configPath: configPathForHarness(harness),
    })

    await harness.clearCaptureLog()

    const result = await harness.runCommand("bun", ["-e", `
      const mod = await import(${JSON.stringify(pathToFileURL(extensionPath).href)})
      const handlers = {}
      mod.default({ on(event, handler) { handlers[event] = handler } })
      await handlers.agent_end?.({
        messages: [{
          role: "assistant",
          content: [],
          stopReason: "aborted",
        }],
      }, { cwd: "/tmp/pi-aborted" })
      await handlers.agent_end?.({
        messages: [{
          role: "assistant",
          content: [],
        }],
      }, { cwd: "/tmp/pi-empty" })
    `])

    expect(result.exitCode).toBe(0)

    const entries = await waitForCommandEntries(harness, "agent-notify", 2)
    expect(entries.slice(0, 2).map((entry) => entry.args)).toEqual([
      ["working-stop"],
      ["working-stop"],
    ])
  })
})
