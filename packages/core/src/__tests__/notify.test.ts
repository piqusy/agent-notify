import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("../config.js", () => ({
  loadConfigResult: vi.fn(async () => ({
    path: "/tmp/agent-notify-test-config.json",
    status: "ok",
    issues: [],
    config: {
      events: { done: true, question: true, permission: true },
      terminalApp: null,
      clickRestore: { enabled: false },
      cooldownSeconds: 0,
      quietHours: null,
      sounds: { done: null, question: null, permission: null },
      backend: null,
      zellij: {
        tabIndicator: { enabled: true, prefix: " ● " },
        paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
      },
    },
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
    delete process.env.AGENT_NOTIFY_CLICK_SPIKE
    delete process.env.AGENT_NOTIFY_CLICK_SPIKE_KEEP_ALIVE_SECONDS
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
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(false)
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "pi-coding-agent", cwd: process.cwd() })

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pi — Done" }),
      expect.anything(),
    )
  })

  it("uses a distinct Permission title when trigger=permission", async () => {
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(false)
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "question", trigger: "permission", tool: "claude-code", cwd: process.cwd() })

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Claude Code — Permission" }),
      expect.anything(),
    )
  })

  it("checks the permission event toggle instead of question when trigger=permission", async () => {
    vi.spyOn(zellij, "isZellijSession").mockReturnValue(false)
    const { loadConfigResult } = await import("../config.js")
    vi.mocked(loadConfigResult).mockResolvedValueOnce({
      path: "/tmp/agent-notify-test-config.json",
      status: "ok",
      issues: [],
      config: {
        events: { done: true, question: true, permission: false },
        terminalApp: null,
        clickRestore: { enabled: false },
        cooldownSeconds: 0,
        quietHours: null,
        sounds: { done: null, question: null, permission: null },
        backend: null,
        zellij: {
          tabIndicator: { enabled: true, prefix: " ● " },
          paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
        },
      },
    })

    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)
    const result = await notify({ state: "question", trigger: "permission", tool: "opencode", cwd: process.cwd() })

    expect(result).toEqual({ sent: false, reason: "event-disabled" })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("attaches click restore metadata when enabled in config", async () => {
    process.env.AGENT_NOTIFY_CLICK_SPIKE_KEEP_ALIVE_SECONDS = "45"

    const { loadConfigResult } = await import("../config.js")
    vi.mocked(loadConfigResult).mockResolvedValueOnce({
      path: "/tmp/agent-notify-test-config.json",
      status: "ok",
      issues: [],
      config: {
        events: { done: true, question: true, permission: true },
        terminalApp: null,
        clickRestore: { enabled: true },
        cooldownSeconds: 0,
        quietHours: null,
        sounds: { done: null, question: null, permission: null },
        backend: null,
        zellij: {
          tabIndicator: { enabled: true, prefix: " ● " },
          paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
        },
      },
    })

    vi.spyOn(zellij, "isZellijSession").mockReturnValue(true)
    vi.spyOn(zellij, "isPaneTabActive").mockResolvedValue(false)
    vi.spyOn(zellij, "getCurrentTabInfo").mockResolvedValue({ tabId: 12, tabName: " ● api" })
    vi.spyOn(zellij, "markTabNotified").mockImplementation(() => undefined)
    const sendNotification = vi.spyOn(platform, "sendNotification").mockResolvedValue(undefined)

    await notify({ state: "done", tool: "test", cwd: "/tmp/project" })

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        clickTarget: expect.objectContaining({
          issuedAt: expect.any(Number),
          zellij: expect.objectContaining({
            tabId: 12,
            tabName: "api",
          }),
        }),
        macosHelperKeepAliveSeconds: 45,
      }),
      expect.anything(),
    )
  })
})
