import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execFileSync: vi.fn(() => {
    throw new Error("no process tree")
  }),
}))

import { execFileSync } from "node:child_process"
import {
  resolveTerminal,
  resolveTerminalApp,
  TERM_PROGRAM_MAP,
  KNOWN_TERMINAL_APPS,
  isTerminalFocused,
} from "../focus.js"

describe("resolveTerminal", () => {
  beforeEach(() => {
    delete process.env.AGENT_NOTIFY_TERMINAL
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("no process tree")
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns AGENT_NOTIFY_TERMINAL env var when set", () => {
    process.env.AGENT_NOTIFY_TERMINAL = "MyTerm"

    expect(resolveTerminalApp("ghostty")).toBe("MyTerm")
    expect(resolveTerminal({ env: process.env, termProgram: "ghostty" })).toEqual({
      id: null,
      displayName: "MyTerm",
      bundleId: null,
      source: "env-override",
      reason: "AGENT_NOTIFY_TERMINAL",
    })
  })

  it("detects kitty via KITTY_WINDOW_ID even when TERM_PROGRAM is empty", () => {
    const resolved = resolveTerminal({
      env: { KITTY_WINDOW_ID: "12", TERM_PROGRAM: "" },
      termProgram: "",
      platform: "darwin",
      parentPid: 0,
    })

    expect(resolved).toEqual({
      id: "kitty",
      displayName: "kitty",
      bundleId: "net.kovidgoyal.kitty",
      source: "env",
      reason: "KITTY_WINDOW_ID",
    })
    expect(resolveTerminalApp("", { KITTY_WINDOW_ID: "12", TERM_PROGRAM: "" })).toBe("kitty")
  })

  it("maps TERM_PROGRAM values for the priority macOS terminal set", () => {
    expect(resolveTerminal({ env: { TERM_PROGRAM: "ghostty" }, termProgram: "ghostty" })?.displayName).toBe("Ghostty")
    expect(resolveTerminal({ env: { TERM_PROGRAM: "iTerm.app" }, termProgram: "iTerm.app" })?.displayName).toBe("iTerm2")
    expect(resolveTerminal({ env: { TERM_PROGRAM: "Apple_Terminal" }, termProgram: "Apple_Terminal" })?.displayName).toBe("Terminal")
    expect(resolveTerminal({ env: { TERM_PROGRAM: "WarpTerminal" }, termProgram: "WarpTerminal" })?.displayName).toBe("Warp")
    expect(resolveTerminal({ env: { TERM_PROGRAM: "WezTerm" }, termProgram: "WezTerm" })?.displayName).toBe("WezTerm")
    expect(resolveTerminal({ env: { TERM_PROGRAM: "Hyper" }, termProgram: "Hyper" })?.displayName).toBe("Hyper")
  })

  it("falls back to the macOS parent process tree when env detection fails", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("150 /bin/zsh\n" as never)
      .mockReturnValueOnce("100 /Applications/kitty.app/Contents/MacOS/kitty\n" as never)

    const resolved = resolveTerminal({
      env: {},
      termProgram: "",
      platform: "darwin",
      parentPid: 200,
    })

    expect(resolved).toEqual({
      id: "kitty",
      displayName: "kitty",
      bundleId: "net.kovidgoyal.kitty",
      source: "process-tree",
      reason: "parent process=kitty",
    })
  })

  it("returns null for unknown terminals", () => {
    expect(resolveTerminal({ env: {}, termProgram: "", platform: "linux", parentPid: 0 })).toBeNull()
    expect(resolveTerminalApp("unknown-term", {})).toBeNull()
  })

  it("respects config overrides and canonicalizes known terminals", () => {
    const resolved = resolveTerminal({
      configOverride: "Ghostty",
      env: { TERM_PROGRAM: "kitty" },
      termProgram: "kitty",
    })

    expect(resolved).toEqual({
      id: "ghostty",
      displayName: "Ghostty",
      bundleId: "com.mitchellh.ghostty",
      source: "config-override",
      reason: "config.terminalApp",
    })
  })
})

describe("terminal registry exports", () => {
  it("covers common TERM_PROGRAM mappings", () => {
    const keys = Object.keys(TERM_PROGRAM_MAP)
    expect(keys).toContain("ghostty")
    expect(keys).toContain("iTerm.app")
    expect(keys).toContain("Apple_Terminal")
    expect(keys).toContain("WarpTerminal")
    expect(keys).toContain("WezTerm")
    expect(keys).toContain("Hyper")
    expect(keys).toContain("vscode")
  })

  it("exposes a deduplicated list of known terminal app names", () => {
    expect(KNOWN_TERMINAL_APPS).toContain("Ghostty")
    expect(KNOWN_TERMINAL_APPS).toContain("iTerm2")
    expect(KNOWN_TERMINAL_APPS).toContain("Terminal")
    expect(KNOWN_TERMINAL_APPS).toContain("Warp")
    expect(KNOWN_TERMINAL_APPS).toContain("kitty")
    expect(new Set(KNOWN_TERMINAL_APPS).size).toBe(KNOWN_TERMINAL_APPS.length)
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
