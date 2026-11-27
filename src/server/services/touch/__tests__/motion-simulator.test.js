/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // keepalives and polls are sequential on purpose
// The real-motion service (F1) against the repository's Grbl 1.1h simulator,
// through CNCjs's own GrblRunner parser: real protocol lines both ways, real
// time. No serial port, no machine. What the simulator does not model is
// listed where it matters (see audit31-machine.md).
import { createService } from '../job-service';
import { createControl } from '../control';
// The simulator as a CNCjs controller (support/sim-bridge.js, shared with the LUNYEE tests).
import { bridge } from './support/sim-bridge';
import { provenOffset } from './support/proven-offset';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };

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
    service = createService({ get: () => ({ SIM: c }) }, { get: (key) => ({ 'touch.motion.enabled': true, events: [], macros: [] }[key]) }, undefined, { workOffset: provenOffset, control: createControl() });
    service.list();
    service.openTransport('tA', A);
    await wait(60);
    // Homing seen by the service (Home then Idle): the travel becomes usable.
    sim.processLineAsync('$H', () => {});
    expect(await until(() => service.list()[0].homed === true)).toBe(true);
    // Lot C1: a move starts from two agreeing Idle reports that carry the position (the second one
    // comes 25 ms after the one that ends the homing), the spindle proven stopped by a $G report
    // received by the service (the bridge gives one every 500 ms; the first came before the service listened).
    const ready = () => service.list()[0].motion.canJog === true && service.list()[0].motion.continuousReason.X === '';
    expect(await until(ready)).toBe(true);
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
    // Keepalives every 50 ms from the start (the server's 250 ms window opens at
    // jog-start, and a slow CI runner can take most of it to reach Jog), then
    // for 300 ms more, then none (lost network).
    const keepalive = async () => {
      await wait(50);
      expect(await req('jog-keepalive', { jogId: res.jogId })).toMatchObject({ active: true });
    };
    const jogDeadline = Date.now() + 500;
    while (sim.machineState !== 'Jog' && Date.now() < jogDeadline) {
      await keepalive();
    }
    expect(sim.machineState).toBe('Jog');
    for (let i = 0; i < 6; i++) {
      await keepalive();
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
    // The guard can detect the unexpected move before X reaches zero. Its
    // reported position depends on polling; check the final target separately.
    await expect(service.action({ ...base, action: 'set-origin', nonce: ticket.nonce }, A)).rejects.toThrow(/La machine a bougé pendant la définition d’origine \(X -?\d+(?:\.\d+)?\)/);
    expect(c.written.at(-1)).toBe('G10 L20 P1 X0\n');
    expect(await until(() => sim.machineState === 'Idle')).toBe(true);
    expect(sim.machinePosition.x).toBeCloseTo(0, 3);
  });
});
