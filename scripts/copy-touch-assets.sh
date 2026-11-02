#!/usr/bin/env bash
# Ships the touch interface with the compiled server: copies
# examples/cncjs-touch/touch to <output root>/touch (dist/cncjs/touch or
# output/cncjs/touch) and writes <output root>/touch/VERSION.json there, in the
# format read by touch/tablet-actions.js ({commit, branch, repo, deployedAt},
# plus the package version and the build date). The server resolves this
# directory first (src/server/config/settings.base.js, findTouchAssets), so a
# packaged install (`npm pack`, Docker, electron-builder) serves /touch/ without
# the examples directory. A deployment script may overwrite VERSION.json with
# its own values; the build's file is only the default.
#
#   bash scripts/copy-touch-assets.sh dist/cncjs
#
# Called by build-prod.sh, build-latest.sh and build-dev.sh. Works with bash on
# Linux/macOS and with Git Bash on Windows (relative paths only: an MSYS
# absolute path would be rewritten before reaching Node).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?usage: copy-touch-assets.sh <output root, e.g. dist/cncjs>}"
SOURCE="examples/cncjs-touch/touch"

cd "$ROOT"
[ -f "$SOURCE/index.html" ] || { echo "copy-touch-assets: $SOURCE/index.html is missing" >&2; exit 1; }
mkdir -p "$TARGET"
rm -rf "$TARGET/touch"
cp -af "$SOURCE" "$TARGET/touch"

# Git metadata is optional (a build from an exported tarball has none): the
# page then shows the interface version as unknown, and the file still records
# the package version and the build date.
COMMIT="$(git rev-parse HEAD 2>/dev/null || true)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then BRANCH="${GITHUB_REF_NAME:-}"; fi
REMOTE="$(git remote get-url origin 2>/dev/null || true)"

TOUCH_COMMIT="$COMMIT" TOUCH_BRANCH="$BRANCH" TOUCH_REMOTE="$REMOTE" \
  node - "$TARGET" <<'EOF'
const fs = require('fs');
const path = require('path');
const target = process.argv[2];
// build-latest.sh rewrites the version in <output root>/package.json
// (<version>-<commit>) before this script runs: prefer that copy.
const pkgPath = [path.join(target, 'package.json'), 'package.json'].find((p) => fs.existsSync(p));
const pkg = pkgPath ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};
const commit = /^[0-9a-f]{7,40}$/.test(process.env.TOUCH_COMMIT || '') ? process.env.TOUCH_COMMIT : '';
const branch = (process.env.TOUCH_BRANCH || '').trim();
const remote = (process.env.TOUCH_REMOTE || '').match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
const now = new Date().toISOString();
const info = {
  ...(commit ? { commit } : {}),
  ...(branch ? { branch } : {}),
  ...(remote ? { repo: remote[1] } : {}),
  deployedAt: now,
  builtAt: now,
  version: String(pkg.version || ''),
  source: 'build'
};
const file = path.join(target, 'touch', 'VERSION.json');
fs.writeFileSync(file, JSON.stringify(info, null, 2) + '\n', 'utf8');
console.log('touch assets copied to ' + path.join(target, 'touch') + ' (' + fs.readdirSync(path.join(target, 'touch')).length + ' entries), ' + file + ': ' + JSON.stringify(info));
EOF
