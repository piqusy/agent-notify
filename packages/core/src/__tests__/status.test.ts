import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("../config.js", () => ({
  loadConfigResult: vi.fn(async () => ({
    path: "/tmp/agent-notify-test-config.json",
    status: "ok",
    issues: [],
    config: {
      cooldownSeconds: 3,
      quietHours: null,
      sounds: { done: null, question: null, permission: null },
      events: { done: true, question: true, permission: true },
      terminalApp: null,
      backend: null,
      clickRestore: { enabled: false },
      zellij: {
        tabIndicator: { enabled: true, prefix: " ● " },
        paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
      },
    },
  })),
}))

vi.mock("../cooldown.js", () => ({
  cooldownFilePath: vi.fn(() => "/tmp/mock-cooldown"),
  getCooldownState: vi.fn(async () => ({ active: false, remainingSeconds: 0 })),
}))

vi.mock("../focus.js", () => ({
  resolveTerminal: vi.fn(() => ({
    id: "ghostty",
    displayName: "Ghostty",
    bundleId: "com.mitchellh.ghostty",
    source: "term-program",
    reason: "TERM_PROGRAM=ghostty",
  })),
  isTerminalFocused: vi.fn(async () => false),
}))

vi.mock("../zellij.js", () => ({
  isZellijSession: vi.fn(() => false),
  isPaneTabActive: vi.fn(async () => true),
}))

vi.mock("../platform/index.js", () => ({
  detectMacOSBackend: vi.fn(async () => "macos-helper"),
}))

import { inspectStatus } from "../status.js"

describe("inspectStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports that all events would send when nothing suppresses them", async () => {
    const status = await inspectStatus({ tool: "cli" })

    expect(status.focus.terminalApp).toBe("Ghostty")
    expect(status.focus.terminal).toEqual({
      id: "ghostty",
      displayName: "Ghostty",
      bundleId: "com.mitchellh.ghostty",
      source: "term-program",
      reason: "TERM_PROGRAM=ghostty",
    })
    expect(status.events.done).toEqual({ enabled: true, wouldSend: true })
    expect(status.events.question).toEqual({ enabled: true, wouldSend: true })
    expect(status.events.permission).toEqual({ enabled: true, wouldSend: true })
  })

  it("reports terminal-focused suppression for all enabled events", async () => {
    const { isTerminalFocused } = await import("../focus.js")
    vi.mocked(isTerminalFocused).mockResolvedValueOnce(true)

    const status = await inspectStatus({ tool: "claude-code" })

    expect(status.focus.suppressesNotifications).toBe(true)
    expect(status.events.done).toEqual({ enabled: true, wouldSend: false, reason: "terminal-focused" })
    expect(status.events.permission).toEqual({ enabled: true, wouldSend: false, reason: "terminal-focused" })
  })

  it("reports cooldown suppression when active", async () => {
    const { getCooldownState } = await import("../cooldown.js")
    vi.mocked(getCooldownState).mockResolvedValueOnce({ active: true, remainingSeconds: 2 })

    const status = await inspectStatus({ tool: "opencode" })

    expect(status.cooldown).toEqual({
      tool: "opencode",
      file: "/tmp/mock-cooldown",
      active: true,
      remainingSeconds: 2,
    })
    expect(status.events.question).toEqual({ enabled: true, wouldSend: false, reason: "cooldown" })
  })
})
