#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const repoRoot = resolve(process.cwd())
const rootPackagePath = join(repoRoot, "package.json")
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"))
const version = rootPackage.version

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error(`Root package version must match MAJOR.MINOR.PATCH: ${version ?? "(missing)"}`)
  process.exit(1)
}

const packageFiles = [
  "cli/package.json",
  "packages/core/package.json",
  "packages/opencode/package.json",
  "packages/claude-code/package.json",
]

for (const file of packageFiles) {
  const path = join(repoRoot, file)
  const json = JSON.parse(readFileSync(path, "utf8"))
  json.version = version
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, "utf8")
}

const cliVersionPath = join(repoRoot, "cli", "src", "version.ts")
writeFileSync(
  cliVersionPath,
  `// Generated from the workspace root package.json by \`bun run sync:version\`.\nexport const CLI_VERSION = \"${version}\"\n`,
  "utf8",
)

console.log(`Synced workspace package versions to ${version}`)
