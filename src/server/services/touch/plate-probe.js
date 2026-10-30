// Z zero with a touch plate for the touch job service: the guard, the
// parameters and the probing sequence, plus the tracking of Grbl's answers
// to the lines the service sends itself (also used by real moves and the
// spindle restart after a tool change). See job-service.js.
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

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
// Returns { zeroZReady(c), plateParams(body), answers(c, r), zeroZ(c, ticket) }.
export const createPlateProbe = (deps) => {
  const {
    config, clock, conflict, controllers, record, later, changed, available, spindleStill,
    pauseKind, modalFresh, allSettings, settingNumber, hasAutomations, grblCode, probeInput
  } = deps;

  // The plate probe runs at rest, or during a pause the program asked for
  // (tool change) once the machine has stopped, with the probe free, the
  // spindle still and the modal state known: G90 and G21.
  const zeroZReady = (c) => {
    available(c);
    const r = record(c);
    if (r.probing) {
      throw conflict('Palpage en cours.');
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

  // Grbl's answers to lines the touch service sends through CNCjs's feeder:
  // the feeder clears `pending` as soon as it sends its last line, before
  // Grbl answers, so only the `ok` tells that a line was executed (G38.2 and
  // G4 answer once done). The `ok` that follows a $G reply belongs to CNCjs's
  // own parser state query, sent every 500 ms, paused or not.
  const answers = (c, r) => {
    const runner = c.runner;
    const t = { oks: 0, error: null, reportsAtOk: 0 };
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
    };
    const onError = (res) => {
      parserReply = false;
      t.error = grblCode(res) || -1;
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
    const deadline = clock() + limitMs;
    const check = () => {
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner || !c.feeder) {
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
      if (r.probing && r.probing.cancelled) {
        reject(conflict('Palpage interrompu par l’opérateur.'));
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
    const r = record(c);
    const p = t.params;
    const zOf = () => axisNumber(controllerStatus(c).wpos && controllerStatus(c).wpos.z);
    const send = (line, limitMs) => {
      const t = answers(c, r);
      c.command('gcode', line);
      return quiet(c, r, t, limitMs).then(() => t.done(), (err) => {
        t.done();
        throw err;
      });
    };
    r.probing = { contact: null, error: null };
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
        return send('G0 Z' + fmt(cz + PLATE.backOff), 15000);
      })
      .then(() => send('G38.2 Z' + fmt(r.probing.contact - PLATE.backOff) + ' F' + PLATE.slowFeed, 30000))
      .then(() => {
        const status = controllerStatus(c);
        r.probing.contact = zOf();
        r.probing.machineZ = axisNumber(status.mpos && status.mpos.z);
        return send('G10 L20 P0 Z' + fmt(p.thickness), 15000);
      })
      .then(() => {
        const now = zOf();
        if (now === null || Math.abs(now - p.thickness) > 0.05) {
          throw conflict('Le repère n’a pas pris la valeur attendue (Z ' + now + ' au lieu de ' + p.thickness + ').');
        }
        return send('G0 Z' + fmt(p.thickness + PLATE.clearance), 15000);
      })
      .then(() => (restore ? send(restore, 15000) : null))
      .then(() => {
        r.zeroZ = { at: Date.now(), thickness: p.thickness, machineZ: r.probing.machineZ, wcs: r.wcs };
        r.probing = null;
        changed();
        return { message: 'Zéro Z réglé avec la plaque de ' + p.thickness + ' mm (contact à Z machine ' + fmt(r.zeroZ.machineZ) + ', repère ' + r.zeroZ.wcs + '). Outil dégagé à Z ' + fmt(p.thickness + PLATE.clearance) + '.' };
      })
      .catch((err) => {
        r.zeroZ = { at: Date.now(), failed: err.message };
        // The modal state the paused program relies on is no longer known.
        if (inPause && r.job) {
          r.job.probeFailed = true;
        }
        r.probing = null;
        changed();
        throw err;
      });
  };

  return { zeroZReady, plateParams, answers, zeroZ };
};
