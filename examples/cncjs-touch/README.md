# CNCjs Touch

A touchscreen interface for CNCjs, served by the CNCjs server of this fork at `/touch/`. It drives a **LUNYEE 4040 CNC** (Grbl_ESP32 board; its `$I` banner says `[VER:1.1f.20231030:]`) from a **Surface Pro 3** kiosk, and a laser from a **Surface RT** with the same pages. The layout was first inspired by KlipperScreen and was reorganised in November 2026 around the order of the work at the machine.

The project is developed with AI coding assistance by [@storm8488](https://github.com/storm8488). This maintainer documentation is in English; the design notes in [design/](design/README.md) are in French. The interface, the operator guidance and the journal exports are in French, English and Spanish (English and Spanish not reviewed by a native speaker).

## State (2026-11-21)

- **Installed version.** Commit `caf09b31` (2026-11-19) is the version installed on the CNC tablet, according to the operator; it is marked by the tag `tablette-2026-11-21` ([design/PROMPT-RANGEMENT-DEPOT.md](design/PROMPT-RANGEMENT-DEPOT.md), § 2). An earlier tag, `touch-v1.0.0`, marks the state of 2026-11-03.
- **The real machine.** The board was read and observed on the machine on 13 and 14 November 2026, and the first real jobs were run with the tablet on 14 November, with the interface of that date: three programs went to the end, with help at almost every step ([design/PROMPT-REFONTE-UI.md](design/PROMPT-REFONTE-UI.md), § 1 and field log § 3; board observations in [design/refonte/FIRMWARE.md](design/refonte/FIRMWARE.md) § 2). That session led to the redesign below.
- **The current version has not been through its trial protocol.** The redesign (15–16 November) and the five functions merged on 17 November were developed and checked on a PC only: fake controllers, the CNCjs Grbl controller on a simulated serial line, a LUNYEE simulator and headless Edge. Their reports record no trial on the CNC, the Surface Pro or the Surface RT ([design/refonte/RAPPORT.md](design/refonte/RAPPORT.md) § 10, [design/fonctions/RAPPORT.md](design/fonctions/RAPPORT.md) § 6). The step-by-step trial is [design/refonte/PROTOCOLE-ESSAI.md](design/refonte/PROTOCOLE-ESSAI.md); none of its steps is recorded as done.

### Not proven on the machine

- A software stop is not a physical stop, and the Arrêter button is not an emergency stop.
- The real braking of the board, `$J=G90` in work coordinates and the effect of `0x85` on this board (framing, F1).
- Homing cadence and work offset after homing, the exact travel limits, a reset at rest, `G38.3` without contact ([design/refonte/RAPPORT.md](design/refonte/RAPPORT.md) § 7; [design/refonte/FIRMWARE.md](design/refonte/FIRMWARE.md) lists seven observations of this board that no upstream code explains).
- No collision check against clamps; the 0.5 mm travel margin is not the firmware's exact rule; the work offset check (D2) proves the coordinates, not that the stock did not move ([design/refonte/RAPPORT.md](design/refonte/RAPPORT.md) § 4).
- No rendering checked on the kiosk's Chromium, on the RT (Chromium 106), on a real phone or on a real 1024 × 600 screen. Tap counts in the reports are computed, not measured.
- Real jog and work zeros stay behind `touch.motion.enabled` in `.cncrc` (off by default, [INSTALL.md](INSTALL.md), "Enabling real jog and work origins"); the arrows of step 3 and the framing need it. It was turned on in the `.cncrc` of the Surface Pro on 14 November 2026 at 00:40 according to [design/PROMPT-INTERFACE-REELLE.md](design/PROMPT-INTERFACE-REELLE.md); its current value is not recorded.

## What the interface does

Five steps in the order of the work, on a rail at the left; a check mark says what is done, a ring says the step to do. A bar at the bottom of each screen says what is missing, with the button that fixes it. Source: [design/refonte/SPEC-REFONTE.md](design/refonte/SPEC-REFONTE.md), "Ce qui change pour vous".

| Step | Content |
| --- | --- |
| 1 Machine | Connect, homing, read the board settings, recovery after an alarm (what happened, what is lost, what is kept). |
| 2 Fichier | Size, depth and whether the program fits in the machine as soon as a file is touched, then "Charger". |
| 3 Zéro pièce | Arrows, work zeros, "Autres zéros" (one axis zero at the machine origin, without motion), probing on a block, Z zero with a touch plate. |
| 4 Contrôle | Top and side drawings of where the program falls in the machine, verdict per axis, "Cadrer à vide" (F1), start. A program proven outside the travel does not start. |
| 5 Usinage | Progress, feed, spindle and rapid overrides, Pause, Arrêter, resume from a line, touch plate at the end or at a tool change pause. |
| Plus | Journal, Réglages, Mise en service, Guide, Macros. |

The top strip always shows the machine state, "La main" (which device pilots the machine), Pause and Arrêter. A button that cannot be used stays in place, struck through, with its reason. Confirmations keep their check box before every movement. On the laser tablet: the same screens in the same order, without the probe and the 3D view. Two settings are kept apart: **Type de machine** (CNC / Laser) and **Performances de cette tablette** (Éco without WebGL, used on the RT; Performance with WebGL, measured on the Surface Pro 3), see [PROFILES.md](PROFILES.md).

### Delivered

Redesign of 15–16 November 2026 (branch `feat/refonte-ui`, commits listed in [design/refonte/RAPPORT.md](design/refonte/RAPPORT.md) § 8), among others:

- D1: a program proven outside the travel does not start; an override needs a second, logged confirmation (`c57e3e2e`).
- D2: the work offset is proven against `$#` before a start, a probe or a framing (`263e1303`).
- D3 kiosk backlight and D4 settings read and machine-origin zero (`7ec0c194`).
- No start and no work zero without the machine reference (`0c36dfb0`); every stop ends the server sequences (`060bfb6c`); jog step and speed in one tap (`580b1773`).

Functions merged on 17 November 2026 ([design/fonctions/RAPPORT.md](design/fonctions/RAPPORT.md)):

| Id | Function | Commit |
| --- | --- | --- |
| F1 | Framing in the air on the CNC: Z rises alone, the rectangle is followed spindle off, then back above the start. Refused while `$20=0` (the board was at `$20=0` on 16 November). | `13744360`, merge `b7471fb7` |
| F4 | Give back the hand (refused during a job). | `78007f6a` |
| F5 | Automatic reconnection of the last port, one try, with a setting to turn it off. | `e67d682c` |
| F10 | Automatic reload after an installation, 10 s banner, only at rest. | `766de67e` |
| F16 | Small screens and portrait. | `ddf1ae1d` |

After the merge, `caf09b31` (19 November): progress by acknowledged lines for a program of 2,000 lines or more, one sentence about the device in control, no resume button while the job runs.

Earlier functions still present (resume from a line, touch plate, overrides, macros, server job history, project sheets, commissioning assistant, server travel check, depth and fixed 3D views) are described in [HISTORY.md](HISTORY.md) at their date; their place on the screens is now the one above.

### Not delivered

- **F2 "Pause et dégager"**: written, refused for installation by the fourth safety review (two dangers left), not merged. Its code is published on the branch `idees/F2-pause-degager`; its documents are in [design/fonctions/](design/README.md) and marked "Non installé".
- The other proposed functions (I-01 to I-24, among them I-23 resume after a power cut and I-24 reference Z after a tool change) are in the register [design/refonte/IDEES.md](design/refonte/IDEES.md).

## Install

[INSTALL.md](INSTALL.md): build (`yarn install --immutable`, `yarn build-prod`), npm package, Docker, the Surface RT under PM2, settings in `.cncrc`, update, rollback and the checks after installation (`/touch/`, `/touch/VERSION.json`, `/api/custom/health`; `bash scripts/test-installed-package.sh`). The server needs Node.js 18 or newer. Sign in to CNCjs at the server root once: the touch pages reuse its session. The installation of the Surface Pro kiosk is not described in this repository.

## Try it without a machine

Use Node.js 22.12 or newer: the demo loads the job service from `src/server` as a native ES module (the offline suite itself still runs on Node.js 18). These commands require no npm packages and do not connect to a CNC controller:

```sh
cd examples/cncjs-touch
node verify-project.cjs
node preview-server.cjs
```

Open the localhost URL printed by the preview server. It serves a local visual fixture with synthetic files, a virtual controller and simulated progress. Stop it with Ctrl+C. The mock controller rejects physical commands. The fixture is for local evaluation only; do not deploy its fake authentication or mock responses to a real CNCjs server.

## Tests

[TESTING.md](TESTING.md) describes every suite, harness step and measurement. The checks required before a change is kept:

```sh
node examples/cncjs-touch/verify-project.cjs
npx jest src/server/services/touch src/server/services/cncengine src/server/api grbl-simulator --coverage=false
node examples/cncjs-touch/browser-run.cjs --strict    # headless Edge or Chrome
```

Last documented results, after `24f68a4e` (17 November): `verify-project` 230/230; Jest 57 suites, 1,761 tests; harness `--strict --only responsive,strip,e2e,small` green, no strict violation ([design/fonctions/RAPPORT.md](design/fonctions/RAPPORT.md) § 5). The other harness steps (`settings`, `screens`, `v2`, `sim`, `startup`, `rail`, `parcours`, `measure`) were not run then. The CI (`.github/workflows/ci.yml`) runs `yarn lint`, `yarn test`, `verify-project.cjs` and `browser-run.cjs --strict`.

The Grbl 1.1h simulator bridge is in [grbl-sim/](grbl-sim/README.md); the shared G-code programs with their expected results are in `gcode-corpus/`.

## Safety

The rules and the states the server enforces (start, resume, travel check, work offset proof, moves, zeros, probes, stops, control between devices, backlight) are in [design/refonte/SURETE.md](design/refonte/SURETE.md), with one section per later function. The server keeps the guards; the page only shows them. An interface stop button is not a physical emergency stop, and offline checks do not establish machine safety: follow [design/refonte/PROTOCOLE-ESSAI.md](design/refonte/PROTOCOLE-ESSAI.md) before relying on a new version.

## Screen brightness

Réglages has a **Luminosité** card. It drives `/sys/class/backlight/*/brightness` on the computer running CNCjs through `GET`/`POST /api/touch-backlight` (`src/server/services/touch/backlight.js`); the last level is stored in `.cncrc` (`touch.backlight.percent`) and applied again when CNCjs starts. The brightness file belongs to root, so CNCjs needs write access through a udev rule. On a Raspberry Pi OS style system where the CNCjs user is in the `video` group, run once:

```sh
echo 'ACTION=="add", SUBSYSTEM=="backlight", RUN+="/bin/chgrp video /sys/class/backlight/%k/brightness", RUN+="/bin/chmod g+w /sys/class/backlight/%k/brightness"' | sudo tee /etc/udev/rules.d/90-backlight.rules
sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=backlight --action=add
```

Without it the card says the setting is blocked and sends nothing. The behaviour during the screen saver is described in [HISTORY.md](HISTORY.md), "Screen brightness".

## Where to find what

| Looking for | Where |
| --- | --- |
| Page code (served at `/touch/`) | [touch/](touch/) (`index.html`; `simulation.html` is excluded from the tablet by `tablet-exclude.txt`) |
| Server side: job service, event stream, motion, control, history, routes | `../../src/server/services/touch/`, `../../src/server/api/api.touch.js` (Jest tests alongside) |
| Organisation of the screens, in force | [design/refonte/SPEC-REFONTE.md](design/refonte/SPEC-REFONTE.md) |
| Safety rules | [design/refonte/SURETE.md](design/refonte/SURETE.md) |
| The board's firmware and its observed oddities | [design/refonte/FIRMWARE.md](design/refonte/FIRMWARE.md) |
| Trial protocol on the machine | [design/refonte/PROTOCOLE-ESSAI.md](design/refonte/PROTOCOLE-ESSAI.md) |
| Functions proposed, done or set aside | [design/refonte/IDEES.md](design/refonte/IDEES.md) |
| Report of the redesign / of the 17 November functions | [design/refonte/RAPPORT.md](design/refonte/RAPPORT.md), [design/fonctions/RAPPORT.md](design/fonctions/RAPPORT.md) |
| Index of every design document, current and historical | [design/README.md](design/README.md) |
| Installation, update, rollback | [INSTALL.md](INSTALL.md) |
| Tests, harness, measurements | [TESTING.md](TESTING.md) |
| Machine type and tablet performance profiles | [PROFILES.md](PROFILES.md), [PROFILES-CONTRACT.md](PROFILES-CONTRACT.md) |
| Third-party notices of the page | [touch/THIRD-PARTY-NOTICES.md](touch/THIRD-PARTY-NOTICES.md) |

## History

These documents were written before the machine was available or before the redesign; they are kept as they are, with their date:

- [HISTORY.md](HISTORY.md): the dated sections this README carried until 2026-11-06 ("Machine type and tablet performance", "Audit 2026-10", "Full pass", "Depth and fixed 3D views", "Pendant features", "Z zero with a touch plate", "Resume from a line and tool change", "UI 2027", "Server integration" with the table of the touch routes, "Job progress, overrides and macros", "System tab in the settings", "Network, history, tablet actions and clock", "Code review before the machine", "Alarm help and travel check", "Second pass", "Commissioning assistant", "Grbl simulator", "Readable settings", "Screen brightness", "Preview performance pass", "Previous handoff", "What is included", "Code map", "Integration status").
- [AUDIT-2026-10.md](AUDIT-2026-10.md): audit and fixes of 29–30 October 2026 (31 items).
- [HANDOFF.md](HANDOFF.md): call for hardware testers of 3 November 2026, written when no CNC was available.
- [BUGHUNT-MAP.md](BUGHUNT-MAP.md), [BUGHUNT-PROMPT.md](BUGHUNT-PROMPT.md), [bughunt/](bughunt/FINDINGS.md): bug hunts of November 2026.
- [PERFORMANCE-UI-SPEC.md](PERFORMANCE-UI-SPEC.md), [PERFORMANCE-UI-BRIEF.md](PERFORMANCE-UI-BRIEF.md): the "Performance UI" work of 5–6 November 2026.

## Integration status

The page lives under `examples/cncjs-touch/touch`; the backend is part of `src/server` and sits behind the same JWT protection as the rest of the CNCjs API. The backend filters for Grbl: compatibility with Marlin, Smoothieware or TinyG has not been established. Route names, French server messages and the `{message}` error shape were kept as the page expects them ([HISTORY.md](HISTORY.md), "Server integration").
