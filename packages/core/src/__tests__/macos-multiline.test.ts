import { describe, it, expect, vi } from "vitest"

vi.mock("child_process", () => ({
  spawnSync: vi.fn(),
}))

import * as cp from "child_process"
import { sendMacOS } from "../platform/macos.js"

describe("macOS osascript fallback", () => {
  it("preserves multiline notification bodies", () => {
    sendMacOS(
      { title: "Test", body: "▣  work\n⎇  main" },
      "osascript",
    )

    expect(cp.spawnSync).toHaveBeenCalledWith(
      "osascript",
      ["-e", 'display notification "▣  work" & linefeed & "⎇  main" with title "Test"'],
      { stdio: "ignore" },
    )
  })
})
