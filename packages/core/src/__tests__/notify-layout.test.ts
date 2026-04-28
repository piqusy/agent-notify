import path from "node:path"
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(() => "main\n"),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}))

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
  resolveTerminal: vi.fn(() => null),
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
