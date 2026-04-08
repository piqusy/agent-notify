import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Config } from "./types.js"

export const defaultConfig: Config = {
  cooldownSeconds: 3,
  quietHours:      { start: 22, end: 8 },
  sounds:          { done: "Morse", question: "Submarine", permission: null },
  events:          { done: true, question: true, permission: true },
  terminalApp:     null,
  backend:         null,
}

export const defaultConfigPath = join(
  homedir(),
  ".config",
  "agent-notify",
  "config.json",
)

export async function loadConfig(path = defaultConfigPath): Promise<Config> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw) as Partial<Config>
    return { ...defaultConfig, ...parsed }
  } catch {
    return { ...defaultConfig }
  }
}
