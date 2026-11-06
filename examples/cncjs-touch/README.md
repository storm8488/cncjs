# CNCjs Touch — experimental touchscreen interface

I ([@storm8488](https://github.com/storm8488)) have been working on this touchscreen interface for CNCjs, with a layout inspired by KlipperScreen. I am sharing the prototype so that someone who already owns a working CNC can help review, test and finish it. **I currently do not have an operational CNC available for physical validation. This is unfinished work, not a production-ready machine interface.**

The project was developed with AI coding assistance. This contribution preserves the existing prototype and its offline regression tests. The maintainer documentation is in English. The interface, operator guidance and journal exports support French, English and Spanish. Native-speaker review and integration with CNCjs conventions remain open work.

## Try it without a machine

Use Node.js 22.12 or newer: the demo loads the job service from `src/server` as a native ES module (the offline suite itself still runs on Node.js 18). These commands require no npm packages and do not connect to a CNC controller:

```sh
cd examples/cncjs-touch
node verify-project.cjs
node preview-server.cjs
```

Open the localhost URL printed by the preview server. It serves a local visual fixture with synthetic files, a virtual controller and simulated progress. Stop it with Ctrl+C. The mock controller rejects physical commands. The fixture is for local evaluation only; do not deploy its fake authentication or mock responses to a real CNCjs server.

## Machine type and tablet performance (2026-11)

One interface for a CNC and a laser, with two independent settings in Réglages: **Type de machine** (CNC / Laser), kept by the CNCjs server for a machine recognised by its firmware and mechanics settings (not by its port), changed only by the pilot at rest and never written to the firmware; and **Performances de cette tablette** (Éco / Performance), kept in each browser. The server enforces the laser restrictions (no spindle test, touch plate, tool change or CNC resume; framing with the beam off behind a ticket; laser resume only at a pass boundary; coherence with `$32`). Éco never loads the advanced modules; Performance adds a free WebGL 3D view with filters and segment inspection, loaded on demand and released afterwards. In both: a laser view coloured by S set point, a motion-based time estimate with its unknowns, the server's resume path, indicative stock and clamps, preview export/import between servers, a diagnostic at rest. Screens are laid out from the real CSS width and height instead of being scaled down. Settings, behaviour, rollback, what was tested and the Surface RT / Pro 3 validation procedure: [PROFILES.md](PROFILES.md). Nothing of it has run on a machine, a laser or either tablet.

## Audit 2026-10 (31 work items)

An audit-and-fix pass on 2026-10-29/30 (branch `feat/audit-31`, from `b023616f`): one agent per group of items, a separate agent to refute each sensitive lot, a test that fails before and passes after for each fix. Nothing was run on a machine or on the Surface RT; the figures come from a development PC, fake controllers and the Grbl JavaScript simulator behind an installed CNCjs. The status of every item, the commits, the command results and the physical validations still to do are in [AUDIT-2026-10.md](AUDIT-2026-10.md).

- **Server safety.** Resume from a line converts units and refuses a work offset change it cannot replay; its clearance is the highest Z reached by a rapid. Host commands (`api/commands`) are refused when disabled (403) and, for shutdown, reboot, restart or kill commands, while a job, a homing, a probe or a load is in progress (409); the touch service then refuses machine actions until the command ends. Deferred timers end with the service.
- **Files.** Previews are bound to the SHA-256 of the program: a preview of another version is never shown as valid, and a start is refused when the file changed since its load. Library writes are atomic; links and paths outside the watch directory are refused. The pages follow the CNCjs route prefix, but CNCjs itself has no option to set one (`settings.production.js` fixes `/`) and its main app does not load under a prefix, so a prefixed install is not supported.
- **Package.** `yarn build-prod` ships the touch pages in `dist/cncjs/touch` with a `VERSION.json`; `/touch/` works from the npm package without a mount point. Installation, update, rollback and the compatibility matrix are in [INSTALL.md](INSTALL.md).
- **Tablet.** Every screen fits 1024 × 600 and 1366 × 768 at scale 1, in normal and large text, alarm included; `browser-run.cjs --strict` fails on a covered command, a scale below 1, an undersized target or text, a text overflowing its button or a scrolling rail, and the CI runs it. A guided job preparation; one numeric pad; each command shows sent, confirmed, refused or uncertain. Messages (what to do next, a running host command) are shown in the status strip, in place of the report age and the values; a tap shows the whole text.
- **Pause and Arrêter.** They stay reachable by touch and keyboard (Tab, Enter, Space) under every overlay (`touch/strip-guard.js`: confirmation, sheets, project sheet, numeric pad, coordinate editor, viewer, Pilot dialog, real-move panel; overlays stack and Escape closes one layer at a time), above "Chargement incomplet", and without a gap during a stream loss, where they are sent over HTTP and never replayed after the reconnection. Locking the screen closes every panel (a held jog is stopped) and leaves only Pause, Arrêter and the lock.
- **Alarms and refusals.** An alarm whose code was cleared by a board restart is deduced (ALARM:3 after Run, Jog or Hold within 5 s, ALARM:6 after a homing) and marked "déduite" in the strip, Machine and the menu. Grbl errors 1–38 are explained. Server refusals with an `ETOUCH_*` code (15 resume, 28 travel check, 8 real move) are shown in French, English or Spanish; others stay French.
- **Previews.** Fusion 360 and generic posts now get a preview: `G28`/`G30` draw their intermediate point then leave the axes unknown until X, Y and Z are given again in absolute; `O` words are ignored with a note; `G80` cancels the motion mode; `G55`–`G59` are accepted when chosen before any move. The classic visualizer draws helix bottoms, `G53`/`G28`/`G30` and nested comments like the CNCjs sender reads them (tested in Jest, not checked in a browser or a webpack build).
- **Several devices.** The device that pilots a port is shown in the strip; another device is refused (409, `ECONTROL`) except for Pause, Stop and M5, and can take over with a reason. A lease is released after 60 s without the owner's stream, or after 5 minutes on a machine at rest. Resume from a line refuses a CNCjs expression (`[..]`, `#`, a `%` line) before the resume line, since CNCjs evaluates it at send time. A durable job history is kept by the server for all devices (Journal → Serveur). The start confirmation shows the server's XYZ travel check (validated, outside, unknown; unknown until a homing has been observed).
- **Real jog and work origins, EXPERIMENTAL, disabled by default.** Steps and held jogs (`$J=` bounded in distance and to 60 s, cancelled with `0x85` when the keepalive stops; `$10=1` and `$13=0` required, MPos trusted only from MPos reports or with a WCO; travel checked in both homing conventions; after Grbl's answer, even an error or a board restart, a `$J` line is released only after two reports without `Jog`, and meanwhile only Pause, Stop, M5 and jog-stop are accepted) and `G10 L20` origins with a confirmation ticket, only when `.cncrc` sets `"touch": {"motion": {"enabled": true}}`. Without it, no button is shown. Supervised validation is required first: HANDOFF.md, step 10.
- **Project sheets.** Fichiers keeps a sheet per program (material, tool, stock, notes, favourite, related files), bound to the program's fingerprint, stored in `.cnctouch-projects.json` in the watch directory. A sheet never changes feeds, speeds, settings or the program. An Autolevel-compensated file can record its original, the probe grid summary, the date, the tool and the probe profile; this provenance is declared by the operator, not observed.
- **Performance and maintenance.** Library rows read a 192 × 108 thumbnail instead of the full image; uploads are sent as raw bytes; Suivi's live values are written only while Suivi is shown. An optional, content-hashed bundle of the pages (`build-bundle.cjs`) is not enabled in the package. A shared corpus of 28 G-code programs is read by the preview, the travel checks, the resume and the classic visualizer; `job-service.js` was split into load, plate probe, host command and halt modules without behaviour change. `build-bundle.cjs` compiles every module at ES2017 and writes nothing if one fails.
- **Known limits left open.** The tablet that pilots a port cannot run its own sensitive host command (release control first); two devices editing one project sheet: the last write wins; `$13` is read from CNCjs's cached settings; `autolevel:saveToFile` / `autolevel:loadFromFile` in the CNCjs Grbl controller accept any path from a Socket.IO client (older CNCjs code, unused by Touch); `yarn lint` is too long a command line on Windows; after a stream loss the stream takes about 30 s to reconnect (the state is read over HTTP every 2 s meanwhile). The age of a state packet is measured against the server's send time on the wall clock, calibrated when the stream opens: the kiosk's page and server share one clock, but if only the page's clock jumps (a tablet reaching a remote CNCjs), a packet can look older (at most the time since the stream opened) or fresher than it is until the stream is renewed (every minute).

## Full pass (2026-10-19/20)

A complete bug hunt (six reviews, refuters, a second round on the fixes) and a fluidity pass measured on the Surface RT: Stop now reaches Grbl whatever CNCjs cached (also during homing and macro dwells), stream renewals and Wi-Fi gaps no longer hide Stop, and Suivi costs about 10 % less CPU during a job. Details, figures and what was not changed in `TESTING.md`, "Full pass".

## Depth and fixed 3D views (2026-10-20)

The Surface RT cannot run a WebGL view (no GPU in the kiosk; software WebGL gives 2–5 frames/s), so the previews show depth with the CPU, as still images:

- **Depth in the preview.** The preview parser now follows Z (G90/G91, G20/G21, helical arcs with Z interpolated along the angle). The 2D image colours work below Z0 by depth (light violet just under the surface, red at the deepest pass; cyan at or above Z0, grey rapids) and prints the minimum and maximum Z. Fichiers → Dimensions has a Z row.
- **A 3D path in the preview sidecar.** `preview.path3d` (version 1) holds the simplified toolpath: every move, plunges included, with its type (G0 or work) and the sent line that reached it, at most 30 000 points (radial simplification under a quarter of a pixel, then regular decimation for rasters finer than the image), packed as base64 varint deltas in 0.001 mm (a 20 000-line file: about 150 KB of text). `preview.zBounds` and `preview.trailZ` (the Z of each progress sample) come with it. Older sidecars keep working; their 3D views ask for a regeneration.
- **Four fixed views**: isometric, front (XZ), side (YZ) and top (XY), chosen with a segmented control over the preview in Fichiers and Suivi (2D by default, remembered on the device). Each image carries the move colours and the depth scale, a small XYZ triad, a scale bar (with "Z ×n" when a shallow job is drawn with Z exaggerated), and the suggested Z0 plane. Views are drawn in a Web Worker on an OffscreenCanvas (`touch/preview-3d-worker.js`; in the page by 6 ms slices where OffscreenCanvas is missing), the asked view first, the other three when the page is idle, then kept for the three most recent files.
- **During a job** the orange trail and the tool marker are projected with the same matrix as the chosen view (`img.cncView.projection`, version 2), with Z; the image itself is never redrawn.
- **For a future tablet with a GPU**: `CNCToolpath3D.decode(preview.path3d)` returns `positions` (x, y, z per point), `rapid` and `lines` as typed arrays, ready for a `THREE.BufferGeometry` (three.js 0.103 is in CNCjs's dependencies). three.js is not loaded by the touch pages.

Code: `touch/toolpath-3d.js` (path builder and codec, projections, renderer), `touch/preview-3d.js` (selector, cache, worker), `touch/library-preview.js` (Z in the parser). Measurements on the tablet and the simulator run are in TESTING.md, "Depth and fixed 3D views".

## Pendant features (2026-10-19)

Rapids at 25 / 50 / 100 % in Suivi (also at rest, for a first run), the action the state calls for in the status strip (Resume, Unlock, Stop during homing or a jog), a screen lock that keeps only Pause and Stop reachable, and Suivi opening by itself when a job starts with a summary at the end. Details and the simulator run in `TESTING.md`, "Pendant features".

## Z zero with a touch plate (2026-10-18)

Suivi can set the work Z with a touch plate, at rest or during a tool change pause: thickness and maximum travel down, then the usual confirmation; fast touch, back-off, slow touch, `G10 L20`, 5 mm clearance, all in absolute coordinates. Refused when the probe is already in contact, the spindle turns, or `$G` is not `G90 G21`; Stop interrupts it. Details and the simulator run in `TESTING.md`; the plan for the machine in `HANDOFF.md`, step 9.

## Resume from a line and tool change (2026-10-18)

Suivi can restart a program from one of its lines: the server replays the program's state up to that line, checks it, and loads a rebuilt program with a safe preamble (clearance height, XY start, spindle and coolant with a spin-up dwell, slow plunge). Pauses asked by the program (`M0`, `M1`, tool change `M6`) can be resumed from the touch screen; after a tool change the spindle is started again before the program resumes. Details in `TESTING.md`.

## UI 2027 (2026-10-17)

The interface was redesigned for an operator standing about a metre from a 1366 × 768 tablet, often with gloves, looking at the machine more than at the screen. Nothing changed in the contract with the server or in the safety rules (confirmation tickets, guards, ≤ 2.5 s freshness, no automatic resume, software stop is not an emergency stop): only the presentation and the organisation of the screens.

- **One design system.** `touch/design-tokens.css` holds every colour (a dark workshop theme by default and a high-contrast light theme under `html[data-theme="light"]`, chosen in Réglages → Thème), the type scale (nothing useful under 16 px), 4 px spacings, radii, tap sizes (64 px primary, 48 px secondary, 12 px gaps, 96 px jog cross) and motion limits (transform/opacity only, 150 ms). `touch/ui-2027.css` builds the components and the screen layouts on those tokens; the older sheets now reference the tokens too. Colours carry meaning only: green safe, amber attention, red stop or alarm, blue information, grey disabled (reduced contrast plus a stripe pattern; a tap on a disabled control shows its reason). The component sheet and the validated mockups are in [design/](design/).
- **A status strip on every screen** (`touch/status-strip.js`): the Grbl state as a word, an icon and a colour, the age of the last report, spindle and feed, the loaded file, and Pause / Arrêter while a job runs (relayed to the existing buttons, so every guard is unchanged). The rail lists all seven screens.
- **Suivi**: preview and overrides (−10 / 100 / +10 % large, ±1 % smaller) on the left; percentage in 64 px, remaining time, work coordinates in 48 px, real feed and spindle, a short readiness notice and the actions on the right. Démarrer or Reprendre is the one primary action; Arrêter stands alone at the bottom.
- **Fichiers**: 92 px rows with a thumbnail and the XY extent from each stored preview (read one at a time in idle time), search, and a single action, "Charger et ouvrir le Suivi". Démarrer, Pause, Reprendre and Arrêter left this screen.
- **Préparer**: 96 px jog cross, segmented step, work coordinates in 48 px; setting a work zero takes two taps (arm, then confirm within three seconds).
- **Menu**: a "Reprendre où j'en étais" bar and six tiles with live indicators (job and progress, loaded file, dry-run moves, alarm or commissioning to do).
- **Machine**: the state as one word, an alarm explained with what to do next, $X and $H as large commands, then the links and the report freshness. **Journal**: a timeline with colour stripes and filters (errors, jobs, alarms). **Réglages**: the KlipperScreen list on the tokens, plus the theme. The confirmation dialog shows a 48 px "I am in front of the machine" box and a visible countdown bar.
- **Every screen fits 1366 × 768 at scale 1**; `viewport-fit.js` only scrolls the long lists (and Réglages), and a remembered scale is re-measured when the content became smaller.

On-device measurements (opening time of each screen, CPU at rest and during a simulated job, before and after) and the simulator run are in TESTING.md, "UI 2027": CPU is unchanged, Préparer and Réglages open faster, Journal (about 90 ms), Menu and Suivi (30–40 ms) open slower. Nothing was run on a real machine.

## Server integration (2026-10-16)

The backend now lives in the CNCjs source tree instead of being patched into a compiled build: `src/server/services/touch/` holds the job service, NDJSON event stream, motion preflight and probe-input observer; `src/server/api/api.touch.js` adds the session check and HTTP status mapping; `src/server/app.js` registers the routes next to the other API routes and `src/server/index.js` starts the service with the other services. The former `install-custom.cjs` patcher and the `CNC_TOUCH_MODULE` bootstrap are gone. The backend tests were ported to Jest (`yarn test`); the offline suite in this directory now covers the browser side only (50/50 checks).

Route names (`api/custom/health`, `api/touch-job`, `api/touch-motion/preview`, `api/touch-events`), the French server-side messages (CNCjs uses i18next elsewhere) and the error payload shape (`{message}` rather than the `{msg}` of the existing API) were kept as the browser code expects them; all three still need maintainer agreement.

Since the 2026-10 audit the touch routes are:

| Route | Purpose |
| --- | --- |
| `GET api/custom/health` | protocol check (`{loaded, version, protocol, transport}`) |
| `GET`, `POST api/touch-job` | state snapshot and job actions. A POST may carry `clientId` and `clientLabel` (the device identity used for control ownership). Actions added by the audit: `check` (`{file}` → `{file, fingerprint, programCheck}`), `control` (`operation`: `status`, `claim`, `release`, `takeover` with a `reason`), `jog`, `jog-start`, `jog-keepalive`, `jog-stop`, `prepare set-origin` then `set-origin` (refused unless `touch.motion.enabled`). |
| `POST api/touch-motion/preview` | movement preflight, no motion |
| `GET api/touch-events?clientId=` | NDJSON state stream; it also carries the device's presence |
| `GET api/touch-history?limit=&before=` | durable job history, most recent first (`limit` 1–200, 50 by default; `before` is a `seq`), stored as JSON Lines in `cncjs-touch-history.jsonl` beside `.cncrc`, at most 500 entries and about 1 MB; no ticket or token is written |
| `GET api/touch-projects`, `POST api/touch-projects/read`, `PUT api/touch-projects` | project sheets |
| `GET api/touch-system`, `GET`/`POST api/touch-backlight` | system panel and brightness (unchanged) |

The snapshot adds `fingerprint` (SHA-256 of the loaded program), `programCheck` (`validated`, `outside` or `unknown` per axis and overall, with French `reasons` and coded `codedReasons`), `homed`, `control` (`owner {kind, id, label, user, since, present, expires}`, `lastChange`), `capabilities` and `motion` per controller, and `systemCommand` at packet level.

Refusals keep `{message}`, with three additions: a control refusal is `409 {message, code: 'ECONTROL', owner}`; a refusal with a stable touch code carries `{message, code, params}` (`ETOUCH_*`: 15 `ETOUCH_RESUME_*`, 8 `ETOUCH_MOTION_*`; the travel check reasons also carry `codedReasons` with 28 `ETOUCH_CHECK_*` codes); the project routes answer `{message, code}` with the codes of `projects.js`. Other internal codes are not sent. A Socket.IO `command`, `write` or `writeln` from a client that does not pilot the port is refused the same way (a line in the CNCjs console and a `touch:control:refused` event), except Pause, Stop, M5, feed hold, reset and `?`.

## Job progress, overrides and macros (2026-10-16)

Three additions for the running-job screen, written without a controller at hand and therefore only exercised against the simulation and the offline mocks:

- **Toolpath progress on the preview.** The preview worker now samples the tool position about a thousand times along the file (`trail`, with the count of non-empty lines sent so far) and stores it in the preview sidecar. During a job the dashboard draws the part of the path covered by the acknowledged lines (`received / total`) as an orange polyline over the stored image. It is indicative: Grbl acknowledges lines before executing them, and the sampling is coarse.
- **Feed and spindle overrides.** Buttons for −10 / −1 / 100 % / +1 / +10 appear under the job actions while a job is running or paused on a fresh controller; they map one-to-one onto the Grbl realtime commands (`feedOverride` / `spindleOverride`). The server validates kind and value and refuses them outside a job.
- **CNCjs macros from the tablet.** A "Macros…" entry in the preparation sheet lists the macros defined in CNCjs (names only; the server never sends their content). Running one takes the same confirmation dialog as a start (ticket, fifteen seconds, machine idle and fresh) and ends in `macro:run`, so a macro cannot be launched by one stray touch.

Nothing above was run with a real controller. Overrides and macros stay disabled whenever the controller state is stale, and the simulation page carries two fictional macros to try the flow.

## System tab in the settings (2026-10-16)

Réglages now has two tabs, "Affichage" (the existing display settings) and "Système", a read-only panel in the spirit of KlipperScreen's system screen: usage of each CPU core as a bar, total CPU, temperature sensors, memory (based on `MemAvailable`), load average, battery and mains state, and the memory and uptime of the CNCjs process. The figures describe the computer that runs CNCjs, which is the tablet itself in the kiosk setup. They come from `GET /api/touch-system` (`src/server/services/touch/system-stats.js`: `os.cpus()` deltas and a few small sysfs files, one shared sample per 500 ms). The page polls every 2 s and only while that tab is on screen. Failed requests back off up to 30 s. Nothing is sent to the controller.

## Network, history, tablet actions and clock (2026-10-16)

- **Système** also shows the network link (IPv4 addresses, and for Wi-Fi the SSID, signal in dBm and bitrate, read with `iw dev <name> link` at most every 10 s while the tab asks for it), and a ten-minute history of CPU usage and temperature. The server samples that history (CPU and temperature only) every 5 s, even with the tab closed, on an `unref`'d timer.
- **Tablette** (in Système) shows the installed interface version from `touch/VERSION.json` (written by the deployment script: commit, branch, repository, date). When that file names a GitHub repository, the page compares it with the latest commit of the branch through the public GitHub API, at most every ten minutes. Below it are the host commands configured in CNCjs (Settings → Commands, `commands` in `.cncrc`), for example update the interface, restart CNCjs, reboot or shut down. The page shows their titles only. Each needs a second tap within 8 s, and all are refused while a job is running or paused. What a command does is up to whoever configures CNCjs; this interface adds no server route for it and runs nothing else.
- **Affichage → Horloge** shows the time in the header. It updates once a minute on the minute, and not at all while the page is hidden or the clock is switched off.

## Code review before the machine (2026-10-17)

A full review of the touch code fixed 25 defects (spindle and stop guards, the commissioning E-stop and spindle steps, previews that could hide moves, the wrong file selected after an upload, tablet commands during motion, translations, simulator robustness). Details in `TESTING.md`, "Code review before the machine".

## Alarm help and travel check (2026-10-17)

Alarms and Grbl errors are explained in plain words (FR/EN/ES), the start confirmation warns when the program would leave the machine travel ($130/$131 and the homing direction $23, valid after homing), and Suivi says when a job waits for Grbl's replies while Grbl stays idle. Details in `TESTING.md`.

## Second pass (2026-10-17)

Four remaining defects (a screen left hidden while its content changed, a program ending in a Grbl error shown as finished, Latin-1 files losing their accents, durations on the wall clock), two optimisations measured on the tablet (snapshots no longer built for repeated reports, no `iw` process at rest: about −20 % CPU for CNCjs at rest), and a counter-review of the first pass (stop during a macro or with the door open, spindle check without `FS`, stream timeouts, translations). Details in `TESTING.md`, "Second pass".

## Commissioning assistant (2026-10-17)

Réglages → "Mise en service de la machine" (also opened by itself the first time a real controller is connected, and from the Machine screen) walks through nine steps before the first job: checklist, `$$` backup download, emergency stop, limit switches, probe, homing (`$H`), spindle and VFD test at the minimum speed, an air-cut test file, and a summary saved with the date for that controller port. Each step can be skipped, and so can the whole assistant after ticking "Je passe les vérifications sous ma responsabilité"; it resumes where it was left. `$X`, `$H` and the spindle start go through the same confirmation dialog as a job start and are refused during a job; the Machine screen also has `$X` and `$H`. The other checks only read the controller's reports (alarm, `Pn` inputs, spindle speed).

## Grbl simulator (2026-10-16/17)

[grbl-sim/](grbl-sim/README.md) builds the official Grbl 1.1h firmware as a Linux program with grbl-sim, patched to run in real time on a small ARM board, and exposes it as a serial port that CNCjs opens like a board. A run against it found and fixed five defects that the browser-only simulation could not show; see TESTING.md, "Grbl simulator run".

## Readable settings (2026-10-16)

Every screen is still scaled to fit without scrolling, except **Réglages**. It is marked `data-fit="scroll"`, so `viewport-fit.js` leaves it at full size and lets it scroll vertically. Opening the screen starts at the top, and later refits keep the reading position. `touch/settings-list.css` lays it out the way KlipperScreen does: one centred column of rows (title and description on the left, the control on the right), 19–22 px text, 60 px touch targets, and Affichage/Système tabs that stay at the top while the list scrolls. Système uses two columns with larger figures.

## Screen brightness (2026-10-16)

Affichage has a **Luminosité** card: a slider and −/+ buttons (steps of 10 %, never below 5 % so the screen can always be found again). It drives `/sys/class/backlight/*/brightness` on the computer running CNCjs through `GET`/`POST /api/touch-backlight` (`src/server/services/touch/backlight.js`). The last level is stored in `.cncrc` (`touch.backlight.percent`, written 2 s after the slider stops) and applied again when CNCjs starts, since the kernel resets it on boot.

The brightness file belongs to root, so CNCjs needs write access through a udev rule. On a Raspberry Pi OS style system where the CNCjs user is in the `video` group, run once:

```sh
echo 'ACTION=="add", SUBSYSTEM=="backlight", RUN+="/bin/chgrp video /sys/class/backlight/%k/brightness", RUN+="/bin/chmod g+w /sys/class/backlight/%k/brightness"' | sudo tee /etc/udev/rules.d/90-backlight.rules
sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=backlight --action=add
```

Without it the card says the setting is blocked and sends nothing.

**Pendant la veille** (same card) chooses what the screen saver does with the backlight: *Écran éteint* (default, level 0), *Luminosité minimale* (5 %) or *Inchangée*. These are temporary levels: the server never stores them, and the first touch on the sleeping screen puts the operator's level back (`POST {wake: true}`). A page that loads while the panel may still be off sends the same wake request once. The choice is kept per browser (`localStorage`, `cncjs-touch-backlight-v1`).

## Preview performance pass (2026-10-16)

The G-code preview parser is 2.8–3.7× faster and the preview worker overlaps parsing with drawing; the full 20 MB pipeline runs in 55 % of its previous time on the development PC. Behaviour is unchanged (differentially fuzzed against the previous parser). See [TESTING.md](TESTING.md), "Preview pipeline measurements", for the numbers, the rejected approaches and the caveats. Measurements on the real touchscreen remain to be made: open a page with `?perf=1` and export the report (see TESTING.md, "Measuring on the device").

## Previous handoff (2026-10-16)

This update includes FR/EN/ES settings and exports; coordinate preparation, read-only machine limits and a compatible preview position marker inspired by Shopfloor Tablet; guarded local storage; bounded download cleanup; active-job screen-blanking inhibition; stricter state protocol validation; conservative time estimates; and fresh monitoring after network loss or page restoration. See [touch/THIRD-PARTY-NOTICES.md](touch/THIRD-PARTY-NOTICES.md).

**All offline checks pass (65/65 browser-side checks here, backend covered by the root Jest suite). Physical CNC validation remains outstanding.** Development is paused at the author’s request pending further review and testing by someone with an operational CNC.

## What is included

- Touch-oriented menu, job dashboard, shared file library, combined movement/origin screen, machine information, journal and settings.
- G-code previews supporting linear moves and supported G2/G3 arcs, with depth colours and four fixed 3D views, stored image previews bound to the program's fingerprint, percentage progress and remaining-time display. The preview is indicative; it does not simulate machining, collisions or laser power.
- A separate simulation mode for job controls, movement, work origins and alarms. Its progress and estimated time are fictional.
- Real jog (steps and held moves) and real work origins (`G10 L20`), EXPERIMENTAL and disabled by default: the server refuses them and the tablet shows no button unless `.cncrc` sets `touch.motion.enabled` to `true`. Not validated on a machine.
- Probe profiles, geometry/direction/search parameters, import/export and preparation diagrams. Physical probing is not implemented or validated, except the Z zero with a touch plate (validated only on the Grbl simulator).
- Project sheets per program, with an optional declared provenance for Autolevel-compensated files.
- Configurable screen dimming/blanking overlay and display settings. This is a browser feature, not hardware power management.
- A prototype Grbl job service with explicit controller selection, freshness checks and expiring start/resume/macro confirmations, plus feed and spindle overrides during a job; a server-side XYZ travel check of the loaded program, explicit control ownership between devices and a durable job history.
- An authenticated, bounded NDJSON state stream, slower polling fallback, hidden-view rendering suppression and worker-based preview processing to reduce work on limited hardware.

The original display target was a Surface RT-class device: 1366 × 768, Tegra 3 and 2 GB RAM. The current implementation still needs browser/device compatibility testing; it is not a promise of support for the original Windows RT browser.

## Important distinction: simulation versus real integration

The local demo above has no physical machine connection. However, **the real backend contains CNCjs load/start/pause/resume/stop commands**. Connecting it to a real installation is a separate integration task. Real jog and work origins exist on the server and the tablet since the 2026-10 audit, but stay disabled until `touch.motion.enabled` is set, which must wait for the supervised protocol of HANDOFF.md, step 10. Probing other than the plate Z zero remains limited to preparation; do not remove those restrictions just to make buttons active.

An interface stop button is not a physical emergency stop. Offline checks and confirmation dialogs do not establish machine safety. Supervised hardware testing is still required before relying on this interface.

## Code map

| Files | Purpose |
| --- | --- |
| `touch/index.html`, `touch/simulation.html` | Real-interface entry point and simulation entry point |
| `touch/touch-shell.*`, `touch/viewport-fit.*` | Navigation and display layout |
| `touch/job-controls.js`, `touch/job-dashboard.js`, `touch/job-stream.js` | Job interaction, dashboard and state transport |
| `touch/shared-library.js`, `touch/library-preview*.js`, `touch/library-payload.js` | File library, worker preview and upload payload preparation |
| `touch/probe-*.js`, `touch/dry-motion.js` | Probe preparation and movement preflight UI |
| `touch/real-motion.js` | Real jog and origin panel, built only when the server enables it |
| `touch/program-check-view.js`, `touch/real-history.js`, `touch/projects.js` | Server travel check display, Journal → Serveur, project sheets |
| `touch/numeric-pad.js`, `touch/job-preparation.js` | Shared numeric pad, guided job preparation |
| `touch/strip-guard.js`, `touch/screen-lock.js` | Pause and Arrêter kept active under every overlay; screen lock |
| `touch/perf-harness.js` | Opt-in (`?perf=1`) on-device measurement badge and JSON report |
| `test-*.cjs`, `dom-fixture.cjs`, `verify-project.cjs` | Offline browser-side regression suite |
| `gcode-corpus/` | Shared G-code programs with their expected results, read by Jest (`corpus.test.js`) and `test-gcode-corpus.cjs` |
| `browser-run.cjs`, `browser-strip.cjs`, `layout-exceptions.json`, `measure-*.cjs` | Headless Chrome harness (`--strict` in CI; documented exceptions, empty), Pause/Arrêter under overlays, and PC-only performance measurements (start-up, job replay, library and uploads, classic visualizer, message overlay); see TESTING.md |
| `build-bundle.cjs` | Optional bundled copy of the pages (one script, one style sheet per page, content-hashed names, original files kept); `--check` for determinism |
| `preview-server.cjs` | Local mock demo |
| `../../src/server/services/touch/`, `../../src/server/api/api.touch.js` | Job service (with `job-load.js`, `plate-probe.js`, `system-command.js`, `halt.js`), event stream, motion preflight, real motion (`motion.js`), control ownership (`control.js`), history, program check, projects, probe input and their HTTP routes (Jest tests alongside) |

## Integration status

The browser assets stay under `examples/cncjs-touch`; the backend is part of `src/server` (see above) and is registered behind the same express-jwt protection as the rest of the API, with an explicit `req.user` check so the development-mode bypass never reaches a machine command. This layout is proposed for review, not as an agreed upstream architecture. A standalone pendant repository may still be a better home if maintainers prefer it.

The service reads internal store/config/controller objects (`runner`, `sender`, `workflow`, `feeder`, `settings`) and was written against CNCjs 1.11.5 behaviour; those internal APIs should be reviewed against current master. **Compatibility with other controllers has not been established.** The backend filters for Grbl. Marlin, Smoothieware and TinyG support must not be inferred from CNCjs itself.

The touch pages are served by CNCjs itself since 2026-10-16: `settings.assets.touch` in `src/server/config/settings.base.js` mounts this `touch/` directory at `<route>/touch/` (so `http://<host>:<port>/touch/index.html` and `/touch/simulation.html`). Since 2026-10-29 the build ships this directory with the server: `yarn build-prod` (and `build-latest`, `build-dev`) copies `touch/` to `dist/cncjs/touch` (`output/cncjs/touch`) and writes `dist/cncjs/touch/VERSION.json` there (`scripts/copy-touch-assets.sh`: commit, branch, repository, build date, package version). `settings.base.js` (`findTouchAssets`) serves that copy first and falls back to `examples/cncjs-touch/touch` of the checkout, so the npm package, the Docker image and the electron bundles serve `/touch/` without a mount point or a manual copy. Installation, update, rollback and the compatibility matrix are in [INSTALL.md](INSTALL.md). Static assets are now registered before the session middleware in `src/server/app.js`, because loading and rewriting the session file for each of the ~60 page scripts made `session-file-store` fail with `EPERM` on rename under Windows and truncated the responses; the main app's assets benefit from the same ordering. No touch HTML or JavaScript was changed: the pages already derive their API base from the path before `/touch/`, load `/socket.io/socket.io.js` from the same origin and read the JWT the main CNCjs app stores in `localStorage` (`cnc` → `state.session.token`), so the operator must sign in to CNCjs at the server root once before opening the touch page. The shared library still needs a configured watch directory (`-w` or `watchDirectory`). The heartbeat timer of the event stream is `unref()`ed so a started service never keeps the process alive on its own; CNCjs installs no SIGINT handler, so Ctrl+C ends the process immediately, with open streams included. Test only against an isolated installation first, with physical controllers disconnected. Credentials, machine configuration, user G-code, local deployment scripts and operational logs are excluded from this contribution.

See [TESTING.md](TESTING.md) for the validation scope and [HANDOFF.md](HANDOFF.md) for the remaining work.
