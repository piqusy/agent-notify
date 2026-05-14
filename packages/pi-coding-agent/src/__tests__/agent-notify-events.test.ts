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

  it("sends question when ask_user_question opens in interactive mode", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.tool_call?.({ toolName: "ask_user_question" }, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["question", "/tmp/project", "--tool", "pi-coding-agent"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("restores working after ask_user_question closes", async () => {
    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.tool_call?.({ toolName: "ask_user_question" }, { cwd: "/tmp/project", hasUI: true })
    spawnMock.mockClear()

    await handlers.tool_execution_end?.({ toolName: "ask_user_question", isError: false }, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).toHaveBeenCalledWith(
      "agent-notify",
      ["working-start"],
      expect.objectContaining({ stdio: "ignore" }),
    )
  })

  it("does not emit structured question notifications in rpc mode", async () => {
    process.argv = ["node", "pi", "--mode", "rpc"]

    const handlers: Record<string, Function> = {}
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
      }),
    }

    agentNotify(pi as never)
    await handlers.tool_call?.({ toolName: "ask_user_question" }, { cwd: "/tmp/project", hasUI: true })

    expect(spawnMock).not.toHaveBeenCalled()
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
