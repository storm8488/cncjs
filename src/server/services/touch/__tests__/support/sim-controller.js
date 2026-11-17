// The real GrblController (CNCjs's sender, workflow, feeder, `ok` handling and its own 250 ms poll
// of `?` and `$G`) whose serial line is the repository's Grbl simulator: every byte CNCjs writes
// goes to the simulator, every line the simulator says is parsed by CNCjs's GrblRunner. Unlike
// sim-bridge.js, the lines of a program are streamed too (F2, pause-retract-lunyee.test.js).
// Build it under jest fake timers: the simulator's planner and CNCjs's poll then run on them.
import GrblController from '../../../../controllers/Grbl/GrblController';
import { createController } from '../../../../controllers/__tests__/helpers/createController';

const GrblSimulator = require('../../../../../../grbl-simulator/grbl-simulator');

// `written`: every write of CNCjs, in order; `errors`: every error:n the simulator answered.
export const simController = (options = {}) => {
  const sim = new GrblSimulator({ profile: 'lunyee', ...options });
  const { controller } = createController(GrblController);
  const written = [];
  const errors = [];
  let closed = false;
  const parse = (text) => {
    if (closed || typeof text !== 'string') {
      return;
    }
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      if (/^error:/.test(l)) {
        errors.push(l);
      }
      controller.runner.parse(l);
    });
  };
  sim.on('data', parse);
  controller.connection = {
    isOpen: true,
    write: (data) => {
      if (closed) {
        return;
      }
      written.push(data);
      if (/\n$/.test(data)) {
        data.split('\n').filter((l) => l.trim()).forEach((line) => sim.processLineAsync(line, parse));
      } else {
        Array.from(data).forEach((ch) => parse(sim.processRealtimeCommand(ch)));
      }
    }
  };
  const close = () => {
    closed = true;
    sim.stopPlannerExecutor();
    controller.destroy();
  };
  return { sim, controller, written, errors, close };
};
