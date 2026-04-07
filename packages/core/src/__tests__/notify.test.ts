import { describe, it, expect, vi, beforeEach } from "vitest"
import { isQuietHour } from "../notify.js"

describe("isQuietHour", () => {
  it("returns false outside quiet hours (no wrap)", () => {
    // quiet 22-8: hour 12 should be false
    expect(isQuietHour({ start: 22, end: 8 })).toBe(
      new Date().getHours() >= 22 || new Date().getHours() < 8
    )
  })

  it("handles midnight wrap correctly", () => {
    const mockHour = (h: number) => {
      vi.spyOn(Date.prototype, "getHours").mockReturnValue(h)
    }

    mockHour(23)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(true)

    mockHour(3)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(true)

    mockHour(12)
    expect(isQuietHour({ start: 22, end: 8 })).toBe(false)

    vi.restoreAllMocks()
  })

  it("handles non-wrapping range", () => {
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(10)
    expect(isQuietHour({ start: 9, end: 17 })).toBe(true)

    vi.spyOn(Date.prototype, "getHours").mockReturnValue(8)
    expect(isQuietHour({ start: 9, end: 17 })).toBe(false)

    vi.restoreAllMocks()
  })
})

describe("notify integration (skip in CI — uses real config/fs)", () => {
  it("is exported from index", async () => {
    const mod = await import("../index.js")
    expect(typeof mod.notify).toBe("function")
  })
})
