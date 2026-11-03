# Machine type and tablet performance (2026-11)

One interface for a CNC and a laser, with two independent settings in Réglages. The shared contract the work was built on is in [PROFILES-CONTRACT.md](PROFILES-CONTRACT.md). Nothing below was run on a machine, a laser, the Surface RT or a Surface Pro 3: the results come from a development PC, headless Chrome, fake controllers and the Grbl 1.1h simulator (see "What was tested").

## The two settings

| Réglages row | Values | Scope | Where it is stored |
| --- | --- | --- | --- |
| **Type de machine** (badge « Serveur CNCjs ») | CNC / Laser | the machine, for every device | `.cncrc`, `touch.machines` |
| **Performances de cette tablette** (badge « Cette tablette ») | Éco / Performance | this browser only | `localStorage` `cncjs-touch-performance-v1` = `{"version":1,"profile":"eco"\|"performance"}` |

The four combinations are independent: CNC Éco, CNC Performance, Laser Éco, Laser Performance. The layout adapts to the screen in every profile.

### Type de machine

- **Identity.** The server recognises a machine by a signature of its firmware version and its mechanics settings (`$100-$102`, `$110-$112`, `$120-$122`, `$130-$132`, `$22`, `$23`), not by its port name, which may change. The port is shown as a hint. Until `$$` has been read the machine is « réglages $$ pas encore lus ». Changing one of those settings makes the machine unknown again: declare its type again (an explicit choice, never a guess).
- **Change.** Only the device that pilots the port, machine at rest (fresh state, Idle, no job, pause, homing, probe, load or host command, `$$` read). The row is a plain switch: one tap on CNC or Laser sends the choice, no name to type and no confirmation panel (the server keeps the machine's existing name, or « CNC » / « Laser »). The server writes `.cncrc` only: it sends nothing to the controller and never changes `$30`, `$31` or `$32`. The server's `forget` operation (to clear « plusieurs fiches correspondent ») has no button; remove `touch.machines` from `.cncrc` with CNCjs stopped instead. Each change is in Journal → Serveur.
- **Simulation page.** The virtual controller carries its own simulated type, chosen in the same row: it changes only the simulation page's display (status strip « Consigne S », Suivi labels, laser view), is kept in this browser (`cncjs-touch-sim-kind-v1`) and never reaches the server or `.cncrc`. Framing and laser resume are not simulated (shown unavailable with that reason); the commissioning assistant is on the real page only.
- **Unknown type.** The CNC interface stays, with « Type de machine non confirmé » in Réglages. This is the behaviour of every existing installation until a type is chosen.
- **Coherence with `$32`.** `$32=1` (laser mode) with a CNC or unknown type blocks everything that turns the spindle (spindle test, touch plate, tool-change restart, CNC resume) until the type is set to Laser or `$32` is changed by the operator. A laser type refuses to start any job while the board reports `$32` other than 1 (with `$32=0`, `M3`/`M4` would stay on along every `G0`); framing stays possible (it never emits). CNC and unassociated machines start normal jobs as before.
- **Checked again at start.** A loaded resume is refused at start when the mode the server would choose now differs from the one it was built for (type changed after the load, `$32` changed by another client): `ETOUCH_MACHINE_RESUME_MODE_CHANGED`, `ETOUCH_MACHINE_LASER_MODE_ON` / `_OFF`.

### CNC

Unchanged procedures: stock preparation, tool, origin, touch plate Z zero, tool change, resume from a line. The resume confirmation can show the server's resume path (preamble then program, from the server's own plan).

### Laser

The exact laser model is unknown, so the support is by capability, enforced by the server; the tablet only hides or disables with the server's reason.

| Operation | Laser profile |
| --- | --- |
| Spindle test (commissioning) | replaced by a safety and focus checklist: no command |
| Touch plate Z zero, tool change (`M6`) | refused (`ETOUCH_LASER_*`) |
| Resume from a line (CNC: clearance, spin-up dwell, plunge) | refused |
| **Laser resume** | only at a pass/object boundary the server identifies (a `G0` in X/Y with the laser off: `M5`, `S0`, or right after a cut); preamble `M5`, units, distance, WCS, `G0` to the XY start, `G0 Z` only when the program keeps one known constant Z (refused if Z varies), then the replayed `M3`/`M4` and `S`, no dwell, no plunge; requires `$32=1` |
| **Framing** | `M5` first, then bounded `$J=G90 G21 X… Y… F…` lines around the program's XY outline at the current Z, one at a time; behind the usual confirmation ticket; requires `touch.motion.enabled`, homing, the program inside the travel, the program's WCS active; Arrêter stops it; never `M3`/`M4`/`S>0` |
| Program check | `S` above `$30` flagged, `M3` (constant) or `M4` (dynamic) reported |

**Axe Z du laser** (Réglages, laser profile only, this browser: `cncjs-touch-laser-z-v1`): Affiché by default; Masqué hides the Z coordinates and the Z controls (Z rows, Zéro Z, Z+/Z−) for a laser without a Z axis, and renames « Zéro XYZ » to « Zéro XY » (the simulated zero then sets X and Y only) and « Palpage X / Y / Z » to « Palpage X / Y ». It only changes the display: nothing is sent to the machine, the server's checks are unchanged, and the CNC profile always shows Z.

Wording: « consigne S » (the S set point the program asks for), never a power: nothing measures the optical power.

### Performances de cette tablette

- **Éco** (default; also what an absent, unreadable or unknown value reads as, without rewriting it): the 2D preview, the four fixed views, the workers and caches as before. The advanced modules are not loaded (`preview-gl.js` is never requested). Commands, state freshness, keepalives, Pause and Arrêter are not slowed down.
- **Performance**: « 3D libre » on previews that have a 3D path. `preview-gl.js` (a small WebGL 1 line renderer, no three.js) is loaded on demand through `cncProfile.loadAdvanced`. Rotation, pinch, pan, recentre and preset views; Z at real scale by default, every exaggeration labelled « Z ×n (exagéré) »; drawn on change only, canvas resolution capped (DPR ≤ 1.5), 30 frames/s at most during a gesture. Closing the view, leaving the screen, switching to Éco or a lost WebGL context releases buffers, program, context, listeners and the inspection worker; the fixed views stay as the fallback. A camera gesture stays in the canvas and never reaches a jog control. Filters (rapids, Z range, line interval; tools and operations only when the program names them) and segment inspection (source line, coordinates, feed, S; « géométrie simplifiée » for the decimated point).
- Changing the profile applies at once: no reload, no request, no command, nothing replayed.
- **Diagnostic de cette tablette** (in the same row, at rest only): CSS window, visible area (virtual keyboard), DPR, profile, Worker/OffscreenCanvas/WebGL and its renderer, a 20 000-segment drawing timed in Canvas 2D and in WebGL, exported as JSON. It sends nothing; the WebGL context it opens is released at once. It is a single measurement, not a benchmark during a job.

## Previews (both profiles unless stated)

- **Laser view**: XY image coloured by S set point (scale `$30` when known), non-emitting moves dashed; available in Éco. With a laser profile it is the only view (2D, fixed and free 3D views hidden); the CNC choice comes back with the CNC profile.
- **Suivi**: « parcours prévu », lines « acquittées par Grbl » (accepted, not necessarily cut), position « rapportée par Grbl il y a N s ».
- **Motion-based time estimate** under the line-count estimate: distances, feeds, rapids (`$110-$112`), arcs, `G4`; pauses, tool changes, `G28`/`G30`, probing and missing feeds listed as unknown, with no invented duration; corrected during the job from the acknowledged lines. No acceleration model.
- **Stock and clamps**: stock from the project sheet (assumed corner X0 Y0, top at Z0, stated on screen), clamps entered by hand and kept in this browser per program fingerprint (`cncjs-touch-clamps-v1`). Drawn in the free view and the resume preview. « Aucune garantie anticollision ».
- **Sidecar** `preview.version: 3` adds `estimate` and `laser`; versions 1 and 2 are still read, and what an old sidecar cannot tell is listed. **Export / import** of a preview between two independent servers (Fichiers): only the preview fields travel, checked against the program's fingerprint on the receiving server; never machine settings or control.

## Layout

`touch/responsive.css` lays every screen out from the real CSS width and height (with `visualViewport`, so a virtual keyboard counts); `viewport-fit.js` no longer scales below 1 when it is loaded. Comfortable landscape: path and controls side by side, columns widened with `clamp()`. Narrow window (≤ 899 px): one column, controls before the path. Low window (≤ 560 px): screens as tall as their content, the content scrolls. Portrait: rail at the bottom, status strip on two lines. « Agrandir le tracé » enlarges the path (inspection). Targets stay 64 px (primary) and 48 px (secondary), useful text ≥ 16 px; Pause and Arrêter stay reachable under every overlay and in alarm. Selection, screen and inspection mode survive a rotation or a resize without reload.

A Surface Pro 3 (2160 × 1440, 3:2) shows about 1440 × 960 CSS px at 150 % scaling or 1080 × 720 at 200 %; the Surface RT 1366 × 768 at 100 %. Both are among the sizes checked.

## Rollback

- **Pages**: install the previous build (INSTALL.md, "Rollback"). The new keys are ignored by older pages: `cncjs-touch-performance-v1` and `cncjs-touch-clamps-v1` in the browser, `touch.machines` in `.cncrc`. The existing display preferences (`cncjs-touch-display-v1`) were not changed, so they keep working in both directions. Version 3 sidecars are read by older pages as before (the extra fields are ignored).
- **Machine type only**: CNCjs stopped, remove `touch.machines` from `.cncrc`. The machine then uses the CNC interface again.
- **Performance only**: choose Éco in Réglages, or remove `cncjs-touch-performance-v1` from the browser's site data.

## What was tested

On a Windows PC (Node 26.13, headless Chrome), no machine, no tablet:

- `node examples/cncjs-touch/verify-project.cjs`: 109/109 (99 before the change), with and without `acorn` installed (without it, a bundle syntax error now gives its line number from Node's own parser: the 98/99 of the 2026-10 audit under Node 24 was a product defect of `build-bundle.cjs`, fixed there, the test unchanged), including `test-tablet-profile.cjs` (four combinations, two browsers with independent storage, absent/corrupt/blocked storage, no reload/request/command on change, Éco refuses the advanced load), `test-tablet-diagnostic.cjs`, `test-preview-gl.cjs` (not loaded in Éco, released on close/Éco/context loss, fallback), `test-motion-estimate.cjs`, `test-laser-view.cjs`, `test-preview-sidecar.cjs`, `test-preview-inspect.cjs`, `test-job-motion.cjs`.
- `npx jest src/server/services/touch`: 847/847 (808 before; the 808 unchanged); whole `npx jest`: 1534 passed, 4 skipped. Including `machine-profile.test.js`: identity and persistence, set-kind/forget refusals (not pilot, busy, `$$` unknown, stale state, generation), `$32` incoherence, every laser refusal, framing lines and refusals, laser resume boundaries and refusals, resume preview equal to the preamble sent, program check `S`/`M3`/`M4`.
- Independent review (a separate agent that wrote none of the code): `scenario-profiles.test.js` and `test-scenario-profiles.cjs` cross the server, the tablet profile and the pages. It found that `$32` and the machine type were checked when a resume was loaded but not when it was started (a laser resume could start after `$32` went to 0, a CNC preamble after the machine was declared laser); fixed by the start re-check above, the tests kept unchanged.
- `node examples/cncjs-touch/browser-run.cjs --strict`: 0 violation; CSS viewports 1024×600, 1366×768, 1440×960, 1080×720, 1280×800, 1920×1080, 720×1080, 960×1440, 1180×820, 1600×900, 800×1280, 600×960; large text; zoom 150 % and 200 %; virtual keyboard (window height reduced); alarm; a sheet with the numeric pad over it; `elementFromPoint` hit tests on Pause and Arrêter on every screen; rotation keeping selection, screen and inspection mode; network check that Éco never requests `preview-gl.js`.
- PC measurements (JS only, WebGL stubbed, not GPU time): free view opening 17 ms for a 23 460-point path; under 0.02 ms of JS per frame during a 7.2 s simulated gesture; +2.1 MB while open and no growth over five open/close cycles; motion estimate of a 25 000-line file 12 ms; laser raster of 400 000 lines 250 ms. The 30 frames/s target during 3D handling is a goal to measure on the device, not a result.

## Known limits

- The identity is the mechanics signature: recalibrating `$100-$132` (or changing `$22`/`$23`) makes the machine unknown again, so its type must be declared again; until then it uses the CNC interface, and a laser with `$32=1` stays blocked for spindle operations (safe side).
- Two boards with identical firmware and mechanics settings share one record: declaring one declares the other.
- A CNC that already runs with `$32=1` now gets the spindle test, touch plate and CNC resume refused until `$32` is set back to 0 or the type is Laser.
- Framing stops at each corner (each line waits for Idle). It needs `touch.motion.enabled`, which stays reserved to the supervised protocol of HANDOFF.md, step 10.
- `.cncrc` write failures are not reported by CNCjs's config store: an unwritable file keeps the type in memory only until the next restart.
- The motion estimate has no acceleration model; the 3D view and inspection were measured with WebGL stubbed, not on a GPU.

## Validation on the Surface RT and the Surface Pro 3 (to do, not done)

Record for each run: CNCjs revision, browser and version, CSS window and DPR (from the diagnostic export), profile, controller/firmware, and whether it was the simulator or a machine. A passing PC test is not a device result.

**Both tablets, no machine connected or the Grbl simulator:**

1. Réglages → Performances: run « Diagnostic de cette tablette », export it. Expected: RT about 1366 × 768, DPR 1, WebGL unavailable or software; Pro 3 about 1440 × 960 at DPR 1.5 (or 1080 × 720 at DPR 2), WebGL on Intel HD 4400.
2. Two browsers at once (RT and Pro 3): set Performance on the Pro 3, reload the RT: the RT stays Éco. Reload the Pro 3: it stays Performance.
3. Every screen in landscape, then (Pro 3) in portrait, in standard and large text: no command covered, no text under 16 px, Pause and Arrêter reachable; open the on-screen keyboard in a numeric field: the field and Pause/Arrêter stay visible.
4. Éco on the RT: open Fichiers and Suivi with a large file; check in the browser's network panel (or the diagnostic) that `preview-gl.js` is not loaded. Note Suivi's CPU during a simulated job, compared with the 2026-10 figures in TESTING.md.
5. Performance on the Pro 3: « 3D libre » on a 3D program: rotate, pinch, pan, recentre, presets, a Z exaggeration (label shown). Measure frames per second during a gesture with `?perf=1`. Close the view, switch to Éco: memory returns near its level before opening. If WebGL fails, the fixed views remain with a message.
6. During a simulated job in Performance with the free view open: Pause, Reprendre and Arrêter act at once; a camera gesture never moves the machine (no `$J` in the CNCjs console).

**CNC (machine connected, HANDOFF.md rules: hand on the emergency stop):**

7. Réglages → Type de machine: CNC, from the pilot, at rest; refused from the other tablet (`ECONTROL`) and during a job. `.cncrc` gains `touch.machines`; `$$` unchanged before and after.
8. Resume preview: stop a program in the air, open « Reprendre à une ligne… »: the drawn preamble matches the lines listed by the plan.

**Laser (only after its own safety setup: enclosure, goggles, extraction, fire watch):**

9. With `$32=0` and type CNC, then with `$32=1` set by the operator from CNCjs's console: the spindle test, plate probe and resume must be refused with the `$32` explanation. Set the type to Laser.
10. Commissioning shows the laser checklist and sends nothing. Framing (requires `touch.motion.enabled` on the test bench, homed, program inside the travel): the head goes round the outline with the beam off; check with a card that nothing is marked; Arrêter stops it.
11. Laser resume: stop a multi-pass test program between two passes, resume at the suggested boundary: `M5`, move to the start, then the pass continues. A line inside a pass must be refused with its reason.
