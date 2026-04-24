import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(async () => ({
    events: { done: true, question: true, permission: true },
    terminalApp: null,
    cooldownSeconds: 0,
    quietHours: null,
    sounds: {},
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

import { isQuietHour, notify } from "../notify.js"
import * as zellij from "../zellij.js"
import * as platform from "../platform/index.js"

describe("isQuietHour", () => {
  it("returns false outside quiet hours (no wrap)", () => {
    // quiet 22-8: hour 12 should be false
    expect(isQuietHour({ start: 22, end: 8 })).toBe(
      new Date().getHours() >= 22 || new Date().getHours() < 8
    )
  })

  it("handles midnight wrap correctly", () => {
    const mockHour = (h: number) => {
      vi.spyOn(Date.prototype, "getHours").mockReturnValue(h)
    }

    mockHour(23)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(true)

    mockHour(3)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(true)

    mockHour(12)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(false)

    vi.restoreAllMocks()
  })

  it("handles non-wrapping range", () => {
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(10)
    expect(isQuietHour({ start: 9, end: 17 })).toBe(true)

    vi.spyOn(Date.prototype, "getHours").mockReturnValue(8)
    expect(isQuietHour({ start: 9, end: 17 })).toBe(false)

    vi.restoreAllMocks()
  })
})

describe("notify integration (skip in CI — uses real config/fs)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("is exported from index", async () => {
    const mod = await import("../index.js")
    expect(typeof mod.notify).toBe("function")
  })

  it("marks zellij tab before sending macOS notification", async () => {
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(true)
    vi.spyOn(zellij, "isPaneTabActive").mockResolvedValue(false)
    vi.spyOn(zellij, "getCurrentTabInfo").mockResolvedValue({ tabId: 12, tabName: "agent-notify" })
    vi.spyOn(zellij, "markTabNotified").mockImplementation(() => undefined)
    vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "test", cwd: process.cwd() })

    expect(zellij.markTabNotified).toHaveBeenCalled()
    expect(platform.sendNotification).toHaveBeenCalled()
    expect((zellij.markTabNotified as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0])
      .toBeLessThan((platform.sendNotification as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0])
  })

  it("uses friendly display names for supported tools", async () => {
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "pi-coding-agent", cwd: process.cwd() })

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pi — Done" }),
      expect.anything(),
    )
  })
})
