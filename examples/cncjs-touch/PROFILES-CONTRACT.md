# Machine type and tablet performance — shared contract (lots A/B/C/D)

Base: `master` at `fb747bf0`, branch `feat/touch-profiles`. Baseline before any change: `node verify-project.cjs` 99/99 (Node 26.13, acorn present), `npx jest src/server/services/touch` 808/808.

Rules for every lot: no push, no merge, no commit (the integrator commits per lot), no command to a physical machine, no new npm dependency, browser code stays ES5-style IIFEs that parse in Chromium 106 (no optional chaining is fine there, but keep the surrounding style), every user-facing string in French in the code with EN/ES rows in the lot's own messages file. Do not edit a file owned by another lot; if you need a change there, write it in your report.

## 1. Two settings, two scopes

| Setting | Values | Scope | Storage |
| --- | --- | --- | --- |
| Type de machine | `cnc`, `laser` | server, per machine identity | `.cncrc`, `touch.machines` |
| Performances de cette tablette | `eco`, `performance` | this browser only | `localStorage` `cncjs-touch-performance-v1` = `{"version":1,"profile":"eco"\|"performance"}` |

- Default performance profile: `eco`. An absent, unreadable or unknown value reads as `eco` and is never rewritten silently. Existing keys (`cncjs-touch-display-v1`, view choices, …) are left untouched, so a rollback to the previous pages keeps working.
- No machine kind is ever stored in the browser.

## 2. Server: machine identity and profile (lot A)

A machine record in `.cncrc`:

```json
"touch": { "machines": [ { "id": "m-<12 hex>", "label": "Laser atelier", "kind": "laser", "signature": "<hex>", "createdAt": "...", "updatedAt": "..." } ] }
```

- `signature`: SHA-256 (hex, 16 chars kept) of the firmware family plus the Grbl settings that describe the mechanics and do not change with the operator's work: `$100-$102`, `$110-$112`, `$120-$122`, `$130-$132`, `$22`, `$23` (missing ones as empty). Not `$30-$32` (they are checked for coherence instead), not the port name. The port is only a hint shown to the operator.
- Matching: exactly one record with the signature → `match: 'signature'`; none → `'none'`; several → `'ambiguous'`; settings not read yet (`$$` unknown) → `'unknown'`.
- Each controller snapshot (the object the tablet receives as `detail.machine` in `cnc-job-status`) gains:

```js
machineProfile: {
  version: 1,
  id: 'm-…' | null, label: '' , kind: 'cnc' | 'laser' | null,   // null when not associated
  match: 'signature' | 'none' | 'ambiguous' | 'unknown',
  signature: '<hex>' | null, portHint: '/dev/ttyUSB0',
  laser: { mode: 0|1|null /* $32 */, sMax: number|null /* $30 */, sMin: number|null /* $31 */ },
  coherent: true | false,
  issues: [ { code: 'ETOUCH_MACHINE_…', params: {…} } ],   // coded, translated by the tablet
  canChange: true | false, changeReason: '' ,                 // set-kind possible now?
  capabilities: { /* see §3 */ }
}
```

- Effective behaviour: `kind === 'laser'` → laser behaviour. `kind === 'cnc'` or `null` → existing CNC behaviour (unchanged for current users), except that `$32 = 1` with a CNC or unassociated profile is an incoherence (`coherent: false`, issue `ETOUCH_MACHINE_LASER_MODE_ON`) and blocks every CNC operation that turns the spindle (spindle test, CNC resume preamble, tool-change spindle restart, plate probe). `kind === 'laser'` with `$32 = 0` or unknown is an incoherence (`ETOUCH_MACHINE_LASER_MODE_OFF`) and blocks every laser operation that could emit (laser resume) while framing stays possible (it never emits).
- Action: `POST api/touch-job` with `{action: 'machine', operation: 'set-kind', port, generation, kind: 'cnc'|'laser', label}` and `{action: 'machine', operation: 'forget', port, generation}`. Guarded like the other machine actions (pilot only, `ECONTROL` otherwise), allowed only at rest: controller fresh, Idle, no job/pause/homing/probe/load/host command, `$$` read. It writes `.cncrc` only; it never sends anything to the controller and never changes `$30`, `$31`, `$32`. Refusals carry `ETOUCH_MACHINE_*` codes. The change is recorded in the durable history (`event: 'machine'`).

## 3. Capabilities (`machineProfile.capabilities`)

Every flag is `{ supported: bool, reason: '' , code: '' }`; `reason`/`code` explain a `false`. The server enforces each one; the tablet only hides or disables.

| Flag | CNC | Laser |
| --- | --- | --- |
| `spindleTest` | existing rules | refused (`ETOUCH_LASER_NO_SPINDLE_TEST`) |
| `plateProbe` | existing rules | refused |
| `toolChange` | existing | refused (no `M6` handling for a laser) |
| `resume` (`mode: 'cnc'`) | existing resume | refused |
| `laserResume` | refused | §4 |
| `laserFrame` | refused | §4 |
| `focus` | refused | procedure only (no command) |

## 4. Laser operations (lot A, server)

- **Framing** (`action: 'machine', operation: 'frame-prepare'` → ticket, then `operation: 'frame'` with the ticket nonce): moves around the XY bounding box of the loaded program at the current Z, with `M5` sent first, as bounded `$J=G90 G21 X… Y… F…` lines (cancellable with the existing jog stop / Stop). Requires `touch.motion.enabled`, the program check validated inside the travel (homed), Idle, fresh, pilot, laser profile. Never sends `M3`/`M4`/`S>0`. Ticket expiry, generation, fingerprint of the loaded file: as the existing confirmations.
- **Laser resume** (`action: 'resume'`, existing fields, `mode: 'laser'` selected by the server from the profile): only from a pass/object boundary that the server can identify in the program (laser off: `M5`, `S0`, or a `G0` after cutting moves, at the start of a new rapid). Preamble: `M5`, units, distance, WCS, `G0` to the XY start, no Z move unless the program's Z is constant and known, then the replayed `M3`/`M4` and `S`, no dwell, no plunge. Otherwise `ETOUCH_LASER_RESUME_*` refusals with the reason. Requires `$32 = 1`.
- **Resume preview** (both kinds): the existing resume preparation also returns `{ preview: { version: 1, fingerprint, fromLine, preamble: ['…'], kind } }`, the exact lines the server will send before `fromLine` of the same file. The tablet draws `preamble` then the original file from `fromLine`; it never recomputes a resume.
- **Program check** additions for a laser: `S` values above `$30` flagged, `M3` (constant) vs `M4` (dynamic) reported, "consigne S" wording, never "power".

## 5. Tablet events and API (lot B owns `touch/tablet-profile.js`)

```js
window.cncProfile = {
  performance: function () {},                // 'eco' | 'performance'
  setPerformance: function (p) {},            // persists locally, fires the event, never reloads
  machine: function () {},                    // the last machineProfile seen, or null
  kind: function () {},                       // 'cnc' | 'laser' | null (effective, from the server)
  capability: function (name) {},             // {supported, reason, code} or {supported:false, reason:'…'}
  loadAdvanced: function (files) {}           // Promise; injects touch/<file> scripts once; rejects in eco
};
// Fired on window after any change of either setting (also when the server's profile changes):
new CustomEvent('cnc-profile-change', { detail: { performance, kind, machine, previous: { performance, kind } } });
```

- Body classes, kept in sync: `perf-eco` | `perf-performance`, `machine-cnc` | `machine-laser` | `machine-unknown`.
- Changing the performance profile never sends a command, never reloads the page, never replays anything; an open Performance view releases its resources when the profile goes back to `eco`.
- Advanced files are NOT in `index.html`; they are only reachable through `loadAdvanced` (lot C: `preview-gl.js`).

## 6. Preview data (lot C)

- Sidecar `preview` gains `version: 3` fields, all optional, older sidecars still read: `segments` (light: none; advanced data computed on demand in a worker and cached by fingerprint), `estimate: { version: 1, seconds, known: bool, unknowns: [{kind, line}] }`, `laser: { sMax, hasM4, emittingLength, travelLength }`.
- `path3d` version 1 is kept; any new packed data gets its own version field.
- The simplified geometry is never sent to the controller and never described as an exact measurement.

## 7. File ownership

| Lot | Owns (create or edit) |
| --- | --- |
| A Serveur | `src/server/services/touch/**` (new `machine-profile.js`, `laser.js`, edits to `job-service.js`, `resume.js`, `program-check.js`, `motion.js`, `projects.js` if needed), `src/server/api/api.touch.js`, `touch/i18n-messages-machine.js` (ETOUCH_MACHINE_*/ETOUCH_LASER_* rows), `test-server-messages.cjs`, `src/server/services/touch/__tests__/touch-codes-catalog.js`, new Jest tests |
| B Interface | `touch/tablet-profile.js` (new), `touch/display-settings.js`, `touch/settings-list.css`, `touch/system-monitor.js`, `touch/backlight.js` (labels only), `touch/status-strip.js`, `touch/ui-2027.css`, `touch/touch-shell.*`, `touch/viewport-fit.*`, `touch/app.css`, `touch/design-tokens.css`, new `touch/responsive.css`, `touch/i18n-messages-profiles.js`, `touch/job-controls.js` and `touch/job-preparation.js`, `touch/commissioning.js`, `touch/job-resume.js` (CNC/laser adaptations of existing procedures), `browser-run.cjs`, `layout-exceptions.json`, new `test-tablet-profile.cjs`, `test-responsive*.cjs` |
| C Visualisation | `touch/toolpath-3d.js`, `touch/preview-3d.*`, `touch/preview-viewer.*`, `touch/library-preview*.js`, `touch/job-dashboard.js`, `touch/tool-position.js`, `touch/job-follow.js`, `touch/projects.js` (stock/clamps display), new `touch/preview-gl.js`, `touch/motion-estimate.js`, `touch/preview-inspect.js`, `touch/preview-advanced.css`, `touch/laser-view.js`, `touch/i18n-messages-viz.js`, matching `test-*.cjs` and `measure-*.cjs` |
| Integrator | `touch/index.html`, `touch/simulation.html`, `touch/i18n-messages.js`, `verify-project.cjs`, `preview-server.cjs`, `build-bundle.cjs`, docs (`README.md`, `TESTING.md`, `HANDOFF.md`, `INSTALL.md`), this contract |
| D Validation | read-only review, new `test-scenario-*.cjs` and Jest scenario tests only |

Script tags for every new file listed above are already in `index.html` and `simulation.html` (stubs exist); register new tests by listing them in your report, the integrator adds them to `verify-project.cjs`.
