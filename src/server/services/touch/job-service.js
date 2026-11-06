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
import { createControl, SAFE_ACTIONS } from './control.js';
// eslint-disable-next-line import/extensions
import { createMotion, maxFeedOf, MAX_JOG_MS, MIN_FEED } from './motion.js';
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
import { createSystemCommands } from './system-command.js';

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

const hasAutomations = (config) => {
  return (config.get('events') || []).some((event) => event.enabled !== false);
};

// Durations (ticket lifetime, report age) are measured on a monotonic clock:
// the wall clock can be set back by NTP, which would keep a ticket alive.
const monotonic = () => performance.now();

// Actions that need the control lease when the port is owned by someone
// else; a touch client that identifies itself claims a free port with them.
// `machine`: type of machine and laser framing (PROFILES-CONTRACT §2, §4).
const GUARDED_ACTIONS = ['load', 'prepare', 'start', 'resume', 'macro', 'override', 'unlock', 'home', 'spindle', 'zeroZ', 'readSettings', 'set-origin', 'machine'];

// Real moves (F1, motion.js): every `motion` operation is guarded like the
// actions above, except `jog-stop`, which is free for everyone like Stop.
const guarded = (body) => GUARDED_ACTIONS.includes(body.action) || (body.action === 'motion' && body.operation !== 'jog-stop');

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

  const changed = () => {
    listeners.forEach((fn) => fn());
  };

  const controllers = () => store.get('controllers') || {};

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
        ticket: null,
        // Firmware seen in the startup banner or a $I reply, and how many
        // times the board restarted (an E-stop wired to reset restarts it).
        firmware: '',
        startups: 0,
        // Last ALARM:n code, kept until the board restarts.
        alarm: null,
        // Since when Grbl is idle while the job waits for acknowledgements.
        stall: null,
        // Spindle state when a tool change (M6) pause began, to restart it on resume.
        toolChange: null,
        // Line (of the original file) acknowledged when the last job was stopped.
        lastStop: null,
        // Plate probe in progress, and the last one (result or failure).
        probing: null,
        zeroZ: null,
        // Homing cycle sent ($H) and not yet over (see HOMING_MIN_MS).
        homing: null,
        // A homing cycle was seen complete (ours, or a Home state followed by
        // Idle) since the last board restart or alarm: the only ground for the
        // travel check (F2). $22=1 alone means enabled, not done.
        homed: false,
        sawHome: false,
        // Status reports received, so a step can wait for a newer one.
        reports: 0,
        generation: crypto.randomBytes(12).toString('hex')
      };
      r.status = (payload) => {
        r.seen = clock();
        // A work offset reported since the board started: what CNCjs needs to
        // turn a WPos report ($10 bit 0 clear) into a machine position (F1).
        const wco = payload && payload.wco;
        if (wco && ['x', 'y', 'z'].every((axis) => Number.isFinite(Number(wco[axis])) && String(wco[axis]).trim() !== '')) {
          r.wcoSeen = true;
        }
        r.reports += 1;
        const active = controllerStatus(c).activeState || '';
        if (r.homing && clock() - r.homing.since >= HOMING_MIN_MS && /^(Idle|Alarm)/.test(active)) {
          // An error received while our $H was outstanding: never a completed homing
          // (a Home report seen meanwhile still is, see sawHome below).
          if (active === 'Idle' && !r.homing.refused) {
            r.homed = true;
          }
          r.homing = null;
        }
        if (active === 'Home') {
          r.sawHome = true;
        } else if (r.sawHome && active === 'Idle') {
          r.sawHome = false;
          r.homed = true;
        } else if (r.sawHome && !/^(Home|Idle)/.test(active)) {
          r.sawHome = false;
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
        changed();
      };
      r.alarmed = (res) => {
        r.alarm = grblCode(res);
        r.homing = null;
        // An alarm may have lost the position (hard/soft limit, abort during a cycle).
        r.homed = false;
        r.sawHome = false;
        if (r.job && r.job.started && !r.job.stopped && !r.job.finishedAt) {
          log({ event: 'alarm', ...jobInfo(r.job), controller: controllerInfo(c, r), code: r.alarm, actor: SYSTEM });
        }
        changed();
      };
      r.reset = (payload) => {
        r.seen = null;
        r.modalSeen = null;
        r.wcs = null;
        r.ticket = null;
        r.alarm = null;
        r.stall = null;
        r.homing = null;
        r.homed = false;
        r.wcoSeen = false;
        // A Home state seen before the restart says nothing about the new session.
        r.sawHome = false;
        r.startups += 1;
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
        changed();
      };
      r.file = () => {
        r.job = null;
        r.ticket = null;
        changed();
      };
      c.runner.on('status', r.status);
      c.runner.on('startup', r.reset);
      c.runner.on('parserstate', r.modal);
      c.runner.on('raw', r.raw);
      // CNCjs rewinds the sender when a program ends, so "all lines acknowledged"
      // must be remembered when it happens to tell a finished job from a stopped one.
      r.end = () => {
        if (r.job && r.job.started && !r.job.stopped) {
          r.job.finishedAt = clock();
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
          // Our own start names its actor; a start made from the classic interface does not.
          const actor = r.job.startActor || { kind: 'socket', id: 'cncjs', label: 'interface CNCjs' };
          r.job.startActor = null;
          log({ event: 'start', ...jobInfo(r.job), controller: controllerInfo(c, r), startedAt: new Date().toISOString(), actor });
          changed();
        }
      };
      if (c.workflow && typeof c.workflow.on === 'function') {
        c.workflow.on('start', r.run);
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
    records.delete(c);
    moves.forget(c, r);
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

  const available = (c) => {
    if (controllers()[c.options.port] !== c || c.isClose() || !c.ready || !c.runner || !c.sender) {
      throw conflict('Connexion machine indisponible.');
    }
    const r = record(c);
    if (!Number.isFinite(r.seen) || clock() < r.seen || clock() - r.seen > MAX_REPORT_AGE_MS) {
      throw conflict('État machine trop ancien : attendre un rapport récent.');
    }
    // Nothing that moves the machine starts while a host command runs (pause,
    // stop and M5 do not come through here).
    if (systemCommands.current()) {
      throw conflict('Commande système en cours (' + systemCommands.current().title + ') : attendez sa fin.');
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

  const readyFor = (c, action, revision) => {
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
    } else {
      const kind = pauseKind(c);
      const state = controllerStatus(c).activeState;
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
    return j;
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
    if (systemCommands.current() || r.loading || r.probing || homingActive(r) || moves.moving(c, r) ||
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
  const { zeroZReady, plateParams, answers, zeroZ } = createPlateProbe({
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
    moving: (c, r) => moves.moving(c, r)
  });
  // The plate probe turns no spindle but is a CNC operation (contract §3).
  const plateReady = (c) => {
    requireCapability(c, 'plateProbe');
    zeroZReady(c);
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
    // Turning, or maybe turning: no FS speed reported and no fresh $G to tell.
    spindleOn: (c) => spindleOn(c) || (realtimeValue(controllerStatus(c).spindle) === null && !modalFresh(record(c)))
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
      name: (c, params) => 'Zéro Z avec plaque de ' + params.thickness + ' mm (recherche ' + params.search + ' mm)',
      run: (c, t, actor) => {
        requireCapability(c, 'plateProbe');
        return zeroZ(c, t, actor);
      }
    },
    // Work origin at the current position (F1, motion.js).
    'set-origin': moves.originOperation
  };

  // Runs a guard and returns its failure message, or '' when it passes.
  const reason = (guard) => {
    try {
      guard();
      return '';
    } catch (err) {
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

    const loadReason = reason(() => {
      idle(c);
      if (r.loading) {
        throw conflict('Chargement en cours.');
      }
    });
    const startReason = reason(() => readyFor(c, 'start', revision));
    const resumeReason = reason(() => readyFor(c, 'resume', revision));
    const overrideReason = reason(() => overridable(c));
    const rapidReason = reason(() => rapidOverridable(c));
    const macroReason = reason(() => macroReady(c));
    const unlockReason = reason(() => unlockReady(c));
    const homeReason = reason(() => homeReady(c));
    const spindleReason = reason(() => spindleReady(c));
    const spindleStopReason = reason(() => spindleStopReady(c));
    const zeroZReason = reason(() => plateReady(c));

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
      // Travel pre-check of the loaded program against this machine now (F2).
      programCheck: r.job && r.job.analysis ? checkProgram(r.job.analysis, machineForCheck(c, r)) : null,
      homed: r.homed === true,
      // Who pilots this port (F5): {owner, lastChange}; the client derives its own role from its clientId.
      control: { owner: attribution.owner, lastChange: attribution.lastChange },
      total: sender.total,
      sent: sender.sent,
      received: sender.received,
      probeInput: probeInput.inspect(c.options.port),
      loading: r.loading,
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
      stalledMs: r.stall && Number.isFinite(r.seen) && r.seen - r.stall.since >= STALL_MS ? r.seen - r.stall.since : null,
      programPause: programPauseOf(c, r),
      resume: r.job && r.job.resume ? { ...r.job.resume } : null,
      stoppedAtLine: r.lastStop ? r.lastStop.line : null,
      stoppedFile: r.lastStop ? r.lastStop.file : null,
      canPause: c.workflow.state === 'running',
      // A macro waiting in a dwell (CNCjs queue not empty) can be stopped too.
      canStop: c.workflow.state !== 'idle' || ['Run', 'Hold', 'Home', 'Jog'].includes(state.activeState) || /^Door/.test(state.activeState || '') ||
        !!r.probing || homingActive(r) || !!(feederState.queue || feederState.pending) ||
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
      canSpindleStop: !spindleStopReason,
      // Z zero with a touch plate (guarded like the commissioning commands).
      canZeroZ: !zeroZReason,
      zeroZReason,
      probing: !!r.probing,
      zeroZ: r.zeroZ ? { ...r.zeroZ } : null,
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
      reportUnits,
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
    const j = r.job;
    const sender = c.sender.state || {};
    if (!j || sender.name !== j.name || !sender.context || sender.context.touchJob !== j.revision) {
      throw machineRefusal('ETOUCH_LASER_FRAME_NO_PROGRAM');
    }
    const a = j.analysis;
    const check = checkProgram(a, machineForCheck(c, r));
    if (check.axes.X.verdict !== 'validated' || check.axes.Y.verdict !== 'validated') {
      throw machineRefusal('ETOUCH_LASER_FRAME_CHECK');
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
      const plan = framePlan(c, r, body.feed);
      const nonce = crypto.randomBytes(24).toString('hex');
      r.ticket = {
        nonce,
        operation: 'frame',
        revision: plan.job.revision,
        fingerprint: plan.job.fingerprint,
        lines: plan.lines,
        feed: plan.feed,
        expires: clock() + TICKET_LIFETIME_MS,
        transportId: body.transportId
      };
      return {
        nonce,
        name: 'Cadrage laser X ' + fmt3(plan.bounds.xMin) + ' → ' + fmt3(plan.bounds.xMax) + ', Y ' + fmt3(plan.bounds.yMin) + ' → ' + fmt3(plan.bounds.yMax) + ' mm à ' + fmt3(plan.feed) + ' mm/min (M5 d’abord, sans émission)',
        operation: 'frame',
        expiresIn: TICKET_LIFETIME_MS / 1000,
        generation: r.generation,
        frame: { lines: plan.lines.slice(), bounds: plan.bounds, feed: plan.feed }
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
      const plan = framePlan(c, r, t.feed);
      if (plan.job.revision !== t.revision || plan.job.fingerprint !== t.fingerprint || plan.lines.join('\n') !== t.lines.join('\n')) {
        throw machineRefusal('ETOUCH_LASER_FRAME_CHANGED');
      }
      return plan;
    };
    const first = again();
    return sameFileAsLoaded(first.job).then(() => moves.frame(c, r, again(), actor, body.transportId));
  };

  const perform = (body, actor) => {
    if (!body || typeof body.port !== 'string') {
      throw conflict('Choisissez une machine.');
    }
    const c = get(body.port);
    const r = record(c);
    const a = body.action;

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
      if (op === 'release') {
        return control.release(c.options.port, actor);
      }
      if (op === 'takeover') {
        return control.takeover(c.options.port, actor, body.reason);
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

    if (['prepare', 'start', 'resume', 'macro', 'override', 'unlock', 'home', 'spindle', 'zeroZ', 'readSettings', 'set-origin'].includes(a) ||
        (guarded(body) && a === 'motion')) {
      if (typeof body.generation !== 'string' || body.generation !== r.generation) {
        throw conflict('Le contrôleur a changé ou son identité manque. Choisissez-le à nouveau.');
      }
      if (typeof body.transportId !== 'string' || !transports.has(body.transportId)) {
        throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
      }
    }
    const stopping = ['pause', 'stop', 'spindleStop'].includes(a) || (a === 'motion' && body.operation === 'jog-stop');
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

    if (a === 'readSettings') {
      idle(c);
      noJob(c);
      c.command('gcode', record(c).firmware ? '$$' : ['$I', '$$']);
      return { message: 'Lecture des réglages ($$) demandée.' };
    }

    if (a === 'prepare') {
      if (!['start', 'resume', 'macro', 'unlock', 'home', 'spindle', 'zeroZ', 'set-origin'].includes(body.operation)) {
        throw conflict('Action invalide.');
      }
      const nonce = crypto.randomBytes(24).toString('hex');
      let name;
      if (COMMISSIONING[body.operation]) {
        const op = COMMISSIONING[body.operation];
        let params = op.params ? op.params(body) : undefined;
        op.guard(c);
        // What the confirmation is bound to, read once the guard passed.
        params = op.bind ? op.bind(c, params) : params;
        name = op.name(c, params);
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
        return ticketOf(null);
      }
      const j = readyFor(c, body.operation, body.revision);
      name = j.originalName;
      if (body.operation === 'resume') {
        r.ticket = { nonce, revision: j.revision, operation: body.operation, expires: clock() + TICKET_LIFETIME_MS, transportId: body.transportId };
        return ticketOf(null);
      }
      // A start confirmation is issued only for the file as loaded (A5), and
      // carries the travel pre-check (F2) as a warning: `unknown` is never a
      // green light, and the operator is told why.
      return sameFileAsLoaded(j).then(() => {
        readyFor(c, 'start', body.revision);
        // The stream closed meanwhile (rotation, Wi-Fi lost): its confirmations
        // were revoked, none is issued to it afterwards (bug hunt E-5).
        if (!transports.has(body.transportId)) {
          throw conflict('Connexion de suivi interrompue. Confirmez à nouveau.');
        }
        r.ticket = { nonce, revision: j.revision, operation: 'start', expires: clock() + TICKET_LIFETIME_MS, transportId: body.transportId };
        return ticketOf(j.analysis ? checkProgram(j.analysis, machineForCheck(c, r)) : null);
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
      spindleStopReady(c);
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
      const j = readyFor(c, a, t.revision);
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
      return sameFileAsLoaded(j).then(() => {
        readyFor(c, a, t.revision);
        j.wcsAtStart = modalWcs(r);
        j.started = true;
        j.external = false;
        j.ownStart = true;
        j.startActor = actor || null;
        c.command('gcode:start');
        return { message: 'Démarrage demandé.' };
      });
    }

    if (a === 'pause') {
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
      // the cycle, so the $H sent is enough to know it runs.
      if (c.workflow.state === 'idle' && (activeState === 'Home' || homingActive(r))) {
        r.ticket = null;
        r.homing = null;
        c.command('reset');
        return { message: 'Prise d’origine interrompue (réinitialisation). La carte demandera $H ou $X.' };
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
          const k = Number(c.sender.state.received) || 0;
          const res = r.job.resume;
          let line = k;
          if (res) {
            // Preamble lines are not lines of the file.
            line = k <= res.preambleLength ? res.from - 1 : res.from + (k - res.preambleLength - 1);
          }
          r.lastStop = { file: r.job.name, line };
          r.job.started = true;
          r.job.stopped = true;
          r.job.finishedAt = null;
          log({ event: 'stop', ...jobInfo(r.job), controller: controllerInfo(c, r), result: 'stopped', line, probing: !!r.probing, actor: actor || null });
        }
      };
      // A plate probe in progress: feed hold then reset, and the sequence gives
      // up at its next step.
      if (r.probing) {
        r.ticket = null;
        r.probing.cancelled = true;
        markStopped();
        const plan = haltPlan(c);
        c.command('feeder:stop');
        c.command('gcode:stop');
        halt(c, plan);
        return { message: 'Palpage interrompu. Vérifiez l’immobilisation ; le zéro Z n’est pas réglé.' };
      }
      const feeder = c.feeder.toJSON();
      if (c.workflow.state === 'idle' && !['Run', 'Hold'].includes(activeState) && !feeder.queue && !feeder.pending) {
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

  // perform() starts synchronously, so a pending load is visible to the very
  // next snapshot; every refusal still reaches the caller as a rejection.
  const action = (body, actor) => {
    try {
      return Promise.resolve(perform(body, actor)).then((result) => {
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
        (r && (r.loading || r.probing || homingActive(r) || (r.ticket && clock() <= r.ticket.expires) || moves.moving(c, r))));
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
          idOf(r.toolChange), r.lastStop && r.lastStop.line, idOf(r.probing), idOf(r.zeroZ), r.homing && r.homing.since, moves.signature(r)].join(',') : '',
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
    for (const r of records.values()) {
      if (r.ticket && r.ticket.transportId === id && clock() <= r.ticket.expires) {
        return true;
      }
      // A continuous jog in progress: rotating its stream would stop it.
      if (jogging(r)) {
        return true;
      }
    }
    return false;
  };

  // Closing a transport revokes every confirmation it was issued.
  const closeTransport = (id) => {
    transports.delete(id);
    const actor = transportActors.get(id);
    if (actor) {
      transportActors.delete(id);
      control.detach(actor, id);
    }
    records.forEach((r, c) => {
      if (r.ticket && r.ticket.transportId === id) {
        r.ticket = null;
      }
      // The owner's stream closing stops its continuous jog (0x85).
      moves.transportClosed(c, r, id);
    });
    changed();
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
    control,
    dispose
  };
};
