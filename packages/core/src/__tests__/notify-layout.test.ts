import path from "node:path"
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "main\n"),
}))

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(async () => ({
    events: { done: true, question: true, permission: true },
    terminalApp: null,
    cooldownSeconds: 0,
    quietHours: null,
    sounds: { done: null, question: null, permission: null },
    backend: null,
  })),
}))

vi.mock("../cooldown.js", () => ({
  checkAndUpdateCooldown: vi.fn(async () => true),
  cooldownFilePath: vi.fn(() => "/tmp/mock-cooldown"),
}))

vi.mock("../focus.js", () => ({
  isTerminalFocused: vi.fn(async () => false),
  resolveTerminalApp: vi.fn(() => null),
}))

import { notify } from "../notify.js"
import * as zellij from "../zellij.js"
import * as platform from "../platform/index.js"

describe("notify body layout", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses separate compact rows for zellij tab and branch", async () => {
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(true)
    vi.spyOn(zellij, "isPaneTabActive").mockResolvedValue(false)
    vi.spyOn(zellij, "getCurrentTabInfo").mockResolvedValue({ tabId: 12, tabName: " ● editor" })
    vi.spyOn(zellij, "markTabNotified").mockImplementation(() => undefined)
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "test", cwd: process.cwd() })

    const [[payload]] = (sendNotification as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(payload).toEqual(expect.objectContaining({
      title: "Test — Done",
      body: "▣  editor\n⎇  main",
    }))
  })

  it("falls back to the project directory when no tab info exists", async () => {
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(false)
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "pi-coding-agent", cwd: process.cwd() })

    const [[payload]] = (sendNotification as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(payload).toEqual(expect.objectContaining({
      title: "Pi — Done",
      body: `▣  ${path.basename(process.cwd())}\n⎇  main`,
    }))
  })
})
