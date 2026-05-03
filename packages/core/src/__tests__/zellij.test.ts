import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

import * as childProcess from "node:child_process"
import { getCurrentTabInfo, isZellijSession, markPaneWorking, markTabNotified } from "../zellij.js"

// We mock the module-level execAsync by mocking child_process.exec
// and then reimporting. Since Bun's ESM mock requires a factory, we
// spy on the actual exec and control its callback behaviour.

const PANES_ACTIVE_TAB = JSON.stringify([
  { id: 146, tab_id: 20, tab_name: "agent-notif", is_focused: true, is_fullscreen: true },
  { id: 85, tab_id: 12, tab_name: "agent-notify", is_focused: true, is_fullscreen: false },
])

const PANES_INACTIVE_TAB = JSON.stringify([
  { id: 146, tab_id: 20, tab_name: "agent-notif", is_focused: true, is_fullscreen: false },
])

const TABS_OUR_ACTIVE = JSON.stringify([
  { tab_id: 12, name: "agent-notify", active: false },
  { tab_id: 20, name: "agent-notif", active: true },
])

const TABS_OUR_INACTIVE = JSON.stringify([
  { tab_id: 12, name: "agent-notify", active: true },
  { tab_id: 20, name: "agent-notif", active: false },
])

const ORIGINAL_PATH = process.env.PATH
const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_XDG_CACHE_HOME = process.env.XDG_CACHE_HOME
const ORIGINAL_LOCALAPPDATA = process.env.LOCALAPPDATA

function installFakeZellijBinary(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-notify-zellij-bin-"))
  const executable = join(dir, process.platform === "win32" ? "zellij.exe" : "zellij")
  writeFileSync(executable, "")
  process.env.PATH = [dir, ORIGINAL_PATH ?? ""].filter(Boolean).join(delimiter)
  return executable
}

function cleanupSessionState(sessionName: string): void {
  rmSync(join(tmpdir(), `agent-notify-zellij-state-${sessionName}`), { recursive: true, force: true })
}

function configureTempZellijCache(sessionName: string, metadata: string): void {
  const homeDir = mkdtempSync(join(tmpdir(), "agent-notify-zellij-home-"))
  const cacheRoot = mkdtempSync(join(tmpdir(), "agent-notify-zellij-cache-"))
  process.env.HOME = homeDir
  process.env.XDG_CACHE_HOME = cacheRoot
  process.env.LOCALAPPDATA = cacheRoot

  const sessionDir = join(
    cacheRoot,
    "org.Zellij-Contributors.Zellij",
    "contract_version_1",
    "session_info",
    sessionName,
  )
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(join(sessionDir, "session-metadata.kdl"), metadata)
}

// Helper: build a fake isPaneTabActive that takes injected JSON strings
beforeEach(() => {
  const spawnSyncMock = childProcess.spawnSync as unknown as ReturnType<typeof vi.fn>
  spawnSyncMock.mockReset()
  spawnSyncMock.mockImplementation(() => ({ status: 0 }))

  const spawnMock = childProcess.spawn as unknown as ReturnType<typeof vi.fn>
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => ({ unref: vi.fn() }))

  const execMock = childProcess.exec as unknown as ReturnType<typeof vi.fn>
  execMock.mockReset()
})

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH
  process.env.HOME = ORIGINAL_HOME
  process.env.XDG_CACHE_HOME = ORIGINAL_XDG_CACHE_HOME
  process.env.LOCALAPPDATA = ORIGINAL_LOCALAPPDATA
})

async function checkPaneTabActive(
  panesJson: string,
  tabsJson: string,
  paneId = "146",
): Promise<boolean> {
  const panes: Array<{ id: number; tab_id: number }> = JSON.parse(panesJson)
  const tabs: Array<{ tab_id: number; active: boolean }> = JSON.parse(tabsJson)

  const ourPane = panes.find((p) => p.id === Number(paneId))
  if (!ourPane) return true

  const ourTab = tabs.find((t) => t.tab_id === ourPane.tab_id)
  if (!ourTab) return true

  return ourTab.active
}

describe("isZellijSession", () => {
  beforeEach(() => {
    delete process.env.ZELLIJ
  })

  it("returns false when ZELLIJ is not set", () => {
    expect(isZellijSession()).toBe(false)
  })

  it("returns true when ZELLIJ is set", () => {
    process.env.ZELLIJ = "0"
    expect(isZellijSession()).toBe(true)
  })

  it("returns true when ZELLIJ is empty string", () => {
    process.env.ZELLIJ = ""
    expect(isZellijSession()).toBe(true)
  })
})

// Test the core tab-active logic in isolation (without spawning zellij)
describe("pane tab active detection logic", () => {
  afterEach(() => {
    delete process.env.ZELLIJ_PANE_ID
  })

  it("returns true when our tab is active", async () => {
    expect(await checkPaneTabActive(PANES_ACTIVE_TAB, TABS_OUR_ACTIVE)).toBe(true)
  })

  it("returns false when our tab is not active", async () => {
    expect(await checkPaneTabActive(PANES_INACTIVE_TAB, TABS_OUR_INACTIVE)).toBe(false)
  })

  it("returns true (safe fallback) when our pane is not found", async () => {
    const panesOther = JSON.stringify([{ id: 999, tab_id: 5 }])
    expect(await checkPaneTabActive(panesOther, TABS_OUR_ACTIVE)).toBe(true)
  })

  it("returns true (safe fallback) when our tab is not found in tabs list", async () => {
    const tabsOther = JSON.stringify([{ tab_id: 99, name: "other", active: true }])
    expect(await checkPaneTabActive(PANES_ACTIVE_TAB, tabsOther)).toBe(true)
  })

  it("correctly identifies active tab with multiple tabs", async () => {
    const panes = JSON.stringify([{ id: 5, tab_id: 3 }])
    const tabs = JSON.stringify([
      { tab_id: 1, active: false },
      { tab_id: 2, active: false },
      { tab_id: 3, active: true },
    ])
    expect(await checkPaneTabActive(panes, tabs, "5")).toBe(true)
  })

  it("correctly identifies inactive tab with multiple tabs", async () => {
    const panes = JSON.stringify([{ id: 5, tab_id: 2 }])
    const tabs = JSON.stringify([
      { tab_id: 1, active: false },
      { tab_id: 2, active: false },
      { tab_id: 3, active: true },
    ])
    expect(await checkPaneTabActive(panes, tabs, "5")).toBe(false)
  })
})

describe("getCurrentTabInfo", () => {
  afterEach(() => {
    delete process.env.ZELLIJ_PANE_ID
    delete process.env.ZELLIJ_SESSION_NAME
    vi.clearAllMocks()
  })

  it("uses session metadata and prefers non-plugin panes when ids collide", async () => {
    const executable = installFakeZellijBinary()
    configureTempZellijCache("test-session", `tabs {
  tab {
    position 2
    name "metadata tab"
    active false
    tab_id 7
  }
  tab {
    position 9
    name "plugin tab"
    active true
    tab_id 99
  }
}
panes {
  pane {
    id 14
    is_plugin true
    tab_position 9
  }
  pane {
    id 14
    is_plugin false
    tab_position 2
  }
}`)
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "14"

    const spawnSyncMock = childProcess.spawnSync as unknown as { mock: { calls: unknown[][] } }

    await expect(getCurrentTabInfo()).resolves.toEqual({ tabId: 7, tabName: "metadata tab" })
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock).toHaveBeenCalledWith(
      executable,
      ["--session", "test-session", "action", "save-session"],
      expect.objectContaining({
        stdio: "ignore",
        env: expect.objectContaining({ PATH: process.env.PATH }),
      }),
    )
  })

  it("falls back to list-panes when metadata parse fails", async () => {
    const executable = installFakeZellijBinary()
    configureTempZellijCache("test-session", `tabs { bad`)
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "14"

    const spawnSyncMock = childProcess.spawnSync as unknown as ReturnType<typeof vi.fn>
    spawnSyncMock.mockImplementation((command: string, args: string[]) => {
      if (args.includes("save-session")) {
        return { status: 0 }
      }

      if (args.includes("list-panes")) {
        return {
          status: 0,
          stdout: JSON.stringify([{ id: 14, is_plugin: false, tab_id: 2, tab_name: "fallback tab" }]),
        }
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
    })

    await expect(getCurrentTabInfo()).resolves.toEqual({ tabId: 2, tabName: "fallback tab" })
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      executable,
      ["--session", "test-session", "action", "save-session"],
      expect.anything(),
    )
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      2,
      executable,
      ["--session", "test-session", "action", "list-panes", "--json", "--tab"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    )
  })
})

describe("markTabNotified", () => {
  afterEach(() => {
    delete process.env.ZELLIJ_PANE_ID
    delete process.env.ZELLIJ_SESSION_NAME
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("renames tab without shell interpolation using resolved executable", () => {
    const executable = installFakeZellijBinary()
    cleanupSessionState("test-session-rename")
    process.env.ZELLIJ_PANE_ID = "12"
    process.env.ZELLIJ_SESSION_NAME = "test-session-rename"

    const spawnSyncMock = childProcess.spawnSync as unknown as { mock: { calls: unknown[][] } }

    markTabNotified(12, "$(touch /tmp/pwned)")

    expect(spawnSyncMock).toHaveBeenCalledWith(
      executable,
      ["--session", "test-session-rename", "action", "rename-tab", "-t", "12", " ● $(touch /tmp/pwned)"],
      { stdio: "ignore" },
    )
  })

  it("can defer pane-indicator work until after rename", () => {
    const executable = installFakeZellijBinary()
    cleanupSessionState("test-session-defer")
    process.env.ZELLIJ_PANE_ID = "12"
    process.env.ZELLIJ_SESSION_NAME = "test-session-defer"

    const spawnSyncMock = childProcess.spawnSync as unknown as { mock: { calls: unknown[][] } }

    markTabNotified(12, "api", {
      deferAuxiliaryWork: true,
      paneIndicator: { enabled: true, mode: "background", bg: "#333333", clearOn: "origin-pane-focus" },
    })

    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      executable,
      ["--session", "test-session-defer", "action", "rename-tab", "-t", "12", " ● api"],
      { stdio: "ignore" },
    )
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
  })

  it("tracks working state with a distinct poller prefix using resolved executable", () => {
    const executable = installFakeZellijBinary()
    cleanupSessionState("test-session-working")
    process.env.ZELLIJ_PANE_ID = "12"
    process.env.ZELLIJ_SESSION_NAME = "test-session-working"

    const spawnMock = childProcess.spawn as unknown as { mock: { calls: unknown[][] } }
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("not running")
    })

    markPaneWorking(12, "api")

    killSpy.mockRestore()

    expect(spawnMock).toHaveBeenCalled()
    const [, args, opts] = spawnMock.mock.calls[0] as any
    expect(args[1]).toContain("WORKING_PREFIX")
    expect(args[1]).toContain('"$ZELLIJ_EXECUTABLE" --session "$SESSION_NAME" action "$@"')
    expect(opts.env.WORKING_PREFIX).toBe(" ○ ")
    expect(opts.env.ZELLIJ_EXECUTABLE).toBe(executable)
  })
})
