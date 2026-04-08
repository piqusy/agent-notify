#!/usr/bin/env node
import { notify, BUILTIN_SOUNDS } from "@agent-notify/core";
import { cmdInit } from "./commands/init.js";
import { playSoundSync } from "./sounds/play.js";

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
  agent-notify done [dir]           Send a "done" notification
  agent-notify question [dir]       Send a "question/waiting" notification
  agent-notify test [done|question] Send a test notification
  agent-notify sounds                List available notification sounds
  agent-notify sounds --play <name>  Play a sound by name
  agent-notify init                  Interactive setup wizard
  agent-notify --help                Show this help
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
      cmdSounds(args);
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
