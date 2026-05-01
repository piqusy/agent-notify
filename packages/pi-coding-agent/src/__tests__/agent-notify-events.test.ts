import { afterEach, describe, expect, it, vi } from "vitest"

const spawnMock = vi.hoisted(() => vi.fn(() => ({
  on: vi.fn(),
  unref: vi.fn(),
})))

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

import agentNotify from "../agent-notify.js"

describe("Pi agent-notify lifecycle integration", () => {
  afterEach(() => {
    spawnMock.mockClear()
  })

  it("marks working on agent_start", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_start?.({}, { cwd: "/tmp/project" })

    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["working-start"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("clears working and sends done on agent_end", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_end?.({
      messages: [{ role: "assistant", content: [{ type: "text", text: "Done." }] }],
    }, { cwd: "/tmp/project" })

    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      "agent-notify",
      ["working-stop"],
      expect.objectContaining({ stdio: "ignore" }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      "agent-notify",
      ["done", "/tmp/project", "--tool", "pi-coding-agent"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("still clears working when the run ends without a visible notification", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_end?.({
      messages: [{ role: "assistant", content: [], stopReason: "aborted" }],
    }, { cwd: "/tmp/project" })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["working-stop"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })
})
