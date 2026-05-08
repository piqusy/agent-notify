import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { BlackBoxHarness } from "./helpers/black-box.js"
import { backendCommandForPlatform, createBlackBoxHarness } from "./helpers/black-box.js"

describe("black-box test harness", () => {
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

  it("maps deterministic backend capture commands for supported CI platforms", () => {
    expect(backendCommandForPlatform("linux")).toBe("notify-send")
    expect(backendCommandForPlatform("darwin")).toBe("osascript")
  })

  it("writes config under an isolated HOME", async () => {
    const harness = await createHarness()
    const configPath = await harness.writeConfig({ cooldownSeconds: 12 })
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      cooldownSeconds: number
      backend: string
    }

    expect(configPath).toBe(join(harness.homeDir, ".config", "agent-notify", "config.json"))
    expect(config.cooldownSeconds).toBe(12)
    expect(config.backend).toBe(harness.backendCommand)
    expect(process.env.HOME).not.toBe(harness.homeDir)
  })

  it("captures commands installed into the sandbox PATH", async () => {
    const harness = await createHarness()
    await harness.installCaptureCommand("agent-notify")

    const result = await harness.runCommand("agent-notify", ["working-start", "/tmp/project"])
    const entries = await harness.readCaptureLog("agent-notify")

    expect(result.exitCode).toBe(0)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual(expect.objectContaining({
      command: "agent-notify",
      args: ["working-start", "/tmp/project"],
      stdin: "",
    }))
    expect(entries[0]?.cwd.endsWith(harness.rootDir)).toBe(true)
  })

  it("runs the real CLI in the sandbox", async () => {
    const harness = await createHarness()

    const result = await harness.runCli(["--version"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("creates git repos on the requested branch", async () => {
    const harness = await createHarness()
    const repo = await harness.createGitRepo({
      name: "cli-black-box-project",
      branch: "black-box-main",
    })

    const head = readFileSync(join(repo.path, ".git", "HEAD"), "utf8")

    expect(head).toContain("refs/heads/black-box-main")
  })

  it("isolates cooldown files per harness via TMPDIR", async () => {
    const firstHarness = await createHarness()
    const firstRepo = await firstHarness.createGitRepo({ name: "first-project" })
    await firstHarness.writeConfig({ cooldownSeconds: 60 })

    let result = await firstHarness.runCli(["done", firstRepo.path])
    expect(result.exitCode).toBe(0)
    expect(await firstHarness.readCaptureLog(firstHarness.backendCommand)).toHaveLength(1)

    result = await firstHarness.runCli(["done", firstRepo.path])
    expect(result.exitCode).toBe(0)
    expect(await firstHarness.readCaptureLog(firstHarness.backendCommand)).toHaveLength(1)

    const secondHarness = await createHarness()
    const secondRepo = await secondHarness.createGitRepo({ name: "second-project" })
    await secondHarness.writeConfig({ cooldownSeconds: 60 })

    result = await secondHarness.runCli(["done", secondRepo.path])
    expect(result.exitCode).toBe(0)
    expect(await secondHarness.readCaptureLog(secondHarness.backendCommand)).toHaveLength(1)
  })

  it("cleans up temp roots without mutating the parent env", async () => {
    const originalHome = process.env.HOME
    const harness = await createBlackBoxHarness()
    await harness.writeConfig()

    await harness.cleanup()

    expect(existsSync(harness.rootDir)).toBe(false)
    expect(process.env.HOME).toBe(originalHome)
  })
})
