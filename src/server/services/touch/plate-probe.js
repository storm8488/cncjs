// Z zero with a touch plate for the touch job service: the guard, the
// parameters and the probing sequence, plus the tracking of Grbl's answers
// to the lines the service sends itself (also used by real moves and the
// spindle restart after a tool change). See job-service.js.
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';
// eslint-disable-next-line import/extensions
import { envelopeOf, limitsAt, HOMING_MESSAGE } from './motion.js';
// eslint-disable-next-line import/extensions
import { probeContactRefusal } from './probe-input.js';

// Z zero with a touch plate: a fast probe down, a 1 mm back-off, a slow probe,
// then the work Z is set so that the plate top reads its thickness, and the
// tool rises 5 mm above it. Everything in absolute coordinates (G90, mm), so
// an alarm in the middle leaves no relative mode behind.
const PLATE = {
  fastFeed: 100,
  slowFeed: 25,
  backOff: 1,
  clearance: 5,
  minSearch: 1,
  maxSearch: 100,
  maxThickness: 50
};

const axisNumber = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const fmt = (n) => String(Math.round(n * 1000) / 1000);

// After a stop that sent a feed hold or a reset, the lock is kept until the stop is proven: the
// board's banner, a newer report in Alarm, or, once the reset delay of halt.js plus 2 s is over,
// a newer report at rest in Idle (like the block probe's released()).
const RELEASE_MS = 7000;

// Both G38.2 targets stay this far above the low end of the Z travel (C-07).
const EDGE_MM = 1;

// Supervision of the probe (C-17), like the block probe: a stream of the device that confirmed it
// may be gone this long (a rotation), the reports this old; checked every SUPERVISE_MS.
const STREAM_GRACE_MS = 3000;
const STALE_MS = 2500;
const SUPERVISE_MS = 100;
// Lot C1: a proof missing between two lines is waited for this long (report-proof.js).
const PROOF_WAIT_MS = 2500;

// Coded refusals and stops of the plate probe: French message (the server's), with its values.
export const PLATE_MESSAGES = {
  ETOUCH_PLATE_TRAVEL: 'Recherche de {search} mm trop longue : l’outil sortirait de la course en Z. Au plus {max} mm d’ici.',
  ETOUCH_PLATE_STREAM: 'Palpage arrêté : la tablette qui l’a lancé ne suit plus la machine (connexion perdue). Le zéro Z n’est pas réglé.',
  ETOUCH_PLATE_CONTROL: 'Palpage arrêté : le pilotage a changé de main. Le zéro Z n’est pas réglé.',
  ETOUCH_PLATE_STALE: 'Palpage arrêté : la machine ne donne plus de nouvelles (rapports trop anciens). Le zéro Z n’est pas réglé.',
  ETOUCH_PLATE_TIMEOUT: 'Palpage arrêté : une ligne n’a pas fini à temps. Vérifiez la machine ; le zéro Z n’est pas réglé.',
  // Lot C1 (design/plaque/C1-CONCEPTION.md § 2.5).
  ETOUCH_PLATE_SPINDLE: 'Palpage arrêté : la broche est commandée, ou sa vitesse n’est plus rapportée. Le zéro Z n’est pas réglé.',
  ETOUCH_PLATE_POSITION: 'Palpage arrêté : la machine n’est plus là où le palpage l’avait laissée, ou le repère a changé. Le zéro Z n’est pas réglé.'
};

const keyOf = (who) => (who && who.kind && who.id ? who.kind + ':' + who.id : '');

// deps (from job-service.js):
//   config                  CNCjs configuration (automations)
//   clock()                 monotonic time, in ms
//   conflict(message)       a 409 error
//   controllers()           CNCjs's registry of controllers, by port
//   record(c)               the service's record of a controller (probing, zeroZ, job, reports, wcs, alarm)
//   later(c, r, fn, ms, cancel)  deferred step, cancelled with the record
//   changed()               notifies the stream listeners
//   available(c)            connection, fresh report, no host command, or throws
//   spindleStill(c)         throws while the spindle turns or is commanded on
//   pauseKind(c)            why CNCjs holds the program (null, M0, M1, M6, error, other)
//   modalFresh(r)           a recent $G report
//   allSettings(c), settingNumber(settings, n)  Grbl settings ($$)
//   hasAutomations(config)  CNCjs event automations are enabled
//   grblCode(res)           the numeric code of an error:n / ALARM:n
//   probeInput              probe pin observer (inspect(port))
//   moving(c, r)            a jog of the service sent and not over (motion.js)
//   referenceReady(c)       throws on a machine without its reference while $22=1 (C-18)
//   haltPlan(c), halt(c, plan)  the stop sequence (halt.js)
//   control, transports, transportActors  the lease and the open streams (who confirmed the probe)
// Returns { zeroZReady(c), plateParams(body), plateTravel(c, params), answers(c, r), zeroZ(c, ticket, actor),
//   quiet(c, r, t, ms), stop(c, r, code), supervise(c, r), holds(transportId), transportClosed(c, r, actor, rotated) }.
export const createPlateProbe = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, changed, available, spindleStill,
    pauseKind, modalFresh, allSettings, settingNumber, hasAutomations, grblCode, probeInput, moving, referenceReady,
    haltPlan, halt, control, transports, transportActors, homingActive, proof
  } = deps;
  const throwIf = (err) => {
    if (err) {
      throw err;
    }
  };

  const refusal = (code, params = {}) => {
    const err = conflict(PLATE_MESSAGES[code].replace(/\{(\w+)\}/g, (all, name) => String(params[name])));
    err.code = code;
    err.params = params;
    return err;
  };

  const connected = (c) => controllers()[c.options.port] === c && !c.isClose() && !!c.runner;

  // The plate probe runs at rest, or during a pause the program asked for
  // (tool change) once the machine has stopped, with the probe free, the
  // spindle still and the modal state known: G90 and G21.
  const zeroZReady = (c) => {
    available(c);
    const r = record(c);
    if (homingActive(r)) {
      const err = conflict(HOMING_MESSAGE);
      err.code = 'ETOUCH_MOTION_HOMING';
      err.params = {};
      throw err;
    }
    if (r.probing) {
      throw conflict('Palpage en cours.');
    }
    // A jog of ours sent and not over, even before Grbl reports Jog (F1).
    if (moving && moving(c, r)) {
      throw conflict('Déplacement en cours : attendez le retour au repos (Idle).');
    }
    if (r.loading) {
      throw conflict('Chargement en cours.');
    }
    const programPause = c.workflow.state === 'paused' && ['M0', 'M1', 'M6'].includes(pauseKind(c));
    if (c.workflow.state !== 'idle' && !programPause) {
      throw conflict('Le zéro Z avec plaque se règle au repos ou pendant une pause du programme (M0, M1, M6).');
    }
    const status = controllerStatus(c);
    if (status.activeState !== 'Idle') {
      throw conflict('La machine doit être au repos (Idle).');
    }
    const feeder = c.feeder.toJSON();
    if (feeder.queue || feeder.pending) {
      throw conflict('Des commandes sont en attente.');
    }
    spindleStill(c);
    if (!modalFresh(r)) {
      throw conflict('État modal ($G) trop ancien : attendre un rapport récent.');
    }
    const modal = ((c.runner.state && c.runner.state.parserstate) || {}).modal || {};
    if (modal.distance !== 'G90') {
      throw conflict('Mode relatif (G91) actif : le zéro Z avec plaque exige G90.');
    }
    if (modal.units !== 'G21') {
      throw conflict('Unités en pouces (G20) : le zéro Z avec plaque exige G21.');
    }
    // The positions read back are in the report units: $13=1 reports inches
    // whatever G21 says, and they would be sent back as millimetres.
    if (settingNumber(allSettings(c), 13) !== 0) {
      throw conflict('Rapports en pouces ($13=1) ou réglage $13 inconnu : le zéro Z avec plaque exige $13=0.');
    }
    // During a program pause, the probe ends in G0 with F25: the program's own
    // motion mode and feed are sent back at the end, which Grbl accepts without
    // axis words for G0 and G1 only.
    if (programPause && modal.motion !== 'G0' && !(modal.motion === 'G1' && Number(((c.runner.state && c.runner.state.parserstate) || {}).feedrate) > 0)) {
      throw conflict('Mode de déplacement ' + (modal.motion || 'inconnu') + ' actif : pendant une pause, le zéro Z avec plaque exige G0 ou G1 avec une avance.');
    }
    if (!r.wcs) {
      throw conflict('Repère de travail inconnu : attendre un rapport $G.');
    }
    if (axisNumber(status.wpos && status.wpos.z) === null) {
      throw conflict('Position Z inconnue.');
    }
    const probe = probeInput.inspect(c.options.port);
    const stuck = probeContactRefusal(probe);
    if (stuck) {
      throw stuck;
    }
    if (!probe.fresh) {
      throw conflict('Entrée sonde : rapport trop ancien.');
    }
    if (probe.state === 'contact') {
      throw conflict('La sonde est déjà en contact : dégagez-la avant de palper.');
    }
    if (probe.code !== 'EXPLICIT' && probe.code !== 'MISSING') {
      throw conflict('Entrée sonde illisible dans le rapport Grbl.');
    }
    if (hasAutomations(config)) {
      throw conflict('Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.');
    }
    // Lot C1, after every guard of before: the spindle proven stopped (a whole FS: at 0 in the last
    // report, a recent $G naming M5 alone), a proven rest, and Z read from the report itself.
    throwIf(proof.spindleRefusal(r));
    throwIf(proof.positionRefusal(r));
    if (proof.posOf(r, 'w', 'Z') === null) {
      throw conflict('Position Z inconnue.');
    }
  };

  const plateParams = (body) => {
    const thickness = Number(body.thickness);
    const search = Number(body.search);
    if (!Number.isFinite(thickness) || thickness <= 0 || thickness > PLATE.maxThickness) {
      throw conflict('Épaisseur de plaque invalide (plus de 0 et au plus ' + PLATE.maxThickness + ' mm).');
    }
    if (!Number.isFinite(search) || search < PLATE.minSearch || search > PLATE.maxSearch) {
      throw conflict('Distance de recherche invalide (' + PLATE.minSearch + ' à ' + PLATE.maxSearch + ' mm).');
    }
    return { thickness: Math.round(thickness * 1000) / 1000, search: Math.round(search * 1000) / 1000 };
  };

  // C-07: on a machine whose Z travel and convention are known (homed, $22=1, $132, $23), both
  // G38.2 targets (machine Z − search, then at worst another backOff lower) stay EDGE_MM above
  // the low end; `max` is the longest search
  // allowed from here. A position outside the assumed travel allows none. Travel unknown: no check.
  const plateTravel = (c, params) => {
    const r = record(c);
    // Lot C1: the machine Z of the last report itself.
    const z = proof.posOf(r, 'm', 'Z');
    const env = envelopeOf(allSettings(c), r.homed, { wcoSeen: r.wcoSeen, wposReported: r.wposReported, homeAt: r.homeMpos }).Z;
    const at = limitsAt(env, z, 'Z');
    if (!at.limits && !at.outside) {
      return;
    }
    // The second touch can go backOff below the first contact, which may be at the first target.
    const room = at.limits ? z - (at.limits.low + EDGE_MM) - PLATE.backOff : 0;
    if (params.search > room) {
      throw refusal('ETOUCH_PLATE_TRAVEL', { search: fmt(params.search), max: fmt(Math.max(0, Math.floor(room * 1000) / 1000)) });
    }
  };

  // Grbl's answers to lines the touch service sends through CNCjs's feeder:
  // the feeder clears `pending` as soon as it sends its last line, before
  // Grbl answers, so only the `ok` tells that a line was executed (G38.2 and
  // G4 answer once done). The `ok` that follows a $G reply belongs to CNCjs's
  // own parser state query, sent every 500 ms, paused or not.
  const answers = (c, r) => {
    const runner = c.runner;
    // gcAtOk (lot C1): the count of $G reports at the ok of this line; a $G that says M5 counts for
    // the next line only when it came after it.
    const t = { oks: 0, error: null, reportsAtOk: 0, reportsAtError: 0, gcAtOk: Infinity };
    // A $G reply already parsed whose ok is still on its way (CNCjs's own flag).
    let parserReply = !!(c.actionMask && c.actionMask.queryParserState && c.actionMask.queryParserState.reply);
    const onParser = () => {
      parserReply = true;
    };
    const onOk = () => {
      if (parserReply) {
        parserReply = false;
        return;
      }
      t.oks += 1;
      t.reportsAtOk = r.reports;
      t.gcAtOk = r.gcCount || 0;
    };
    const onError = (res) => {
      parserReply = false;
      t.error = grblCode(res) || -1;
      t.reportsAtError = r.reports;
    };
    runner.on('parserstate', onParser);
    runner.on('ok', onOk);
    runner.on('error', onError);
    t.done = () => {
      runner.removeListener('parserstate', onParser);
      runner.removeListener('ok', onOk);
      runner.removeListener('error', onError);
    };
    return t;
  };

  // Resolves once the line sent is acknowledged and two reports received after
  // its `ok` show the machine idle (a move answers `ok` when it is planned;
  // the second report is at least one polling period later); rejects on an
  // alarm, a Grbl error, a lost controller or the time limit.
  const quiet = (c, r, t, limitMs) => new Promise((resolve, reject) => {
    const startups = r.startups;
    const deadline = clock() + limitMs;
    const check = () => {
      if (r.probing && r.probing.cancelled) {
        reject(conflict('Palpage interrompu par l’opérateur.'));
        return;
      }
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner || !c.feeder || r.startups !== startups) {
        reject(conflict('Connexion machine perdue pendant le palpage.'));
        return;
      }
      const state = controllerStatus(c).activeState || '';
      if (/^Alarm/.test(state)) {
        reject(conflict('Alarme pendant le palpage (' + (r.alarm ? 'ALARM:' + r.alarm : 'code non reçu') + ') : arrêtez le travail, déverrouillez ($X) et vérifiez la sonde.'));
        return;
      }
      if (r.probing && r.probing.error) {
        reject(conflict('Grbl a refusé une ligne du palpage (error:' + r.probing.error + ').'));
        return;
      }
      if (t.error) {
        reject(conflict('Grbl a refusé une ligne du palpage (error:' + t.error + ').'));
        return;
      }
      if (t.oks >= 1 && state === 'Idle' && r.reports >= t.reportsAtOk + 2) {
        resolve();
        return;
      }
      if (clock() > deadline) {
        reject(conflict('Palpage sans réponse à temps : arrêtez et vérifiez la machine.'));
        return;
      }
      later(c, r, check, 100, () => reject(conflict('Palpage abandonné (service arrêté ou contrôleur retiré) : vérifiez la machine.')));
    };
    check();
  });

  const zeroZ = (c, t) => {
    zeroZReady(c);
    // C-18: no work zero on a machine without its reference ($22=1), checked again at the run.
    if (referenceReady) {
      referenceReady(c);
    }
    const r = record(c);
    const p = t.params;
    // C-07: the search fits in the Z travel, checked again at the run.
    plateTravel(c, p);
    // Lot C1: the work Z of the last report itself (the plate reads its contact in the status reports).
    const zOf = () => proof.posOf(r, 'w', 'Z');
    // outstanding: a line sent and not over (C-08: a stop while the report still says Idle holds it).
    // halted: the stop sent a feed hold or a reset, and what it is proven against.
    // abort: the code of a stop by the supervisor (C-17), null for Arrêter or a socket stop.
    // The probe is bound to the device whose stream confirmed it, and to the lease as it was then.
    const device = (typeof t.transportId === 'string' && transportActors.get(t.transportId)) || null;
    const probing = {
      kind: 'plate',
      contact: null,
      error: null,
      outstanding: false,
      probed: false,
      cancelled: false,
      abort: null,
      halted: null,
      deadline: null,
      done: false,
      startups: r.startups,
      transportId: t.transportId,
      deviceKey: keyOf(device),
      owner: keyOf(control.inspect(c.options.port).owner),
      lostSince: null,
      // Lot C1: what the spindle watch compares with, noted at the start.
      ref: { hints: r.spinHints }
    };
    // A stream of the device is open (or, for a client without identity, the one that confirmed).
    const streamOpen = () => (probing.deviceKey
      ? Array.from(transports).some((id) => keyOf(transportActors.get(id)) === probing.deviceKey)
      : transports.has(probing.transportId));
    probing.streamOpen = streamOpen;
    // What stops the probe now, in this order: the stream lost past its grace, the lease changed,
    // stale reports, a line past its time limit (C-17).
    const verdict = () => {
      // A banner ends the old sequence even when the new session reports Idle (no homing lock).
      if (r.startups !== probing.startups) {
        probing.cancelled = true;
        return;
      }
      if (streamOpen()) {
        probing.lostSince = null;
      } else if (probing.lostSince === null) {
        probing.lostSince = clock();
      }
      if (probing.lostSince !== null && clock() - probing.lostSince >= STREAM_GRACE_MS) {
        stop(c, r, 'ETOUCH_PLATE_STREAM');
      } else if (keyOf(control.inspect(c.options.port).owner) !== probing.owner) {
        stop(c, r, 'ETOUCH_PLATE_CONTROL');
      } else if (!Number.isFinite(r.seen) || clock() - r.seen > STALE_MS || !proof.posYoung(r)) {
        // Lot C1: and no position reported itself for that long.
        stop(c, r, 'ETOUCH_PLATE_STALE');
      } else if (probing.deadline !== null && clock() > probing.deadline) {
        stop(c, r, 'ETOUCH_PLATE_TIMEOUT');
      } else if (proof.spindleWatch(r, probing.ref)) {
        // Lot C1: a sign of a running spindle since the start, or no whole FS: for 2.5 s.
        stop(c, r, 'ETOUCH_PLATE_SPINDLE');
      }
    };
    probing.verdict = () => {
      if (r.probing === probing && !probing.done && !probing.cancelled) {
        verdict();
      }
    };
    const watch = () => {
      if (r.probing !== probing || probing.done) {
        return;
      }
      probing.verdict();
      later(c, r, watch, SUPERVISE_MS);
    };
    // Lot C1: polls `missing()` ('' once the proof is there, else the code of the stop it would
    // cause) every SUPERVISE_MS until `limitAt`. `then` runs in the very step that saw the proof;
    // a proof that stays missing stops the probe (halt.js, never a jog cancel).
    const awaitProof = (missing, limitAt, then, reject) => {
      const check = () => {
        probing.verdict();
        if (probing.cancelled) {
          reject(conflict('Palpage interrompu par l’opérateur.'));
          return;
        }
        const code = missing();
        if (!code) {
          then();
          return;
        }
        if (clock() > limitAt) {
          stop(c, r, code);
          reject(refusal(code));
          return;
        }
        later(c, r, check, SUPERVISE_MS, () => reject(conflict('Palpage abandonné (service arrêté ou contrôleur retiré) : vérifiez la machine.')));
      };
      check();
    };
    // The line sent last: the counts at its ok, and until when the proofs after it are waited for.
    let last = null;
    // `from`: where the machine stood (both frames, active system) at the proven rest the line was
    // computed from. Every line after the first leaves only (lot C1, § 2.5), in the step of its
    // write: from a proven rest after the ok of the previous line, the spindle proven stopped after
    // that ok, and the machine still at `from`. Otherwise the probe stops; nothing is computed again.
    const send = (line, limitMs, from = null) => new Promise((resolve, reject) => {
      const write = () => {
        if (last && proof.moved(from, proof.place(r))) {
          stop(c, r, 'ETOUCH_PLATE_POSITION');
          reject(refusal('ETOUCH_PLATE_POSITION'));
          return;
        }
        const t = answers(c, r);
        const sentAt = clock();
        probing.outstanding = true;
        probing.probed = probing.probed || /^G38/.test(line);
        probing.deadline = sentAt + limitMs;
        c.command('gcode', line);
        quiet(c, r, t, limitMs).then(() => {
          t.done();
          last = { reportsAtOk: t.reportsAtOk, gcAtOk: t.gcAtOk, until: Math.min(clock() + PROOF_WAIT_MS, sentAt + limitMs) };
          // After quiet: the rest is proven (two reports after the ok that carry the position, Idle
          // and agreeing) before anything is read from it.
          awaitProof(() => (proof.restedSince(r, last.reportsAtOk) ? '' : 'ETOUCH_PLATE_STALE'), last.until, () => {
            probing.outstanding = false;
            probing.deadline = null;
            resolve();
          }, reject);
        }, (err) => {
          // A line Grbl refused (error:n) never ran.
          if (t.error) {
            probing.outstanding = false;
          }
          t.done();
          reject(err);
        });
      };
      // The supervisor's checks at that very moment, then: stopped (Arrêter, a socket stop, the
      // supervisor), nothing more leaves.
      probing.verdict();
      if (probing.cancelled) {
        reject(conflict('Palpage interrompu par l’opérateur.'));
        return;
      }
      if (!last) {
        write();
        return;
      }
      const sent = last;
      awaitProof(() => {
        if (!proof.restedSince(r, sent.reportsAtOk)) {
          return 'ETOUCH_PLATE_STALE';
        }
        return proof.spindleHeld(r, sent) ? '' : 'ETOUCH_PLATE_SPINDLE';
      }, sent.until, write, reject);
    });
    r.probing = probing;
    later(c, r, watch, SUPERVISE_MS);
    changed();
    const z0 = zOf();
    // What the paused program expects back (see zeroZReady).
    const parser = (c.runner.state && c.runner.state.parserstate) || {};
    const inPause = c.workflow.state === 'paused';
    const feed = Number(parser.feedrate);
    const restore = inPause ? parser.modal.motion + (feed > 0 ? ' F' + fmt(feed) : '') : null;
    return send('G38.2 Z' + fmt(z0 - p.search) + ' F' + PLATE.fastFeed, 60000 * p.search / PLATE.fastFeed + 15000)
      .then(() => {
        const cz = zOf();
        if (cz === null || cz > z0 - 0.01 || cz <= z0 - p.search + 0.001) {
          throw conflict('Palpage sans contact net (Z ' + cz + ' depuis ' + z0 + ').');
        }
        r.probing.contact = cz;
        return send('G0 Z' + fmt(cz + PLATE.backOff), 15000, proof.place(r));
      })
      .then(() => send('G38.2 Z' + fmt(r.probing.contact - PLATE.backOff) + ' F' + PLATE.slowFeed, 30000, proof.place(r)))
      .then(() => {
        r.probing.contact = zOf();
        r.probing.machineZ = proof.posOf(r, 'm', 'Z');
        return send('G10 L20 P0 Z' + fmt(p.thickness), 15000, proof.place(r));
      })
      .then(() => {
        const now = zOf();
        if (now === null || Math.abs(now - p.thickness) > 0.05) {
          throw conflict('Le repère n’a pas pris la valeur attendue (Z ' + now + ' au lieu de ' + p.thickness + ').');
        }
        // Start height in the new frame: the retract never ends above it (a start
        // close to the plate at the top of the Z travel would hit the Z switch).
        r.probing.retract = Math.min(p.thickness + PLATE.clearance, z0 - r.probing.contact + p.thickness);
        return send('G0 Z' + fmt(r.probing.retract), 15000, proof.place(r));
      })
      .then(() => (restore ? send(restore, 15000, proof.place(r)) : null))
      .then(() => {
        probing.done = true;
        r.zeroZ = { at: Date.now(), thickness: p.thickness, machineZ: r.probing.machineZ, wcs: r.wcs };
        const retract = r.probing.retract;
        r.probing = null;
        // The G10 loads the offset again: it is proven anew (D2).
        r.offset.invalidate('zero');
        changed();
        return { message: 'Zéro Z réglé avec la plaque de ' + p.thickness + ' mm (contact à Z machine ' + fmt(r.zeroZ.machineZ) + ', repère ' + r.zeroZ.wcs + '). Outil dégagé à Z ' + fmt(retract) + '.' };
      })
      .catch((failure) => {
        // A line past its time limit may still move: stopped like the supervisor does (C-17).
        if (!probing.cancelled && probing.deadline !== null && clock() > probing.deadline) {
          stop(c, r, 'ETOUCH_PLATE_TIMEOUT');
        }
        // A stop of the supervisor gives its own coded reason.
        const err = probing.abort ? refusal(probing.abort) : failure;
        const failed = () => {
          const state = controllerStatus(c).activeState || '';
          // C-55: stopped at rest without a reset, G38.2 must not stay the motion mode (a later line
          // of axis words alone would probe). No move; never without the device's stream.
          if (!probing.halted && probing.probed && connected(c) && streamOpen() && r.startups === probing.startups && state === 'Idle') {
            c.command('gcode', 'G0');
          }
          probing.done = true;
          r.zeroZ = { at: Date.now(), failed: err.message, code: err.code || null };
          // The modal state the paused program relies on is no longer known.
          if (inPause && r.job) {
            r.job.probeFailed = true;
          }
          if (r.probing === probing) {
            r.probing = null;
          }
          // The G10 may have been written (D2).
          r.offset.invalidate('zero');
          changed();
          throw err;
        };
        // A stop that sent a feed hold or a reset keeps the lock until it is proven (C-08).
        return probing.halted ? released(c, r, probing.halted).then(failed) : failed();
      });
  };

  // Resolves once a stop is proven (see RELEASE_MS), or the controller or its record is gone.
  const released = (c, r, halted) => new Promise((resolve) => {
    const since = clock();
    const check = () => {
      const newer = r.reports > halted.reports;
      const state = controllerStatus(c).activeState || '';
      if (!connected(c) || r.startups !== halted.startups || (newer && /^Alarm/.test(state)) ||
          (newer && clock() - since >= RELEASE_MS && state === 'Idle')) {
        resolve();
        return;
      }
      later(c, r, check, 50, resolve);
    };
    check();
  });

  // Arrêter, a socket stop (job-service.js), the supervisor (`code`, C-17): the plate probe in
  // progress sends no further line, and a feed hold then a reset (halt.js) stop a move that may
  // run, a line just sent whose report still says Idle included (C-08, C-09). False when no plate
  // probe runs.
  // `spindle` (lot C1, « Arrêter la broche »): the spindle must be stopped by the board itself, so
  // a reset is asked for even at rest between two lines, where halt.js would ask for nothing.
  const stop = (c, r, code = null, spindle = false) => {
    const probing = r.probing;
    if (!probing || probing.kind !== 'plate') {
      return false;
    }
    if (probing.cancelled) {
      return true;
    }
    probing.cancelled = true;
    probing.abort = code;
    if (connected(c)) {
      let plan = haltPlan(c);
      if (!plan && probing.outstanding) {
        plan = 'hold';
      }
      if (!plan && spindle) {
        plan = 'reset';
      }
      c.command('feeder:stop');
      c.command('gcode:stop');
      halt(c, plan);
      if (plan) {
        probing.halted = { startups: r.startups, reports: r.reports };
      }
    }
    changed();
    return true;
  };

  // « Arrêter la broche » during a plate probe (lot C1, § 2.8 and § 4.1 point 5): the probe stops and
  // the board is reset (after a feed hold when something may move), which stops the spindle; no M5
  // joins the lines of the probe, no jog cancel is sent. A probe already stopped without a reset on
  // its way (the supervisor's stop at rest) gets its reset now. Null when the board restarted since
  // the probe started: nothing of it is left to stop, the caller sends its ordinary M5.
  const spindleStop = (c, r) => {
    const probing = r.probing;
    if (!probing || probing.kind !== 'plate' || !connected(c) || r.startups !== probing.startups) {
      return null;
    }
    if (!probing.cancelled) {
      stop(c, r, null, true);
    } else if (!probing.halted) {
      c.command('reset');
      probing.halted = { startups: r.startups, reports: r.reports };
      changed();
    }
    return { message: 'Arrêt broche pendant un palpage : palpage interrompu, réinitialisation de la carte demandée. Vérifiez l’immobilisation et l’arrêt de la broche ; le zéro Z n’est pas réglé.' };
  };

  // The lease changed (job-service.js, release or takeover): the supervisor's checks now (C-12).
  const supervise = (c, r) => {
    if (r.probing && r.probing.kind === 'plate' && r.probing.verdict) {
      r.probing.verdict();
    }
  };

  // A plate probe of this stream's device keeps the stream from being rotated (touch-stream.js).
  const holds = (transportId) => {
    const key = keyOf(transportActors.get(transportId));
    return (r) => {
      const probing = r.probing;
      return !!(probing && probing.kind === 'plate' && !probing.done && !probing.cancelled &&
        (key ? probing.deviceKey === key : probing.transportId === transportId));
    };
  };

  // A stream closed (job-service closeTransport, after its removal): unless the server rotated it,
  // the tablet is gone, and with the device's last stream the probe stops at once (C-17).
  const transportClosed = (c, r, actor, rotated) => {
    const probing = r.probing;
    if (rotated || !probing || probing.kind !== 'plate' || probing.done || probing.cancelled || !probing.streamOpen || probing.streamOpen()) {
      return;
    }
    stop(c, r, 'ETOUCH_PLATE_STREAM');
  };

  return { zeroZReady, plateParams, plateTravel, answers, zeroZ, quiet, stop, spindleStop, supervise, holds, transportClosed };
};
