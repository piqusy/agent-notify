import { execSync } from "node:child_process"
import * as path from "node:path"
import type { Config, NotifyPayload, NotifyResult, QuietHours } from "./types.js"
import type { NotifyInput } from "./types.js"
import { loadConfig } from "./config.js"
import { checkAndUpdateCooldown, cooldownFilePath } from "./cooldown.js"
import { isTerminalFocused, resolveTerminalApp } from "./focus.js"
import { isZellijSession, isPaneTabActive } from "./zellij.js"
import { resolveSound } from "./sounds.js"
import { sendNotification } from "./platform/index.js"

export type { NotifyInput }

export function isQuietHour(quietHours: QuietHours | null): boolean {
  if (quietHours === null) return false
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

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const config: Config = await loadConfig()

  // 1. Event filter — use trigger if provided, otherwise fall back to state
  const eventKey = input.trigger ?? input.state
  if (!config.events[eventKey]) return { sent: false, reason: "event-disabled" }

  // 2. Focus check — auto-detect terminal when terminalApp is null
  const termApp = config.terminalApp ?? resolveTerminalApp(process.env.TERM_PROGRAM ?? "")
  if (termApp !== null && await isTerminalFocused(termApp)) {
    if (isZellijSession()) {
      // Inside Zellij: only suppress if our tab is the active (visible) one
      if (await isPaneTabActive()) return { sent: false, reason: "terminal-focused" }
      // Tab not active — user is on a different tab, so notify
    } else {
      // No multiplexer: terminal focused = user is looking at it, suppress
      return { sent: false, reason: "terminal-focused" }
    }
  }

  // 3. Cooldown — checkAndUpdateCooldown returns false if on cooldown
  const file = cooldownFilePath(input.tool)
  const shouldProceed = await checkAndUpdateCooldown(file, config.cooldownSeconds)
  if (!shouldProceed) return { sent: false, reason: "cooldown" }

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
    : (() => {
        const trigger = input.trigger ?? input.state
        // permission sound falls back to question sound if null
        const soundKey = trigger === "permission"
          ? (config.sounds.permission ?? config.sounds.question)
          : config.sounds[trigger as "done" | "question"] ?? config.sounds[input.state]
        return resolveSound(soundKey) ?? undefined
      })()

  const payload: NotifyPayload = { title, body, ...(sound ? { sound } : {}) }

  // 6. Send
  await sendNotification(payload, config)
  return { sent: true }
}
