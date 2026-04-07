import { describe, it, expect } from "vitest"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, defaultConfig } from "../config.js"

describe("loadConfig", () => {
  it("returns default config when file does not exist", async () => {
    const cfg = await loadConfig("/nonexistent/path/config.json")
    expect(cfg).toEqual(defaultConfig)
  })

  it("merges user config over defaults", async () => {
    const tmp = join(tmpdir(), "agent-notify-test-config.json")
    await writeFile(tmp, JSON.stringify({ cooldownSeconds: 10 }))
    const cfg = await loadConfig(tmp)
    expect(cfg.cooldownSeconds).toBe(10)
    expect(cfg.quietHours).toEqual(defaultConfig.quietHours)
  })

  it("returns default config when file contains invalid JSON", async () => {
    const tmp = join(tmpdir(), "agent-notify-bad-config.json")
    await writeFile(tmp, "not json {{{")
    const cfg = await loadConfig(tmp)
    expect(cfg).toEqual(defaultConfig)
  })
})
