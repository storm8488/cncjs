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
const WCS_P = { G54: 1, G55: 2, G56: 3, G57: 4, G58: 5, G59: 6 };

export const DISABLED_MESSAGE = 'Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).';

const STOP_REASONS = {
  operator: 'relâchement ou arrêt demandé',
  stop: 'bouton Arrêter',
  keepalive: 'maintien non confirmé à temps (connexion lente ou perdue)',
  transport: 'flux de suivi du client fermé',
  control: 'pilotage pris par un autre client',
  stale: 'rapport machine trop ancien',
  alarm: 'alarme machine'
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

// Machine travel per axis, with the convention of the travel check (F2):
// homing towards the positive end ($23 bit clear) gives [-travel, 0], towards
// the negative end [0, travel]. Known only on a referenced machine.
export const envelopeOf = (settings, homed) => {
  const s = settings || {};
  let global = '';
  const homing = number(s.$22);
  if (homing === null) {
    global = 'réglage $22 inconnu';
  } else if (homing !== 1) {
    global = 'prise d’origine désactivée ($22=0)';
  } else if (homed !== true) {
    global = 'référencement ($H) non constaté depuis le dernier redémarrage de la carte';
  }
  const mask = number(s.$23) || 0;
  const axes = {};
  AXES.forEach((axis, i) => {
    const travel = number(s['$' + (130 + i)]);
    if (global) {
      axes[axis] = { limits: null, reason: global };
    } else if (travel === null || travel <= 0) {
      axes[axis] = { limits: null, reason: 'course $' + (130 + i) + ' inconnue' };
    } else {
      const low = Math.floor(mask / (2 ** i)) % 2 === 1 ? 0 : -travel;
      axes[axis] = { limits: { low, high: low + travel }, reason: '' };
    }
  });
  return axes;
};

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
    hasAutomations, control, transports, transportActors, log, controllerInfo, allSettings, modalWcs
  } = deps;

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
    // No answer at all (link trouble) but reports at rest long after: let go.
    const lost = clock() - p.sentAt > p.limitMs && state === 'Idle' && r.reports >= p.mark + 3;
    if (p.t.error || answered || lost) {
      p.t.done();
      s.pending = null;
      return true;
    }
    return false;
  };

  const send = (c, r, kind, line, limitMs) => {
    const s = stateOf(r);
    const t = answers(c, r);
    s.pending = { t, kind, line, sentAt: clock(), mark: r.reports, limitMs };
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
      throw conflict('Machine en alarme' + (r.alarm ? ' (ALARM:' + r.alarm + ')' : '') + ' : déverrouillez ($X) ou référencez ($H) d’abord.');
    }
    if (s.session || s.cancel || !settle(c, r) || state === 'Jog') {
      throw conflict('Déplacement précédent non terminé : attendez le retour au repos (Idle).');
    }
    if (state !== 'Idle') {
      throw conflict('La machine doit être au repos (Idle) : état ' + (state || 'inconnu') + '.');
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
    const axis = envelopeOf(allSettings(c), r.homed)[p.axis];
    const pos = positionOf(c, 'mpos', p.axis);
    if (p.step > MAX_UNREFERENCED_STEP_MM && (!axis.limits || pos === null)) {
      throw conflict('Pas de ' + fmt(p.step) + ' mm refusé : au-delà de ' + MAX_UNREFERENCED_STEP_MM + ' mm, il faut une machine référencée et une course connue (' +
        (axis.reason || 'position machine ' + p.axis + ' inconnue') + ').');
    }
    const distance = p.direction * p.step;
    if (axis.limits && pos !== null) {
      const target = pos + distance;
      if (target < axis.limits.low - 1e-6 || target > axis.limits.high + 1e-6) {
        throw conflict('Pas refusé : ' + p.axis + ' sortirait de la course (' + fmt(target) + ' mm machine, course ' + fmt(axis.limits.low) + ' → ' + fmt(axis.limits.high) + ').');
      }
    }
    const line = jogLine(p.axis, distance, p.feed);
    send(c, r, 'jog', line, 60000 * p.step / p.feed + 10000);
    return { message: 'Pas de ' + fmt(p.step) + ' mm en ' + p.axis + (p.direction > 0 ? '+' : '−') + ' envoyé (' + line + ').', command: line };
  };

  // Ends a continuous jog (if any) and cancels whatever jog Grbl runs: 0x85,
  // sent again when the `$J` is acknowledged after it (a 0x85 that reached
  // Grbl before the `$J` was parsed is ignored outside the Jog state) and
  // while a report newer than the last 0x85 still shows Jog.
  const cancel = (c, r, why) => {
    const s = stateOf(r);
    const session = s.session;
    s.session = null;
    s.lastJog = { result: 'cancelled', reason: why, message: STOP_REASONS[why] || why, at: Date.now(), axis: session ? session.axis : null };
    if (!connected(c)) {
      changed();
      return;
    }
    c.command('jogCancel');
    const job = { since: clock(), sentAt: clock(), mark: r.reports, oks: s.pending ? s.pending.t.oks : 0 };
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
      if (clock() - job.since > CANCEL_LIMIT_MS) {
        // Not confirmed: the `$J` ends at its bound anyway; the operator is told.
        s.cancel = null;
        s.lastJog.unconfirmed = true;
        changed();
        return;
      }
      later(c, r, check, WATCH_MS);
    };
    later(c, r, check, WATCH_MS);
  };

  const stopReason = (c, r, session) => {
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
        s.session = null;
        s.lastJog = { result: 'lost', message: 'connexion au contrôleur perdue', at: Date.now(), axis: session.axis };
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
        s.session = null;
        s.lastJog = error
          ? { result: 'refused', message: 'Grbl a refusé le jog (error:' + error + ')', at: Date.now(), axis: session.axis }
          : { result: 'ended', message: 'fin de la course autorisée atteinte', at: Date.now(), axis: session.axis };
        changed();
        return;
      }
      later(c, r, check, WATCH_MS);
    };
    later(c, r, check, WATCH_MS);
  };

  const continuousReason = (c, r, axis) => {
    const env = envelopeOf(allSettings(c), r.homed)[axis];
    if (!env.limits) {
      return 'Maintien continu impossible : ' + env.reason + '. Utilisez les pas (' + MAX_UNREFERENCED_STEP_MM + ' mm au plus).';
    }
    if (positionOf(c, 'mpos', axis) === null) {
      return 'Maintien continu impossible : position machine ' + axis + ' inconnue.';
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
    const { limits } = envelopeOf(allSettings(c), r.homed)[p.axis];
    const pos = positionOf(c, 'mpos', p.axis);
    const edge = p.direction > 0 ? limits.high - EDGE_MARGIN_MM : limits.low + EDGE_MARGIN_MM;
    const room = Math.floor((p.direction > 0 ? edge - pos : pos - edge) * 1000) / 1000;
    if (!(room >= MIN_CONTINUOUS_MM)) {
      throw conflict('Fin de course proche : pas de maintien continu vers ' + p.axis + (p.direction > 0 ? '+' : '−') + ' (' + fmt(Math.max(0, room)) + ' mm disponibles).');
    }
    const line = jogLine(p.axis, p.direction * room, p.feed);
    const session = {
      id: crypto.randomBytes(12).toString('hex'),
      actorKey: keyOf(actor),
      owner: { kind: actor.kind, id: actor.id, label: actor.label || '' },
      transportId: body.transportId,
      axis: p.axis,
      direction: p.direction,
      feed: p.feed,
      distanceMm: room,
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
    session.deadline = clock() + KEEPALIVE_TIMEOUT_MS;
    return { active: true, jogId: session.id };
  };

  // Is there a jog of ours to stop (sent, running, or being cancelled)?
  const moving = (c, r) => {
    const s = stateOf(r);
    return !!(s.session || (s.pending && s.pending.kind === 'jog' && !settle(c, r)));
  };

  // Release, pointercancel, blur, Stop: free for everyone, enabled or not.
  const stop = (c, r, why = 'operator') => {
    if (moving(c, r) || activeOf(c) === 'Jog') {
      cancel(c, r, why);
      return { message: 'Déplacement arrêté : annulation de jog (0x85) envoyée.' };
    }
    return { message: 'Aucun déplacement en cours.' };
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
    if (op === 'jog-keepalive') {
      return keepalive(c, r, body, actor);
    }
    gate(c, r, 'jog');
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
        throw conflict('Position machine ' + axis + ' inconnue.');
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
      throw conflict('Le repère actif a changé depuis la confirmation (' + wcs + ' → ' + (now || 'inconnu') + ') : confirmez à nouveau.');
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
        lastJog: s.lastJog ? { ...s.lastJog } : null,
        lastOrigin: s.lastOrigin ? { ...s.lastOrigin } : null
      }
    };
  };

  // Change detection for the stream (see job-service fingerprint()).
  const signature = (r) => {
    const s = r.motion;
    return s ? [s.session && s.session.id, s.pending && s.pending.sentAt, s.cancel && s.cancel.since, s.lastJog && s.lastJog.at, s.lastOrigin && s.lastOrigin.at].join('/') : '';
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

  // The controller record is dropped: its answer listeners go with it.
  const forget = (r) => {
    const s = r.motion;
    if (s && s.pending) {
      s.pending.t.done();
      s.pending = null;
    }
    if (s) {
      s.session = null;
      s.cancel = null;
    }
  };

  return { perform, stop, moving, originOperation, snapshot, signature, transportClosed, holds, forget };
};

export default { createMotion, capabilitiesOf, envelopeOf, maxFeedOf, grblVersion, jogLine, originLine, motionEnabled };
