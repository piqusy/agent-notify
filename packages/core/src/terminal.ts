import { execFileSync } from "node:child_process"
import { basename } from "node:path"

export type TerminalDetectionSource =
  | "config-override"
  | "env-override"
  | "env"
  | "term-program"
  | "process-tree"

export interface TerminalEnvMatcher {
  reason: string
  match: (env: NodeJS.ProcessEnv) => boolean
}

export interface TerminalDescriptor {
  id: string
  displayName: string
  processNames: string[]
  bundleIds?: string[]
  termPrograms?: string[]
  envMatchers?: TerminalEnvMatcher[]
}

export interface ResolvedTerminal {
  id: string | null
  displayName: string
  bundleId: string | null
  source: TerminalDetectionSource
  reason: string
}

export interface ResolveTerminalOptions {
  configOverride?: string | null
  env?: NodeJS.ProcessEnv
  termProgram?: string
  platform?: NodeJS.Platform
  parentPid?: number
}

function hasEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim())
}

function termEquals(env: NodeJS.ProcessEnv, value: string): boolean {
  return (env.TERM ?? "").trim().toLowerCase() === value.toLowerCase()
}

export const TERMINAL_REGISTRY: TerminalDescriptor[] = [
  {
    id: "ghostty",
    displayName: "Ghostty",
    processNames: ["ghostty", "Ghostty"],
    bundleIds: ["com.mitchellh.ghostty"],
    termPrograms: ["ghostty"],
  },
  {
    id: "iterm2",
    displayName: "iTerm2",
    processNames: ["iTerm2"],
    bundleIds: ["com.googlecode.iterm2"],
    termPrograms: ["iTerm.app"],
  },
  {
    id: "apple-terminal",
    displayName: "Terminal",
    processNames: ["Terminal"],
    bundleIds: ["com.apple.Terminal"],
    termPrograms: ["Apple_Terminal"],
  },
  {
    id: "warp",
    displayName: "Warp",
    processNames: ["Warp"],
    bundleIds: ["dev.warp.Warp-Stable", "dev.warp.Warp"],
    termPrograms: ["WarpTerminal"],
  },
  {
    id: "kitty",
    displayName: "kitty",
    processNames: ["kitty"],
    bundleIds: ["net.kovidgoyal.kitty"],
    termPrograms: ["kitty"],
    envMatchers: [
      { reason: "KITTY_WINDOW_ID", match: (env) => hasEnv(env, "KITTY_WINDOW_ID") },
      { reason: "KITTY_LISTEN_ON", match: (env) => hasEnv(env, "KITTY_LISTEN_ON") },
      { reason: "TERM=xterm-kitty", match: (env) => termEquals(env, "xterm-kitty") },
    ],
  },
  {
    id: "wezterm",
    displayName: "WezTerm",
    processNames: ["wezterm-gui", "WezTerm"],
    bundleIds: ["com.github.wez.wezterm"],
    termPrograms: ["WezTerm"],
    envMatchers: [
      { reason: "WEZTERM_EXECUTABLE", match: (env) => hasEnv(env, "WEZTERM_EXECUTABLE") },
    ],
  },
  {
    id: "hyper",
    displayName: "Hyper",
    processNames: ["Hyper"],
    bundleIds: ["co.zeit.hyper"],
    termPrograms: ["Hyper"],
  },
  {
    id: "alacritty",
    displayName: "Alacritty",
    processNames: ["alacritty", "Alacritty"],
    bundleIds: ["org.alacritty"],
    termPrograms: ["alacritty"],
    envMatchers: [
      { reason: "ALACRITTY_WINDOW_ID", match: (env) => hasEnv(env, "ALACRITTY_WINDOW_ID") },
    ],
  },
  {
    id: "vscode",
    displayName: "Visual Studio Code",
    processNames: ["Code", "Code - Insiders"],
    bundleIds: ["com.microsoft.VSCode", "com.microsoft.VSCodeInsiders"],
    termPrograms: ["vscode"],
  },
  {
    id: "gnome-terminal",
    displayName: "GNOME Terminal",
    processNames: ["gnome-terminal-server", "gnome-terminal"],
    envMatchers: [
      { reason: "GNOME_TERMINAL_SERVICE", match: (env) => hasEnv(env, "GNOME_TERMINAL_SERVICE") },
      { reason: "GNOME_TERMINAL_SCREEN", match: (env) => hasEnv(env, "GNOME_TERMINAL_SCREEN") },
    ],
  },
  {
    id: "konsole",
    displayName: "Konsole",
    processNames: ["konsole"],
    envMatchers: [
      { reason: "KONSOLE_VERSION", match: (env) => hasEnv(env, "KONSOLE_VERSION") },
      { reason: "KONSOLE_DBUS_SERVICE", match: (env) => hasEnv(env, "KONSOLE_DBUS_SERVICE") },
    ],
  },
  {
    id: "foot",
    displayName: "foot",
    processNames: ["foot", "footclient"],
    envMatchers: [
      { reason: "FOOT_CLIENT_PID", match: (env) => hasEnv(env, "FOOT_CLIENT_PID") },
      { reason: "FOOT_SERVER_PID", match: (env) => hasEnv(env, "FOOT_SERVER_PID") },
      { reason: "TERM starts with foot", match: (env) => (env.TERM ?? "").trim().toLowerCase().startsWith("foot") },
    ],
  },
  {
    id: "rio",
    displayName: "Rio",
    processNames: ["rio", "Rio"],
    termPrograms: ["Rio", "rio"],
  },
  {
    id: "tabby",
    displayName: "Tabby",
    processNames: ["Tabby", "tabby"],
    termPrograms: ["Tabby", "tabby"],
  },
]

export const TERM_PROGRAM_MAP: Record<string, string> = Object.freeze(
  Object.fromEntries(
    TERMINAL_REGISTRY.flatMap((descriptor) =>
      (descriptor.termPrograms ?? []).map((termProgram) => [termProgram, descriptor.displayName] as const),
    ),
  ),
)

export const KNOWN_TERMINAL_APPS: readonly string[] = Object.freeze(
  Array.from(new Set(TERMINAL_REGISTRY.map((descriptor) => descriptor.displayName))),
)

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function descriptorBundleId(descriptor: TerminalDescriptor): string | null {
  return descriptor.bundleIds?.[0] ?? null
}

function resolveDescriptor(descriptor: TerminalDescriptor, source: TerminalDetectionSource, reason: string): ResolvedTerminal {
  return {
    id: descriptor.id,
    displayName: descriptor.displayName,
    bundleId: descriptorBundleId(descriptor),
    source,
    reason,
  }
}

export function findTerminalDescriptorByAppName(value: string): TerminalDescriptor | null {
  const normalized = normalize(value)
  if (!normalized) return null

  return TERMINAL_REGISTRY.find((descriptor) => [
    descriptor.id,
    descriptor.displayName,
    ...(descriptor.processNames ?? []),
    ...(descriptor.termPrograms ?? []),
    ...(descriptor.bundleIds ?? []),
  ].some((candidate) => normalize(candidate) === normalized)) ?? null
}

function resolveExplicitTerminal(value: string, source: "config-override" | "env-override", reason: string): ResolvedTerminal | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const descriptor = findTerminalDescriptorByAppName(trimmed)
  if (descriptor) return resolveDescriptor(descriptor, source, reason)

  return {
    id: null,
    displayName: trimmed,
    bundleId: null,
    source,
    reason,
  }
}

function resolveTerminalFromEnv(env: NodeJS.ProcessEnv): ResolvedTerminal | null {
  for (const descriptor of TERMINAL_REGISTRY) {
    for (const matcher of descriptor.envMatchers ?? []) {
      if (matcher.match(env)) {
        return resolveDescriptor(descriptor, "env", matcher.reason)
      }
    }
  }

  return null
}

function resolveTerminalFromTermProgram(termProgram: string): ResolvedTerminal | null {
  const normalizedTermProgram = normalize(termProgram)
  if (!normalizedTermProgram) return null

  const descriptor = TERMINAL_REGISTRY.find((candidate) =>
    (candidate.termPrograms ?? []).some((value) => normalize(value) === normalizedTermProgram),
  )

  if (!descriptor) return null
  return resolveDescriptor(descriptor, "term-program", `TERM_PROGRAM=${termProgram.trim()}`)
}

interface ProcessEntry {
  ppid: number
  command: string
}

function readParentProcess(pid: number): ProcessEntry | null {
  if (!Number.isFinite(pid) || pid <= 1) return null

  try {
    const output = execFileSync("ps", ["-p", String(pid), "-o", "ppid=", "-o", "comm="], {
      encoding: "utf8",
      timeout: 1500,
    }).trim()

    const match = output.match(/^(\d+)\s+(.+)$/)
    if (!match) return null

    return {
      ppid: Number.parseInt(match[1], 10),
      command: match[2].trim(),
    }
  } catch {
    return null
  }
}

function resolveTerminalFromProcessTree(parentPid: number): ResolvedTerminal | null {
  const seen = new Set<number>()
  let currentPid = parentPid

  while (Number.isFinite(currentPid) && currentPid > 1 && !seen.has(currentPid)) {
    seen.add(currentPid)
    const entry = readParentProcess(currentPid)
    if (!entry) return null

    const command = basename(entry.command).trim()
    const normalizedCommand = normalize(command)
    const descriptor = TERMINAL_REGISTRY.find((candidate) =>
      candidate.processNames.some((processName) => normalize(processName) === normalizedCommand),
    )

    if (descriptor) {
      return resolveDescriptor(descriptor, "process-tree", `parent process=${command}`)
    }

    currentPid = entry.ppid
  }

  return null
}

export function resolveTerminal(options: ResolveTerminalOptions = {}): ResolvedTerminal | null {
  const env = options.env ?? process.env
  const termProgram = options.termProgram ?? env.TERM_PROGRAM ?? ""
  const platform = options.platform ?? process.platform
  const parentPid = options.parentPid ?? process.ppid

  if (options.configOverride) {
    const resolved = resolveExplicitTerminal(options.configOverride, "config-override", "config.terminalApp")
    if (resolved) return resolved
  }

  if (env.AGENT_NOTIFY_TERMINAL?.trim()) {
    const resolved = resolveExplicitTerminal(env.AGENT_NOTIFY_TERMINAL, "env-override", "AGENT_NOTIFY_TERMINAL")
    if (resolved) return resolved
  }

  const envResolved = resolveTerminalFromEnv(env)
  if (envResolved) return envResolved

  const termProgramResolved = resolveTerminalFromTermProgram(termProgram)
  if (termProgramResolved) return termProgramResolved

  if (platform === "darwin") {
    const processResolved = resolveTerminalFromProcessTree(parentPid)
    if (processResolved) return processResolved
  }

  return null
}

/**
 * Resolve the display name of the user's terminal app.
 * Priority: config override/env override → strong env markers → TERM_PROGRAM → macOS process tree → null.
 */
export function resolveTerminalApp(termProgram: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveTerminal({ env, termProgram })?.displayName ?? null
}
