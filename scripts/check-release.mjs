#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const repoRoot = resolve(process.env.REPO_ROOT?.trim() || process.argv[2] || process.cwd())

const packageFiles = [
  "cli/package.json",
  "packages/core/package.json",
  "packages/opencode/package.json",
  "packages/claude-code/package.json",
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8")
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function readCliVersion() {
  const source = readText("cli/src/version.ts")
  const match = source.match(/CLI_VERSION\s*=\s*"([^"]+)"/)

  if (!match) {
    fail("Could not parse CLI version from cli/src/version.ts")
  }

  return match[1]
}

function readTopChangelogEntry() {
  const changelog = readText("CHANGELOG.md")
  const lines = changelog.split(/\r?\n/)
  const topEntry = lines.find((line) => /^## \[/.test(line))

  if (!topEntry) {
    fail("CHANGELOG.md is missing a version heading")
  }

  return { lines, topEntry }
}

function ensureTopEntryHasSection(lines, topEntry) {
  let inTopEntry = false

  for (const line of lines) {
    if (line === topEntry) {
      inTopEntry = true
      continue
    }

    if (!inTopEntry) continue
    if (/^## \[/.test(line)) break
    if (/^### /.test(line)) return
  }

  fail(`Top changelog entry is missing a section heading: ${topEntry}`)
}

function ensureFormulaTemplatePlaceholders() {
  const formula = readText("Formula/agent-notify.rb")

  for (const placeholder of [
    "HOMEBREW_VERSION_PLACEHOLDER",
    "HOMEBREW_ARM64_SHA_PLACEHOLDER",
    "HOMEBREW_X64_SHA_PLACEHOLDER",
  ]) {
    if (!formula.includes(placeholder)) {
      fail(`Formula/agent-notify.rb is missing placeholder: ${placeholder}`)
    }
  }
}

const packageVersions = packageFiles.map((file) => ({
  file,
  version: readJson(file).version,
}))

const uniquePackageVersions = [...new Set(packageVersions.map(({ version }) => version))]
if (uniquePackageVersions.length !== 1) {
  fail(`Package versions do not match: ${packageVersions.map(({ file, version }) => `${file}=${version}`).join(", ")}`)
}

const version = uniquePackageVersions[0]
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`Package version must match MAJOR.MINOR.PATCH: ${version}`)
}

const cliVersion = readCliVersion()
if (cliVersion !== version) {
  fail(`cli/src/version.ts (${cliVersion}) does not match package versions (${version})`)
}

const releaseTag = process.env.RELEASE_TAG?.trim()
if (releaseTag) {
  if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
    fail(`RELEASE_TAG must match vMAJOR.MINOR.PATCH: ${releaseTag}`)
  }

  if (releaseTag !== `v${version}`) {
    fail(`RELEASE_TAG ${releaseTag} does not match source version v${version}`)
  }
}

const { lines, topEntry } = readTopChangelogEntry()
if (!topEntry.startsWith(`## [${version}] — `)) {
  fail(`CHANGELOG.md top entry does not match version ${version}: ${topEntry}`)
}

ensureTopEntryHasSection(lines, topEntry)
ensureFormulaTemplatePlaceholders()

console.log(`release checks passed for ${version} in ${repoRoot}`)
