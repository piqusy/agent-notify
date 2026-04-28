import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process");

import { sendNotification } from "../platform/index.js";
import { sendMacOS } from "../platform/macos.js";
import { sendLinux } from "../platform/linux.js";
import type { Config } from "../types.js";
import * as cp from "child_process";

const mockConfig: Config = {
  backend: null,
  terminalApp: null,
  clickRestore: { enabled: false },
  cooldownSeconds: 3,
  quietHours: { start: 22, end: 8 },
  sounds: { done: "Morse", question: "Submarine", permission: null },
  events: { done: true, question: true, permission: true },
  zellij: {
    tabIndicator: { enabled: true, prefix: " ● " },
    paneIndicator: { enabled: false, mode: "background", bg: "#3c3836", clearOn: "origin-pane-focus" },
  },
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

  it("passes click spike metadata to the macos helper when provided", () => {
    sendMacOS(
      {
        title: "Test",
        body: "body",
        clickTarget: {
          issuedAt: 1_777_324_000,
          terminalApp: "Ghostty",
          zellij: { sessionName: "dev", tabId: 7, tabName: "api" },
        },
        macosHelperKeepAliveSeconds: 90,
      },
      "macos-helper",
      { helperAppPath: "/tmp/AgentNotify.app" },
    );

    const encodedTarget = Buffer.from(JSON.stringify({
      issuedAt: 1_777_324_000,
      terminalApp: "Ghostty",
      zellij: { sessionName: "dev", tabId: 7, tabName: "api" },
    }), "utf8").toString("base64");

    expect(cp.spawnSync).toHaveBeenCalledWith(
      "open",
      [
        "-n",
        "/tmp/AgentNotify.app",
        "--args",
        "--title",
        "Test",
        "--body",
        "body",
        "--click-target",
        encodedTarget,
        "--keep-alive-seconds",
        "90",
      ],
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
