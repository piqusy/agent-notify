export type NotifyState = "done" | "question"
export type NotifyTrigger = NotifyState | "permission"

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

export interface ZellijTabIndicatorConfig {
  enabled: boolean
  prefix: string
}

export interface ZellijPaneIndicatorConfig {
  enabled: boolean
  mode: "background"
  bg: string | null
  clearOn: "origin-pane-focus"
}

export interface ZellijConfig {
  tabIndicator: ZellijTabIndicatorConfig
  paneIndicator: ZellijPaneIndicatorConfig
}

export interface ClickRestoreConfig {
  enabled: boolean
}

export interface Config {
  cooldownSeconds: number
  quietHours:      QuietHours | null   // null = quiet hours disabled entirely
  sounds:          SoundConfig
  events:          EventFilter
  terminalApp:     string | null   // null = auto-detect via TERM_PROGRAM
  backend:         NotifyBackend | null   // null = auto-detect
  clickRestore:    ClickRestoreConfig
  zellij:          ZellijConfig
}

export interface NotificationClickTerminalTarget {
  id?: string | null
  displayName?: string | null
  bundleId?: string | null
}

export interface NotificationClickTarget {
  issuedAt?: number
  terminalApp?: string | null
  terminal?: NotificationClickTerminalTarget
  zellij?: {
    sessionName?: string | null
    tabId?: number | null
    tabName?: string | null
  }
}

export interface NotifyPayload {
  title: string
  body:  string
  sound?: string
  clickTarget?: NotificationClickTarget
  macosHelperKeepAliveSeconds?: number
}

export interface NotifyInput {
  state:            NotifyState
  trigger?:         NotifyTrigger  // if omitted, falls back to state
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
