// "Pause and retract" (F2, design examples/cncjs-touch/design/fonctions/F2-CONCEPTION.md): the
// program stops being sent WITHOUT a feed hold (`!`), the board finishes what it already received
// and comes to rest by itself; once rest is proven, the state is remembered and Z rises with one
// relative jog to RETRACT_TOP_MARGIN_MM below the top of its usable travel, then the spindle stops.
// The resume compares position, work offset and modal state with what was remembered, starts the
// spindle, waits, lowers Z (fast, then the last RETRACT_APPROACH_MM slowly), compares again, and
// only then lets CNCjs send the rest of the program (`~`). X and Y never move, the modal state is
// never written: any difference cancels the in-place resume (Arrêter, then resume from a line).
// Pause (feed hold) and Arrêter keep their own paths (job-service.js).
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';
// eslint-disable-next-line import/extensions
import { envelopeOf, limitsAt, usableOf, maxFeedOf, DISABLED_MESSAGE, HOMING_MESSAGE } from './motion.js';

export const RETRACT_TOP_MARGIN_MM = 5;
export const RETRACT_FEED = 600;
export const RETRACT_APPROACH_MM = 5;
export const RETRACT_PLUNGE_FEED = 100;
export const RETRACT_SPINUP_S = 3;
const POS_TOL = 0.01;
const REST_TOL = 0.001;
const OFFSET_TOL = 0.0025;
const STREAM_GRACE_MS = 3000;
const STALE_MS = 2500;
const SUPERVISE_MS = 100;
const PARK_WATCH_MS = 1000;
const MODAL_WAIT_MS = 3000;
const WCO_WAIT_MS = 5000;
const LINE_MARGIN_MS = 15000;
const DRAIN_STALL_MS = 30000;
// After a cancelled move: how long the jog cancel is repeated and the spindle stop may wait for rest.
const SECURE_MS = 5000;
const CANCEL_RESEND_MS = 200;

// Coded refusals and stops: the server's French message, with its values (§ 8.1).
export const RETRACT_MESSAGES = {
  ETOUCH_RETRACT_NOT_RUNNING: 'Dégagement refusé : aucun usinage en cours lancé depuis cette tablette.',
  ETOUCH_RETRACT_ENDING: 'Dégagement refusé : toutes les lignes sont déjà envoyées, l’usinage se termine.',
  ETOUCH_RETRACT_LASER: 'Dégagement refusé : fonction réservée à une machine CNC, hors mode laser.',
  ETOUCH_RETRACT_TRAVEL_UNKNOWN: 'Dégagement refusé : la course en Z n’est pas vérifiable (prise d’origine non constatée, réglages non lus ou rapports en pouces).',
  ETOUCH_RETRACT_TRAVEL: 'Dégagement annulé : Z machine {z} hors de la course utilisable ({low} à {high}).',
  ETOUCH_RETRACT_STREAM: 'Dégagement arrêté : la tablette qui l’a demandé ne suit plus la machine.',
  ETOUCH_RETRACT_CONTROL: 'Dégagement arrêté : le pilotage a changé de main.',
  ETOUCH_RETRACT_STALE: 'Dégagement arrêté : rapports de la machine interrompus plus de 2,5 s.',
  ETOUCH_RETRACT_STALLED: 'Dégagement arrêté : la machine est au repos mais des lignes restent sans réponse.',
  ETOUCH_RETRACT_MODAL: 'Dégagement arrêté : état de la machine ($G) non reçu après l’arrêt.',
  ETOUCH_RETRACT_FOREIGN: 'Dégagement arrêté : un arrêt est venu d’une autre interface.',
  ETOUCH_RETRACT_ERROR: 'Grbl a refusé une ligne du dégagement (error:{error}).',
  ETOUCH_RETRACT_TIMEOUT: 'Dégagement arrêté : une ligne n’a pas fini à temps.',
  ETOUCH_RETRACT_POSITION: 'Dégagement arrêté : position {axis} inattendue après un mouvement.',
  ETOUCH_RETRACT_UNEXPECTED: 'Dégagement arrêté : état {state} inattendu de la machine.',
  ETOUCH_RETRACT_SPINDLE: 'Reprise arrêtée : la broche n’a pas redémarré, la fraise n’est pas redescendue.',
  ETOUCH_RETRACT_PAUSED: 'Dégagement interrompu par Pause.',
  ETOUCH_RETRACT_STATE: 'Reprise refusée : la machine n’est pas au repos (état {state}).',
  ETOUCH_RETRACT_MOVED: 'Reprise sur place annulée : la machine a bougé pendant la pause ({axis}).',
  ETOUCH_RETRACT_ZERO_CHANGED: 'Reprise sur place annulée : l’origine de la pièce a changé ou n’est plus confirmée ({axis}).',
  ETOUCH_RETRACT_STATE_CHANGED: 'Reprise sur place annulée : l’état de la machine a changé pendant la pause ({field}).',
  ETOUCH_RETRACT_ALARM: 'Alarme[ {alarm}] pendant le dégagement.',
  ETOUCH_RETRACT_RESTART: 'La carte a redémarré pendant le dégagement.'
};

// index.js refuseSocket: shown by CNCjs's own interface, without a code (like SOCKET_PROBE_BUSY).
export const SOCKET_RETRACT_BUSY = 'Fraise dégagée par la tablette : commande refusée jusqu’à la reprise (Arrêter reste possible).';

// The only lines the sequence ever writes (§ 4.3).
const LINE = /^(M5|M[34] S\d+(\.\d+)?|G4 P3|\$J=G91 G21 Z-?\d+(\.\d+)? F\d+(\.\d+)?)$/;

// Lost stream, lease or reports while the machine finishes its lines: the lift is dropped, the
// rest is still proven (phase held), nothing is written.
const SOFT_IN_DRAIN = ['ETOUCH_RETRACT_STREAM', 'ETOUCH_RETRACT_CONTROL', 'ETOUCH_RETRACT_STALE'];

const fill = (template, params) => template.replace(/\[([^\]]*)\]|\{(\w+)\}/g, (all, part, key) => {
  if (part !== undefined) {
    return (part.match(/\{\w+\}/g) || []).some((name) => params && params[name.slice(1, -1)] === null) ? '' : fill(part, params);
  }
  return params && params[key] !== undefined && params[key] !== null ? String(params[key]) : all;
});

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const round3 = (n) => Math.round(n * 1000) / 1000;
const fmt = (n) => String(round3(n));
const keyOf = (who) => (who && who.kind && who.id ? who.kind + ':' + who.id : '');

// A failure in a sequence: what fail() is given. STOPPED: the sequence was ended elsewhere.
const STOPPED = { stopped: true };
const failure = (code, params = {}, soft = false) => ({ failure: true, code, params, soft });
export const failureOf = (code, params = {}) => ({ code, params, message: fill(RETRACT_MESSAGES[code], params) });

// deps (from job-service.js): config, clock, conflict, controllers, record, later, changed, log,
// controllerInfo, jobInfo, allSettings, settingNumber, answers, control, transports, transportActors,
// available, validJob, modalFresh, hasAutomations, homingActive, motionEnabled(c, r), profileOf(c, r), stopLine(c, r).
// eslint-disable-next-line max-lines-per-function
export const createRetract = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, changed, log, controllerInfo, jobInfo, allSettings, settingNumber,
    answers, control, transports, transportActors, available, validJob, modalFresh, hasAutomations, homingActive,
    motionEnabled, profileOf, stopLine
  } = deps;

  const refusal = (code, params = {}) => {
    const err = conflict(fill(RETRACT_MESSAGES[code], params));
    err.code = code;
    err.params = params;
    return err;
  };
  const toRefusal = (f) => refusal(f.code, f.params);

  const connected = (c) => controllers()[c.options.port] === c && !c.isClose() && !!c.runner && !!c.sender && !!c.feeder && !!c.workflow;
  const activeOf = (c) => controllerStatus(c).activeState || '';
  const fresh = (r) => Number.isFinite(r.seen) && clock() >= r.seen && clock() - r.seen <= STALE_MS;
  const mposOf = (c) => {
    const p = controllerStatus(c).mpos || {};
    const out = { x: num(p.x), y: num(p.y), z: num(p.z) };
    return out.x === null || out.y === null || out.z === null ? null : out;
  };
  const parserOf = (c) => (c.runner && c.runner.state && c.runner.state.parserstate) || {};
  const modalOf = (c) => {
    const p = parserOf(c);
    return { modal: { ...(p.modal || {}) }, tool: p.tool === undefined ? null : String(p.tool), F: num(p.feedrate), S: num(p.spindle) };
  };
  // The spindle speed of the latest report only (CNCjs keeps the last FS: of an older one).
  const spindleSpeed = (c, r, s) => {
    const v = controllerStatus(c).spindle;
    return s.speedReport === r.reports && typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const feedOverride = (c) => {
    const ov = controllerStatus(c).ov;
    return Array.isArray(ov) && ov.length === 3 && typeof ov[0] === 'number' && ov[0] > 0 ? ov[0] : null;
  };
  // C1 to C3: the program held by CNCjs, every line sent answered, nothing queued in the feeder.
  const drained = (c) => {
    const s = c.sender && c.sender.state;
    const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
    return !!(c.workflow && c.workflow.state === 'paused' && s && s.hold === true && Number(s.received) === Number(s.sent) &&
      !feeder.queue && !feeder.pending);
  };
  const owner = (c) => keyOf(control.inspect(c.options.port).owner);
  // A jog of ours may still move (D1): written and not proven at rest since, or a report says Jog.
  const jogMaybe = (c, s) => !!(s.jogLive || (s.out && /^\$J=/.test(s.out.line)) || activeOf(c) === 'Jog');
  // The last two reports, both received after report number `mark`, say Idle with coordinates of
  // their own (report() counts an Idle streak only over reports carrying XYZ).
  const idleSince = (r, s, mark) => s.idleFrom !== null && r.reports - Math.max(s.idleFrom, mark + 1) >= 1;
  const alarmParams = (r) => ({ alarm: r.alarm ? 'ALARM:' + r.alarm : null });

  // ---------------------------------------------------------------- guards before

  // Z travel checkable from here: $13=0, homed, the Z envelope known, the position inside it, no
  // ambiguity. Returns { z, usable } or throws ETOUCH_RETRACT_TRAVEL_UNKNOWN.
  const travelOf = (c, r) => {
    const settings = allSettings(c);
    if (settingNumber(settings, 13) !== 0 || r.homed !== true) {
      throw refusal('ETOUCH_RETRACT_TRAVEL_UNKNOWN');
    }
    const mpos = mposOf(c);
    const env = envelopeOf(settings, r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos }).Z;
    const at = limitsAt(env, mpos ? mpos.z : null, 'Z');
    if (!at.limits || at.outside || at.ambiguous) {
      throw refusal('ETOUCH_RETRACT_TRAVEL_UNKNOWN');
    }
    const usable = usableOf(at.limits);
    if (usable.high - RETRACT_TOP_MARGIN_MM < usable.low) {
      throw refusal('ETOUCH_RETRACT_TRAVEL_UNKNOWN');
    }
    return { z: mpos.z, usable };
  };

  // "Pause and retract" may start now (§ 6.1); the same checks at prepare and at the run.
  const ready = (c, revision) => {
    available(c);
    const r = record(c);
    if (r.probing) {
      throw conflict('Palpage en cours.');
    }
    if (homingActive(r)) {
      throw conflict(HOMING_MESSAGE);
    }
    if (r.loading) {
      throw conflict('Chargement en cours.');
    }
    if (!motionEnabled(c, r)) {
      const err = conflict(DISABLED_MESSAGE);
      err.code = 'ETOUCH_MOTION_DISABLED';
      err.params = {};
      throw err;
    }
    const profile = profileOf(c, r);
    if (profile.kind !== 'cnc' || settingNumber(allSettings(c), 32) !== 0) {
      throw refusal('ETOUCH_RETRACT_LASER');
    }
    const j = r.job;
    const state = activeOf(c);
    if (r.retract || !j || !j.started || j.external || j.stopped || j.finishedAt || j.errors || j.boardRestarted || j.probeFailed ||
        c.workflow.state !== 'running' || !fresh(r) || !['Run', 'Idle'].includes(state)) {
      throw refusal('ETOUCH_RETRACT_NOT_RUNNING');
    }
    validJob(c, revision === undefined ? j.revision : revision);
    const s = c.sender.state;
    if (s.hold || !(Number(s.sent) < Number(s.total))) {
      throw refusal('ETOUCH_RETRACT_ENDING');
    }
    travelOf(c, r);
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
  };

  // ---------------------------------------------------------------- state changes

  const logOf = (c, r, s, stage, extra = {}) => {
    log({
      event: 'retract',
      stage,
      ...jobInfo(r.job),
      controller: controllerInfo(c, r),
      line: s.line,
      ...extra,
      actor: s.owner || null
    });
  };

  const toHeld = (c, r, s, f) => {
    // The in-place resume was already ruled out (work offset changed after the rest): failed instead.
    if (s.invalid) {
      toFailed(c, r, s, s.invalid);
      return;
    }
    s.phase = 'held';
    s.step = null;
    s.out = null;
    s.failure = f ? failureOf(f.code, f.params) : s.failure;
    logOf(c, r, s, 'held', { code: s.failure ? s.failure.code : null });
    changed();
  };

  const toFailed = (c, r, s, f) => {
    s.phase = 'failed';
    s.step = null;
    s.cancelled = true;
    s.out = null;
    s.failure = failureOf(f.code, f.params);
    logOf(c, r, s, 'failed', { code: f.code });
    changed();
  };

  // After a move of ours was interrupted: jog cancel (0x85), repeated while a newer report still
  // says Jog, then the spindle stopped (M5) once two fresh reports say Idle, same session, no alarm
  // (§ 7). Nothing more after SECURE_MS, nothing at all once the retract is forgotten (Arrêter).
  const secure = (c, r, s) => {
    if (!connected(c) || r.startups !== s.startups || /^Alarm/.test(activeOf(c))) {
      return;
    }
    const jogging = jogMaybe(c, s);
    const spindle = s.spindleOn;
    const mark = r.reports;
    const since = clock();
    const startups = r.startups;
    let sentAt = clock();
    let jogMark = r.reports;
    if (jogging) {
      c.command('jogCancel');
    }
    if (!jogging && !spindle) {
      return;
    }
    const step = () => {
      if (r.retract !== s || !connected(c) || r.startups !== startups || /^Alarm/.test(activeOf(c))) {
        return;
      }
      const state = activeOf(c);
      if (state === 'Jog' && r.reports > jogMark && clock() - sentAt >= CANCEL_RESEND_MS) {
        c.command('jogCancel');
        sentAt = clock();
        jogMark = r.reports;
      }
      // At rest again (two reports with coordinates after the cancel): no jog of ours moves any more.
      if (state === 'Idle' && idleSince(r, s, mark)) {
        s.jogLive = false;
      }
      if (spindle && s.spindleOn && state === 'Idle' && idleSince(r, s, mark) && fresh(r) && drained(c)) {
        s.spindleOn = false;
        c.command('gcode', 'M5');
        changed();
        return;
      }
      if (!spindle && state !== 'Jog' && r.reports > mark) {
        return;
      }
      if (clock() - since > SECURE_MS) {
        return;
      }
      later(c, r, step, 50);
    };
    later(c, r, step, 50);
  };

  // The single entry for everything that stops or degrades the retract (§ 7).
  const fail = (c, r, s, code, params = {}) => {
    if (r.retract !== s || s.phase === 'failed') {
      return;
    }
    const f = { code, params };
    if (s.phase === 'draining') {
      if (SOFT_IN_DRAIN.includes(code)) {
        if (s.wantLift) {
          s.wantLift = false;
          s.failure = failureOf(code, params);
          changed();
        }
        return;
      }
      toFailed(c, r, s, f);
      return;
    }
    if (s.phase === 'held') {
      // Nothing of ours moved: a lost lease only means the resume needs it back.
      if (code !== 'ETOUCH_RETRACT_CONTROL' && code !== 'ETOUCH_RETRACT_STREAM' && code !== 'ETOUCH_RETRACT_STALE') {
        toFailed(c, r, s, f);
      }
      return;
    }
    if (s.phase === 'parked') {
      toFailed(c, r, s, f);
      return;
    }
    // lifting / returning: the sequence ends here.
    s.cancelled = true;
    const quiet = code === 'ETOUCH_RETRACT_ALARM' || code === 'ETOUCH_RETRACT_RESTART';
    // Nothing of ours written yet, or the lifting jog refused by the board: nothing moved, the bit
    // is where it stopped (phase held).
    if (s.phase === 'lifting' && code !== 'ETOUCH_RETRACT_MOVED' &&
        (!s.written || (code === 'ETOUCH_RETRACT_ERROR' && s.step === 'lift' && s.written === 1))) {
      toHeld(c, r, s, f);
      return;
    }
    if (!quiet && !s.fromHeld) {
      secure(c, r, s);
    }
    toFailed(c, r, s, f);
  };

  // The in-place resume is ruled out (the work offset changed after the rest, D4) without stopping a
  // lift: the bit still goes up and the retract ends failed instead of parked or held.
  const invalidate = (c, r, s, f) => {
    if (s.invalid || r.retract !== s || s.phase === 'failed') {
      return;
    }
    s.invalid = { code: f.code, params: f.params };
    if (s.phase === 'parked' || s.phase === 'held') {
      toFailed(c, r, s, s.invalid);
    } else if (s.phase === 'returning') {
      fail(c, r, s, f.code, f.params);
    } else {
      changed();
    }
  };

  // ---------------------------------------------------------------- supervision

  const streamOpen = (s) => (s.deviceKey
    ? Array.from(transports).some((id) => keyOf(transportActors.get(id)) === s.deviceKey)
    : transports.has(s.transportId));

  // What ends the retract now, in this order (§ 6.2, 1 to 5); null when nothing.
  const verdict = (c, r, s) => {
    if (r.startups !== s.startups) {
      return ['ETOUCH_RETRACT_RESTART', {}];
    }
    if (/^Alarm/.test(activeOf(c))) {
      return ['ETOUCH_RETRACT_ALARM', alarmParams(r)];
    }
    if (s.phase === 'parked' || s.phase === 'held') {
      return owner(c) !== s.ownerKey ? ['ETOUCH_RETRACT_CONTROL', {}] : null;
    }
    if (streamOpen(s)) {
      s.lostSince = null;
    } else if (s.lostSince === null) {
      s.lostSince = clock();
    }
    if (s.lostSince !== null && clock() - s.lostSince >= STREAM_GRACE_MS) {
      return ['ETOUCH_RETRACT_STREAM', {}];
    }
    if (owner(c) !== s.ownerKey) {
      return ['ETOUCH_RETRACT_CONTROL', {}];
    }
    if (!fresh(r)) {
      return ['ETOUCH_RETRACT_STALE', {}];
    }
    return null;
  };

  const supervise = (c, r) => {
    const s = r.retract;
    if (!s || s.phase === 'failed') {
      return;
    }
    // CNCjs's workflow left the pause without us (a resume or a stop we did not send).
    if (c.workflow && c.workflow.state !== 'paused') {
      if (s.phase === 'draining') {
        r.retract = null;
        changed();
      } else {
        fail(c, r, s, 'ETOUCH_RETRACT_FOREIGN');
      }
      return;
    }
    const v = verdict(c, r, s);
    if (v) {
      fail(c, r, s, v[0], v[1]);
    }
  };

  // ---------------------------------------------------------------- waits and lines

  // Polls `test` until it returns a truthy value; rejects with STOPPED once the retract is ended
  // elsewhere, or with what `test` throws.
  const until = (c, r, s, test) => new Promise((resolve, reject) => {
    const check = () => {
      if (s.cancelled || r.retract !== s) {
        reject(STOPPED);
        return;
      }
      let out;
      try {
        out = test();
      } catch (err) {
        reject(err);
        return;
      }
      if (out) {
        resolve(out);
        return;
      }
      later(c, r, check, SUPERVISE_MS, () => reject(STOPPED));
    };
    check();
  });

  // The checks of that very moment before a write (« ensure »): supervision, rest, nothing queued.
  const ensure = (c, r, s) => {
    supervise(c, r);
    if (s.cancelled || r.retract !== s) {
      throw STOPPED;
    }
    // An Alarm seen since, even in a single report (D5): no line of ours any more.
    if (r.homed !== true || r.referenceLost) {
      throw failure('ETOUCH_RETRACT_ALARM', alarmParams(r));
    }
    const state = activeOf(c);
    if (state !== 'Idle' || !drained(c) || !r.job || r.job.revision !== s.revision || Number(c.sender.state.sent) !== s.sent) {
      throw failure('ETOUCH_RETRACT_UNEXPECTED', { state: state || '?' });
    }
  };

  // The position of the machine is `at` within POS_TOL, or throws ETOUCH_RETRACT_POSITION. Only the
  // coordinates of the latest report, and a fresh one (D8): CNCjs keeps the XYZ of an older report.
  const atPosition = (c, r, s, at, code = 'ETOUCH_RETRACT_POSITION') => {
    if (s.xyzReport !== r.reports || !fresh(r)) {
      throw failure(code, { axis: 'XYZ' }, true);
    }
    const now = mposOf(c);
    const axis = ['x', 'y', 'z'].find((a) => !now || Math.abs(now[a] - at[a]) > POS_TOL);
    if (axis) {
      throw failure(code, { axis: axis.toUpperCase() });
    }
    return true;
  };

  // The spindle turns now (D3): the latest report says a speed above 0, or, without FS:, a $G received
  // after our M3/M4 says M3/M4; and no $G received since then says otherwise.
  const spindleRunning = (c, r, s) => {
    const mode = parserOf(c).modal && parserOf(c).modal.spindle;
    const modalSince = s.modals > s.spindleMark && modalFresh(r);
    if (modalSince && mode !== 'M3' && mode !== 'M4') {
      return false;
    }
    const speed = spindleSpeed(c, r, s);
    return speed !== null ? speed > 0 : modalSince;
  };

  // Right before a line is written (D2, D3): the machine is where the line was computed from, with
  // the coordinates of the latest report; a jog's target is that start plus the distance written,
  // inside the usable Z travel known now; a descent needs the spindle turning.
  const before = (c, r, s, line, { from, to = null, spindle = false }) => {
    atPosition(c, r, s, from, 'ETOUCH_RETRACT_MOVED');
    if (to) {
      const m = /Z(-?\d+(?:\.\d+)?)/.exec(line);
      if (!m || Math.abs(from.z + Number(m[1]) - to.z) > REST_TOL || Math.abs(from.x - to.x) > REST_TOL || Math.abs(from.y - to.y) > REST_TOL) {
        throw failure('ETOUCH_RETRACT_POSITION', { axis: 'Z' });
      }
      let travel;
      try {
        travel = travelOf(c, r);
      } catch (_) {
        throw failure('ETOUCH_RETRACT_TRAVEL_UNKNOWN');
      }
      if (to.z < travel.usable.low - REST_TOL || to.z > travel.usable.high + REST_TOL) {
        throw failure('ETOUCH_RETRACT_TRAVEL', { z: fmt(to.z), low: fmt(travel.usable.low), high: fmt(travel.usable.high) });
      }
    }
    if (spindle && !spindleRunning(c, r, s)) {
      throw failure('ETOUCH_RETRACT_SPINDLE');
    }
  };

  // One line through CNCjs's feeder, then its `ok` and two fresh Idle reports received after it,
  // then `expect` (true to go on, false to wait, or a throw), within `limitMs`.
  // Nothing leaves while the device's stream is away, even within its grace (a rotation); once it is
  // back, everything is checked again at that very moment (ensure, then `before` with `where`).
  // `where.spindle`: the spindle must keep turning until the line is done, or the move is cancelled.
  const send = (c, r, s, line, limitMs, expect, where) => until(c, r, s, () => streamOpen(s)).then(() => {
    ensure(c, r, s);
    if (!LINE.test(line)) {
      throw failure('ETOUCH_RETRACT_ERROR', { error: -1 });
    }
    before(c, r, s, line, where);
    const t = answers(c, r);
    const out = { line, t, deadline: clock() + limitMs, okMark: null, modalMark: null };
    s.out = out;
    s.written += 1;
    if (/^M[34] /.test(line)) {
      s.spindleOn = true;
    }
    if (/^\$J=/.test(line)) {
      s.jogLive = true;
    }
    c.command('gcode', line);
    changed();
    return until(c, r, s, () => {
      if (t.error) {
        throw failure('ETOUCH_RETRACT_ERROR', { error: t.error });
      }
      if (where.spindle && !spindleRunning(c, r, s)) {
        throw failure('ETOUCH_RETRACT_SPINDLE');
      }
      if (t.oks >= 1) {
        if (out.okMark === null) {
          out.okMark = t.reportsAtOk;
          out.modalMark = s.modals;
        }
        if (activeOf(c) === 'Idle' && idleSince(r, s, out.okMark) && fresh(r) && (!expect || expect(out))) {
          return true;
        }
      }
      if (/^(Hold|Door)/.test(activeOf(c))) {
        throw failure('ETOUCH_RETRACT_UNEXPECTED', { state: activeOf(c) });
      }
      if (clock() > out.deadline) {
        throw failure('ETOUCH_RETRACT_TIMEOUT');
      }
      return false;
    }).then(() => {
      t.done();
      s.out = null;
      // Two reports at rest after its `ok`: the jog is over.
      s.jogLive = false;
      s.lastModalMark = out.modalMark;
      return out;
    }, (err) => {
      t.done();
      // A line Grbl refused never ran.
      if (t.error && s.out === out) {
        s.out = null;
        s.jogLive = false;
      }
      throw err;
    });
  });

  // How long a relative Z jog of `d` mm at `f` mm/min may take: the feed override, which the
  // simulator applies to jogs and the upstream firmware does not, may only make it longer (P10).
  const jogLimit = (c, d, f) => {
    const ov = feedOverride(c);
    const k = ov ? Math.max(1, 100 / ov) : 10;
    return 60000 * Math.abs(d) / f * k + LINE_MARGIN_MS;
  };

  const sequenceFailed = (c, r, s) => (err) => {
    if (err === STOPPED || (err && err.stopped)) {
      return;
    }
    if (err && err.failure) {
      fail(c, r, s, err.code, err.params);
      return;
    }
    fail(c, r, s, 'ETOUCH_RETRACT_ERROR', { error: -1 });
  };

  // ---------------------------------------------------------------- the retract

  // § 4.2: the state at rest. § 6.3: the travel of the lift.
  const memorize = (c, r, s) => {
    const p = modalOf(c);
    const spindle = p.modal.spindle;
    s.mem = {
      mpos: { ...s.restMpos },
      restReport: s.restReport,
      modal: p,
      // The work offset in force at the stop (D4): the last explicit WCO received up to the rest.
      // Every WCO received after the rest must equal it; without one, no in-place resume.
      wco: s.restWco ? { ...s.restWco } : null
    };
    s.spindle = (spindle === 'M3' || spindle === 'M4') && p.S !== null ? { mode: spindle, speed: p.S } : null;
    s.spindleOn = spindle === 'M3' || spindle === 'M4';
    if (!s.wantLift) {
      toHeld(c, r, s, null);
      return;
    }
    let travel;
    try {
      travel = travelOf(c, r);
    } catch (err) {
      toHeld(c, r, s, { code: err.code || 'ETOUCH_RETRACT_TRAVEL_UNKNOWN', params: err.params || {} });
      return;
    }
    const z = s.mem.mpos.z;
    if (z < travel.usable.low - REST_TOL || z > travel.usable.high + REST_TOL) {
      toHeld(c, r, s, { code: 'ETOUCH_RETRACT_TRAVEL', params: { z: fmt(z), low: fmt(travel.usable.low), high: fmt(travel.usable.high) } });
      return;
    }
    const zSafe = travel.usable.high - RETRACT_TOP_MARGIN_MM;
    const dU = Math.max(0, Math.round((zSafe - z) * 1000));
    s.mem.zSafe = zSafe;
    s.mem.dU = dU < 10 ? 0 : dU;
    s.mem.feed = Math.min(RETRACT_FEED, maxFeedOf(allSettings(c), 'Z').max);
    s.mem.zTop = z + s.mem.dU / 1000;
    s.lift = { from: z.toFixed(3), to: s.mem.zTop.toFixed(3), distance: (s.mem.dU / 1000).toFixed(3) };
    lift(c, r, s);
  };

  // § 4.3: L1 (the relative jog up), L2 (M5).
  const lift = (c, r, s) => {
    const m = s.mem;
    s.phase = 'lifting';
    s.step = m.dU ? 'lift' : 'spindle-stop';
    logOf(c, r, s, 'lifting', { from: s.lift.from, to: s.lift.to });
    changed();
    const top = { x: m.mpos.x, y: m.mpos.y, z: m.zTop };
    Promise.resolve()
      .then(() => {
        if (!m.dU) {
          return null;
        }
        const line = '$J=G91 G21 Z' + fmt(m.dU / 1000) + ' F' + fmt(m.feed);
        return send(c, r, s, line, jogLimit(c, m.dU / 1000, m.feed), () => atPosition(c, r, s, top), { from: m.mpos, to: top });
      })
      .then(() => {
        if (m.modal.modal.spindle === 'M5') {
          return null;
        }
        s.step = 'spindle-stop';
        changed();
        return send(c, r, s, 'M5', LINE_MARGIN_MS, (out) => {
          atPosition(c, r, s, top);
          const speed = spindleSpeed(c, r, s);
          if (speed === 0) {
            return true;
          }
          return speed === null && s.modals > out.modalMark && modalFresh(r) && parserOf(c).modal && parserOf(c).modal.spindle === 'M5';
        }, { from: top });
      })
      .then(() => {
        s.spindleOn = false;
        // The work offset changed after the rest (D4): the bit is up, but no in-place resume.
        if (s.invalid) {
          toFailed(c, r, s, s.invalid);
          return;
        }
        s.phase = 'parked';
        s.step = null;
        logOf(c, r, s, 'parked', { from: s.lift.from, to: s.lift.to });
        changed();
      })
      .catch(sequenceFailed(c, r, s));
  };

  // Draining (§ 4.1, 4.2): every tick and every report.
  const drain = (c, r, s) => {
    if (s.phase !== 'draining') {
      return;
    }
    const state = activeOf(c);
    // A feed hold from elsewhere (or a door): an ordinary pause from now on.
    if (/^(Hold|Door)/.test(state)) {
      r.retract = null;
      changed();
      return;
    }
    if (s.step === 'drain') {
      const [a, b] = s.rest;
      if (a && b && drained(c) && state === 'Idle' && fresh(r) && clock() - b.at <= STALE_MS &&
          ['x', 'y', 'z'].every((axis) => Math.abs(a.mpos[axis] - b.mpos[axis]) <= REST_TOL)) {
        s.step = 'state';
        // The line of the file the machine finished at (every line received is executed now).
        s.line = stopLine(c, r);
        s.restReport = r.reports;
        s.restMpos = b.mpos;
        s.restWco = r.wco ? { x: r.wco.x, y: r.wco.y, z: r.wco.z } : null;
        s.modalMark = s.modals;
        s.restClock = clock();
        changed();
      } else {
        const sender = c.sender.state;
        const waiting = state === 'Idle' && Number(sender.received) < Number(sender.sent);
        if (!waiting) {
          s.stall = null;
        } else if (!s.stall || s.stall.received !== sender.received) {
          s.stall = { since: clock(), received: sender.received };
        } else if (clock() - s.stall.since >= DRAIN_STALL_MS) {
          fail(c, r, s, 'ETOUCH_RETRACT_STALLED');
          return;
        }
      }
    }
    if (s.step === 'state') {
      const now = mposOf(c);
      if (!drained(c) || state !== 'Idle' || !now || ['x', 'y', 'z'].some((axis) => Math.abs(now[axis] - s.restMpos[axis]) > REST_TOL)) {
        fail(c, r, s, 'ETOUCH_RETRACT_UNEXPECTED', { state: state || '?' });
        return;
      }
      if (s.modals > s.modalMark && modalFresh(r)) {
        // The last soft checks at this very instant (stream, lease, reports).
        const v = verdict(c, r, s);
        if (v) {
          fail(c, r, s, v[0], v[1]);
          if (r.retract !== s || s.phase !== 'draining') {
            return;
          }
        }
        memorize(c, r, s);
      } else if (clock() - s.restClock > MODAL_WAIT_MS) {
        fail(c, r, s, 'ETOUCH_RETRACT_MODAL');
      }
    }
  };

  const watch = (c, r, s, id) => {
    if (r.retract !== s || s.watch !== id || s.phase === 'failed') {
      return;
    }
    supervise(c, r);
    if (r.retract === s && s.phase === 'draining') {
      drain(c, r, s);
    }
    if (r.retract !== s || s.phase === 'failed') {
      return;
    }
    later(c, r, () => watch(c, r, s, id), s.phase === 'parked' || s.phase === 'held' ? PARK_WATCH_MS : SUPERVISE_MS);
  };
  const startWatch = (c, r, s) => {
    s.watch += 1;
    const id = s.watch;
    later(c, r, () => watch(c, r, s, id), SUPERVISE_MS);
  };

  // The run of « Pause et dégager » (t: the confirmation ticket, § 4.1).
  const start = (c, t, actor) => {
    const r = record(c);
    ready(c, t.params && t.params.revision);
    // A touch client that pilots a free port claims it now, before the owner is remembered.
    if (actor && actor.kind === 'touch') {
      try {
        control.authorize(c.options.port, actor, 'retract', { claim: true });
      } catch (_) {
        // Owned by someone else: perform() refused before.
      }
    }
    const device = (typeof t.transportId === 'string' && transportActors.get(t.transportId)) || null;
    const s = {
      phase: 'draining',
      step: 'drain',
      since: Date.now(),
      line: stopLine(c, r),
      wantLift: true,
      lift: null,
      spindle: null,
      failure: null,
      owner: actor ? { kind: actor.kind, id: actor.id, label: actor.label || '' } : null,
      ownerKey: '',
      deviceKey: keyOf(device),
      transportId: t.transportId,
      startups: r.startups,
      revision: r.job.revision,
      sent: Number(c.sender.state.sent),
      rest: [],
      restReport: null,
      restMpos: null,
      modals: 0,
      modalMark: 0,
      lastModalMark: 0,
      stall: null,
      idleFrom: null,
      lostSince: null,
      mem: null,
      out: null,
      written: 0,
      // A jog of ours written and not proven over (D1); the latest reports with XYZ and with FS (D8, D3).
      jogLive: false,
      xyzReport: null,
      speedReport: null,
      spindleMark: 0,
      restWco: null,
      // The in-place resume ruled out without stopping the lift (D4).
      invalid: null,
      spindleOn: false,
      cancelled: false,
      fromHeld: false,
      watch: 0
    };
    logOf(c, r, s, 'requested', {});
    // CNCjs's own program pause (M0, M6): the sender is held, no feed hold is written.
    c.workflow.pause();
    s.ownerKey = owner(c);
    r.retract = s;
    startWatch(c, r, s);
    changed();
    return { message: 'Dégagement demandé.' };
  };

  // ---------------------------------------------------------------- the resume

  // § 5.1 guards 2 to 7 (1 is readyFor's). `final`: R5, the full modal state, spindle included.
  // Throws a failure; a failure not `soft` ends the in-place resume when `commit` is true.
  const resumeChecks = (c, r, s, { final = false, needWco = false } = {}) => {
    if (s.phase !== 'parked' && s.phase !== 'held' && s.phase !== 'returning') {
      const f = s.phase === 'failed' && s.failure ? s.failure : { code: 'ETOUCH_RETRACT_NOT_RUNNING', params: {} };
      throw failure(f.code, f.params, true);
    }
    if (r.startups !== s.startups) {
      throw failure('ETOUCH_RETRACT_RESTART');
    }
    const state = activeOf(c);
    // An Alarm, even seen in a single report between two ticks (D5), took the reference away.
    if (/^Alarm/.test(state) || r.homed !== true || r.referenceLost) {
      throw failure('ETOUCH_RETRACT_ALARM', alarmParams(r));
    }
    // The in-place resume was ruled out on the way (work offset changed after the rest, D4).
    if (s.invalid) {
      throw failure(s.invalid.code, s.invalid.params);
    }
    if (state !== 'Idle') {
      throw failure('ETOUCH_RETRACT_STATE', { state: state || '?' }, true);
    }
    if (!drained(c) || Number(c.sender.state.sent) !== s.sent || !r.job || r.job.revision !== s.revision) {
      throw failure('ETOUCH_RETRACT_UNEXPECTED', { state }, true);
    }
    const m = s.mem;
    const parked = s.phase === 'parked' || (s.phase === 'returning' && !s.fromHeld);
    const z = final || !parked ? m.mpos.z : m.zTop;
    atPosition(c, r, s, { x: m.mpos.x, y: m.mpos.y, z }, 'ETOUCH_RETRACT_MOVED');
    // D4: the offset in force at the stop is known, and the last WCO, received after the rest when
    // `needWco`, is equal to it.
    const wco = r.wco;
    if (!m.wco || (needWco && !(wco && wco.report > m.restReport))) {
      throw failure('ETOUCH_RETRACT_ZERO_CHANGED', { axis: 'WCO' });
    }
    const axis = ['x', 'y', 'z'].find((a) => !wco || Math.abs(wco[a] - m.wco[a]) > OFFSET_TOL);
    if (axis) {
      throw failure('ETOUCH_RETRACT_ZERO_CHANGED', { axis: axis.toUpperCase() });
    }
    if (!modalFresh(r)) {
      throw failure('ETOUCH_RETRACT_STATE_CHANGED', { field: '$G' }, true);
    }
    const now = modalOf(c);
    const keys = Array.from(new Set(Object.keys(m.modal.modal).concat(Object.keys(now.modal))));
    const field = keys.find((k) => k !== 'spindle' && JSON.stringify(now.modal[k]) !== JSON.stringify(m.modal.modal[k]));
    if (field) {
      throw failure('ETOUCH_RETRACT_STATE_CHANGED', { field });
    }
    const spindle = final || !parked ? m.modal.modal.spindle : 'M5';
    if (now.modal.spindle !== spindle) {
      throw failure('ETOUCH_RETRACT_STATE_CHANGED', { field: 'spindle' });
    }
    const other = [['T', 'tool'], ['F', 'F'], ['S', 'S']].find(([, k]) => now[k] !== m.modal[k]);
    if (other) {
      throw failure('ETOUCH_RETRACT_STATE_CHANGED', { field: other[0] });
    }
    const profile = profileOf(c, r);
    if (profile.kind !== 'cnc' || settingNumber(allSettings(c), 32) !== 0) {
      throw failure('ETOUCH_RETRACT_LASER', {}, true);
    }
    if (settingNumber(allSettings(c), 13) !== 0) {
      throw failure('ETOUCH_RETRACT_TRAVEL_UNKNOWN', {}, true);
    }
    return true;
  };

  // readyFor(c, 'resume'): the branch of a retract (§ 5). `commit`: a prepare or a run, where a
  // proven change ends the in-place resume; the snapshot only reads.
  const resumeReady = (c, r, commit = false) => {
    const s = r.retract;
    if (s.phase !== 'parked' && s.phase !== 'held') {
      if (s.phase === 'failed' && s.failure) {
        throw refusal(s.failure.code, s.failure.params);
      }
      throw conflict('Dégagement en cours : attendez qu’il soit terminé.');
    }
    try {
      resumeChecks(c, r, s);
    } catch (err) {
      if (!err || !err.failure) {
        throw err;
      }
      if (commit && !err.soft) {
        toFailed(c, r, s, err);
      }
      throw toRefusal(err);
    }
  };

  // The run of « Reprendre… » after a retract (§ 5.2, 5.3), once readyFor passed.
  const resume = (c, r, actor, transportId) => {
    const s = r.retract;
    s.fromHeld = s.phase === 'held';
    s.phase = 'returning';
    s.step = 'verify';
    s.cancelled = false;
    s.failure = null;
    // The device and the lease of the resume are supervised from now on.
    const device = (typeof transportId === 'string' && transportActors.get(transportId)) || null;
    s.deviceKey = keyOf(device);
    s.transportId = transportId;
    s.ownerKey = owner(c);
    s.lostSince = null;
    s.resumeActor = actor || null;
    s.lastModalMark = s.modals;
    logOf(c, r, s, 'resume', { from: s.fromHeld ? 'held' : 'parked' });
    startWatch(c, r, s);
    changed();
    const m = s.mem;
    const t0 = clock();
    const aU = RETRACT_APPROACH_MM * 1000;
    const here = (z) => ({ x: m.mpos.x, y: m.mpos.y, z });
    let chain = until(c, r, s, () => {
      if (r.wco && r.wco.report > m.restReport) {
        return true;
      }
      if (clock() - t0 > WCO_WAIT_MS) {
        throw failure('ETOUCH_RETRACT_ZERO_CHANGED', { axis: 'WCO' });
      }
      return false;
    }).then(() => resumeChecks(c, r, s, { needWco: true }));
    if (!s.fromHeld) {
      const sp = s.spindle;
      if (sp) {
        chain = chain
          .then(() => {
            s.step = 'spindle-start';
            changed();
            return send(c, r, s, sp.mode + ' S' + fmt(sp.speed), LINE_MARGIN_MS, () => atPosition(c, r, s, here(m.zTop)), { from: here(m.zTop) });
          })
          .then((started) => {
            // A $G received after this `ok` tells the spindle mode from then on (spindleRunning).
            s.spindleMark = started.modalMark;
            s.step = 'dwell';
            changed();
            return send(c, r, s, 'G4 P' + RETRACT_SPINUP_S, RETRACT_SPINUP_S * 1000 + LINE_MARGIN_MS, (out) => {
              atPosition(c, r, s, here(m.zTop));
              const speed = spindleSpeed(c, r, s);
              if (speed !== null) {
                if (speed > 0) {
                  return true;
                }
                throw failure('ETOUCH_RETRACT_SPINDLE');
              }
              if (s.modals > out.modalMark && modalFresh(r)) {
                const mode = parserOf(c).modal && parserOf(c).modal.spindle;
                if (mode === 'M3' || mode === 'M4') {
                  return true;
                }
                throw failure('ETOUCH_RETRACT_SPINDLE');
              }
              return false;
            }, { from: here(m.zTop) });
          });
      }
      const approach = here(m.mpos.z + aU / 1000);
      if (m.dU > aU) {
        chain = chain.then(() => {
          s.step = 'approach';
          changed();
          const d = (m.dU - aU) / 1000;
          const line = '$J=G91 G21 Z-' + fmt(d) + ' F' + fmt(m.feed);
          return send(c, r, s, line, jogLimit(c, d, m.feed), () => atPosition(c, r, s, approach), { from: here(m.zTop), to: approach, spindle: !!sp });
        });
      }
      if (m.dU) {
        chain = chain.then(() => {
          s.step = 'plunge';
          changed();
          const d = Math.min(m.dU, aU) / 1000;
          const line = '$J=G91 G21 Z-' + fmt(d) + ' F' + RETRACT_PLUNGE_FEED;
          const where = { from: m.dU > aU ? approach : here(m.zTop), to: here(m.mpos.z), spindle: !!sp };
          return send(c, r, s, line, jogLimit(c, d, RETRACT_PLUNGE_FEED), () => atPosition(c, r, s, here(m.mpos.z)), where);
        });
      }
      // R5: a $G received after the last line's ok, equal to the remembered state, spindle included.
      chain = chain.then(() => {
        s.step = 'verify';
        changed();
        const t1 = clock();
        return until(c, r, s, () => {
          if (s.modals > s.lastModalMark && modalFresh(r)) {
            return resumeChecks(c, r, s, { final: true, needWco: true });
          }
          if (clock() - t1 > MODAL_WAIT_MS) {
            throw failure('ETOUCH_RETRACT_MODAL');
          }
          return false;
        });
      });
    }
    chain
      // R6 (D7): never without an open stream of the device, whatever the grace; after that wait
      // every check is made again at that very moment.
      .then(() => until(c, r, s, () => streamOpen(s)))
      .then(() => {
        // R6: the very last checks, then CNCjs sends the rest of the program.
        if (!streamOpen(s)) {
          throw failure('ETOUCH_RETRACT_STREAM');
        }
        ensure(c, r, s);
        resumeChecks(c, r, s, { final: true, needWco: true });
        logOf(c, r, s, 'resumed', {});
        log({ event: 'resume', ...jobInfo(r.job), controller: controllerInfo(c, r), pause: 'retract', actor: s.resumeActor });
        r.retract = null;
        s.cancelled = true;
        c.command('gcode:resume');
        changed();
      })
      .catch(sequenceFailed(c, r, s));
    return { message: s.fromHeld ? 'Reprise demandée.' : 'Reprise demandée : la broche redémarre, puis la fraise redescend.' };
  };

  // ---------------------------------------------------------------- the other paths

  // Pause (and Arrêt broche, arrêt de flèche): null when the retract does not take it.
  const pause = (c, r) => {
    const s = r.retract;
    if (!s) {
      return null;
    }
    if (s.phase === 'draining') {
      // The ordinary pause from now on: a feed hold, resumed by `~` like any pause.
      r.retract = null;
      c.command('feedhold');
      changed();
      return { message: 'Pause demandée. Attendre l’état Hold.' };
    }
    if (s.phase === 'lifting' || s.phase === 'returning') {
      fail(c, r, s, 'ETOUCH_RETRACT_PAUSED');
      return { message: RETRACT_MESSAGES.ETOUCH_RETRACT_PAUSED };
    }
    return null;
  };
  const moving = (r) => !!(r.retract && (r.retract.phase === 'lifting' || r.retract.phase === 'returning'));

  // Arrêter (job-service.js 'stop'): the retract is forgotten, synchronously. 'jog': a jog may still
  // move, whatever the phase (D1: after a failure too, until two reports at rest proved it over; or a
  // report says Jog): a feed hold first, which cancels it, and halt.js repeats the jog cancel while a
  // report says Jog, the reset only at rest. 'line': another line of ours is not answered yet.
  const halt = (c, r) => {
    const s = r.retract;
    if (!s) {
      return '';
    }
    const jogging = jogMaybe(c, s);
    const out = s.out ? 'line' : '';
    s.cancelled = true;
    r.retract = null;
    changed();
    return jogging ? 'jog' : out;
  };

  // A stop sent from a socket (index.js refuseSocket), before the command goes its own way (§ 7).
  const socketStop = (c, r) => {
    const s = r.retract;
    if (!s) {
      return;
    }
    if (s.phase === 'draining') {
      r.retract = null;
      changed();
      return;
    }
    if (s.phase !== 'held' && s.phase !== 'failed') {
      fail(c, r, s, 'ETOUCH_RETRACT_FOREIGN');
    }
  };

  // A jog cancel sent from a socket (`jogCancel`, 0x85; index.js refuseSocket), before it goes its
  // own way (D6): a lift or a descent of ours stops here, and no line of ours follows it; while the
  // machine finishes its lines, the lift is dropped (held at rest).
  const socketJogCancel = (c, r) => {
    const s = r.retract;
    if (!s) {
      return;
    }
    if (s.phase === 'draining') {
      if (s.wantLift) {
        s.wantLift = false;
        s.failure = failureOf('ETOUCH_RETRACT_FOREIGN', {});
        changed();
      }
      return;
    }
    if (s.phase === 'lifting' || s.phase === 'returning') {
      fail(c, r, s, 'ETOUCH_RETRACT_FOREIGN');
    }
  };

  // The board's own events, in the event itself (§ 7): nothing more is written in the new session.
  const alarmed = (c, r) => {
    if (r.retract) {
      fail(c, r, r.retract, 'ETOUCH_RETRACT_ALARM', alarmParams(r));
    }
  };
  const restarted = (c, r) => {
    if (r.retract) {
      fail(c, r, r.retract, 'ETOUCH_RETRACT_RESTART');
    }
  };

  // Every status report (job-service r.status, after the count): Idle streaks, rest, offset.
  // `seen.xyz`: this report carries coordinates of its own (CNCjs keeps the old ones otherwise, D8);
  // `seen.speed`: the spindle speed of its FS: field, or undefined.
  const report = (c, r, seen = {}) => {
    const s = r.retract;
    if (!s) {
      return;
    }
    const state = activeOf(c);
    const xyz = seen.xyz === true;
    if (xyz) {
      s.xyzReport = r.reports;
    }
    if (typeof seen.speed === 'number' && Number.isFinite(seen.speed)) {
      s.speedReport = r.reports;
    }
    // D5: an Alarm state, even in a single report between two ticks, ends the retract now.
    if (/^Alarm/.test(state)) {
      fail(c, r, s, 'ETOUCH_RETRACT_ALARM', alarmParams(r));
      s.idleFrom = null;
      s.rest = [];
      return;
    }
    // An Idle streak counts reports with coordinates only (D8).
    if (state === 'Idle' && xyz) {
      if (s.idleFrom === null) {
        s.idleFrom = r.reports;
      }
    } else {
      s.idleFrom = null;
    }
    // D4: every WCO received after the rest equals the one in force at the stop.
    if (s.restReport !== null && r.wco && r.wco.report === r.reports && r.wco.report > s.restReport) {
      const ref = s.restWco;
      const axis = ['x', 'y', 'z'].find((a) => !ref || Math.abs(r.wco[a] - ref[a]) > OFFSET_TOL);
      if (axis) {
        invalidate(c, r, s, { code: 'ETOUCH_RETRACT_ZERO_CHANGED', params: { axis: ref ? axis.toUpperCase() : 'WCO' } });
      }
    }
    if (s.phase === 'draining' && s.step === 'drain') {
      const mpos = mposOf(c);
      if (drained(c) && state === 'Idle' && mpos && xyz) {
        s.rest = s.rest.concat([{ mpos, at: clock() }]).slice(-2);
      } else {
        s.rest = [];
      }
      drain(c, r, s);
    }
  };
  // Every $G reply (job-service r.modal).
  const modal = (c, r) => {
    if (r.retract) {
      r.retract.modals += 1;
    }
  };

  // The job ends (stopped, a new file, a new run): the retract goes with it.
  const forgetJob = (r) => {
    if (r.retract) {
      r.retract.cancelled = true;
      r.retract = null;
    }
  };

  // A stream closed (not rotated): with the device's last stream, the sequence stops at once.
  const transportClosed = (c, r, actor, rotated) => {
    const s = r.retract;
    if (rotated || !s || !['draining', 'lifting', 'returning'].includes(s.phase) || streamOpen(s)) {
      return;
    }
    fail(c, r, s, 'ETOUCH_RETRACT_STREAM');
  };

  // A retract of this stream's device keeps the stream from being rotated (touch-stream.js).
  const holds = (transportId) => {
    const key = keyOf(transportActors.get(transportId));
    return (r) => {
      const s = r.retract;
      return !!(s && ((s.phase === 'draining' && s.wantLift) || s.phase === 'lifting' || s.phase === 'returning') &&
        (key ? s.deviceKey === key : s.transportId === transportId));
    };
  };

  // The record is dropped (port closed, service disposed): one jog cancel for a jog of ours.
  const forget = (c, r) => {
    const s = r.retract;
    if (!s) {
      return;
    }
    if (jogMaybe(c, s) && connected(c)) {
      c.command('jogCancel');
    }
    s.cancelled = true;
    r.retract = null;
  };

  const snapshot = (c, r) => {
    const s = r.retract;
    if (!s) {
      return null;
    }
    const sender = c.sender.state || {};
    return {
      phase: s.phase,
      step: s.step,
      since: s.since,
      line: s.line,
      pending: Math.max(0, Number(sender.sent) - Number(sender.received)) || 0,
      lift: s.lift ? { ...s.lift } : null,
      spindle: s.spindle ? { ...s.spindle } : null,
      failure: s.failure ? { ...s.failure } : null,
      owner: s.owner ? { ...s.owner } : null
    };
  };
  const signature = (r) => {
    const s = r.retract;
    if (!s) {
      return '';
    }
    return [s.phase, s.step, s.wantLift, s.failure && s.failure.code, s.spindleOn].join('/');
  };

  const operation = {
    guard: (c) => ready(c),
    params: (body) => ({ revision: body.revision }),
    bind: (c, params) => {
      ready(c, params.revision);
      return params;
    },
    name: () => 'Pause et dégager',
    run: (c, t, actor) => start(c, t, actor)
  };

  return {
    ready,
operation,
start,
resumeReady,
resume,
pause,
moving,
halt,
socketStop,
socketJogCancel,
alarmed,
restarted,
report,
modal,
    forgetJob,
transportClosed,
holds,
forget,
snapshot,
signature,
supervise
  };
};
