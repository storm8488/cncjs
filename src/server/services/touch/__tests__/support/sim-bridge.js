// The repository's Grbl simulator as a CNCjs controller for the real touch service, through
// CNCjs's own GrblRunner parser: real protocol lines both ways, real time. No serial port, no
// machine. Extracted from motion-simulator.test.js (PLAN-CORRECTIONS § 2.3), with:
//   - `writeln`, CNCjs's direct path to the board ($H, $X, the realtime bytes), which the
//     commands `homing`, `unlock`, `reset`, `feedhold` and `cyclestart` take as in GrblController;
//   - `silentConnect`: no banner parsed at the start (the LUNYEE board is not restarted by
//     opening its port: the version is known only from `$I`);
//   - a feeder that sends nothing in Alarm and empties itself, as GrblController's;
//   - what the simulator says by itself (PRB, a deferred alarm, a limit switch) parsed too.
import { EventEmitter } from 'events';
import GrblRunner from '../../../../controllers/Grbl/GrblRunner';

// GrblController: command name → what it writes with writeln.
const WRITTEN = {
  homing: '$H',
  unlock: '$X',
  reset: '\x18',
  feedhold: '!',
  cyclestart: '~'
};
// GRBL_REALTIME_COMMANDS and the extended bytes: written alone, without a newline.
const realtime = (data) => ['~', '!', '?', '\x18'].includes(data) || /[\x80-\xff]/.test(data);

// A controller whose serial line is the simulator: `gcode` lines go through processLineAsync
// (answers parsed by GrblRunner), jogCancel writes 0x85 as a realtime byte, and a status query
// is parsed every 25 ms like CNCjs's poll. `written` keeps every byte sent, in order.
export const bridge = (sim, { silentConnect = false } = {}) => {
  const runner = new GrblRunner();
  const c = {
    type: 'Grbl',
    options: { port: 'SIM' },
    ready: true,
    isClose: () => false,
    runner,
    sender: Object.assign(new EventEmitter(), { state: { name: '', context: {}, total: 0 } }),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    written: []
  };
  Object.defineProperty(c, 'settings', { get: () => runner.settings });
  c.sender.toJSON = () => ({ ...c.sender.state });
  let closed = false;
  const parse = (text) => {
    if (closed) {
      return;
    }
    String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .forEach((l) => runner.parse(l));
  };
  sim.on('data', parse);
  const line = (data) => {
    c.written.push(data + '\n');
    sim.processLineAsync(data, parse);
  };
  c.writeln = (data) => {
    if (realtime(data)) {
      c.written.push(data);
      parse(sim.processRealtimeCommand(data));
    } else {
      line(data);
    }
  };
  c.command = (name, ...args) => {
    if (name === 'gcode') {
      // CNCjs's feeder: nothing is sent in Alarm, and what was fed is dropped.
      if (runner.isAlarm()) {
        return;
      }
      [].concat(args[0]).forEach(line);
    } else if (name === 'jogCancel') {
      c.written.push('\x85');
      parse(sim.processRealtimeCommand('\x85'));
    } else if (WRITTEN[name] !== undefined) {
      c.writeln(WRITTEN[name]);
    } else {
      throw new Error('unexpected command ' + name);
    }
  };
  if (!silentConnect) {
    parse(sim.getStartupMessage());
  }
  parse(sim.listSettings().replace(/ok\s*$/, ''));
  // [GC:…] only: its `ok` would be taken for an answer to a line of ours.
  const modal = () => parse(sim.listParserState().replace(/ok\s*$/, ''));
  modal();
  const poll = setInterval(() => parse(sim.generateStatusReport()), 25);
  const gc = setInterval(modal, 500);
  c.close = () => {
    closed = true;
    clearInterval(poll);
    clearInterval(gc);
  };
  return c;
};
