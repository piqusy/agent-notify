#!/usr/bin/env bash
set -euo pipefail

: "${VERSION:?VERSION is required}"
: "${ARM64_SHA:?ARM64_SHA is required}"
: "${X64_SHA:?X64_SHA is required}"

VERSION_NO_V="${VERSION#v}"
WORKDIR="$(mktemp -d)"
TAP_REPO="${HOMEBREW_TAP_REPO:-git@github-tap:piqusy/homebrew-tap.git}"
REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
trap 'rm -rf "$WORKDIR"' EXIT

render_formula() {
  local src="$1"
  local dst="$2"
  python3 - "$src" "$dst" "$VERSION_NO_V" "$ARM64_SHA" "$X64_SHA" <<'PY'
from pathlib import Path
import sys

src, dst, version, arm64_sha, x64_sha = sys.argv[1:]
text = Path(src).read_text()
replacements = {
    "HOMEBREW_VERSION_PLACEHOLDER": version,
    "HOMEBREW_ARM64_SHA_PLACEHOLDER": arm64_sha,
    "HOMEBREW_X64_SHA_PLACEHOLDER": x64_sha,
}
for placeholder, value in replacements.items():
    if placeholder not in text:
        raise SystemExit(f"missing placeholder in formula template: {placeholder}")
    text = text.replace(placeholder, value)
Path(dst).write_text(text)
PY
}

clone_tap_repo() {
  : "${HOMEBREW_TAP_DEPLOY_KEY:?HOMEBREW_TAP_DEPLOY_KEY secret is required}"
  : "${HOMEBREW_TAP_KNOWN_HOSTS:?HOMEBREW_TAP_KNOWN_HOSTS secret is required}"

  umask 077
  mkdir -p ~/.ssh
  printf '%s\n' "$HOMEBREW_TAP_DEPLOY_KEY" | tr -d '\r' > ~/.ssh/homebrew_tap_deploy_key
  chmod 600 ~/.ssh/homebrew_tap_deploy_key

  printf '%s\n' "$HOMEBREW_TAP_KNOWN_HOSTS" > ~/.ssh/known_hosts
  chmod 644 ~/.ssh/known_hosts

  cat > ~/.ssh/config <<'EOF'
Host github-tap
  HostName github.com
  User git
  IdentityFile ~/.ssh/homebrew_tap_deploy_key
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/known_hosts
EOF

  git clone "$TAP_REPO" "$WORKDIR"
}

clone_tap_repo
cd "$WORKDIR"
mkdir -p Formula

render_formula "$REPO_ROOT/Formula/agent-notify.rb" "Formula/agent-notify.rb"

shopt -s nullglob
old_versioned_formulas=(Formula/agent-notify@*.rb)
if ((${#old_versioned_formulas[@]} > 0)); then
  git rm -f --ignore-unmatch "${old_versioned_formulas[@]}"
fi
shopt -u nullglob

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add Formula/agent-notify.rb

if git diff --cached --quiet; then
  echo "Homebrew tap already up to date"
  exit 0
fi

git commit -m "update: agent-notify ${VERSION}"
git push origin HEAD:main
