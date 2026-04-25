import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process");

import { sendNotification } from "../platform/index.js";
import { sendMacOS } from "../platform/macos.js";
import { sendLinux } from "../platform/linux.js";
import * as cp from "child_process";

const mockConfig = {
  backend: null,
  terminalApp: null,
  cooldownSeconds: 3,
  quietHours: { start: 22, end: 8 },
  sounds: { done: "Morse", question: "Submarine", permission: null },
  events: { done: true, question: true, permission: true },
};

describe("sendNotification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cp.execSync).mockImplementation(() => "14.5\n" as any);
  });

  it("does not throw on darwin", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    await expect(
      sendNotification({ title: "Test", body: "body" }, mockConfig)
    ).resolves.not.toThrow();
  });

  it("does not throw on linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    await expect(
      sendNotification({ title: "Test", body: "body" }, mockConfig)
    ).resolves.not.toThrow();
  });

  it("does not throw on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await expect(
      sendNotification({ title: "Test", body: "body" }, mockConfig)
    ).resolves.not.toThrow();
  });

  it("swallows execSync errors", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.mocked(cp.execSync).mockImplementation(() => { throw new Error("not found"); });
    await expect(
      sendNotification({ title: "Test", body: "body" }, mockConfig)
    ).resolves.not.toThrow();
  });

  it("launches the macos helper app when that backend is selected", () => {
    sendMacOS(
      { title: "Test", body: "body", sound: "Morse" },
      "macos-helper",
      { helperAppPath: "/tmp/AgentNotify.app" },
    );

    expect(cp.spawnSync).toHaveBeenCalledWith(
      "open",
      ["-n", "/tmp/AgentNotify.app", "--args", "--title", "Test", "--body", "body", "--sound", "Morse"],
      { stdio: "ignore" }
    );
  });

  it("uses plain notify-send on linux", () => {
    sendLinux({ title: "Test", body: "body" });

    expect(cp.spawnSync).toHaveBeenCalledWith(
      "notify-send",
      ["Test", "body"],
      { stdio: "ignore" }
    );
  });
});
