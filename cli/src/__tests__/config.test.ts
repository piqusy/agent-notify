import { describe, expect, it, vi, afterEach } from "vitest"

const initMock = vi.hoisted(() => ({
  cmdInit: vi.fn(async () => undefined),
}))

vi.mock("../commands/init.js", () => ({
  cmdInit: initMock.cmdInit,
}))

import { cmdConfig } from "../commands/config.js"

describe("cmdConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    initMock.cmdInit.mockClear()
  })

  it("delegates config edit to the setup wizard", async () => {
    await cmdConfig(["edit"])

    expect(initMock.cmdInit).toHaveBeenCalledOnce()
  })

  it("prints help for config with no subcommand", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cmdConfig([])

    expect(initMock.cmdInit).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("agent-notify config edit"))
  })
})
