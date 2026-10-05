#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]]; then
  echo 'BrickCircle requires Node 22 in this workspace.' >&2
  exit 1
fi
npm ci
npm install --global --prefix "$HOME/.local" @opencode/cli@2.0.20
npm run typecheck
npm run release:check
"$HOME/.local/bin/opencode" --version
printf '\nWorkspace dependencies are ready. Start OpenCode with: opencode\n'
