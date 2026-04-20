import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

import * as childProcess from "node:child_process"
import { isZellijSession, markTabNotified } from "../zellij.js"

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

// Helper: build a fake isPaneTabActive that takes injected JSON strings
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

describe("markTabNotified", () => {
  it("spawns shell poller with tab env", () => {
    const execSyncMock = childProcess.execSync as unknown as { mock: { calls: unknown[][] } }
    const spawnMock = childProcess.spawn as unknown as { mock: { calls: unknown[][] } }

    markTabNotified(12, "agent-notify")

    expect(execSyncMock).toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalled()
    const [cmd, args, opts] = spawnMock.mock.calls[0] as any
    expect(cmd).toBe("sh")
    expect(args).toEqual(["-c", expect.stringContaining("zellij action list-tabs --json")])
    expect(opts.env.TAB_ID).toBe("12")
    expect(args[1]).toContain("current_name")
    expect(args[1]).toContain("restored_name")
    expect(args[1]).toContain("sed 's/^ ●//'")
  })
})
