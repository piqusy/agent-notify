#!/usr/bin/env node
import { notify, BUILTIN_SOUNDS } from "@agent-notify/core";
import { ExitPromptError } from "@inquirer/core";
import { cmdInit } from "./commands/init.js";
import { cmdConfig } from "./commands/config.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdInstall, cmdUninstall } from "./commands/install.js";
import { playSoundSync } from "./sounds/play.js";
import { CLI_VERSION } from "./version.js";

const [, , command, ...args] = process.argv;

function parseStringFlag(args: string[], flag: string): { value?: string; rest: string[] } {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return {
      value: args[idx + 1],
      rest: args.filter((_, i) => i !== idx && i !== idx + 1),
    };
  }
  return { rest: args };
}

function parseNotifyFlags(args: string[]): { tool: string; rest: string[] } {
  const { value: tool, rest } = parseStringFlag(args, "--tool");
  return { tool: tool ?? "cli", rest };
}

async function cmdDone(rawArgs: string[]): Promise<void> {
  const { tool, rest } = parseNotifyFlags(rawArgs);
  const dir = rest[0];
  await notify({ state: "done", tool, cwd: dir ?? process.cwd() });
}

async function cmdQuestion(rawArgs: string[]): Promise<void> {
  const { tool, rest } = parseNotifyFlags(rawArgs);
  const dir = rest[0];
  await notify({ state: "question", tool, cwd: dir ?? process.cwd() });
}

async function cmdTest(subArgs: string[]): Promise<void> {
  const type = subArgs.find((a) => !a.startsWith("-"));
  const force = subArgs.includes("--force") || subArgs.includes("-f");
  const state = type === "question" ? "question" : "done";
  const uniqueTestCwd = `${process.cwd()}/agent-notify-test-${Date.now()}`;
  const result = await notify({ state, tool: "test", cwd: uniqueTestCwd, force });
  if (result.sent) {
    console.log(`Sent test notification: ${state}${force ? " (forced)" : ""}`);
  } else {
    console.log(`Notification suppressed (${result.reason}). Run "agent-notify doctor" for diagnostics.`);
  }
}

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
  agent-notify test [done|question] [--force|-f]
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
