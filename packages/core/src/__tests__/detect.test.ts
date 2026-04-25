import { describe, it, expect, vi, beforeEach } from "vitest";

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
    expect(await detectMacOSBackend("macos-helper")).toBe("macos-helper");
  });

  it("returns macos-helper if bundled helper app is found", async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => String(path).includes("AgentNotify.app"));
    expect(await detectMacOSBackend(null)).toBe("macos-helper");
  });

  it("returns terminal-notifier if helper is missing but terminal-notifier exists", async () => {
    vi.mocked(cp.execSync).mockReturnValue("14.5\n" as any);
    vi.mocked(fs.existsSync).mockImplementation((path) => String(path) === "/opt/homebrew/bin/terminal-notifier");
    expect(await detectMacOSBackend(null)).toBe("terminal-notifier");
  });

  it("returns osascript if neither helper nor terminal-notifier is found", async () => {
    vi.mocked(cp.execSync).mockReturnValue("14.5\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await detectMacOSBackend(null)).toBe("osascript");
  });

  it("logs warning on modern macOS when helper is missing", async () => {
    vi.mocked(cp.execSync).mockReturnValue("15.1\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await detectMacOSBackend(null);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Native helper missing"));
    stderrSpy.mockRestore();
  });
});
