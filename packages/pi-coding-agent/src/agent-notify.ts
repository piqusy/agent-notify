import { spawn } from "node:child_process"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

type TextBlock = {
  type?: string
  text?: string
}

type AssistantMessageLike = {
  role?: string
  content?: string | TextBlock[]
}

function extractLastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return ""

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as AssistantMessageLike | undefined
    if (message?.role !== "assistant") continue

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
  }

  return ""
}

export function classifyPiAgentState(messages: unknown): "done" | "question" {
  const text = extractLastAssistantText(messages)
  if (!text) return "done"

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const lastLine = lines.at(-1) ?? text.trim()

  return /\?\s*$/.test(lastLine) ? "question" : "done"
}

function sendNotification(state: "done" | "question", cwd: string): void {
  try {
    const child = spawn(
      "agent-notify",
      [state, cwd, "--tool", "pi-coding-agent"],
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

export default function agentNotify(pi: ExtensionAPI) {
  pi.on("agent_end", async (event, ctx) => {
    sendNotification(classifyPiAgentState(event.messages), ctx.cwd)
  })
}
