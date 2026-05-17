#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { execSync } from "node:child_process"

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: bun run bump <MAJOR.MINOR.PATCH>")
  process.exit(1)
}

const repoRoot = resolve(process.cwd())
const rootPackagePath = join(repoRoot, "package.json")
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"))
rootPackage.version = version
writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8")

execSync("bun run sync:version", { stdio: "inherit" })

execSync(`git add package.json cli/package.json packages/core/package.json packages/opencode/package.json packages/claude-code/package.json cli/src/version.ts`, { stdio: "inherit" })
execSync(`git commit -m "chore(release): bump to ${version}"`, { stdio: "inherit" })
execSync(`git tag v${version}`, { stdio: "inherit" })

const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8")
if (!changelog.includes(`## [${version}]`)) {
  console.warn(`\n⚠  CHANGELOG.md has no entry for [${version}] — add one before pushing or the release check will fail.`)
}

console.log(`\nBumped to ${version}. Push with:\n  git push origin main && git push origin v${version}`)
