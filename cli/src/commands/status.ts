import { inspectStatus } from "@agent-notify/core"

function parseStringFlag(args: string[], flag: string): { value?: string; rest: string[] } {
  const idx = args.indexOf(flag)
  if (idx !== -1 && args[idx + 1]) {
    return {
      value: args[idx + 1],
      rest: args.filter((_, i) => i !== idx && i !== idx + 1),
    }
  }
  return { rest: args }
}

function line(label: string, detail: string): void {
  const pad = " ".repeat(Math.max(1, 18 - label.length))
  console.log(`  ${label}${pad}${detail}`)
}

function formatConfigStatus(status: string): string {
  if (status === "ok") return "OK"
  if (status === "missing") return "Missing — using defaults"
  if (status === "invalid-json") return "Invalid JSON — using defaults"
  return "Invalid settings — partial defaults applied"
}

function formatFocus(detail: Awaited<ReturnType<typeof inspectStatus>>["focus"]): string {
  if (detail.terminalApp === null) {
    return "Skipped — terminal app could not be detected"
  }

  if (!detail.terminalFocused) {
    return `${detail.terminalApp} is not frontmost`
  }

  if (!detail.zellijSession) {
    return `${detail.terminalApp} is frontmost — notifications would be suppressed`
  }

  if (detail.activeTabVisible) {
    return `${detail.terminalApp} is frontmost and this Zellij tab is visible — notifications would be suppressed`
  }

  return `${detail.terminalApp} is frontmost, but a different Zellij tab is visible — notifications would still send`
}

function formatEvent(label: string, detail: { enabled: boolean; wouldSend: boolean; reason?: string }): string {
  if (!detail.enabled) return `${label}: disabled`
  if (detail.wouldSend) return `${label}: would send`
  return `${label}: suppressed (${detail.reason})`
}

export async function cmdStatus(rawArgs: string[]): Promise<void> {
  const { value: tool } = parseStringFlag(rawArgs, "--tool")
  const status = await inspectStatus({ tool: tool ?? "cli" })

  console.log("agent-notify status")
  console.log("===================\n")

  line("Config", `${status.configPath} — ${formatConfigStatus(status.configStatus)}`)
  for (const problem of status.configIssues) {
    console.log(`                    - ${problem.path}: ${problem.message}`)
  }

  line("Backend", status.backend ?? `Unsupported platform (${process.platform})`)
  line("Terminal", status.focus.terminalApp ?? "Auto-detect unavailable")
  line("Focus", formatFocus(status.focus))
  line(
    "Quiet hours",
    !status.quietHours.configured
      ? "Disabled"
      : status.quietHours.active
        ? "Active — sounds muted"
        : "Inactive",
  )
  line(
    "Cooldown",
    status.cooldown.active
      ? `Active for tool "${status.cooldown.tool}" — ${status.cooldown.remainingSeconds}s remaining`
      : `Inactive for tool "${status.cooldown.tool}"`,
  )
  line("Events", [
    formatEvent("done", status.events.done),
    formatEvent("question", status.events.question),
    formatEvent("permission", status.events.permission),
  ].join(" | "))

  console.log("")
}

export async function cmdExplain(rawArgs: string[]): Promise<void> {
  await cmdStatus(rawArgs)
}
