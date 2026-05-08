import { getCurrentTabInfo, isZellijSession, markPaneWorking, notify } from "@agent-notify/core"

type Session = {
  id: string
  parentID?: string
  cwd?: string
}

type EventPayload = {
  session?: Session
}

type OpenCodePluginEvent = {
  type: string
  session?: Session
}

type OpenCodeSessionClient = {
  session?: {
    get?: (input: { path: { id: string } }) => Promise<{ data?: Session | null } | null>
  }
}

type OpenCodePluginInput = {
  client?: OpenCodeSessionClient
}

type OpenCodeChatMessageInput = {
  sessionID: string
}

type OpenCodePlugin = (input?: OpenCodePluginInput) => Promise<{
  event: (payload: { event: OpenCodePluginEvent }) => Promise<void>
  "chat.message": (input: OpenCodeChatMessageInput, output: { message: unknown; parts: unknown[] }) => Promise<void>
}>

function currentZellijOptions() {
  return {
    sessionName: process.env.ZELLIJ_SESSION_NAME ?? null,
    originPaneId: Number.parseInt(process.env.ZELLIJ_PANE_ID ?? "", 10),
  }
}

async function markWorkingStart(): Promise<void> {
  if (!isZellijSession()) return

  const tabInfo = await getCurrentTabInfo()
  if (!tabInfo) return

  markPaneWorking(tabInfo.tabId, tabInfo.tabName, {
    ...currentZellijOptions(),
    visibleTabName: tabInfo.visibleTabName,
  })
}

async function isPrimarySession(sessionID: string, client: OpenCodeSessionClient | undefined, knownPrimarySessions: Map<string, boolean>): Promise<boolean> {
  const cached = knownPrimarySessions.get(sessionID)
  if (cached !== undefined) return cached

  if (!client?.session?.get) return true

  try {
    const response = await client.session.get({ path: { id: sessionID } })
    const primary = !response?.data?.parentID
    knownPrimarySessions.set(sessionID, primary)
    return primary
  } catch {
    return true
  }
}

async function handleSessionDone(event: EventPayload): Promise<void> {
  if (event.session?.parentID) return

  await notify({
    state: "done",
    tool: "opencode",
    cwd: event.session?.cwd,
  })
}

async function handlePermission(event: EventPayload): Promise<void> {
  if (event.session?.parentID) return

  await notify({
    state: "question",
    trigger: "permission",
    tool: "opencode",
    cwd: event.session?.cwd,
  })
}

export const OpenCodeAgentNotify: OpenCodePlugin = async (input = {}) => {
  const knownPrimarySessions = new Map<string, boolean>()

  return {
    event: async ({ event }) => {
      try {
        // OpenCode's session.idle fires too early for our use case: root sessions can idle
        // while child sessions keep working, which clears the working indicator prematurely.
        // session.responseReady tracks the user-visible end of the response more reliably.
        if (event.type === "session.responseReady" || event.type === "session.error") {
          await handleSessionDone(event as EventPayload)
        }

        if (event.type === "permission.asked") {
          await handlePermission(event as EventPayload)
        }
      } catch {
        // Never crash OpenCode
      }
    },
    "chat.message": async ({ sessionID }) => {
      try {
        // OpenCode's current plugin API gives us prompt-submitted timing here, not a true
        // model-start event. This still maps well to a best-effort working indicator.
        if (!(await isPrimarySession(sessionID, input.client, knownPrimarySessions))) return
        await markWorkingStart()
      } catch {
        // Never crash OpenCode
      }
    },
  }
}

export default OpenCodeAgentNotify

export const plugin = OpenCodeAgentNotify
