import { describe, it, expect } from "vitest"
import OpenCodeAgentNotify from "../index.js"

describe("OpenCode plugin", () => {
  it("exports event hook", async () => {
    const plugin = await OpenCodeAgentNotify()
    expect(typeof plugin.event).toBe("function")
  })
})
