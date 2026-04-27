import { describe, expect, it } from "vitest"
import { classifyPiAgentState } from "../agent-notify.js"

describe("Pi agent-notify integration", () => {
  it("does not notify when there is no assistant message", () => {
    expect(classifyPiAgentState([])).toBeNull()
  })

  it("detects a trailing question in the last assistant line", () => {
    expect(classifyPiAgentState([
      {
        role: "assistant",
        content: [
          { type: "text", text: "I found two ways to implement this." },
          { type: "text", text: "Which one do you want me to ship?" },
        ],
      },
    ])).toBe("question")
  })

  it("treats non-question endings as done", () => {
    expect(classifyPiAgentState([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Implemented the refactor." },
          { type: "text", text: "Tests pass." },
        ],
      },
    ])).toBe("done")
  })

  it("does not notify for aborted runs", () => {
    expect(classifyPiAgentState([
      {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        stopReason: "aborted",
        errorMessage: "Aborted by user",
      },
    ])).toBeNull()
  })

  it("does not notify for errored runs", () => {
    expect(classifyPiAgentState([
      {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        stopReason: "error",
      },
    ])).toBeNull()
  })

  it("does not fall back to an earlier assistant message when the last one has no text", () => {
    expect(classifyPiAgentState([
      {
        role: "assistant",
        content: [{ type: "text", text: "I inspected the codebase." }],
      },
      {
        role: "toolResult",
        content: [{ type: "text", text: "ok" }],
      },
      {
        role: "assistant",
        content: [],
      },
    ])).toBeNull()
  })
})
