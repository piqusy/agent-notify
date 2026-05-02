import { afterEach, describe, expect, it, vi } from "vitest"

const notifyMock = vi.hoisted(() => vi.fn())
const isZellijSessionMock = vi.hoisted(() => vi.fn(() => false))
const getCurrentTabInfoMock = vi.hoisted(() => vi.fn(async () => null))
const markPaneWorkingMock = vi.hoisted(() => vi.fn())
const clearPaneWorkingMock = vi.hoisted(() => vi.fn())

vi.mock("@agent-notify/core", () => ({
  notify: notifyMock,
  isZellijSession: isZellijSessionMock,
  getCurrentTabInfo: getCurrentTabInfoMock,
  markPaneWorking: markPaneWorkingMock,
  clearPaneWorking: clearPaneWorkingMock,
}))

import { cmdPermission, cmdTest, cmdWorkingStart, cmdWorkingStop } from "../commands/notify.js"

describe("notify CLI commands", () => {
  const originalZellijSessionName = process.env.ZELLIJ_SESSION_NAME
  const originalZellijPaneId = process.env.ZELLIJ_PANE_ID

  afterEach(() => {
    vi.restoreAllMocks()
    notifyMock.mockReset()
    isZellijSessionMock.mockReset()
    isZellijSessionMock.mockReturnValue(false)
    getCurrentTabInfoMock.mockReset()
    getCurrentTabInfoMock.mockResolvedValue(null)
    markPaneWorkingMock.mockReset()
    clearPaneWorkingMock.mockReset()
    process.env.ZELLIJ_SESSION_NAME = originalZellijSessionName
    process.env.ZELLIJ_PANE_ID = originalZellijPaneId
  })

  it("routes the permission command through trigger=permission", async () => {
    notifyMock.mockResolvedValueOnce({ sent: true })

    await cmdPermission(["/tmp/project", "--tool", "claude-code"])

    expect(notifyMock).toHaveBeenCalledWith({
      state: "question",
      trigger: "permission",
      tool: "claude-code",
      cwd: "/tmp/project",
    })
  })

  it("supports permission test notifications", async () => {
    notifyMock.mockResolvedValueOnce({ sent: true })
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cmdTest(["permission", "--force"])

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      state: "question",
      trigger: "permission",
      tool: "test",
      force: true,
    }))
    expect(logSpy).toHaveBeenCalledWith("Sent test notification: permission (forced)")
  })

  it("marks the current zellij pane as working", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "11"
    isZellijSessionMock.mockReturnValue(true)
    getCurrentTabInfoMock.mockResolvedValueOnce({ tabId: 7, tabName: "api" } as never)

    await cmdWorkingStart()

    expect(markPaneWorkingMock).toHaveBeenCalledWith(7, "api", {
      sessionName: "test-session",
      originPaneId: 11,
    })
  })

  it("clears the current zellij pane working indicator", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session"
    process.env.ZELLIJ_PANE_ID = "11"
    isZellijSessionMock.mockReturnValue(true)
    getCurrentTabInfoMock.mockResolvedValueOnce({ tabId: 7, tabName: "api" } as never)

    await cmdWorkingStop()

    expect(clearPaneWorkingMock).toHaveBeenCalledWith(7, {
      sessionName: "test-session",
      originPaneId: 11,
    })
  })
})
