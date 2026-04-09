import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}))

import { resolveTerminalApp, TERM_PROGRAM_MAP, isTerminalFocused } from "../focus.js"

describe("resolveTerminalApp", () => {
  beforeEach(() => {
    delete process.env.AGENT_NOTIFY_TERMINAL
  })

  it("returns AGENT_NOTIFY_TERMINAL env var when set", () => {
    process.env.AGENT_NOTIFY_TERMINAL = "MyTerm"
    expect(resolveTerminalApp("ghostty")).toBe("MyTerm")
  })

  it("maps ghostty to Ghostty", () => {
    expect(resolveTerminalApp("ghostty")).toBe("Ghostty")
  })

  it("maps iTerm.app to iTerm2", () => {
    expect(resolveTerminalApp("iTerm.app")).toBe("iTerm2")
  })

  it("maps Apple_Terminal to Terminal", () => {
    expect(resolveTerminalApp("Apple_Terminal")).toBe("Terminal")
  })

  it("returns null for unknown TERM_PROGRAM", () => {
    expect(resolveTerminalApp("unknown-term")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(resolveTerminalApp("")).toBeNull()
  })
})

describe("TERM_PROGRAM_MAP", () => {
  it("covers common terminals", () => {
    const keys = Object.keys(TERM_PROGRAM_MAP)
    expect(keys).toContain("ghostty")
    expect(keys).toContain("iTerm.app")
    expect(keys).toContain("WarpTerminal")
    expect(keys).toContain("alacritty")
    expect(keys).toContain("kitty")
    expect(keys).toContain("hyper")
    expect(keys).toContain("Apple_Terminal")
  })
})

describe("isTerminalFocused", () => {
  it("returns false on non-darwin platforms", async () => {
    const origPlatform = process.platform
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    const result = await isTerminalFocused("Ghostty")
    Object.defineProperty(process, "platform", { value: origPlatform, configurable: true })
    expect(result).toBe(false)
  })
})
