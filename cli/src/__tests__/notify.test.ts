import { afterEach, describe, expect, it, vi } from "vitest"

const notifyMock = vi.hoisted(() => vi.fn())

vi.mock("@agent-notify/core", () => ({
  notify: notifyMock,
}))

import { cmdPermission, cmdTest } from "../commands/notify.js"

describe("notify CLI commands", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    notifyMock.mockReset()
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
})
