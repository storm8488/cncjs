# Installing, updating and rolling back the touch interface

The touch interface is part of the CNCjs build since 2026-10-29: `yarn build-prod`
(and `build-latest`, `build-dev`) copies `examples/cncjs-touch/touch/` next to the
compiled server as `dist/cncjs/touch/` (`output/cncjs/touch/` in development) and
writes `dist/cncjs/touch/VERSION.json` there (`scripts/copy-touch-assets.sh`). The
server (`src/server/config/settings.base.js`, `findTouchAssets`) serves that
directory at `<route>/touch/`, so every distribution that carries `dist/cncjs`
(npm package, Docker image, electron-builder bundles, a copied `dist/` on the
tablet) serves `/touch/` without a mount point or a manual copy.

Resolution order of the directory, from the compiled server (`dist/cncjs/server/config`):

1. `dist/cncjs/touch` (what the build ships; the only one present in a packaged install);
2. `examples/cncjs-touch/touch` of the checkout, four levels up (a compiled server
   run inside the repository before the copy existed);
3. `examples/cncjs-touch/touch` three levels up (the source tree, used by Jest).

`<route>` is `/`: CNCjs has no option or `.cncrc` key for a route prefix
(`settings.production.js` fixes `route: '/'`). Editing that value in an
installed copy makes Touch work under the prefix (tried with `/cnc/`), but the
main CNCjs app does not load there (its webpack bundles are requested without the
prefix), so a prefixed install is not supported.

When none exists the server logs `assets: name=touch, path=... does not exist,
skipping` and `/touch/` answers 404; the rest of CNCjs is unaffected.

## Compatibility matrix

| Component | Requirement | Where it comes from |
| --- | --- | --- |
| Server, Node.js | `>= 18` (`package.json` `engines`). Production dependencies declare at most `>= 12.17` (`@serialport/bindings-cpp` 10.8, N-API prebuilds) and `>= 12` (`jsonwebtoken` 9, `winston` 3). Verified here: Node 24.20 on Windows (installed package started and checked by `scripts/test-installed-package.sh`), Node 18 on the Surface RT (Raspbian 11 armhf, PM2). | `package.json`, `node_modules/*/package.json` |
| Build and tests, Node.js | Jest 30 needs `^18.14 \|\| ^20 \|\| ^22 \|\| >= 24`; the CI uses Node 24.x; the offline touch suite (`verify-project.cjs`) needs Node 18+; the touch preview server and some tools need Node 22.12+ (native ES modules). | `.github/workflows/ci.yml`, `examples/cncjs-touch/README.md` |
| Docker image | `Dockerfile` pins Node v18.20.4 through nvm (Node 18 reached end of life in April 2025); the image installs the production dependencies with Yarn classic from `dist/cncjs/package.json`, without the repository lockfile. | `Dockerfile` |
| Node.js binaries for the tablet (armv7l) | nodejs.org publishes `linux-armv7l` for Node 18, 20 and 22, not for Node 24 (checked on `nodejs.org/dist/index.json`, 2026-10-29). Node 22 (LTS until April 2027) is the highest official line for the Surface RT. | nodejs.org |
| Browser (touch pages) | Every script in `touch/` parses as an ES2017 script (checked with acorn, `ecmaVersion: 2017`, 58 sources including the inline scripts of `index.html` and `simulation.html`; no `<script type="module">`). Newest platform APIs used: `OffscreenCanvas` (Chromium 69), `globalThis` (71), `requestIdleCallback` (47), `crypto.getRandomValues`, `navigator.onLine`. Chromium 106 of the tablet is therefore well inside the supported range; any browser from Chromium 80 / Firefox 105 upwards works. | `examples/cncjs-touch/touch/*.js`, `*.html` |
| Browser (CNCjs web app) | React 15.6, Bootstrap 3.3.7, Socket.IO 2.2 client: unchanged, no new requirement. | `package.json` |
| Hardware | Surface RT class target (1366 × 768, Tegra 3, 2 GB, no WebGL: `--disable-gpu`, software rasterization); previews are CPU-rendered images. | `examples/cncjs-touch/README.md`, `TESTING.md` |

## Installation

### From the repository (development or a build you ship yourself)

```sh
yarn install --immutable
yarn build-prod            # dist/cncjs, dist/cncjs/touch, dist/cncjs/touch/VERSION.json
NODE_ENV=production ./bin/cncjs --port 8000
# http://localhost:8000/touch/
```

`yarn build-dev` produces the same layout under `output/cncjs/` for
`yarn start-server-dev`.

### npm package

```sh
yarn build-prod
npm pack                   # cncjs-<version>.tgz: bin/, dist/ (touch included), static/
npm install -g ./cncjs-<version>.tgz
cncjs --port 8000
```

`bash scripts/test-installed-package.sh` does exactly this in a temporary
directory outside the checkout (`SKIP_BUILD=1` reuses `dist/`) and checks `/`,
`/api/signin`, `/api/custom/health`, `/touch/`, `/touch/app.js`,
`/touch/touch-shell.js`, `/touch/simulation.html` and `/touch/VERSION.json`.
The `/touch/` checks are blocking (`TOUCH_REQUIRED=1`, the default and the CI
setting); `TOUCH_REQUIRED=0` only reports them.

### Docker

```sh
yarn build-prod
docker build -t cncjs:touch .
docker run --rm -p 8000:8000 --device /dev/ttyUSB0 cncjs:touch
# http://localhost:8000/touch/
```

The `Dockerfile` copies `dist/cncjs` whole, so `dist/cncjs/touch` is inside the
image and `findTouchAssets` finds it at `/opt/cncjs/touch`. Not verified on
2026-10-29: Docker is not installed on the machine that produced this build;
the HTTP checks above are the ones to run against the container
(`curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/touch/` → `200`).

### Tablet (Surface RT, PM2)

Current layout (see `HANDOFF.md`): the production build of the branch lives in
`/home/pi/cncjs-next` and is run by PM2 as `cncjs-next`, reusing the global
CNCjs 1.11.5 `node_modules`; the previous installation stays stopped under PM2
and `/home/pi/cncjs-rollback.sh` switches back to it. The touch pages are
served through a `/touch` mount point of `.cncrc` (`mountPoints`, or `-m
/touch:<directory>`), kept up to date by `/home/pi/deploy-touch.sh`, which also
writes `VERSION.json` into that directory.

With a build that ships `dist/cncjs/touch`, the mount point is no longer
needed, but it keeps working: CNCjs registers `.cncrc` mount points before its
own application routes (`src/server/index.js`, `routes.push({type: 'static'})`
ahead of the server route), so a `/touch` mount point shadows the shipped copy
file by file. Migration, in this order, without touching the running kiosk:

1. Deploy a build that carries `dist/cncjs/touch` (copy the whole `dist/cncjs`
   as today). Nothing changes for the kiosk: the mount point still serves
   its directory.
2. Point `deploy-touch.sh` at the shipped directory
   (`<install>/dist/cncjs/touch/`) for its `VERSION.json` (same fields:
   `commit`, `branch`, `repo`, `deployedAt`; the build's file already holds the
   commit, branch, repository, build date and package version, so the script
   may also simply stop writing it). The page reads `VERSION.json` next to its
   own files, so it must be in the directory actually served.
3. Remove the `/touch` mount point from `.cncrc` (or the `-m /touch:...`
   argument of the PM2 process) and `pm2 restart cncjs-next`. Check
   `curl -s http://localhost:8000/touch/VERSION.json`: it must answer with the
   build's commit.
4. Keep the old mount directory until the next successful deployment: putting
   the mount point back in `.cncrc` restores the previous behaviour instantly.

A separate `touch/` directory served by a mount point remains a valid way to
test an interface build against an unchanged server (that is what the
performance comparisons in `TESTING.md` did).

## Settings and files in `.cncrc` and beside it

| Key or file | Default | Effect |
| --- | --- | --- |
| `touch.motion.enabled` | absent (off) | `true` enables the EXPERIMENTAL real jog and work origins. Any other value, or no key, keeps them refused by the server and hidden on the tablet. |
| `touch.backlight.percent` | absent | last brightness level, written by the server (README, "Screen brightness") |
| `cncjs-touch-history.jsonl` | created on first use | durable job history, in the directory of `.cncrc`; JSON Lines, at most 500 entries and about 1 MB, rewritten atomically when trimmed. Deleting it clears the history. |
| `.cnctouch-projects.json` | created on first write | project sheets, in the watch directory (`-w` or `watchDirectory`); at most 500 sheets and 2 MB |
| `commands` | CNCjs setting | host commands. A disabled command is refused (403). Shutdown, reboot, restart, `pm2`/`systemctl` stop or restart and kill commands are refused (409) while a job, a homing, a probe or a load is in progress; write the command itself, not a wrapper script, or it is not recognised. |

### Enabling real jog and work origins (experimental)

Do this only after the supervised protocol of `HANDOFF.md`, step 10 (step 0
first, with the setting still off), and on the test bench before the production
machine. The machine needs Grbl 1.1 or newer (Grbl_ESP32 counts), `$10=1` and
`$13=0`. The server reads `$13` from the settings CNCjs last read (`$$`): after
changing `$13` from a console, read the settings again before any real move.

```json
{
  "touch": {
    "motion": { "enabled": true }
  }
}
```

Stop CNCjs, add the key to `.cncrc` (keep the rest of the file), start CNCjs.
Check with `GET /api/touch-job`: each Grbl controller shows
`capabilities.jog.enabled: true` once its startup banner has been seen; the
tablet then shows "Déplacement réel · EXPÉRIMENTAL" in Préparer.

To turn it off, set the key to `false` or remove it. CNCjs polls `.cncrc` for
changes (about every 5 s): a running jog is then cancelled (`0x85`) and new moves
are refused, without a restart. This is not a safety mechanism: the emergency
stop is.

### Optional bundle of the pages

`node examples/cncjs-touch/build-bundle.cjs --out <dir>` writes a copy of
`touch/` where each page loads one script and one style sheet (content-hashed
names; the original files are kept beside them for the workers). It is not part
of the build: `copy-touch-assets.sh` copies the separate files. To try it on the
tablet, build it into a directory and serve that directory with a `/touch` mount
point, as the performance comparisons did; remove the mount point to go back.
It has been measured on a PC only (TESTING.md, "Audit 2026-10").

Risk of the bundle: with separate files, a file the browser cannot parse loses
only that file; in the bundle, one syntax error loses the whole script, so the
status strip (Pause / Arrêter) is never built. Each module runs in its own
`try` block, which covers an exception while a module runs, not a syntax
error. `build-bundle.cjs` therefore compiles every script on its own first
(acorn at ES2017, the level the sources use for the tablet's Chromium 106, or
Node's parser when acorn is absent) and writes nothing if one fails, naming
the file and the line. A module that throws at load (bundle or not) leaves
« Chargement incomplet » shown below a strip that stays usable
(`startup.js`, class `cnc-degraded`).

## Updating

- Repository or tablet: build (`yarn build-prod`), copy `dist/cncjs` to the
  install directory, restart the process (`pm2 restart cncjs-next`). Both
  server and interface come from the same commit; `dist/cncjs/touch/VERSION.json`
  records it.
- npm package: `npm install -g ./cncjs-<version>.tgz` over the previous
  version, then restart.
- Docker: rebuild the image after `yarn build-prod`, replace the container.

After any update, the version served must match the server:
`GET /touch/VERSION.json` (`commit`, `version`) and `GET /api/custom/health`
(`version` of the touch backend protocol, `protocol: 1`). The Système →
Tablette tab shows the interface commit and compares it with the branch on
GitHub when `repo` is set.

## Rolling back

- Tablet: `/home/pi/cncjs-rollback.sh` (stops `cncjs-next`, starts the
  previous PM2 process). If the mount point was removed in step 3 above and the
  previous build has no `dist/cncjs/touch`, put the mount point back first.
- npm package: `npm install -g cncjs@<previous version>` or the previous
  tarball, then restart.
- Docker: start the previous image tag.
- Repository: `git checkout <previous commit>` then `yarn build-prod`;
  `dist/` is rebuilt from scratch each time (`rm -rf dist/*`), so no stale
  touch file survives a rebuild.
- Before going back to a build older than the 2026-10 audit, remove
  `touch.motion.enabled` from `.cncrc`: an older server ignores it, but a later
  update would enable real moves again without the operator noticing.
  `cncjs-touch-history.jsonl` and `.cnctouch-projects.json` are ignored by older
  builds and read again by newer ones; they can stay.

## Checks after installation

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/touch/           # 200
curl -s http://localhost:8000/touch/VERSION.json                                # {"commit": ..., "version": ...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/touch/app.js     # 200
```

A 404 on `/touch/` with the server log line `assets: name=touch, path=<...>
does not exist, skipping` means the build did not copy the directory
(`scripts/copy-touch-assets.sh` is called at the end of `build-prod.sh`,
`build-latest.sh` and `build-dev.sh`; `build-dev.ps1` does not call it yet, so
`yarn win-dev` relies on the checkout fallback).
