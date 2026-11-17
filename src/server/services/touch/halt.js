// Stop of a running or held program for the touch job service: how the axes
// are brought to rest before CNCjs's soft reset (see job-service.js, 'stop').
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

// Stop: how long a feed hold may take to bring the axes to rest before the
// soft reset is sent anyway.
const HALT_MS = 5000;
// After the reset: reports received this long after it speak of the board after the reset.
const RESET_SETTLE_MS = 500;

// F2, fourth review: what moves is refused while a stop runs (job-service.js available(), socketRefusal).
export const HALT_BUSY = 'Arrêt en cours : attendez sa fin (réinitialisation de la carte), ou touchez de nouveau Arrêter.';
export const SOCKET_HALT_BUSY = 'Arrêt en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).';

// deps (from job-service.js):
//   clock()                 monotonic time, in ms
//   controllers()           CNCjs's registry of controllers, by port
//   record(c)               the service's record of a controller (reports counter)
//   later(c, r, fn, ms)     deferred step, cancelled with the record
//   spindleOn(c)            the spindle turns, or is commanded on
//   changed()               a snapshot field changed (r.halting)
// Returns { haltPlan(c) → 'hold' | 'settle' | 'reset' | '', halt(c, plan) }.
export const createHalt = (deps) => {
  const { clock, controllers, record, later, spindleOn, changed = () => {} } = deps;

  // CNCjs's forced stop decides from its own copy of the state, refreshed every
  // 250 ms: it sends a feed hold only if that copy says Run and a reset only if
  // it says Hold, so lines already buffered in Grbl kept running when Grbl was
  // Idle at that moment (a G4 dwell, the first instants of a start, a tool
  // change with the spindle on). The decision is taken here from the latest
  // report, before CNCjs rewinds its sender. Moving axes, or buffered lines that
  // may start moving any moment (the report can be 250 ms old), get a feed hold
  // first (in Idle Grbl turns Hold:0 at once and starts no new block), then a
  // reset once a report newer than the request shows them at rest, or after
  // HALT_MS: a reset in motion would raise ALARM:3 and lose the position. A hold
  // or a spindle left on with nothing buffered is reset at once.
  const haltPlan = (c) => {
    const s = controllerStatus(c);
    const state = s.activeState || '';
    const sender = (c.sender && c.sender.state) || {};
    const feeder = c.feeder.toJSON();
    if (state === 'Run') {
      return 'hold';
    }
    if (state === 'Hold' && Number(s.subState) === 1) {
      return 'settle';
    }
    if (state === 'Hold') {
      return 'reset';
    }
    if (Number(sender.sent) > Number(sender.received) || feeder.queue || feeder.pending) {
      return 'hold';
    }
    return spindleOn(c) ? 'reset' : '';
  };
  // The stop in progress of a retract (F2, fourth review, `reserve`): r.halting from its first byte
  // until it is observed over, one reservation for every guard (job-service.js available() for the
  // tablet, socketRefusal for the PC, the host commands): a stop that a move of the tablet or of the
  // PC could overtake is not over. Over: the board restarted (the banner of the reset, or any banner), an Alarm reported,
  // the port gone, or, the reset sent and its banner not received, two reports at rest received
  // more than RESET_SETTLE_MS after it (no motion left). Arrêter stays offered meanwhile.
  const release = (r, token) => {
    if (r.halting === token) {
      r.halting = null;
      changed();
    }
  };
  // The reset sent: the reservation lasts until the board is seen restarted, or at rest after it.
  const afterReset = (c, r, token, startups) => {
    token.resetAt = clock();
    changed();
    let mark = null;
    const wait = () => {
      if (r.halting !== token) {
        return;
      }
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner || r.startups !== startups) {
        release(r, token);
        return;
      }
      const state = controllerStatus(c).activeState || '';
      if (/^Alarm/.test(state)) {
        release(r, token);
        return;
      }
      if (mark === null && clock() - token.resetAt >= RESET_SETTLE_MS) {
        mark = r.reports;
      }
      if (mark !== null && r.reports >= mark + 2 && state === 'Idle') {
        release(r, token);
        return;
      }
      if (mark !== null && state !== 'Idle') {
        mark = r.reports;
      }
      later(c, r, wait, 50);
    };
    later(c, r, wait, 50);
  };
  const reset = (c, r, token, startups) => {
    c.command('reset');
    if (r.halting === token) {
      afterReset(c, r, token, startups);
    }
  };
  const halt = (c, plan, reserve = false) => {
    const r = record(c);
    const startups = r.startups;
    if (plan !== 'reset' && plan !== 'hold' && plan !== 'settle') {
      return;
    }
    const token = { since: clock(), resetAt: null };
    if (reserve) {
      r.halting = token;
      changed();
    }
    if (plan === 'reset') {
      reset(c, r, token, startups);
      return;
    }
    if (plan === 'hold') {
      c.command('feedhold');
    }
    const deadline = clock() + HALT_MS;
    const mark = r.reports;
    // A feed hold byte lost on the link (seen with the simulator) would leave the axes
    // running until the time limit: while a newer report still says Run, it is sent again.
    let heldAt = clock();
    const wait = () => {
      if (reserve && r.halting !== token) {
        return;
      }
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner || r.startups !== startups) {
        release(r, token);
        return;
      }
      if (r.reports <= mark && clock() <= deadline) {
        later(c, r, wait, 50);
        return;
      }
      const s = controllerStatus(c);
      const state = s.activeState || '';
      if (/^Alarm/.test(state)) {
        release(r, token);
        return;
      }
      // The safety door opened during the wait: Grbl keeps the planned blocks of
      // the stopped program for the next cycle start, so the reset is still due.
      // Door:0 (closed, ready to resume) and Door:1 (open, at rest) are a hold
      // completed; Door:2 (retracting) and Door:3 (restoring) are still in motion.
      const door = /^Door/.test(state);
      const doorAtRest = door && [0, 1].includes(Number(s.subState));
      if ((state === 'Hold' && Number(s.subState) !== 1) || doorAtRest || state === 'Idle' || clock() > deadline) {
        reset(c, r, token, startups);
        return;
      }
      if (state === 'Run' && clock() - heldAt >= 400) {
        heldAt = clock();
        c.command('feedhold');
      }
      // A jog still reported (F2: a lift or a descent cancelled, still decelerating, or its cancel
      // lost on the link): the jog cancel again, never the reset before rest (or the time limit).
      if (state === 'Jog' && clock() - heldAt >= 400) {
        heldAt = clock();
        c.command('jogCancel');
      }
      later(c, r, wait, 50);
    };
    later(c, r, wait, 50);
  };
  // Arrêter touched again while a stop runs: its sequence goes on; once its reset is sent and the
  // board is still not seen restarted nor at rest, the reset again (never while a report says it
  // moves). Returns false when no stop runs.
  const haltAgain = (c) => {
    const r = record(c);
    const token = r.halting;
    if (!token) {
      return false;
    }
    const state = controllerStatus(c).activeState || '';
    if (token.resetAt !== null && clock() - token.resetAt >= RESET_SETTLE_MS && !['Run', 'Jog'].includes(state)) {
      c.command('reset');
      token.resetAt = clock();
    }
    return true;
  };

  return { haltPlan, halt, haltAgain };
};
