// Real jogging and work origins for the touch interface (F1). EXPERIMENTAL and
// DISABLED unless the CNCjs configuration (.cncrc) says
// `"touch": { "motion": { "enabled": true } }`, which only the machine owner
// sets after the supervised hardware validation described in
// examples/cncjs-touch/HANDOFF.md. This module never changes that setting.
//
// The dry-run preflight (motion-preflight.js) stays independent: it describes
// a jog and never authorizes one. Everything here re-checks the machine itself.
//
// What it does, on Grbl 1.1 or later only:
//   - discrete steps: one `$J=G91 G21 <axis><distance> F<feed>` per request,
//     0.01/0.1/1/10 mm; above 1 mm only on a referenced machine whose travel
//     ($130-$132) is known, and never out of that travel;
//   - continuous jog while a button is held: one `$J=` bounded by the known,
//     referenced travel (stopping EDGE_MARGIN_MM before its end), kept alive by
//     the client every KEEPALIVE_PERIOD_MS; no keepalive for
//     KEEPALIVE_TIMEOUT_MS, the owner's event stream closing, a takeover of
//     the control lease, a stale report or an alarm → jog cancel (0x85),
//     sent again while a newer report still shows Jog;
//   - work origin: `G10 L20 P<n> X0 …` for the active offset (G54-G59), through
//     a two-step confirmation ticket like the plate probe, checked afterwards
//     on the reported work position and recorded in the job history.
//
// What it cannot guarantee: when the network goes away, the jog stops only
// because the server misses the keepalive (≤ KEEPALIVE_TIMEOUT_MS plus one
// WATCH_MS tick, plus the serial latency). When the server process dies or
// the serial/USB link is cut, nobody can send 0x85: Grbl finishes the `$J`
// it already accepted, which is why every `$J` is bounded in distance. The
// physical emergency stop remains the only guaranteed stop.
import crypto from 'crypto';
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads the
// service with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

export const AXES = ['X', 'Y', 'Z'];
export const STEPS = [0.01, 0.1, 1, 10];
// Largest discrete step allowed without a referenced machine and a known travel.
export const MAX_UNREFERENCED_STEP_MM = 1;
// The server cancels a continuous jog when no keepalive came for this long…
export const KEEPALIVE_TIMEOUT_MS = 250;
// …and the client sends one this often while the button is held.
export const KEEPALIVE_PERIOD_MS = 100;
// Jog feed bound when $110-$112 is unknown: slow enough to watch and stop by hand.
export const FALLBACK_MAX_FEED = 500;
export const MIN_FEED = 1;
// A continuous jog stops this far before the end of the referenced travel.
export const EDGE_MARGIN_MM = 1;
// Below this distance to the end of travel, no continuous jog starts.
export const MIN_CONTINUOUS_MM = 0.5;
const WATCH_MS = 50;
const CANCEL_RESEND_MS = 200;
const CANCEL_LIMIT_MS = 5000;
const ORIGIN_LIMIT_MS = 15000;
// Work position read back after G10 L20 … 0 (report units; 0 is 0 in both).
const ORIGIN_TOLERANCE = 0.005;
// The machine must not have moved more than this between confirmation and execution.
const ORIGIN_MOVED_MM = 0.01;
const MAX_REPORT_AGE_MS = 2500;
// A machine position this far outside an envelope is outside it.
const POSITION_TOLERANCE_MM = 0.001;
// An unconfirmed jog cancel goes on being repeated while Jog is reported, at
// most this long (the bounded `$J` ends by itself anyway).
const CANCEL_MAX_MS = 120000;
// With the spindle turning: no continuous jog, steps of 0.1 mm at most.
export const MAX_SPINDLE_STEP_MM = 0.1;
// Margin beyond the longest planned duration after which a line of ours is
// let go whatever the reports say (see settle).
const PENDING_MARGIN_MS = 60000;
const STEP_WATCH_MS = 50;
const WCS_P = { G54: 1, G55: 2, G56: 3, G57: 4, G58: 5, G59: 6 };

export const DISABLED_MESSAGE = 'Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).';

const STOP_REASONS = {
  operator: 'relâchement ou arrêt demandé',
  stop: 'bouton Arrêter',
  keepalive: 'maintien non confirmé à temps (connexion lente ou perdue)',
  transport: 'flux de suivi du client fermé',
  control: 'pilotage pris par un autre client',
  stale: 'rapport machine trop ancien',
  alarm: 'alarme machine',
  disabled: 'déplacements réels désactivés',
  late: 'maintien reçu après l’échéance',
  pause: 'bouton Pause',
  dispose: 'service arrêté'
};

const number = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const fmt = (n) => String(Math.round(n * 1000) / 1000);

const keyOf = (who) => (who ? who.kind + ':' + who.id : '');

export const motionEnabled = (config) => {
  try {
    return !!config && config.get('touch.motion.enabled') === true;
  } catch (_) {
    return false;
  }
};

// Grbl version from the startup banner ("Grbl 1.1h"), $I ("Grbl 1.1h.20190825")
// or CNCjs's own copy ("1.1h"); Grbl_ESP32 says "Grbl 1.3a". null when unknown.
export const grblVersion = (...labels) => {
  for (const label of labels) {
    const m = typeof label === 'string' && /(?:^|[^\d.])(\d+)\.(\d+)/.exec(' ' + label);
    if (m) {
      return { major: Number(m[1]), minor: Number(m[2]), label: label.trim() };
    }
  }
  return null;
};

// What the controller can do, whatever its current state. Every capability is
// experimental; `enabled` also needs the explicit .cncrc setting.
export const capabilitiesOf = ({ type, firmware, version, enabled }) => {
  let reason = '';
  if (type !== 'Grbl') {
    reason = 'Contrôleur ' + (type || 'inconnu') + ' : déplacements réels non pris en charge par l’interface tactile.';
  } else {
    const v = grblVersion(firmware, version);
    if (!v) {
      reason = 'Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).';
    } else if (v.major < 1 || (v.major === 1 && v.minor < 1)) {
      reason = 'Grbl ' + v.label + ' : le jog $J= et son annulation 0x85 exigent Grbl 1.1 ou plus.';
    }
  }
  const supported = !reason;
  const on = supported && enabled === true;
  const cap = (extra) => ({ supported, enabled: on, experimental: true, reason: reason || (on ? '' : DISABLED_MESSAGE), ...extra });
  return {
    jog: cap({ command: '$J=G91 G21 <axe><distance> F<avance>', steps: STEPS.slice(), maxStepUnreferencedMm: MAX_UNREFERENCED_STEP_MM }),
    jogContinuous: cap({ keepalivePeriodMs: KEEPALIVE_PERIOD_MS, keepaliveTimeoutMs: KEEPALIVE_TIMEOUT_MS, edgeMarginMm: EDGE_MARGIN_MM }),
    jogCancel: cap({ command: '0x85' }),
    setOrigin: cap({ command: 'G10 L20 P<n> <axe>0', axes: AXES.slice() })
  };
};

// Machine travel per axis, known only on a referenced machine. Standard
// Grbl 1.1 keeps machine positions in [-travel, 0] whatever $23 says;
// Grbl_ESP32 (home_mpos 0) and builds with HOMING_FORCE_SET_ORIGIN give
// [0, travel] to an axis homed towards its negative end ($23 bit set). Until
// the convention of the firmware seen is certain, such an axis has both
// candidates, and a move must be safe in every candidate that contains the
// current position (see limitsAt).
export const envelopeOf = (settings, homed, { wcoSeen = false, wposReported = false } = {}) => {
  const s = settings || {};
  let global = '';
  const homing = number(s.$22);
  const mask = number(s.$23);
  // $10 bit 0 set: Grbl reports MPos. Otherwise CNCjs derives MPos from WPos
  // and the last WCO received, taken as 0 until one comes: wrong by the whole
  // work offset until then.
  const report = number(s.$10);
  // The last status line received decides when it says WPos: CNCjs's copy of
  // $10 is refreshed only by a $$ reply and may be stale.
  const reportsMpos = !wposReported && report !== null && report >= 0 && Math.floor(report) === report && report % 2 === 1;
  if (homing === null) {
    global = 'réglage $22 inconnu';
  } else if (homing !== 1) {
    global = 'prise d’origine désactivée ($22=0)';
  } else if (homed !== true) {
    global = 'référencement ($H) non constaté depuis le dernier redémarrage de la carte';
  } else if (mask === null || mask < 0 || mask !== Math.floor(mask)) {
    global = 'réglage $23 (sens de prise d’origine) inconnu';
  } else if (!reportsMpos && !wcoSeen) {
    if (wposReported) {
      global = 'position machine non rapportée ($10 sans MPos : rapports Grbl en WPos) et aucun décalage WCO reçu depuis le démarrage de la carte';
    } else if (report === null) {
      global = 'réglage $10 inconnu : position machine non vérifiable';
    } else {
      global = 'position machine non rapportée ($10 sans MPos) et aucun décalage WCO reçu depuis le démarrage de la carte';
    }
  }
  const axes = {};
  AXES.forEach((axis, i) => {
    const travel = number(s['$' + (130 + i)]);
    if (global) {
      axes[axis] = { candidates: null, travel: null, reason: global };
    } else if (travel === null || travel <= 0) {
      axes[axis] = { candidates: null, travel: null, reason: 'course $' + (130 + i) + ' inconnue' };
    } else {
      const candidates = [{ low: -travel, high: 0 }];
      if (Math.floor(mask / (2 ** i)) % 2 === 1) {
        candidates.push({ low: 0, high: travel });
      }
      axes[axis] = { candidates, travel, reason: '' };
    }
  });
  return axes;
};

// Travel usable from `pos` on one axis: the intersection of the candidate
// envelopes that contain the position. A position in none of them means the
// assumed convention is wrong for this firmware: nothing may move then.
export const limitsAt = (env, pos, axis) => {
  if (!env.candidates) {
    return { limits: null, outside: false, reason: env.reason };
  }
  if (pos === null) {
    return { limits: null, outside: false, reason: 'position machine ' + axis + ' inconnue' };
  }
  const plausible = env.candidates.filter((e) => pos >= e.low - POSITION_TOLERANCE_MM && pos <= e.high + POSITION_TOLERANCE_MM);
  if (!plausible.length) {
    return {
      limits: null,
      outside: true,
      reason: 'position machine ' + axis + ' ' + fmt(pos) + ' hors de la course supposée (' +
        env.candidates.map((e) => fmt(e.low) + ' → ' + fmt(e.high)).join(' ou ') + ') : vérifiez $23 et l’origine machine'
    };
  }
  return {
    limits: { low: Math.max(...plausible.map((e) => e.low)), high: Math.min(...plausible.map((e) => e.high)) },
    outside: false,
    // Several conventions fit this position (an axis with its $23 bit set, at 0):
    // only what is safe in all of them is allowed, which may be nothing.
    ambiguous: plausible.length > 1
      ? 'convention de course ambiguë à cette position (' + axis + ' ' + fmt(pos) + ', bit $23 à 1 : ' +
        plausible.map((e) => fmt(e.low) + ' → ' + fmt(e.high)).join(' ou ') + ') : aucun déplacement n’y est sûr dans les deux ; ' +
        'déplacez l’axe depuis l’interface classique et faites vérifier la convention (étape 0 de HANDOFF.md)'
      : '',
    reason: ''
  };
};

// Longest planned duration of one `$J`: an unconfirmed cancel is repeated for
// at least that long, and a jog never outlives its supervision by much.
export const MAX_JOG_MS = 60000;

// $110-$112 when known, else the documented fallback.
export const maxFeedOf = (settings, axis) => {
  const n = 110 + AXES.indexOf(axis);
  const v = number((settings || {})['$' + n]);
  return v !== null && v > 0 ? { max: v, source: '$' + n } : { max: FALLBACK_MAX_FEED, source: 'fallback' };
};

export const jogLine = (axis, distance, feed) => '$J=G91 G21 ' + axis + fmt(distance) + ' F' + fmt(feed);

export const originLine = (p, axes) => 'G10 L20 P' + p + ' ' + axes.map((axis) => axis + '0').join(' ');

// deps: the job service's helpers (see job-service.js).
export const createMotion = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, answers, changed, available,
    hasAutomations, control, transports, transportActors, log, controllerInfo, allSettings, modalWcs, spindleOn
  } = deps;

  // A refusal with a stable code (ETOUCH_MOTION_*) and the values of its
  // message: the French text is unchanged, the API forwards code and params so
  // a client can show it in its own language.
  const refusal = (message, code, params) => {
    const err = conflict(message);
    err.code = code;
    err.params = params;
    return err;
  };

  const stateOf = (r) => {
    if (!r.motion) {
      // pending: the last line sent (jog or origin) until Grbl answered it and
      // the machine is seen at rest after it; session: the continuous jog;
      // cancel: a jog cancel being confirmed.
      r.motion = { pending: null, session: null, cancel: null, lastJog: null, lastOrigin: null };
    }
    return r.motion;
  };

  const activeOf = (c) => controllerStatus(c).activeState || '';
  const connected = (c) => controllers()[c.options.port] === c && !c.isClose() && !!c.runner;
  const fresh = (r) => Number.isFinite(r.seen) && clock() >= r.seen && clock() - r.seen <= MAX_REPORT_AGE_MS;
  const positionOf = (c, kind, axis) => {
    const p = controllerStatus(c)[kind];
    return number(p && p[axis.toLowerCase()]);
  };

  const capabilities = (c, r) => capabilitiesOf({
    type: c.type,
    firmware: r.firmware,
    version: c.settings && c.settings.version,
    enabled: motionEnabled(config)
  });

  // Has the last line sent been answered, and the machine seen at rest after it?
  const settle = (c, r) => {
    const s = stateOf(r);
    const p = s.pending;
    if (!p) {
      return true;
    }
    const state = activeOf(c);
    const answered = p.t.oks >= 1 && r.reports >= p.t.reportsAtOk + 2 && state !== 'Jog';
    const age = clock() - p.sentAt;
    // No answer at all (link trouble) but reports at rest or in alarm long after: let go.
    const lost = age > p.limitMs && /^(Idle|Alarm)/.test(state) && r.reports >= p.mark + 3;
    // The board restarted after the line was sent: Grbl dropped it, no answer will come.
    const restarted = r.startups !== p.startups && state !== 'Jog';
    // Safety bound: no line of ours can still be running after the longest
    // planned duration plus a margin, whatever is reported; nothing stays
    // blocked for ever behind it.
    const expired = age > Math.max(p.limitMs, MAX_JOG_MS + 10000) + PENDING_MARGIN_MS;
    if (p.t.error || answered || lost || restarted || expired) {
      p.t.done();
      s.pending = null;
      return true;
    }
    return false;
  };

  const send = (c, r, kind, line, limitMs) => {
    const s = stateOf(r);
    const t = answers(c, r);
    s.pending = { t, kind, line, sentAt: clock(), mark: r.reports, limitMs, startups: r.startups };
    c.command('gcode', line);
    changed();
    return s.pending;
  };

  // The capability is enabled for this controller (else 409 with its reason).
  const gate = (c, r, name) => {
    const cap = capabilities(c, r)[name];
    if (!cap.enabled) {
      throw conflict(cap.reason);
    }
  };

  // Common to every real move from rest.
  const atRest = (c, r) => {
    available(c);
    const s = stateOf(r);
    if (r.probing) {
      throw conflict('Palpage en cours.');
    }
    if (r.loading) {
      throw conflict('Chargement en cours.');
    }
    if (c.workflow.state !== 'idle') {
      throw conflict('Travail en cours ou en pause : déplacement réel refusé.');
    }
    const state = activeOf(c);
    if (/^Alarm/.test(state)) {
      throw refusal('Machine en alarme' + (r.alarm ? ' (ALARM:' + r.alarm + ')' : '') + ' : déverrouillez ($X) ou référencez ($H) d’abord.',
        'ETOUCH_MOTION_ALARM',
        { alarm: r.alarm || null });
    }
    if (s.session || s.cancel || !settle(c, r) || state === 'Jog') {
      throw conflict('Déplacement précédent non terminé : attendez le retour au repos (Idle).');
    }
    if (state !== 'Idle') {
      throw refusal('La machine doit être au repos (Idle) : état ' + (state || 'inconnu') + '.', 'ETOUCH_MOTION_STATE', { state: state || 'inconnu' });
    }
    const feeder = c.feeder.toJSON();
    if (feeder.queue || feeder.pending) {
      throw conflict('Des commandes sont en attente.');
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
  };

  const jogReady = (c, r) => {
    gate(c, r, 'jog');
    atRest(c, r);
    // Positions and travel are compared in millimetres: $13=1 reports inches.
    if (number(allSettings(c).$13) !== 0) {
      throw conflict('Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.');
    }
  };

  // A real move belongs to the client whose own event stream is open: its
  // closing stops the move, and nobody can bind a move to someone else's stream.
  const bound = (body, actor) => {
    const owner = typeof body.transportId === 'string' ? transportActors.get(body.transportId) : null;
    if (!actor || !owner || !transports.has(body.transportId) || keyOf(owner) !== keyOf(actor)) {
      throw conflict('Le déplacement réel doit venir de l’appareil dont le suivi est ouvert. Rechargez la page.');
    }
  };

  const jogParams = (c, body, continuous) => {
    if (!AXES.includes(body.axis) || ![-1, 1].includes(body.direction) ||
        (!continuous && !STEPS.includes(body.step))) {
      throw conflict(continuous ? 'Axe ou sens invalide.' : 'Axe, sens ou pas invalide (pas : 0,01 / 0,1 / 1 / 10 mm).');
    }
    const feed = number(body.feed);
    const limit = maxFeedOf(allSettings(c), body.axis);
    if (feed === null || typeof body.feed !== 'number' || feed < MIN_FEED || feed > limit.max) {
      throw conflict('Avance hors limites pour ' + body.axis + ' : de ' + MIN_FEED + ' à ' + limit.max + ' mm/min (' +
        (limit.source === 'fallback' ? '$' + (110 + AXES.indexOf(body.axis)) + ' inconnu : limite prudente' : 'limite ' + limit.source) + ').');
    }
    return { axis: body.axis, direction: body.direction, step: body.step, feed: Math.round(feed * 1000) / 1000 };
  };

  // One discrete step.
  const step = (c, r, body) => {
    jogReady(c, r);
    const p = jogParams(c, body, false);
    if (p.step > MAX_SPINDLE_STEP_MM && spindleOn(c)) {
      throw refusal('Broche en rotation : pas de ' + fmt(MAX_SPINDLE_STEP_MM) + ' mm au plus (maintien continu refusé). Arrêtez la broche (M5) pour de plus grands déplacements.',
        'ETOUCH_MOTION_SPINDLE_STEP',
        { max: fmt(MAX_SPINDLE_STEP_MM) });
    }
    const pos = positionOf(c, 'mpos', p.axis);
    const at = limitsAt(envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported })[p.axis], pos, p.axis);
    if (at.outside) {
      throw conflict('Pas refusé : ' + at.reason + '.');
    }
    if (p.step > MAX_UNREFERENCED_STEP_MM && !at.limits) {
      throw conflict('Pas de ' + fmt(p.step) + ' mm refusé : au-delà de ' + MAX_UNREFERENCED_STEP_MM + ' mm, il faut une machine référencée et une course connue (' + at.reason + ').');
    }
    const distance = p.direction * p.step;
    if (at.limits) {
      const target = pos + distance;
      if (target < at.limits.low - 1e-6 || target > at.limits.high + 1e-6) {
        if (at.ambiguous) {
          throw conflict('Pas refusé : ' + at.ambiguous + '.');
        }
        throw refusal('Pas refusé : ' + p.axis + ' sortirait de la course (' + fmt(target) + ' mm machine, course ' + fmt(at.limits.low) + ' → ' + fmt(at.limits.high) + ').',
          'ETOUCH_MOTION_STEP_OUTSIDE',
          { axis: p.axis, target: fmt(target), low: fmt(at.limits.low), high: fmt(at.limits.high) });
      }
    }
    const ms = 60000 * p.step / p.feed;
    if (ms > MAX_JOG_MS) {
      throw refusal('Pas trop lent : ' + fmt(p.step) + ' mm à ' + fmt(p.feed) + ' mm/min durerait ' + Math.ceil(ms / 1000) + ' s (' + (MAX_JOG_MS / 1000) +
        ' s au plus). Augmentez l’avance ou réduisez le pas.',
      'ETOUCH_MOTION_STEP_SLOW',
      { step: fmt(p.step), feed: fmt(p.feed), seconds: Math.ceil(ms / 1000), max: MAX_JOG_MS / 1000 });
    }
    const line = jogLine(p.axis, distance, p.feed);
    const pending = send(c, r, 'jog', line, ms + 10000);
    watchStep(c, r, pending, body.transportId);
    return { message: 'Pas de ' + fmt(p.step) + ' mm en ' + p.axis + (p.direction > 0 ? '+' : '−') + ' envoyé (' + line + ').', command: line };
  };

  // A discrete step in progress is watched too: the function disabled or the
  // stream of the device that sent it closing cancels it (0x85).
  const watchStep = (c, r, pending, transportId) => {
    const s = stateOf(r);
    const check = () => {
      if (s.pending !== pending || s.session || s.cancel || !connected(c) || settle(c, r)) {
        return;
      }
      if (!motionEnabled(config)) {
        cancel(c, r, 'disabled');
        return;
      }
      if (!transports.has(transportId)) {
        cancel(c, r, 'transport');
        return;
      }
      later(c, r, check, STEP_WATCH_MS);
    };
    later(c, r, check, STEP_WATCH_MS);
  };

  // History (F4): one entry per continuous jog session, written when it ends.
  const endSession = (c, r, session, result, reason, message) => {
    const s = stateOf(r);
    s.session = null;
    s.lastJog = { result, reason, message, at: Date.now(), axis: session ? session.axis : null };
    if (session) {
      log({
        event: 'jog',
        result,
        reason: reason || '',
        controller: controllerInfo(c, r),
        axis: session.axis,
        direction: session.direction,
        feed: session.feed,
        distanceMm: session.distanceMm,
        command: session.command,
        startedAt: new Date(session.since).toISOString(),
        durationMs: Date.now() - session.since,
        actor: session.actor
      });
    }
  };

  // Ends a continuous jog (if any) and cancels whatever jog Grbl runs: 0x85,
  // sent again when the `$J` is acknowledged after it (a 0x85 that reached
  // Grbl before the `$J` was parsed is ignored outside the Jog state) and
  // while a report newer than the last 0x85 still shows Jog. Not confirmed
  // after CANCEL_LIMIT_MS: the operator is told and it is recorded, and the
  // 0x85 keeps being repeated while Jog is reported, for at most the planned
  // duration of the `$J` (CANCEL_MAX_MS at most).
  const cancel = (c, r, why) => {
    const s = stateOf(r);
    endSession(c, r, s.session, 'cancelled', why, STOP_REASONS[why] || why);
    if (!connected(c)) {
      changed();
      return;
    }
    c.command('jogCancel');
    const p0 = s.pending;
    const planned = p0 && p0.kind === 'jog' ? p0.sentAt + p0.limitMs - clock() : 0;
    const job = {
      since: clock(),
      sentAt: clock(),
      mark: r.reports,
      oks: p0 ? p0.t.oks : 0,
      until: clock() + Math.min(CANCEL_MAX_MS, Math.max(CANCEL_LIMIT_MS, planned)),
      unconfirmed: false,
      reason: why
    };
    s.cancel = job;
    changed();
    const check = () => {
      if (s.cancel !== job) {
        return;
      }
      if (!connected(c)) {
        s.cancel = null;
        return;
      }
      const state = activeOf(c);
      const p = s.pending;
      if (p && p.kind === 'jog' && p.t.oks > job.oks) {
        job.oks = p.t.oks;
        c.command('jogCancel');
        job.sentAt = clock();
        job.mark = r.reports;
      } else if (state === 'Jog' && r.reports > job.mark && clock() - job.sentAt >= CANCEL_RESEND_MS) {
        c.command('jogCancel');
        job.sentAt = clock();
        job.mark = r.reports;
      }
      if (state !== 'Jog' && r.reports > job.mark && settle(c, r)) {
        s.cancel = null;
        changed();
        return;
      }
      if (!job.unconfirmed && clock() - job.since > CANCEL_LIMIT_MS) {
        job.unconfirmed = true;
        // The cancelled $J itself: it stays pending while Jog is reported.
        if (p0) {
          p0.unconfirmed = true;
        }
        if (s.lastJog) {
          s.lastJog.unconfirmed = true;
        }
        log({ event: 'jog-cancel-unconfirmed', reason: why, controller: controllerInfo(c, r), state, actor: null });
        changed();
      }
      if (clock() > job.until) {
        // The bounded `$J` is over by now, or nothing more can be done from here.
        s.cancel = null;
        changed();
        return;
      }
      later(c, r, check, WATCH_MS);
    };
    later(c, r, check, WATCH_MS);
  };

  const stopReason = (c, r, session) => {
    if (!motionEnabled(config)) {
      return 'disabled';
    }
    if (clock() > session.deadline) {
      return 'keepalive';
    }
    if (!transports.has(session.transportId)) {
      return 'transport';
    }
    const owner = control.inspect(c.options.port).owner;
    if (owner && keyOf(owner) !== session.actorKey) {
      return 'control';
    }
    if (!fresh(r)) {
      return 'stale';
    }
    if (/^Alarm/.test(activeOf(c))) {
      return 'alarm';
    }
    return '';
  };

  const watch = (c, r, session) => {
    const s = stateOf(r);
    const check = () => {
      if (s.session !== session) {
        return;
      }
      if (!connected(c)) {
        endSession(c, r, session, 'lost', 'connection', 'connexion au contrôleur perdue');
        return;
      }
      const why = stopReason(c, r, session);
      if (why) {
        cancel(c, r, why);
        return;
      }
      // Over by itself: end of its bounded distance, or refused by Grbl.
      const p = s.pending;
      const error = p && p.t.error;
      if (settle(c, r)) {
        if (error) {
          endSession(c, r, session, 'refused', 'error:' + error, 'Grbl a refusé le jog (error:' + error + ')');
        } else {
          endSession(c, r, session, 'ended', 'bound', 'fin de la course autorisée atteinte');
        }
        changed();
        return;
      }
      later(c, r, check, WATCH_MS);
    };
    later(c, r, check, WATCH_MS);
  };

  // Why no continuous jog may start on this axis now ('' when it may).
  const continuousReason = (c, r, axis) => {
    if (spindleOn(c)) {
      return 'Broche en rotation : maintien continu refusé ; pas de ' + fmt(MAX_SPINDLE_STEP_MM) + ' mm au plus.';
    }
    const at = limitsAt(envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported })[axis], positionOf(c, 'mpos', axis), axis);
    if (!at.limits) {
      return 'Maintien continu impossible : ' + at.reason + '.' + (at.outside ? '' : ' Utilisez les pas (' + MAX_UNREFERENCED_STEP_MM + ' mm au plus).');
    }
    return '';
  };

  const start = (c, r, body, actor) => {
    gate(c, r, 'jogContinuous');
    jogReady(c, r);
    const p = jogParams(c, body, true);
    const why = continuousReason(c, r, p.axis);
    if (why) {
      throw conflict(why);
    }
    const env = envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported })[p.axis];
    const pos = positionOf(c, 'mpos', p.axis);
    const { limits, ambiguous } = limitsAt(env, pos, p.axis);
    // Safe in every plausible convention, never more than the travel itself,
    // and never longer than MAX_JOG_MS at this feed (hold again to go on).
    const toEdge = p.direction > 0 ? limits.high - EDGE_MARGIN_MM - pos : pos - (limits.low + EDGE_MARGIN_MM);
    const room = Math.floor(Math.min(toEdge, env.travel - EDGE_MARGIN_MM, p.feed * MAX_JOG_MS / 60000) * 1000) / 1000;
    if (!(room >= MIN_CONTINUOUS_MM) && ambiguous) {
      throw conflict('Maintien continu impossible : ' + ambiguous + '.');
    }
    if (!(room >= MIN_CONTINUOUS_MM)) {
      throw refusal('Fin de course proche : pas de maintien continu vers ' + p.axis + (p.direction > 0 ? '+' : '−') + ' (' + fmt(Math.max(0, room)) + ' mm disponibles).',
        'ETOUCH_MOTION_EDGE',
        { axis: p.axis, direction: p.direction > 0 ? '+' : '−', room: fmt(Math.max(0, room)) });
    }
    const line = jogLine(p.axis, p.direction * room, p.feed);
    const session = {
      id: crypto.randomBytes(12).toString('hex'),
      actorKey: keyOf(actor),
      actor: { kind: actor.kind, id: actor.id, label: actor.label || '', user: actor.user || '' },
      owner: { kind: actor.kind, id: actor.id, label: actor.label || '' },
      transportId: body.transportId,
      axis: p.axis,
      direction: p.direction,
      feed: p.feed,
      distanceMm: room,
      command: line,
      since: Date.now(),
      deadline: clock() + KEEPALIVE_TIMEOUT_MS
    };
    const s = stateOf(r);
    send(c, r, 'jog', line, 60000 * room / p.feed + 10000);
    s.session = session;
    watch(c, r, session);
    return {
      jogId: session.id,
      keepalivePeriodMs: KEEPALIVE_PERIOD_MS,
      keepaliveTimeoutMs: KEEPALIVE_TIMEOUT_MS,
      distanceMm: room,
      command: line,
      message: 'Déplacement continu ' + p.axis + (p.direction > 0 ? '+' : '−') + ' (au plus ' + fmt(room) + ' mm, ' + fmt(p.feed) + ' mm/min) : relâchez pour arrêter.'
    };
  };

  const keepalive = (c, r, body, actor) => {
    const s = stateOf(r);
    const session = s.session;
    if (!session || session.id !== body.jogId) {
      const last = s.lastJog;
      return { active: false, message: 'Déplacement terminé ou annulé' + (last && last.message ? ' : ' + last.message : '') + '.' };
    }
    if (keyOf(actor) !== session.actorKey || body.transportId !== session.transportId) {
      throw conflict('Ce déplacement appartient à un autre client.');
    }
    // Past the deadline the watchdog cancels at its next tick: a late
    // keepalive never extends the jog.
    if (clock() > session.deadline) {
      cancel(c, r, 'late');
      throw conflict('Maintien reçu trop tard : déplacement annulé (0x85).');
    }
    session.deadline = clock() + KEEPALIVE_TIMEOUT_MS;
    return { active: true, jogId: session.id };
  };

  // Is there a jog of ours to stop (sent, running, or being cancelled)?
  const moving = (c, r) => {
    const s = stateOf(r);
    return !!(s.session || (s.pending && s.pending.kind === 'jog' && !settle(c, r)));
  };

  const STOP_MESSAGES = {
    pause: 'Pause pendant un déplacement : Grbl ne suspend pas un jog, annulation de jog (0x85) envoyée.'
  };

  // Release, pointercancel, blur, Stop, Pause: free for everyone, enabled or not.
  const stop = (c, r, why = 'operator') => {
    if (moving(c, r) || activeOf(c) === 'Jog') {
      cancel(c, r, why);
      return { message: STOP_MESSAGES[why] || 'Déplacement arrêté : annulation de jog (0x85) envoyée.' };
    }
    return { message: 'Aucun déplacement en cours.' };
  };

  // Called before the control lease is checked: a disabled or unsupported
  // function says so first, and a keepalive of a jog that was running when
  // the function was disabled cancels it. jog-stop never comes here.
  const precheck = (c, r, body) => {
    let name = null;
    if (body.action === 'motion') {
      name = { jog: 'jog', 'jog-start': 'jogContinuous', 'jog-keepalive': 'jog' }[body.operation] || null;
    } else if (body.action === 'set-origin' || (body.action === 'prepare' && body.operation === 'set-origin')) {
      name = 'setOrigin';
    }
    if (!name) {
      return;
    }
    try {
      gate(c, r, name);
    } catch (err) {
      if (body.operation === 'jog-keepalive' && stateOf(r).session) {
        cancel(c, r, 'disabled');
      }
      throw err;
    }
  };

  // POST {action: 'motion', operation: 'jog' | 'jog-start' | 'jog-keepalive' | 'jog-stop'}
  const perform = (c, r, body, actor) => {
    const op = body.operation;
    if (op === 'jog-stop') {
      return stop(c, r, 'operator');
    }
    if (!['jog', 'jog-start', 'jog-keepalive'].includes(op)) {
      throw conflict('Opération de déplacement inconnue.');
    }
    precheck(c, r, body);
    if (op === 'jog-keepalive') {
      return keepalive(c, r, body, actor);
    }
    bound(body, actor);
    return op === 'jog' ? step(c, r, body) : start(c, r, body, actor);
  };

  // Work origin: the confirmed operation registered with the commissioning ones.
  const originReady = (c) => {
    const r = record(c);
    gate(c, r, 'setOrigin');
    atRest(c, r);
    if (!modalWcs(r) || !WCS_P[modalWcs(r)]) {
      throw conflict('Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.');
    }
  };

  const originParams = (body) => {
    const axes = body && body.axes;
    if (!Array.isArray(axes) || !axes.length || axes.length > AXES.length ||
        axes.some((axis) => !AXES.includes(axis)) || new Set(axes).size !== axes.length) {
      throw conflict('Axes invalides : choisissez X, Y et/ou Z.');
    }
    return { axes: AXES.filter((axis) => axes.includes(axis)) };
  };

  // After the guard: the offset and the position the confirmation shows.
  const originBind = (c, params) => {
    const r = record(c);
    const wcs = modalWcs(r);
    const machine = {};
    params.axes.forEach((axis) => {
      const v = positionOf(c, 'mpos', axis);
      if (v === null) {
        throw refusal('Position machine ' + axis + ' inconnue.', 'ETOUCH_MOTION_POSITION_UNKNOWN', { axis });
      }
      machine[axis] = v;
    });
    return { ...params, wcs, p: WCS_P[wcs], machine };
  };

  const originRun = (c, t, actor) => {
    originReady(c);
    const r = record(c);
    const { axes, wcs, p, machine } = t.params;
    const now = modalWcs(r);
    if (now !== wcs) {
      throw refusal('Le repère actif a changé depuis la confirmation (' + wcs + ' → ' + (now || 'inconnu') + ') : confirmez à nouveau.',
        'ETOUCH_MOTION_WCS_CHANGED',
        { from: wcs, to: now || 'inconnu' });
    }
    if (axes.some((axis) => positionOf(c, 'mpos', axis) === null || Math.abs(positionOf(c, 'mpos', axis) - machine[axis]) > ORIGIN_MOVED_MM)) {
      throw conflict('La machine a bougé depuis la confirmation : confirmez à nouveau à la position actuelle.');
    }
    const line = originLine(p, axes);
    const s = stateOf(r);
    const pending = send(c, r, 'origin', line, ORIGIN_LIMIT_MS);
    const entry = { event: 'origin', controller: controllerInfo(c, r), wcs, axes, machine, command: line, actor: actor || null };
    return new Promise((resolve, reject) => {
      const fail = (message) => {
        s.lastOrigin = { at: Date.now(), wcs, axes, failed: message };
        log({ ...entry, result: 'failed', reason: message });
        changed();
        reject(conflict(message));
      };
      const check = () => {
        if (!connected(c)) {
          fail('Connexion machine perdue pendant la définition d’origine : vérifiez le repère.');
          return;
        }
        const error = pending.t.error;
        if (s.pending !== pending || settle(c, r)) {
          if (error) {
            fail('Grbl a refusé la définition d’origine (error:' + error + ').');
            return;
          }
          // G10 L20 changes an offset, never the machine position: a firmware
          // (or simulator) that took the line for a move must not pass the check below.
          const moved = axes.filter((axis) => {
            const m = positionOf(c, 'mpos', axis);
            return m === null || Math.abs(m - machine[axis]) > ORIGIN_MOVED_MM;
          });
          if (moved.length) {
            fail('La machine a bougé pendant la définition d’origine (' + moved.map((axis) => axis + ' ' + positionOf(c, 'mpos', axis)).join(', ') + ') : arrêtez et vérifiez le contrôleur.');
            return;
          }
          const off = axes.filter((axis) => {
            const w = positionOf(c, 'wpos', axis);
            return w === null || Math.abs(w) > ORIGIN_TOLERANCE;
          });
          if (off.length) {
            fail('Le repère n’a pas pris la valeur attendue (' + off.map((axis) => axis + ' ' + positionOf(c, 'wpos', axis)).join(', ') + ' au lieu de 0).');
            return;
          }
          s.lastOrigin = { at: Date.now(), wcs, axes, machine };
          log({ ...entry, result: 'set' });
          changed();
          resolve({ message: 'Origine ' + axes.join(' ') + ' du repère ' + wcs + ' réglée à la position actuelle (' + line + ').' });
          return;
        }
        if (clock() - pending.sentAt > ORIGIN_LIMIT_MS) {
          fail('Définition d’origine sans réponse à temps : vérifiez la machine et le repère.');
          return;
        }
        later(c, r, check, 100, () => reject(conflict('Définition d’origine abandonnée (service arrêté ou contrôleur retiré) : vérifiez le repère.')));
      };
      check();
    });
  };

  const originOperation = {
    guard: originReady,
    params: originParams,
    bind: originBind,
    name: (c, params) => 'Origine ' + params.axes.join(' ') + ' du repère ' + params.wcs + ' à la position actuelle (' + originLine(params.p, params.axes) + ')',
    run: originRun
  };

  const reason = (fn) => {
    try {
      fn();
      return '';
    } catch (err) {
      return err.message;
    }
  };

  // What every snapshot shows: capabilities and what is possible right now.
  const snapshot = (c, r) => {
    const s = stateOf(r);
    const jogReason = reason(() => jogReady(c, r));
    const continuous = {};
    AXES.forEach((axis) => {
      continuous[axis] = jogReason || reason(() => gate(c, r, 'jogContinuous')) || continuousReason(c, r, axis);
    });
    const originReason = reason(() => originReady(c));
    const settings = allSettings(c);
    const maxFeed = {};
    AXES.forEach((axis) => {
      maxFeed[axis] = maxFeedOf(settings, axis);
    });
    return {
      capabilities: capabilities(c, r),
      motion: {
        canJog: !jogReason,
        jogReason,
        continuousReason: continuous,
        canSetOrigin: !originReason,
        setOriginReason: originReason,
        maxFeed,
        jog: s.session ? {
          axis: s.session.axis,
          direction: s.session.direction,
          feed: s.session.feed,
          distanceMm: s.session.distanceMm,
          since: s.session.since,
          owner: s.session.owner
        } : null,
        cancelling: !!s.cancel,
        // A jog cancel not confirmed after 5 s (still repeated while Jog is reported).
        // Stays true while Grbl still reports Jog, even once the repeats stopped.
        cancelUnconfirmed: !!((s.cancel && s.cancel.unconfirmed) || (!s.cancel && s.pending && s.pending.unconfirmed && activeOf(c) === 'Jog')),
        lastJog: s.lastJog ? { ...s.lastJog } : null,
        lastOrigin: s.lastOrigin ? { ...s.lastOrigin } : null
      }
    };
  };

  // Change detection for the stream (see job-service fingerprint()).
  const signature = (r) => {
    const s = r.motion;
    return s ? [s.session && s.session.id, s.pending && s.pending.sentAt, s.cancel && s.cancel.since, s.cancel && s.cancel.unconfirmed, s.lastJog && s.lastJog.at, s.lastOrigin && s.lastOrigin.at].join('/') : '';
  };

  // The owner's event stream closed: its continuous jog stops at once.
  const transportClosed = (c, r, id) => {
    const s = r.motion;
    if (s && s.session && s.session.transportId === id) {
      cancel(c, r, 'transport');
    }
  };

  // A continuous jog keeps its stream from being rotated (see touch-stream).
  const holds = (id) => (r) => !!(r.motion && r.motion.session && r.motion.session.transportId === id);

  // The controller record is dropped (port closed, or the service disposed):
  // its answer listeners go with it. A jog of ours on a controller still
  // open gets one 0x85 (no timer is left behind to repeat it).
  const forget = (c, r) => {
    const s = r.motion;
    if (!s) {
      return;
    }
    if ((s.session || s.cancel || (s.pending && s.pending.kind === 'jog')) && connected(c)) {
      c.command('jogCancel');
    }
    if (s.session) {
      endSession(c, r, s.session, 'cancelled', 'dispose', STOP_REASONS.dispose);
    }
    if (s.pending) {
      s.pending.t.done();
      s.pending = null;
    }
    s.cancel = null;
  };

  return { perform, precheck, stop, moving, originOperation, snapshot, signature, transportClosed, holds, forget };
};

export default { createMotion, capabilitiesOf, envelopeOf, limitsAt, maxFeedOf, grblVersion, jogLine, originLine, motionEnabled };
