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

  it("deep-merges nested config sections", async () => {
    const tmp = join(tmpdir(), "agent-notify-nested-config.json")
    await writeFile(tmp, JSON.stringify({
      sounds: { done: "Ping" },
      clickRestore: { enabled: true },
      zellij: {
        paneIndicator: {
          enabled: true,
          bg: "#282828",
        },
      },
    }))
    const cfg = await loadConfig(tmp)

    expect(cfg.sounds.done).toBe("Ping")
    expect(cfg.sounds.question).toBe(defaultConfig.sounds.question)
    expect(cfg.clickRestore.enabled).toBe(true)
    expect(cfg.zellij.tabIndicator).toEqual(defaultConfig.zellij.tabIndicator)
    expect(cfg.zellij.paneIndicator.enabled).toBe(true)
    expect(cfg.zellij.paneIndicator.bg).toBe("#282828")
    expect(cfg.zellij.paneIndicator.clearOn).toBe(defaultConfig.zellij.paneIndicator.clearOn)
  })

  it("returns default config when file contains invalid JSON", async () => {
    const tmp = join(tmpdir(), "agent-notify-bad-config.json")
    await writeFile(tmp, "not json {{{")
    const cfg = await loadConfig(tmp)
    expect(cfg).toEqual(defaultConfig)
  })
})
