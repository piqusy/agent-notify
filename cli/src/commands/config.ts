import { cmdInit } from "./init.js"

function printConfigHelp(): void {
  console.log(`agent-notify config

Usage:
  agent-notify config edit    Edit the existing config in the setup wizard
  agent-notify config --help  Show this help
`)
}

export async function cmdConfig(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case "edit":
      await cmdInit()
      return
    case undefined:
    case "--help":
    case "-h":
      printConfigHelp()
      return
    default:
      console.error(`Unknown config subcommand: ${subcommand}`)
      printConfigHelp()
      process.exit(1)
  }
}
