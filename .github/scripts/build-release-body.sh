#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-release-body.sh <version> <body-file> <changelog-file>}"
BODY_FILE="${2:?Usage: build-release-body.sh <version> <body-file> <changelog-file>}"
CHANGELOG_FILE="${3:?Usage: build-release-body.sh <version> <body-file> <changelog-file>}"

awk -v ver="$VERSION" '
    $0 ~ "^## \\[" ver "\\]" { flag=1 }
    flag && $0 ~ "^## \\[" && $0 !~ "^## \\[" ver "\\]" { exit }
    flag { print }
' CHANGELOG.md > "$CHANGELOG_FILE"

if [[ ! -s "$CHANGELOG_FILE" ]]; then
    echo "Missing changelog entry for version $VERSION in CHANGELOG.md" >&2
    exit 1
fi

{
    echo "## Changelog"
    echo
    cat "$CHANGELOG_FILE"
    echo
    echo "## Install via Homebrew (macOS)"
    echo
    echo 'Homebrew publishing runs in a separate workflow after this GitHub Release is created.'
    echo
    echo '```sh'
    echo 'brew tap piqusy/tap'
    echo 'brew install agent-notify'
    echo '```'
    echo
    echo 'For exact historical versions, use the standalone assets attached to this release.'
    echo
    echo '## Standalone binaries'
    echo
    echo 'Download the asset matching your OS/CPU from this release:'
    echo
    echo '- macOS: `agent-notify-darwin-arm64.tar.gz`, `agent-notify-darwin-x64.tar.gz`'
    echo '- Linux: `agent-notify-linux-arm64.tar.gz`, `agent-notify-linux-x64.tar.gz`'
    echo '- Windows: `agent-notify-windows-x64.zip`'
    echo
    echo 'Release archives and checksums are attached below.'
} > "$BODY_FILE"
