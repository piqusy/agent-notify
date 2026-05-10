import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)
const childProcess = require("node:child_process") as typeof import("node:child_process")

const mockState = vi.hoisted(() => ({
  existsSync: vi.fn<(path: string) => boolean>(),
}))

vi.mock("node:fs", () => ({
  existsSync: mockState.existsSync,
}))

import { playSound, playSoundSync } from "../sounds/play.js"

describe("playSound", () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    mockState.existsSync.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    vi.restoreAllMocks()
  })

  it("resolves macOS built-in sounds to system AIFF files before spawning afplay", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    mockState.existsSync.mockReturnValue(true)
    const unref = vi.fn()
    const spawnSpy = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref } as unknown as import("node:child_process").ChildProcess)

    playSound("Morse")

    expect(mockState.existsSync).toHaveBeenCalledWith("/System/Library/Sounds/Morse.aiff")
    expect(spawnSpy).toHaveBeenCalledWith(
      "afplay",
      ["/System/Library/Sounds/Morse.aiff"],
      { detached: true, stdio: "ignore" },
    )
    expect(unref).toHaveBeenCalledTimes(1)
  })

  it("uses paplay on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    const unref = vi.fn()
    const spawnSpy = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref } as unknown as import("node:child_process").ChildProcess)

    playSound("/tmp/test.wav")

    expect(spawnSpy).toHaveBeenCalledWith(
      "paplay",
      ["/tmp/test.wav"],
      { detached: true, stdio: "ignore" },
    )
    expect(unref).toHaveBeenCalledTimes(1)
  })

  it("swallows non-critical spawn errors", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    mockState.existsSync.mockReturnValue(false)
    vi.spyOn(childProcess, "spawn").mockImplementation(() => {
      throw new Error("afplay missing")
    })

    expect(() => playSound("Missing")).not.toThrow()
  })
})

describe("playSoundSync", () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    mockState.existsSync.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    vi.restoreAllMocks()
  })

  it("uses afplay synchronously on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    mockState.existsSync.mockReturnValue(true)
    const spawnSyncSpy = vi.spyOn(childProcess, "spawnSync").mockReturnValue({ status: 0 } as any)

    playSoundSync("Submarine")

    expect(spawnSyncSpy).toHaveBeenCalledWith(
      "afplay",
      ["/System/Library/Sounds/Submarine.aiff"],
      { stdio: "ignore" },
    )
  })

  it("encodes the PowerShell script on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })
    const spawnSyncSpy = vi.spyOn(childProcess, "spawnSync").mockReturnValue({ status: 0 } as any)

    playSoundSync("C:/Users/test/O'Brien.wav")

    expect(spawnSyncSpy).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawnSyncSpy.mock.calls[0] as [string, string[], { stdio: string }]
    expect(command).toBe("powershell")
    expect(args[0]).toBe("-EncodedCommand")
    expect(options).toEqual({ stdio: "ignore" })

    const decodedScript = Buffer.from(args[1]!, "base64").toString("utf16le")
    expect(decodedScript).toContain("SoundPlayer")
    expect(decodedScript).toContain("O''Brien.wav")
  })

  it("swallows non-critical synchronous playback errors", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    vi.spyOn(childProcess, "spawnSync").mockImplementation(() => {
      throw new Error("paplay missing")
    })

    expect(() => playSoundSync("/tmp/test.wav")).not.toThrow()
  })
})
