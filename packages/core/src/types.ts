export type NotifyState = "done" | "question"

export type NotifyBackend = "terminal-notifier" | "osascript" | "notify-send" | "powershell"

export interface QuietHours {
  start: number   // 0–23, inclusive
  end:   number   // 0–23, exclusive
}

export interface SoundConfig {
  done:     string | null   // built-in name, file path, or null (silent)
  question: string | null
}

export interface EventFilter {
  done:     boolean
  question: boolean
}

export interface Config {
  cooldownSeconds: number
  quietHours:      QuietHours
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
  state: NotifyState
  tool: string
  cwd?: string
}
