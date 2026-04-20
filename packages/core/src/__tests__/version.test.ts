import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(process.cwd())
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

describe("workspace versions", () => {
  it("keeps all package versions aligned", async () => {
    const versions = await Promise.all(packagePaths.map(readVersion))
    expect(new Set(versions).size).toBe(1)
    expect(versions[0]).toBe("0.1.24")
  })
})
