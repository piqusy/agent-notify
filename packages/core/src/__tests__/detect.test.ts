import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll mock child_process and fs
vi.mock("child_process");
vi.mock("fs");

import { detectMacOSBackend } from "../platform/detect.js";
import * as cp from "child_process";
import * as fs from "fs";

describe("detectMacOSBackend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns override if provided", async () => {
    expect(await detectMacOSBackend("osascript")).toBe("osascript");
    expect(await detectMacOSBackend("terminal-notifier")).toBe("terminal-notifier");
  });

  it("returns terminal-notifier if found at homebrew path", async () => {
    vi.mocked(cp.execSync).mockReturnValue("14.5\n" as any);
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === "/opt/homebrew/bin/terminal-notifier"
    );
    expect(await detectMacOSBackend(null)).toBe("terminal-notifier");
  });

  it("returns osascript if terminal-notifier not found", async () => {
    vi.mocked(cp.execSync).mockReturnValue("14.5\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await detectMacOSBackend(null)).toBe("osascript");
  });

  it("logs warning on macOS 15.x", async () => {
    vi.mocked(cp.execSync).mockReturnValue("15.1\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await detectMacOSBackend(null);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Sequoia"));
    stderrSpy.mockRestore();
  });
});
