// Stop of a running or held program for the touch job service: how the axes
// are brought to rest before CNCjs's soft reset (see job-service.js, 'stop').
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { controllerStatus } from './motion-preflight.js';

// Stop: how long a feed hold may take to bring the axes to rest before the
// soft reset is sent anyway.
const HALT_MS = 5000;

// deps (from job-service.js):
//   clock()                 monotonic time, in ms
//   controllers()           CNCjs's registry of controllers, by port
//   record(c)               the service's record of a controller (reports counter)
//   later(c, r, fn, ms)     deferred step, cancelled with the record
//   spindleOn(c)            the spindle turns, or is commanded on
// Returns { haltPlan(c) → 'hold' | 'settle' | 'reset' | '', halt(c, plan) }.
export const createHalt = (deps) => {
  const { clock, controllers, record, later, spindleOn } = deps;

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
  const halt = (c, plan) => {
    if (plan === 'reset') {
      c.command('reset');
      return;
    }
    if (plan !== 'hold' && plan !== 'settle') {
      return;
    }
    if (plan === 'hold') {
      c.command('feedhold');
    }
    const deadline = clock() + HALT_MS;
    const r = record(c);
    const mark = r.reports;
    // A feed hold byte lost on the link (seen with the simulator) would leave the axes
    // running until the time limit: while a newer report still says Run, it is sent again.
    let heldAt = clock();
    const wait = () => {
      if (controllers()[c.options.port] !== c || c.isClose() || !c.runner) {
        return;
      }
      if (r.reports <= mark && clock() <= deadline) {
        later(c, r, wait, 50);
        return;
      }
      const s = controllerStatus(c);
      const state = s.activeState || '';
      if (/^(Alarm|Door)/.test(state)) {
        return;
      }
      if ((state === 'Hold' && Number(s.subState) !== 1) || state === 'Idle' || clock() > deadline) {
        c.command('reset');
        return;
      }
      if (state === 'Run' && clock() - heldAt >= 400) {
        heldAt = clock();
        c.command('feedhold');
      }
      later(c, r, wait, 50);
    };
    later(c, r, wait, 50);
  };

  return { haltPlan, halt };
};
