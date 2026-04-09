import { describe, it, expect } from "vitest"
import { writeFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkAndUpdateCooldown, cooldownFilePath } from "../cooldown.js"

const tmpFile = (name: string) => join(tmpdir(), `agent-notify-cooldown-test-${name}`)

describe("cooldownFilePath", () => {
  it("replaces spaces with hyphens", () => {
    expect(cooldownFilePath("My Tool")).toBe(join(tmpdir(), "agent-notify-cooldown-My-Tool"))
  })

  it("leaves names without spaces unchanged", () => {
    expect(cooldownFilePath("OpenCode")).toBe(join(tmpdir(), "agent-notify-cooldown-OpenCode"))
  })
})

describe("checkAndUpdateCooldown", () => {
  it("returns true when no cooldown file exists (ENOENT)", async () => {
    const file = tmpFile("new")
    await unlink(file).catch(() => {})
    const result = await checkAndUpdateCooldown(file, 3)
    expect(result).toBe(true)
  })

  it("returns false when called twice within cooldown window", async () => {
    const file = tmpFile("fast")
    await unlink(file).catch(() => {})
    await checkAndUpdateCooldown(file, 3)
    const result = await checkAndUpdateCooldown(file, 3)
    expect(result).toBe(false)
  })

  it("returns true after cooldown window expires", async () => {
    const file = tmpFile("expired")
    const oldTimestamp = Math.floor(Date.now() / 1000) - 10
    await writeFile(file, String(oldTimestamp))
    const result = await checkAndUpdateCooldown(file, 3)
    expect(result).toBe(true)
  })

  it("returns true when cooldownSeconds is 0 (no cooldown)", async () => {
    const file = tmpFile("zero")
    await checkAndUpdateCooldown(file, 0)
    const result = await checkAndUpdateCooldown(file, 0)
    expect(result).toBe(true)
  })
})
