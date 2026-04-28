import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(process.cwd())
const workspacePackagePath = ["package.json"]
const packagePaths = [
  ["cli", "package.json"],
  ["packages", "core", "package.json"],
  ["packages", "opencode", "package.json"],
  ["packages", "claude-code", "package.json"],
]

async function readVersion(parts: string[]): Promise<string> {
  const file = join(root, ...parts)
  const data = JSON.parse(await readFile(file, "utf8")) as { version?: string }
  if (!data.version) throw new Error(`Missing version in ${file}`)
  return data.version
}

async function readCliVersion(): Promise<string> {
  const file = join(root, "cli", "src", "version.ts")
  const source = await readFile(file, "utf8")
  const match = source.match(/CLI_VERSION\s*=\s*"([^"]+)"/)
  if (!match) throw new Error(`Missing CLI_VERSION in ${file}`)
  return match[1]
}

describe("workspace versions", () => {
  it("keeps all package versions aligned with the root workspace version", async () => {
    const workspaceVersion = await readVersion(workspacePackagePath)
    const versions = await Promise.all(packagePaths.map(readVersion))
    expect(versions.every((version) => version === workspaceVersion)).toBe(true)
  })

  it("keeps cli version aligned with the root workspace version", async () => {
    const workspaceVersion = await readVersion(workspacePackagePath)
    const cliVersion = await readCliVersion()
    expect(cliVersion).toBe(workspaceVersion)
  })
})
