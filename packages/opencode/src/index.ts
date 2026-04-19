import { notify } from "@agent-notify/core"

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

type OpenCodePlugin = () => Promise<{
  event: (payload: { event: OpenCodePluginEvent }) => Promise<void>
}>

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

export const OpenCodeAgentNotify: OpenCodePlugin = async () => {
  return {
    event: async ({ event }) => {
      try {
        if (event.type === "session.idle" || event.type === "session.error") {
          await handleSessionDone(event as EventPayload)
        }

        if (event.type === "permission.asked") {
          await handlePermission(event as EventPayload)
        }
      } catch {
        // Never crash OpenCode
      }
    },
  }
}

export default OpenCodeAgentNotify

export const plugin = OpenCodeAgentNotify
