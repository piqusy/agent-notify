import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("child_process");
vi.mock("fs");

import { detectMacOSBackend, findMacOSHelperApp, verifyMacOSHelperApp } from "../platform/detect.js";
import * as cp from "child_process";
import * as fs from "fs";

describe("detectMacOSBackend", () => {
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PATH = originalPath;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.PATH = originalPath;
  });

  it("returns override if provided", async () => {
    expect(await detectMacOSBackend("osascript")).toBe("osascript");
    expect(await detectMacOSBackend("macos-helper")).toBe("macos-helper");
  });

  it("returns macos-helper if bundled helper app is found and verified", async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => String(path).includes("AgentNotify.app") || String(path).includes("Info.plist") || String(path).includes("/MacOS/AgentNotify"));
    vi.mocked(fs.readFileSync).mockReturnValue(`<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>io.github.piqusy.agentnotify</string></dict></plist>` as any);
    expect(await detectMacOSBackend(null)).toBe("macos-helper");
  });

  it("returns macos-helper when installed plugin code can locate the Homebrew helper via agent-notify on PATH", async () => {
    const homebrewBin = join(tmpdir(), "agent-notify-homebrew", "bin");
    const linkedExecutable = join(homebrewBin, "agent-notify");
    const cellarExecutable = join(tmpdir(), "agent-notify-homebrew", "Cellar", "agent-notify", "0.2.12", "bin", "agent-notify");
    const helperApp = join(tmpdir(), "agent-notify-homebrew", "Cellar", "agent-notify", "0.2.12", "libexec", "agent-notify-helper", "AgentNotify.app");
    const infoPlist = join(helperApp, "Contents", "Info.plist");
    const helperBinary = join(helperApp, "Contents", "MacOS", "AgentNotify");
    process.env.PATH = [homebrewBin, "/usr/bin"].join(delimiter);

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const value = String(path);
      return value === linkedExecutable || value === cellarExecutable || value === helperApp || value === infoPlist || value === helperBinary;
    });
    vi.mocked(fs.realpathSync).mockImplementation((path) => {
      if (String(path) === linkedExecutable) {
        return cellarExecutable;
      }
      return String(path);
    });
    vi.mocked(fs.readFileSync).mockReturnValue(`<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>io.github.piqusy.agentnotify</string></dict></plist>` as any);

    expect(findMacOSHelperApp()).toBe(helperApp);
    expect(await detectMacOSBackend(null)).toBe("macos-helper");
  });

  it("returns osascript if helper is not found", async () => {
    vi.mocked(cp.execSync).mockReturnValue("14.5\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await detectMacOSBackend(null)).toBe("osascript");
  });

  it("logs warning on modern macOS when helper is missing", async () => {
    vi.mocked(cp.execSync).mockReturnValue("15.1\n" as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await detectMacOSBackend(null);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("falling back to osascript"));
    stderrSpy.mockRestore();
  });

  it("does not trust helper apps found only under process.cwd", () => {
    const tempRoot = tmpdir();
    const fakeApp = join(tempRoot, "packages", "macos-helper", "dist", "AgentNotify.app");
    process.chdir(tempRoot);

    vi.mocked(fs.existsSync).mockImplementation((path) => String(path) === fakeApp);

    expect(findMacOSHelperApp()).toBeNull();
  });

  it("rejects helper apps with the wrong bundle identifier", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>evil.app</string></dict></plist>` as any);

    expect(verifyMacOSHelperApp("/tmp/AgentNotify.app")).toBe(false);
  });
});
