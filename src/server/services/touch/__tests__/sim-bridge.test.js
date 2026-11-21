/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // polls are sequential on purpose
// The shared simulator bridge (support/sim-bridge.js) on the LUNYEE profile: what CNCjs's
// GrblRunner receives, real time, no serial port.
import { bridge } from './support/sim-bridge';

const GrblSimulator = require('../../../../../grbl-simulator/grbl-simulator');

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

describe('simulator bridge (LUNYEE profile)', () => {
  let sim;
  let c;

  beforeEach(() => {
    sim = new GrblSimulator({ profile: 'lunyee', homingMs: 200 });
  });

  afterEach(() => {
    c.close();
    sim.stopPlannerExecutor();
  });

  test('silentConnect: no version before $I; the feeder sends nothing in Alarm; homing and unlock go through writeln', async () => {
    c = bridge(sim, { silentConnect: true });
    const raw = [];
    c.runner.on('raw', (r) => raw.push(r.raw));
    expect(c.settings.version).toBe('');
    expect(c.settings.settings.$23).toBe('3');
    expect(await until(() => c.runner.isAlarm())).toBe(true);

    c.command('gcode', 'G0 X1');
    expect(c.written).toEqual([]);

    c.writeln('$I');
    expect(await until(() => raw.includes('[VER:1.1f.20231030:]'))).toBe(true);

    c.command('homing');
    expect(c.written).toEqual(['$I\n', '$H\n']);
    expect(await until(() => c.runner.state.status.activeState === 'Home', 1000)).toBe(true);
    expect(await until(() => c.runner.isIdle(), 1000)).toBe(true);
    // The board reports WCO:0,0,0 after its homing.
    expect(await until(() => c.runner.state.status.wco !== undefined, 1000)).toBe(true);
    expect(c.runner.state.status.wco).toEqual({ x: '0.000', y: '0.000', z: '0.000' });

    c.command('gcode', 'G53 G0 Z-140');
    expect(await until(() => raw.includes('ALARM:2'), 1000)).toBe(true);
    expect(await until(() => c.runner.isAlarm(), 1000)).toBe(true);
    c.command('unlock');
    expect(c.written.slice(-2)).toEqual(['G53 G0 Z-140\n', '$X\n']);
    expect(await until(() => c.runner.isIdle(), 1000)).toBe(true);
  });

  test('the banner is parsed without silentConnect; what the simulator says by itself is parsed too', async () => {
    c = bridge(sim);
    expect(c.settings.version).toBe('1.1f');
    const alarms = [];
    c.runner.on('alarm', (a) => alarms.push(a.message));
    c.command('unlock');
    expect(await until(() => c.runner.isIdle())).toBe(true);
    c.command('gcode', 'G0 X50');
    expect(await until(() => sim.machineState === 'Run', 1000)).toBe(true);
    sim.setLimitPin('x', true);
    expect(await until(() => alarms.length > 0, 1000)).toBe(true);
    expect(alarms[0]).toMatch(/^1/);
    c.command('reset');
    expect(c.written.at(-1)).toBe('\x18');
  });
});
