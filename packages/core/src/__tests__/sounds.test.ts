import { describe, it, expect } from "vitest"
import { BUILTIN_SOUNDS, resolveSound } from "../sounds.js"

describe("BUILTIN_SOUNDS", () => {
  it("includes the 14 standard macOS alert sounds", () => {
    expect(BUILTIN_SOUNDS).toHaveLength(14)
    expect(BUILTIN_SOUNDS).toContain("Morse")
    expect(BUILTIN_SOUNDS).toContain("Submarine")
    expect(BUILTIN_SOUNDS).toContain("Ping")
    expect(BUILTIN_SOUNDS).toContain("Basso")
    expect(BUILTIN_SOUNDS).toContain("Tink")
  })
})

describe("resolveSound", () => {
  it("returns null when sound is null (silent mode)", () => {
    expect(resolveSound(null)).toBeNull()
  })

  it("returns the name for a known built-in sound", () => {
    expect(resolveSound("Morse")).toBe("Morse")
  })

  it("returns the path as-is for custom file paths", () => {
    expect(resolveSound("/Users/me/custom.aiff")).toBe("/Users/me/custom.aiff")
  })
})
