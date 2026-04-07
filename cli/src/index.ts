#!/usr/bin/env node
import { notify, loadConfig, BUILTIN_SOUNDS, defaultConfigPath } from "@agent-notify/core";
import { execSync } from "child_process";
import * as fs from "fs";

const [, , command, ...args] = process.argv;

async function cmdDone(dir?: string): Promise<void> {
  await notify({ state: "done", tool: "agent-notify-cli", cwd: dir ?? process.cwd() });
}

async function cmdQuestion(dir?: string): Promise<void> {
  await notify({ state: "question", tool: "agent-notify-cli", cwd: dir ?? process.cwd() });
}

async function cmdTest(type?: string): Promise<void> {
  const state = type === "question" ? "question" : "done";
  await notify({ state, tool: "agent-notify-test", cwd: process.cwd() });
  console.log(`Sent test notification: ${state}`);
}

function cmdSounds(): void {
  console.log("Available sounds:");
  for (const sound of BUILTIN_SOUNDS) {
    console.log(`  ${sound}`);
  }
}

async function cmdInit(): Promise<void> {
  console.log("agent-notify setup");
  console.log("==================");

  // Check macOS Sequoia
  try {
    const version = execSync("sw_vers -productVersion", { encoding: "utf8" }).trim();
    if (version.startsWith("15.")) {
      console.log(`\n⚠  macOS Sequoia (${version}) detected.`);
      console.log(
        "   Sequoia restricts some notification APIs. terminal-notifier is recommended."
      );
      // Check if terminal-notifier is available
      const tnPaths = [
        "/opt/homebrew/bin/terminal-notifier",
        "/usr/local/bin/terminal-notifier",
      ];
      const hasTN = tnPaths.some((p) => fs.existsSync(p));
      if (!hasTN) {
        console.log(
          "\n   terminal-notifier not found. Install it:\n   brew install terminal-notifier"
        );
      } else {
        console.log("\n   terminal-notifier found. You are all set.");
      }
    }
  } catch {
    // Not macOS or sw_vers not available
  }

  // Show config path
  console.log(`\nConfig file: ${defaultConfigPath}`);
  const configExists = fs.existsSync(defaultConfigPath);
  if (!configExists) {
    console.log("No config file found. Using defaults.");
    console.log("Create one at the path above to customize behavior.");
  } else {
    console.log("Config file found.");
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  }
}

function printHelp(): void {
  console.log(`agent-notify — send desktop notifications from AI agents

Usage:
  agent-notify done [dir]           Send a "done" notification
  agent-notify question [dir]       Send a "question/waiting" notification
  agent-notify test [done|question] Send a test notification
  agent-notify sounds               List available notification sounds
  agent-notify init                 Setup and diagnostics
  agent-notify --help               Show this help
`);
}

async function main(): Promise<void> {
  switch (command) {
    case "done":
      await cmdDone(args[0]);
      break;
    case "question":
      await cmdQuestion(args[0]);
      break;
    case "test":
      await cmdTest(args[0]);
      break;
    case "sounds":
      cmdSounds();
      break;
    case "init":
      await cmdInit();
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
