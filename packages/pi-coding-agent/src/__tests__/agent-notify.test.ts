import { describe, expect, it } from "vitest"
import { classifyPiAgentState } from "../agent-notify.js"

describe("Pi agent-notify integration", () => {
  it("defaults to done when there is no assistant message", () => {
    expect(classifyPiAgentState([])).toBe("done")
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
})
