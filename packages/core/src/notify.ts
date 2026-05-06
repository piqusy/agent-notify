import { execSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import * as path from "node:path"
import type { Config, NotifyPayload, NotifyResult, QuietHours, NotifyTrigger } from "./types.js"
import type { NotifyInput } from "./types.js"
import { loadConfigResult } from "./config.js"
import { checkAndUpdateCooldown, cooldownFilePath } from "./cooldown.js"
import { isTerminalFocused, resolveTerminal } from "./focus.js"
import { isZellijSession, isPaneTabActive, getCurrentTabInfo, markTabNotified, clearPaneWorking } from "./zellij.js"
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

function normalizeTabName(tabName: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    if (prefix && tabName.startsWith(prefix)) {
      return tabName.slice(prefix.length).trim()
    }
  }

  return tabName.replace(/^\s*[●○◐]\s*/, "").trim()
}

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function parsePositiveIntEnv(name: string): number | undefined {
  const value = process.env[name]?.trim()
  if (!value) return undefined

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function buildKittyClickTarget(): { windowId?: number; listenOn?: string } | undefined {
  const windowId = parsePositiveIntEnv("KITTY_WINDOW_ID")
  const listenOn = process.env.KITTY_LISTEN_ON?.trim()

  if (windowId === undefined && !listenOn) return undefined

  return {
    ...(windowId !== undefined ? { windowId } : {}),
    ...(listenOn ? { listenOn } : {}),
  }
}

const warnedConfigPaths = new Set<string>()

function writeDebugLog(payload: Record<string, unknown>): void {
  const file = process.env.AGENT_NOTIFY_DEBUG_LOG?.trim()
  if (!file) return

  try {
    appendFileSync(file, `${JSON.stringify({
      timestamp: Date.now(),
      pid: process.pid,
      source: "core:notify",
      ...payload,
    })}\n`, "utf8")
  } catch {
    // debug logging must never affect notification flow
  }
}

function warnOnInvalidConfig(path: string, summary: string): void {
  if (warnedConfigPaths.has(path)) return
  warnedConfigPaths.add(path)
  console.error(`[agent-notify] Config warning: ${summary}. Run "agent-notify doctor" for details.`)
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const startedAt = process.hrtime.bigint()
  const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1_000_000

  writeDebugLog({
    event: "notify-start",
    tool: input.tool,
    state: input.state,
    trigger: input.trigger ?? input.state,
  })

  const configResult = await loadConfigResult()
  const config: Config = configResult.config

  if (configResult.status === "invalid-json") {
    warnOnInvalidConfig(configResult.path, `${configResult.issues[0]?.message ?? "Invalid config"} in ${configResult.path}; using defaults`)
  } else if (configResult.status === "invalid-fields") {
    warnOnInvalidConfig(configResult.path, `${configResult.issues.length} invalid config setting${configResult.issues.length === 1 ? "" : "s"} in ${configResult.path}; invalid fields reset to defaults`)
  }
  const resolvedTerminal = resolveTerminal({
    configOverride: config.terminalApp,
    env: process.env,
    termProgram: process.env.TERM_PROGRAM ?? "",
  })
  const terminalApp = resolvedTerminal?.displayName ?? null
  const zellijSession = isZellijSession()
  const tabInfo = zellijSession ? await getCurrentTabInfo() : null

  if (tabInfo) {
    clearPaneWorking(tabInfo.tabId, {
      sessionName: process.env.ZELLIJ_SESSION_NAME ?? null,
      originPaneId: Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10),
      tabIndicator: config.zellij.tabIndicator,
    })
  }

  // 1. Event filter — use trigger if provided, otherwise fall back to state
  const eventKey = input.trigger ?? input.state
  if (!config.events[eventKey]) {
    writeDebugLog({ event: "notify-suppressed", reason: "event-disabled", elapsedMs: elapsedMs() })
    return { sent: false, reason: "event-disabled" }
  }

  // 2. Focus check — auto-detect terminal when terminalApp is null
  if (!input.skipFocusCheck && !input.force) {
    if (resolvedTerminal !== null && await isTerminalFocused(resolvedTerminal)) {
      if (zellijSession) {
        // Inside Zellij: only suppress if our tab is the active (visible) one
        if (await isPaneTabActive()) {
          writeDebugLog({ event: "notify-suppressed", reason: "terminal-focused", elapsedMs: elapsedMs() })
          return { sent: false, reason: "terminal-focused" }
        }
        // Tab not active — user is on a different tab, so notify
      } else {
        // No multiplexer: terminal focused = user is looking at it, suppress
        writeDebugLog({ event: "notify-suppressed", reason: "terminal-focused", elapsedMs: elapsedMs() })
        return { sent: false, reason: "terminal-focused" }
      }
    }
  }

  // 3. Cooldown — checkAndUpdateCooldown returns false if on cooldown
  const file = cooldownFilePath(input.tool)
  const shouldProceed = input.force || await checkAndUpdateCooldown(file, config.cooldownSeconds)
  if (!shouldProceed) {
    writeDebugLog({ event: "notify-suppressed", reason: "cooldown", elapsedMs: elapsedMs() })
    return { sent: false, reason: "cooldown" }
  }

  // 4. Tab indicator — mark as early as possible after suppression checks pass.
  // This gives Zellij more time to repaint before desktop notification appears.
  if (tabInfo) {
    writeDebugLog({
      event: "tab-indicator-start",
      elapsedMs: elapsedMs(),
      tabId: tabInfo.tabId,
      tabName: tabInfo.tabName,
    })

    markTabNotified(tabInfo.tabId, tabInfo.tabName, {
      sessionName: process.env.ZELLIJ_SESSION_NAME ?? null,
      originPaneId: Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10),
      tabIndicator: config.zellij.tabIndicator,
      paneIndicator: config.zellij.paneIndicator,
      deferAuxiliaryWork: true,
      visibleTabName: tabInfo.visibleTabName,
    })

    writeDebugLog({
      event: "tab-indicator-end",
      elapsedMs: elapsedMs(),
      tabId: tabInfo.tabId,
    })
  }

  // 5. Git + tab context
  const cwd = input.cwd ?? process.cwd()
  const project = path.basename(cwd)
  writeDebugLog({ event: "git-branch-start", elapsedMs: elapsedMs(), cwd })
  const branch = getGitBranch(cwd)
  writeDebugLog({ event: "git-branch-end", elapsedMs: elapsedMs(), branch: branch ?? null })
  const tabPrefixes = [
    config.zellij.tabIndicator.prefix,
    config.zellij.tabIndicator.workingPrefix,
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
  const tabName = tabInfo ? normalizeTabName(tabInfo.visibleTabName, tabPrefixes) : project

  // 6. Build payload
  const TOOL_DISPLAY_NAMES: Record<string, string> = {
    cli: "CLI",
    opencode: "OpenCode",
    "claude-code": "Claude Code",
    "pi-coding-agent": "Pi",
    test: "Test",
  }
  const EVENT_LABELS: Record<NotifyTrigger, string> = {
    done: "Done",
    question: "Question",
    permission: "Permission",
  }
  const displayName = TOOL_DISPLAY_NAMES[input.tool]
    ?? input.tool.charAt(0).toUpperCase() + input.tool.slice(1)
  const eventLabel = EVENT_LABELS[input.trigger ?? input.state]
  const title = `${displayName} — ${eventLabel}`
  const body = [
    `▣  ${tabName}`,
    `⎇  ${branch ?? "—"}`,
  ].join("\n")

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

  const clickRestoreEnabled = config.clickRestore.enabled || envFlagEnabled("AGENT_NOTIFY_CLICK_SPIKE")
  const payload: NotifyPayload = {
    title,
    body,
    ...(sound ? { sound } : {}),
    ...(clickRestoreEnabled ? {
      clickTarget: {
        issuedAt: Math.floor(Date.now() / 1000),
        ...(terminalApp !== null ? { terminalApp } : {}),
        ...(resolvedTerminal ? {
          terminal: {
            ...(resolvedTerminal.id !== null ? { id: resolvedTerminal.id } : {}),
            displayName: resolvedTerminal.displayName,
            ...(resolvedTerminal.bundleId !== null ? { bundleId: resolvedTerminal.bundleId } : {}),
            ...(() => {
              if (resolvedTerminal.id !== "kitty") return {}
              const kitty = buildKittyClickTarget()
              return kitty ? { kitty } : {}
            })(),
          },
        } : {}),
        ...(tabInfo || process.env.ZELLIJ_SESSION_NAME ? {
          zellij: {
            sessionName: process.env.ZELLIJ_SESSION_NAME ?? null,
            tabId: tabInfo?.tabId ?? null,
            tabName,
          },
        } : {}),
      },
      macosHelperKeepAliveSeconds: parsePositiveIntEnv("AGENT_NOTIFY_CLICK_SPIKE_KEEP_ALIVE_SECONDS") ?? 120,
    } : {}),
  }

  // 7. Send
  writeDebugLog({
    event: "notification-send-start",
    elapsedMs: elapsedMs(),
    title,
    hasSound: Boolean(sound),
    hasClickTarget: Boolean(payload.clickTarget),
  })

  await sendNotification(payload, config)

  writeDebugLog({ event: "notification-send-end", elapsedMs: elapsedMs() })

  return { sent: true }
}
