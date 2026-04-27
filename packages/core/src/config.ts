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
  zellij: {
    tabIndicator: {
      enabled: true,
      prefix: " ● ",
    },
    paneIndicator: {
      enabled: false,
      mode: "background",
      bg: "#3c3836",
      fg: null,
      clearOn: "origin-pane-focus",
    },
  },
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

    return {
      ...defaultConfig,
      ...parsed,
      sounds: {
        ...defaultConfig.sounds,
        ...(parsed.sounds ?? {}),
      },
      events: {
        ...defaultConfig.events,
        ...(parsed.events ?? {}),
      },
      zellij: {
        ...defaultConfig.zellij,
        ...(parsed.zellij ?? {}),
        tabIndicator: {
          ...defaultConfig.zellij.tabIndicator,
          ...(parsed.zellij?.tabIndicator ?? {}),
        },
        paneIndicator: {
          ...defaultConfig.zellij.paneIndicator,
          ...(parsed.zellij?.paneIndicator ?? {}),
        },
      },
    }
  } catch {
    return { ...defaultConfig }
  }
}
