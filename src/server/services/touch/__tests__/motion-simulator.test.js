/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // keepalives and polls are sequential on purpose
// The real-motion service (F1) against the repository's Grbl 1.1h simulator,
// through CNCjs's own GrblRunner parser: real protocol lines both ways, real
// time. No serial port, no machine. What the simulator does not model is
// listed where it matters (see audit31-machine.md).
import { EventEmitter } from 'events';
import GrblRunner from '../../../controllers/Grbl/GrblRunner';
import { createService } from '../job-service';
import { createControl } from '../control';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };

// A controller whose serial line is the simulator: `gcode` lines go through
// processLineAsync (answers parsed by GrblRunner), jogCancel writes 0x85 as a
// realtime byte, and a status query is parsed every 25 ms like CNCjs's poll.
const bridge = (sim) => {
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
  const parse = (text) => String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
.forEach((l) => runner.parse(l));
  c.command = (name, ...args) => {
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => {
        c.written.push(line + '\n');
        sim.processLineAsync(line, parse);
      });
    } else if (name === 'jogCancel') {
      c.written.push('\x85');
      parse(sim.processRealtimeCommand('\x85'));
    } else {
      throw new Error('unexpected command ' + name);
    }
  };
  parse(sim.getStartupMessage());
  parse(sim.listSettings().replace(/ok\s*$/, ''));
  // [GC:…] only: its `ok` would be taken for an answer to a line of ours.
  const modal = () => parse(sim.listParserState().replace(/ok\s*$/, ''));
  modal();
  const poll = setInterval(() => parse(sim.generateStatusReport()), 25);
  const gc = setInterval(modal, 500);
  c.close = () => {
    clearInterval(poll);
    clearInterval(gc);
  };
  return c;
};

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) {
      return true;
    }
    await wait(20);
  }
  return false;
};

describe('real motion against the Grbl 1.1h simulator (F1)', () => {
  let sim;
  let c;
  let service;

  beforeEach(async () => {
    sim = new GrblSimulator();
    sim.settings[22] = 1; // homing enabled
    sim.settings[25] = 60000; // fast homing for the test (200 mm in 0.2 s)
    sim.settings[110] = 1000;
    sim.settings[111] = 1000;
    c = bridge(sim);
    service = createService({ get: () => ({ SIM: c }) }, { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [] }[key]) }, undefined, { control: createControl() });
    service.list();
    service.openTransport('tA', A);
    await wait(60);
    // Homing seen by the service (Home then Idle): the travel becomes usable.
    sim.processLineAsync('$H', () => {});
    expect(await until(() => service.list()[0].homed === true)).toBe(true);
  });

  afterEach(() => {
    service.dispose();
    c.close();
    sim.stopPlannerExecutor();
  });

  const req = (operation, extra = {}) => service.action({
    port: 'SIM', generation: service.list()[0].generation, transportId: 'tA', action: 'motion', operation, ...extra
  }, A);

  test('a 1 mm step moves the simulated machine by exactly 1 mm, then the next move is accepted', async () => {
    await req('jog', { axis: 'X', direction: -1, step: 1, feed: 1000 });
    expect(c.written).toEqual(['$J=G91 G21 X-1 F1000\n']);
    expect(await until(() => service.list()[0].motion.canJog)).toBe(true);
    expect(sim.machinePosition.x).toBeCloseTo(-1, 3);
    expect(sim.machineState).toBe('Idle');
    await req('jog', { axis: 'Y', direction: -1, step: 0.1, feed: 1000 });
    expect(await until(() => service.list()[0].motion.canJog)).toBe(true);
    expect(sim.machinePosition.y).toBeCloseTo(-0.1, 3);
  });

  test('a continuous jog without keepalives is cancelled by 0x85 long before its bounded end', async () => {
    const res = await req('jog-start', { axis: 'X', direction: -1, feed: 1000 });
    // From X 0 (homed), travel [-200, 0], 1 mm margin: 199 mm, about 12 s at 1000 mm/min.
    expect(c.written[0]).toBe('$J=G91 G21 X-199 F1000\n');
    expect(res.distanceMm).toBe(199);
    expect(await until(() => sim.machineState === 'Jog', 500)).toBe(true);
    // Keepalives for 300 ms, then none (lost network).
    for (let i = 0; i < 3; i++) {
      await wait(100);
      expect(await req('jog-keepalive', { jogId: res.jogId })).toMatchObject({ active: true });
    }
    const lastKeepalive = Date.now();
    expect(await until(() => sim.machineState === 'Idle', 1000)).toBe(true);
    const stoppedAfter = Date.now() - lastKeepalive;
    expect(c.written).toContain('\x85');
    expect(stoppedAfter).toBeLessThan(600);
    expect(service.list()[0].motion.lastJog).toMatchObject({ result: 'cancelled', reason: 'keepalive' });
  });

  test('jog-stop (button released) cancels the simulated jog', async () => {
    const res = await req('jog-start', { axis: 'Y', direction: -1, feed: 1000 });
    expect(await until(() => sim.machineState === 'Jog', 500)).toBe(true);
    await req('jog-stop', { jogId: res.jogId });
    expect(await until(() => sim.machineState === 'Idle', 500)).toBe(true);
    expect(c.written.filter((b) => b === '\x85').length).toBeGreaterThanOrEqual(1);
    expect(await until(() => !service.list()[0].motion.cancelling, 1000)).toBe(true);
  });

  // The simulator handles G10 L2 only: it takes `G10 L20 P1 X0` for a G0 move
  // to X0. Before the machine-position read-back, the service reported that
  // move as an origin set (work X became 0 because the machine went there).
  test('G10 L20 is not modelled by the simulator (it moves to X0): the read-back check refuses to report success', async () => {
    await req('jog', { axis: 'X', direction: -1, step: 1, feed: 1000 });
    expect(await until(() => service.list()[0].motion.canSetOrigin)).toBe(true);
    const base = { port: 'SIM', generation: service.list()[0].generation, transportId: 'tA' };
    const ticket = await service.action({ ...base, action: 'prepare', operation: 'set-origin', axes: ['X'] }, A);
    expect(ticket.name).toBe('Origine X du repère G54 à la position actuelle (G10 L20 P1 X0)');
    await expect(service.action({ ...base, action: 'set-origin', nonce: ticket.nonce }, A)).rejects.toThrow(/La machine a bougé pendant la définition d’origine \(X 0\)/);
    expect(c.written.at(-1)).toBe('G10 L20 P1 X0\n');
    expect(sim.machinePosition.x).toBeCloseTo(0, 3);
  });
});
