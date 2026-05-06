import { notify, isZellijSession, getCurrentTabInfo, markPaneWorking, clearPaneWorking } from "@agent-notify/core"

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

function parseNotifyFlags(args: string[]): { tool: string; rest: string[] } {
  const { value: tool, rest } = parseStringFlag(args, "--tool")
  return { tool: tool ?? "cli", rest }
}

export async function cmdDone(rawArgs: string[]): Promise<void> {
  const { tool, rest } = parseNotifyFlags(rawArgs)
  const dir = rest[0]
  await notify({ state: "done", tool, cwd: dir ?? process.cwd() })
}

export async function cmdQuestion(rawArgs: string[]): Promise<void> {
  const { tool, rest } = parseNotifyFlags(rawArgs)
  const dir = rest[0]
  await notify({ state: "question", tool, cwd: dir ?? process.cwd() })
}

export async function cmdPermission(rawArgs: string[]): Promise<void> {
  const { tool, rest } = parseNotifyFlags(rawArgs)
  const dir = rest[0]
  await notify({ state: "question", trigger: "permission", tool, cwd: dir ?? process.cwd() })
}

function currentZellijOptions() {
  return {
    sessionName: process.env.ZELLIJ_SESSION_NAME ?? null,
    originPaneId: Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10),
  }
}

export async function cmdWorkingStart(): Promise<void> {
  if (!isZellijSession()) return
  const tabInfo = await getCurrentTabInfo()
  if (!tabInfo) return
  markPaneWorking(tabInfo.tabId, tabInfo.tabName, {
    ...currentZellijOptions(),
    visibleTabName: tabInfo.visibleTabName,
  })
}

export async function cmdWorkingStop(): Promise<void> {
  if (!isZellijSession()) return
  const tabInfo = await getCurrentTabInfo()
  if (!tabInfo) return
  clearPaneWorking(tabInfo.tabId, currentZellijOptions())
}

export async function cmdTest(subArgs: string[]): Promise<void> {
  const type = subArgs.find((a) => !a.startsWith("-"))
  const force = subArgs.includes("--force") || subArgs.includes("-f")
  const trigger = type === "permission" ? "permission" : type === "question" ? "question" : "done"
  const state = trigger === "done" ? "done" : "question"
  const uniqueTestCwd = `${process.cwd()}/agent-notify-test-${Date.now()}`
  const result = await notify({ state, ...(trigger !== state ? { trigger } : {}), tool: "test", cwd: uniqueTestCwd, force })

  if (result.sent) {
    console.log(`Sent test notification: ${trigger}${force ? " (forced)" : ""}`)
  } else {
    console.log(`Notification suppressed (${result.reason}). Run "agent-notify doctor" for diagnostics.`)
  }
}
