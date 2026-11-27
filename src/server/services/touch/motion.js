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
//     0.01/0.1/1/10/25/50/100 mm; above 1 mm only on a referenced machine whose travel
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
export const STEPS = [0.01, 0.1, 1, 10, 25, 50, 100];
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
// What the operator plans (a step, a program: program-check.js) keeps this far from the end of
// the travel opposite the homing switch (C-06). Field fact on the LUNYEE ($132=130): a target at
// Z −129.945 raised ALARM:2, one at −129.735 passed. A precaution until the board's own rule is
// measured (test E-A), not a firmware rule. The homing end (0 in both conventions) stays exact:
// the machine stands there after $H, and G53 G0 Z0 retracts must pass.
export const SOFT_LIMIT_MARGIN_MM = 0.5;
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
// Lot C1: a proof missing between two lines of a framing is waited for this long (report-proof.js).
const PROOF_WAIT_MS = 2500;
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

export const DISABLED_MESSAGE = 'Déplacements réels non activés : validation matérielle supervisée requise.';
export const HOMING_MESSAGE = 'Prise d’origine en cours : attendez sa fin avant tout déplacement ou zéro.';

const STOP_REASONS = {
  operator: 'relâchement ou arrêt demandé',
  stop: 'bouton Arrêter',
  keepalive: 'maintien non confirmé à temps (connexion lente ou perdue)',
  transport: 'flux de suivi du client fermé',
  control: 'pilotage pris par un autre client',
  released: 'pilotage rendu',
  stale: 'rapport machine trop ancien',
  alarm: 'alarme machine',
  disabled: 'déplacements réels désactivés',
  late: 'maintien reçu après l’échéance',
  pause: 'bouton Pause',
  duration: 'durée maximale d’un déplacement continu atteinte',
  state: 'machine sortie du repos (Idle) pendant le cadrage',
  dispose: 'service arrêté',
  socket: 'arrêt venu d’un client CNCjs',
  spindle: 'bouton Arrêter la broche',
  // Lot C1: seen by the watch of a move, not asked for by the operator.
  spindleProof: 'broche commandée, ou vitesse de broche non rapportée, pendant le déplacement',
  program: 'programme remplacé pendant le cadrage'
};
// A framing (laser or CNC) holds the machine from its first line to its end: no other move,
// zero or framing starts meanwhile, even between two of its lines (lot F1, review D1).
export const FRAME_BUSY = 'Cadrage en cours.';

// CNC framing in the air (lot F1): the stops of its supervisor, French message (the server's)
// with its values. The client catalog (touch/i18n-messages-machine.js) has the same templates.
export const FRAME_MESSAGES = {
  ETOUCH_FRAME_STREAM: () => 'Cadrage arrêté : l’appareil qui l’a lancé ne suit plus la machine (connexion perdue).',
  ETOUCH_FRAME_CONTROL: () => 'Cadrage arrêté : le pilotage a changé de main.',
  ETOUCH_FRAME_STALE: () => 'Cadrage arrêté : la machine ne donne plus de nouvelles (rapports trop anciens).',
  ETOUCH_FRAME_TIMEOUT: () => 'Cadrage arrêté : un déplacement n’a pas fini à temps. Vérifiez la machine.',
  ETOUCH_FRAME_STATE: (p) => 'Cadrage arrêté : la machine a changé d’état pendant le cadrage (' + p.state + ').',
  ETOUCH_FRAME_REFUSED: (p) => 'Grbl a refusé le jog (error:' + p.n + ')',
  ETOUCH_FRAME_ALARM: (p) => 'Cadrage arrêté : alarme machine' + (p.alarm === null ? '' : ' (ALARM:' + p.alarm + ')') + '.',
  ETOUCH_FRAME_RESTART: () => 'Cadrage arrêté : la carte a redémarré. Sa position est perdue.',
  ETOUCH_FRAME_POSITION: (p) => 'Cadrage arrêté : ' + p.axis + ' machine ' + p.reported + ' au lieu de ' + p.expected + ' attendu. La carte n’applique peut-être pas le zéro affiché.'
};
// CNC framing: an arrival within this distance of its target is where it was expected; a stream
// of the device that started it may be gone this long (a rotation) before it stops.
export const FRAME_ARRIVAL_MM = 0.05;
export const FRAME_STREAM_GRACE_MS = 3000;

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
// The homing cycle seen tells it (`homeAt`, the machine position when Home
// gave way to Idle): standard Grbl leaves an axis homed towards its negative
// end at -travel + pull-off, never at 0; found at 0 (within
// HOME_ORIGIN_TOLERANCE_MM), the firmware forces the origin there and that
// axis travels in [0, travel] only.
export const HOME_ORIGIN_TOLERANCE_MM = 0.01;
// $10 bit 0 set and no WPos report seen: Grbl reports MPos. Otherwise CNCjs
// derives MPos from WPos and the last WCO received, taken as 0 until one comes.
const reportsMposOf = (settings, wposReported) => {
  const report = number((settings || {}).$10);
  return !wposReported && report !== null && report >= 0 && Math.floor(report) === report && report % 2 === 1;
};
// CNCjs's machine position can be trusted: reported as such, or a WCO received
// since the board started (F1). What a homing cycle teaches (homeAt) needs it.
export const machinePositionKnown = (settings, { wcoSeen = false, wposReported = false } = {}) => (
  reportsMposOf(settings, wposReported) || wcoSeen === true
);
export const envelopeOf = (settings, homed, { wcoSeen = false, wposReported = false, homeAt = null } = {}) => {
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
  const reportsMpos = reportsMposOf(s, wposReported);
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
      let candidates = [{ low: -travel, high: 0 }];
      if (Math.floor(mask / (2 ** i)) % 2 === 1) {
        // Learnt under the same $23 only (homeAt.mask): another direction mask is another convention.
        const home = homeAt && number(homeAt.mask) === mask ? number(homeAt[axis]) : null;
        candidates = home !== null && Math.abs(home) <= HOME_ORIGIN_TOLERANCE_MM
          ? [{ low: 0, high: travel }]
          : candidates.concat([{ low: 0, high: travel }]);
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
      ? 'Position de l’axe ' + axis + ' inconnue : refaites la prise d’origine depuis la tablette.'
      : '',
    reason: ''
  };
};

// The usable part of travel limits (an envelope or limitsAt's intersection): the bound away from 0,
// the end opposite the homing switch in both conventions, keeps SOFT_LIMIT_MARGIN_MM.
export const usableOf = (limits) => ({
  low: limits.low < 0 ? limits.low + SOFT_LIMIT_MARGIN_MM : limits.low,
  high: limits.high > 0 ? limits.high - SOFT_LIMIT_MARGIN_MM : limits.high
});

// Longest planned duration of one `$J`: an unconfirmed cancel is repeated for
// at least that long, and a jog never outlives its supervision by much.
export const MAX_JOG_MS = 60000;
// A continuous jog is cancelled this long after its planned duration at the latest.
export const SESSION_MARGIN_MS = 5000;

// $110-$112 when known, else the documented fallback.
export const maxFeedOf = (settings, axis) => {
  const n = 110 + AXES.indexOf(axis);
  const v = number((settings || {})['$' + n]);
  return v !== null && v > 0 ? { max: v, source: '$' + n } : { max: FALLBACK_MAX_FEED, source: 'fallback' };
};

export const jogLine = (axis, distance, feed) => '$J=G91 G21 ' + axis + fmt(distance) + ' F' + fmt(feed);

export const originLine = (p, axes, at = 'here') => 'G10 L' + (at === 'machine' ? '2' : '20') + ' P' + p + ' ' + axes.map((axis) => axis + '0').join(' ');

// CNC framing in the air (lot F1, design/fonctions/F1-CONCEPTION.md § 4.2): `M5`, at most one
// Z line, second, relative and unsigned (it can only rise), then X/Y lines without any Z word.
// Nothing else is written by a CNC framing: no M3/M4/S, no G0/G1, no G53, no $H/$X.
const CNC_Z_LINE = /^\$J=G91 G21 Z\d+(\.\d+)? F\d+(\.\d+)?$/;
const CNC_XY_LINE = /^\$J=G90 G21 X-?\d+(\.\d+)? Y-?\d+(\.\d+)? F\d+(\.\d+)?$/;
export const cncFrameLinesValid = (lines) => Array.isArray(lines) && lines[0] === 'M5' &&
  lines.slice(1).every((line, i) => (i === 0 && CNC_Z_LINE.test(line)) || CNC_XY_LINE.test(line));

// deps: the job service's helpers (see job-service.js). The motion factory owns the controller's
// moves and their shared guard closures (the CNC framing of lot F1 among them).
// eslint-disable-next-line max-lines-per-function
export const createMotion = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, answers, changed, available,
    hasAutomations, control, transports, transportActors, log, controllerInfo, allSettings, modalWcs, spindleOn, referenceReady, homingActive, offsetReady
  } = deps;
  // Lot C1 (report-proof.js): what the reports carried by themselves.
  const { proof } = deps;
  const throwIf = (err) => {
    if (err) {
      throw err;
    }
  };

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
      // frame: a laser framing sequence (M5 then bounded absolute jogs).
      r.motion = { pending: null, session: null, cancel: null, lastJog: null, lastOrigin: null, frame: null, lastFrame: null };
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
    // Two reports after the banner, like an ok: bytes of the $J received after
    // the restart would be run, and only a later report would show Jog.
    const restarted = r.startups !== p.startups && state !== 'Jog' && r.reports >= (r.reportsAtStartup || 0) + 2;
    // Safety bound: no line of ours can still be running after the longest
    // planned duration plus a margin, whatever is reported; nothing stays
    // blocked for ever behind it.
    const expired = age > Math.max(p.limitMs, MAX_JOG_MS + 10000) + PENDING_MARGIN_MS;
    // An error may answer another client's line: like an ok, it settles only once
    // two reports after it show no Jog.
    const refused = !!p.t.error && r.reports >= p.t.reportsAtError + 2 && state !== 'Jog';
    if (refused || answered || lost || restarted || expired) {
      if (p.t.error && p.axis && !s.session) {
        s.lastJog = { result: 'refused', reason: 'error:' + p.t.error, message: 'Grbl a refusé le jog (error:' + p.t.error + ')', at: Date.now(), axis: p.axis };
      }
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
      if (cap.supported && !motionEnabled(config)) {
        throw refusal(DISABLED_MESSAGE, 'ETOUCH_MOTION_DISABLED', {});
      }
      throw conflict(cap.reason);
    }
  };

  // Common to every real move from rest. `own`: the framing that checks itself again before each of
  // its lines (lot F1, second review): only another one is busy.
  const atRest = (c, r, own = null) => {
    available(c);
    if (homingActive(r)) {
      throw refusal(HOMING_MESSAGE, 'ETOUCH_MOTION_HOMING', {});
    }
    const s = stateOf(r);
    if (s.frame && s.frame !== own) {
      throw conflict(FRAME_BUSY);
    }
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

  const jogReady = (c, r, own = null) => {
    gate(c, r, 'jog');
    atRest(c, r, own);
    // Positions and travel are compared in millimetres: $13=1 reports inches.
    if (number(allSettings(c).$13) !== 0) {
      throw conflict('Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.');
    }
  };

  // Lot C1 (design/plaque/C1-CONCEPTION.md § 2.2): a move starts only from a proven rest, two reports
  // that carry the position themselves, Idle and agreeing, the last one recent. Any step, 0.01 mm included.
  const moveReady = (c, r, own = null) => {
    jogReady(c, r, own);
    throwIf(proof.positionRefusal(r));
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
      throw conflict(continuous ? 'Axe ou sens invalide.' : 'Axe, sens ou pas invalide (pas : 0,01 / 0,1 / 1 / 10 / 25 / 50 / 100 mm).');
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
  const step = (c, r, body, actor) => {
    moveReady(c, r);
    const p = jogParams(c, body, false);
    if (p.step > MAX_SPINDLE_STEP_MM && spindleOn(c)) {
      throw refusal('Broche en rotation : pas de ' + fmt(MAX_SPINDLE_STEP_MM) + ' mm au plus (maintien continu refusé). Arrêtez la broche (M5) pour de plus grands déplacements.',
        'ETOUCH_MOTION_SPINDLE_STEP',
        { max: fmt(MAX_SPINDLE_STEP_MM) });
    }
    // Lot C1: beyond the small steps kept for touching off with the spindle on, the spindle is proven stopped.
    const large = p.step > MAX_SPINDLE_STEP_MM;
    if (large) {
      throwIf(proof.spindleRefusal(r));
    }
    const pos = proof.posOf(r, 'm', p.axis);
    const at = limitsAt(envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos })[p.axis], pos, p.axis);
    if (at.outside) {
      throw conflict('Pas refusé : ' + at.reason + '.');
    }
    if (p.step > MAX_UNREFERENCED_STEP_MM && !at.limits) {
      throw conflict('Pas de ' + fmt(p.step) + ' mm refusé : au-delà de ' + MAX_UNREFERENCED_STEP_MM + ' mm, il faut une machine référencée et une course connue (' + at.reason + ').');
    }
    const distance = p.direction * p.step;
    if (at.limits) {
      const target = pos + distance;
      // The far end keeps SOFT_LIMIT_MARGIN_MM (C-06); a step back inside from that band is allowed.
      const usable = usableOf(at.limits);
      if ((distance < 0 && target < usable.low - 1e-6) || (distance > 0 && target > usable.high + 1e-6)) {
        if (at.ambiguous) {
          throw refusal(at.ambiguous, 'ETOUCH_MOTION_AMBIGUOUS', { axis: p.axis });
        }
        throw refusal('Pas refusé : ' + p.axis + ' sortirait de la course (' + fmt(target) + ' mm machine, course ' + fmt(usable.low) + ' → ' + fmt(usable.high) + ').',
          'ETOUCH_MOTION_STEP_OUTSIDE',
          { axis: p.axis, target: fmt(target), low: fmt(usable.low), high: fmt(usable.high) });
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
    pending.axis = p.axis;
    // Its stream is not rotated while it runs (holds, touch-stream.js): a rotation would cancel it.
    pending.transportId = body.transportId;
    pending.ref = large ? { hints: r.spinHints } : null;
    watchStep(c, r, pending, body.transportId, actor);
    return { message: 'Pas de ' + fmt(p.step) + ' mm en ' + p.axis + (p.direction > 0 ? '+' : '−') + ' envoyé (' + line + ').', command: line };
  };

  // A discrete step in progress is watched too: the function disabled, the
  // stream of the device that sent it closing, a takeover of the control lease
  // or a stale report cancels it (0x85), like a continuous jog.
  const watchStep = (c, r, pending, transportId, actor) => {
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
      const owner = control.inspect(c.options.port).owner;
      if (owner && actor && keyOf(owner) !== keyOf(actor)) {
        cancel(c, r, 'control');
        return;
      }
      if (!fresh(r) || !proof.posYoung(r)) {
        cancel(c, r, 'stale');
        return;
      }
      if (pending.ref && proof.spindleWatch(r, pending.ref)) {
        cancel(c, r, 'spindleProof');
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
  // Lot F1 (third review): the cancel of a framing (`framing`, the one running, or one taking over a
  // framing's line or cancel) belongs to its board session, and a banner ends its repeats without a
  // byte (D-06). Every other one, a step's or a continuous jog's, is the cancel of before the lot,
  // banner or not.
  const cancel = (c, r, why, framing = null) => {
    const s = stateOf(r);
    const framed = !!(framing || s.frame || (s.cancel && s.cancel.framed) || (s.pending && s.pending.framed));
    endSession(c, r, s.session, 'cancelled', why, STOP_REASONS[why] || why);
    if (s.frame) {
      endFrame(c, r, s.frame, 'cancelled', why);
    }
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
      reason: why,
      framed,
      startups: r.startups
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
      // A framing's cancel: the board restarted, the framing is gone with its session, and nothing
      // more is written to the new one, not even a jog cancel (D-06, lot F1 review C1).
      if (job.framed && r.startups !== job.startups) {
        s.cancel = null;
        changed();
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
    // Fixed at its start, never renewed: the planned duration (MAX_JOG_MS at
    // most) plus a margin for acceleration, whatever the keepalives say.
    if (clock() > session.until) {
      return 'duration';
    }
    if (!transports.has(session.transportId)) {
      return 'transport';
    }
    const owner = control.inspect(c.options.port).owner;
    if (owner && keyOf(owner) !== session.actorKey) {
      return 'control';
    }
    if (!fresh(r) || !proof.posYoung(r)) {
      return 'stale';
    }
    if (/^Alarm/.test(activeOf(c))) {
      return 'alarm';
    }
    if (proof.spindleWatch(r, session.ref)) {
      return 'spindleProof';
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
    // Lot C1: never throws (the snapshot calls it too).
    const spindle = proof.spindleRefusal(r);
    if (spindle) {
      return spindle.message;
    }
    const at = limitsAt(envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos })[axis], proof.posOf(r, 'm', axis), axis);
    if (!at.limits) {
      return 'Maintien continu impossible : ' + at.reason + '.' + (at.outside ? '' : ' Utilisez les pas (' + MAX_UNREFERENCED_STEP_MM + ' mm au plus).');
    }
    return '';
  };

  const start = (c, r, body, actor) => {
    gate(c, r, 'jogContinuous');
    moveReady(c, r);
    const p = jogParams(c, body, true);
    // Lot C1: the coded refusal of the spindle proof (the old guard keeps its own sentence below).
    if (!spindleOn(c)) {
      throwIf(proof.spindleRefusal(r));
    }
    const why = continuousReason(c, r, p.axis);
    if (why) {
      throw conflict(why);
    }
    const env = envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos })[p.axis];
    const pos = proof.posOf(r, 'm', p.axis);
    const { limits, ambiguous } = limitsAt(env, pos, p.axis);
    // Safe in every plausible convention, never more than the travel itself,
    // and never longer than MAX_JOG_MS at this feed (hold again to go on).
    const toEdge = p.direction > 0 ? limits.high - EDGE_MARGIN_MM - pos : pos - (limits.low + EDGE_MARGIN_MM);
    const room = Math.floor(Math.min(toEdge, env.travel - EDGE_MARGIN_MM, p.feed * MAX_JOG_MS / 60000) * 1000) / 1000;
    if (!(room >= MIN_CONTINUOUS_MM) && ambiguous) {
      throw refusal(ambiguous, 'ETOUCH_MOTION_AMBIGUOUS', { axis: p.axis });
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
      deadline: clock() + KEEPALIVE_TIMEOUT_MS,
      until: clock() + Math.min(MAX_JOG_MS, 60000 * room / p.feed) + SESSION_MARGIN_MS,
      ref: { hints: r.spinHints }
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
    return !!(s.session || s.frame || (s.pending && s.pending.kind === 'jog' && !settle(c, r)));
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
    return op === 'jog' ? step(c, r, body, actor) : start(c, r, body, actor);
  };

  // Laser framing (PROFILES-CONTRACT §4): `M5`, then bounded absolute jogs
  // (`$J=G90 G21 X… Y… F…`) around the program's XY box at the current Z,
  // one line at a time: the next one leaves once the previous one is answered
  // and the machine is seen at rest after it (settle). Stop, Pause, jog stop,
  // the owner's stream closing, a takeover, a stale report, an alarm or the
  // function disabled cancel it (0x85) like a continuous jog. It never sends
  // M3, M4 or S: the caller builds the lines (job-service.js) and this
  // function refuses any other line.
  const FRAME_LINE = /^(M5|\$J=G90 G21 X-?\d+(\.\d+)? Y-?\d+(\.\d+)? F\d+(\.\d+)?)$/;

  const endFrame = (c, r, session, result, why) => {
    const s = stateOf(r);
    if (s.frame !== session) {
      return;
    }
    s.frame = null;
    const cnc = session.kind === 'cnc';
    let message = STOP_REASONS[why] || why || result;
    if (session.code) {
      message = FRAME_MESSAGES[session.code](session.params);
    } else if (result === 'ended') {
      message = cnc ? 'cadrage terminé, fraise restée en haut' : 'contour terminé';
    }
    s.lastFrame = { result, reason: why || '', message, sent: session.index, total: session.lines.length, at: Date.now() };
    if (cnc || session.code) {
      Object.assign(s.lastFrame, {
        kind: session.kind,
        code: session.code || null,
        params: session.params || null,
        revision: session.revision === undefined ? null : session.revision
      });
    }
    log({
      event: 'frame',
      result,
      reason: why || '',
      controller: controllerInfo(c, r),
      lines: session.lines,
      sent: session.index,
      bounds: session.bounds,
      feed: session.feed,
      ...(cnc ? { kind: 'cnc', code: session.code || null, safeZ: session.safeZ || null } : {}),
      // Lot C1 (§ 6): reports since the banner (all, without X/Y/Z, without a whole FS:), and how
      // long each line after the first waited for its proofs (ms).
      reports: { ...r.seenCounts },
      waits: session.waits.slice(),
      startedAt: new Date(session.since).toISOString(),
      durationMs: Date.now() - session.since,
      actor: session.actor
    });
    changed();
  };

  const frameStopReason = (c, r, session) => {
    if (!motionEnabled(config)) {
      return 'disabled';
    }
    if (!transports.has(session.transportId)) {
      return 'transport';
    }
    const owner = control.inspect(c.options.port).owner;
    if (owner && keyOf(owner) !== session.actorKey) {
      return 'control';
    }
    if (!fresh(r) || !proof.posYoung(r)) {
      return 'stale';
    }
    if (/^Alarm/.test(activeOf(c))) {
      return 'alarm';
    }
    // Lot C1: from the proof of its M5 on (a laser at rest in M4 is no sign before it).
    if (session.ref && proof.spindleWatch(r, session.ref)) {
      return 'spindleProof';
    }
    return '';
  };

  // A stream of the device that started the CNC framing is open.
  const deviceStreamOpen = (session) => Array.from(transports).some((id) => keyOf(transportActors.get(id)) === session.deviceKey);

  // What stops a CNC framing now (§ 5.2, S3 to S8), in this order, as [why, code, params]; null
  // when nothing does. The stream lost within its grace stops nothing yet (no line leaves then).
  const cncStop = (c, r, session) => {
    if (!motionEnabled(config)) {
      return ['disabled', 'ETOUCH_FRAME_STATE', { state: 'disabled' }];
    }
    if (deviceStreamOpen(session)) {
      session.lostSince = null;
    } else if (session.lostSince === null) {
      session.lostSince = clock();
    }
    if (session.lostSince !== null && clock() - session.lostSince >= FRAME_STREAM_GRACE_MS) {
      return ['transport', 'ETOUCH_FRAME_STREAM', {}];
    }
    if (keyOf(control.inspect(c.options.port).owner) !== session.ownerKey) {
      return ['control', 'ETOUCH_FRAME_CONTROL', {}];
    }
    // Lot C1: a position reported itself less than 2.5 s ago, in Jog too.
    if (!fresh(r) || !proof.posYoung(r)) {
      return ['stale', 'ETOUCH_FRAME_STALE', {}];
    }
    const state = activeOf(c);
    if (/^Alarm/.test(state) || r.lastAlarm !== session.lastAlarm) {
      return ['alarm', 'ETOUCH_FRAME_ALARM', { alarm: r.alarm || null }];
    }
    let cause = '';
    const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
    const sender = (c.sender && c.sender.state) || {};
    if (r.homed !== true) {
      cause = 'reference';
    } else if (r.offset.proof() !== session.proof) {
      cause = 'offset';
    } else if (!r.job || r.job.revision !== session.revision || !sender.context || sender.context.touchJob !== session.revision) {
      // The program framed is no longer the one loaded (an upload of CNCjs, review C3).
      cause = 'program';
    } else if (!c.workflow || c.workflow.state !== 'idle') {
      cause = 'job';
    } else if (feeder.queue || feeder.pending) {
      cause = 'queue';
    } else if (hasAutomations(config)) {
      // Checked at the start (jogReady), configured meanwhile (second review, family 3).
      cause = 'automations';
    } else if (JSON.stringify(allSettings(c)) !== session.settings) {
      // The travel, the feeds, $13, $20 the plan was made with (second review, family 3).
      cause = 'settings';
    } else if (r.wcs !== session.wcs || offsetOff(r, session)) {
      // The work coordinate system and the work offset the X/Y targets are written in, compared
      // directly, whatever the D2 proof says (second review, family 3).
      cause = 'offset';
    } else if (spindleOn(c) || proof.spindleWatch(r, session.ref)) {
      // The whole guard of the start (review C2): a speed reported above 0, or without a speed
      // a $G naming M3/M4, or no $G recent enough to tell. Lot C1: and any sign of a running
      // spindle since the start, or no whole FS: for 2.5 s.
      cause = 'spindle';
    } else if (state !== 'Idle' && state !== 'Jog') {
      cause = state || 'inconnu';
    }
    return cause ? ['state', 'ETOUCH_FRAME_STATE', { state: cause }] : null;
  };

  // The work offset in X and Y (MPos − WPos of the last report itself) differs from the one of the
  // plan. Lot C1: judged only when that report carries the position; a position that is missing is
  // no difference seen (the watch of its age, and the wait before each line, deal with it).
  const offsetOff = (r, session) => ['X', 'Y'].some((axis) => {
    const m = proof.posOf(r, 'm', axis);
    const w = proof.posOf(r, 'w', axis);
    return m !== null && w !== null && Math.abs(m - w - session.offset[axis.toLowerCase()]) > FRAME_ARRIVAL_MM;
  });

  // A framing whose board restarted ends here, without a byte: not even a jog cancel goes to the
  // new session (D-06). True when it did.
  const frameRestarted = (c, r, session) => {
    if (!session || r.startups === session.startups) {
      return false;
    }
    session.code = 'ETOUCH_FRAME_RESTART';
    session.params = {};
    endFrame(c, r, session, 'cancelled', 'restart');
    return true;
  };

  // The banner of the board (job-service r.reset): the framing ends in that very step, before any
  // other path (a lease change, a stream closing, Arrêter) could write to the new session (C1).
  const restarted = (c, r) => frameRestarted(c, r, r.motion && r.motion.frame);

  // Ends a CNC framing in this very step (no line after it), then cancels the jog (0x85).
  const abortFrame = (c, r, session, result, why, code, params) => {
    if (frameRestarted(c, r, session)) {
      return;
    }
    session.code = code;
    session.params = params;
    endFrame(c, r, session, result, why);
    cancel(c, r, why, session);
  };

  // Why the next line of a CNC framing may not leave now, checked right before each line and at
  // every step while one waits (review D2, D3): an earlier arrival is no leave to send. Nothing of
  // ours or anyone else's pending, the machine Idle, still where the last line put it (M5: where
  // the plan was made), and before an X/Y line Z at the safe height. [why, code, params, off] or null.
  // Lot C1: `{ wait }` while a proof is missing ('stale': no proven rest after the ok of the last
  // line; 'spindle': no FS: at 0 in the last report, or no recent $G naming M5 after that ok): the
  // line waits, nothing stops yet. The position and the height are read from the report itself.
  const holdReason = (c, r, session) => {
    const s = stateOf(r);
    if (s.pending || s.session || s.cancel) {
      return ['state', 'ETOUCH_FRAME_STATE', { state: 'foreign' }];
    }
    const state = activeOf(c);
    if (state !== 'Idle') {
      return ['state', 'ETOUCH_FRAME_STATE', { state: state || 'inconnu' }];
    }
    // The whole guard of the start, run again as it is, other than the framing itself (second
    // review, family 3): whatever it checks, now or later, is true right before each line.
    try {
      jogReady(c, r, session);
    } catch (_) {
      return ['state', 'ETOUCH_FRAME_STATE', { state: 'busy' }];
    }
    const sent = session.pending.t;
    if (!proof.restedSince(r, sent.reportsAtOk)) {
      return { wait: 'stale' };
    }
    const off = arrivalOff(r, session, session.index - 1);
    if (off) {
      return ['position', 'ETOUCH_FRAME_POSITION', off, true];
    }
    const next = session.lines[session.index];
    if (next !== undefined && CNC_XY_LINE.test(next)) {
      const z = proof.posOf(r, 'm', 'Z');
      const safe = session.safeZ.machine;
      if (z === null || z < safe - FRAME_ARRIVAL_MM) {
        return ['position', 'ETOUCH_FRAME_POSITION', { axis: 'Z', expected: fmt(safe), reported: z === null ? 'inconnu' : fmt(z) }, true];
      }
    }
    return proof.spindleHeld(r, { gcAtOk: sent.gcAtOk }) ? null : { wait: 'spindle' };
  };

  // A proof waited for between two lines is late: PROOF_WAIT_MS after the line was seen over, or the
  // own time limit of that line, whichever comes first.
  // After the reviews: the wait is counted from the moment a proof was first found missing, not from
  // the end of the line: a stream away for a while with every proof there starts no wait.
  const proofLate = (session) => {
    if (session.missingSince === null) {
      session.missingSince = clock();
    }
    return clock() - session.missingSince > PROOF_WAIT_MS || clock() - session.pending.sentAt > session.pending.limitMs;
  };

  // Where the machine stands after a CNC framing line against where it was sent (§ 5.3): null
  // when it arrived, else the first axis off with its expected and reported machine positions.
  const arrivalOff = (r, session, i) => {
    const target = session.expect[i];
    if (!target) {
      return null;
    }
    const off = (axis, expected, reported) => ({ axis, expected: fmt(expected), reported: reported === null ? 'inconnu' : fmt(reported) });
    for (const axis of AXES) {
      const want = target[axis.toLowerCase()];
      const got = proof.posOf(r, 'm', axis);
      if (want !== undefined && (got === null || Math.abs(got - want) > FRAME_ARRIVAL_MM)) {
        return off(axis, want, got);
      }
    }
    const z = proof.posOf(r, 'm', 'Z');
    if (session.zFloor !== null && (z === null || z < session.zFloor - FRAME_ARRIVAL_MM)) {
      return off('Z', session.zFloor, z);
    }
    return null;
  };

  // A CNC framing in progress is checked now, in the same step as a change of the lease (C-12).
  // True when this ended it (its jog cancel is written).
  const supervise = (c, r) => {
    const session = r.motion && r.motion.frame;
    if (!session || session.kind !== 'cnc' || !connected(c)) {
      return false;
    }
    const stop = cncStop(c, r, session);
    if (stop) {
      abortFrame(c, r, session, 'cancelled', stop[0], stop[1], stop[2]);
    }
    return !!stop;
  };

  // plan: { lines, limits (ms per line), bounds, feed }, checked by the caller; a CNC plan
  // (kind 'cnc') adds phases, sides, expect (machine position after each line), revision, safeZ.
  const frame = (c, r, plan, actor, transportId) => {
    moveReady(c, r);
    const cnc = !!plan && plan.kind === 'cnc';
    const shaped = (list) => Array.isArray(list) && list.length === plan.lines.length;
    if (!plan || !Array.isArray(plan.lines) || !plan.lines.length || plan.lines[0] !== 'M5' || !shaped(plan.limits) ||
        (cnc ? !cncFrameLinesValid(plan.lines) || !shaped(plan.expect) || !shaped(plan.phases) || !plan.offset ||
          !Number.isFinite(plan.offset.x) || !Number.isFinite(plan.offset.y) : plan.lines.some((line) => !FRAME_LINE.test(line)))) {
      throw conflict('Cadrage invalide.');
    }
    const s = stateOf(r);
    const session = {
      id: crypto.randomBytes(12).toString('hex'),
      kind: cnc ? 'cnc' : 'laser',
      lines: plan.lines.slice(),
      limits: plan.limits.slice(),
      index: 0,
      bounds: plan.bounds,
      feed: plan.feed,
      transportId,
      actorKey: keyOf(actor),
      actor: actor ? { kind: actor.kind, id: actor.id, label: actor.label || '', user: actor.user || '' } : null,
      owner: actor ? { kind: actor.kind, id: actor.id, label: actor.label || '' } : null,
      since: Date.now(),
      // A banner after this ends the sequence without a byte more (both kinds, P3).
      startups: r.startups,
      // Lot C1: when the line sent last was seen over (null while it runs), the wait of each line
      // after the first, and what the spindle watch compares with (a laser: from the proof of its M5).
      settledAt: null,
      missingSince: null,
      waits: [],
      ref: cnc ? { hints: r.spinHints } : null
    };
    if (cnc) {
      const owner = keyOf(control.inspect(c.options.port).owner);
      Object.assign(session, {
        phases: plan.phases.slice(),
        sides: plan.sides,
        expect: plan.expect.slice(),
        revision: plan.revision,
        safeZ: plan.safeZ,
        // Bound to the device whose stream confirmed it, and to the lease as it is now: a free
        // port is claimed by this touch client once the framing has started (action(), job-service).
        deviceKey: keyOf(transportActors.get(transportId)),
        ownerKey: owner || (actor && actor.kind === 'touch' ? keyOf(actor) : ''),
        proof: r.offset.proof(),
        // What the plan was made with, compared at every step (second review, family 3): the
        // board settings CNCjs has, the work coordinate system of the last $G, the work offset in X/Y.
        settings: JSON.stringify(allSettings(c)),
        wcs: r.wcs,
        offset: { x: plan.offset.x, y: plan.offset.y },
        lastAlarm: r.lastAlarm,
        lostSince: null,
        verified: 0,
        zFloor: null,
        code: null,
        params: null
      });
    }
    const sendNext = () => {
      const i = session.index;
      if (session.settledAt !== null) {
        session.waits.push(Math.round(clock() - session.settledAt));
      }
      session.settledAt = null;
      session.missingSince = null;
      session.index += 1;
      session.pending = send(c, r, /^\$J=/.test(session.lines[i]) ? 'jog' : 'frame', session.lines[i], session.limits[i]);
      // A line of a framing: after a banner, nothing automatic is written for it (cancel, forget).
      session.pending.framed = true;
    };
    // One supervision step of a CNC framing (§ 5.2): every stop condition first, then the line sent
    // last until it is answered, at rest and arrived, then the next one, only with a stream open.
    const cncStep = (check) => {
      const stop = cncStop(c, r, session);
      if (stop) {
        abortFrame(c, r, session, 'cancelled', stop[0], stop[1], stop[2]);
        return;
      }
      const p = session.pending;
      // The answer it waits for is its own: no other line took its place (review D1).
      if (s.pending && s.pending !== p) {
        abortFrame(c, r, session, 'cancelled', 'state', 'ETOUCH_FRAME_STATE', { state: 'foreign' });
        return;
      }
      if (session.verified < session.index) {
        if (p.t.error) {
          // error:15 is a target refused by the board's soft limits: the zero it applies is doubtful.
          if (p.t.error === 15) {
            r.offset.invalidate('frame');
          }
          abortFrame(c, r, session, 'refused', 'error:' + p.t.error, 'ETOUCH_FRAME_REFUSED', { n: p.t.error });
          return;
        }
        if (clock() - p.sentAt > p.limitMs) {
          abortFrame(c, r, session, 'cancelled', 'timeout', 'ETOUCH_FRAME_TIMEOUT', {});
          return;
        }
        if (!settle(c, r)) {
          later(c, r, check, WATCH_MS);
          return;
        }
        // Let go without its ok (link trouble, a line dropped): nothing proves where it went.
        if (p.t.oks < 1) {
          abortFrame(c, r, session, 'cancelled', 'timeout', 'ETOUCH_FRAME_TIMEOUT', {});
          return;
        }
        const state = activeOf(c);
        if (state !== 'Idle') {
          abortFrame(c, r, session, 'cancelled', 'state', 'ETOUCH_FRAME_STATE', { state: state || 'inconnu' });
          return;
        }
        if (session.settledAt === null) {
          session.settledAt = clock();
        }
        // Lot C1: the arrival is judged on a proven rest only, two reports after the ok that carry the
        // position, Idle and agreeing. Until then nothing leaves; a position that stays missing ends
        // the framing as stale reports do, without doubting the work offset (D2).
        if (!proof.restedSince(r, p.t.reportsAtOk)) {
          if (proofLate(session)) {
            abortFrame(c, r, session, 'cancelled', 'stale', 'ETOUCH_FRAME_STALE', {});
            return;
          }
          later(c, r, check, WATCH_MS);
          return;
        }
        const off = arrivalOff(r, session, session.index - 1);
        if (off) {
          // The board does not put the bit where the check placed it: the zero is doubtful (D2).
          r.offset.invalidate('frame');
          abortFrame(c, r, session, 'cancelled', 'position', 'ETOUCH_FRAME_POSITION', off);
          return;
        }
        session.verified = session.index;
        if (session.index >= session.lines.length) {
          endFrame(c, r, session, 'ended', '');
          return;
        }
        changed();
      }
      // The arrival validated above, or at an earlier step, is no leave to send: the conditions
      // are checked again now, at every step while the next line waits and right before it leaves.
      const hold = holdReason(c, r, session);
      if (hold && hold.wait) {
        if (proofLate(session)) {
          if (hold.wait === 'spindle') {
            abortFrame(c, r, session, 'cancelled', 'state', 'ETOUCH_FRAME_STATE', { state: 'spindle' });
          } else {
            abortFrame(c, r, session, 'cancelled', 'stale', 'ETOUCH_FRAME_STALE', {});
          }
          return;
        }
        later(c, r, check, WATCH_MS);
        return;
      }
      if (hold) {
        if (hold[3]) {
          // The machine is not where the framing put it: the zero is doubtful (D2).
          r.offset.invalidate('frame');
        }
        abortFrame(c, r, session, 'cancelled', hold[0], hold[1], hold[2]);
        return;
      }
      // Every proof is there: no wait is running.
      session.missingSince = null;
      // Nothing leaves while the device's stream is away (a rotation, within its grace).
      if (session.lostSince === null) {
        // The height before the first X/Y line (the safe height or above, just checked): Z never
        // goes below it afterwards.
        if (session.zFloor === null && CNC_XY_LINE.test(session.lines[session.index])) {
          session.zFloor = proof.posOf(r, 'm', 'Z');
        }
        sendNext();
      }
      later(c, r, check, WATCH_MS);
    };
    s.frame = session;
    sendNext();
    const check = () => {
      if (s.frame !== session) {
        return;
      }
      if (!connected(c)) {
        endFrame(c, r, session, 'lost', 'connection');
        return;
      }
      // The board restarted: it dropped what it had, and nothing more is written to the new
      // session, not even a jog cancel (D-06).
      if (frameRestarted(c, r, session)) {
        return;
      }
      if (cnc) {
        cncStep(check);
        return;
      }
      const why = frameStopReason(c, r, session);
      if (why) {
        cancel(c, r, why);
        return;
      }
      const p = s.pending;
      const error = p && p.t.error;
      if (settle(c, r)) {
        if (error) {
          endFrame(c, r, session, 'refused', 'error:' + error);
          return;
        }
        if (session.index >= session.lines.length) {
          endFrame(c, r, session, 'ended', '');
          return;
        }
        if (activeOf(c) !== 'Idle') {
          cancel(c, r, 'state');
          return;
        }
        if (session.settledAt === null) {
          session.settledAt = clock();
        }
        // Lot C1: the next line leaves from a proven rest after the ok of the last one, the spindle
        // proven stopped after that ok; a proof that stays missing cancels the framing.
        const sent = session.pending.t;
        const rested = proof.restedSince(r, sent.reportsAtOk);
        if (!rested || !proof.spindleHeld(r, { gcAtOk: sent.gcAtOk })) {
          if (proofLate(session)) {
            cancel(c, r, rested ? 'spindleProof' : 'stale');
            return;
          }
          later(c, r, check, WATCH_MS);
          return;
        }
        if (!session.ref) {
          session.ref = { hints: r.spinHints };
        }
        sendNext();
      }
      later(c, r, check, WATCH_MS);
    };
    later(c, r, check, WATCH_MS);
    return {
      frameId: session.id,
      lines: session.lines.slice(),
      message: cnc ? 'Cadrage à vide lancé : M5, montée de Z, puis tour du programme. Arrêt : bouton Arrêter.'
        : 'Cadrage laser lancé : M5 puis contour du programme, sans émission. Arrêt : bouton Arrêter.'
    };
  };

  // Work origin: the confirmed operation registered with the commissioning ones.
  const originReady = (c) => {
    const r = record(c);
    gate(c, r, 'setOrigin');
    atRest(c, r);
    // C-18: a zero set before the homing ($22=1) would be wrong after it.
    if (referenceReady) {
      referenceReady(c);
    }
    if (!modalWcs(r) || !WCS_P[modalWcs(r)]) {
      throw conflict('Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.');
    }
  };

  const originParams = (body) => {
    const axes = body && body.axes;
    const at = body.at === undefined ? 'here' : body.at;
    if (at !== 'here' && at !== 'machine') {
      throw conflict('Action invalide.');
    }
    if (!Array.isArray(axes) || !axes.length || axes.length > AXES.length ||
        axes.some((axis) => !AXES.includes(axis)) || new Set(axes).size !== axes.length) {
      throw conflict('Axes invalides : choisissez X, Y et/ou Z.');
    }
    return { axes: AXES.filter((axis) => axes.includes(axis)), at };
  };

  const machineOriginReady = (c, params) => {
    if (params.at !== 'machine') {
      return;
    }
    const r = record(c);
    if (!r.homed) {
      throw refusal('Machine non référencée : faites la prise d’origine avant de poser une origine.', 'ETOUCH_ORIGIN_NOT_HOMED', {});
    }
    offsetReady(c);
    const offsets = (c.settings && c.settings.parameters) || {};
    const g92 = offsets.G92 || {};
    if (params.axes.some((axis) => number(g92[axis.toLowerCase()]) !== 0) || (params.axes.includes('Z') && number(offsets.TLO) !== 0)) {
      throw refusal('Zéro à l’origine machine refusé : annulez les décalages temporaires et le décalage d’outil sur les axes choisis.', 'ETOUCH_ORIGIN_OFFSETS', {});
    }
  };

  // After the guard: the offset and the position the confirmation shows.
  const originBind = (c, params) => {
    machineOriginReady(c, params);
    const r = record(c);
    const wcs = modalWcs(r);
    const machine = {};
    (params.at === 'machine' ? AXES : params.axes).forEach((axis) => {
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
    machineOriginReady(c, t.params);
    const { axes, wcs, p, machine, at } = t.params;
    const now = modalWcs(r);
    if (now !== wcs) {
      throw refusal('Le repère actif a changé depuis la confirmation (' + wcs + ' → ' + (now || 'inconnu') + ') : confirmez à nouveau.',
        'ETOUCH_MOTION_WCS_CHANGED',
        { from: wcs, to: now || 'inconnu' });
    }
    if (Object.keys(machine).some((axis) => positionOf(c, 'mpos', axis) === null || Math.abs(positionOf(c, 'mpos', axis) - machine[axis]) > ORIGIN_MOVED_MM)) {
      throw conflict('La machine a bougé depuis la confirmation : confirmez à nouveau à la position actuelle.');
    }
    const line = originLine(p, axes, at);
    const s = stateOf(r);
    const pending = send(c, r, 'origin', line, at === 'machine' ? 5000 : ORIGIN_LIMIT_MS);
    r.originChecking = at === 'machine';
    const entry = { event: 'origin', controller: controllerInfo(c, r), wcs, axes, machine, at, command: line, actor: actor || null };
    return new Promise((resolve, reject) => {
      const fail = (message) => {
        r.originChecking = false;
        if (at === 'machine') {
          pending.t.done();
          if (s.pending === pending) {
            s.pending = null;
          }
        }
        // The G10 may have been written: the offset is proven anew (D2).
        r.offset.invalidate('zero');
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
        const settled = s.pending !== pending || settle(c, r);
        const provenReport = at !== 'machine' || (pending.t.oks >= 1 && r.wco && r.wco.report > pending.t.reportsAtOk);
        if (at === 'machine' && (r.startups !== pending.startups || !r.homed || activeOf(c) !== 'Idle' || modalWcs(r) !== wcs)) {
          fail('Définition d’origine sans réponse à temps : vérifiez la machine et le repère.');
          return;
        }
        if (settled && (error || provenReport)) {
          if (error) {
            fail('Grbl a refusé la définition d’origine (error:' + error + ').');
            return;
          }
          // G10 L20 changes an offset, never the machine position: a firmware
          // (or simulator) that took the line for a move must not pass the check below.
          const moved = Object.keys(machine).filter((axis) => {
            const m = positionOf(c, 'mpos', axis);
            return m === null || Math.abs(m - machine[axis]) > ORIGIN_MOVED_MM;
          });
          if (moved.length) {
            fail('La machine a bougé pendant la définition d’origine (' + moved.map((axis) => axis + ' ' + positionOf(c, 'mpos', axis)).join(', ') + ') : arrêtez et vérifiez le contrôleur.');
            return;
          }
          const off = axes.filter((axis) => {
            const w = positionOf(c, 'wpos', axis);
            const expected = at === 'machine' ? positionOf(c, 'mpos', axis) : 0;
            return w === null || expected === null || Math.abs(w - expected) > ORIGIN_TOLERANCE ||
              (at === 'machine' && Math.abs(r.wco[axis.toLowerCase()]) > ORIGIN_TOLERANCE);
          });
          if (off.length) {
            fail(at === 'machine' ? 'Le zéro à l’origine machine n’a pas été confirmé : vérifiez le repère.'
              : 'Le repère n’a pas pris la valeur attendue (' + off.map((axis) => axis + ' ' + positionOf(c, 'wpos', axis)).join(', ') + ' au lieu de 0).');
            return;
          }
          s.lastOrigin = { at: Date.now(), wcs, axes, machine };
          r.originChecking = false;
          // The G10 loads the offset again: it is proven anew (D2).
          r.offset.invalidate('zero');
          log({ ...entry, result: 'set' });
          changed();
          if (at === 'machine') {
            resolve({ message: 'Zéro réglé à l’origine machine, sans mouvement.', command: line });
            return;
          }
          resolve({ message: 'Origine ' + axes.join(' ') + ' du repère ' + wcs +
            ' réglée à la position actuelle (' + line + ').' });
          return;
        }
        if (clock() - pending.sentAt > pending.limitMs) {
          fail('Définition d’origine sans réponse à temps : vérifiez la machine et le repère.');
          return;
        }
        later(c, r, check, 100, () => {
          r.originChecking = false;
          reject(conflict('Définition d’origine abandonnée (service arrêté ou contrôleur retiré) : vérifiez le repère.'));
        });
      };
      check();
    });
  };

  const originOperation = {
    guard: originReady,
    params: originParams,
    bind: originBind,
    name: (c, params) => 'Origine ' + params.axes.join(' ') + ' du repère ' + params.wcs +
      (params.at === 'machine' ? ' à l’origine machine (' : ' à la position actuelle (') + originLine(params.p, params.axes, params.at) + ')',
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

  // CNC framing: its kind, the phase of the line in progress, the side it runs (or null) and the
  // number of sides of its plan. A laser framing says its kind only.
  const frameProgress = (session) => {
    if (session.kind !== 'cnc') {
      return { kind: session.kind };
    }
    const done = session.phases.slice(0, session.index);
    const phase = done.length ? done[done.length - 1] : null;
    return { kind: 'cnc', phase, side: phase === 'side' ? done.filter((p) => p === 'side').length : null, sides: session.sides };
  };

  // What every snapshot shows: capabilities and what is possible right now.
  const snapshot = (c, r) => {
    const s = stateOf(r);
    const jogReason = reason(() => moveReady(c, r));
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
        lastOrigin: s.lastOrigin ? { ...s.lastOrigin } : null,
        // Laser framing in progress (contract §4) and the last one; a CNC framing (lot F1) says its
        // kind, the phase of the line in progress and the side it runs.
        frame: s.frame ? { lines: s.frame.lines.slice(), index: s.frame.index, since: s.frame.since, owner: s.frame.owner, ...frameProgress(s.frame) } : null,
        lastFrame: s.lastFrame ? { ...s.lastFrame } : null
      }
    };
  };

  // Change detection for the stream (see job-service fingerprint()).
  const signature = (r) => {
    const s = r.motion;
    return s ? [s.session && s.session.id, s.pending && s.pending.sentAt, s.cancel && s.cancel.since, s.cancel && s.cancel.unconfirmed,
      s.lastJog && s.lastJog.at, s.lastOrigin && s.lastOrigin.at, s.frame && s.frame.id, s.frame && s.frame.index, s.lastFrame && s.lastFrame.at].join('/') : '';
  };

  // The owner's event stream closed: its continuous jog stops at once. A CNC framing (lot F1) is
  // bound to its device: it stops at once when the last stream of that device really closes; a
  // rotation (`rotated`) leaves it its grace, during which no line leaves (see cncStop).
  const transportClosed = (c, r, id, rotated = false) => {
    const s = r.motion;
    if (!s) {
      return;
    }
    // A framing of a board session that ended writes nothing (review C1).
    frameRestarted(c, r, s.frame);
    const cncFrame = s.frame && s.frame.kind === 'cnc' ? s.frame : null;
    if (cncFrame && !rotated && !deviceStreamOpen(cncFrame) && connected(c)) {
      abortFrame(c, r, cncFrame, 'cancelled', 'transport', 'ETOUCH_FRAME_STREAM', {});
    }
    if (s.session && s.session.transportId === id) {
      cancel(c, r, 'transport');
    } else if (s.frame && !cncFrame && s.frame.transportId === id) {
      cancel(c, r, 'transport');
    }
  };

  // A continuous jog, a step or a CNC framing in progress keeps its stream from being rotated (see touch-stream).
  const holds = (id) => (r) => !!(r.motion && ((r.motion.session && r.motion.session.transportId === id) ||
    (r.motion.pending && r.motion.pending.kind === 'jog' && r.motion.pending.transportId === id) ||
    (r.motion.frame && r.motion.frame.kind === 'cnc' && r.motion.frame.transportId === id)));

  // A framing (laser or CNC) runs on this controller.
  const framing = (r) => !!(r.motion && r.motion.frame);

  // The controller record is dropped (port closed, or the service disposed):
  // its answer listeners go with it. A jog of ours on a controller still
  // open gets one 0x85 (no timer is left behind to repeat it). Lot F1 (third review): a framing's
  // line or cancel of a board session a banner ended counts for nothing (D-06).
  const forget = (c, r) => {
    const s = r.motion;
    if (!s) {
      return;
    }
    const ended = (move) => (move === s.frame || move.framed) && move.startups !== r.startups;
    const live = [s.session, s.frame, s.cancel, s.pending && s.pending.kind === 'jog' ? s.pending : null].filter((move) => move && !ended(move));
    if (live.length && connected(c)) {
      c.command('jogCancel');
    }
    if (s.session) {
      endSession(c, r, s.session, 'cancelled', 'dispose', STOP_REASONS.dispose);
    }
    if (s.frame) {
      endFrame(c, r, s.frame, 'cancelled', 'dispose');
    }
    if (s.pending) {
      s.pending.t.done();
      s.pending = null;
    }
    s.cancel = null;
  };

  // Real moves enabled for this controller (laser framing capability).
  const enabled = (c, r) => capabilities(c, r).jog.enabled;

  // Only the lines of a framing ended at a banner of the board are left: nothing is written for them
  // to the new session of the board (review C1), not even by « Rendre la main » (lot F4).
  const bannerLeftover = (r) => {
    const s = stateOf(r);
    const left = [s.session, s.frame, s.pending, s.cancel].filter(Boolean);
    return left.length > 0 && left.every((move) => move.framed && move.startups !== r.startups);
  };

  // The framing in progress (lot F1): whether one runs, its supervision now, its end at a banner.
  const framingApi = { framing, supervise, restarted, bannerLeftover, moveReady };
  return {
    perform, precheck, stop, moving, originOperation, snapshot, signature, transportClosed, holds, forget, jogReady, bound, frame, enabled, ...framingApi
  };
};

export default { createMotion, capabilitiesOf, envelopeOf, limitsAt, usableOf, maxFeedOf, grblVersion, jogLine, originLine, motionEnabled };
