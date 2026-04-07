import { execSync } from "node:child_process"
import * as path from "node:path"
import type { Config, NotifyPayload, QuietHours } from "./types.js"
import type { NotifyInput } from "./types.js"
import { loadConfig } from "./config.js"
import { checkAndUpdateCooldown, cooldownFilePath } from "./cooldown.js"
import { isTerminalFocused } from "./focus.js"
import { resolveSound } from "./sounds.js"
import { sendNotification } from "./platform/index.js"

export type { NotifyInput }

export function isQuietHour(quietHours: QuietHours): boolean {
  const now = new Date()
  const hour = now.getHours()
  const { start, end } = quietHours
  if (start <= end) {
    // e.g. start=9, end=17 — same day range
    return hour >= start && hour < end
  } else {
    // wraps midnight: e.g. start=22, end=8
    return hour >= start || hour < end
  }
}

function getGitBranch(cwd: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      timeout: 2000,
    }).trim()
  } catch {
    return null
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  const config: Config = await loadConfig()

  // 1. Event filter
  if (!config.events[input.state]) return

  // 2. Focus check — skip if terminal app is null (no app to check)
  if (config.terminalApp !== null) {
    if (await isTerminalFocused(config.terminalApp)) return
  }

  // 3. Cooldown — checkAndUpdateCooldown returns false if on cooldown
  const file = cooldownFilePath(input.tool)
  const shouldProceed = await checkAndUpdateCooldown(file, config.cooldownSeconds)
  if (!shouldProceed) return

  // 4. Git context
  const cwd = input.cwd ?? process.cwd()
  const project = path.basename(cwd)
  const branch = getGitBranch(cwd)

  // 5. Build payload
  const stateLabel = input.state === "done" ? "Done" : "Question"
  const title = `${input.tool} — ${stateLabel}`
  const body = branch ? `${project} · ${branch}` : project

  const sound = isQuietHour(config.quietHours)
    ? undefined
    : resolveSound(config.sounds[input.state]) ?? undefined

  const payload: NotifyPayload = { title, body, ...(sound ? { sound } : {}) }

  // 6. Send
  await sendNotification(payload, config)
}
