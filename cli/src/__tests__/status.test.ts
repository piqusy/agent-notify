import { afterEach, describe, expect, it, vi } from "vitest"

const inspectStatusMock = vi.hoisted(() => vi.fn(async () => ({
  configStatus: "invalid-fields",
  configPath: "/tmp/agent-notify-test-config.json",
  configIssues: [{ path: "backend", message: "Expected one of macos-helper, osascript, notify-send, powershell or null" }],
  backend: "macos-helper",
  focus: {
    terminal: {
      id: "ghostty",
      displayName: "Ghostty",
      bundleId: "com.mitchellh.ghostty",
      source: "term-program",
      reason: "TERM_PROGRAM=ghostty",
    },
    terminalApp: "Ghostty",
    terminalFocused: true,
    zellijSession: false,
    activeTabVisible: null,
    suppressesNotifications: true,
  },
  quietHours: {
    configured: true,
    active: false,
  },
  cooldown: {
    tool: "claude-code",
    file: "/tmp/mock-cooldown",
    active: true,
    remainingSeconds: 2,
  },
  events: {
    done: { enabled: true, wouldSend: false, reason: "terminal-focused" },
    question: { enabled: true, wouldSend: false, reason: "terminal-focused" },
    permission: { enabled: false, wouldSend: false, reason: "event-disabled" },
  },
})))

vi.mock("@agent-notify/core", () => ({
  inspectStatus: inspectStatusMock,
}))

import { cmdStatus } from "../commands/status.js"

describe("cmdStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    inspectStatusMock.mockClear()
  })

  it("prints backend, suppression reasons, and config issues", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cmdStatus(["--tool", "claude-code"])

    expect(inspectStatusMock).toHaveBeenCalledWith({ tool: "claude-code" })
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("agent-notify status"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Config"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Ghostty — term-program (TERM_PROGRAM=ghostty)"))
    expect(logSpy).toHaveBeenCalledWith("                    - backend: Expected one of macos-helper, osascript, notify-send, powershell or null")
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Active for tool \"claude-code\" — 2s remaining"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("done: suppressed (terminal-focused)"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("permission: disabled"))
  })
})
