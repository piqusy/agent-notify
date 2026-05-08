import { basename } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { BlackBoxHarness, CapturedInvocation } from "./helpers/black-box.js"
import { createBlackBoxHarness } from "./helpers/black-box.js"

const describeIfSupported = process.platform === "darwin" || process.platform === "linux"
  ? describe
  : describe.skip

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

function capturedNotification(entry: CapturedInvocation): { title: string; body: string; raw: string } {
  if (process.platform === "linux") {
    return {
      title: entry.args[0] ?? "",
      body: entry.args[1] ?? "",
      raw: entry.args.join("\n"),
    }
  }

  const script = entry.args[1] ?? ""
  const bodyExpression = script.match(/^display notification (.*?) with title /)?.[1] ?? ""
  const titleExpression = script.match(/ with title (.*?)(?: sound name .*)?$/)?.[1] ?? ""

  return {
    title: decodeAppleScriptStringExpression(titleExpression),
    body: decodeAppleScriptStringExpression(bodyExpression),
    raw: script,
  }
}

describeIfSupported("CLI black-box integration", () => {
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

  it("sends a real done notification with project and git context", async () => {
    const harness = await createHarness()
    const repo = await harness.createGitRepo({
      name: "pi-done-project",
      branch: "feature/black-box-done",
    })
    await harness.writeConfig()

    const result = await harness.runCli(["done", repo.path, "--tool", "pi-coding-agent"])
    const entries = await harness.readCaptureLog(harness.backendCommand)

    expect(result.exitCode).toBe(0)
    expect(entries).toHaveLength(1)
    expect(capturedNotification(entries[0])).toEqual({
      title: "Pi — Done",
      body: `▣  ${basename(repo.path)}\n⎇  ${repo.branch}`,
      raw: expect.any(String),
    })
  })

  it("sends a real permission notification with the permission label", async () => {
    const harness = await createHarness()
    const repo = await harness.createGitRepo({
      name: "permission-project",
      branch: "feature/awaiting-approval",
    })
    await harness.writeConfig()

    const result = await harness.runCli(["permission", repo.path, "--tool", "claude-code"])
    const entries = await harness.readCaptureLog(harness.backendCommand)

    expect(result.exitCode).toBe(0)
    expect(entries).toHaveLength(1)
    expect(capturedNotification(entries[0])).toEqual({
      title: "Claude Code — Permission",
      body: `▣  ${basename(repo.path)}\n⎇  ${repo.branch}`,
      raw: expect.any(String),
    })
  })

  it("suppresses a second done notification during cooldown", async () => {
    const harness = await createHarness()
    const repo = await harness.createGitRepo({
      name: "cooldown-project",
      branch: "feature/cooldown-window",
    })
    await harness.writeConfig({ cooldownSeconds: 60 })

    const first = await harness.runCli(["done", repo.path])
    const afterFirst = await harness.readCaptureLog(harness.backendCommand)
    const second = await harness.runCli(["done", repo.path])
    const afterSecond = await harness.readCaptureLog(harness.backendCommand)

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    expect(afterFirst).toHaveLength(1)
    expect(afterSecond).toHaveLength(1)
    expect(capturedNotification(afterSecond[0]).title).toBe("CLI — Done")
  })

  it("lets a forced test notification bypass cooldown", async () => {
    const harness = await createHarness()
    await harness.writeConfig({ cooldownSeconds: 60 })

    const first = await harness.runCli(["test", "done"])
    const afterFirst = await harness.readCaptureLog(harness.backendCommand)
    const second = await harness.runCli(["test", "done", "--force"])
    const afterSecond = await harness.readCaptureLog(harness.backendCommand)

    expect(first.exitCode).toBe(0)
    expect(first.stdout).toContain("Sent test notification: done")
    expect(afterFirst).toHaveLength(1)

    expect(second.exitCode).toBe(0)
    expect(second.stdout).toContain("Sent test notification: done (forced)")
    expect(afterSecond).toHaveLength(2)
    expect(capturedNotification(afterSecond[1]).title).toBe("Test — Done")
  })
})
