import { exec } from "node:child_process"
import { promisify } from "node:util"
import {
  findTerminalDescriptorByAppName,
} from "./terminal.js"
import type { ResolvedTerminal } from "./terminal.js"

export {
  KNOWN_TERMINAL_APPS,
  TERMINAL_REGISTRY,
  TERM_PROGRAM_MAP,
  findTerminalDescriptorByAppName,
  resolveTerminal,
  resolveTerminalApp,
} from "./terminal.js"

const execAsync = promisify(exec)

interface FrontmostApplication {
  name: string | null
  bundleId: string | null
}

async function getFrontmostApplication(): Promise<FrontmostApplication | null> {
  try {
    const { stdout: frontStdout } = await execAsync("/usr/bin/lsappinfo front")
    const frontSpecifier = frontStdout.trim()
    if (frontSpecifier) {
      const escapedSpecifier = frontSpecifier.replace(/'/g, "'\\''")
      const { stdout: infoStdout } = await execAsync(
        `/usr/bin/lsappinfo info -only bundleID -only LSDisplayName -app '${escapedSpecifier}'`,
      )

      const bundleIdMatch = infoStdout.match(/"CFBundleIdentifier"="([^"]+)"/)
      const displayNameMatch = infoStdout.match(/"LSDisplayName"="([^"]+)"/)
      const app = {
        name: displayNameMatch?.[1] ?? null,
        bundleId: bundleIdMatch?.[1] ?? null,
      }
      if (app.name || app.bundleId) return app
    }
  } catch {
    // fall through to JXA/AppleScript fallback
  }

  try {
    const { stdout } = await execAsync(
      "osascript -l JavaScript -e 'const se = Application(\"System Events\"); const p = se.applicationProcesses.whose({frontmost: true})(); if (p.length) { console.log(JSON.stringify({ name: p[0].name(), bundleId: p[0].bundleIdentifier() || null })); }'",
    )

    const trimmed = stdout.trim()
    if (!trimmed) return null

    const parsed = JSON.parse(trimmed) as { name?: unknown; bundleId?: unknown }
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      bundleId: typeof parsed.bundleId === "string" ? parsed.bundleId : null,
    }
  } catch {
    try {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      )
      const name = stdout.trim()
      return name ? { name, bundleId: null } : null
    } catch {
      return null
    }
  }
}

/**
 * Returns true if the given terminal app is currently frontmost on macOS.
 * Returns false on non-macOS or on any error (safe default = notify).
 *
 * When a canonical terminal bundle id is known, compare by bundle id first.
 * Fall back to a case-insensitive app-name match when bundle ids are unavailable.
 */
export async function isTerminalFocused(terminal: string | ResolvedTerminal): Promise<boolean> {
  if (process.platform !== "darwin") return false

  const resolved = typeof terminal === "string"
    ? (() => {
        const descriptor = findTerminalDescriptorByAppName(terminal)
        return descriptor
          ? {
              id: descriptor.id,
              displayName: descriptor.displayName,
              bundleId: descriptor.bundleIds?.[0] ?? null,
              source: "config-override" as const,
              reason: "manual terminal name",
            }
          : null
      })()
    : terminal

  const frontmost = await getFrontmostApplication()
  if (!frontmost) return false

  if (resolved?.bundleId && frontmost.bundleId) {
    return frontmost.bundleId.toLowerCase() === resolved.bundleId.toLowerCase()
  }

  const expectedName = resolved?.displayName ?? (typeof terminal === "string" ? terminal : terminal.displayName)
  const frontmostName = frontmost.name ?? ""
  return frontmostName.trim().toLowerCase() === expectedName.trim().toLowerCase()
}
