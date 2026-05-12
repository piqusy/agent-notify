import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

type TextBlock = {
  type?: string
  text?: string
}

type AssistantMessageLike = {
  role?: string
  content?: string | TextBlock[]
  stopReason?: string
  errorMessage?: string
}

function getLastAssistantMessage(messages: unknown): AssistantMessageLike | undefined {
  if (!Array.isArray(messages)) return undefined

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as AssistantMessageLike | undefined
    if (message?.role === "assistant") {
      return message
    }
  }

  return undefined
}

function extractAssistantText(message: AssistantMessageLike | undefined): string {
  if (!message) return ""

  if (typeof message.content === "string") {
    return message.content.trim()
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim()
  }

  return ""
}

export function classifyPiAgentState(messages: unknown): "done" | "question" | null {
  const assistantMessage = getLastAssistantMessage(messages)
  if (!assistantMessage) return null

  if (assistantMessage.stopReason === "aborted" || assistantMessage.stopReason === "error" || assistantMessage.errorMessage) {
    return null
  }

  const text = extractAssistantText(assistantMessage)
  if (!text) return null

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const lastLine = lines.at(-1) ?? text.trim()

  return /\?\s*$/.test(lastLine) ? "question" : "done"
}

function writeDebugLog(payload: unknown): void {
  const path = process.env.AGENT_NOTIFY_PI_DEBUG_LOG?.trim()
  if (!path) return

  try {
    writeFileSync(path, `${JSON.stringify(payload)}\n`, { encoding: "utf8", flag: "a" })
  } catch {
    // Never crash Pi if debug logging fails.
  }
}

function runAgentNotify(args: string[]): void {
  try {
    const child = spawn(
      "agent-notify",
      args,
      {
        stdio: "ignore",
        detached: process.platform !== "win32",
      },
    )

    child.on("error", () => undefined)
    child.unref()
  } catch {
    // Never crash Pi if agent-notify is unavailable.
  }
}

function sendNotification(state: "done" | "question", cwd: string): void {
  runAgentNotify([state, cwd, "--tool", "pi-coding-agent"])
}

function markWorkingStart(): void {
  runAgentNotify(["working-start"])
}

function markWorkingStop(): void {
  runAgentNotify(["working-stop"])
}

function hasArgFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function shouldEmitForContext(ctx: { hasUI?: boolean } | undefined): boolean {
  // Pi subagents commonly run as separate `pi --mode json -p --no-session` child
  // processes. Those child runs do not represent user-visible top-level turns, so
  // suppress both working-state updates and completion notifications there.
  if (ctx?.hasUI === false && getArgValue("--mode") === "json" && hasArgFlag("--no-session")) {
    return false
  }

  return true
}

export default function agentNotify(pi: ExtensionAPI) {
  pi.on("agent_start", async (_event, ctx) => {
    if (!shouldEmitForContext(ctx)) return
    markWorkingStart()
  })

  pi.on("agent_end", async (event, ctx) => {
    const shouldEmit = shouldEmitForContext(ctx)
    const state = shouldEmit ? classifyPiAgentState(event.messages) : null

    writeDebugLog({
      timestamp: Date.now(),
      cwd: ctx.cwd,
      hasUI: ctx.hasUI,
      shouldEmit,
      classifiedState: state,
      argv: process.argv.slice(2),
      messages: event.messages,
    })

    if (!shouldEmit) return

    // agent-notify done/question already clears working state before sending.
    // Avoid separate detached working-stop process here to reduce end-of-run lag
    // and remove ordering races between tab rename + notification delivery.
    if (!state) {
      markWorkingStop()
      return
    }

    sendNotification(state, ctx.cwd)
  })
}
