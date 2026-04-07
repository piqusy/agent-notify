import { notify } from "@agent-notify/core";

// OpenCode plugin — handles agent session lifecycle events

type Session = {
  id: string;
  parentID?: string;
  cwd?: string;
};

type PermissionEvent = {
  session?: Session;
};

type SessionEvent = {
  session?: Session;
};

async function handleSessionDone(event: SessionEvent): Promise<void> {
  try {
    // Skip subagent sessions
    if (event.session?.parentID) return;
    await notify({
      state: "done",
      tool: "opencode",
      cwd: event.session?.cwd,
    });
  } catch {
    // Never crash OpenCode
  }
}

async function handleQuestion(event: PermissionEvent): Promise<void> {
  try {
    if (event.session?.parentID) return;
    await notify({
      state: "question",
      tool: "opencode",
      cwd: event.session?.cwd,
    });
  } catch {
    // Never crash OpenCode
  }
}

export default {
  "session.idle": handleSessionDone,
  "session.error": handleSessionDone,
  "permission.updated": handleQuestion,
};
