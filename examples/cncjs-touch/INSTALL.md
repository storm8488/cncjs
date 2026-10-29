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
