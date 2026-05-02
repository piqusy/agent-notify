# Contributing

## Local Work

- Use `bun install` to install dependencies.
- Run `bun run build` and `bun run test` before opening a PR.
- Keep changes small and focused.

## Release Procedure

Releases are tag-driven. Push a `v*` tag to start the GitHub Actions release workflow.

1. Update `CHANGELOG.md` with a new top entry for the release version.
1. Keep the top heading in this format: `## [x.y.z] — YYYY-MM-DD`.
1. Make sure the entry has at least one section heading such as `### Fixed` or `### Added`.
1. Commit the release bump, then create or move the tag to that commit, for example `v0.1.27`.
1. Push the branch and the tag.

## What Release CI Does

- Builds macOS binaries for `arm64` and `x64`.
- Creates release tarballs and checksums.
- Updates Homebrew formula placeholders.
- Publishes a GitHub Release.
- Updates the tap with versioned formula files.

## Notes

- GitHub Actions in workflows must stay pinned to full commit SHAs, not floating tags like `@v6`.
- When updating an action, move to a newer SHA pin and prefer releases that target the current supported GitHub Actions runtime.
- Do not rely on release-day dates in CI checks; changelog validation only needs the version prefix.
- If you change release flow, update this file at the same time.
