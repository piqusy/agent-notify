import { describe, it, expect } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, loadConfigResult, defaultConfig } from "../config.js"

async function makeTempFile(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-notify-config-"))
  const file = join(dir, name)
  await writeFile(file, content)
  return file
}

describe("loadConfig", () => {
  it("returns default config when file does not exist", async () => {
    const cfg = await loadConfig("/nonexistent/path/config.json")
    expect(cfg).toEqual(defaultConfig)
  })

  it("merges user config over defaults", async () => {
    const tmp = await makeTempFile("config.json", JSON.stringify({ cooldownSeconds: 10 }))
    const cfg = await loadConfig(tmp)
    expect(cfg.cooldownSeconds).toBe(10)
    expect(cfg.quietHours).toEqual(defaultConfig.quietHours)
  })

  it("deep-merges nested config sections", async () => {
    const tmp = await makeTempFile("nested-config.json", JSON.stringify({
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
})

describe("loadConfigResult", () => {
  it("reports invalid JSON with a clear status and issue", async () => {
    const tmp = await makeTempFile("bad-config.json", "not json {{{")
    const result = await loadConfigResult(tmp)

    expect(result.status).toBe("invalid-json")
    expect(result.config).toEqual(defaultConfig)
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: "$",
        message: expect.stringContaining("Invalid JSON:"),
      }),
    ])
  })

  it("reports invalid fields and falls back only for those fields", async () => {
    const tmp = await makeTempFile("invalid-fields.json", JSON.stringify({
      cooldownSeconds: "fast",
      quietHours: { start: 25, end: 8 },
      sounds: { done: 42, question: "Glass" },
      terminalApp: ["Ghostty"],
      backend: "toast",
      clickRestore: { enabled: "yes" },
      zellij: {
        tabIndicator: { enabled: "sometimes", prefix: 9 },
        paneIndicator: {
          enabled: true,
          mode: "foreground",
          bg: "blue",
          clearOn: "never",
        },
      },
    }))

    const result = await loadConfigResult(tmp)

    expect(result.status).toBe("invalid-fields")
    expect(result.config.cooldownSeconds).toBe(defaultConfig.cooldownSeconds)
    expect(result.config.quietHours).toEqual(defaultConfig.quietHours)
    expect(result.config.sounds.done).toBe(defaultConfig.sounds.done)
    expect(result.config.sounds.question).toBe("Glass")
    expect(result.config.terminalApp).toBe(defaultConfig.terminalApp)
    expect(result.config.backend).toBe(defaultConfig.backend)
    expect(result.config.clickRestore).toEqual(defaultConfig.clickRestore)
    expect(result.config.zellij.tabIndicator).toEqual(defaultConfig.zellij.tabIndicator)
    expect(result.config.zellij.paneIndicator.enabled).toBe(true)
    expect(result.config.zellij.paneIndicator.mode).toBe(defaultConfig.zellij.paneIndicator.mode)
    expect(result.config.zellij.paneIndicator.bg).toBe(defaultConfig.zellij.paneIndicator.bg)
    expect(result.config.zellij.paneIndicator.clearOn).toBe(defaultConfig.zellij.paneIndicator.clearOn)
    expect(result.issues.map((item) => item.path)).toEqual(expect.arrayContaining([
      "cooldownSeconds",
      "quietHours.start",
      "sounds.done",
      "terminalApp",
      "backend",
      "clickRestore.enabled",
      "zellij.tabIndicator.enabled",
      "zellij.tabIndicator.prefix",
      "zellij.paneIndicator.mode",
      "zellij.paneIndicator.bg",
      "zellij.paneIndicator.clearOn",
    ]))
  })

  it("returns missing status when config file does not exist", async () => {
    const result = await loadConfigResult("/nonexistent/path/config.json")
    expect(result.status).toBe("missing")
    expect(result.config).toEqual(defaultConfig)
    expect(result.issues).toEqual([])
  })
})
