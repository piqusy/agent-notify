import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { installTargets, uninstallTargets } from "../commands/install.js"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "agent-notify-"))
}

function write(path: string, content: string): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, "utf8")
  return path
}

function createAssets(root: string) {
  return {
    claudeCode: {
      stop: write(join(root, "assets", "claude-code", "stop.sh"), "#!/usr/bin/env bash\n"),
      notification: write(join(root, "assets", "claude-code", "notification.sh"), "#!/usr/bin/env bash\n"),
      permissionRequest: write(join(root, "assets", "claude-code", "permission_request.sh"), "#!/usr/bin/env bash\n"),
    },
    opencode: {
      indexJs: write(join(root, "assets", "opencode", "index.js"), "export default {}\n"),
      indexDts: write(join(root, "assets", "opencode", "index.d.ts"), "export {}\n"),
      packageJson: write(join(root, "assets", "opencode", "package.json"), '{"name":"opencode-agent-notify"}\n'),
    },
    pi: {
      extension: write(join(root, "assets", "pi", "agent-notify.ts"), "export default function () {}\n"),
    },
  }
}

describe("integration installers", () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("installs all integrations into a temp home", () => {
    const root = makeTempDir()
    dirs.push(root)
    const assets = createAssets(root)
    const configPath = join(root, ".config", "agent-notify", "config.json")

    const messages = installTargets("all", { homeDir: root, assets, configPath })

    expect(messages.some((message) => message.includes("Claude Code hooks installed"))).toBe(true)
    expect(messages.some((message) => message.includes("OpenCode plugin installed"))).toBe(true)
    expect(messages.some((message) => message.includes("Pi extension installed"))).toBe(true)

    expect(existsSync(join(root, ".config", "agent-notify", "claude-code", "hooks", "stop.sh"))).toBe(true)
    expect(existsSync(join(root, ".config", "opencode", "plugins", "opencode-agent-notify", "index.js"))).toBe(true)
    expect(existsSync(join(root, ".pi", "agent", "extensions", "agent-notify.ts"))).toBe(true)

    const claudeSettings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    expect(claudeSettings.hooks.Stop[0].hooks[0].command).toContain(".config/agent-notify/claude-code/hooks/stop.sh")

    const opencodeConfig = JSON.parse(readFileSync(join(root, ".config", "opencode", "opencode.json"), "utf8")) as {
      plugin: string[]
    }
    expect(opencodeConfig.plugin).toContain(join(root, ".config", "opencode", "plugins", "opencode-agent-notify", "index.js"))
  })

  it("uninstalls all integrations from a temp home", () => {
    const root = makeTempDir()
    dirs.push(root)
    const assets = createAssets(root)
    const configPath = join(root, ".config", "agent-notify", "config.json")

    installTargets("all", { homeDir: root, assets, configPath })
    const messages = uninstallTargets("all", root)

    expect(messages.some((message) => message.includes("Claude Code hooks removed"))).toBe(true)
    expect(messages.some((message) => message.includes("OpenCode plugin removed"))).toBe(true)
    expect(messages.some((message) => message.includes("Pi extension removed"))).toBe(true)

    expect(existsSync(join(root, ".pi", "agent", "extensions", "agent-notify.ts"))).toBe(false)

    const opencodeConfig = JSON.parse(readFileSync(join(root, ".config", "opencode", "opencode.json"), "utf8")) as {
      plugin: string[]
    }
    expect(opencodeConfig.plugin).toEqual([])

    const claudeSettings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8")) as {
      hooks?: Record<string, unknown>
    }
    expect(claudeSettings.hooks).toEqual({})
  })
})
