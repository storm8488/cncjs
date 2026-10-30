// Reservation of the machine for a host command (shutdown, restart, service
// restart…) for the touch job service: see job-service.js and touch/index.js.
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

// deps (from job-service.js):
//   isDisposed()            the service was disposed
//   clock()                 monotonic time, in ms
//   conflict(message)       a 409 error
//   controllers()           CNCjs's registry of controllers, by port
//   record(c)               the service's record of a controller (seen, probing, loading)
//   homingActive(r)         a homing cycle sent and not over
//   moving(c, r)            a jog of the service sent and not over (motion.js)
//   changed()               notifies the stream listeners
//   MAX_REPORT_AGE_MS       age beyond which a status report is not trusted
// Returns { reserve({id, title, commands}) → {release()}, current() → the
// reservation {id, title, since} or null, view() → {title, since} or null, clear() }.
export const createSystemCommands = (deps) => {
  const { isDisposed, clock, conflict, controllers, record, homingActive, moving, changed, MAX_REPORT_AGE_MS } = deps;

  // Host command (shutdown, restart…) reserved against the machine: see reserveSystemCommand.
  let systemCommand = null;

  // A host command (shutdown, restart, service restart…) is about to run on
  // the computer: refused while any connected controller works, pauses, moves,
  // homes, probes or loads, or while its report is too old to tell; exclusive
  // otherwise. Taken synchronously by the API before the task starts, so no
  // start can slip in between; while it holds, available() refuses every
  // action that moves the machine and the stream shows it to the operator.
  // The caller releases it when the task ends.
  const reserveSystemCommand = ({ id, title, commands } = {}) => {
    if (isDisposed()) {
      throw conflict('Service indisponible.');
    }
    if (systemCommand) {
      throw conflict('Commande système déjà en cours (' + systemCommand.title + ').');
    }
    const registry = controllers();
    Object.keys(registry).forEach((port) => {
      const c = registry[port];
      if (!c || c.isClose()) {
        return;
      }
      if (c.workflow && c.workflow.state !== 'idle') {
        throw conflict('Un travail est en cours ou en pause sur ' + port + ' : commande système refusée.');
      }
      const state = controllerStatus(c).activeState || '';
      if (['Run', 'Hold', 'Home', 'Jog'].includes(state) || /^Door/.test(state)) {
        throw conflict('Machine en mouvement ou occupée (' + state + ') sur ' + port + ' : commande système refusée.');
      }
      const feeder = c.feeder && typeof c.feeder.toJSON === 'function' ? c.feeder.toJSON() : {};
      if (feeder.queue || feeder.pending) {
        throw conflict('Commandes en attente sur ' + port + ' : commande système refusée.');
      }
      if (c.type === 'Grbl') {
        // A controller may not have been listed yet (no stream client): give
        // it its record and status listener here, so a retry can judge its
        // freshness (the stream heartbeat does the same, see observe()).
        const r = record(c);
        if (!Number.isFinite(r.seen) || clock() < r.seen || clock() - r.seen > MAX_REPORT_AGE_MS) {
          throw conflict('État machine trop ancien sur ' + port + ' : attendre un rapport récent, puis réessayer.');
        }
        if (r.probing) {
          throw conflict('Palpage en cours sur ' + port + ' : commande système refusée.');
        }
        if (r.loading) {
          throw conflict('Chargement en cours sur ' + port + ' : commande système refusée.');
        }
        if (homingActive(r)) {
          throw conflict('Prise d’origine en cours sur ' + port + ' : commande système refusée.');
        }
        // A jog of the touch service sent and not over, even before Grbl reports Jog (F1).
        if (moving && moving(c, r)) {
          throw conflict('Déplacement en cours sur ' + port + ' : commande système refusée.');
        }
      }
    });
    const reservation = {
      id: String(id || ''),
      title: String(title || commands || '').slice(0, 80),
      since: Date.now()
    };
    systemCommand = reservation;
    changed();
    return {
      release: () => {
        if (systemCommand !== reservation) {
          return;
        }
        systemCommand = null;
        changed();
      }
    };
  };

  // What the operator is shown while a host command runs.
  const systemCommandOf = () => (systemCommand ? { title: systemCommand.title, since: systemCommand.since } : null);

  return {
    reserve: reserveSystemCommand,
    current: () => systemCommand,
    view: systemCommandOf,
    // The service is disposed: no reservation holds any more.
    clear: () => {
      systemCommand = null;
    }
  };
};
