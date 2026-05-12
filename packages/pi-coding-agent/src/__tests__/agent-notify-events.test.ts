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
  const originalArgv = [...process.argv]

  afterEach(() => {
    spawnMock.mockClear()
    process.argv = [...originalArgv]
  })

  it("marks working on agent_start", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_start?.({}, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["working-start"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("sends done on agent_end without separate working-stop", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_end?.({
      messages: [{ role: "assistant", content: [{ type: "text", text: "Done." }] }],
    }, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(
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
    }, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["working-stop"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("suppresses lifecycle notifications for json no-session child runs", async () => {
    process.argv = ["node", "pi", "--mode", "json", "-p", "--no-session"]

    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.agent_start?.({}, { cwd: "/tmp/project", hasUI: false })
    await handlers.agent_end?.({
      messages: [{ role: "assistant", content: [{ type: "text", text: "Done." }] }],
    }, { cwd: "/tmp/project", hasUI: false })

    expect(spawnMock).not.toHaveBeenCalled()
  })
})
