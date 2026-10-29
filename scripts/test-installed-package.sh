#!/usr/bin/env bash
# Builds the npm package, installs it in a clean directory outside the checkout,
# starts the installed `cncjs` on a free port with a minimal .cncrc in a
# temporary HOME, checks a few HTTP routes and stops it.
#
#   bash scripts/test-installed-package.sh            # build-prod, pack, install, check
#   SKIP_BUILD=1 bash scripts/test-installed-package.sh   # reuse an existing dist/
#   TOUCH_REQUIRED=0 bash scripts/test-installed-package.sh  # /touch/ reported, not blocking
#
# Works with bash on Ubuntu and with Git Bash on Windows. Exit code 1 on any
# failed check. The Touch assets (/touch/) are not part of the npm package yet
# (chantier A6): that check fails today with an explicit message unless
# TOUCH_REQUIRED=0 (what ci.yml sets until A6 lands).
set -euo pipefail
# Git Bash: hand Node native paths (C:/...) for the files it opens, and keep
# "/api/..." arguments from being turned into Windows paths (MSYS_NO_PATHCONV,
# set only on the Node calls below: exported globally it breaks the npm shim).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_BUILD="${SKIP_BUILD:-0}"
TOUCH_REQUIRED="${TOUCH_REQUIRED:-1}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cncjs-pkg-XXXXXX")"
SERVER_PID=""
STATUS=0

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { log "FAIL: $*"; STATUS=1; }

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$SERVER_PID" 2>/dev/null && { log "server still alive after SIGTERM, killing"; kill -9 "$SERVER_PID" 2>/dev/null || true; STATUS=1; }
  fi
  rm -rf "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

# Yarn 3.3.1 from the repository (yarnPath), whether or not `yarn` is on PATH.
yarn_cmd() {
  if command -v yarn >/dev/null 2>&1; then yarn "$@"; else node "$ROOT/.yarn/releases/yarn-3.3.1.cjs" "$@"; fi
}

cd "$ROOT"
if [ "$SKIP_BUILD" != "1" ]; then
  log "yarn build-prod"
  yarn_cmd build-prod
fi
[ -f dist/cncjs/server-cli.js ] || { log "dist/cncjs/server-cli.js missing: run yarn build-prod"; exit 1; }

log "npm pack -> $WORK"
npm pack --silent --pack-destination "$WORK" >/dev/null
TGZ="$(ls "$WORK"/cncjs-*.tgz | head -n 1)"
[ -f "$TGZ" ] || { log "no tarball produced"; exit 1; }
log "tarball $(basename "$TGZ") ($(wc -c <"$TGZ") bytes)"
# (listed to a file: `grep -q` closing the pipe early trips `pipefail`)
tar tzf "$TGZ" >"$WORK/files.txt"
grep -c '^package/dist/cncjs/server-cli.js$' "$WORK/files.txt" >/dev/null || fail "tarball lacks dist/cncjs/server-cli.js"
if grep -c 'touch/index.html$' "$WORK/files.txt" >/dev/null; then log "tarball carries the touch assets"; else log "tarball has no touch assets (A6 pending)"; fi

INSTALL="$WORK/install"
mkdir -p "$INSTALL"
cd "$INSTALL"
log "npm install $(basename "$TGZ") in $INSTALL"
npm init -y >/dev/null
npm install --no-audit --no-fund --loglevel=error "$TGZ"
[ -f node_modules/cncjs/bin/cncjs ] || { log "installed package has no bin/cncjs"; exit 1; }

# Minimal configuration in a temporary HOME; the secret keeps the server from
# writing a generated one elsewhere.
HOME_DIR="$WORK/home"
mkdir -p "$HOME_DIR" "$WORK/watch"
cat >"$HOME_DIR/.cncrc" <<EOF
{
  "secret": "test-installed-package",
  "watchDirectory": "$(native "$WORK/watch")",
  "allowRemoteAccess": false
}
EOF

PORT="$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});")"
log "starting cncjs on 127.0.0.1:$PORT"
HOME="$(native "$HOME_DIR")" USERPROFILE="$(native "$HOME_DIR")" NODE_ENV=production \
  node node_modules/cncjs/bin/cncjs --host 127.0.0.1 --port "$PORT" --config "$(native "$HOME_DIR/.cncrc")" >"$WORK/server.log" 2>&1 &
SERVER_PID=$!

# http_check METHOD PATH EXPECTED_STATUS [BODY_REGEX] [HEADER]: prints status, content-type, body length.
http_check() {
  MSYS_NO_PATHCONV=1 node - "$PORT" "$@" <<'EOF'
const [port, method, route, expected, bodyRe, header] = process.argv.slice(2);
const http = require('http');
const headers = { 'Content-Type': 'application/json' };
if (header) { const [k, v] = header.split(/:\s*/); headers[k] = v; }
const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
  let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => {
    const type = res.headers['content-type'] || '';
    const ok = String(res.statusCode) === expected && (!bodyRe || new RegExp(bodyRe).test(body));
    console.log((ok ? 'ok  ' : 'FAIL') + ' ' + method + ' ' + route + ' -> ' + res.statusCode + ' ' + type + ' (' + body.length + ' bytes)' + (bodyRe ? ' expects /' + bodyRe + '/' : ''));
    if (route === '/api/signin' && ok) { try { require('fs').writeFileSync(process.env.TOKEN_FILE, JSON.parse(body).token || ''); } catch (_) {} }
    process.exit(ok ? 0 : 1);
  });
});
req.on('error', (e) => { console.log('FAIL ' + method + ' ' + route + ' -> ' + e.message); process.exit(1); });
req.end(method === 'POST' ? '{}' : undefined);
EOF
}

export TOKEN_FILE="$(native "$WORK/token")"
for _ in $(seq 1 60); do
  if node -e "require('http').get('http://127.0.0.1:$PORT/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || { log "server exited early:"; cat "$WORK/server.log"; exit 1; }
  sleep 1
done

http_check GET / 200 '<title>' || fail "web app not served"
http_check POST /api/signin 200 '"token"' || fail "signin (no users configured) should return a token"
TOKEN="$(cat "$TOKEN_FILE" 2>/dev/null || true)"
http_check GET /api/custom/health 200 '"loaded":true' "Authorization: Bearer $TOKEN" || fail "touch backend health (authorized) not answering"
http_check GET /api/custom/health 403 "Forbidden" || fail "touch backend health should refuse a request without session (403 Forbidden Access)"
http_check GET /api/version/latest 200 "\"version\"" "Authorization: Bearer $TOKEN" || log "note: /api/version/latest needs the npm registry (not required)"

TOUCH_OK=1
http_check GET /touch/ 200 'touch-shell' || TOUCH_OK=0
http_check GET /touch/app.js 200 '' || TOUCH_OK=0
if [ "$TOUCH_OK" != "1" ]; then
  echo
  echo "Touch assets absent du paquet (A6) : /touch/ n'est pas servi par le paquet npm installé."
  echo "Le dossier examples/cncjs-touch/touch n'est pas dans \"files\" de package.json et settings.assets.touch"
  echo "le cherche depuis le checkout. Attendu tant que le chantier A6 n'est pas livré."
  if [ "$TOUCH_REQUIRED" = "1" ]; then STATUS=1; else echo "(TOUCH_REQUIRED=0 : signalé, non bloquant)"; fi
fi

log "stopping server"
kill "$SERVER_PID"
for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$SERVER_PID" 2>/dev/null; then fail "server did not stop within 5 s of SIGTERM"; else log "server stopped"; SERVER_PID=""; fi
grep -iE 'error|unhandled' "$WORK/server.log" | grep -v 'assets: name=touch' | head -n 5 || true

if [ "$STATUS" = "0" ]; then log "installed package: every check passed"; else log "installed package: FAILED (see above)"; fi
exit "$STATUS"
