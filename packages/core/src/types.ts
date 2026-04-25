export type NotifyState = "done" | "question"

export type NotifyBackend = "macos-helper" | "osascript" | "notify-send" | "powershell"

export interface QuietHours {
  start: number   // 0–23, inclusive
  end:   number   // 0–23, exclusive
}

export interface SoundConfig {
  done:       string | null   // built-in name, file path, or null (silent)
  question:   string | null
  permission: string | null   // null = same as question
}

export interface EventFilter {
  done:       boolean
  question:   boolean
  permission: boolean
}

export interface Config {
  cooldownSeconds: number
  quietHours:      QuietHours | null   // null = quiet hours disabled entirely
  sounds:          SoundConfig
  events:          EventFilter
  terminalApp:     string | null   // null = auto-detect via TERM_PROGRAM
  backend:         NotifyBackend | null   // null = auto-detect
}

export interface NotifyPayload {
  title: string
  body:  string
  sound?: string
}

export interface NotifyInput {
  state:            NotifyState
  trigger?:         "done" | "question" | "permission"  // if omitted, falls back to state
  tool:             string
  cwd?:             string
  skipFocusCheck?:  boolean   // when true, bypasses the terminal-focused suppression
  force?:           boolean   // when true, bypasses focus AND cooldown checks
}

export type NotifySkipReason =
  | "event-disabled"
  | "terminal-focused"
  | "cooldown"

export interface NotifyResult {
  sent:    boolean
  reason?: NotifySkipReason
}
