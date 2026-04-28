#!/usr/bin/env node
import { BUILTIN_SOUNDS } from "@agent-notify/core";
import { ExitPromptError } from "@inquirer/core";
import { cmdInit } from "./commands/init.js";
import { cmdConfig } from "./commands/config.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdDone, cmdPermission, cmdQuestion, cmdTest } from "./commands/notify.js";
import { cmdInstall, cmdUninstall } from "./commands/install.js";
import { playSoundSync } from "./sounds/play.js";
import { CLI_VERSION } from "./version.js";

const [, , command, ...args] = process.argv;

function cmdSounds(subArgs: string[]): void {
  const flag = subArgs[0];
  if (flag === "--play" || flag === "-p") {
    const name = subArgs[1];
    if (!name) {
      console.error("Usage: agent-notify sounds --play <name>");
      process.exit(1);
    }
    if (!BUILTIN_SOUNDS.includes(name as (typeof BUILTIN_SOUNDS)[number])) {
      console.error(`Unknown sound: ${name}`);
      console.error(`Available: ${BUILTIN_SOUNDS.join(", ")}`);
      process.exit(1);
    }
    playSoundSync(name);
    return;
  }
  console.log("Available sounds:");
  for (const sound of BUILTIN_SOUNDS) {
    console.log(`  ${sound}`);
  }
}

function printHelp(): void {
  console.log(`agent-notify — send desktop notifications from AI agents

Usage:
  agent-notify done [dir] [--tool <name>]
                                          Send a "done" notification
  agent-notify question [dir] [--tool <name>]
                                          Send a "question/waiting" notification
  agent-notify permission [dir] [--tool <name>]
                                          Send a "permission request" notification
  agent-notify test [done|question|permission] [--force|-f]
                                          Send a test notification (--force bypasses focus/cooldown)
  agent-notify sounds                      List available notification sounds
  agent-notify sounds --play <name>        Play a sound by name
  agent-notify init                        Interactive setup/edit wizard
  agent-notify config edit                 Edit existing config in the wizard
  agent-notify doctor                      Run diagnostics
  agent-notify install [all|pi|opencode|claude-code]
                                          Install integration(s)
  agent-notify uninstall [all|pi|opencode|claude-code]
                                          Remove integration(s)
  agent-notify --help                      Show this help
  agent-notify --version                   Show version
`);
}

async function main(): Promise<void> {
  switch (command) {
    case "done":
      await cmdDone(args);
      break;
    case "question":
      await cmdQuestion(args);
      break;
    case "permission":
      await cmdPermission(args);
      break;
    case "test":
      await cmdTest(args);
      break;
    case "sounds":
      cmdSounds(args);
      break;
    case "init":
      await cmdInit();
      break;
    case "config":
      await cmdConfig(args);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "install":
      await cmdInstall(args);
      break;
    case "uninstall":
      await cmdUninstall(args);
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    case "--version":
    case "-v":
      console.log(CLI_VERSION);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof ExitPromptError) {
    console.log("\nAborted.");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
