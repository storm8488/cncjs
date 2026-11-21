// Job service for the touch interface: load, start, pause, resume and stop a
// program on a connected Grbl controller, with every state-changing action
// re-checked against a fresh controller report. Start and resume additionally
// require a short-lived confirmation ticket bound to the client's event
// stream, so a stale page or a replayed request cannot move the machine.
import crypto from 'crypto';
import { performance } from 'perf_hooks';
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { createPreflight, controllerStatus } from './motion-preflight.js';
// eslint-disable-next-line import/extensions
import { createProbeInput } from './probe-input.js';
// eslint-disable-next-line import/extensions
import { checkProgram } from './program-check.js';
// eslint-disable-next-line import/extensions
import { durationOf, createRunTime } from './program-time.js';
// eslint-disable-next-line import/extensions
import { createControl, SAFE_ACTIONS } from './control.js';
// eslint-disable-next-line import/extensions
import { createMotion, maxFeedOf, machinePositionKnown, MAX_JOG_MS, MIN_FEED, envelopeOf, limitsAt, usableOf } from './motion.js';
// eslint-disable-next-line import/extensions
import { createProfiles, describeProfile, machineRefusal, KINDS } from './machine-profile.js';
// Parts of the service behind explicit contracts (audit 31, E2): the
// orchestration, the guards and the public API stay here.
// eslint-disable-next-line import/extensions
import { createLoader, localFiles } from './job-load.js';
// eslint-disable-next-line import/extensions
import { createHalt } from './halt.js';
// eslint-disable-next-line import/extensions
import { createPlateProbe } from './plate-probe.js';
// eslint-disable-next-line import/extensions
import { createBlockProbe, blockParams } from './block-probe.js';
// eslint-disable-next-line import/extensions
import { createSystemCommands } from './system-command.js';
// eslint-disable-next-line import/extensions
import { createWorkOffset } from './work-offset.js';

// Kept exported from here for the existing callers and tests.
// eslint-disable-next-line import/extensions
export { changesOffset } from './job-load.js';

// A status report older than this is not trusted to describe the machine.
const MAX_REPORT_AGE_MS = 2500;

// A start/resume confirmation must be used within this window.
const TICKET_LIFETIME_MS = 15000;

// Grbl settings exposed to the client: report mask/units, max rates, max
// accelerations, travel limits and spindle range. The full list ($$) is only
// sent on request, for the commissioning backup.
const EXPOSED_SETTINGS = [20, 21, 22, 23, 30, 31, 32, 110, 111, 112, 120, 121, 122, 130, 131, 132];

// A running job is reported stalled when Grbl stays idle this long while CNCjs
// still waits for acknowledgements (a lost 'ok' or a line lost on the link).
const STALL_MS = 30000;

// Spin-up dwell when the spindle is started again after a tool change.
const TOOL_CHANGE_SPINUP_S = 3;

// Grbl sends no status report during a homing cycle: the cycle is taken as
// running from the $H until a report shows Idle or Alarm again (at least this
// long after it, so a report already on its way does not end it), an alarm,
// a board restart, or this limit.
const HOMING_MIN_MS = 1000;
const HOMING_MAX_MS = 180000;

const grblCode = (res) => {
  const n = Number(res && res.message);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
};

// Commissioning spindle test: the minimum speed ($31), or a quarter of the
// maximum ($30) when no minimum is set.
const settingNumber = (settings, n) => {
  const v = Number(settings['$' + n]);
  return Number.isFinite(v) ? v : null;
};
export const spindleTestSpeed = (settings) => {
  const max = settingNumber(settings, 30);
  const min = settingNumber(settings, 31);
  if (!max || max <= 0) {
    return null;
  }
  const speed = min && min > 0 && min <= max ? min : max / 4;
  return Math.round(speed);
};

// Every numeric setting read from $$, nothing else.
const allSettings = (c) => {
  const source = (c.settings && c.settings.settings) || {};
  const out = {};
  Object.keys(source).filter((k) => /^\$\d{1,4}$/.test(k)).forEach((k) => {
    const v = source[k];
    if ((typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length < 32)) {
      out[k] = v;
    }
  });
  return out;
};

const firmwareOf = (c) => {
  const v = c.settings && c.settings.version;
  return typeof v === 'string' && v.length < 64 ? v : '';
};

// Realtime override steps accepted by the Grbl controller commands
// (feedOverride / spindleOverride: reset, ±10 %, ±1 %; rapidOverride: 100/50/25 %).
const OVERRIDES = {
  feed: [0, 10, -10, 1, -1],
  spindle: [0, 10, -10, 1, -1],
  rapid: [0, 100, 50, 25]
};

// Grbl reports the active overrides as Ov:feed,rapid,spindle percentages.
const overridesOf = (state) => {
  const ov = state.ov;
  if (!Array.isArray(ov) || ov.length !== 3 || !ov.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null;
  }
  return { feed: ov[0], rapid: ov[1], spindle: ov[2] };
};

// Grbl reports the real feed rate and spindle speed as FS:feed,speed; CNCjs
// keeps them as status.feedrate and status.spindle.
// The status report itself gives X, Y and Z (MPos, or WPos turned into MPos by CNCjs): a report
// without coordinates would leave the ones CNCjs held before, 0 at start.
const explicitXyz = (payload) => ['mpos', 'wpos'].some((key) => {
  const p = payload && payload[key];
  return !!p && ['x', 'y', 'z'].every((axis) => ['string', 'number'].includes(typeof p[axis]) && String(p[axis]).trim() !== '' && Number.isFinite(Number(p[axis])));
});

// Machine position per axis (X, Y, Z) as CNCjs holds it now, null where not a number.
const homeMposOf = (c) => {
  const p = controllerStatus(c).mpos || {};
  const out = {};
  ['X', 'Y', 'Z'].forEach((axis) => {
    const v = p[axis.toLowerCase()];
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    out[axis] = typeof n === 'number' && Number.isFinite(n) ? n : null;
  });
  return out;
};

const realtimeValue = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

// Only names and ids leave the server; macro contents stay in the configuration.
const macrosOf = (config) => {
  return (config.get('macros') || [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m) => ({ id: m.id, name: m.name }));
};

// Errors carry an HTTP status so the API layer can answer without matching on
// message text.
const conflict = (message) => {
  const err = new Error(message);
  err.status = 409;
  return err;
};

// D1 (a start proven outside the travel) and the reference guards (C-05, C-18): refusals with a
// stable code, the values of their French message and, for ETOUCH_START_OUTSIDE, the coded
// overruns behind it (`reasons`, program-check.js).
export const START_MESSAGES = {
  ETOUCH_START_OUTSIDE: 'Départ refusé : le programme sort de la course de la machine (dépassements : {count}).',
  ETOUCH_START_NO_OVERRIDE: 'Départ hors course impossible : les limites logicielles de la carte ($20) ne sont pas actives, rien n’arrêterait le dépassement.',
  ETOUCH_START_OVERRIDE_UNSAFE: 'Départ hors course impossible : ce fichier peut modifier les protections de la machine. Utilisez un fichier sans commande système ni expression.',
  ETOUCH_START_OVERRIDE_CHANGED: 'Le programme, l’origine ou la machine ont changé depuis la confirmation du départ hors course : confirmez à nouveau.',
  ETOUCH_START_NOT_HOMED: 'Machine non référencée : faites la prise d’origine avant de démarrer.',
  ETOUCH_START_FEED_MODE: 'Reprise à une ligne refusée : la machine doit être en avance par minute (G94). Relisez son état ou remettez-la en G94.',
  ETOUCH_ORIGIN_NOT_HOMED: 'Machine non référencée : faites la prise d’origine avant de poser une origine.'
};

const startRefusal = (code, params = {}, reasons) => {
  const err = conflict(START_MESSAGES[code].replace(/\{(\w+)\}/g, (all, name) => String(params[name])));
  err.code = code;
  err.params = params;
  if (reasons) {
    err.reasons = reasons;
  }
  return err;
};

// F4: giving the hand back is refused during a job; same shape as the start refusals (stable code, no values).
const CONTROL_JOB_MESSAGE = 'Un usinage est en cours : la main ne se rend pas pendant l’usinage. Pause et Arrêter restent possibles.';
const controlJobRefusal = () => {
  const err = conflict(CONTROL_JOB_MESSAGE);
  err.code = 'ETOUCH_CONTROL_JOB';
  return err;
};

// Socket.IO commands that are not safe, refused while the server holds the machine (C-12, C-60):
// shown by CNCjs's own interface.
const SOCKET_PROBE_BUSY = 'Palpage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).';
const SOCKET_SYSTEM_BUSY = 'Commande système en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).';
const SOCKET_FRAME_BUSY = 'Cadrage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).';
// CNC framing (lot F1): no spindle speed reported and no recent $G to tell it is stopped.
const CNC_FRAME_SPINDLE_UNKNOWN = 'La broche tourne peut-être (vitesse non rapportée, état $G trop ancien) : arrêtez-la d’abord (M5).';
// Shared by the start rejection and the response to the stop that cancelled it.
const START_CANCELLED = 'Départ annulé.';

const hasAutomations = (config) => {
  return (config.get('events') || []).some((event) => event.enabled !== false);
};

// Durations (ticket lifetime, report age) are measured on a monotonic clock:
// the wall clock can be set back by NTP, which would keep a ticket alive.
const monotonic = () => performance.now();

// Actions that need the control lease when the port is owned by someone
// else; a touch client that identifies itself claims a free port with them.
// `machine`: type of machine and laser framing (PROFILES-CONTRACT §2, §4).
// `verifyOffset`: the proof of the work offset (D2, work-offset.js) starts again.
const GUARDED_ACTIONS = ['load', 'prepare', 'start', 'resume', 'macro', 'override', 'unlock', 'home', 'spindle', 'zeroZ', 'blockProbe', 'readSettings', 'set-origin', 'machine', 'verifyOffset'];

// Real moves (F1, motion.js): every `motion` operation is guarded like the
// actions above, except `jog-stop`, which is free for everyone like Stop.
const guarded = (body) => GUARDED_ACTIONS.includes(body.action) || (body.action === 'motion' && body.operation !== 'jog-stop');

// The existing service factory owns the controller lifecycle and its shared guard closures.
// eslint-disable-next-line max-lines-per-function
export const createService = (store, config, clock = monotonic, options = {}) => {
  const records = new Map();
  const listeners = new Set();
  const transports = new Set();
  // Transport id → actor ({kind, id, label, user}) whose presence it carries.
  const transportActors = new Map();
  let disposed = false;
  const files = options.files || localFiles(config);
  // Durable job history (F4) and attribution of control (F5), owned by the
  // caller in production; a service without them behaves as before.
  const history = options.history || null;
  const control = options.control || createControl();
  // D2 (work-offset.js): a factory called once per controller record; tests written before D2
  // give one that is always proven (__tests__/support/proven-offset.js).
  const workOffsetOf = options.workOffset || createWorkOffset;
  const log = (event) => {
    if (history) {
      history.record(event);
    }
  };
  // What the history keeps of a controller: port, type, firmware.
  const controllerInfo = (c, r) => ({ port: c.options.port, type: c.type, firmware: (r && r.firmware) || firmwareOf(c) });
  const jobInfo = (j) => (j ? {
    jobId: j.id, program: j.originalName, file: j.name, fingerprint: j.fingerprint, fromLine: j.resume ? j.resume.from : null
  } : {});
  const SYSTEM = { kind: 'system', id: 'grbl', label: 'machine' };
  // Line of the original file acknowledged when a job stops, kept for a resume
  // from a line (preamble lines of a resume are not lines of the file).
  const stopLine = (c, r) => {
    const k = Number(c.sender.state.received) || 0;
    const res = r.job.resume;
    if (!res) {
      return k;
    }
    return k <= res.preambleLength ? res.from - 1 : res.from + (k - res.preambleLength - 1);
  };

  const changed = () => {
    listeners.forEach((fn) => fn());
  };

  const controllers = () => store.get('controllers') || {};

  const jobProgress = (c, r) => {
    const j = r.job;
    if (!j || !j.runTime) {
      return null;
    }
    const now = clock();
    const state = controllerStatus(c);
    const fresh = Number.isFinite(r.seen) && now >= r.seen && now - r.seen <= MAX_REPORT_AGE_MS;
    return j.runTime(now, {
      fresh,
      workflow: c.workflow.state,
      activeState: state.activeState || '',
      overrides: overridesOf(state),
      ended: j.finishedAt !== null && j.finishedAt !== undefined,
      stopped: j.stopped,
      invalid: !!(!fresh || j.boardRestarted || j.errors || j.probeFailed || /^Alarm/.test(state.activeState || ''))
    });
  };

  // Deferred step of a stop, a probe or a spin-up, kept on the controller's
  // record so that forgetting the controller or disposing the service cancels
  // it: nothing runs, and no listener or command follows, once the record is
  // gone. `cancel` tells a waiting promise that its sequence was abandoned.
  const later = (c, r, fn, ms, cancel) => {
    const entry = { cancel };
    entry.handle = setTimeout(() => {
      r.timers.delete(entry);
      if (disposed || records.get(c) !== r) {
        return;
      }
      fn();
    }, ms);
    r.timers.add(entry);
  };

  const record = (c) => {
    if (disposed) {
      throw conflict('Service indisponible.');
    }
    if (!records.has(c)) {
      const r = {
        // Deferred steps (see later()).
        timers: new Set(),
        seen: null,
        modalSeen: null,
        wcs: null,
        job: null,
        loading: false,
        // C-13: a confirmed start re-reading its file, cancellable before gcode:start.
        starting: null,
        // A frame reserves its asynchronous fingerprint read before its first write.
        frameStarting: null,
        ticket: null,
        // Firmware seen in the startup banner or a $I reply, and how many
        // times the board restarted (an E-stop wired to reset restarts it).
        firmware: '',
        startups: 0,
        settingsRead: null,
        settingsAttempts: 0,
        settingsRetryAt: 0,
        // Last ALARM:n code, kept until the board restarts.
        alarm: null,
        // Incident retained through restarts and unlocks, until a homing completes.
        lastAlarm: null,
        // Since when Grbl is idle while the job waits for acknowledgements.
        stall: null,
        // Spindle state when a tool change (M6) pause began, to restart it on resume.
        toolChange: null,
        // Line (of the original file) acknowledged when the last job was stopped.
        lastStop: null,
        // Last resume plan checked (file, line, fingerprint), see job-load.js (E9).
        resumeChecked: null,
        // Plate probe in progress, and the last one (result or failure).
        probing: null,
        zeroZ: null,
        // Block probe (block-probe.js): the last one, in progress or over, and
        // when the last one failed (a new contact test is due after it).
        blockProbe: null,
        blockProbeFailedAt: null,
        // Homing cycle sent ($H) and not yet over (see HOMING_MIN_MS).
        homing: null,
        // A homing cycle was seen complete (ours, or a Home state followed by
        // Idle) since the last board restart or alarm: the only ground for the
        // travel check (F2). $22=1 alone means enabled, not done.
        homed: false,
        // Why the reference is lost since the last homing seen (C-05): 'restart' (a banner) over
        // 'alarm' (ALARM:n, or an Alarm state of a homed machine); null when homed or never known.
        referenceLost: null,
        sawHome: false,
        // Machine position at the end of our last full homing cycle ($H, Home seen, then Idle) and
        // the $23 it was homed under, or null: learnt only from a trusted machine position.
        homeMpos: null,
        // When a socket of another client (CNCjs on the PC) sent a full homing cycle: the command
        // `homing`, or `writeln` of the single line $H (see socketCommand). Never $HX/$HY/$HZ, never a cycle
        // seen without its command: only such a cycle may teach homeMpos besides ours.
        foreignHome: null,
        // When the last WCO was received (a WPos report needs one received after the $H).
        wcoAt: null,
        // Status reports received, so a step can wait for a newer one.
        reports: 0,
        xyzAt: null,
        generation: crypto.randomBytes(12).toString('hex')
      };
      // D2: whether the work offset the board applies is proven equal to `$#` (work-offset.js).
      r.offset = workOffsetOf({
        c,
        r,
        clock,
        later,
        changed,
        answers: (...args) => answers(...args),
        quiet: (...args) => quiet(...args),
        connected: () => controllers()[c.options.port] === c && !c.isClose() && !!c.runner,
        mode: () => offsetMode(c, r),
        reportUnits: () => reportUnitsOf(c),
        workflowIdle: () => !!c.workflow && c.workflow.state === 'idle',
        log,
        controllerInfo: () => controllerInfo(c, r)
      });
      // Where a full homing cycle left the machine, with the $23 it ran under (F1, motion.js
      // envelopeOf), or null when CNCjs's machine position cannot be trusted.
      const homeEnd = () => {
        const settings = allSettings(c);
        const mask = settings.$23 === undefined || String(settings.$23).trim() === '' ? NaN : Number(settings.$23);
        return Number.isInteger(mask) && machinePositionKnown(settings, { wcoSeen: r.wcoSeen, wposReported: r.wposReported })
          ? { ...homeMposOf(c), mask } : null;
      };
      r.status = (payload) => {
        r.seen = clock();
        if (explicitXyz(payload)) {
          r.xyzAt = r.seen;
        }
        // A work offset reported since the board started: what CNCjs needs to
        // turn a WPos report ($10 bit 0 clear) into a machine position (F1).
        const wco = payload && payload.wco;
        const explicitWco = !!wco && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(wco[axis])) && String(wco[axis]).trim() !== '');
        if (explicitWco) {
          r.wcoSeen = true;
          r.wcoAt = clock();
        }
        r.reports += 1;
        jobProgress(c, r);
        // The last explicit WCO: and the report that carried it (the block probe's check, C-03).
        if (explicitWco) {
          r.wco = { report: r.reports, x: Number(wco.x), y: Number(wco.y), z: Number(wco.z) };
        }
        const active = controllerStatus(c).activeState || '';
        let ownCycle = false;
        // Our $H outstanding and the board entering Alarm (from another state, no ALARM:n line): the
        // cycle was cut, an Idle after it ($X) is no completed homing. An Alarm already there when $H
        // left (board locked by $22=1) is not one: the cycle may still come.
        if (r.homing && /^Alarm/.test(active) && r.lastActive !== undefined && !/^Alarm/.test(r.lastActive)) {
          r.homing.interrupted = true;
        }
        r.lastActive = active;
        if (r.homing && clock() - r.homing.since >= HOMING_MIN_MS && /^(Idle|Alarm)/.test(active)) {
          // An error received while our $H was outstanding: never a completed homing
          // (a Home report seen meanwhile still is, see sawHome below).
          if (active === 'Idle' && !r.homing.refused && !r.homing.interrupted) {
            r.homed = true;
            r.lastAlarm = null;
            r.referenceLost = null;
            // Where our own full cycle ($H, every axis), seen running (Home reported), left the
            // machine (F1, motion.js envelopeOf): an axis homed towards its negative end ($23 bit
            // set) found at 0 tells a firmware that forces the origin there, whose travel is then
            // [0, $13x] only. A cycle of another client ($HX, $HY…) may home some axes only: not used.
            // A position derived from WPos without any WCO yet is off by the work offset: not used.
            // Limit: an axis left out of the firmware's own $H cycle keeps 0 after a board restart and
            // cannot be told from a forced origin; the soft limits ($20=1) of the board remain.
            ownCycle = true;
            r.homeMpos = r.sawHome ? homeEnd() : null;
            // WCO:0,0,0 after a homing on the LUNYEE while $# keeps the stored offset (D2).
            r.offset.invalidate('homing');
          }
          r.homing = null;
        }
        if (/^Alarm/.test(active)) {
          // An Alarm state without its ALARM:n line (a board restarted unseen, locked by $22=1 at
          // MPos 0,0,0): the position may be lost, as after r.alarmed. A full $H of the PC sent in
          // Alarm keeps its intention (foreignHome): its cycle comes next.
          if (r.homed && r.referenceLost !== 'restart') {
            r.referenceLost = 'alarm';
          }
          r.homed = false;
          r.homeMpos = null;
          r.offset.invalidate('alarm');
        }
        if (active === 'Home') {
          r.sawHome = true;
        } else if (r.sawHome && active === 'Idle') {
          r.sawHome = false;
          r.homed = true;
          r.lastAlarm = null;
          r.referenceLost = null;
          r.offset.invalidate('homing');
          // A cycle of another client may have homed some axes only ($HX, $HY…): what ours taught
          // is dropped, unless the full cycle was seen sent (socketCommand), ran at least
          // HOMING_MIN_MS and this very report gives the end position. Worst case, an axis taken
          // for homed at 0 that is not (a firmware whose $H skips it): a step towards + may run
          // past the real travel into the limit switch ($21=1, 6 switches) → ALARM:1, the board
          // restarts, homed and homeMpos are forgotten, nothing moves before a new cycle. A limit
          // alarm, not a crash into the frame (an obstacle within the travel is another matter).
          if (!ownCycle) {
            const since = r.foreignHome;
            const proven = since !== null && clock() - since >= HOMING_MIN_MS && clock() - since <= HOMING_MAX_MS &&
              explicitXyz(payload) && (machinePositionKnown(allSettings(c), { wposReported: r.wposReported }) || (r.wcoAt !== null && r.wcoAt >= since));
            r.homeMpos = proven ? homeEnd() : null;
          }
          r.foreignHome = null;
        } else if (r.sawHome && !/^(Home|Idle)/.test(active)) {
          r.sawHome = false;
          r.foreignHome = null;
        }
        const s = c.sender && c.sender.state;
        const waiting = c.workflow && c.workflow.state === 'running' && controllerStatus(c).activeState === 'Idle' &&
          s && Number.isFinite(s.sent) && Number.isFinite(s.received) && s.received < s.sent;
        if (!waiting) {
          r.stall = null;
        } else if (!r.stall || r.stall.received !== s.received) {
          r.stall = { since: r.seen, received: s.received };
        }
        observeToolChange(c, r);
        // An exception here would break CNCjs's reading of the port.
        try {
          r.offset.tick(payload);
        } catch (_) {
          // The proof stays where it was; nothing was written by this report.
        }
        changed();
      };
      r.alarmed = (res) => {
        r.alarm = grblCode(res);
        r.lastAlarm = { code: r.alarm, at: Date.now(), restarted: false };
        r.homing = null;
        r.foreignHome = null;
        // The board is in Alarm from now on, before its next report: a $H sent next starts from it.
        r.lastActive = 'Alarm';
        // An alarm may have lost the position (hard/soft limit, abort during a cycle).
        if (r.referenceLost !== 'restart') {
          r.referenceLost = 'alarm';
        }
        r.homed = false;
        r.homeMpos = null;
        r.sawHome = false;
        r.offset.invalidate('alarm');
        const job = r.job && r.job.started && !r.job.stopped && !r.job.finishedAt ? r.job : null;
        log({ event: 'alarm', ...jobInfo(job), controller: controllerInfo(c, r), code: r.alarm, actor: SYSTEM });
        changed();
      };
      r.reset = (payload) => {
        endSettingsRead(r);
        r.settingsAttempts = 0;
        r.settingsRetryAt = 0;
        r.seen = null;
        r.xyzAt = null;
        r.modalSeen = null;
        r.wcs = null;
        r.ticket = null;
        r.alarm = null;
        if (r.lastAlarm) {
          r.lastAlarm = { ...r.lastAlarm, restarted: true };
        }
        r.stall = null;
        r.homing = null;
        r.homed = false;
        // The board restarted: MPos 0 where it stood on the LUNYEE, the reference is gone.
        r.referenceLost = 'restart';
        r.homeMpos = null;
        r.foreignHome = null;
        r.wcoSeen = false;
        r.wcoAt = null;
        r.wco = null;
        // A Home state seen before the restart says nothing about the new session.
        r.sawHome = false;
        r.startups += 1;
        // A framing ends at the banner itself, without a byte to the new session (lot F1, C1).
        moves.restarted(c, r);
        // A banner ends the plate's old session, including boards returning directly to Idle.
        if (r.probing && r.probing.kind === 'plate') {
          r.probing.cancelled = true;
        }
        // The board loaded its stored offsets again: the next proof needs no reload.
        r.offset.invalidate('restart');
        // Reports counted from the banner on (a jog line lost to the restart, motion.js).
        r.reportsAtStartup = r.reports;
        // A restart (E-stop wired to reset, an alarm abort, a reset from another
        // client) during a pause: Grbl is back to G54, G21, G0 and F0.
        if (r.job && r.job.started && c.workflow && c.workflow.state !== 'idle') {
          r.job.boardRestarted = true;
          if (!r.job.aborted) {
            r.job.aborted = true;
            log({ event: 'aborted', ...jobInfo(r.job), controller: controllerInfo(c, r), result: 'aborted', actor: SYSTEM });
          }
        }
        // CNCjs's sender keeps streaming on every `ok` after a restart: a board
        // back Idle ($22=0) would run the rest of the program from a lost
        // position, spindle off (N7). Hold the sender; the resume stays refused.
        if (c.workflow && c.workflow.state === 'running') {
          c.command('gcode:pause');
        }
        if (payload && typeof payload.firmware === 'string' && typeof payload.version === 'string') {
          r.firmware = (payload.firmware + ' ' + payload.version).slice(0, 63);
        }
        changed();
      };
      // [VER:1.1h.20190825:] from $I, which CNCjs does not keep.
      r.raw = (payload) => {
        // The report itself says whether Grbl sends WPos (CNCjs's $10 copy may be stale, F1).
        const line = payload && typeof payload.raw === 'string' ? payload.raw.trim() : '';
        if (/^<[^>]*\|WPos:/.test(line)) {
          r.wposReported = true;
        } else if (/^<[^>]*\|MPos:/.test(line)) {
          r.wposReported = false;
        }
        const m = payload && typeof payload.raw === 'string' && /^\[VER:([^\]:]{1,40})[^\]]*\]$/.exec(payload.raw.trim());
        if (m && r.firmware.indexOf(m[1]) < 0) {
          r.firmware = 'Grbl ' + m[1];
          changed();
        }
      };
      // GrblRunner initializes G54 before receiving $G: accept only an observed report.
      r.modal = (payload) => {
        r.modalSeen = clock();
        const value = payload && payload.modal && payload.modal.wcs;
        r.wcs = /^G5[4-9]$/.test(value || '') ? value : null;
        r.offset.modal();
        changed();
      };
      r.file = () => {
        r.job = null;
        r.ticket = null;
        // A program replaced during a framing (an upload of CNCjs, lot F1 review C3) ends it now:
        // a CNC framing with its code, a laser one as a stop.
        moves.supervise(c, r);
        if (moves.framing(r)) {
          moves.stop(c, r, 'program');
        }
        changed();
      };
      c.runner.on('status', r.status);
      c.runner.on('startup', r.reset);
      c.runner.on('parserstate', r.modal);
      c.runner.on('raw', r.raw);
      // CNCjs rewinds the sender when a program ends, so "all lines acknowledged"
      // must be remembered when it happens to tell a finished job from a stopped one.
      r.end = () => {
        // M2/M30 load G54 again, and the program may have changed the system.
        r.offset.invalidate('end');
        if (r.job && r.job.started && !r.job.stopped) {
          r.job.finishedAt = clock();
          jobProgress(c, r);
          log({
            event: 'finish',
            ...jobInfo(r.job),
            controller: controllerInfo(c, r),
            result: r.job.errors ? 'error' : 'finished',
            errors: r.job.errors || 0,
            lastError: r.job.lastError || null,
            actor: SYSTEM
          });
          changed();
        }
      };
      // A line refused by Grbl (error:N) during the job: CNCjs pauses on it,
      // or goes on with ignoreErrors, and ends the job either way when it was
      // the last line. Such a program is never reported finished.
      r.error = (res) => {
        // Grbl answers $H with ok at the end of the cycle, or ALARM: an error:N
        // while our $H is outstanding is its refusal (error:8 during a jog,
        // error:5 when $22=0 was set from the console), whenever it is processed,
        // or the answer to another line. Either way the next Idle is not taken for
        // a completed homing, and `homing` stays set until a report says Idle or
        // Alarm, so Stop keeps its reset during a real (silent) cycle.
        if (r.homing && !r.homing.refused) {
          r.homing.refused = true;
          changed();
        }
        // Maybe the refusal of a $H sent from the PC: its cycle teaches nothing.
        r.foreignHome = null;
        if (r.probing) {
          r.probing.error = grblCode(res);
        }
        if (r.job && r.job.started && !r.job.stopped && c.workflow && c.workflow.state !== 'idle') {
          r.job.errors = (r.job.errors || 0) + 1;
          r.job.lastError = grblCode(res);
          // The first refused line of a run is recorded; the count goes with the end.
          if (r.job.errors === 1) {
            log({ event: 'error', ...jobInfo(r.job), controller: controllerInfo(c, r), code: r.job.lastError, line: Number(c.sender.state.received) || null, actor: SYSTEM });
          }
          changed();
        }
      };
      c.runner.on('error', r.error);
      c.runner.on('alarm', r.alarmed);
      c.sender.on('load', r.file);
      c.sender.on('unload', r.file);
      c.sender.on('end', r.end);
      // A new run of the loaded program (also started from CNCjs on the PC) starts
      // clean: the end, stop, restart and probe of an earlier run do not apply to it.
      // It is a started job either way, so its end, errors, alarms and board
      // restarts are recorded (bug hunt E-4); one started outside the service is
      // `external`: the PC resumes it, not the tablet (TESTING.md, job follow-up).
      r.run = () => {
        r.foreignHome = null;
        if (r.job) {
          r.job.started = true;
          // Started by the service (ownStart, consumed here) or from outside.
          r.job.external = !r.job.ownStart;
          r.job.ownStart = false;
          r.job.stopped = false;
          r.job.finishedAt = null;
          r.job.boardRestarted = false;
          r.job.aborted = false;
          r.job.probeFailed = false;
          r.job.errors = 0;
          r.job.lastError = null;
          const state = controllerStatus(c);
          const parser = modalFresh(r) ? ((c.runner.state || {}).parserstate || {}).modal || {} : {};
          const context = {
            ...machineForCheck(c, r),
            overrides: overridesOf(state),
            feedMode: parser.feedrate,
            wcs: parser.wcs,
            tlo: c.settings && c.settings.parameters && c.settings.parameters.TLO
          };
          if (r.xyzAt === null || clock() - r.xyzAt > MAX_REPORT_AGE_MS) {
            context.wpos = {};
          }
          r.job.runTime = createRunTime(durationOf(r.job.analysis, context), clock(), context.overrides);
          // Our own start names its actor; a start made from the classic interface does not.
          const actor = r.job.startActor || { kind: 'socket', id: 'cncjs', label: 'interface CNCjs' };
          r.job.startActor = null;
          // D1: a start of ours that overrode a proven overrun says so.
          const override = r.job.overrideStart ? { override: true } : {};
          r.job.overrideStart = false;
          log({ event: 'start', ...jobInfo(r.job), controller: controllerInfo(c, r), startedAt: new Date().toISOString(), ...override, actor });
          changed();
        }
      };
      r.progress = () => jobProgress(c, r);
      // A stop made outside the service (CNCjs's Stop or Reset on the PC, a macro):
      // the job is marked stopped with its line like one of ours (E6 / N10). Run
      // before CNCjs's own listener, which rewinds the sender.
      r.stopped = () => {
        r.offset.invalidate('stop');
        const j = r.job;
        if (j && j.started && !j.stopped && !j.finishedAt && c.sender && c.sender.state && c.sender.state.name === j.name) {
          const line = stopLine(c, r);
          r.lastStop = { file: j.name, line };
          j.stopped = true;
          jobProgress(c, r);
          log({ event: 'stop', ...jobInfo(j), controller: controllerInfo(c, r), result: 'stopped', line, probing: !!r.probing, actor: SYSTEM });
          changed();
        }
      };
      if (c.workflow && typeof c.workflow.on === 'function') {
        c.workflow.on('start', r.run);
        c.workflow.on('pause', r.progress);
        c.workflow.on('resume', r.progress);
        if (typeof c.workflow.prependListener === 'function') {
          c.workflow.prependListener('stop', r.stopped);
        }
      }
      records.set(c, r);
    }
    return records.get(c);
  };

  // CNCjs sets runner and sender to null when it destroys a controller (port
  // closed or gone, e.g. a USB cable pulled): forget the record in any case,
  // otherwise every later snapshot would fail on the same dead controller.
  const modalFresh = (r) => Number.isFinite(r.modalSeen) && clock() >= r.modalSeen && clock() - r.modalSeen <= MAX_REPORT_AGE_MS;
  const modalWcs = (r) => (modalFresh(r) ? r.wcs : null);

  // The spindle state is read when a tool change pause begins, before the
  // operator stops the spindle, so the resume can start it again.
  const observeToolChange = (c, r) => {
    const reason = c.sender && c.sender.state && c.sender.state.holdReason;
    if (!(c.workflow && c.workflow.state === 'paused' && reason && reason.data === 'M6')) {
      r.toolChange = null;
      return;
    }
    if (!r.toolChange) {
      r.toolChange = { restart: null, frozen: false };
    }
    if (r.toolChange.frozen) {
      return;
    }
    // When the pause begins, $G and FS may still describe the state before the
    // program's M3: keep learning from fresh reports until the operator stops
    // the spindle, then keep what was learnt.
    const parser = (c.runner && c.runner.state && c.runner.state.parserstate) || {};
    const mode = modalFresh(r) && parser.modal ? parser.modal.spindle : null;
    const turning = realtimeValue(controllerStatus(c).spindle);
    if (mode === 'M3' || mode === 'M4') {
      const speed = Number(parser.spindle) > 0 ? Number(parser.spindle) : turning;
      if (speed > 0) {
        r.toolChange.restart = { mode, speed };
      }
    } else if (r.toolChange.restart && (mode === 'M5' || turning === 0)) {
      r.toolChange.frozen = true;
    }
  };

  const remove = (c, r) => {
    endSettingsRead(r);
    records.delete(c);
    moves.forget(c, r);
    blockProbe.forget(c, r);
    Array.from(r.timers).forEach((entry) => {
      clearTimeout(entry.handle);
      r.timers.delete(entry);
      if (entry.cancel) {
        entry.cancel();
      }
    });
    if (c.runner) {
      c.runner.removeListener('status', r.status);
      c.runner.removeListener('startup', r.reset);
      c.runner.removeListener('parserstate', r.modal);
      c.runner.removeListener('raw', r.raw);
      c.runner.removeListener('error', r.error);
      c.runner.removeListener('alarm', r.alarmed);
    }
    if (c.workflow && typeof c.workflow.removeListener === 'function') {
      c.workflow.removeListener('start', r.run);
      c.workflow.removeListener('pause', r.progress);
      c.workflow.removeListener('resume', r.progress);
      c.workflow.removeListener('stop', r.stopped);
    }
    if (c.sender) {
      c.sender.removeListener('load', r.file);
      c.sender.removeListener('unload', r.file);
      c.sender.removeListener('end', r.end);
    }
  };

  const probeInput = createProbeInput(store, clock);
  const motion = createPreflight(store, config, (c) => {
    const r = record(c);
    return {
      loading: r.loading,
      confirmationPending: !!r.ticket && clock() <= r.ticket.expires
    };
  }, clock);

  const get = (port) => {
    if (disposed) {
      throw conflict('Service indisponible.');
    }
    const registry = controllers();
    const c = Object.prototype.hasOwnProperty.call(registry, port) && registry[port];
    if (!c || c.isClose() || c.type !== 'Grbl') {
      throw conflict('Contrôleur Grbl non connecté.');
    }
    return c;
  };

  const available = (c, allowRestore = false) => {
    if (controllers()[c.options.port] !== c || c.isClose() || !c.ready || !c.runner || !c.sender) {
      throw conflict('Connexion machine indisponible.');
    }
    const r = record(c);
    if (r.settingsRead) {
      throw settingsReading();
    }
    if (r.originChecking || r.frameStarting) {
      throw conflict('Des commandes sont en attente.');
    }
    if (!Number.isFinite(r.seen) || clock() < r.seen || clock() - r.seen > MAX_REPORT_AGE_MS) {
      throw conflict('État machine trop ancien : attendre un rapport récent.');
    }
    // Nothing that moves the machine starts while a host command runs (pause,
    // stop and M5 do not come through here).
    if (systemCommands.current()) {
      throw conflict('Commande système en cours (' + systemCommands.current().title + ') : attendez sa fin.');
    }
    // No guarded action writes between two lines of the D2 transaction.
    if (r.offset.checking() || (!allowRestore && r.offset.restoring())) {
      throw r.offset.refusal();
    }
  };

  // Reference guards (C-05, C-18, PLAN-CORRECTIONS § 1.5): with homing enabled ($22=1 known), a
  // machine this server has not seen homed since the board started, or that lost its reference
  // since (a banner, an alarm, an Alarm state), starts nothing and takes no work zero: one set
  // before the homing would be wrong after it. Broad on purpose: a CNCjs restarted cannot tell
  // whether the reference was lost before it. $22=0 or unknown: nothing changes.
  const referenced = (c) => settingNumber(allSettings(c), 22) !== 1 || record(c).homed === true;
  const referenceReady = (c) => {
    if (!referenced(c)) {
      throw startRefusal('ETOUCH_ORIGIN_NOT_HOMED');
    }
  };

  // D2: what runs in work coordinates waits for the offset proven (work-offset.js).
  const offsetReady = (c) => {
    const err = record(c).offset.refusal();
    if (err) {
      throw err;
    }
  };

  // A jog of ours sent and not over, even before Grbl reports Jog (F1): the
  // CNCjs feeder clears `pending` as soon as the line is written.
  const notJogging = (c, r) => {
    if (moves.moving(c, r)) {
      throw conflict('Déplacement en cours : attendez le retour au repos (Idle).');
    }
  };

  const idle = (c) => {
    available(c);
    if (record(c).probing) {
      throw conflict('Palpage en cours.');
    }
    notJogging(c, record(c));
    const feeder = c.feeder.toJSON();
    if (c.workflow.state !== 'idle' || controllerStatus(c).activeState !== 'Idle' || feeder.queue || feeder.pending) {
      throw conflict('La machine doit être au repos (Idle), sans commande en attente.');
    }
  };

  const validJob = (c, revision) => {
    const j = record(c).job;
    // Nothing loaded at all (no touch job, no program in CNCjs): say so, not « changed » (N5).
    if (!j && !(c.sender && c.sender.state && c.sender.state.name)) {
      throw conflict('Aucun fichier chargé.');
    }
    if (!j || j.revision !== revision ||
        c.sender.state.context.touchJob !== j.revision || c.sender.state.name !== j.name) {
      throw conflict('Le fichier chargé a changé. Rechargez-le et confirmez à nouveau.');
    }
    return j;
  };

  // Why CNCjs holds the program: null for an operator pause (CNCjs appends
  // "%wait" to every program and a pause made then keeps that reason), 'M0',
  // 'M1' or 'M6' when the program asked for it (CNCjs comments M6 out and
  // pauses), 'error' when a line was refused by Grbl.
  const pauseKind = (c) => {
    const reason = c.sender && c.sender.state && c.sender.state.holdReason;
    if (!reason || reason.data === '%wait') {
      return null;
    }
    if (reason.err) {
      return 'error';
    }
    return ['M0', 'M1', 'M6'].includes(reason.data) ? reason.data : 'other';
  };

  // Grbl reports the spindle speed in FS:; it is 0 once M5 is executed. A
  // firmware without FS (no variable spindle, Grbl 0.9) is judged on the
  // spindle state of a fresh $G, which CNCjs asks for about twice a second at rest.
  const spindleStill = (c) => {
    const speed = realtimeValue(controllerStatus(c).spindle);
    if (speed !== null && speed > 0) {
      throw conflict('La broche tourne encore (' + speed + ' tr/min) : arrêtez-la d’abord (M5).');
    }
    if (speed === null && modalFresh(record(c))) {
      const parser = (c.runner && c.runner.state && c.runner.state.parserstate) || {};
      const spindle = parser.modal && parser.modal.spindle;
      if (spindle === 'M3' || spindle === 'M4') {
        throw conflict('La broche est commandée (' + spindle + ') : arrêtez-la d’abord (M5).');
      }
    }
  };

  const spindleOn = (c) => {
    try {
      spindleStill(c);
      return false;
    } catch (_) {
      return true;
    }
  };

  const homingActive = (r) => !!r.homing && clock() - r.homing.since < HOMING_MAX_MS;

  // When the D2 transaction may start (work-offset.js): 'write' at rest, 'read' (no reload)
  // in a pause the program asked for, null otherwise: connected, a fresh Idle report, nothing
  // queued, loading, probing, homing, jogging or waiting for a confirmation, no host command,
  // the spindle still, a fresh $G naming the active system.
  const offsetMode = (c, r) => {
    if (controllers()[c.options.port] !== c || c.isClose() || !c.ready || !c.runner || !c.sender || !c.feeder || !c.workflow) {
      return null;
    }
    if (!Number.isFinite(r.seen) || clock() < r.seen || clock() - r.seen > MAX_REPORT_AGE_MS || controllerStatus(c).activeState !== 'Idle') {
      return null;
    }
    const feeder = c.feeder.toJSON();
    if (feeder.queue || feeder.pending || systemCommands.current() || r.settingsRead || r.originChecking || r.frameStarting || r.loading ||
        r.probing || homingActive(r) || moves.moving(c, r) ||
        (r.ticket && clock() <= r.ticket.expires) || spindleOn(c) || !modalWcs(r)) {
      return null;
    }
    if (c.workflow.state === 'idle') {
      return 'write';
    }
    return c.workflow.state === 'paused' && ['M0', 'M1', 'M6'].includes(pauseKind(c)) ? 'read' : null;
  };

  const reportUnitsOf = (c) => {
    const v = allSettings(c).$13;
    if (v === 0 || v === '0') {
      return 'mm';
    }
    return v === 1 || v === '1' ? 'in' : null;
  };

  // Host command (shutdown, restart…) reserved against the machine: see
  // system-command.js. While it holds, available() refuses every action that
  // moves the machine.
  const systemCommands = createSystemCommands({
    isDisposed: () => disposed,
    clock,
    conflict,
    controllers,
    record,
    homingActive,
    moving: (c, r) => moves.moving(c, r),
    spindleOn,
    changed,
    MAX_REPORT_AGE_MS
  });

  // Stop sequence (feed hold, then soft reset once at rest): see halt.js.
  const { haltPlan, halt } = createHalt({ clock, controllers, record, later, spindleOn });

  const readyFor = (c, action, revision, travel = null) => {
    const j = validJob(c, revision);
    available(c);
    if (record(c).probing) {
      throw conflict('Palpage en cours.');
    }
    if (action === 'start') {
      idle(c);
      spindleStill(c);
      if (record(c).loading) {
        throw conflict('Chargement en cours.');
      }
      if (j.started || !c.sender.state.total) {
        throw conflict('Rechargez le fichier avant un nouveau démarrage.');
      }
      // The machine profile and $32 now, not only when the program was loaded:
      // a resume runs only in the mode it was built for, with that mode still
      // allowed; a laser profile starts nothing while $32 is not 1 (M3/M4
      // would emit during every G0).
      if (j.resume) {
        const loaded = j.resume.mode || 'cnc';
        const now = resumeMode(c);
        if (now !== loaded) {
          throw machineRefusal('ETOUCH_MACHINE_RESUME_MODE_CHANGED', { loaded: loaded === 'laser' ? 'laser' : 'CNC', now: now === 'laser' ? 'laser' : 'CNC' });
        }
        const r = record(c);
        const modal = ((c.runner.state && c.runner.state.parserstate) || {}).modal || {};
        if (!j.resumeFeedMode && (!modalFresh(r) || modal.feedrate !== 'G94')) {
          throw startRefusal('ETOUCH_START_FEED_MODE');
        }
      } else {
        const profile = profileOf(c, record(c));
        if (profile.kind === 'laser' && profile.laser.mode !== 1) {
          throw machineRefusal('ETOUCH_MACHINE_LASER_MODE_OFF');
        }
      }
      // A program that does not set its units or distance mode runs in Grbl's
      // current ones, while its preview assumes millimetres and absolute.
      if (j.sets && (!j.sets.units || !j.sets.distance)) {
        if (!modalFresh(record(c))) {
          throw conflict('Le programme ne fixe pas ses unités ou son mode (G21/G90) : attendre un état modal ($G) récent.');
        }
        const modal = ((c.runner.state && c.runner.state.parserstate) || {}).modal || {};
        if (!j.sets.units && modal.units !== 'G21') {
          throw conflict('Le programme ne fixe pas ses unités et la machine est en ' + (modal.units || 'unités inconnues') + ' : ajoutez G21 au début du programme ou remettez la machine en G21.');
        }
        if (!j.sets.distance && modal.distance !== 'G90') {
          throw conflict('Le programme ne fixe pas son mode et la machine est en ' + (modal.distance || 'mode inconnu') + ' : ajoutez G90 au début du programme ou remettez la machine en G90.');
        }
      }
      // No program (a resume from a line neither) on a machine without its reference (C-05):
      // never overridden.
      if (!referenced(c)) {
        throw startRefusal('ETOUCH_START_NOT_HOMED');
      }
      // A program (a resume from a line too) runs in work coordinates (D2).
      offsetReady(c);
    } else {
      const kind = pauseKind(c);
      const state = controllerStatus(c).activeState;
      if (j.started && !j.external && c.workflow.state === 'running' && state === 'Hold') {
        // Feed hold sent from the PC (`!` only): CNCjs's workflow still runs (N1).
        throw conflict('Pause donnée hors de cet écran : touchez Pause, puis Reprendre.');
      }
      if (!j.started || c.workflow.state !== 'paused') {
        throw conflict('La reprise exige une pause simple confirmée par la machine.');
      }
      if (j.external) {
        throw conflict('Travail démarré depuis l’interface CNCjs : reprenez-le depuis le PC.');
      }
      if (kind === 'error') {
        throw conflict('Pause sur une erreur Grbl : arrêtez le travail, corrigez la cause, puis reprenez à une ligne.');
      }
      if (j.boardRestarted) {
        throw conflict('La carte a redémarré pendant le travail (arrêt d’urgence, alarme ou réinitialisation) : elle a perdu repère, unités et avance. Arrêtez le travail, puis reprenez à une ligne.');
      }
      if (j.probeFailed) {
        throw conflict('Palpage échoué pendant la pause : l’état modal du programme est perdu. Arrêtez le travail, puis reprenez à une ligne.');
      }
      if (kind === 'M6') {
        // No tool change on a laser; no spindle restart while $32=1 without a laser profile.
        const profile = profileOf(c, record(c));
        if (profile.kind === 'laser') {
          throw machineRefusal('ETOUCH_LASER_NO_TOOL_CHANGE');
        }
        if (record(c).toolChange && record(c).toolChange.restart && !profile.capabilities.toolChange.supported) {
          throw machineRefusal(profile.capabilities.toolChange.code);
        }
      }
      if (kind === 'M0' || kind === 'M1' || kind === 'M6') {
        if (state !== 'Idle' && state !== 'Hold') {
          throw conflict('Attendez l’arrêt de la machine (Idle ou Hold) avant de reprendre.');
        }
        const feeder = c.feeder.toJSON();
        if (feeder.queue || feeder.pending) {
          throw conflict('Des commandes sont en attente : attendez avant de reprendre.');
        }
      } else if (kind === 'other' || state !== 'Hold') {
        throw conflict('La reprise exige une pause simple confirmée par la machine.');
      }
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
    // D1, last: a deliberate override is only asked for once every other guard passed.
    if (action === 'start') {
      travelReady(c, j, travel);
    }
    return j;
  };

  // D1: the check of the loaded program now (a resume from a line: its rebuilt program, preamble
  // included), and what a deliberate override is bound to: the overruns shown (axis, side, how
  // far), the file, the board's session, the D2 proof, $23 and the travel.
  const travelOf = (c, r, j) => {
    // Every load analyses its program (job-load.js); a job without one has nothing to check.
    if (!j.analysis) {
      return { check: null, signature: null };
    }
    const check = checkProgram(j.analysis, machineForCheck(c, r));
    const s = allSettings(c);
    const signature = JSON.stringify({
      overruns: check.blocking.map((b) => [b.code, b.params.axis || 'Z', b.params.sign || '', b.params.over]),
      revision: j.revision,
      fingerprint: j.fingerprint,
      startups: r.startups,
      proof: r.offset.proof(),
      mask: s.$23 === undefined ? null : String(s.$23),
      travel: [130, 131, 132].map((n) => (s['$' + n] === undefined ? null : String(s['$' + n])))
    });
    return { check, signature };
  };

  // `travel`: null (an ordinary start), { request: true } (prepare with override: 'travel'), or
  // { signature } (the start of a ticket that overrides). Never overrides D2 or the reference
  // guard: both are checked before (readyFor).
  const travelReady = (c, j, travel) => {
    const r = record(c);
    const { check, signature } = travelOf(c, r, j);
    // An unsafe request never degrades into an ordinary ticket when its extent is unknown.
    if (travel && j.analysis.unsafeOverride) {
      throw startRefusal('ETOUCH_START_OVERRIDE_UNSAFE');
    }
    if (!check || !check.blocking.length) {
      return;
    }
    if (!travel) {
      throw startRefusal('ETOUCH_START_OUTSIDE', { count: check.blocking.length }, check.blocking);
    }
    // Without the board's own soft limits, nothing would stop the overrun: never overridden.
    if (!check.overridable) {
      throw startRefusal('ETOUCH_START_NO_OVERRIDE');
    }
    if (travel.signature && travel.signature !== signature) {
      throw startRefusal('ETOUCH_START_OVERRIDE_CHANGED');
    }
  };

  // Overrides act on the running (or held) program only.
  const overridable = (c) => {
    available(c);
    if (!['running', 'paused'].includes(c.workflow.state)) {
      throw conflict('Les corrections s’appliquent pendant un travail en cours ou en pause.');
    }
  };

  // The rapid override only slows G0 moves: it may also be set at rest, before a
  // start (25 % for the first run of a program). Grbl keeps it until the end of
  // the program (M2/M30) or a reset, then returns to 100 %.
  const rapidOverridable = (c) => {
    available(c);
    if (['running', 'paused'].includes(c.workflow.state)) {
      return;
    }
    const feeder = c.feeder.toJSON();
    if (c.workflow.state !== 'idle' || controllerStatus(c).activeState !== 'Idle' || feeder.queue || feeder.pending) {
      throw conflict('La vitesse des rapides se règle machine au repos (Idle) ou pendant un travail.');
    }
  };

  // A macro moves the machine from rest: idle, nothing loading, no automations.
  const macroReady = (c) => {
    idle(c);
    spindleStill(c);
    if (record(c).loading) {
      throw conflict('Chargement en cours.');
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
    // Its content may move in work coordinates (D2).
    offsetReady(c);
  };

  // Commissioning commands ($X, $H, spindle test) never run during a job.
  const noJob = (c) => {
    available(c);
    if (record(c).probing) {
      throw conflict('Palpage en cours.');
    }
    notJogging(c, record(c));
    const feeder = c.feeder.toJSON();
    if (c.workflow.state !== 'idle' || feeder.queue || feeder.pending) {
      throw conflict('Impossible pendant un travail ou avec des commandes en attente.');
    }
    if (record(c).loading) {
      throw conflict('Chargement en cours.');
    }
  };

  const readSettingsReady = (c) => {
    noJob(c);
    const r = record(c);
    const state = controllerStatus(c).activeState || '';
    if (!/^(Idle|Alarm)(?::\d+)?$/.test(state) || homingActive(r) || (r.ticket && clock() <= r.ticket.expires)) {
      throw conflict('La relecture exige une machine au repos ou en alarme, sans confirmation en attente.');
    }
  };

  const settingsReading = () => Object.assign(conflict('Lecture de la version et des réglages en cours : patientez quelques secondes.'), {
    code: 'ETOUCH_SETTINGS_READING', params: {}
  });
  const endSettingsRead = (r) => {
    if (r.settingsRead) {
      r.settingsRead.t.done();
      r.settingsRead = null;
    }
  };

  // Direct writes also work in Alarm, where CNCjs drops feeder lines. One line at a time,
  // with an answer listener installed before writing (some test controllers answer synchronously).
  // The reservation is published only after a successful write; every wait is bounded to 1.5 s.
  const beginSettingsRead = (c, r, lines) => {
    const read = { t: answers(c, r), index: 0, deadline: clock() + 1500 };
    try {
      c.writeln(lines[0]);
    } catch (err) {
      read.t.done();
      throw err;
    }
    r.settingsRead = read;
    changed();
    const check = () => {
      if (r.settingsRead !== read) {
        return;
      }
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner || read.t.error || clock() >= read.deadline) {
        endSettingsRead(r);
        changed();
        return;
      }
      if (read.t.oks) {
        read.t.done();
        read.index += 1;
        if (read.index === lines.length) {
          r.settingsRead = null;
          changed();
          return;
        }
        read.t = answers(c, r);
        try {
          c.writeln(lines[read.index]);
        } catch (_) {
          endSettingsRead(r);
          changed();
          return;
        }
        if (read.t.oks) {
          check();
          return;
        }
      }
      later(c, r, check, 25, () => endSettingsRead(r));
    };
    check();
  };

  const autoReadSettings = (c) => {
    const r = record(c);
    const versionMissing = !r.firmware && !firmwareOf(c);
    const settingsMissing = !Object.keys(allSettings(c)).length;
    if ((!versionMissing && !settingsMissing) || r.settingsAttempts >= 3 || clock() < r.settingsRetryAt) {
      return;
    }
    try {
      readSettingsReady(c);
    } catch (_) {
      return;
    }
    r.settingsAttempts += 1;
    r.settingsRetryAt = clock() + 5000;
    try {
      beginSettingsRead(c, r, ['$I'].concat(settingsMissing ? ['$$'] : []));
    } catch (_) {
      // A failed port write must never escape into CNCjs's status/heartbeat listeners.
    }
  };

  const unlockReady = (c) => {
    noJob(c);
    if (!/^Alarm/.test(controllerStatus(c).activeState || '')) {
      throw conflict('Le déverrouillage ($X) ne sert qu’en alarme.');
    }
  };

  const homeReady = (c) => {
    noJob(c);
    const state = controllerStatus(c).activeState || '';
    if (state !== 'Idle' && !/^Alarm/.test(state)) {
      throw conflict('La prise d’origine exige une machine au repos ou en alarme.');
    }
    spindleStill(c);
    const homing = settingNumber(allSettings(c), 22);
    if (homing === null) {
      throw conflict('Réglage $22 inconnu : relisez les réglages de la carte.');
    }
    if (homing === 0) {
      throw conflict('Prise d’origine désactivée sur la carte ($22=0).');
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
  };

  const spindleStopReady = (c) => {
    if (controllers()[c.options.port] !== c || c.isClose() || !c.ready) {
      throw conflict('Connexion machine indisponible.');
    }
    // At rest, or during a pause the program asked for once the machine has stopped (tool change).
    const programStop = c.workflow.state === 'paused' && ['M0', 'M1', 'M6'].includes(pauseKind(c)) &&
      controllerStatus(c).activeState === 'Idle';
    if (c.workflow.state !== 'idle' && !programStop) {
      throw conflict('Pendant un travail, utilisez Pause ou Arrêter.');
    }
  };

  // Machine type (CNC / laser) bound to the board's identity, kept in .cncrc
  // (`touch.machines`, see machine-profile.js). Its capabilities are enforced
  // here; the tablet only hides or disables.
  const profiles = createProfiles({ config });
  const profileOf = (c, r) => describeProfile({
    settings: allSettings(c),
    firmware: r.firmware || firmwareOf(c),
    version: c.settings && c.settings.version,
    port: c.options.port,
    records: profiles.list(),
    frameEnabled: moves.enabled(c, r)
  });
  const requireCapability = (c, name) => {
    const cap = profileOf(c, record(c)).capabilities[name];
    if (!cap.supported) {
      throw machineRefusal(cap.code);
    }
  };
  // Resume from a line: the laser mode of the builder for a laser profile
  // ($32=1 required), the CNC one otherwise ($32=1 refused).
  const resumeMode = (c) => {
    const profile = profileOf(c, record(c));
    const cap = profile.capabilities[profile.kind === 'laser' ? 'laserResume' : 'resume'];
    if (!cap.supported) {
      throw machineRefusal(cap.code);
    }
    return profile.kind === 'laser' ? 'laser' : 'cnc';
  };

  // Changing the machine type: the machine at rest (fresh report, Idle,
  // nothing running, held, loading, homing, probing or moving, no host
  // command) and its settings ($$) read. Coded refusals (ETOUCH_MACHINE_*).
  const machineReady = (c) => {
    const r = record(c);
    if (controllers()[c.options.port] !== c || c.isClose() || !c.ready || !c.runner || !c.sender) {
      throw machineRefusal('ETOUCH_MACHINE_CONNECTION');
    }
    if (!Number.isFinite(r.seen) || clock() < r.seen || clock() - r.seen > MAX_REPORT_AGE_MS) {
      throw machineRefusal('ETOUCH_MACHINE_STALE');
    }
    const feeder = c.feeder.toJSON();
    if (systemCommands.current() || r.settingsRead || r.originChecking || r.frameStarting || r.loading || r.probing || homingActive(r) || moves.moving(c, r) ||
        c.workflow.state !== 'idle' || feeder.queue || feeder.pending) {
      throw machineRefusal('ETOUCH_MACHINE_BUSY');
    }
    const state = controllerStatus(c).activeState || '';
    if (state !== 'Idle') {
      throw machineRefusal('ETOUCH_MACHINE_NOT_IDLE', { state: state || 'inconnu' });
    }
    if (!profileOf(c, r).signature) {
      throw machineRefusal('ETOUCH_MACHINE_SETTINGS_UNKNOWN');
    }
  };

  const machineProfileOf = (c, r) => {
    const profile = profileOf(c, r);
    let changeReason = '';
    try {
      machineReady(c);
      if (profile.match === 'ambiguous') {
        throw machineRefusal('ETOUCH_MACHINE_AMBIGUOUS', { count: profile.issues.find((i) => i.code === 'ETOUCH_MACHINE_AMBIGUOUS').params.count });
      }
    } catch (err) {
      changeReason = err.message;
    }
    const { capabilities, ...rest } = profile;
    return { ...rest, canChange: !changeReason, changeReason, capabilities };
  };

  const spindleReady = (c) => {
    requireCapability(c, 'spindleTest');
    idle(c);
    noJob(c);
    if (!spindleTestSpeed(allSettings(c))) {
      throw conflict('Vitesse maximale de broche ($30) inconnue : relisez les réglages de la carte.');
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
  };

  // Z zero with a touch plate, and the tracking of Grbl's answers to the
  // lines the service sends itself: see plate-probe.js.
  const plateProbe = createPlateProbe({
    config,
    clock,
    conflict,
    controllers,
    record,
    later,
    changed,
    available,
    spindleStill,
    pauseKind,
    modalFresh,
    allSettings,
    settingNumber,
    hasAutomations,
    grblCode,
    probeInput,
    moving: (c, r) => moves.moving(c, r),
    referenceReady,
    haltPlan,
    halt,
    homingActive,
    control,
    transports,
    transportActors
  });
  const { zeroZReady, plateParams, answers, zeroZ, quiet, stop: plateStop } = plateProbe;
  // The plate probe turns no spindle but is a CNC operation (contract §3).
  const plateReady = (c) => {
    requireCapability(c, 'plateProbe');
    zeroZReady(c);
    referenceReady(c);
    // G38.2 Z… in work coordinates (D2).
    offsetReady(c);
  };

  // Real jogging and work origins (F1): experimental, disabled unless .cncrc
  // has touch.motion.enabled: true (see motion.js).
  const moves = createMotion({
    config,
    clock,
    conflict,
    controllers,
    record,
    later,
    answers,
    changed,
    available,
    hasAutomations,
    control,
    transports,
    transportActors,
    log,
    controllerInfo,
    allSettings,
    modalWcs,
    referenceReady,
    homingActive,
    offsetReady,
    // Turning, or maybe turning: no FS speed reported and no fresh $G to tell.
    spindleOn: (c) => spindleOn(c) || (realtimeValue(controllerStatus(c).spindle) === null && !modalFresh(record(c)))
  });

  // Real probing at the corner block, Z / X / Y / XYZ: see block-probe.js.
  const blockProbe = createBlockProbe({
    config,
    clock,
    conflict,
    controllers,
    record,
    later,
    changed,
    log,
    controllerInfo,
    allSettings,
    modalWcs,
    probeInput,
    control,
    transports,
    transportActors,
    zeroZReady,
    answers,
    quiet,
    haltPlan,
    halt,
    homingActive,
    requireCapability,
    offsetReady
  });

  const findMacro = (id) => {
    const macro = macrosOf(config).find((m) => m.id === id);
    if (!macro) {
      throw conflict('Macro introuvable. Actualisez la liste.');
    }
    return macro;
  };

  // Confirmed commissioning operations: guard (checked at prepare and again at
  // run time), the name shown in the confirmation, and the command sent.
  const COMMISSIONING = {
    unlock: {
      guard: unlockReady,
      name: () => 'Déverrouillage ($X)',
      run: (c) => {
        unlockReady(c);
        c.command('unlock');
        return { message: 'Déverrouillage ($X) envoyé. Vérifiez le retour à Idle.' };
      }
    },
    home: {
      guard: homeReady,
      name: () => 'Prise d’origine ($H)',
      run: (c) => {
        homeReady(c);
        record(c).homing = { since: clock() };
        c.command('homing');
        return { message: 'Prise d’origine ($H) lancée. Main sur l’arrêt d’urgence.' };
      }
    },
    spindle: {
      guard: spindleReady,
      name: (c) => 'Test broche M3 S' + spindleTestSpeed(allSettings(c)),
      run: (c, t) => {
        spindleReady(c);
        const speed = spindleTestSpeed(allSettings(c));
        if (speed !== t.speed) {
          throw conflict('La vitesse de test a changé depuis la confirmation. Confirmez à nouveau.');
        }
        c.command('gcode', 'M3 S' + speed);
        return { message: 'Broche démarrée à ' + speed + ' tr/min (M3). Arrêt : bouton Arrêter la broche.' };
      }
    },
    zeroZ: {
      guard: plateReady,
      params: plateParams,
      // C-07: the search fits in the Z travel from here (checked again at the run).
      bind: (c, params) => {
        plateProbe.plateTravel(c, params);
        return params;
      },
      name: (c, params) => 'Zéro Z avec plaque de ' + params.thickness + ' mm (recherche ' + params.search + ' mm)',
      run: (c, t, actor) => {
        plateReady(c);
        return zeroZ(c, t, actor);
      }
    },
    // Block probe: the origin written once, at the end (block-probe.js).
    blockProbe: {
      guard: blockProbe.blockReady,
      params: blockParams,
      bind: blockProbe.bind,
      name: blockProbe.name,
      ticket: blockProbe.ticket,
      run: blockProbe.run
    },
    // Work origin at the current position (F1, motion.js).
    'set-origin': moves.originOperation
  };

  // Runs a guard and returns its failure message, or '' when it passes. With `refusals`
  // and an operation name, a coded refusal (ETOUCH_*) is kept there with its values and
  // reasons, for the client to say it in its language (snapshot `refusals`).
  const reason = (guard, refusals, operation) => {
    try {
      guard();
      return '';
    } catch (err) {
      if (refusals && err && typeof err.code === 'string' && /^ETOUCH_[A-Z0-9_]+$/.test(err.code)) {
        refusals[operation] = {
          code: err.code,
          ...(err.params && typeof err.params === 'object' ? { params: err.params } : {}),
          ...(Array.isArray(err.reasons) ? { reasons: err.reasons } : {})
        };
      }
      return err.message;
    }
  };

  const programPauseOf = (c, r) => {
    const kind = c.workflow.state === 'paused' ? pauseKind(c) : null;
    if (!kind) {
      return null;
    }
    const reason = c.sender.state.holdReason || {};
    const message = typeof reason.msg === 'string' ? reason.msg.slice(0, 120) : '';
    const tool = /(?:^|[^A-Z])T\s*(\d{1,3})/i.exec(message);
    return {
      kind,
      message,
      tool: tool ? Number(tool[1]) : null,
      restartSpindle: kind === 'M6' && r.toolChange ? r.toolChange.restart : null
    };
  };

  const snapshot = (c) => {
    const r = record(c);
    const sender = c.sender.toJSON();
    const feederState = c.feeder.toJSON();
    const state = controllerStatus(c);
    const motionState = motion.inspect(c.options.port);
    const revision = r.job && r.job.revision;

    // The coded refusal behind each reason below, by operation (only when it has a code).
    const refusals = {};
    const loadReason = reason(() => {
      idle(c);
      if (r.loading) {
        throw conflict('Chargement en cours.');
      }
    }, refusals, 'load');
    const startReason = reason(() => readyFor(c, 'start', revision), refusals, 'start');
    const resumeReason = reason(() => readyFor(c, 'resume', revision), refusals, 'resume');
    const overrideReason = reason(() => overridable(c));
    const rapidReason = reason(() => rapidOverridable(c));
    const macroReason = reason(() => macroReady(c), refusals, 'macro');
    const unlockReason = reason(() => unlockReady(c), refusals, 'unlock');
    const homeReason = reason(() => homeReady(c), refusals, 'home');
    const spindleReason = reason(() => spindleReady(c), refusals, 'spindle');
    const spindleStopReason = reason(() => spindleStopReady(c));
    const spindleAlarm = /^Alarm/.test(state.activeState || '') ? 'La broche est arrêtée par l’alarme.' : '';
    const zeroZReason = reason(() => plateReady(c), refusals, 'zeroZ');
    const blockProbeReason = reason(() => blockProbe.blockReady(c), refusals, 'blockProbe');
    const readSettingsReason = reason(() => readSettingsReady(c), refusals, 'readSettings');
    reason(() => moves.originOperation.guard(c), refusals, 'setOrigin');
    reason(() => moves.jogReady(c, r), refusals, 'jog');
    // Framing (laser or CNC, lot F1): the whole guard of this machine kind now.
    const frameReason = reason(() => planFor(c, r), refusals, 'frame');

    const jobErrors = (r.job && r.job.errors) || 0;
    const ended = Boolean(r.job && r.job.finishedAt && !r.job.stopped && c.workflow.state === 'idle');

    const age = (Number.isFinite(r.seen) && clock() >= r.seen) ? clock() - r.seen : null;

    const source = (c.settings && c.settings.settings) || {};
    const settings = {};
    EXPOSED_SETTINGS.forEach((n) => {
      const v = source['$' + n];
      if ((typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length < 32)) {
        settings['$' + n] = v;
      }
    });

    const coordinates = {};
    ['wpos', 'mpos'].forEach((kind) => {
      coordinates[kind] = {};
      ['x', 'y', 'z'].forEach((axis) => {
        const v = state[kind] && state[kind][axis];
        if ((typeof v === 'number' && Number.isFinite(v)) ||
            (typeof v === 'string' && v.length < 32 && Number.isFinite(Number(v)))) {
          coordinates[kind][axis] = v;
        }
      });
    });

    const reportSetting = source.$13;
    let reportUnits = null;
    if (reportSetting === 0 || reportSetting === '0') {
      reportUnits = 'mm';
    } else if (reportSetting === 1 || reportSetting === '1') {
      reportUnits = 'in';
    }
    let wcs = modalWcs(r);
    // While a program that cannot change the offset runs, the offset seen at its start holds.
    if (!wcs && r.job && r.job.started && !r.job.changesOffset && r.job.wcsAtStart &&
        ['running', 'paused'].includes(c.workflow.state)) {
      wcs = r.job.wcsAtStart;
    }
    const attribution = control.inspect(c.options.port);

    return {
      port: c.options.port,
      controllerId: c.options.port,
      generation: r.generation,
      operator: { reportUnits, wcs },
      type: c.type,
      activeState: state.activeState || '',
      // Hold:1 (decelerating) or Hold:0 (stopped): the tablet tells them apart (phase 7).
      subState: state.activeState === 'Hold' && Number.isInteger(state.subState) ? state.subState : null,
      feedrate: realtimeValue(state.feedrate),
      spindleSpeed: realtimeValue(state.spindle),
      workflow: c.workflow.state,
      statusAgeMs: age,
      statusObservedAt: r.seen,
      coordinates,
      settings,
      fresh: age !== null && age <= MAX_REPORT_AGE_MS,
      name: sender.name || '',
      revision,
      originalName: r.job && r.job.originalName,
      // SHA-256 of the loaded file (A5): the client compares it with its preview's.
      fingerprint: (r.job && r.job.fingerprint) || null,
      // Bound to this loaded revision and this execution, independently of any preview sidecar.
      jobProgress: jobProgress(c, r),
      // Travel pre-check of the loaded program against this machine now (F2).
      programCheck: r.job && r.job.analysis ? checkProgram(r.job.analysis, machineForCheck(c, r)) : null,
      homed: r.homed === true,
      // Why the machine is no longer referenced ('alarm', 'restart'), null when it is (C-05).
      referenceLost: r.homed === true ? null : r.referenceLost,
      // Who pilots this port (F5): {owner, lastChange}; the client derives its own role from its clientId.
      control: { owner: attribution.owner, lastChange: attribution.lastChange },
      total: sender.total,
      sent: sender.sent,
      received: sender.received,
      probeInput: probeInput.inspect(c.options.port),
      loading: r.loading,
      canReadSettings: !readSettingsReason,
      readSettingsReason,
      canPreviewMotion: motionState.available,
      motionReason: motionState.reason,
      canLoad: !loadReason,
      loadReason,
      canStart: !startReason,
      startReason,
      canResume: !resumeReason,
      resumeReason,
      // Every line acknowledged and the program over (not stopped by the operator),
      // without any line refused by Grbl.
      finished: ended && !jobErrors,
      // Stopped by the operator (Grbl may have acknowledged every line before running them).
      jobStopped: !!(r.job && r.job.stopped),
      finishedWithErrors: ended && jobErrors > 0,
      jobErrors,
      jobLastError: (r.job && r.job.lastError) || null,
      // ALARM:n while the controller is in alarm (null: no code received, e.g. homing lock).
      alarmCode: /^Alarm/.test(state.activeState || '') ? r.alarm : null,
      lastAlarm: r.lastAlarm ? { ...r.lastAlarm } : null,
      stalledMs: r.stall && Number.isFinite(r.seen) && r.seen - r.stall.since >= STALL_MS ? r.seen - r.stall.since : null,
      programPause: programPauseOf(c, r),
      resume: r.job && r.job.resume ? { ...r.job.resume } : null,
      stoppedAtLine: r.lastStop ? r.lastStop.line : null,
      stoppedFile: r.lastStop ? r.lastStop.file : null,
      // A block probe is interrupted by Pause (it cannot be resumed).
      canPause: c.workflow.state === 'running' || !!(r.probing && r.probing.kind === 'block') || moves.framing(r),
      // A macro waiting in a dwell (CNCjs queue not empty) can be stopped too.
      canStop: c.workflow.state !== 'idle' || ['Run', 'Hold', 'Home', 'Jog'].includes(state.activeState) || /^Door/.test(state.activeState || '') ||
        !!r.probing || !!r.starting || !!r.frameStarting || homingActive(r) || !!(feederState.queue || feederState.pending) ||
        // A jog sent by the service may run before Grbl reports Jog (F1).
        moves.moving(c, r),
      homing: homingActive(r),
      overrides: overridesOf(state),
      canOverride: !overrideReason,
      overrideReason,
      canRapidOverride: !rapidReason,
      rapidOverrideReason: rapidReason,
      macros: macrosOf(config),
      canMacro: !macroReason,
      macroReason,
      // Commissioning: firmware banner, whether $$ was read, guarded $X / $H / spindle test.
      firmware: r.firmware || firmwareOf(c),
      startups: r.startups,
      settingsCount: Object.keys(allSettings(c)).length,
      canUnlock: !unlockReason,
      unlockReason,
      canHome: !homeReason,
      homeReason,
      canSpindleTest: !spindleReason,
      spindleReason,
      spindleTestSpeed: spindleTestSpeed(allSettings(c)),
      canSpindleStop: !spindleStopReason && !spindleAlarm,
      spindleStopReason: spindleStopReason || spindleAlarm,
      // Z zero with a touch plate (guarded like the commissioning commands).
      canZeroZ: !zeroZReason,
      zeroZReason,
      canFrame: !frameReason,
      frameReason,
      probing: !!r.probing,
      zeroZ: r.zeroZ ? { ...r.zeroZ } : null,
      // Block probe (block-probe.js): ready or why not, and the last one.
      canBlockProbe: !blockProbeReason,
      blockProbeReason,
      blockProbe: r.blockProbe ? { ...r.blockProbe } : null,
      // D2 (work-offset.js): whether the work offset the board applies is proven equal to `$#`.
      workOffset: r.offset.snapshot(),
      refusals,
      // Machine type bound to this board's identity, and what it allows (PROFILES-CONTRACT §2, §3).
      machineProfile: machineProfileOf(c, r),
      // Real moves (F1): `capabilities` (jog, jogContinuous, jogCancel, setOrigin)
      // and `motion` (what is possible now, the continuous jog, the last results).
      ...moves.snapshot(c, r)
    };
  };

  // What the travel check (F2) needs from the machine right now.
  const machineForCheck = (c, r) => {
    const status = controllerStatus(c);
    const parser = modalFresh(r) ? ((c.runner.state && c.runner.state.parserstate) || {}).modal || null : null;
    const reportSetting = allSettings(c).$13;
    let reportUnits = null;
    if (reportSetting === 0 || reportSetting === '0') {
      reportUnits = 'mm';
    } else if (reportSetting === 1 || reportSetting === '1') {
      reportUnits = 'in';
    }
    const parameters = c.settings && c.settings.parameters && typeof c.settings.parameters === 'object' ? c.settings.parameters : null;
    return {
      settings: allSettings(c),
      mpos: status.mpos || {},
      wpos: status.wpos || {},
      modal: parser ? { units: parser.units, distance: parser.distance, wcs: parser.wcs } : null,
      parameters,
      homed: r.homed === true,
      // The homing convention our own full cycle taught (C-04): an axis homed towards its
      // negative end found at 0 is checked in [0, $13x]. Learnt only from a trusted machine
      // position (homeEnd), so no other position fact is needed here.
      homeAt: r.homeMpos,
      reportUnits,
      // D2: until proven, what depends on the work offset is not compared (program-check.js).
      offsetProven: r.offset.proven(),
      // Laser additions of the program check, for a machine declared laser only.
      ...(profileOf(c, r).kind === 'laser' ? { laser: { sMax: settingNumber(allSettings(c), 30) } } : {})
    };
  };

  // Reading, fingerprint (A5) and load of a program, resume plan, travel check
  // of a library file: see job-load.js.
  const { sameFileAsLoaded, resumePlan, checkFile, load } = createLoader({
    files,
    config,
    conflict,
    available,
    idle,
    hasAutomations,
    record,
    changed,
    log,
    jobInfo,
    controllerInfo,
    machineForCheck,
    resumeMode
  });

  // After a tool change the spindle was stopped by the operator: start it at
  // the programmed speed and wait for the spin-up dwell to be acknowledged
  // (CNCjs resets its command queue on resume) before resuming the program.
  // Both lines must be answered: resuming during the dwell made CNCjs take
  // the G4's `ok` for a program line, one line off in its count of Grbl's
  // receive buffer for the rest of the job.
  const SPINUP_MS_MAX = 20000;
  const restartSpindleThenResume = (c, restart) => new Promise((resolve, reject) => {
    const r = record(c);
    const t = answers(c, r);
    const fail = (message) => {
      t.done();
      reject(conflict(message));
    };
    c.command('gcode', [restart.mode + ' S' + restart.speed, 'G4 P' + TOOL_CHANGE_SPINUP_S]);
    const deadline = clock() + SPINUP_MS_MAX;
    const check = () => {
      // The controller may be gone (port closed): never touch a destroyed one.
      if (controllers()[c.options.port] !== c || c.isClose() || !c.feeder || !c.workflow || c.workflow.state !== 'paused') {
        fail('Broche non relancée : la machine a changé d’état. Reprise annulée, vérifiez la machine.');
        return;
      }
      if (t.error) {
        fail('Grbl a refusé la relance de la broche (error:' + t.error + ') : reprise annulée.');
        return;
      }
      const feeder = c.feeder.toJSON();
      if (t.oks >= 2 && !feeder.queue && !feeder.pending) {
        t.done();
        c.command('gcode:resume');
        resolve({ message: 'Broche relancée (' + restart.mode + ' S' + restart.speed + '), reprise demandée.' });
        return;
      }
      if (clock() > deadline) {
        fail('Broche non relancée à temps : reprise annulée. Vérifiez la machine.');
        return;
      }
      later(c, r, check, 100, () => fail('Broche non relancée (service arrêté ou contrôleur retiré) : reprise annulée, vérifiez la machine.'));
    };
    check();
  });

  // Laser framing (PROFILES-CONTRACT §4): the XY box of the loaded program
  // (validated travel check, mm, work coordinates of the active offset) at
  // the current Z, M5 first, bounded absolute jogs. Default feed below.
  const FRAME_FEED = 1000;
  const fmt3 = (n) => String(Math.round(n * 1000) / 1000);
  const framePlan = (c, r, feedAsked) => {
    requireCapability(c, 'laserFrame');
    moves.jogReady(c, r);
    // $J=G90 in work coordinates (D2).
    offsetReady(c);
    const j = r.job;
    const sender = c.sender.state || {};
    if (!j || sender.name !== j.name || !sender.context || sender.context.touchJob !== j.revision) {
      throw machineRefusal('ETOUCH_LASER_FRAME_NO_PROGRAM');
    }
    const a = j.analysis;
    const check = checkProgram(a, machineForCheck(c, r));
    if (check.axes.X.verdict !== 'validated' || check.axes.Y.verdict !== 'validated') {
      // The check's own reasons for X and Y (an axis homed the other way, an
      // unverified reference…) travel with the refusal as `reasons`, coded like
      // a check's codedReasons ({code, params, message}), so the client can
      // show them in its language (a template value is too short for them).
      const reasons = ['X', 'Y'].flatMap((axis) => check.axes[axis].codedReasons)
        .filter((reason, i, all) => all.findIndex((other) => other.message === reason.message) === i);
      const err = machineRefusal('ETOUCH_LASER_FRAME_CHECK');
      err.reasons = reasons;
      throw err;
    }
    if (a.rawUnits || !a.extent.X || !a.extent.Y) {
      throw machineRefusal('ETOUCH_LASER_FRAME_BOUNDS');
    }
    const active = modalWcs(r);
    if (a.wcs && a.wcs !== active) {
      throw machineRefusal('ETOUCH_LASER_FRAME_WCS', { wcs: a.wcs, active: active || 'inconnu' });
    }
    const settings = allSettings(c);
    const max = Math.min(maxFeedOf(settings, 'X').max, maxFeedOf(settings, 'Y').max);
    const feed = feedAsked === undefined || feedAsked === null ? Math.min(FRAME_FEED, max) : feedAsked;
    if (typeof feed !== 'number' || !Number.isFinite(feed) || feed < MIN_FEED || feed > max) {
      throw machineRefusal('ETOUCH_LASER_FRAME_FEED', { min: MIN_FEED, max: fmt3(max) });
    }
    const wpos = controllerStatus(c).wpos || {};
    const here = ['x', 'y'].map((axis) => {
      const v = wpos[axis];
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    });
    if (here.includes(null)) {
      throw machineRefusal('ETOUCH_LASER_FRAME_POSITION');
    }
    const bounds = {
      xMin: Number(fmt3(a.extent.X.min)),
      xMax: Number(fmt3(a.extent.X.max)),
      yMin: Number(fmt3(a.extent.Y.min)),
      yMax: Number(fmt3(a.extent.Y.max))
    };
    const { xMin, xMax, yMin, yMax } = bounds;
    const corners = [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax], [xMin, yMin]];
    const f = Number(fmt3(feed));
    const lines = ['M5'];
    const limits = [10000];
    let from = here;
    corners.forEach(([x, y]) => {
      const ms = 60000 * Math.hypot(x - from[0], y - from[1]) / f;
      if (ms > MAX_JOG_MS) {
        throw machineRefusal('ETOUCH_LASER_FRAME_SLOW', { seconds: Math.ceil(ms / 1000), max: MAX_JOG_MS / 1000 });
      }
      lines.push('$J=G90 G21 X' + fmt3(x) + ' Y' + fmt3(y) + ' F' + fmt3(f));
      limits.push(ms + 10000);
      from = [x, y];
    });
    return { lines, limits, bounds, feed: f, job: j };
  };

  // CNC framing in the air (lot F1, examples/cncjs-touch/design/fonctions/F1-CONCEPTION.md): M5,
  // then Z alone up to CNC_FRAME_CLEARANCE_MM under the top of the Z travel by a relative,
  // unsigned jog (it can only rise), then the XY box of the program in work coordinates like the
  // laser framing, then back above the start. Z never comes down. Every line is a bounded `$J=`.
  const CNC_FRAME_FEED = 600;
  const CNC_FRAME_MAX_FEED = 1500;
  const CNC_FRAME_Z_FEED = 300;
  const CNC_FRAME_CLEARANCE_MM = 5;
  const CNC_FRAME_MIN_RISE_MM = 0.01;
  const CNC_FRAME_MIN_SEGMENT_MM = 0.001;
  const CNC_FRAME_EDGE_MM = 1e-6;
  const cncFramePlan = (c, r, feedAsked) => {
    // G3 to G7: the machine kind, at rest, homed, the work offset proven (D2), the spindle still.
    requireCapability(c, 'cncFrame');
    moves.jogReady(c, r);
    if (r.homed !== true) {
      throw machineRefusal('ETOUCH_CNC_FRAME_NOT_HOMED');
    }
    offsetReady(c);
    spindleStill(c);
    if (realtimeValue(controllerStatus(c).spindle) === null && !modalFresh(r)) {
      throw conflict(CNC_FRAME_SPINDLE_UNKNOWN);
    }
    // G8 to G11: the loaded program, its travel check in X and Y, its outline, its work offset.
    const j = r.job;
    const sender = c.sender.state || {};
    if (!j || sender.name !== j.name || !sender.context || sender.context.touchJob !== j.revision) {
      throw machineRefusal('ETOUCH_LASER_FRAME_NO_PROGRAM');
    }
    const a = j.analysis;
    const check = checkProgram(a, machineForCheck(c, r));
    const xy = ['X', 'Y'];
    if (xy.some((axis) => check.axes[axis].verdict === 'outside')) {
      const reasons = (check.blocking || []).filter((b) => b.code === 'ETOUCH_TRAVEL_BEYOND' && xy.includes(b.params && b.params.axis));
      if (reasons.length) {
        const err = machineRefusal('ETOUCH_CNC_FRAME_OUTSIDE', { count: reasons.length });
        err.reasons = reasons;
        throw err;
      }
    }
    if (xy.some((axis) => check.axes[axis].verdict !== 'validated')) {
      const reasons = xy.flatMap((axis) => check.axes[axis].codedReasons)
        .filter((reason, i, all) => all.findIndex((other) => other.message === reason.message) === i);
      const err = machineRefusal('ETOUCH_LASER_FRAME_CHECK');
      err.reasons = reasons;
      throw err;
    }
    if (a.rawUnits || !a.extent.X || !a.extent.Y) {
      throw machineRefusal('ETOUCH_LASER_FRAME_BOUNDS');
    }
    const active = modalWcs(r);
    if (a.wcs && a.wcs !== active) {
      throw machineRefusal('ETOUCH_LASER_FRAME_WCS', { wcs: a.wcs, active: active || 'inconnu' });
    }
    // G12: the board refuses by itself any target beyond its travel ($20=1).
    const settings = allSettings(c);
    if (settingNumber(settings, 20) !== 1) {
      throw machineRefusal('ETOUCH_CNC_FRAME_SOFT_LIMITS');
    }
    // G13: where the machine is, in work and machine coordinates.
    const status = controllerStatus(c);
    const at = (kind, axis) => {
      const v = status[kind] && status[kind][axis];
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    };
    const wx = at('wpos', 'x');
    const wy = at('wpos', 'y');
    const mx = at('mpos', 'x');
    const my = at('mpos', 'y');
    const mz = at('mpos', 'z');
    if ([wx, wy, mx, my, mz].includes(null)) {
      throw machineRefusal('ETOUCH_LASER_FRAME_POSITION');
    }
    // G14: the safe height, in the one Z travel the machine position fits.
    const env = envelopeOf(settings, r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos });
    const zAt = limitsAt(env.Z, mz, 'Z');
    if (!zAt.limits || zAt.ambiguous) {
      throw machineRefusal('ETOUCH_CNC_FRAME_Z');
    }
    const zUsable = usableOf(zAt.limits);
    const safeZ = Number(fmt3(zUsable.high - CNC_FRAME_CLEARANCE_MM));
    if (safeZ < zUsable.low) {
      throw machineRefusal('ETOUCH_CNC_FRAME_Z');
    }
    // G15: the way back (the start) inside the usable travel too; the corners are the check's (G9).
    [['X', mx], ['Y', my]].forEach(([axis, m]) => {
      const lim = limitsAt(env[axis], m, axis);
      const u = lim.limits && !lim.ambiguous ? usableOf(lim.limits) : null;
      if (!u || m < u.low - CNC_FRAME_EDGE_MM || m > u.high + CNC_FRAME_EDGE_MM) {
        throw machineRefusal('ETOUCH_CNC_FRAME_START', { axis, value: fmt3(m), low: u ? fmt3(u.low) : '?', high: u ? fmt3(u.high) : '?' });
      }
    });
    // G16: a slow feed (600 mm/min by default, 1500 at most), no line longer than MAX_JOG_MS.
    const max = Math.min(CNC_FRAME_MAX_FEED, maxFeedOf(settings, 'X').max, maxFeedOf(settings, 'Y').max);
    const feed = feedAsked === undefined || feedAsked === null ? Math.min(CNC_FRAME_FEED, max) : feedAsked;
    if (typeof feed !== 'number' || !Number.isFinite(feed) || feed < MIN_FEED || feed > max) {
      throw machineRefusal('ETOUCH_LASER_FRAME_FEED', { min: MIN_FEED, max: fmt3(max) });
    }
    const f = Number(fmt3(feed));
    const fz = Number(fmt3(Math.min(CNC_FRAME_Z_FEED, maxFeedOf(settings, 'Z').max)));
    const slow = (ms) => {
      if (ms > MAX_JOG_MS) {
        throw machineRefusal('ETOUCH_LASER_FRAME_SLOW', { seconds: Math.ceil(ms / 1000), max: MAX_JOG_MS / 1000 });
      }
      return ms;
    };
    // The lines (§ 4.2), each with its time limit, its phase and the machine position it ends at.
    const lines = ['M5'];
    const limits = [10000];
    const phases = ['spindle'];
    // M5 moves nothing: the machine stays where the plan was made (review D2).
    const expect = [{ x: mx, y: my, z: mz }];
    let moveMs = 0;
    const rise = Number(fmt3(safeZ - mz));
    if (rise >= CNC_FRAME_MIN_RISE_MM) {
      const ms = slow(60000 * rise / fz);
      lines.push('$J=G91 G21 Z' + fmt3(rise) + ' F' + fmt3(fz));
      limits.push(ms + 10000);
      phases.push('raise');
      expect.push({ x: mx, y: my, z: mz + rise });
      moveMs += ms;
    }
    const bounds = {
      xMin: Number(fmt3(a.extent.X.min)),
      xMax: Number(fmt3(a.extent.X.max)),
      yMin: Number(fmt3(a.extent.Y.min)),
      yMax: Number(fmt3(a.extent.Y.max))
    };
    const { xMin, xMax, yMin, yMax } = bounds;
    const start = { x: Number(fmt3(wx)), y: Number(fmt3(wy)) };
    // Machine = work + (MPos − WPos), the offset the travel check used (program-check.js).
    const offX = mx - wx;
    const offY = my - wy;
    let from = [start.x, start.y];
    let sides = 0;
    [['approach', xMin, yMin], ['side', xMax, yMin], ['side', xMax, yMax], ['side', xMin, yMax], ['side', xMin, yMin], ['return', start.x, start.y]].forEach(([phase, x, y]) => {
      const length = Math.hypot(x - from[0], y - from[1]);
      // A segment of no length is not sent (a flat box, a start on the first corner).
      if (length <= CNC_FRAME_MIN_SEGMENT_MM) {
        return;
      }
      const ms = slow(60000 * length / f);
      lines.push('$J=G90 G21 X' + fmt3(x) + ' Y' + fmt3(y) + ' F' + fmt3(f));
      limits.push(ms + 10000);
      phases.push(phase);
      expect.push({ x: x + offX, y: y + offY });
      sides += phase === 'side' ? 1 : 0;
      moveMs += ms;
      from = [x, y];
    });
    return {
      kind: 'cnc',
      lines,
      limits,
      phases,
      sides,
      expect,
      bounds,
      feed: f,
      zFeed: fz,
      safeZ: { machine: safeZ, rise: rise >= CNC_FRAME_MIN_RISE_MM ? rise : 0 },
      // The work offset in X/Y the targets are written in: compared at every step of the sequence.
      offset: { x: offX, y: offY },
      start,
      seconds: Math.ceil(moveMs / 1000),
      job: j,
      revision: j.revision
    };
  };
  // The machine kind chooses the plan: a declared laser frames at its height, anything else in the air.
  const planFor = (c, r, feed) => (profileOf(c, r).kind === 'laser' ? framePlan : cncFramePlan)(c, r, feed);

  const MACHINE_OPERATIONS = ['set-kind', 'forget', 'frame-prepare', 'frame'];

  // POST {action: 'machine', operation: 'set-kind' | 'forget' | 'frame-prepare' | 'frame'}.
  // set-kind / forget write .cncrc only: nothing is ever sent to the
  // controller, and $30, $31, $32 are never changed.
  const machineAction = (c, r, body, actor) => {
    const op = body.operation;
    if (!MACHINE_OPERATIONS.includes(op)) {
      throw machineRefusal('ETOUCH_MACHINE_OPERATION');
    }
    if (typeof body.generation !== 'string' || body.generation !== r.generation) {
      throw machineRefusal('ETOUCH_MACHINE_CONTROLLER_CHANGED');
    }
    const framing = op === 'frame-prepare' || op === 'frame';
    if ((framing && typeof body.transportId !== 'string') || (body.transportId !== undefined && !transports.has(body.transportId))) {
      throw machineRefusal('ETOUCH_MACHINE_TRANSPORT');
    }
    if (op === 'set-kind' || op === 'forget') {
      if (op === 'set-kind' && !KINDS.includes(body.kind)) {
        throw machineRefusal('ETOUCH_MACHINE_KIND_INVALID');
      }
      machineReady(c);
      const profile = profileOf(c, r);
      const controller = controllerInfo(c, r);
      if (op === 'forget') {
        const removed = profiles.forget({ signature: profile.signature });
        log({ event: 'machine', operation: 'forget', controller, signature: profile.signature, removed: removed.map((m) => ({ id: m.id, label: m.label || '', kind: m.kind })), actor: actor || null });
        changed();
        return { message: 'Fiche machine oubliée. Aucune commande envoyée à la carte.' };
      }
      const { record: saved, previous } = profiles.setKind({ signature: profile.signature, kind: body.kind, label: body.label });
      log({ event: 'machine', operation: 'set-kind', controller, machine: { id: saved.id, label: saved.label, kind: saved.kind, signature: saved.signature }, previous, actor: actor || null });
      changed();
      return {
        message: saved.kind === 'laser' ? 'Type de machine enregistré : laser. Aucune commande envoyée à la carte.' : 'Type de machine enregistré : CNC. Aucune commande envoyée à la carte.',
        machine: { id: saved.id, label: saved.label, kind: saved.kind }
      };
    }
    moves.bound(body, actor);
    if (op === 'frame-prepare') {
      const plan = planFor(c, r, body.feed);
      const nonce = crypto.randomBytes(24).toString('hex');
      r.ticket = {
        nonce,
        operation: 'frame',
        kind: plan.kind || 'laser',
        revision: plan.job.revision,
        fingerprint: plan.job.fingerprint,
        lines: plan.lines,
        feed: plan.feed,
        expires: clock() + TICKET_LIFETIME_MS,
        transportId: body.transportId
      };
      if (plan.kind === 'cnc') {
        return {
          nonce,
          name: 'Cadrage à vide X ' + fmt3(plan.bounds.xMin) + ' → ' + fmt3(plan.bounds.xMax) + ', Y ' + fmt3(plan.bounds.yMin) + ' → ' + fmt3(plan.bounds.yMax) +
            ' mm à ' + fmt3(plan.feed) + ' mm/min (M5, Z machine ' + fmt3(plan.safeZ.machine) + ', sans broche)',
          operation: 'frame',
          expiresIn: TICKET_LIFETIME_MS / 1000,
          generation: r.generation,
          frame: { kind: 'cnc', lines: plan.lines.slice(), bounds: plan.bounds, feed: plan.feed, zFeed: plan.zFeed, safeZ: plan.safeZ, start: plan.start, seconds: plan.seconds }
        };
      }
      return {
        nonce,
        name: 'Cadrage laser X ' + fmt3(plan.bounds.xMin) + ' → ' + fmt3(plan.bounds.xMax) + ', Y ' + fmt3(plan.bounds.yMin) + ' → ' + fmt3(plan.bounds.yMax) + ' mm à ' + fmt3(plan.feed) + ' mm/min (M5 d’abord, sans émission)',
        operation: 'frame',
        expiresIn: TICKET_LIFETIME_MS / 1000,
        generation: r.generation,
        frame: { kind: 'laser', lines: plan.lines.slice(), bounds: plan.bounds, feed: plan.feed }
      };
    }
    const t = r.ticket;
    r.ticket = null;
    if (!t || t.operation !== 'frame' || t.nonce !== body.nonce || clock() > t.expires || t.transportId !== body.transportId) {
      throw machineRefusal('ETOUCH_LASER_FRAME_EXPIRED');
    }
    // The same program (revision and fingerprint), the same lines, re-checked
    // after the file on disk was read again (A5).
    const again = () => {
      const plan = planFor(c, r, t.feed);
      if ((plan.kind || 'laser') !== t.kind || plan.job.revision !== t.revision || plan.job.fingerprint !== t.fingerprint || plan.lines.join('\n') !== t.lines.join('\n')) {
        throw machineRefusal('ETOUCH_LASER_FRAME_CHANGED');
      }
      return plan;
    };
    const first = again();
    const pending = { cancelled: false, transportId: body.transportId };
    r.frameStarting = pending;
    changed();
    return sameFileAsLoaded(first.job).then(() => {
      if (disposed || pending.cancelled || r.frameStarting !== pending || !transports.has(body.transportId)) {
        throw conflict(START_CANCELLED);
      }
      control.authorize(c.options.port, actor, 'machine');
      // Release the reservation synchronously: the full guard and first write follow without an await.
      r.frameStarting = null;
      return moves.frame(c, r, again(), actor, body.transportId);
    }).finally(() => {
      if (r.frameStarting === pending) {
        r.frameStarting = null;
      }
      changed();
    });
  };

  const perform = (body, actor) => {
    if (!body || typeof body.port !== 'string') {
      throw conflict('Choisissez une machine.');
    }
    const c = get(body.port);
    const r = record(c);
    const a = body.action;
    // Any guarded operation of ours between a $H of the PC and its end: that cycle teaches nothing.
    if (guarded(body)) {
      r.foreignHome = null;
    }

    // Attribution of control (F5): a port owned by someone else refuses every
    // operation that moves or prepares the machine; Pause, Stop and M5 never
    // need the lease. A touch client (persistent clientId) claims a free port
    // by its first guarded operation that succeeded (see action()); other
    // callers leave it free.
    if (a === 'control') {
      const op = body.operation;
      if (op === 'status') {
        return control.inspect(c.options.port, actor);
      }
      if (op === 'claim') {
        return control.claim(c.options.port, actor);
      }
      if (op === 'release' || op === 'takeover') {
        const keyOf = (owner) => (owner ? owner.kind + ':' + owner.id : '');
        // F4: the hand is not given back during a job (running or paused); only its holder is told so,
        // anybody else gets the control refusal from the lease itself.
        if (op === 'release' && c.workflow.state !== 'idle' && control.inspect(c.options.port, actor).role !== 'observer') {
          throw controlJobRefusal();
        }
        const before = keyOf(control.inspect(c.options.port).owner);
        const out = op === 'release' ? control.release(c.options.port, actor) : control.takeover(c.options.port, actor, body.reason);
        // The device that lost the lease loses its sequence in the same synchronous step, before any
        // other command can be read (C-12): the supervisor's checks of the block probe and of the
        // plate probe run now, not at their next tick.
        if (keyOf(control.inspect(c.options.port).owner) !== before) {
          if (r.frameStarting) {
            r.frameStarting.cancelled = true;
          }
          if (r.starting) {
            r.starting.cancelled = true;
          }
          blockProbe.supervise(c, r);
          plateProbe.supervise(c, r);
          // A CNC framing (lot F1) as well: ended first, with its own code (the hand lost) and its jog cancel.
          const framingEnded = moves.supervise(c, r);
          // A takeover is seen by the jog's own watch; a release leaves the port free, which that watch
          // takes for nobody's business: the move of the device that gave the hand back ends here (F4),
          // unless it was the CNC framing just ended above (a single jog cancel) or all that is left is a
          // framing ended at a banner (F1, nothing written to the new session).
          if (op === 'release' && !framingEnded && !moves.bannerLeftover(r)) {
            moves.stop(c, r, 'released');
          }
        }
        return out;
      }
      throw conflict('Opération de pilotage inconnue.');
    }
    // A real move that is disabled (or not supported) says so before any
    // control refusal (F1).
    moves.precheck(c, r, body);
    if (guarded(body)) {
      control.authorize(c.options.port, actor, a);
    } else if (SAFE_ACTIONS.includes(a) || a === 'motion') {
      control.authorize(c.options.port, actor, a, { safe: true });
    }

    if (a === 'machine') {
      return machineAction(c, r, body, actor);
    }

    if (['prepare', 'start', 'resume', 'macro', 'override', 'unlock', 'home', 'spindle', 'zeroZ', 'blockProbe', 'readSettings', 'set-origin', 'verifyOffset'].includes(a) ||
        (guarded(body) && a === 'motion')) {
      if (typeof body.generation !== 'string' || body.generation !== r.generation) {
        throw conflict('Le contrôleur a changé ou son identité manque. Choisissez-le à nouveau.');
      }
      if (typeof body.transportId !== 'string' || !transports.has(body.transportId)) {
        throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
      }
    }
    const stopping = ['pause', 'stop', 'spindleStop'].includes(a) || (a === 'motion' && body.operation === 'jog-stop');
    // A stop ends the D2 transaction where it is: nothing more is written by it.
    if (stopping) {
      r.offset.cancel();
      if (r.frameStarting) {
        r.frameStarting.cancelled = true;
        r.ticket = null;
        // Nothing was sent yet. A stop/pause ends this pending sequence synchronously.
        if (a !== 'spindleStop') {
          return { message: START_CANCELLED };
        }
      }
    }
    if (body.generation !== undefined && body.generation !== r.generation && !stopping) {
      throw conflict('Le contrôleur a changé. Choisissez-le à nouveau.');
    }
    if (body.transportId !== undefined && !transports.has(body.transportId) && !stopping) {
      throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
    }

    if (a === 'load') {
      return load(c, r, body, actor);
    }

    if (a === 'motion') {
      return moves.perform(c, r, body, actor);
    }

    if (a === 'resumePlan') {
      return resumePlan(c, body);
    }

    if (a === 'check') {
      return checkFile(c, body);
    }

    if (a === 'settings') {
      return { firmware: r.firmware || firmwareOf(c), settings: allSettings(c) };
    }

    if (a === 'verifyOffset') {
      available(c, true);
      r.offset.verify();
      return { message: 'Vérification de l’origine de la pièce relancée.', workOffset: r.offset.snapshot() };
    }

    if (a === 'readSettings') {
      readSettingsReady(c);
      beginSettingsRead(c, r, (r.firmware || firmwareOf(c)) ? ['$$'] : ['$I', '$$']);
      return { message: 'Lecture des réglages ($$) demandée.' };
    }

    if (a === 'prepare') {
      if (!['start', 'resume', 'macro', 'unlock', 'home', 'spindle', 'zeroZ', 'blockProbe', 'set-origin'].includes(body.operation)) {
        throw conflict('Action invalide.');
      }
      // D1: the second, deliberate gesture of a start proven outside the travel, for a start only.
      if (body.override !== undefined && (body.operation !== 'start' || body.override !== 'travel')) {
        throw conflict('Action invalide.');
      }
      const nonce = crypto.randomBytes(24).toString('hex');
      let name;
      // What an operation adds to its confirmation (block probe: the plan).
      let extra = {};
      if (COMMISSIONING[body.operation]) {
        const op = COMMISSIONING[body.operation];
        let params = op.params ? op.params(body) : undefined;
        op.guard(c);
        // What the confirmation is bound to, read once the guard passed.
        params = op.bind ? op.bind(c, params) : params;
        name = op.name(c, params);
        extra = op.ticket ? op.ticket(c, params, { actor, transportId: body.transportId }) : {};
        r.ticket = {
          nonce,
          operation: body.operation,
          params,
          speed: body.operation === 'spindle' ? spindleTestSpeed(allSettings(c)) : undefined,
          expires: clock() + TICKET_LIFETIME_MS,
          transportId: body.transportId
        };
      } else if (body.operation === 'macro') {
        macroReady(c);
        const macro = findMacro(body.macroId);
        name = macro.name;
        r.ticket = { nonce, macroId: macro.id, operation: 'macro', expires: clock() + TICKET_LIFETIME_MS, transportId: body.transportId };
      }
      const ticketOf = (programCheck) => ({
        nonce,
        name,
        operation: body.operation,
        expiresIn: TICKET_LIFETIME_MS / 1000,
        generation: r.generation,
        programCheck: programCheck || null
      });
      if (COMMISSIONING[body.operation] || body.operation === 'macro') {
        return { ...ticketOf(null), ...extra };
      }
      const travel = body.override === 'travel' ? { request: true } : null;
      const j = readyFor(c, body.operation, body.revision, travel);
      name = j.originalName;
      if (body.operation === 'resume') {
        r.ticket = { nonce, revision: j.revision, operation: body.operation, expires: clock() + TICKET_LIFETIME_MS, transportId: body.transportId };
        return ticketOf(null);
      }
      // A start confirmation is issued only for the file as loaded (A5), and
      // carries the travel pre-check (F2): `unknown` is a warning, never a
      // green light, and the operator is told why; a proven overrun refuses it
      // (D1) unless this is the override, bound to what it overrides.
      return sameFileAsLoaded(j).then(() => {
        readyFor(c, 'start', body.revision, travel);
        // The stream closed meanwhile (rotation, Wi-Fi lost): its confirmations
        // were revoked, none is issued to it afterwards (bug hunt E-5).
        if (!transports.has(body.transportId)) {
          throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
        }
        const { check, signature } = travelOf(c, r, j);
        const override = travel && check && check.blocking.length ? signature : null;
        r.ticket = { nonce, revision: j.revision, operation: 'start', expires: clock() + TICKET_LIFETIME_MS, transportId: body.transportId, override };
        if (!override) {
          return ticketOf(check);
        }
        log({ event: 'override', kind: 'travel', stage: 'confirmed', ...jobInfo(j), controller: controllerInfo(c, r), overruns: check.blocking, actor: actor || null });
        return { ...ticketOf(check), override: { blocking: check.blocking } };
      });
    }

    if (a === 'macro') {
      const t = r.ticket;
      r.ticket = null;
      if (!t || t.nonce !== body.nonce || t.operation !== 'macro' || clock() > t.expires || t.transportId !== body.transportId) {
        throw conflict('Confirmation expirée ou déjà utilisée.');
      }
      macroReady(c);
      const macro = findMacro(t.macroId);
      return new Promise((resolve, reject) => {
        c.command('macro:run', macro.id, {}, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({ message: 'Macro « ' + macro.name + ' » envoyée au contrôleur.' });
          }
        });
      });
    }

    if (COMMISSIONING[a]) {
      const t = r.ticket;
      r.ticket = null;
      if (!t || t.nonce !== body.nonce || t.operation !== a || clock() > t.expires || t.transportId !== body.transportId) {
        throw conflict('Confirmation expirée ou déjà utilisée.');
      }
      return COMMISSIONING[a].run(c, t, actor);
    }

    if (a === 'spindleStop') {
      // During a block probe: the same stop as Arrêter, without an M5 that
      // would join the queue (its ok would be taken for the cycle's line).
      if (r.probing && r.probing.kind === 'block') {
        r.ticket = null;
        return blockProbe.stop(c, r, 'spindle');
      }
      // During a framing: the same stop as Arrêter, without an M5 that Grbl would refuse in Jog.
      if (moves.framing(r)) {
        r.ticket = null;
        return moves.stop(c, r, 'spindle');
      }
      spindleStopReady(c);
      if (/^Alarm/.test(controllerStatus(c).activeState || '')) {
        return { message: 'La broche est arrêtée par l’alarme.' };
      }
      c.command('gcode', 'M5');
      return { message: 'Arrêt broche (M5) envoyé.' };
    }

    if (a === 'override') {
      const steps = Object.prototype.hasOwnProperty.call(OVERRIDES, body.kind) && OVERRIDES[body.kind];
      if (!steps || !steps.includes(body.value)) {
        throw conflict('Correction invalide.');
      }
      if (body.kind === 'rapid') {
        rapidOverridable(c);
      } else {
        overridable(c);
      }
      c.command(body.kind + 'Override', body.value);
      const label = { feed: 'avance', spindle: 'broche', rapid: 'rapide' }[body.kind];
      let change = 'remise à 100 %';
      if (body.kind === 'rapid' && body.value !== 0 && body.value !== 100) {
        change = body.value + ' %';
      } else if (body.kind !== 'rapid' && body.value !== 0) {
        change = (body.value > 0 ? '+' : '') + body.value + ' %';
      }
      return { message: 'Correction ' + label + ' : ' + change + '.' };
    }

    if (a === 'start' || a === 'resume') {
      const t = r.ticket;
      r.ticket = null;
      if (!t || t.nonce !== body.nonce || t.operation !== a || clock() > t.expires || t.transportId !== body.transportId) {
        throw conflict('Confirmation expirée ou déjà utilisée.');
      }
      // D1: a ticket that overrides a proven overrun starts only on the very overruns confirmed.
      const travel = a === 'start' && t.override ? { signature: t.override } : null;
      const j = readyFor(c, a, t.revision, travel);
      if (a === 'resume') {
        // The program already sits in CNCjs's sender: a resume from a pause
        // stays synchronous (the stop/M6 sequences and their tests rely on it).
        j.started = true;
        const restart = pauseKind(c) === 'M6' && r.toolChange && r.toolChange.restart;
        log({ event: 'resume', ...jobInfo(j), controller: controllerInfo(c, r), pause: pauseKind(c), actor: actor || null });
        if (restart) {
          return restartSpindleThenResume(c, restart);
        }
        c.command('gcode:resume');
        return { message: 'Reprise demandée.' };
      }
      // A start sends the loaded program: the file on disk is read again
      // (cached fingerprint) first, and the machine re-checked after that
      // asynchronous step (A5).
      const pending = { cancelled: false };
      r.starting = pending;
      const ownerKey = (owner) => (owner ? owner.kind + ':' + owner.id : '');
      const owner = ownerKey(control.inspect(c.options.port).owner);
      changed();
      return sameFileAsLoaded(j).then(() => {
        if (pending.cancelled || r.starting !== pending) {
          throw conflict(START_CANCELLED);
        }
        if (!transports.has(body.transportId)) {
          throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
        }
        control.authorize(c.options.port, actor, a);
        if (ownerKey(control.inspect(c.options.port).owner) !== owner) {
          throw conflict(START_CANCELLED);
        }
        readyFor(c, a, t.revision, travel);
        // Still outside now (the override was needed): logged before anything is sent.
        const { check } = travel ? travelOf(c, r, j) : { check: null };
        const overriding = !!(check && check.blocking.length);
        if (overriding) {
          log({ event: 'override', kind: 'travel', stage: 'started', ...jobInfo(j), controller: controllerInfo(c, r), overruns: check.blocking, actor: actor || null });
        }
        j.wcsAtStart = modalWcs(r);
        j.started = true;
        j.external = false;
        j.ownStart = true;
        j.overrideStart = overriding;
        j.startActor = actor || null;
        c.command('gcode:start');
        return { message: 'Démarrage demandé.' };
      }).finally(() => {
        if (r.starting === pending) {
          r.starting = null;
        }
        changed();
      });
    }

    if (a === 'pause') {
      // A block probe cannot be resumed: Pause interrupts it like Arrêter.
      if (r.probing && r.probing.kind === 'block') {
        r.ticket = null;
        return blockProbe.stop(c, r, 'pause');
      }
      // A plate probe is a server sequence too: Pause ends it, including between lines.
      if (r.probing) {
        r.ticket = null;
        plateStop(c, r);
        return { message: 'Palpage interrompu. Vérifiez l’immobilisation ; le zéro Z n’est pas réglé.' };
      }
      // Grbl cannot hold a jog: a Pause during one of ours cancels it (0x85) and says so.
      if (c.workflow.state === 'idle' && moves.moving(c, r)) {
        r.ticket = null;
        return moves.stop(c, r, 'pause');
      }
      if (c.workflow.state !== 'running') {
        throw conflict('Aucun travail en cours.');
      }
      r.ticket = null;
      c.command('gcode:pause');
      log({ event: 'pause', ...jobInfo(r.job), controller: controllerInfo(c, r), line: Number(c.sender.state.received) || null, actor: actor || null });
      return { message: 'Pause demandée. Attendre l’état Hold.' };
    }

    if (a === 'stop') {
      const activeState = controllerStatus(c).activeState;
      const starting = r.starting;
      if (starting) {
        starting.cancelled = true;
        r.ticket = null;
      }
      // A block probe: feed hold then reset (block-probe.js), whatever the state.
      if (r.probing && r.probing.kind === 'block') {
        r.ticket = null;
        return blockProbe.stop(c, r, 'stop');
      }
      // A jog of ours, even one Grbl has not reported yet (report still Idle).
      if (c.workflow.state === 'idle' && moves.moving(c, r)) {
        r.ticket = null;
        return moves.stop(c, r, 'stop');
      }
      if (c.workflow.state === 'idle' && activeState === 'Jog') {
        r.ticket = null;
        c.command('jogCancel');
        return { message: 'Déplacement annulé.' };
      }
      // CNCjs's stop only acts in Run or Hold; a homing cycle needs a soft reset
      // (Grbl then asks for a new homing or $X). Grbl reports nothing during
      // the cycle, so the $H sent is enough to know it runs. The cycle stays
      // known (and Arrêter offered) until the banner or an Idle / Alarm report
      // shows the reset arrived: a lost 0x18 leaves the axes homing (E2 / N6).
      if (c.workflow.state === 'idle' && (activeState === 'Home' || homingActive(r))) {
        r.ticket = null;
        if (r.homing) {
          // Never taken for a completed homing afterwards.
          r.homing.interrupted = true;
        }
        c.command('reset');
        return { message: 'Réinitialisation envoyée pour interrompre la prise d’origine. Vérifiez l’immobilisation ; la carte demandera $H ou $X.' };
      }
      // Door open: CNCjs's stop sends neither feed hold nor reset in that
      // state, so Grbl would keep its planned moves for the next cycle start.
      const door = /^Door/.test(activeState || '');
      if (c.workflow.state === 'idle' && door) {
        r.ticket = null;
        c.command('reset');
        return { message: 'Arrêt avec porte ouverte (réinitialisation). La carte peut demander $H ou $X.' };
      }
      // The line reached, kept for a resume from a line, and the job marked
      // stopped (also when the stop interrupts a probe during a pause).
      const markStopped = () => {
        if (c.workflow.state !== 'idle' && r.job) {
          const line = stopLine(c, r);
          r.lastStop = { file: r.job.name, line };
          r.job.started = true;
          r.job.stopped = true;
          r.job.finishedAt = null;
          log({ event: 'stop', ...jobInfo(r.job), controller: controllerInfo(c, r), result: 'stopped', line, probing: !!r.probing, actor: actor || null });
          // The program may have changed the system or the offset (D2).
          r.offset.invalidate('stop');
        }
      };
      // A plate probe in progress: feed hold then reset, a line just sent included (C-08), and
      // the sequence gives up at its next step (plate-probe.js).
      if (r.probing) {
        r.ticket = null;
        markStopped();
        plateStop(c, r);
        return { message: 'Palpage interrompu. Vérifiez l’immobilisation ; le zéro Z n’est pas réglé.' };
      }
      const feeder = c.feeder.toJSON();
      if (c.workflow.state === 'idle' && !['Run', 'Hold'].includes(activeState) && !feeder.queue && !feeder.pending) {
        if (starting) {
          return { message: START_CANCELLED };
        }
        throw conflict('Aucun travail à arrêter.');
      }
      r.ticket = null;
      const plan = door ? '' : haltPlan(c);
      if (c.workflow.state === 'idle') {
        // A macro or console commands (CNCjs feeder) move the machine: its
        // queue must be emptied too, or the next 'ok' would send the rest.
        c.command('feeder:stop');
      }
      markStopped();
      c.command('gcode:stop');
      if (door) {
        c.command('reset');
      } else {
        halt(c, plan);
      }
      return { message: 'Arrêt demandé. Vérifiez l’immobilisation ; ce bouton ne remplace pas l’arrêt physique.' };
    }

    throw conflict('Action inconnue.');
  };

  // An operation refused for a failed proof of the work offset (D2): touching the button
  // again a few seconds later proves it again.
  const offsetRetry = (body, err) => {
    if (err && /^ETOUCH_OFFSET_(UNCONFIRMED|MISMATCH)$/.test(err.code || '') && body && typeof body.port === 'string') {
      const c = controllers()[body.port];
      const r = c && records.get(c);
      if (r) {
        r.offset.retry();
      }
    }
    throw err;
  };

  // perform() starts synchronously, so a pending load is visible to the very
  // next snapshot; every refusal still reaches the caller as a rejection.
  const action = (body, actor) => {
    try {
      return Promise.resolve(perform(body, actor)).catch((err) => offsetRetry(body, err)).then((result) => {
        // A refused or failed operation never changes the owner: a touch
        // client claims a free port only once its guarded operation succeeded.
        // A keepalive only extends a jog its start already claimed for: it never claims.
        if (actor && actor.kind === 'touch' && guarded(body) && !(body.action === 'motion' && body.operation === 'jog-keepalive')) {
          try {
            control.authorize(body.port, actor, body.action, { claim: true });
          } catch (_) {
            // Claimed by someone else meanwhile: the operation ran, the lease
            // is theirs, and the snapshot says so.
          }
        }
        return result;
      });
    } catch (err) {
      try {
        offsetRetry(body, err);
      } catch (_) {
        // offsetRetry always rethrows the refusal.
      }
      return Promise.reject(err);
    }
  };

  // Forgets the controllers CNCjs closed and registers the open Grbl ones
  // (status listeners), without building snapshots: the stream heartbeat
  // calls it even without a client, so a host command can be judged on fresh
  // reports and a closed controller is not kept for long.
  const observe = () => {
    if (disposed) {
      return [];
    }
    const registry = controllers();
    for (const [c, r] of records) {
      if (registry[c.options.port] !== c || c.isClose()) {
        motion.inspect(c.options.port);
        remove(c, r);
        // A closed port ends its control lease without transfer (F5).
        if (!registry[c.options.port] || registry[c.options.port].isClose()) {
          control.forget(c.options.port);
        }
      }
    }
    const open = Object.values(registry).filter((c) => c && !c.isClose() && c.type === 'Grbl');
    open.forEach(record);
    open.forEach(autoReadSettings);
    // The probe-input observer forgets closed controllers here too (counter-review 2).
    probeInput.sync();
    // Leases whose grace delay is over end here, every heartbeat (F5), and so
    // do leases idle for 5 minutes on a machine at rest: nothing running,
    // loading, probing, homing, jogging, waiting in the feeder or waiting for
    // a confirmation keeps a kiosk's lease alive by itself.
    const busy = (port) => {
      // A host command holds the machine (see system-command.js): its owner keeps it.
      if (systemCommands.current()) {
        return true;
      }
      const c = registry[port];
      if (!c || c.isClose()) {
        return false;
      }
      const r = records.get(c);
      const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
      const state = controllerStatus(c).activeState || '';
      return !!((c.workflow && c.workflow.state !== 'idle') || feeder.queue || feeder.pending ||
        /^(Run|Hold|Home|Jog|Door)/.test(state) ||
        (r && (r.loading || r.probing || r.frameStarting || homingActive(r) || (r.ticket && clock() <= r.ticket.expires) || moves.moving(c, r))));
    };
    if (control.tick({ busy }).length) {
      changed();
    }
    return open;
  };

  const list = () => {
    if (disposed) {
      throw conflict('Service indisponible.');
    }
    const open = observe();
    return open.map(snapshot);
  };

  // Cheap key of everything a snapshot depends on, apart from elapsed time
  // (report ages, ticket expiry), which the stream heartbeat covers. GrblRunner
  // replaces its state and settings objects only when they change, so their
  // identity tells a repeated status report from a new one without building
  // the snapshot.
  const ids = new WeakMap();
  let nextId = 0;
  const idOf = (o) => {
    if (!o || typeof o !== 'object') {
      return o === undefined ? '' : String(o);
    }
    if (!ids.has(o)) {
      nextId += 1;
      ids.set(o, nextId);
    }
    return ids.get(o);
  };
  const fingerprint = () => {
    if (disposed) {
      return '';
    }
    const registry = controllers();
    return (systemCommands.current() ? systemCommands.current().since + '#' : '') + control.signature() + '#' + profiles.revision() + '#' + Object.keys(registry).map((port) => {
      const c = registry[port];
      if (!c) {
        return port;
      }
      const runner = c.runner || {};
      const state = runner.state || {};
      const s = (c.sender && c.sender.state) || {};
      const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
      const r = records.get(c);
      const j = r && r.job;
      return [
        port, idOf(c), c.type, c.isClose(), c.ready, c.workflow && c.workflow.state,
        idOf(state), idOf(state.status), idOf(state.parserstate), idOf(runner.settings), idOf(c.settings),
        s.name, s.total, s.sent, s.received, s.hold, idOf(s.holdReason), idOf(s.context),
        feeder.queue, feeder.pending,
        r ? [r.loading, r.seen === null, r.modalSeen === null, r.wcs, r.ticket && r.ticket.nonce, r.firmware, r.startups, r.alarm, r.stall && r.stall.since,
          idOf(r.toolChange), r.lastStop && r.lastStop.line, idOf(r.probing), idOf(r.zeroZ), idOf(r.blockProbe), r.homing && r.homing.since, moves.signature(r),
          idOf(r.lastAlarm), idOf(r.frameStarting), r.frameStarting && r.frameStarting.cancelled, r.offset.signature()].join(',') : '',
        j ? [idOf(j), j.started, j.stopped, j.finishedAt, j.errors].join(',') : ''
      ].join(';');
    }).join('|');
  };

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  // `actor` (optional) is the client the stream carries: its presence keeps
  // its control lease alive (F5) until the transport closes plus the grace delay.
  const openTransport = (id, actor) => {
    transports.add(id);
    if (actor && actor.kind && actor.id) {
      try {
        control.attach(actor, id);
        transportActors.set(id, actor);
      } catch (_) {
        // An unidentifiable actor carries no presence.
      }
    }
  };

  const ticketPending = (id) => {
    const jogging = moves.holds(id);
    const probing = blockProbe.holds(id);
    const plate = plateProbe.holds(id);
    for (const r of records.values()) {
      if (r.frameStarting && r.frameStarting.transportId === id) {
        return true;
      }
      if (r.ticket && r.ticket.transportId === id && clock() <= r.ticket.expires) {
        return true;
      }
      // A continuous jog in progress: rotating its stream would stop it.
      if (jogging(r)) {
        return true;
      }
      // A block probe of this stream's device: the rotation waits for its end.
      if (probing(r)) {
        return true;
      }
      // A plate probe of this stream's device too (C-17).
      if (plate(r)) {
        return true;
      }
    }
    return false;
  };

  // Closing a transport revokes every confirmation it was issued. `rotated`:
  // closed by the stream itself to renew it (touch-stream.js), not lost.
  const closeTransport = (id, rotated = false) => {
    transports.delete(id);
    const actor = transportActors.get(id);
    if (actor) {
      transportActors.delete(id);
      control.detach(actor, id);
    }
    records.forEach((r, c) => {
      if (r.frameStarting && r.frameStarting.transportId === id) {
        r.frameStarting.cancelled = true;
      }
      if (r.ticket && r.ticket.transportId === id) {
        r.ticket = null;
      }
      // The owner's stream closing stops its continuous jog (0x85); a CNC framing keeps a rotation's grace.
      moves.transportClosed(c, r, id, rotated === true);
      // Its block probe stops at once, unless the stream is only renewed.
      blockProbe.transportClosed(c, r, actor, rotated === true);
      // Its plate probe as well (C-17).
      plateProbe.transportClosed(c, r, actor, rotated === true);
    });
    changed();
  };

  // A socket command that needs the lease, allowed on `port` (index.js refuseSocket): `full`
  // when it is a full homing cycle (`homing`, or `writeln` of the single line $H, both written at once). Any other one ($HX,
  // a macro, a jog…) cancels a full cycle announced before.
  const socketCommand = (port, full) => {
    if (disposed) {
      return;
    }
    const c = controllers()[port];
    if (!c || c.isClose() || c.type !== 'Grbl') {
      return;
    }
    const r = record(c);
    r.foreignHome = full && (controllerStatus(c).activeState || '') !== 'Home' ? clock() : null;
    if (full) {
      // A Home state seen before this command belongs to another cycle.
      r.sawHome = false;
    }
    // Its content is not read: a G10, a G92, a system change or a $H may follow (D2).
    r.offset.invalidate('socket');
  };

  // index.js refuseSocket: a command that is not safe waits, whoever owns the port, while a
  // sequence of the server runs (plate or block probe, C-12), the D2 transaction writes its lines,
  // or a host command holds the machine (C-60). Null when allowed, else the refusal.
  const socketRefusal = (port) => {
    if (disposed) {
      return null;
    }
    if (systemCommands.current()) {
      return conflict(SOCKET_SYSTEM_BUSY);
    }
    const c = controllers()[port];
    const r = c && records.get(c);
    if (r && r.settingsRead) {
      return settingsReading();
    }
    if (r && (r.originChecking || r.frameStarting)) {
      return conflict('Des commandes sont en attente.');
    }
    if (r && moves.framing(r)) {
      return conflict(SOCKET_FRAME_BUSY);
    }
    if (r && r.probing) {
      return conflict(SOCKET_PROBE_BUSY);
    }
    return r && (r.offset.checking() || r.offset.restoring()) ? r.offset.refusal() : null;
  };

  // index.js refuseSocket: a stop from a socket (gcode:stop, stop, feeder:stop, feedhold, pause,
  // reset, `!`, 0x18) first ends, synchronously, the sequence of the server in progress: the block
  // probe and the plate probe (feed hold then reset, PLAN-CORRECTIONS § 1.6, C-09), the D2
  // transaction. The command then goes its own way.
  const socketStop = (port) => {
    const c = !disposed && controllers()[port];
    const r = c && records.get(c);
    if (!r) {
      return;
    }
    r.offset.cancel();
    if (r.frameStarting) {
      r.frameStarting.cancelled = true;
    }
    if (r.starting) {
      r.starting.cancelled = true;
    }
    // A framing in progress ends before the command passes (lot F1, P1): 0x85, nothing after it.
    if (moves.framing(r)) {
      moves.stop(c, r, 'socket');
    }
    if (r.probing && r.probing.kind === 'block') {
      blockProbe.stop(c, r, 'stop');
    } else if (r.probing) {
      plateStop(c, r);
    }
  };

  // index.js refuseSocket: a jog cancel from a socket (`jogCancel`, 0x85) ends a framing of the
  // server, synchronously, before it passes (lot F1, review D4): a framing is a sequence of jogs,
  // and the operator who cancels one does not want the next. The probes are not jogs: they keep
  // their own stops (socketStop).
  const socketJogCancel = (port) => {
    const c = !disposed && controllers()[port];
    const r = c && records.get(c);
    if (!r) {
      return;
    }
    if (r.frameStarting) {
      r.frameStarting.cancelled = true;
    }
    if (moves.framing(r)) {
      moves.stop(c, r, 'socket');
    }
  };

  // api.gcode.js upload (POST /api/gcode, CNCjs's own loading): refused while a framing runs or
  // waits to start (lot F1, review C3). Null when allowed.
  const uploadRefusal = (port) => {
    const c = !disposed && controllers()[port];
    const r = c && records.get(c);
    return r && (r.frameStarting || moves.framing(r)) ? conflict(SOCKET_FRAME_BUSY) : null;
  };

  const dispose = () => {
    disposed = true;
    listeners.clear();
    transports.clear();
    transportActors.clear();
    systemCommands.clear();
    for (const [c, r] of records) {
      remove(c, r);
    }
    motion.dispose();
    probeInput.dispose();
  };

  return {
    action,
    previewMotion: motion.preview,
    observe,
    list,
    fingerprint,
    subscribe,
    openTransport,
    closeTransport,
    ticketPending,
    reserveSystemCommand: systemCommands.reserve,
    systemCommand: systemCommands.view,
    socketCommand,
    socketRefusal,
    socketStop,
    socketJogCancel,
    uploadRefusal,
    control,
    dispose
  };
};
