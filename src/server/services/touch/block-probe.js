// Real probing at the corner block (Z, X, Y or XYZ) for the touch job service:
// the guard, the server bounds of the parameters, the plan bound to the start
// position, and the supervised sequence. The work origin is written once, at
// the end of a complete success (G10 L20 on the active offset), never before.
// See job-service.js (COMMISSIONING.blockProbe) and plate-probe.js (answers, quiet).
//
// Every touch and every move towards a place the tool has not been through yet
// is a G38.3 (no alarm without contact: PRB:…:0), confirmed by exactly one PRB
// event of its own line. Retracts (along the path just travelled) and lifts
// are G53 G1 at a bounded feed, to the machine target checked against the
// travel. One line in flight at a time; a supervisor stops the machine (feed
// hold, then reset once at rest, halt.js) on Stop, Pause, spindle stop, the
// tablet's stream closed (at once; a rotation of the stream by the server gets
// STREAM_GRACE_MS to reopen, and no line leaves meanwhile), control taken,
// stale reports, the global time limit; a board restart or an alarm ends it at
// once, without any further line. Every line is sent only once the same checks
// pass at that very moment (ensure), not only at the supervisor's next tick.
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
import crypto from 'crypto';
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';
// eslint-disable-next-line import/extensions
import { envelopeOf, limitsAt, maxFeedOf, capabilitiesOf, motionEnabled, EDGE_MARGIN_MM } from './motion.js';

const AXES = ['X', 'Y', 'Z'];
const WCS_P = { G54: 1, G55: 2, G56: 3, G57: 4, G58: 5, G59: 6 };
// Corner of the block → sign of its X and Y sides (outside approach: dA = −cA).
const CORNERS = { '--': [-1, -1], '+-': [1, -1], '-+': [-1, 1], '++': [1, 1] };

// Geometry and checks (mm): lateral margin, overshoot of the slow touch beyond
// the fast contact, largest start window, smallest back-off, position tolerance,
// largest gap between fast and slow contacts, largest rest beyond a contact.
const MARGIN = 1;
const OVER = 1;
const W_MAX = 28;
const MIN_BACKOFF = 0.2;
const POS_TOL = 0.01;
const TOUCH_AGREE = 0.3;
const OVERSHOOT_MAX = 0.5;
// Linking feeds (mm/min), bounded by $110-$112.
const TRAVEL_XY = 600;
const TRAVEL_Z = 500;
// Duration estimate: seconds per line, longest accepted plan, global limit.
const LINE_S = 0.75;
const MAX_SECONDS = 180;
const MAX_CYCLE_MS = 240000;
// Supervision (ms).
const TEST_MAX_AGE_MS = 600000;
const STREAM_GRACE_MS = 3000;
const STALE_MS = 2500;
const SUPERVISE_MS = 100;
const RELEASE_MS = 7000;
const PRB_WAIT_MS = 1000;
const LINE_MARGIN_MS = 15000;

// Server bounds of the profile, independent of the page's form.
const LIMITS = {
  thickness: [0.5, 50],
  diameter: [0.5, 25],
  faceX: [-30, 30],
  faceY: [-30, 30],
  fast: [10, 200],
  slow: [5, 50],
  search: [1, 30],
  retract: [0.5, 5],
  clearance: [2, 20]
};

export const MESSAGES = {
  ETOUCH_PROBE_NO_CONTACT: 'Aucun contact en {axis} sur {search} mm : rapprochez l’outil et vérifiez la pince.',
  ETOUCH_PROBE_CONTACT_AT_START: 'La sonde est en contact avant la touche {axis} : dégagez l’outil et vérifiez la pince.',
  ETOUCH_PROBE_STUCK: 'La sonde reste en contact après le retrait de {retract} mm en {axis}.',
  ETOUCH_PROBE_DESCENT_CONTACT: 'Contact pendant la descente à côté de la face {axis} : l’outil n’était pas dans la zone de départ au-dessus du coin du bloc.',
  ETOUCH_PROBE_TRAVERSE_CONTACT: 'Contact pendant un déplacement de liaison : un obstacle se trouve sur le trajet, ou l’outil n’était pas au-dessus du bloc au départ.',
  ETOUCH_PROBE_MISMATCH: 'Les deux touches {axis} diffèrent de {delta} mm : mesure rejetée.',
  ETOUCH_PROBE_PRB: 'Contact {axis} non confirmé par la carte (rapport PRB absent ou incohérent).',
  ETOUCH_PROBE_START_CLOSE: 'Départ à moins de 0,2 mm de la surface en {axis} : reculez l’outil.',
  ETOUCH_PROBE_POSITION: 'Position {axis} inattendue après un déplacement : palpage arrêté.',
  ETOUCH_PROBE_WINDOW: 'Palpage XYZ : la face {axis} touchée n’est pas là où le départ la place (centre de l’outil au-dessus du bloc, à {window} mm au plus du bord). Paroi du trou ou mauvais coin : placez l’outil au-dessus du coin extérieur, loin du trou.',
  ETOUCH_PROBE_ALARM: 'Alarme {alarm} pendant le palpage.',
  ETOUCH_PROBE_ERROR: 'Grbl a refusé une ligne du palpage (error:{error}).',
  ETOUCH_PROBE_STOPPED: 'Palpage interrompu par Arrêter.',
  ETOUCH_PROBE_PAUSED: 'Palpage interrompu par Pause : un palpage ne se reprend pas.',
  ETOUCH_PROBE_STREAM: 'Suivi de la tablette perdu pendant le palpage : mouvement arrêté.',
  ETOUCH_PROBE_CONTROL: 'Pilotage pris par un autre appareil : palpage arrêté.',
  ETOUCH_PROBE_STALE: 'Rapports de la machine interrompus plus de 2,5 s : palpage arrêté.',
  ETOUCH_PROBE_TIMEOUT: 'Durée maximale du palpage dépassée : mouvement arrêté.',
  ETOUCH_PROBE_RESTART: 'La carte a redémarré pendant le palpage.',
  ETOUCH_PROBE_LOST: 'Connexion machine perdue pendant le palpage.',
  ETOUCH_PROBE_WRITE: 'L’origine écrite ne se relit pas comme attendu ({axis} {value} au lieu de {expected}).',
  ETOUCH_PROBE_WRITE_UNCERTAIN: 'Écriture de l’origine sans confirmation.',
  ETOUCH_PROBE_AXES: 'Opération de palpage invalide (Z, X, Y ou XYZ).',
  ETOUCH_PROBE_MISSING: 'Profil de sonde incomplet : {field} à renseigner.',
  ETOUCH_PROBE_PARAM: 'Profil de sonde : {field} hors des limites du palpage réel ({min} à {max}). Modifiez le profil.',
  ETOUCH_PROBE_SLOW_FAST: 'La seconde touche doit être au plus aussi rapide que l’approche.',
  ETOUCH_PROBE_RETRACT: 'Le retrait doit être inférieur à la recherche maximale.',
  ETOUCH_PROBE_APPROACH: 'Palpage XYZ : faces extérieures du bloc seulement. Pour ce coin, les deux recherches doivent aller vers la pièce. Sinon palpez Z, X et Y séparément.',
  ETOUCH_PROBE_FACE_SIGN: 'Palpage XYZ : le décalage de face {axis} a le mauvais signe pour une face extérieure. Vérifiez-le dans le profil.',
  ETOUCH_PROBE_WCS: 'Le repère choisi ({wcs}) n’est pas le repère actif ({active}) : choisissez {active}.',
  ETOUCH_PROBE_TRAVEL: 'Palpage refusé : {axis} irait de {min} à {max} mm machine, hors de la course ({low} à {high}, marge 1 mm). Déplacez l’outil ou réduisez les distances.',
  ETOUCH_PROBE_FEED: 'Vitesse {feed} mm/min supérieure au maximum de l’axe {axis} ({max} mm/min).',
  ETOUCH_PROBE_TOO_SLOW: 'Palpage trop long ({seconds} s, {max} s au plus) : augmentez les vitesses ou réduisez les distances.',
  ETOUCH_PROBE_PILOT: 'Pilotage requis : cet appareil doit piloter la machine pour palper. Touchez Pilote dans le bandeau.',
  ETOUCH_PROBE_G92: 'Décalage temporaire G92 actif : annulez-le (G92.1) avant de palper.',
  ETOUCH_PROBE_TLO: 'Compensation de longueur d’outil active : annulez-la (G49) avant de palper.',
  ETOUCH_PROBE_PARAMETERS: 'Paramètres de la carte ($#) illisibles : palpage annulé avant tout mouvement.'
};

const SUFFIX_UNCHANGED = ' Origine de travail inchangée.';
const SUFFIX_MAYBE = ' Le repère a peut-être changé : vérifiez-le avant tout travail.';
const SUFFIX_HOMING = ' Refaites la prise d’origine ($H) avant de recommencer.';

const TEXT = {
  idle: 'Palpage au bloc : machine au repos uniquement, sans programme en cours ni en pause.',
  homing: 'Prise d’origine en cours.',
  spindle: 'La broche est commandée (M3 ou M4) : arrêtez-la d’abord (M5).',
  feedMode: 'Mode d’avance en temps inverse (G93) actif : le palpage exige G94.',
  homed: 'Machine non référencée : faites la prise d’origine ($H) avant de palper.',
  maxFeed: 'Vitesse maximale des axes ($110 à $112) inconnue : relisez les réglages de la carte.',
  position: 'Position machine inconnue.',
  test: 'Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.',
  moved: 'La machine a bougé depuis la confirmation : confirmez à nouveau à la position actuelle.',
  changed: 'Le palpage a changé depuis la confirmation : confirmez à nouveau.'
};

// The only lines the sequence ever sends.
const NUM = '-?\\d+(?:\\.\\d+)?';
const LINE = new RegExp('^(?:\\$#|G0|G38\\.3 [XYZ]' + NUM + '(?: [XYZ]' + NUM + ')? F' + NUM + '|G53 G1 [XYZ]' + NUM + ' F' + NUM +
  '|G10 L20 P[1-6](?: [XYZ]' + NUM + '){1,3})$');

const round = (n, digits = 3) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
const fmt = (n) => String(round(n));
const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const keyOf = (who) => (who && who.kind && who.id ? who.kind + ':' + who.id : '');

const fill = (template, params) => template.replace(/\{(\w+)\}/g, (all, k) => (params && params[k] !== undefined && params[k] !== null ? String(params[k]) : all));

// A refusal with a stable code (ETOUCH_PROBE_*) and the values of its French message.
export const refusal = (code, params = {}) => {
  const err = new Error(fill(MESSAGES[code], params));
  err.status = 409;
  err.code = code;
  err.params = params;
  return err;
};

// Machine coordinate of the new work zero on one axis, from the slow contact
// (machine coordinate of the tool centre), as probe-model.js compensate():
// Z: contact − thickness; X / Y: contact + direction × radius − face offset.
export const originOf = ({ axis, contact, direction, diameter, face, thickness }) => (axis === 'Z'
  ? round(contact - thickness, 6)
  : round(contact + direction * diameter / 2 - face, 6));

const usesOf = (axes) => ({
  Z: axes === 'Z' || axes === 'XYZ',
  X: axes === 'X' || axes === 'XYZ',
  Y: axes === 'Y' || axes === 'XYZ'
});

// The parameters of a block probe, bounded by the server (POST prepare body).
export const blockParams = (body) => {
  const b = body || {};
  const axes = b.axes;
  if (!['Z', 'X', 'Y', 'XYZ'].includes(axes)) {
    throw refusal('ETOUCH_PROBE_AXES');
  }
  if (!Object.prototype.hasOwnProperty.call(WCS_P, b.wcs)) {
    throw refusal('ETOUCH_PROBE_MISSING', { field: 'wcs' });
  }
  const profile = b.profile && typeof b.profile === 'object' ? b.profile : {};
  const xyz = axes === 'XYZ';
  const uses = usesOf(axes);
  const out = { axes, wcs: b.wcs };
  ['diameter', 'thickness', 'faceX', 'faceY', 'fast', 'slow', 'search', 'retract', 'clearance', 'corner', 'directionX', 'directionY'].forEach((field) => {
    out[field] = null;
  });
  const fields = [
    ['thickness', uses.Z], ['diameter', uses.X || uses.Y], ['faceX', uses.X], ['faceY', uses.Y],
    ['directionX', uses.X], ['directionY', uses.Y], ['corner', xyz],
    ['fast', true], ['slow', true], ['search', true], ['retract', true], ['clearance', uses.Z]
  ];
  fields.forEach(([field, required]) => {
    if (!required) {
      return;
    }
    const value = field === 'diameter' ? b.diameter : profile[field];
    if (value === undefined || value === null) {
      throw refusal('ETOUCH_PROBE_MISSING', { field });
    }
    if (field === 'corner') {
      if (!Object.prototype.hasOwnProperty.call(CORNERS, value)) {
        throw refusal('ETOUCH_PROBE_MISSING', { field });
      }
      out.corner = value;
      return;
    }
    if (field === 'directionX' || field === 'directionY') {
      if (value !== 1 && value !== -1) {
        throw refusal('ETOUCH_PROBE_MISSING', { field });
      }
      out[field] = value;
      return;
    }
    let [min, max] = LIMITS[field];
    if (xyz && field === 'thickness') {
      min = 3;
    }
    if (xyz && field === 'search') {
      min = 4;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw refusal('ETOUCH_PROBE_PARAM', { field, min, max });
    }
    out[field] = round(value);
  });
  if (out.slow > out.fast) {
    throw refusal('ETOUCH_PROBE_SLOW_FAST');
  }
  if (out.retract >= out.search) {
    throw refusal('ETOUCH_PROBE_RETRACT');
  }
  if (xyz) {
    const [cX, cY] = CORNERS[out.corner];
    if (out.directionX !== -cX || out.directionY !== -cY) {
      throw refusal('ETOUCH_PROBE_APPROACH');
    }
    if (out.faceX * out.directionX > 0) {
      throw refusal('ETOUCH_PROBE_FACE_SIGN', { axis: 'X' });
    }
    if (out.faceY * out.directionY > 0) {
      throw refusal('ETOUCH_PROBE_FACE_SIGN', { axis: 'Y' });
    }
  }
  return out;
};

const secondsOf = (distance, feed) => 60 * distance / feed;

// The plan of a block probe from the machine position `start` ({x, y, z}),
// the travel of each axis (`limits`: {X: {low, high, ambiguous}, …}) and the
// Grbl settings ($110-$112): worst-case envelope (true whatever the contacts),
// feeds, duration. Machine coordinates, mm.
export const blockPlan = (p, start, limits, settings) => {
  const xyz = p.axes === 'XYZ';
  const uses = usesOf(p.axes);
  const s = p.search;
  const b = p.retract;
  const cl = p.clearance;
  const r = uses.X || uses.Y ? p.diameter / 2 : null;
  const max = (axis) => maxFeedOf(settings, axis).max;
  AXES.filter((axis) => uses[axis]).forEach((axis) => {
    [p.fast, p.slow].forEach((feed) => {
      if (feed > max(axis)) {
        throw refusal('ETOUCH_PROBE_FEED', { axis, feed: fmt(feed), max: fmt(max(axis)) });
      }
    });
  });
  const travelXY = Math.min(TRAVEL_XY, max('X'), max('Y'));
  const travelZ = Math.min(TRAVEL_Z, max('Z'));
  const envelope = {};
  const direction = {};
  // What is added to the slow contact (tool centre) to get the work zero, per X / Y axis.
  const offsets = {};
  if (uses.Z) {
    offsets.Z = { thickness: p.thickness, total: -p.thickness };
  }
  ['X', 'Y'].filter((axis) => uses[axis]).forEach((axis) => {
    const d = p['direction' + axis];
    offsets[axis] = { radius: round(d * r, 6), face: p['face' + axis], total: round(d * r - p['face' + axis], 6) };
  });
  let window = null;
  let lateral = null;
  let depth = null;
  let reach = null;
  let seconds;
  let steps;
  // Fast search, retract, slow touch (back-off + overshoot), clearing move.
  const touch = (backFeed, clearDistance, clearFeed) => secondsOf(s, p.fast) + secondsOf(b, backFeed) + secondsOf(b + OVER, p.slow) +
    secondsOf(clearDistance, clearFeed);
  if (p.axes === 'Z') {
    envelope.Z = [start.z - s - OVER, start.z];
    steps = 7;
    seconds = touch(travelZ, cl, travelZ);
  } else if (!xyz) {
    const axis = p.axes;
    const d = p['direction' + axis];
    const a0 = start[axis.toLowerCase()];
    envelope[axis] = [Math.min(a0, a0 + d * (s + OVER)), Math.max(a0, a0 + d * (s + OVER))];
    direction[axis] = d;
    steps = 7;
    seconds = touch(travelXY, b, travelXY);
  } else {
    window = Math.min(s - 2 * MARGIN, W_MAX);
    lateral = r + MARGIN + window;
    depth = Math.min(p.thickness - 1, 5);
    const rX = Math.max(lateral, s + OVER + Math.abs(p.faceX));
    const rY = Math.max(lateral, s + OVER + Math.abs(p.faceY));
    envelope.X = [start.x - rX, start.x + rX];
    envelope.Y = [start.y - rY, start.y + rY];
    envelope.Z = [start.z - s - OVER - depth, start.z + cl + OVER];
    direction.X = p.directionX;
    direction.Y = p.directionY;
    reach = Math.max(rX, rY) + r;
    steps = 22;
    const link = Math.hypot(2 * rX, 2 * rY);
    seconds = touch(travelZ, cl, travelZ) +
      secondsOf(lateral, travelXY) + secondsOf(cl + depth, p.fast) + touch(travelXY, b, travelXY) + secondsOf(cl + depth, travelZ) +
      secondsOf(link, travelXY) + secondsOf(cl + depth, p.fast) + touch(travelXY, b, travelXY) + secondsOf(cl + depth, travelZ) +
      secondsOf(link, travelXY);
  }
  Object.keys(envelope).forEach((axis) => {
    envelope[axis] = envelope[axis].map((v) => round(v));
    const at = limits[axis];
    const [lo, hi] = envelope[axis];
    if (!at || lo < at.low + EDGE_MARGIN_MM - 1e-9 || hi > at.high - EDGE_MARGIN_MM + 1e-9) {
      if (at && at.ambiguous) {
        const err = new Error('Palpage refusé : ' + at.ambiguous + '.');
        err.status = 409;
        throw err;
      }
      throw refusal('ETOUCH_PROBE_TRAVEL', {
        axis, min: fmt(lo), max: fmt(hi), low: at ? fmt(at.low) : '?', high: at ? fmt(at.high) : '?'
      });
    }
  });
  seconds = Math.ceil(seconds + LINE_S * steps);
  if (seconds > MAX_SECONDS) {
    throw refusal('ETOUCH_PROBE_TOO_SLOW', { seconds, max: MAX_SECONDS });
  }
  return {
    axes: p.axes,
    wcs: p.wcs,
    approach: xyz ? 'outside' : null,
    direction,
    start: { x: start.x, y: start.y, z: start.z },
    search: s,
    window: window === null ? null : round(window),
    lateral: lateral === null ? null : round(lateral),
    depth: depth === null ? null : round(depth),
    clearance: uses.Z ? cl : null,
    toolRadius: r === null ? null : round(r, 6),
    offsets,
    reach: reach === null ? null : round(reach),
    envelope,
    feeds: { fast: p.fast, slow: p.slow, travelXY, travelZ },
    steps,
    seconds,
    timeoutMs: Math.min(MAX_CYCLE_MS, 2 * seconds * 1000 + 30000)
  };
};

// The plan as the confirmation shows it (POST prepare response, `blockProbe`).
const publicPlan = (plan) => {
  const out = JSON.parse(JSON.stringify(plan));
  delete out.timeoutMs;
  return out;
};

// deps (from job-service.js):
//   config, clock(), conflict(message), controllers(), record(c), later(c, r, fn, ms, cancel), changed(), log(event),
//   controllerInfo(c, r), allSettings(c), modalWcs(r), probeInput, control, transports, transportActors,
//   zeroZReady(c), answers(c, r), quiet(c, r, t, ms), haltPlan(c), halt(c, plan), homingActive(r), requireCapability(c, name)
// Returns { blockReady, bind, name, ticket, run, stop, forget, holds, transportClosed }.
export const createBlockProbe = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, changed, log, controllerInfo, allSettings, modalWcs,
    probeInput, control, transports, transportActors, zeroZReady, answers, quiet, haltPlan, halt, homingActive, requireCapability
  } = deps;

  // The cycle in progress on a record (also while it is stopping).
  const sessions = new WeakMap();

  const connected = (c) => controllers()[c.options.port] === c && !c.isClose() && !!c.runner;
  const activeOf = (c) => controllerStatus(c).activeState || '';
  const positionOf = (c, kind) => {
    const p = controllerStatus(c)[kind] || {};
    return { X: num(p.x), Y: num(p.y), Z: num(p.z) };
  };

  // Travel usable from the current machine position, per axis (motion.js).
  const travelOf = (c, r, mpos) => {
    const env = envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos });
    const out = {};
    AXES.forEach((axis) => {
      out[axis] = limitsAt(env[axis], mpos[axis], axis);
    });
    return out;
  };

  // The machine is ready for a block probe (parameters aside); throws its reason.
  const blockReady = (c) => {
    const r = record(c);
    requireCapability(c, 'plateProbe');
    const jog = capabilitiesOf({ type: c.type, firmware: r.firmware, version: c.settings && c.settings.version, enabled: motionEnabled(config) }).jog;
    if (!jog.enabled) {
      throw conflict(jog.reason);
    }
    zeroZReady(c);
    if (c.workflow.state !== 'idle') {
      throw conflict(TEXT.idle);
    }
    if (homingActive(r)) {
      throw conflict(TEXT.homing);
    }
    const modal = ((c.runner.state && c.runner.state.parserstate) || {}).modal || {};
    if (modal.spindle !== 'M5') {
      throw conflict(TEXT.spindle);
    }
    if (modal.feedrate !== 'G94') {
      throw conflict(TEXT.feedMode);
    }
    if (r.homed !== true) {
      throw conflict(TEXT.homed);
    }
    const settings = allSettings(c);
    const mpos = positionOf(c, 'mpos');
    const travel = travelOf(c, r, mpos);
    AXES.forEach((axis) => {
      const at = travel[axis];
      if (!at.limits || at.outside) {
        throw conflict('Palpage refusé : ' + at.reason + '.');
      }
    });
    if (AXES.some((axis) => maxFeedOf(settings, axis).source === 'fallback')) {
      throw conflict(TEXT.maxFeed);
    }
    if (AXES.some((axis) => mpos[axis] === null)) {
      throw conflict(TEXT.position);
    }
    const probe = probeInput.inspect(c.options.port);
    const test = probe.test || {};
    const failedAt = Number.isFinite(r.blockProbeFailedAt) ? r.blockProbeFailedAt : null;
    if (!test.done || !Number.isFinite(test.ageMs) || test.ageMs > TEST_MAX_AGE_MS || (failedAt !== null && !(probe.testedAt > failedAt))) {
      throw conflict(TEXT.test);
    }
  };

  const limitsFor = (travel) => {
    const out = {};
    AXES.forEach((axis) => {
      const at = travel[axis];
      out[axis] = at && at.limits ? { low: at.limits.low, high: at.limits.high, ambiguous: at.ambiguous || '' } : null;
    });
    return out;
  };

  // After the guard: the active offset and the start position the plan is bound to.
  const bind = (c, params) => {
    const r = record(c);
    const active = modalWcs(r);
    if (params.wcs !== active) {
      throw refusal('ETOUCH_PROBE_WCS', { wcs: params.wcs, active: active || 'inconnu' });
    }
    const m = positionOf(c, 'mpos');
    const start = { x: m.X, y: m.Y, z: m.Z };
    const plan = blockPlan(params, start, limitsFor(travelOf(c, r, m)), allSettings(c));
    return { ...params, p: WCS_P[params.wcs], start, plan };
  };

  const name = (c, params) => 'Palpage ' + params.axes + ' au bloc, repère ' + params.wcs;

  // Piloting: the actor's own stream, and the port's lease (taken by the
  // confirmation itself for a touch client on a free port, strictly owned at launch).
  const pilot = (c, actor, transportId, strict) => {
    const device = typeof transportId === 'string' && transports.has(transportId) ? transportActors.get(transportId) : null;
    const owner = control.inspect(c.options.port).owner;
    const me = keyOf(actor);
    if (!me || keyOf(device) !== me || (owner && keyOf(owner) !== me) || (!owner && (strict || actor.kind !== 'touch'))) {
      throw refusal('ETOUCH_PROBE_PILOT');
    }
    return device;
  };

  // Merged into the prepare response.
  const ticket = (c, params, { actor, transportId } = {}) => {
    pilot(c, actor, transportId, false);
    return { blockProbe: publicPlan(params.plan) };
  };

  const finalMessage = (code, params, written, needsHoming) => fill(MESSAGES[code], params) +
    (written === 'no' ? SUFFIX_UNCHANGED : SUFFIX_MAYBE) + (needsHoming ? SUFFIX_HOMING : '');

  // The cycle (after the confirmation): resolves at the end with the origin
  // written, rejects with a coded failure once the machine is stopped.
  const run = (c, t, actor) => {
    const r = record(c);
    const params = t.params;
    blockReady(c);
    const device = pilot(c, actor, t.transportId, true);
    const active = modalWcs(r);
    if (active !== params.wcs) {
      throw refusal('ETOUCH_PROBE_WCS', { wcs: params.wcs, active: active || 'inconnu' });
    }
    const here = positionOf(c, 'mpos');
    const S = params.start;
    if (AXES.some((axis) => here[axis] === null || Math.abs(here[axis] - S[axis.toLowerCase()]) > POS_TOL)) {
      throw conflict(TEXT.moved);
    }
    const plan = params.plan;
    const again = blockPlan(params, S, limitsFor(travelOf(c, r, here)), allSettings(c));
    if (JSON.stringify(again) !== JSON.stringify(plan)) {
      throw conflict(TEXT.changed);
    }

    const uses = usesOf(params.axes);
    const probed = AXES.filter((axis) => uses[axis]);
    const s = params.search;
    const b = params.retract;
    const cl = params.clearance;
    const F1 = params.fast;
    const F2 = params.slow;
    const Fxy = plan.feeds.travelXY;
    const Fz = plan.feeds.travelZ;
    const runner = c.runner;
    // r.probing: every existing lock applies ("Palpage en cours."); outstanding: a line sent and not over.
    const probing = { kind: 'block', contact: null, error: null, cancelled: false, abort: null, abortParams: null };
    Object.assign(probing, { outstanding: false, alarm: null, startups: r.startups, actor: device, written: 'no' });
    const session = {
      probing,
      deviceKey: keyOf(device),
      deadline: clock() + plan.timeoutMs,
      lostSince: null,
      forgotten: false,
      halted: false,
      haltStartups: null,
      haltReports: null,
      done: false,
      index: 0
    };
    const id = crypto.randomBytes(8).toString('hex');
    r.probing = probing;
    sessions.set(r, session);
    r.blockProbe = {
      id,
      axes: params.axes,
      wcs: params.wcs,
      state: 'running',
      step: { index: 0, total: plan.steps, code: null },
      startedAt: Date.now(),
      endedAt: null,
      contacts: {},
      written: 'no',
      origin: null,
      values: null,
      command: null,
      work: null,
      failure: null,
      needsHoming: false
    };
    const publish = (patch) => {
      r.blockProbe = { ...r.blockProbe, ...patch };
      changed();
    };
    const failure = (code, failureParams = {}) => refusal(code, failureParams);
    const live = () => r.probing === probing && !session.done;

    // Stops the cycle: feed hold then reset (halt.js) unless the board already
    // stopped by itself (restart, alarm) or the record is being dropped.
    const abort = (code, abortParams = {}, hardware = true) => {
      if (!live() || probing.abort) {
        return false;
      }
      probing.cancelled = true;
      probing.abort = code;
      probing.abortParams = abortParams;
      if (hardware && !session.forgotten && connected(c)) {
        let haltWith = haltPlan(c);
        // A line just sent whose report still says Idle may start any moment.
        if (!haltWith && probing.outstanding) {
          haltWith = 'hold';
        }
        c.command('feeder:stop');
        c.command('gcode:stop');
        halt(c, haltWith);
        if (haltWith) {
          session.halted = true;
          session.haltStartups = r.startups;
          session.haltReports = r.reports;
        }
      }
      const needsHoming = session.halted || r.homed !== true;
      publish({
        state: session.halted ? 'stopping' : r.blockProbe.state,
        failure: { code, params: abortParams, message: finalMessage(code, abortParams, probing.written, needsHoming) },
        needsHoming
      });
      return true;
    };
    session.abort = abort;

    // A board restart or an alarm ends the cycle in the event itself: quiet()
    // could otherwise take the old Idle state and an ok already counted for the
    // end of the line, and let one more line leave.
    const onStartup = () => abort('ETOUCH_PROBE_RESTART', {}, false);
    const onAlarm = (res) => {
      const n = Number(res && res.message);
      const code = Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
      probing.alarm = code || -1;
      abort('ETOUCH_PROBE_ALARM', { alarm: code ? 'ALARM:' + code : 'inconnue' }, false);
    };
    runner.on('startup', onStartup);
    runner.on('alarm', onAlarm);

    // The device's stream is open (any of its transports).
    const streamOpen = () => Array.from(transports).some((tid) => keyOf(transportActors.get(tid)) === session.deviceKey);
    // What must stop the cycle now, in this order: restart, alarm, stream lost
    // past its grace, control, stale reports, global time limit.
    const verdict = () => {
      if (streamOpen()) {
        session.lostSince = null;
      } else if (session.lostSince === null) {
        session.lostSince = clock();
      }
      const owner = control.inspect(c.options.port).owner;
      if (r.startups !== probing.startups) {
        abort('ETOUCH_PROBE_RESTART', {}, false);
      } else if (probing.alarm) {
        abort('ETOUCH_PROBE_ALARM', { alarm: probing.alarm > 0 ? 'ALARM:' + probing.alarm : 'inconnue' }, false);
      } else if (/^Alarm/.test(activeOf(c))) {
        // A report in Alarm without its ALARM:n line.
        abort('ETOUCH_PROBE_ALARM', { alarm: r.alarm ? 'ALARM:' + r.alarm : 'inconnue' }, false);
      } else if (session.lostSince !== null && clock() - session.lostSince >= STREAM_GRACE_MS) {
        abort('ETOUCH_PROBE_STREAM');
      } else if (!owner || keyOf(owner) !== session.deviceKey) {
        abort('ETOUCH_PROBE_CONTROL');
      } else if (!Number.isFinite(r.seen) || clock() - r.seen > STALE_MS) {
        abort('ETOUCH_PROBE_STALE');
      } else if (clock() > session.deadline) {
        abort('ETOUCH_PROBE_TIMEOUT');
      }
    };
    session.streamOpen = streamOpen;

    const supervise = () => {
      if (!live()) {
        return;
      }
      if (!probing.abort) {
        verdict();
      }
      later(c, r, supervise, SUPERVISE_MS);
    };
    later(c, r, supervise, SUPERVISE_MS);

    // Before every line, at that very moment: the supervisor's checks.
    const ensure = () => {
      if (session.forgotten) {
        throw failure('ETOUCH_PROBE_LOST');
      }
      if (!probing.abort) {
        verdict();
      }
      if (probing.abort) {
        throw failure(probing.abort, probing.abortParams || {});
      }
    };

    // Why a line did not end well.
    const classify = (tracker) => {
      if (probing.abort) {
        return failure(probing.abort, probing.abortParams || {});
      }
      if (session.forgotten || !connected(c)) {
        return failure('ETOUCH_PROBE_LOST');
      }
      if (/^Alarm/.test(activeOf(c)) || probing.alarm) {
        return failure('ETOUCH_PROBE_ALARM', { alarm: r.alarm ? 'ALARM:' + r.alarm : 'inconnue' });
      }
      const error = probing.error || (tracker && tracker.error);
      if (error) {
        return failure('ETOUCH_PROBE_ERROR', { error });
      }
      return failure('ETOUCH_PROBE_TIMEOUT');
    };

    // Polls `test` every 50 ms for at most `ms`; true once it holds.
    const waitFor = (test, ms) => new Promise((resolve, reject) => {
      const until = clock() + ms;
      const check = () => {
        if (probing.abort || session.forgotten) {
          reject(classify(null));
          return;
        }
        if (test()) {
          resolve(true);
          return;
        }
        if (clock() > until) {
          resolve(false);
          return;
        }
        later(c, r, check, 50, () => reject(failure('ETOUCH_PROBE_LOST')));
      };
      check();
    });

    // One line, alone in flight, until acknowledged and seen at rest; the PRB
    // (and $# parameters) events of that line only.
    const send = async (line, limitMs, { probe = false, collect = null } = {}) => {
      ensure();
      // The stream rotated by the server: no new line until it is back (the
      // supervisor stops the cycle once its grace is over).
      if (!streamOpen()) {
        if (!(await waitFor(streamOpen, STREAM_GRACE_MS + 1000))) {
          throw failure('ETOUCH_PROBE_STREAM');
        }
        ensure();
      }
      if (!LINE.test(line)) {
        throw failure('ETOUCH_PROBE_POSITION', { axis: '?' });
      }
      const tracker = answers(c, r);
      const prb = [];
      const onParameters = (payload) => {
        if (!payload || typeof payload.name !== 'string') {
          return;
        }
        if (probe && payload.name === 'PRB') {
          prb.push(payload.value || {});
        }
        if (collect) {
          collect[payload.name] = payload.value;
        }
      };
      const listening = probe || !!collect;
      if (listening) {
        runner.on('parameters', onParameters);
      }
      probing.outstanding = true;
      session.lines = (session.lines || 0) + 1;
      session.probed = session.probed || /^G38/.test(line);
      c.command('gcode', line);
      try {
        try {
          await quiet(c, r, tracker, limitMs);
        } catch (_) {
          // A line Grbl refused (error:n) never ran: nothing is moving because of it.
          if (tracker.error && !probing.abort) {
            probing.outstanding = false;
          }
          throw classify(tracker);
        }
        probing.outstanding = false;
        if (probe) {
          await waitFor(() => prb.length > 0, PRB_WAIT_MS);
        }
      } finally {
        tracker.done();
        if (listening) {
          runner.removeListener('parameters', onParameters);
        }
      }
      ensure();
      return prb;
    };

    const step = (code) => {
      session.index += 1;
      publish({ step: { index: session.index, total: plan.steps, code } });
    };
    const lineLimit = (distance, feed) => 60000 * Math.abs(distance) / feed + LINE_MARGIN_MS;
    const position = () => positionOf(c, 'mpos');
    // Every target inside the envelope confirmed with the plan.
    const inside = (axis, value) => {
      const env = plan.envelope[axis];
      if (!env || !Number.isFinite(value) || value < env[0] - 1e-6 || value > env[1] + 1e-6) {
        throw failure('ETOUCH_PROBE_POSITION', { axis });
      }
    };
    // Work coordinate of a machine target in the active offset, from the same last report.
    const workTarget = (axis, machine) => {
      const m = position()[axis];
      const w = positionOf(c, 'wpos')[axis];
      if (m === null || w === null) {
        throw failure('ETOUCH_PROBE_POSITION', { axis });
      }
      return w + (machine - m);
    };
    const arrived = (axis, target) => {
      const v = position()[axis];
      if (v === null || Math.abs(v - target) > POS_TOL) {
        throw failure('ETOUCH_PROBE_POSITION', { axis });
      }
    };
    // Free: a fresh, recognized report after the last move, without P.
    const free = () => {
      const probe = probeInput.inspect(c.options.port);
      return probe.fresh && probe.state !== 'contact' && (probe.code === 'EXPLICIT' || probe.code === 'MISSING');
    };

    // A contact of the line [from → to] on `axis`, confirmed by its own PRB:…:1.
    const contactOf = (prb, axis, d, from, to, others) => {
      if (prb.length !== 1) {
        throw failure('ETOUCH_PROBE_PRB', { axis });
      }
      const v = prb[0];
      if (v.result === 0) {
        throw failure('ETOUCH_PROBE_NO_CONTACT', { axis, search: fmt(Math.abs(to - from)) });
      }
      const at = num(v[axis.toLowerCase()]);
      if (v.result !== 1 || at === null || at < Math.min(from, to) - POS_TOL || at > Math.max(from, to) + POS_TOL) {
        throw failure('ETOUCH_PROBE_PRB', { axis });
      }
      const now = position();
      const beyond = (now[axis] - at) * d;
      if (now[axis] === null || beyond < -POS_TOL || beyond > OVERSHOOT_MAX) {
        throw failure('ETOUCH_PROBE_POSITION', { axis });
      }
      Object.keys(others).forEach((other) => arrived(other, others[other]));
      return at;
    };

    // A single-axis G53 G1 (retract or lift) to a checked machine target.
    const move = async (code, axis, target, feed) => {
      if (code) {
        step(code);
      }
      inside(axis, target);
      const from = position()[axis];
      await send('G53 G1 ' + axis + fmt(target) + ' F' + fmt(feed), lineLimit(from === null ? s : target - from, feed));
      arrived(axis, target);
    };

    // A supervised G38.3 move where no contact is expected.
    const watch = async (code, targets, feed, contactCode, contactParams) => {
      const axes = Object.keys(targets);
      if (!free()) {
        throw failure('ETOUCH_PROBE_CONTACT_AT_START', { axis: axes.join('') });
      }
      step(code);
      axes.forEach((axis) => inside(axis, targets[axis]));
      const now = position();
      const distance = Math.hypot(...axes.map((axis) => targets[axis] - (now[axis] === null ? 0 : now[axis])));
      const words = axes.map((axis) => axis + fmt(workTarget(axis, targets[axis])));
      const prb = await send('G38.3 ' + words.join(' ') + ' F' + fmt(feed), lineLimit(distance, feed), { probe: true });
      if (prb.length !== 1) {
        throw failure('ETOUCH_PROBE_PRB', { axis: axes.join('') });
      }
      if (prb[0].result === 1) {
        throw failure(contactCode, contactParams);
      }
      if (prb[0].result !== 0) {
        throw failure('ETOUCH_PROBE_PRB', { axis: axes.join('') });
      }
      axes.forEach((axis) => arrived(axis, targets[axis]));
    };

    // Two touches on one axis from a0 (fast, retract, slow, clearing move).
    const touch = async (axis, d, a0, clearTarget, backFeed, clearFeed) => {
      const fixed = {};
      const start = position();
      AXES.filter((other) => other !== axis).forEach((other) => {
        fixed[other] = start[other];
      });
      if (!free()) {
        throw failure('ETOUCH_PROBE_CONTACT_AT_START', { axis });
      }
      step(axis + '_FAST');
      const far = a0 + d * s;
      inside(axis, far);
      let prb = await send('G38.3 ' + axis + fmt(workTarget(axis, far)) + ' F' + fmt(F1), lineLimit(s, F1), { probe: true });
      const c1 = contactOf(prb, axis, d, a0, far, fixed);
      step(axis + '_RETRACT');
      let back = c1 - d * b;
      // Never further back than the start.
      if ((back - a0) * d < 0) {
        back = a0;
      }
      if (Math.abs(back - c1) < MIN_BACKOFF) {
        throw failure('ETOUCH_PROBE_START_CLOSE', { axis });
      }
      await move(null, axis, back, backFeed);
      if (!free()) {
        throw failure('ETOUCH_PROBE_STUCK', { axis, retract: fmt(b) });
      }
      step(axis + '_SLOW');
      const near = c1 + d * OVER;
      inside(axis, near);
      prb = await send('G38.3 ' + axis + fmt(workTarget(axis, near)) + ' F' + fmt(F2), lineLimit(near - back, F2), { probe: true });
      const c2 = contactOf(prb, axis, d, back, near, fixed);
      if (Math.abs(c2 - c1) > TOUCH_AGREE) {
        throw failure('ETOUCH_PROBE_MISMATCH', { axis, delta: fmt(Math.abs(c2 - c1)) });
      }
      publish({ contacts: { ...r.blockProbe.contacts, [axis]: round(c2, 6) } });
      step(axis + '_CLEAR');
      await move(null, axis, clearTarget(c2), clearFeed);
      if (!free()) {
        throw failure('ETOUCH_PROBE_STUCK', { axis, retract: fmt(b) });
      }
      return c2;
    };
    // Bounded so that it never goes further back than a0.
    const notBeyond = (value, a0, d) => ((value - a0) * d < 0 ? a0 : value);
    // XYZ: the face touched is where the start puts it, the tool centre above
    // the block within the window of its edge (a hole's wall, seen from a start
    // beside the hole, is caught when it is not).
    const inWindow = (axis, start, contact, d) => {
      const inset = (start - contact) * d - plan.toolRadius;
      if (!(inset > 0) || inset > plan.window + POS_TOL) {
        throw failure('ETOUCH_PROBE_WINDOW', { axis, window: fmt(plan.window) });
      }
    };

    const sequence = async () => {
      step('CHECK');
      const parameters = {};
      await send('$#', LINE_MARGIN_MS, { collect: parameters });
      const g92 = parameters.G92;
      const tlo = num(parameters.TLO);
      if (!g92 || typeof g92 !== 'object' || ['x', 'y', 'z'].some((a) => num(g92[a]) === null) || tlo === null) {
        throw failure('ETOUCH_PROBE_PARAMETERS');
      }
      if (['x', 'y', 'z'].some((a) => Math.abs(num(g92[a])) > 1e-6)) {
        throw failure('ETOUCH_PROBE_G92');
      }
      if (Math.abs(tlo) > 1e-6) {
        throw failure('ETOUCH_PROBE_TLO');
      }
      const origin = {};
      if (params.axes === 'Z') {
        const cZ = await touch('Z', -1, S.z, (c2) => notBeyond(c2 + cl, S.z, -1), Fz, Fz);
        origin.Z = originOf({ axis: 'Z', contact: cZ, thickness: params.thickness });
      } else if (params.axes !== 'XYZ') {
        const axis = params.axes;
        const d = params['direction' + axis];
        const a0 = S[axis.toLowerCase()];
        const cA = await touch(axis, d, a0, (c2) => notBeyond(c2 - d * b, a0, d), Fxy, Fxy);
        origin[axis] = originOf({ axis, contact: cA, direction: d, diameter: params.diameter, face: params['face' + axis] });
      } else {
        const dX = params.directionX;
        const dY = params.directionY;
        const L = plan.lateral;
        const h = plan.depth;
        const cZ = await touch('Z', -1, S.z, (c2) => c2 + cl, Fz, Fz);
        const zs = round(cZ + cl, 6);
        const PX = { X: S.x - dX * L, Y: S.y };
        const PY = { X: S.x, Y: S.y - dY * L };
        await watch('X_TRAVERSE', PX, Fxy, 'ETOUCH_PROBE_TRAVERSE_CONTACT', {});
        await watch('X_DESCENT', { Z: cZ - h }, F1, 'ETOUCH_PROBE_DESCENT_CONTACT', { axis: 'X' });
        const cX = await touch('X', dX, PX.X, (c2) => notBeyond(c2 - dX * b, PX.X, dX), Fxy, Fxy);
        inWindow('X', S.x, cX, dX);
        await move('X_LIFT', 'Z', zs, Fz);
        await watch('Y_TRAVERSE', PY, Fxy, 'ETOUCH_PROBE_TRAVERSE_CONTACT', {});
        await watch('Y_DESCENT', { Z: cZ - h }, F1, 'ETOUCH_PROBE_DESCENT_CONTACT', { axis: 'Y' });
        const cY = await touch('Y', dY, PY.Y, (c2) => notBeyond(c2 - dY * b, PY.Y, dY), Fxy, Fxy);
        inWindow('Y', S.y, cY, dY);
        await move('Y_LIFT', 'Z', zs, Fz);
        origin.Z = originOf({ axis: 'Z', contact: cZ, thickness: params.thickness });
        origin.X = originOf({ axis: 'X', contact: cX, direction: dX, diameter: params.diameter, face: params.faceX });
        origin.Y = originOf({ axis: 'Y', contact: cY, direction: dY, diameter: params.diameter, face: params.faceY });
        await watch('RETURN', { X: origin.X, Y: origin.Y }, Fxy, 'ETOUCH_PROBE_TRAVERSE_CONTACT', {});
      }

      // The origin, written once, after the last move.
      step('WRITE');
      if (!free()) {
        throw failure('ETOUCH_PROBE_STUCK', { axis: probed[probed.length - 1], retract: fmt(b) });
      }
      const M = position();
      await send('G0', LINE_MARGIN_MS);
      AXES.forEach((axis) => arrived(axis, M[axis]));
      const values = {};
      probed.forEach((axis) => {
        values[axis] = round(M[axis] - origin[axis]);
      });
      const command = 'G10 L20 P' + params.p + ' ' + probed.map((axis) => axis + fmt(values[axis])).join(' ');
      ensure();
      probing.written = 'uncertain';
      publish({ written: 'uncertain', command });
      try {
        await send(command, LINE_MARGIN_MS);
      } catch (err) {
        throw err.code === 'ETOUCH_PROBE_TIMEOUT' && !probing.abort ? failure('ETOUCH_PROBE_WRITE_UNCERTAIN') : err;
      }
      step('VERIFY');
      const w = positionOf(c, 'wpos');
      probed.forEach((axis) => {
        if (w[axis] === null || Math.abs(w[axis] - values[axis]) > POS_TOL) {
          throw failure('ETOUCH_PROBE_WRITE', { axis, value: w[axis] === null ? '?' : fmt(w[axis]), expected: fmt(values[axis]) });
        }
      });
      AXES.forEach((axis) => arrived(axis, M[axis]));
      return { origin, values, command, work: { x: w.X, y: w.Y, z: w.Z } };
    };

    // Kept until the stop is proven: the board's banner, a newer report in
    // Alarm, or, once the reset delay of halt.js plus 2 s is over, a newer
    // report at rest in Idle. Without a proof it stays `stopping`, locked.
    const released = () => new Promise((resolve) => {
      const since = clock();
      const check = () => {
        const newer = r.reports > session.haltReports;
        if (session.forgotten || !connected(c) || r.startups !== session.haltStartups ||
            (newer && /^Alarm/.test(activeOf(c))) || (newer && clock() - since >= RELEASE_MS && activeOf(c) === 'Idle')) {
          resolve();
          return;
        }
        later(c, r, check, 50, resolve);
      };
      check();
    });

    const finish = () => {
      session.done = true;
      if (runner) {
        runner.removeListener('startup', onStartup);
        runner.removeListener('alarm', onAlarm);
      }
      if (r.probing === probing) {
        r.probing = null;
      }
      sessions.delete(r);
    };

    const entry = { event: 'probe', kind: 'block', axes: params.axes, wcs: params.wcs, controller: controllerInfo(c, r), actor: device };
    changed();
    return sequence().then((result) => {
      finish();
      r.blockProbe = {
        ...r.blockProbe, state: 'done', endedAt: Date.now(), written: 'yes', ...result, failure: null, needsHoming: false
      };
      log({ ...entry, result: 'set', origin: result.origin, values: result.values, command: result.command, contacts: r.blockProbe.contacts });
      changed();
      return { message: 'Origine ' + params.wcs + ' réglée par palpage ' + params.axes + '.', blockProbe: { ...r.blockProbe } };
    }, async (err) => {
      const coded = err && typeof err.code === 'string' && /^ETOUCH_PROBE_/.test(err.code);
      let code = probing.abort || (coded ? err.code : 'ETOUCH_PROBE_TIMEOUT');
      let codeParams = probing.abort ? (probing.abortParams || {}) : ((coded && err.params) || {});
      if (!probing.abort && !session.forgotten) {
        // A failure never leaves a move going without a stop order.
        const stopped = ['ETOUCH_PROBE_ALARM', 'ETOUCH_PROBE_RESTART', 'ETOUCH_PROBE_LOST'].includes(code);
        if (!stopped && connected(c) && (probing.outstanding || activeOf(c) !== 'Idle')) {
          abort(code, codeParams, true);
        } else {
          probing.cancelled = true;
          probing.abort = code;
          probing.abortParams = codeParams;
        }
        code = probing.abort;
        codeParams = probing.abortParams || {};
      }
      if (session.halted && !session.forgotten) {
        await released();
      } else if (session.probed && !session.forgotten && connected(c) && streamOpen() && r.startups === probing.startups &&
          !probing.alarm && activeOf(c) === 'Idle' && !['ETOUCH_PROBE_ALARM', 'ETOUCH_PROBE_RESTART', 'ETOUCH_PROBE_LOST'].includes(code)) {
        // Stopped cleanly at rest without a reset: G38.3 must not stay the motion
        // mode (a later line of axis words alone would probe). No move; never
        // without the device's stream.
        c.command('gcode', 'G0');
      }
      finish();
      const needsHoming = session.halted || r.homed !== true;
      const message = finalMessage(code, codeParams, probing.written, needsHoming);
      r.blockProbeFailedAt = clock();
      r.blockProbe = {
        ...r.blockProbe, state: 'failed', endedAt: Date.now(), written: probing.written, failure: { code, params: codeParams, message }, needsHoming
      };
      log({ ...entry, result: 'failed', code, written: probing.written, contacts: r.blockProbe.contacts });
      changed();
      const out = refusal(code, codeParams);
      out.message = message;
      out.blockProbe = { ...r.blockProbe };
      throw out;
    });
  };

  const STOP_TEXT = {
    stop: ['Palpage interrompu. Vérifiez l’immobilisation ; origine de travail inchangée.', 'Palpage interrompu. Vérifiez l’immobilisation ; l’origine a peut-être été écrite : vérifiez-la avant tout travail.'],
    pause: ['Pause pendant un palpage : palpage interrompu, il ne se reprend pas. Origine de travail inchangée.', 'Pause pendant un palpage : palpage interrompu, il ne se reprend pas ; l’origine a peut-être été écrite : vérifiez-la avant tout travail.'],
    spindle: ['Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée. Origine de travail inchangée.', 'Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée ; l’origine a peut-être été écrite : vérifiez-la avant tout travail.']
  };

  // Stop, Pause or spindle stop during a block probe: the same hardware stop
  // (a probe cannot be resumed; no M5 joins the queue of the cycle's line).
  const stop = (c, r, why) => {
    const session = sessions.get(r);
    if (session && session.abort) {
      session.abort(why === 'pause' ? 'ETOUCH_PROBE_PAUSED' : 'ETOUCH_PROBE_STOPPED', {}, true);
    }
    const written = r.probing && r.probing.written ? r.probing.written : 'no';
    const text = STOP_TEXT[why] || STOP_TEXT.stop;
    return { message: written === 'no' ? text[0] : text[1] };
  };

  // The record is dropped (port closed, service disposed): no deferred reset
  // is possible any more; a line in flight on a controller still open gets
  // one feed hold, and nothing follows.
  const forget = (c, r) => {
    const session = sessions.get(r);
    if (!session || session.done) {
      return;
    }
    session.forgotten = true;
    const probing = session.probing;
    probing.cancelled = true;
    if (!probing.abort) {
      probing.abort = 'ETOUCH_PROBE_LOST';
      probing.abortParams = {};
    }
    if (probing.outstanding && controllers()[c.options.port] === c && !c.isClose() && c.runner) {
      c.command('feedhold');
    }
  };

  // A stream of `actor` closed (job-service closeTransport, after its removal):
  // unless the server rotated it, the tablet is gone, and with its last stream
  // the cycle stops at once (feed hold, then reset).
  const transportClosed = (c, r, actor, rotated) => {
    const session = sessions.get(r);
    if (rotated || !session || session.done || !session.abort || !keyOf(actor) || session.deviceKey !== keyOf(actor) || session.streamOpen()) {
      return;
    }
    session.abort('ETOUCH_PROBE_STREAM', {}, true);
  };

  // A block probe of this stream's device keeps the stream from being rotated.
  const holds = (transportId) => {
    const key = keyOf(transportActors.get(transportId));
    return (r) => {
      const session = sessions.get(r);
      return !!(key && session && !session.done && session.deviceKey === key);
    };
  };

  return { blockReady, bind, name, ticket, run, stop, forget, holds, transportClosed };
};
