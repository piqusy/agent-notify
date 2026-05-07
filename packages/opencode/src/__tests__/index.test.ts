import { afterEach, describe, expect, it, vi } from "vitest"

const notifyMock = vi.hoisted(() => vi.fn())
const isZellijSessionMock = vi.hoisted(() => vi.fn(() => false))
const getCurrentTabInfoMock = vi.hoisted(() => vi.fn(async () => null))
const markPaneWorkingMock = vi.hoisted(() => vi.fn())

vi.mock("@agent-notify/core", () => ({
  notify: notifyMock,
  isZellijSession: isZellijSessionMock,
  getCurrentTabInfo: getCurrentTabInfoMock,
  markPaneWorking: markPaneWorkingMock,
}))

import OpenCodeAgentNotify from "../index.js"

describe("OpenCode plugin", () => {
  const originalZellijSessionName = process.env.ZELLIJ_SESSION_NAME
  const originalZellijPaneId = process.env.ZELLIJ_PANE_ID

  afterEach(() => {
    notifyMock.mockReset()
    isZellijSessionMock.mockReset()
    isZellijSessionMock.mockReturnValue(false)
    getCurrentTabInfoMock.mockReset()
    getCurrentTabInfoMock.mockResolvedValue(null)
    markPaneWorkingMock.mockReset()
    process.env.ZELLIJ_SESSION_NAME = originalZellijSessionName
    process.env.ZELLIJ_PANE_ID = originalZellijPaneId
  })

  it("exports event and chat.message hooks", async () => {
    const plugin = await OpenCodeAgentNotify()
    expect(typeof plugin.event).toBe("function")
    expect(typeof plugin["chat.message"]).toBe("function")
  })

  it("marks working on chat.message for root sessions", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "11"
    isZellijSessionMock.mockReturnValue(true)
    getCurrentTabInfoMock.mockResolvedValueOnce({ tabId: 7, tabName: "api", visibleTabName: "api" } as never)
    const getSessionMock = vi.fn(async () => ({ data: { id: "session-1" } }))

    const plugin = await OpenCodeAgentNotify({ client: { session: { get: getSessionMock } } })
    await plugin["chat.message"]({ sessionID: "session-1" }, { message: {}, parts: [] })

    expect(getSessionMock).toHaveBeenCalledWith({ path: { id: "session-1" } })
    expect(markPaneWorkingMock).toHaveBeenCalledWith(7, "api", {
      sessionName: "test-session",
      originPaneId: 11,
      visibleTabName: "api",
    })
  })

  it("skips working state for child sessions", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "11"
    isZellijSessionMock.mockReturnValue(true)
    const getSessionMock = vi.fn(async () => ({ data: { id: "session-child", parentID: "session-root" } }))

    const plugin = await OpenCodeAgentNotify({ client: { session: { get: getSessionMock } } })
    await plugin["chat.message"]({ sessionID: "session-child" }, { message: {}, parts: [] })

    expect(markPaneWorkingMock).not.toHaveBeenCalled()
  })

  it("sends permission notifications for root sessions", async () => {
    const plugin = await OpenCodeAgentNotify()
    await plugin.event({
      event: {
        type: "permission.asked",
        session: { id: "session-1", cwd: "/tmp/project" },
      },
    })

    expect(notifyMock).toHaveBeenCalledWith({
      state: "question",
      trigger: "permission",
      tool: "opencode",
      cwd: "/tmp/project",
    })
  })
})
