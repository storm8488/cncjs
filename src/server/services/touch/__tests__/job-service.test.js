/* eslint-env jest */
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService, changesOffset, spindleTestSpeed } from '../job-service';
import { createStream } from '../touch-stream';
import { createHistory } from '../history';
import { createControl } from '../control';
import { fingerprint as sha256 } from '../program-identity';
import monitor from '../../monitor';

// A fake Grbl controller that records commands and mimics the sender/workflow
// transitions the service observes. It never touches a serial port.
const fakeController = (port = 'TEST') => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle' } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { settings: { $110: 1000, $111: 1000, $112: 200 } },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 3 };
      c.sender.emit('load');
      args[3](null);
    }
    if (name === 'gcode:start' || name === 'gcode:resume') {
      c.workflow.state = 'running';
      if (name === 'gcode:start') {
        c.workflow.emit('start');
      }
    }
    if (name === 'gcode:pause') {
      c.workflow.state = 'paused';
      c.state.status.activeState = 'Hold';
    }
    if (name === 'gcode:stop') {
      c.workflow.state = 'idle';
      c.state.status.activeState = 'Idle';
    }
  };
  return c;
};

let root;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-job-'));
  await fs.writeFile(path.join(root, 'test.nc'), 'G21 G90\nG1 X1 F100\nM2');
  await fs.writeFile(path.join(root, 'macro.nc'), '%wait\nG1 X1');
  await fs.writeFile(path.join(root, 'offset.nc'), 'G21 G90\nG55\nG1 X1 F100\nM2');
  await fs.writeFile(path.join(root, 'bare.nc'), '(no units, no distance mode)\nG1 X1 F100\nM2');
  await fs.writeFile(path.join(root, 'resume.nc'), ['G21 G90', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200',
    'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'));
  await fs.writeFile(path.join(root, 'square.nc'), ['G21 G90 G54', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F100', 'G1 X40 F500', 'G1 Y30', 'G1 X0', 'G1 Y0', 'G0 Z5', 'M30'].join('\n'));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

// Every service is disposed after its test: a stop sequence still polling
// would otherwise keep the Jest worker alive (its clock is frozen here).
const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = (options = {}) => {
  const ctx = { now: 10000, events: [], macros: [], c: fakeController() };
  ctx.controllers = { TEST: ctx.c };
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ watchDirectory: root, macros: ctx.macros }[key] || ctx.events) },
    () => ctx.now,
    options
  );
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.transportId = 'offline-transport';
  ctx.service.openTransport(ctx.transportId);
  ctx.req = (action, extra = {}, actor) => ctx.service.action({
    port: 'TEST',
    generation: ctx.generation,
    transportId: ctx.transportId,
    action,
    ...extra
  }, actor);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.state = () => ctx.service.list()[0];
  // Loads test.nc on a fresh, idle controller.
  ctx.loaded = async () => {
    ctx.report();
    await ctx.req('load', { file: 'test.nc' });
    return ctx.state();
  };
  return ctx;
};

describe('job service', () => {
  test('a controller destroyed by CNCjs (runner and sender set to null) is forgotten, not fatal', () => {
    const ctx = setup();
    ctx.report();
    expect(ctx.service.list()).toHaveLength(1);
    // What GrblController.destroy() leaves behind when the port disappears.
    ctx.c.isClose = () => true;
    ctx.c.runner = null;
    ctx.c.sender = null;
    expect(() => ctx.service.list()).not.toThrow();
    expect(ctx.service.list()).toEqual([]);
    delete ctx.controllers.TEST;
    expect(ctx.service.list()).toEqual([]);
    // Reconnected on the same port: a new controller, a new generation.
    const fresh = fakeController();
    ctx.controllers.TEST = fresh;
    fresh.runner.emit('status');
    const [state] = ctx.service.list();
    expect(state.port).toBe('TEST');
    expect(state.generation).not.toBe(ctx.generation);
  });

  test('load needs a fresh idle controller and a plain file name', async () => {
    const ctx = setup();
    await expect(ctx.req('load', { file: 'test.nc' })).rejects.toThrow(/trop ancien/);

    ctx.report();
    ctx.c.state.status.activeState = 'Alarm';
    await expect(ctx.req('load', { file: 'test.nc' })).rejects.toThrow(/repos/);
    expect(ctx.c.commands).toEqual([]);

    ctx.c.state.status.activeState = 'Idle';
    await expect(ctx.req('load', { file: '../test.nc' })).rejects.toThrow(/invalide/);

    await ctx.req('load', { file: 'test.nc' });
    expect(ctx.c.commands).toHaveLength(1);
    expect(ctx.c.commands[0][0]).toBe('gcode:load');
    expect(ctx.state().canStart).toBe(true);
  });

  test('prepare, start and resume need the controller identity and an open transport', async () => {
    const ctx = setup();
    await ctx.loaded();
    await Promise.all(['prepare', 'start', 'resume'].flatMap((action) => [
      expect(ctx.service.action({ port: 'TEST', action, transportId: ctx.transportId })).rejects.toThrow(/identité/),
      expect(ctx.service.action({ port: 'TEST', action, generation: ctx.generation })).rejects.toThrow(/interrompue/),
      expect(ctx.service.action({ port: 'TEST', action, generation: ctx.generation, transportId: 'closed-transport' })).rejects.toThrow(/interrompue/)
    ]));
  });

  test('a start confirmation expires, is single-use and is re-checked against the machine', async () => {
    const ctx = setup();
    const state = await ctx.loaded();

    let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    ctx.now += 16000;
    ctx.report();
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);

    ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    ctx.c.state.status.activeState = 'Alarm';
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/repos/);
    expect(ctx.c.commands).toHaveLength(1);

    ctx.c.state.status.activeState = 'Idle';
    ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:start');
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);
  });

  test('pause, resume and stop follow the workflow; stop forces and requires a reload', async () => {
    const ctx = setup();
    let state = await ctx.loaded();
    let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });

    await ctx.req('pause');
    state = ctx.state();
    expect(state.canResume).toBe(true);
    ticket = await ctx.req('prepare', { operation: 'resume', revision: state.revision });
    await ctx.req('resume', { nonce: ticket.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:resume');

    // Grbl is in Hold after the pause: the touch service resets it itself.
    ctx.c.state.status.activeState = 'Hold';
    await ctx.req('stop');
    expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['reset']]);
    await expect(ctx.req('prepare', { operation: 'start', revision: state.revision })).rejects.toThrow(/Rechargez/);
  });

  test('a program that sets neither units nor distance mode starts only in G21 and G90 (fresh $G)', async () => {
    const ctx = setup();
    ctx.report();
    await ctx.req('load', { file: 'bare.nc' });
    expect(ctx.state().startReason).toMatch(/\$G/);
    const modal = (units, distance) => {
      ctx.c.state.parserstate = { modal: { wcs: 'G54', units, distance } };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
    };
    modal('G20', 'G90'); // left by an inch program ended with M30
    expect(ctx.state().startReason).toMatch(/G20/);
    modal('G21', 'G91'); // left by a macro
    expect(ctx.state().startReason).toMatch(/G91/);
    modal('G21', 'G90');
    const state = ctx.state();
    expect(state.canStart).toBe(true);
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    modal('G20', 'G90');
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/G20/);
    // A program that sets them does not depend on Grbl's modes.
    await ctx.req('load', { file: 'test.nc' });
    expect(ctx.state().canStart).toBe(true);
  });

  test('a job stopped by the operator says so, even with every line acknowledged', async () => {
    const ctx = setup();
    const state = await ctx.loaded();
    expect(state.jobStopped).toBe(false);
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.c.sender.state = { ...ctx.c.sender.state, sent: 3, received: 3 };
    await ctx.req('stop');
    expect(ctx.state()).toMatchObject({ jobStopped: true, finished: false });
  });

  test('a new run of the loaded file (also from the PC) clears the flags of the run before', async () => {
    const ctx = setup();
    const state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    await ctx.req('stop');
    expect(ctx.state().jobStopped).toBe(true);
    // CNCjs on the PC starts the same loaded file again.
    ctx.c.workflow.state = 'running';
    ctx.c.workflow.emit('start');
    ctx.report();
    expect(ctx.state().jobStopped).toBe(false);
  });

  test('an ok still on its way for CNCjs own $G is not taken for the answer to a line', async () => {
    const ctx = setup();
    const loaded = await ctx.loaded();
    const start = await ctx.req('prepare', { operation: 'start', revision: loaded.revision });
    await ctx.req('start', { nonce: start.nonce });
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
    ctx.c.state.status.activeState = 'Idle';
    ctx.c.state.status.spindle = 12000;
    ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '12000' };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
    ctx.report();
    ctx.c.state.status.spindle = 0;
    ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '12000' };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
    ctx.report();
    const ticket = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision });
    // A [GC:] reply was parsed just before; its ok arrives right after the request.
    ctx.c.actionMask = { queryParserState: { reply: true } };
    const resumed = ctx.req('resume', { nonce: ticket.nonce });
    ctx.c.runner.emit('ok'); // the $G reply's ok
    ctx.c.runner.emit('ok'); // M3
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(ctx.c.commands.some(([n]) => n === 'gcode:resume')).toBe(false);
    ctx.c.runner.emit('ok'); // G4
    await resumed;
    expect(ctx.c.commands.at(-1)).toEqual(['gcode:resume']);
  });

  test('a board restart during a program pause forbids resuming it', async () => {
    const ctx = setup();
    let state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
    ctx.report();
    expect(ctx.state().canResume).toBe(true);
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.3a' }); // E-stop wired to reset
    ctx.report();
    state = ctx.state();
    expect(state.canResume).toBe(false);
    expect(state.resumeReason).toMatch(/redémarré/);
  });

  test('a pause made while CNCjs holds for its end-of-program %wait can be resumed; an unknown hold cannot', async () => {
    const ctx = setup();
    const state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    await ctx.req('pause');
    // What the real Sender keeps after hold() was first called by %wait.
    ctx.c.sender.state.holdReason = { data: '%wait', msg: '%wait ; Wait for the planner to empty' };
    ctx.report();
    expect(ctx.state().canResume).toBe(true);
    // M0, M1 and M6 pauses have their own test; any other hold stays CNCjs's business.
    ctx.c.sender.state.holdReason = { data: 'M7?', msg: 'unknown' };
    expect(ctx.state().canResume).toBe(false);
    expect(ctx.state().resumeReason).toMatch(/pause simple/);
  });

  test('the work offset seen at start holds during a program that cannot change it', async () => {
    const ctx = setup();
    ctx.report();
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
    let state = await ctx.loaded();
    expect(state.operator.wcs).toBe('G54');
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    // CNCjs stops asking $G while streaming: the modal report grows old.
    ctx.now += 10000;
    ctx.report();
    expect(ctx.state().operator.wcs).toBe('G54');
    await ctx.req('pause');
    expect(ctx.state().operator.wcs).toBe('G54');
    await ctx.req('stop');
    expect(ctx.state().operator.wcs).toBe(null);
  });

  test('a program that selects or changes an offset leaves the offset unknown once $G is old', async () => {
    const ctx = setup();
    ctx.report();
    ctx.c.runner.emit('parserstate', { modal: { wcs: 'G54' } });
    await ctx.req('load', { file: 'offset.nc' });
    const state = ctx.state();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.now += 10000;
    ctx.report();
    expect(ctx.state().operator.wcs).toBe(null);
  });

  test('changesOffset finds offset words, not comments or other codes', () => {
    ['G55', 'g54', 'G59.1', 'G10 L2 P1 X0', 'G92 X0', 'G92.1', 'G0 X1\nG57 G0 Y2', 'G055',
      // Compact G-code, as many CAM post-processors write it.
      'G90G55', 'N10G55', 'G21G90G55', 'G10L20P1X0', 'G92X0Y0'].forEach((code) => {
      expect(changesOffset(code)).toBe(true);
    });
    ['G0 X54', 'G1 F555', '(G55 in a comment)', '; G92 here', 'G21 G90 G17\nG1 X10 F400', 'G540', 'M5', 'G100', 'G920', 'G55.12'].forEach((code) => {
      expect(changesOffset(code)).toBe(false);
    });
  });

  test('a program that ends is reported finished even after CNCjs rewinds the sender; a stop is not', async () => {
    const ctx = setup();
    let state = await ctx.loaded();
    let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    expect(ctx.state().finished).toBe(false);
    ctx.c.sender.emit('end', ctx.now);
    expect(ctx.state().finished).toBe(false); // still running
    ctx.c.workflow.state = 'idle';
    ctx.c.sender.state = { ...ctx.c.sender.state, received: 0 }; // CNCjs rewinds at the end
    ctx.report();
    expect(ctx.state().finished).toBe(true);
    // A new load starts from scratch.
    state = await ctx.loaded();
    expect(state.finished).toBe(false);
    ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    await ctx.req('stop');
    ctx.c.sender.emit('end', ctx.now);
    expect(ctx.state().finished).toBe(false);
  });

  test('ticket lifetime and report age use a monotonic clock by default (wall clock set back by NTP)', async () => {
    let wall = 1800000000000;
    let mono = 50000;
    const wallSpy = jest.spyOn(Date, 'now').mockImplementation(() => wall);
    const monoSpy = jest.spyOn(performance, 'now').mockImplementation(() => mono);
    try {
      const c = fakeController();
      const service = createService({ get: () => ({ TEST: c }) },
        { get: (key) => (key === 'watchDirectory' ? root : []) });
      service.openTransport('t');
      const generation = service.list()[0].generation;
      const req = (action, extra = {}) => service.action({ port: 'TEST', generation, transportId: 't', action, ...extra });
      c.runner.emit('status');
      await req('load', { file: 'test.nc' });
      const { revision } = service.list()[0];
      const ticket = await req('prepare', { operation: 'start', revision });
      // 16 s pass while the wall clock is set back one hour.
      mono += 16000;
      wall -= 3600000;
      c.runner.emit('status');
      await expect(req('start', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);
      expect(c.commands.map((x) => x[0])).not.toContain('gcode:start');
      // A fresh report is fresh whatever the wall clock does.
      wall += 7200000;
      expect(service.list()[0].fresh).toBe(true);
      service.dispose();
    } finally {
      wallSpy.mockRestore();
      monoSpy.mockRestore();
    }
  });

  test('the alarm code is reported while the controller is in alarm, and forgotten after a restart', () => {
    const ctx = setup();
    ctx.report();
    expect(ctx.state().alarmCode).toBe(null);
    ctx.c.runner.emit('alarm', { message: '9', raw: 'ALARM:9' });
    ctx.c.state.status.activeState = 'Alarm';
    ctx.report();
    expect(ctx.state().alarmCode).toBe(9);
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    expect(ctx.state().alarmCode).toBe(null);
    ctx.c.runner.emit('alarm', { message: '1', raw: 'ALARM:1' });
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.c.state.status.activeState = 'Alarm'; // homing lock after the reset: no code sent
    ctx.report();
    expect(ctx.state().alarmCode).toBe(null);
  });

  test('the last Grbl error code of the job and the homing direction setting are reported', async () => {
    const ctx = setup();
    ctx.c.settings.settings.$23 = 3;
    const state = await ctx.loaded();
    expect(state.settings.$23).toBe(3);
    expect(state.jobLastError).toBe(null);
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.c.runner.emit('error', { message: '24', raw: 'error:24' });
    ctx.c.runner.emit('error', { message: '2', raw: 'error:2' });
    expect(ctx.state()).toMatchObject({ jobErrors: 2, jobLastError: 2 });
  });

  test('a job that waits for acknowledgements while Grbl stays idle is reported stalled after 30 s', async () => {
    const ctx = setup();
    const state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.c.sender.state = { ...ctx.c.sender.state, sent: 3, received: 1 };
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    expect(ctx.state().stalledMs).toBe(null);
    ctx.now += 20000;
    ctx.report();
    expect(ctx.state().stalledMs).toBe(null);
    ctx.now += 15000;
    ctx.report();
    expect(ctx.state().stalledMs).toBe(35000);
    // An acknowledgement, or motion, restarts the count.
    ctx.c.sender.state = { ...ctx.c.sender.state, received: 2 };
    ctx.report();
    expect(ctx.state().stalledMs).toBe(null);
    ctx.now += 40000;
    ctx.c.state.status.activeState = 'Run';
    ctx.report();
    expect(ctx.state().stalledMs).toBe(null);
    // Every line acknowledged: nothing is waited for.
    ctx.c.state.status.activeState = 'Idle';
    ctx.c.sender.state = { ...ctx.c.sender.state, received: 3 };
    ctx.report();
    ctx.now += 40000;
    ctx.report();
    expect(ctx.state().stalledMs).toBe(null);
  });

  test('a program whose lines failed is never reported finished', async () => {
    const ctx = setup();
    const run = async () => {
      const state = await ctx.loaded();
      const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
    };
    // GrblController order on an error on the last line: pause (unless
    // ignoreErrors), ack (the sender emits 'end'), then the runner listeners.
    await run();
    ctx.c.workflow.state = 'paused';
    ctx.c.sender.emit('end', ctx.now);
    ctx.c.runner.emit('error', { message: '20', raw: 'error:20' });
    ctx.c.workflow.state = 'idle'; // CNCjs stops the workflow once the sender is done
    ctx.report();
    expect(ctx.state()).toMatchObject({ finished: false, finishedWithErrors: true, jobErrors: 1 });
    // ignoreErrors: the program goes on, ends normally, but still failed a line.
    await run();
    expect(ctx.state()).toMatchObject({ finished: false, finishedWithErrors: false, jobErrors: 0 });
    ctx.c.runner.emit('error', { message: '33', raw: 'error:33' });
    ctx.c.sender.emit('end', ctx.now);
    ctx.c.workflow.state = 'idle';
    ctx.report();
    expect(ctx.state()).toMatchObject({ finished: false, finishedWithErrors: true, jobErrors: 1 });
    // An error outside a running job (a console command at rest) is not the job's.
    await run();
    ctx.c.sender.emit('end', ctx.now);
    ctx.c.workflow.state = 'idle';
    ctx.c.runner.emit('error', { message: '20', raw: 'error:20' });
    ctx.report();
    expect(ctx.state()).toMatchObject({ finished: true, finishedWithErrors: false, jobErrors: 0 });
  });

  test('reports the real feed rate and spindle speed from the status report', () => {
    const ctx = setup();
    ctx.report();
    expect(ctx.state()).toMatchObject({ feedrate: null, spindleSpeed: null });
    ctx.c.state.status.feedrate = 400;
    ctx.c.state.status.spindle = 12000;
    expect(ctx.state()).toMatchObject({ feedrate: 400, spindleSpeed: 12000 });
    ctx.c.state.status.spindle = NaN;
    ctx.c.state.status.feedrate = -1;
    expect(ctx.state()).toMatchObject({ feedrate: null, spindleSpeed: null });
  });

  test('a sender load or a stale report invalidates a pending confirmation', async () => {
    const ctx = setup();
    let state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    ctx.c.sender.emit('load');
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);

    await ctx.req('load', { file: 'test.nc' });
    state = ctx.state();
    ctx.now += 3000;
    await expect(ctx.req('prepare', { operation: 'start', revision: state.revision })).rejects.toThrow(/trop ancien/);
  });

  test('refuses enabled automations, % directives and a disconnected controller', async () => {
    const ctx = setup();
    ctx.report();
    ctx.events = [{ enabled: true }];
    await expect(ctx.req('load', { file: 'test.nc' })).rejects.toThrow(/Automatismes/);

    ctx.events = [];
    await expect(ctx.req('load', { file: 'macro.nc' })).rejects.toThrow(/directives/);

    ctx.controllers = {};
    await expect(ctx.req('start', { nonce: 'fake' })).rejects.toThrow(/non connecté/);
  });

  test('motion preview is blocked while a load or a confirmation is pending', async () => {
    const ctx = setup();
    const body = { port: 'TEST', axis: 'X', direction: 1, step: 1, feed: 800 };
    expect(ctx.state().canPreviewMotion).toBe(false);

    ctx.report();
    expect(ctx.state().canPreviewMotion).toBe(true);
    expect(ctx.service.previewMotion(body).dryRun).toBe(true);
    expect(() => ctx.service.previewMotion({ ...body, axis: 'Z' })).toThrow(expect.objectContaining({ code: 'FEED' }));
    expect(ctx.c.commands).toEqual([]);

    // Hold the load open: the controller callback completes it later.
    let completeLoad;
    const loadRequested = new Promise((resolve) => {
      ctx.c.command = (name, file, gcode, context, done) => {
        ctx.c.commands.push([name]);
        completeLoad = () => {
          ctx.c.sender.state = { name: file, context, total: 2 };
          ctx.c.sender.emit('load');
          done(null);
        };
        resolve();
      };
    });
    const loading = ctx.req('load', { file: 'test.nc' });
    expect(ctx.state().canPreviewMotion).toBe(false);
    expect(() => ctx.service.previewMotion(body)).toThrow(expect.objectContaining({ code: 'SESSION' }));
    await loadRequested;
    completeLoad();
    await loading;

    const state = ctx.state();
    expect(state.canPreviewMotion).toBe(true);
    await ctx.req('prepare', { operation: 'start', revision: state.revision });
    expect(ctx.state().canPreviewMotion).toBe(false);
    expect(() => ctx.service.previewMotion(body)).toThrow(expect.objectContaining({ code: 'SESSION' }));

    ctx.now += 15001;
    ctx.report();
    expect(ctx.state().canPreviewMotion).toBe(true);
    expect(ctx.service.previewMotion(body).dryRun).toBe(true);
    expect(ctx.c.commands).toEqual([['gcode:load']]); // No start, jog or raw G-code ever sent.

    ctx.c.state.status.activeState = 'Alarm';
    expect(ctx.state().canPreviewMotion).toBe(false);
    expect(() => ctx.service.previewMotion(body)).toThrow(expect.objectContaining({ code: 'BUSY' }));
  });

  test('overrides are accepted only during a running or held program, with Grbl step values', async () => {
    const ctx = setup();
    ctx.report();
    let state = ctx.state();
    expect(state.overrides).toBe(null);
    expect(state.canOverride).toBe(false);
    expect(state.overrideReason).toMatch(/en cours ou en pause/);
    await expect(ctx.req('override', { kind: 'feed', value: 10 })).rejects.toThrow(/en cours ou en pause/);

    ctx.c.state.status.ov = [100, 100, 100];
    state = await ctx.loaded();
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.report();
    state = ctx.state();
    expect(state.overrides).toEqual({ feed: 100, rapid: 100, spindle: 100 });
    expect(state.canOverride).toBe(true);

    await expect(ctx.req('override', { kind: 'feed', value: 5 })).rejects.toThrow(/invalide/);
    await expect(ctx.req('override', { kind: 'laser', value: 10 })).rejects.toThrow(/invalide/);
    await expect(ctx.req('override', { kind: 'rapid', value: 75 })).rejects.toThrow(/invalide/);
    await expect(ctx.service.action({ port: 'TEST', action: 'override', transportId: ctx.transportId, kind: 'feed', value: 10 })).rejects.toThrow(/identité/);

    const sent = ctx.c.commands.length;
    expect((await ctx.req('override', { kind: 'feed', value: -10 })).message).toMatch(/avance : -10 %/);
    expect((await ctx.req('override', { kind: 'spindle', value: 1 })).message).toMatch(/broche : \+1 %/);
    expect((await ctx.req('override', { kind: 'rapid', value: 50 })).message).toMatch(/rapide : 50 %/);
    expect((await ctx.req('override', { kind: 'feed', value: 0 })).message).toMatch(/remise à 100/);
    expect(ctx.c.commands.slice(sent)).toEqual([['feedOverride', -10], ['spindleOverride', 1], ['rapidOverride', 50], ['feedOverride', 0]]);

    await ctx.req('pause');
    ctx.report();
    expect(ctx.state().canOverride).toBe(true);
    await ctx.req('stop');
    ctx.report();
    expect(ctx.state().canOverride).toBe(false);

    ctx.c.state.status.ov = [100, 'x', 100];
    expect(ctx.state().overrides).toBe(null);
  });

  test('macros are listed by name only and run through a confirmation ticket from an idle machine', async () => {
    const ctx = setup();
    ctx.events = { macros: [{ id: 'm1', name: 'Dégagement Z', content: 'G53 G0 Z-5' }, { id: 'bad' }, null], events: [] };
    const config = { get: (key) => ({ watchDirectory: root, macros: ctx.events.macros, events: ctx.events.events })[key] };
    const service = createService({ get: () => ctx.controllers }, config, () => ctx.now);
    const generation = service.list()[0].generation;
    service.openTransport('t');
    const req = (action, extra = {}) => service.action({ port: 'TEST', generation, transportId: 't', action, ...extra });

    let state = service.list()[0];
    expect(state.macros).toEqual([{ id: 'm1', name: 'Dégagement Z' }]);
    expect(JSON.stringify(state)).not.toContain('G53');
    expect(state.canMacro).toBe(false);
    expect(state.macroReason).toMatch(/trop ancien/);

    ctx.report();
    state = service.list()[0];
    expect(state.canMacro).toBe(true);
    await expect(req('prepare', { operation: 'macro', macroId: 'nope' })).rejects.toThrow(/introuvable/);
    await expect(req('macro', { nonce: 'x' })).rejects.toThrow(/expirée/);

    let ticket = await req('prepare', { operation: 'macro', macroId: 'm1' });
    expect(ticket.name).toBe('Dégagement Z');
    expect(ticket.operation).toBe('macro');
    ctx.now += 16000;
    ctx.report();
    await expect(req('macro', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);
    expect(ctx.c.commands).toEqual([]);

    ticket = await req('prepare', { operation: 'macro', macroId: 'm1' });
    ctx.c.state.status.activeState = 'Alarm';
    await expect(req('macro', { nonce: ticket.nonce })).rejects.toThrow(/repos/);
    ctx.c.state.status.activeState = 'Idle';

    ticket = await req('prepare', { operation: 'macro', macroId: 'm1' });
    ctx.c.command = (name, ...args) => {
      ctx.c.commands.push([name, args[0]]);
      args[2](null);
    };
    expect((await req('macro', { nonce: ticket.nonce })).message).toMatch(/Dégagement Z/);
    expect(ctx.c.commands).toEqual([['macro:run', 'm1']]);
    await expect(req('macro', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);

    // A start ticket cannot run a macro and a macro ticket cannot start a program.
    ctx.events.events = [{ enabled: true }];
    expect(service.list()[0].canMacro).toBe(false);
    expect(service.list()[0].macroReason).toMatch(/automatismes/i);
  });

  test('the snapshot reports the probe input from raw status reports', () => {
    const ctx = setup();
    expect(ctx.state().probeInput.state).toBe('unknown');
    ctx.c.runner.emit('status', { raw: '<Idle|MPos:0,0,0|Pn:P>' });
    expect(ctx.state().probeInput.state).toBe('contact');
    expect(ctx.state().probeInput.canProbe).toBe(false);
  });

  test('the snapshot lists the triggered limit and probe inputs (Pn absent means none)', () => {
    const ctx = setup();
    expect(ctx.state().probeInput.pins).toBe(null);
    ctx.c.runner.emit('status', { raw: '<Idle|MPos:0,0,0|Pn:XZD>' });
    expect(ctx.state().probeInput.pins).toBe('XZ');
    ctx.c.runner.emit('status', { raw: '<Idle|MPos:0,0,0>' });
    expect(ctx.state().probeInput.pins).toBe('');
    ctx.now += 3000;
    expect(ctx.state().probeInput.pins).toBe(null);
  });

  test('spindle test speed: $31 minimum, else a quarter of $30', () => {
    expect(spindleTestSpeed({ $30: 24000, $31: 6000 })).toBe(6000);
    expect(spindleTestSpeed({ $30: 24000, $31: 0 })).toBe(6000);
    expect(spindleTestSpeed({ $30: 1000, $31: '0' })).toBe(250);
    expect(spindleTestSpeed({ $30: 0, $31: 0 })).toBe(null);
    expect(spindleTestSpeed({})).toBe(null);
  });

  describe('commissioning commands', () => {
    const commissioning = () => {
      const ctx = setup();
      ctx.c.settings = { version: 'Grbl 1.1h', settings: { $22: 1, $30: 24000, $31: 6000, $110: 1000, $111: 1000, $112: 200 } };
      ctx.report();
      return ctx;
    };

    test('unlock ($X) only in alarm, through a ticket, never during a job', async () => {
      const ctx = commissioning();
      expect(ctx.state().canUnlock).toBe(false);
      expect(ctx.state().unlockReason).toMatch(/alarme/);
      await expect(ctx.req('prepare', { operation: 'unlock' })).rejects.toThrow(/alarme/);

      ctx.c.state.status.activeState = 'Alarm';
      expect(ctx.state().canUnlock).toBe(true);
      await expect(ctx.req('unlock', { nonce: 'x' })).rejects.toThrow(/expirée/);
      const ticket = await ctx.req('prepare', { operation: 'unlock' });
      expect(ticket.name).toMatch(/\$X/);
      expect((await ctx.req('unlock', { nonce: ticket.nonce })).message).toMatch(/\$X/);
      expect(ctx.c.commands).toEqual([['unlock']]);
      await expect(ctx.req('unlock', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);

      ctx.c.workflow.state = 'running';
      expect(ctx.state().canUnlock).toBe(false);
      expect(ctx.state().unlockReason).toMatch(/travail/);
    });

    test('a ticket is bound to its operation and the guard is checked again at run time', async () => {
      const ctx = commissioning();
      ctx.c.state.status.activeState = 'Alarm';
      const ticket = await ctx.req('prepare', { operation: 'unlock' });
      await expect(ctx.req('home', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);
      const again = await ctx.req('prepare', { operation: 'unlock' });
      ctx.c.state.status.activeState = 'Idle';
      await expect(ctx.req('unlock', { nonce: again.nonce })).rejects.toThrow(/alarme/);
      expect(ctx.c.commands).toEqual([]);
    });

    test('homing ($H) needs $22=1, idle or alarm, no automations', async () => {
      const ctx = commissioning();
      expect(ctx.state().canHome).toBe(true);
      ctx.c.settings.settings.$22 = 0;
      expect(ctx.state().homeReason).toMatch(/\$22=0/);
      delete ctx.c.settings.settings.$22;
      expect(ctx.state().homeReason).toMatch(/\$22 inconnu/);
      ctx.c.settings.settings.$22 = '1';
      ctx.c.state.status.activeState = 'Hold';
      expect(ctx.state().canHome).toBe(false);
      ctx.c.state.status.activeState = 'Alarm';
      expect(ctx.state().canHome).toBe(true);
      const ticket = await ctx.req('prepare', { operation: 'home' });
      await ctx.req('home', { nonce: ticket.nonce });
      expect(ctx.c.commands).toEqual([['homing']]);
      ctx.events = [{ enabled: true }];
      expect(ctx.state().homeReason).toMatch(/automatismes/i);
    });

    test('spindle test: M3 at the test speed from an idle machine, M5 to stop', async () => {
      const ctx = commissioning();
      const state = ctx.state();
      expect(state.canSpindleTest).toBe(true);
      expect(state.spindleTestSpeed).toBe(6000);
      expect(state.canSpindleStop).toBe(true);
      const ticket = await ctx.req('prepare', { operation: 'spindle' });
      expect(ticket.name).toMatch(/S6000/);
      await ctx.req('spindle', { nonce: ticket.nonce });
      await ctx.req('spindleStop');
      expect(ctx.c.commands).toEqual([['gcode', 'M3 S6000'], ['gcode', 'M5']]);

      ctx.c.state.status.activeState = 'Alarm';
      expect(ctx.state().canSpindleTest).toBe(false);
      await expect(ctx.req('prepare', { operation: 'spindle' })).rejects.toThrow(/repos/);
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.settings.settings = {};
      expect(ctx.state().spindleReason).toMatch(/\$30/);
    });

    test('the full settings and firmware are returned on request only', async () => {
      const ctx = commissioning();
      ctx.c.settings.settings.junk = 'x';
      const state = ctx.state();
      expect(state.firmware).toBe('Grbl 1.1h');
      expect(state.settingsCount).toBe(6);
      expect(state.settings.$31).toBe(6000);
      const result = await ctx.req('settings');
      expect(result.settings).toEqual({ $22: 1, $30: 24000, $31: 6000, $110: 1000, $111: 1000, $112: 200 });
      // Firmware unknown (CNCjs connected after the banner): $I is asked too.
      await ctx.req('readSettings');
      expect(ctx.c.commands).toEqual([['gcode', ['$I', '$$']]]);
      ctx.c.runner.emit('raw', { raw: '[VER:1.3a.20210424:]' });
      expect(ctx.state().firmware).toBe('Grbl 1.3a.20210424');
      await ctx.req('readSettings');
      expect(ctx.c.commands.at(-1)).toEqual(['gcode', '$$']);
      ctx.c.workflow.state = 'running';
      await expect(ctx.req('readSettings')).rejects.toThrow(/repos/);
    });
  });

  describe('spindle, stops and board restarts', () => {
    const ready = () => {
      const ctx = setup();
      ctx.c.settings = { version: '1.1h', settings: { $22: 1, $30: 24000, $31: 6000, $110: 1000, $111: 1000, $112: 200 } };
      ctx.report();
      return ctx;
    };

    test('homing, macros and start are refused while the spindle still turns', async () => {
      const ctx = ready();
      ctx.c.state.status.spindle = 6000;
      expect(ctx.state().homeReason).toMatch(/broche tourne encore/);
      expect(ctx.state().macroReason).toMatch(/broche tourne encore/);
      await expect(ctx.req('prepare', { operation: 'home' })).rejects.toThrow(/broche tourne/);
      ctx.c.state.status.spindle = 0;
      await ctx.req('load', { file: 'test.nc' });
      expect(ctx.state().canStart).toBe(true);
      ctx.c.state.status.spindle = 1200;
      expect(ctx.state().startReason).toMatch(/broche tourne encore/);
      expect(ctx.state().canSpindleStop).toBe(true);
    });

    test('M5 is accepted with a stale report, a stale identity or a closed stream, never during a job', async () => {
      const ctx = ready();
      ctx.now += 10000;
      expect(ctx.state().fresh).toBe(false);
      await ctx.service.action({ port: 'TEST', generation: 'old', transportId: 'gone', action: 'spindleStop' });
      expect(ctx.c.commands).toEqual([['gcode', 'M5']]);
      ctx.c.workflow.state = 'running';
      await expect(ctx.req('spindleStop')).rejects.toThrow(/Pause ou Arrêter/);
    });

    test('the confirmed spindle speed is the one sent', async () => {
      const ctx = ready();
      const ticket = await ctx.req('prepare', { operation: 'spindle' });
      ctx.c.settings.settings.$31 = 9000;
      await expect(ctx.req('spindle', { nonce: ticket.nonce })).rejects.toThrow(/vitesse de test a changé/);
      expect(ctx.c.commands).toEqual([]);
    });

    test('a homing cycle is stopped by a soft reset, a jog by a jog cancel', async () => {
      const ctx = ready();
      ctx.c.state.status.activeState = 'Home';
      expect(ctx.state().canStop).toBe(true);
      expect((await ctx.req('stop')).message).toMatch(/interrompue/);
      ctx.c.state.status.activeState = 'Jog';
      await ctx.req('stop');
      expect(ctx.c.commands).toEqual([['reset'], ['jogCancel']]);
      ctx.c.state.status.activeState = 'Idle';
      await expect(ctx.req('stop')).rejects.toThrow(/Aucun travail/);
    });

    test('without FS in the reports, a spindle commanded on in a fresh $G still blocks', async () => {
      const ctx = ready();
      delete ctx.c.state.status.spindle; // Grbl built without variable spindle, or 0.9
      const modal = (spindle) => {
        ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle } };
        ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      };
      modal('M3');
      expect(ctx.state().homeReason).toMatch(/broche/);
      expect(ctx.state().macroReason).toMatch(/broche/);
      modal('M4');
      await expect(ctx.req('prepare', { operation: 'home' })).rejects.toThrow(/broche/);
      modal('M5');
      expect(ctx.state().canHome).toBe(true);
      // A modal state older than the report window is not trusted either way.
      modal('M3');
      ctx.now += 3000;
      ctx.report();
      expect(ctx.state().homeReason).not.toMatch(/broche/);
    });

    test('stop during a macro or console command also clears the CNCjs queue', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      ctx.c.state.status.activeState = 'Run'; // a macro runs from the feeder, workflow idle
      expect(ctx.state().canStop).toBe(true);
      await ctx.req('stop');
      expect(ctx.c.commands.slice(-3)).toEqual([['feeder:stop'], ['gcode:stop'], ['feedhold']]);
      // The loaded file was never started: it can still be started.
      ctx.c.state.status.activeState = 'Idle';
      expect(ctx.state().canStart).toBe(true);
    });

    test('stop with the door open resets Grbl, during a job or at rest', async () => {
      const ctx = ready();
      ctx.c.workflow.state = 'running';
      ctx.c.state.status.activeState = 'Door';
      await ctx.req('stop');
      expect(ctx.c.commands).toEqual([['gcode:stop'], ['reset']]);
      ctx.c.state.status.activeState = 'Door';
      expect(ctx.state().canStop).toBe(true);
      await ctx.req('stop');
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    // Grbl's state as the next reports will give it, without the fake's shortcuts.
    const realistic = (ctx) => {
      const command = ctx.c.command;
      ctx.c.command = (name, ...args) => {
        if (name === 'gcode:stop') {
          ctx.c.commands.push([name, ...args]);
          ctx.c.workflow.state = 'idle';
          ctx.c.sender.state = { ...ctx.c.sender.state, sent: 0, received: 0 }; // CNCjs rewinds its sender
          return;
        }
        command(name, ...args);
      };
    };
    const wait = (ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

    test('stop resets Grbl when it is idle with lines still buffered (a dwell), whatever CNCjs cached', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status.activeState = 'Idle'; // G4 of a resume preamble: Grbl reports Idle
      ctx.c.sender.state = { ...ctx.c.sender.state, sent: 8, received: 3 };
      await ctx.req('stop');
      // Held first: the dwell may end and the next move start before a reset arrives.
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['feedhold'], 'no reset on the report taken before the request');
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report();
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    test('stop at a tool change pause with the spindle on resets Grbl (M5 alone was not sent)', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'paused';
      ctx.c.state.status = { activeState: 'Idle', spindle: 12000 };
      ctx.c.state.status.activeState = 'Idle';
      ctx.report();
      await ctx.req('stop');
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['reset']]);
    });

    test('stop of moving axes holds first, then resets once Grbl is at rest (Hold:0), not before', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run', subState: 0 };
      await ctx.req('stop');
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
      ctx.c.state.status = { activeState: 'Hold', subState: 1 }; // decelerating
      ctx.report();
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['feedhold']);
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report();
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
      expect(ctx.c.commands.filter(([n]) => n === 'reset')).toHaveLength(1);
    });

    test('a feed hold that does not take (byte lost) is sent again while reports still say Run', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      ctx.now += 500;
      ctx.report(); // still Run
      await wait(150);
      expect(ctx.c.commands.filter(([n]) => n === 'feedhold')).toHaveLength(2);
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report();
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    test('a hold that never completes is reset anyway after the time limit', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      await wait(120);
      expect(ctx.c.commands.at(-1)).toEqual(['feedhold']);
      ctx.now += 6000;
      await wait(120);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    test('a stop followed by the service disposal leaves nothing behind: no reset, no new listener, no command', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
      const sent = ctx.c.commands.length;
      ctx.service.dispose();
      expect(ctx.c.runner.listenerCount('status')).toBe(0);
      // The hold time limit passes and Grbl reports at rest: the service is gone.
      ctx.now += 6000;
      ctx.c.state.status = { activeState: 'Idle' };
      ctx.c.runner.emit('status');
      await wait(200);
      expect(ctx.c.runner.listenerCount('status')).toBe(0);
      expect(ctx.c.sender.listenerCount('load')).toBe(0);
      expect(ctx.c.commands.filter(([n]) => n === 'reset')).toHaveLength(0);
      expect(ctx.c.commands).toHaveLength(sent);
      await expect(ctx.service.action({ port: 'TEST', action: 'stop' })).rejects.toThrow(/indisponible/);
    });

    test('a controller forgotten while its stop still polls is left alone', async () => {
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      const sent = ctx.c.commands.length;
      // The port closes: CNCjs destroys the controller and the next listing forgets it.
      ctx.c.isClose = () => true;
      ctx.service.list();
      expect(ctx.c.runner.listenerCount('status')).toBe(0);
      ctx.c.isClose = () => false; // reopened: the same object is not reused by CNCjs, but be strict
      ctx.now += 6000;
      await wait(200);
      expect(ctx.c.commands).toHaveLength(sent);
      expect(ctx.c.runner.listenerCount('status')).toBe(0);
    });

    // Cross-check (audit 31) with Jest's fake timers: the timer count itself.
    test('stop, dispose, clock ahead, Idle report: no timer, no command, no listener left', async () => {
      jest.useFakeTimers();
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
      expect(jest.getTimerCount()).toBe(1);
      const sent = ctx.c.commands.length;
      ctx.service.dispose();
      expect(jest.getTimerCount()).toBe(0);
      ctx.now += 6000;
      ctx.c.state.status = { activeState: 'Idle' };
      ctx.c.runner.emit('status');
      jest.advanceTimersByTime(10000);
      expect(ctx.c.commands).toHaveLength(sent);
      ['status', 'startup', 'parserstate', 'raw', 'error', 'alarm'].forEach((e) => expect(ctx.c.runner.listenerCount(e)).toBe(0));
      ['load', 'unload', 'end'].forEach((e) => expect(ctx.c.sender.listenerCount(e)).toBe(0));
      expect(ctx.c.workflow.listenerCount('start')).toBe(0);
      expect(() => ctx.service.list()).toThrow(/indisponible/);
      expect(ctx.service.fingerprint()).toBe('');
      expect(ctx.service.systemCommand()).toBe(null);
      expect(() => ctx.service.closeTransport(ctx.transportId)).not.toThrow();
      expect(ctx.service.ticketPending(ctx.transportId)).toBe(false);
      ctx.service.dispose(); // idempotent
    });

    test('a completed stop leaves no timer; in alarm nothing is sent; at the time limit a stale Run is reset', async () => {
      jest.useFakeTimers();
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report();
      jest.advanceTimersByTime(60);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
      expect(jest.getTimerCount()).toBe(0);

      // Second stop: an alarm during the wait, no reset, timer released.
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      const sent = ctx.c.commands.length;
      ctx.c.state.status = { activeState: 'Alarm' };
      ctx.report();
      jest.advanceTimersByTime(60);
      expect(ctx.c.commands).toHaveLength(sent);
      expect(jest.getTimerCount()).toBe(0);

      // Third: no report, the limit passes, the stale state says Run: reset at the limit.
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      ctx.report();
      await ctx.req('stop');
      jest.advanceTimersByTime(450);
      expect(ctx.c.commands.filter(([n]) => n === 'feedhold')).toHaveLength(3); // not sent again without a new report
      ctx.now += 5001;
      jest.advanceTimersByTime(60);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
      expect(jest.getTimerCount()).toBe(0);
    });

    test('a controller forgotten during its stop then back: the old timer is silent, a new stop works', async () => {
      jest.useFakeTimers();
      const ctx = ready();
      await ctx.req('load', { file: 'test.nc' });
      realistic(ctx);
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.req('stop');
      ctx.c.isClose = () => true;
      expect(ctx.service.list()).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
      const sent = ctx.c.commands.length;
      // The same object is open again (CNCjs makes a new one, but be strict).
      ctx.c.isClose = () => false;
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report(); // no listener: seen stays unknown
      jest.advanceTimersByTime(1000);
      expect(ctx.c.commands).toHaveLength(sent);
      const [state] = ctx.service.list(); // a new record, a new generation
      expect(state.generation).not.toBe(ctx.generation);
      // Job service, motion preflight and probe input: three listeners, as at first.
      expect(ctx.c.runner.listenerCount('status')).toBe(3);
      ctx.report();
      ctx.c.workflow.state = 'running';
      ctx.c.state.status = { activeState: 'Run' };
      await ctx.service.action({ port: 'TEST', action: 'stop' });
      expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['feedhold']]);
      ctx.c.state.status = { activeState: 'Idle' };
      ctx.report();
      jest.advanceTimersByTime(60);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
      expect(jest.getTimerCount()).toBe(0);
    });

    test('a macro waiting in a dwell (CNCjs queue not empty) can be stopped', async () => {
      const ctx = ready();
      realistic(ctx);
      ctx.c.feeder = { toJSON: () => ({ queue: 2, pending: true }) };
      ctx.report();
      expect(ctx.state().canStop).toBe(true);
      await ctx.req('stop');
      expect(ctx.c.commands).toEqual([['feeder:stop'], ['gcode:stop'], ['feedhold']]);
      ctx.c.state.status = { activeState: 'Hold', subState: 0 };
      ctx.report();
      await wait(150);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    test('stop during homing: Grbl sends no report in the cycle, the $H sent is enough', async () => {
      const ctx = ready();
      const ticket = await ctx.req('prepare', { operation: 'home' });
      await ctx.req('home', { nonce: ticket.nonce });
      // No report during the cycle: the last one still says Idle.
      ctx.now += 4000;
      expect(ctx.state().canStop).toBe(true);
      expect(ctx.state().homing).toBe(true);
      expect((await ctx.req('stop')).message).toMatch(/interrompue/);
      expect(ctx.c.commands.at(-1)).toEqual(['reset']);
    });

    test('the homing cycle ends with the first Idle or Alarm report after it, an alarm or a restart', async () => {
      const ctx = ready();
      let ticket = await ctx.req('prepare', { operation: 'home' });
      await ctx.req('home', { nonce: ticket.nonce });
      ctx.report(); // a report already on its way
      expect(ctx.state().homing).toBe(true);
      ctx.now += 5000;
      ctx.report();
      expect(ctx.state().homing).toBe(false);
      expect(ctx.state().canStop).toBe(false);
      ticket = await ctx.req('prepare', { operation: 'home' });
      await ctx.req('home', { nonce: ticket.nonce });
      ctx.c.runner.emit('alarm', { message: '9' });
      expect(ctx.state().homing).toBe(false);
    });

    test('board restarts are counted and the banner gives the firmware', () => {
      const ctx = ready();
      expect(ctx.state().startups).toBe(0);
      ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.3a', message: '[$ for help]' });
      ctx.report();
      expect(ctx.state().startups).toBe(1);
      expect(ctx.state().firmware).toBe('Grbl 1.3a');
    });

    test('a controller destroyed during a load is refused, not re-registered', async () => {
      const ctx = ready();
      const load = ctx.req('load', { file: 'test.nc' });
      ctx.c.isClose = () => true;
      ctx.c.runner = null;
      await expect(load).rejects.toThrow(/indisponible|non connecté/);
    });

    test('a pending confirmation is reported per transport', async () => {
      const ctx = ready();
      expect(ctx.service.ticketPending(ctx.transportId)).toBe(false);
      await ctx.req('prepare', { operation: 'spindle' });
      expect(ctx.service.ticketPending(ctx.transportId)).toBe(true);
      expect(ctx.service.ticketPending('other')).toBe(false);
      ctx.now += 16000;
      expect(ctx.service.ticketPending(ctx.transportId)).toBe(false);
    });
  });

  describe('resume from a line and program pauses', () => {
    const started = async (ctx, file = 'test.nc', extra = {}) => {
      ctx.report();
      await ctx.req('load', { file, ...extra });
      const state = ctx.state();
      const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      return ctx.state();
    };

    test('a resume plan is computed without loading anything', async () => {
      const ctx = setup();
      ctx.report();
      const plan = await ctx.req('resumePlan', { file: 'resume.nc', line: 7 });
      expect(plan).toMatchObject({ from: 7, total: 11, line: 'G1 Y10', spindle: { mode: 'M3', speed: 9000 } });
      expect(plan.preamble).toEqual(['(CNCjs Touch : reprise a la ligne 7 de resume.nc)', 'G21 G90 G17 G94', 'G0 Z5', 'G0 X10 Y0', 'M3 S9000', 'G4 P3', 'G1 Z-1 F200', 'F800']);
      expect(plan.notes[0]).toMatch(/dégagement Z5 .*pas une garantie/);
      expect(plan.program).toBeUndefined();
      expect(ctx.c.commands).toEqual([]);
      await expect(ctx.req('resumePlan', { file: 'resume.nc', line: 4 })).rejects.toThrow(/Position|dégagement/);
      await expect(ctx.req('resumePlan', { file: '../resume.nc', line: 7 })).rejects.toThrow(/Nom de fichier/);
    });

    test('loading from a line sends the rebuilt program and reports it as a resume', async () => {
      const ctx = setup();
      ctx.report();
      await ctx.req('load', { file: 'resume.nc', fromLine: 7 });
      const [name, file, program] = ctx.c.commands[0];
      expect(name).toBe('gcode:load');
      expect(file).toBe('resume.nc');
      expect(program.split('\n').slice(0, 9)).toEqual(['(CNCjs Touch : reprise a la ligne 7 de resume.nc)', 'G21 G90 G17 G94', 'G0 Z5', 'G0 X10 Y0', 'M3 S9000', 'G4 P3', 'G1 Z-1 F200', 'F800', 'G1 Y10']);
      const state = ctx.state();
      expect(state.resume).toMatchObject({ from: 7, total: 11, line: 'G1 Y10', notes: [expect.stringMatching(/dégagement/), expect.stringMatching(/Retrait en rapide/), expect.stringMatching(/repère/)] });
      expect(state.canStart).toBe(true);
      // A normal load clears it.
      await ctx.req('load', { file: 'resume.nc' });
      expect(ctx.state().resume).toBe(null);
    });

    test('the line where a job was stopped is kept, in the numbering of the original file', async () => {
      const ctx = setup();
      await started(ctx);
      ctx.c.sender.state = { ...ctx.c.sender.state, received: 2 };
      await ctx.req('stop');
      expect(ctx.state().stoppedAtLine).toBe(2);
      // In a resume program, preamble lines are not lines of the file.
      await started(ctx, 'resume.nc', { fromLine: 7 });
      ctx.c.sender.state = { ...ctx.c.sender.state, received: 10 };
      await ctx.req('stop');
      expect(ctx.state().stoppedAtLine).toBe(8);
      await started(ctx, 'resume.nc', { fromLine: 7 });
      ctx.c.sender.state = { ...ctx.c.sender.state, received: 3 };
      await ctx.req('stop');
      expect(ctx.state().stoppedAtLine).toBe(6); // stopped in the preamble: before line 7
    });

    test('a tool change (M6) pause is explained, M5 is allowed, and the resume restarts the spindle first', async () => {
      const ctx = setup();
      await started(ctx);
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '12000', tool: '1' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.state.status.activeState = 'Run'; // buffered moves still running
      ctx.c.state.status.spindle = 12000;
      ctx.report();
      expect(ctx.state()).toMatchObject({ programPause: { kind: 'M6', message: 'T2 M6', tool: 2 }, canResume: false });
      ctx.c.state.status.activeState = 'Idle';
      ctx.report();
      let state = ctx.state();
      expect(state.canResume).toBe(true);
      expect(state.canSpindleStop).toBe(true);
      await ctx.req('spindleStop');
      ctx.c.state.status.spindle = 0;
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '12000', tool: '1' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      state = ctx.state();
      expect(state.programPause).toMatchObject({ kind: 'M6', restartSpindle: { mode: 'M3', speed: 12000 } });
      const ticket = await ctx.req('prepare', { operation: 'resume', revision: state.revision });
      const resumed = ctx.req('resume', { nonce: ticket.nonce });
      ctx.c.runner.emit('ok'); // M3
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      // CNCjs's feeder has sent the G4 and is no longer pending, but the dwell runs.
      expect(ctx.c.commands.at(-1)).toEqual(['gcode', ['M3 S12000', 'G4 P3']]);
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.runner.emit('ok'); // the $G reply's ok
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      expect(ctx.c.commands.at(-1)).toEqual(['gcode', ['M3 S12000', 'G4 P3']]);
      ctx.c.runner.emit('ok'); // G4, once the dwell is over
      expect((await resumed).message).toMatch(/Broche relancée/);
      expect(ctx.c.commands.slice(-3)).toEqual([['gcode', 'M5'], ['gcode', ['M3 S12000', 'G4 P3']], ['gcode:resume']]);
    });

    const toolChangePause = async (ctx) => {
      await started(ctx);
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.state.status.spindle = 12000;
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ctx.c.state.status.spindle = 0;
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      const state = ctx.state();
      return ctx.req('prepare', { operation: 'resume', revision: state.revision });
    };

    test('a controller destroyed during the spin-up ends the resume without throwing', async () => {
      const ctx = setup();
      const ticket = await toolChangePause(ctx);
      const resumed = ctx.req('resume', { nonce: ticket.nonce });
      // USB cable pulled: CNCjs destroys the controller.
      ctx.c.isClose = () => true;
      ctx.c.feeder = null;
      ctx.c.workflow = null;
      await expect(resumed).rejects.toThrow(/Reprise annulée/i);
      expect(ctx.c.commands.some(([n]) => n === 'gcode:resume')).toBe(false);
    });

    test('a refused spin-up line or a stop during the spin-up never resumes', async () => {
      let ctx = setup();
      let ticket = await toolChangePause(ctx);
      let resumed = ctx.req('resume', { nonce: ticket.nonce });
      ctx.c.runner.emit('error', { message: '20' });
      await expect(resumed).rejects.toThrow(/error:20/);
      ctx = setup();
      ticket = await toolChangePause(ctx);
      resumed = ctx.req('resume', { nonce: ticket.nonce });
      ctx.c.runner.emit('ok');
      ctx.c.workflow.state = 'idle'; // the operator stopped the job
      ctx.c.runner.emit('ok');
      await expect(resumed).rejects.toThrow(/Reprise annulée/i);
      expect(ctx.c.commands.some(([n]) => n === 'gcode:resume')).toBe(false);
    });

    test('the spindle to restart is learnt during the tool change pause, until the operator stops it', async () => {
      const ctx = setup();
      await started(ctx);
      // Seen on the simulator: when the pause begins, $G still says M5 and FS says 0.
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '0' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.state.status.spindle = 0;
      ctx.report();
      expect(ctx.state().programPause.restartSpindle).toBe(null);
      // A fresh $G then shows the spindle on.
      ctx.now += 500;
      ctx.c.state.status.spindle = 8000;
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '8000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      expect(ctx.state().programPause.restartSpindle).toEqual({ mode: 'M3', speed: 8000 });
      // The operator stops it: what to restart is kept.
      ctx.now += 500;
      ctx.c.state.status.spindle = 0;
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '8000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ctx.now += 5000;
      ctx.report();
      expect(ctx.state().programPause.restartSpindle).toEqual({ mode: 'M3', speed: 8000 });
    });

    test('M0 and M1 pauses can be resumed; a pause on a Grbl error cannot', async () => {
      const ctx = setup();
      const state = await started(ctx);
      ctx.c.workflow.state = 'paused';
      ctx.c.state.status.activeState = 'Hold';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M0', msg: 'M0 (check the clamps)' } };
      ctx.report();
      expect(ctx.state()).toMatchObject({ programPause: { kind: 'M0', message: 'M0 (check the clamps)', restartSpindle: null }, canResume: true });
      const ticket = await ctx.req('prepare', { operation: 'resume', revision: state.revision });
      await ctx.req('resume', { nonce: ticket.nonce });
      expect(ctx.c.commands.at(-1)).toEqual(['gcode:resume']);
      ctx.c.workflow.state = 'paused';
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { err: true, msg: 'error:24' } };
      ctx.report();
      expect(ctx.state()).toMatchObject({ programPause: { kind: 'error' }, canResume: false });
      expect(ctx.state().resumeReason).toMatch(/erreur/);
    });
  });

  describe('Z zero with a touch plate', () => {
    // A controller whose Z axis answers probes: the plate sits at `plateZ`
    // (work coordinates), or nowhere when null. Like CNCjs's feeder, a single
    // line is no longer pending once sent; like Grbl, a report taken before the
    // line runs still shows the old state, and the line answers `ok` once done,
    // followed by fresh reports. $G replies ([GC:…] + ok) come in between.
    const probeController = ({ plateZ = -12.3, delay = 5 } = {}) => {
      const c = fakeController();
      c.settings = { version: '1.1h', settings: { $13: 0, $22: 1, $30: 24000, $31: 6000, $110: 1000, $111: 1000, $112: 200 } };
      c.state.status = { activeState: 'Idle', wpos: { x: '0.000', y: '0.000', z: '3.000' }, mpos: { x: '-100.000', y: '-100.000', z: '-20.000' }, spindle: 0 };
      c.runner.state = c.state;
      c.state.parserstate = { modal: { motion: 'G1', wcs: 'G54', distance: 'G90', units: 'G21', spindle: 'M5' }, feedrate: '800' };
      let pending = false;
      c.feeder = { toJSON: () => ({ queue: 0, pending }) };
      c.sent = [];
      c.pinState = '';
      const report = () => c.runner.emit('status', { raw: '<' + c.state.status.activeState + '|WPos:0,0,' + c.state.status.wpos.z + (c.pinState ? '|Pn:' + c.pinState : '') + '>' });
      c.report = report;
      const z = () => Number(c.state.status.wpos.z);
      const setZ = (v) => {
        const offset = Number(c.state.status.mpos.z) - z();
        c.state.status = { ...c.state.status, wpos: { ...c.state.status.wpos, z: v.toFixed(3) }, mpos: { ...c.state.status.mpos, z: (v + offset).toFixed(3) } };
        c.runner.state = c.state;
      };
      const original = c.command;
      c.command = (name, ...args) => {
        if (name !== 'gcode') {
          original(name, ...args);
          return;
        }
        const line = args[0];
        c.sent.push(line);
        pending = false;
        setTimeout(() => {
          report(); // taken before Grbl started the line
          c.runner.emit('parserstate', c.state.parserstate);
          c.runner.emit('ok'); // the $G reply's ok, not the line's
        }, 1);
        setTimeout(() => {
          let m;
          if ((m = /^G38\.2 Z(-?[\d.]+) F(\d+)$/.exec(line))) {
            const target = Number(m[1]);
            if (plateZ !== null && plateZ >= target && plateZ <= z()) {
              setZ(plateZ);
              c.pinState = 'P';
            } else {
              setZ(target);
              c.state.status = { ...c.state.status, activeState: 'Alarm' };
              c.runner.state = c.state;
              c.runner.emit('alarm', { message: '5', raw: 'ALARM:5' });
            }
          } else if ((m = /^G0 Z(-?[\d.]+)$/.exec(line))) {
            setZ(Number(m[1]));
            c.pinState = '';
          } else if ((m = /^G10 L20 P0 Z(-?[\d.]+)$/.exec(line))) {
            // The work offset moves so that the current position reads Z = value.
            c.state.status = { ...c.state.status, wpos: { ...c.state.status.wpos, z: Number(m[1]).toFixed(3) } };
            c.runner.state = c.state;
          }
          if (!/^Alarm/.test(c.state.status.activeState)) {
            c.runner.emit('ok');
          }
          report();
          setTimeout(report, delay);
          setTimeout(report, 2 * delay);
        }, delay);
      };
      return c;
    };
    const plate = (options) => {
      const ctx = setup();
      ctx.c = probeController(options);
      ctx.controllers.TEST = ctx.c;
      ctx.generation = ctx.service.list()[0].generation;
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      return ctx;
    };

    test('a confirmed plate probe sets the work Z and leaves the modal state alone', async () => {
      const ctx = plate();
      expect(ctx.state().canZeroZ).toBe(true);
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      expect(ticket.name).toMatch(/10 mm/);
      const result = await ctx.req('zeroZ', { nonce: ticket.nonce });
      expect(result.message).toMatch(/Zéro Z réglé/);
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100', 'G0 Z-11.3', 'G38.2 Z-13.3 F25', 'G10 L20 P0 Z10', 'G0 Z15']);
      expect(ctx.c.sent.some((l) => /G91|G21|G20/.test(l))).toBe(false);
      expect(ctx.state().zeroZ).toMatchObject({ thickness: 10, wcs: 'G54', machineZ: -35.3 });
      expect(ctx.state().probing).toBe(false);
    });

    test('disposing the service during a probe ends it: the sequence rejects and sends no further line', async () => {
      const ctx = plate({ delay: 60 });
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 20 });
      const run = ctx.req('zeroZ', { nonce: ticket.nonce });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100']);
      ctx.service.dispose();
      await expect(run).rejects.toThrow(/abandonné/);
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100']);
      expect(ctx.c.runner.listenerCount('ok')).toBe(0);
    });

    test('a report taken before Grbl starts a probe line is not taken for its end (the ok of the line is awaited)', async () => {
      const ctx = plate({ delay: 250 });
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      const result = await ctx.req('zeroZ', { nonce: ticket.nonce });
      expect(result.message).toMatch(/Zéro Z réglé/);
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100', 'G0 Z-11.3', 'G38.2 Z-13.3 F25', 'G10 L20 P0 Z10', 'G0 Z15']);
    }, 15000);

    test('while probing, loads, starts, macros and resumes are refused; stop stays possible', async () => {
      const ctx = plate({ delay: 60 });
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 20 });
      const run = ctx.req('zeroZ', { nonce: ticket.nonce });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      const state = ctx.state();
      expect(state.probing).toBe(true);
      expect(state.loadReason).toMatch(/Palpage en cours/);
      expect(state.macroReason).toMatch(/Palpage en cours/);
      expect(() => ctx.service.reserveSystemCommand({ id: 'cmd', title: 'Éteindre', commands: 'sudo poweroff' })).toThrow(/Palpage en cours/);
      expect(state.canZeroZ).toBe(false);
      expect(state.canStop).toBe(true);
      await run;
      expect(ctx.state().probing).toBe(false);
    });

    test('no contact within the search distance: the alarm ends the sequence and is explained', async () => {
      const ctx = plate({ plateZ: null });
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      await expect(ctx.req('zeroZ', { nonce: ticket.nonce })).rejects.toThrow(/Alarme pendant le palpage \(ALARM:5\)/);
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100']);
      expect(ctx.state().zeroZ).toMatchObject({ failed: expect.stringMatching(/ALARM:5/) });
      expect(ctx.state().probing).toBe(false);
    });

    test('refused: probe in contact, relative or inch mode, spindle on, running job, bad parameters', async () => {
      const ctx = plate();
      ctx.c.pinState = 'P';
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/déjà en contact/);
      ctx.c.pinState = '';
      ctx.c.state.parserstate = { modal: { wcs: 'G54', distance: 'G91', units: 'G21', spindle: 'M5' } };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/G91/);
      ctx.c.state.parserstate = { modal: { wcs: 'G54', distance: 'G90', units: 'G20', spindle: 'M5' } };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/G20/);
      ctx.c.state.parserstate = { modal: { wcs: 'G54', distance: 'G90', units: 'G21', spindle: 'M5' } };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.state.status = { ...ctx.c.state.status, spindle: 9000 };
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/broche/);
      ctx.c.state.status = { ...ctx.c.state.status, spindle: 0 };
      ctx.c.workflow.state = 'running';
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/repos ou pendant une pause/);
      ctx.c.workflow.state = 'idle';
      ctx.c.report();
      await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 0, search: 20 })).rejects.toThrow(/Épaisseur/);
      await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 500 })).rejects.toThrow(/recherche/);
      expect(ctx.c.sent).toEqual([]);
    });

    test('refused when the reports are in inches ($13=1) or $13 is unknown', () => {
      const ctx = plate();
      ctx.c.settings.settings.$13 = 1;
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch('$13=0');
      delete ctx.c.settings.settings.$13;
      expect(ctx.state().zeroZReason).toMatch('$13=0');
      ctx.c.settings.settings.$13 = '0';
      expect(ctx.state().canZeroZ).toBe(true);
    });

    const pausedPlate = (options) => {
      const ctx = plate(options);
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.report();
      return ctx;
    };

    test('during a pause, an arc motion mode (not restorable without axis words) is refused', () => {
      const ctx = pausedPlate();
      ctx.c.state.parserstate = { ...ctx.c.state.parserstate, modal: { ...ctx.c.state.parserstate.modal, motion: 'G2' } };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/G2/);
    });

    test('a probe failed during a pause forbids resuming the paused program', async () => {
      const ctx = setup();
      ctx.c = probeController({ plateZ: null });
      ctx.controllers.TEST = ctx.c;
      ctx.generation = ctx.service.list()[0].generation;
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      await ctx.req('load', { file: 'test.nc' });
      let state = ctx.state();
      let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.report();
      ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      await expect(ctx.req('zeroZ', { nonce: ticket.nonce })).rejects.toThrow(/ALARM:5/);
      ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Idle' }; // after $X
      ctx.c.report();
      state = ctx.state();
      expect(state.canResume).toBe(false);
      expect(state.resumeReason).toMatch(/Palpage échoué/);
    });

    test('stop while probing during a pause ends the job like any stop (line kept, not finished)', async () => {
      const ctx = setup();
      ctx.c = probeController({ delay: 80 });
      ctx.controllers.TEST = ctx.c;
      ctx.generation = ctx.service.list()[0].generation;
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.c.report();
      await ctx.req('load', { file: 'test.nc' });
      let state = ctx.state();
      let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      ctx.c.sender.state = { ...ctx.c.sender.state, received: 2 };
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.report();
      ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      const run = ctx.req('zeroZ', { nonce: ticket.nonce }).catch((err) => err);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect((await ctx.req('stop')).message).toMatch(/Palpage interrompu/);
      await run;
      state = ctx.state();
      expect(state.stoppedAtLine).toBe(2);
      expect(state.finished).toBe(false);
    });

    test('allowed during a tool change pause once the machine has stopped', async () => {
      const ctx = plate();
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.report();
      expect(ctx.state().canZeroZ).toBe(true);
      const ticket = await ctx.req('prepare', { operation: 'zeroZ', thickness: 10, search: 20 });
      await ctx.req('zeroZ', { nonce: ticket.nonce });
      // The program's motion mode and feed are given back (the probe ended in G0 F25).
      expect(ctx.c.sent).toEqual(['G38.2 Z-17 F100', 'G0 Z-11.3', 'G38.2 Z-13.3 F25', 'G10 L20 P0 Z10', 'G0 Z15', 'G1 F800']);
      ctx.c.sender.state = { ...ctx.c.sender.state, holdReason: { data: '%wait', msg: '' } };
      ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Hold' };
      ctx.c.report();
      expect(ctx.state().zeroZReason).toMatch(/repos ou pendant une pause|Idle/);
    });
  });

  // Cross-check (audit 31): record() after dispose on the asynchronous paths.
  describe('service lifecycle: record() after dispose', () => {
    const toolChangeResume = async (ctx) => {
      const state = await ctx.loaded();
      let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.state.status = { activeState: 'Idle', spindle: 12000 };
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ctx.c.state.status = { activeState: 'Idle', spindle: 0 };
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ticket = await ctx.req('prepare', { operation: 'resume', revision: state.revision });
      const resume = ctx.req('resume', { nonce: ticket.nonce });
      expect(ctx.c.commands.at(-1)).toEqual(['gcode', ['M3 S12000', 'G4 P3']]);
      // Wrapped: returning the promise itself would make the caller await the restart.
      return { resume };
    };

    test('a load in flight at dispose is refused cleanly (no unhandled exception), loading falls back', async () => {
      const ctx = setup();
      ctx.report();
      const load = ctx.req('load', { file: 'test.nc' });
      expect(ctx.state().loading).toBe(true);
      ctx.service.dispose();
      await expect(load).rejects.toThrow(/indisponible/);
      expect(ctx.c.commands.filter(([n]) => n === 'gcode:load')).toHaveLength(0);
    });

    test('a spindle restart (M6) in flight: dispose rejects it and no gcode:resume follows; same when the controller is forgotten', async () => {
      jest.useFakeTimers();
      let ctx = setup();
      let { resume } = await toolChangeResume(ctx);
      jest.advanceTimersByTime(250);
      ctx.service.dispose();
      await expect(resume).rejects.toThrow(/Broche non relancée/);
      ctx.c.runner.emit('ok');
      ctx.c.runner.emit('ok');
      jest.advanceTimersByTime(1000);
      expect(ctx.c.commands.some(([n]) => n === 'gcode:resume')).toBe(false);
      expect(ctx.c.runner.listenerCount('ok')).toBe(0);

      ctx = setup();
      ({ resume } = await toolChangeResume(ctx));
      ctx.c.isClose = () => true;
      ctx.service.list();
      await expect(resume).rejects.toThrow(/Broche non relancée/);
      expect(jest.getTimerCount()).toBe(0);
      expect(ctx.c.commands.some(([n]) => n === 'gcode:resume')).toBe(false);
    });

    test('every action after dispose is a 409 refusal, never a raw exception', async () => {
      const ctx = setup();
      ctx.report();
      ctx.service.dispose();
      const actions = ['load', 'resumePlan', 'prepare', 'start', 'pause', 'stop', 'spindleStop', 'settings', 'override'];
      const errors = await Promise.all(actions.map((action) => ctx.req(action, { file: 'test.nc', line: 2, operation: 'start' }).catch((e) => e)));
      errors.forEach((err) => expect(err).toMatchObject({ status: 409, message: 'Service indisponible.' }));
      expect(() => ctx.service.previewMotion({ port: 'TEST', axis: 'X', direction: 1, step: 1, feed: 200 })).toThrow(/fermée/);
    });
  });

  describe('system commands (host shutdown, restart) reserved against the machine', () => {
    const reserve = (ctx, title = 'Redémarrer', commands = 'sudo reboot') => ctx.service.reserveSystemCommand({ id: 'cmd-1', title, commands });

    test('a controller never listed (no stream client yet): the first attempt registers it, the next one passes', () => {
      const c = fakeController();
      const controllers = { TEST: c };
      let now = 10000;
      const service = createService({ get: () => controllers }, { get: () => [] }, () => now);
      services.push(service);
      c.runner.emit('status');
      c.runner.emit('status'); // nobody listened
      expect(c.runner.listenerCount('status')).toBe(0);
      expect(() => service.reserveSystemCommand({ id: 'cmd', title: 'Redémarrer', commands: 'sudo reboot' })).toThrow(/trop ancien.*réessayer/);
      expect(c.runner.listenerCount('status')).toBe(1); // now listening
      now += 250;
      c.runner.emit('status');
      service.reserveSystemCommand({ id: 'cmd', title: 'Redémarrer', commands: 'sudo reboot' }).release();
      // observe() does the same without building snapshots (the stream heartbeat calls it).
      const other = fakeController('OTHER');
      controllers.OTHER = other;
      service.observe();
      expect(other.runner.listenerCount('status')).toBe(1);
      other.runner.emit('status');
      service.reserveSystemCommand({ id: 'cmd', title: 'Redémarrer', commands: 'sudo reboot' }).release();
    });

    test('every perform() operation during a reservation: which pass, which are refused', async () => {
      const ctx = setup();
      ctx.macros = [{ id: 'm1', name: 'Park' }];
      const state = await ctx.loaded();
      const reservation = reserve(ctx);
      const attempts = {
        load: ['load', { file: 'test.nc' }],
        resumePlan: ['resumePlan', { file: 'test.nc', line: 2 }],
        readSettings: ['readSettings'],
        prepareStart: ['prepare', { operation: 'start', revision: state.revision }],
        prepareResume: ['prepare', { operation: 'resume', revision: state.revision }],
        prepareMacro: ['prepare', { operation: 'macro', macroId: 'm1' }],
        prepareUnlock: ['prepare', { operation: 'unlock' }],
        prepareHome: ['prepare', { operation: 'home' }],
        prepareSpindle: ['prepare', { operation: 'spindle' }],
        prepareZeroZ: ['prepare', { operation: 'zeroZ', thickness: 5, search: 10 }],
        overrideRapid: ['override', { kind: 'rapid', value: 50 }],
        overrideFeed: ['override', { kind: 'feed', value: 10 }],
        settings: ['settings']
      };
      const refused = {};
      await Promise.all(Object.entries(attempts).map(([name, [action, extra]]) => ctx.req(action, extra).then(() => null, (e) => e.message).then((m) => {
        refused[name] = m;
      })));
      Object.keys(attempts).filter((k) => k !== 'settings').forEach((k) => {
        expect([k, refused[k]]).toEqual([k, expect.stringMatching(/Commande système en cours \(Redémarrer\)/)]);
      });
      expect(refused.settings).toBe(null); // read-only, no command
      expect(ctx.c.commands.filter(([n]) => n !== 'gcode:load')).toEqual([]);
      // pause / stop / M5 never go through available().
      ctx.c.workflow.state = 'running';
      ctx.c.state.status.activeState = 'Run';
      await ctx.service.action({ port: 'TEST', action: 'pause' });
      ctx.c.workflow.state = 'paused';
      ctx.c.state.status.activeState = 'Hold';
      await ctx.service.action({ port: 'TEST', action: 'stop' });
      ctx.c.workflow.state = 'idle';
      ctx.c.state.status.activeState = 'Idle';
      await ctx.service.action({ port: 'TEST', action: 'spindleStop' });
      expect(ctx.c.commands.map(([n, a]) => (n === 'gcode' ? a : n))).toEqual(['gcode:load', 'gcode:pause', 'gcode:stop', 'reset', 'M5']);
      // Even with a stale report, pause passes (independent of available()).
      ctx.now += 10000;
      ctx.c.workflow.state = 'running';
      await expect(ctx.service.action({ port: 'TEST', action: 'pause' })).resolves.toBeTruthy();
      reservation.release();
    });

    test('a start confirmed but not yet sent is refused by a reservation; a running start refuses the reservation', async () => {
      const ctx = setup();
      const state = await ctx.loaded();
      let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      // Reservation between prepare and start: start re-reads available().
      const reservation = reserve(ctx);
      await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/Commande système/);
      expect(ctx.c.commands.some(([n]) => n === 'gcode:start')).toBe(false);
      reservation.release();
      // The ticket was consumed by the attempt: a new prepare is needed.
      await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/expirée/);
      ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      expect(ctx.c.workflow.state).toBe('running');
      expect(() => reserve(ctx)).toThrow(/travail est en cours/);
    });

    test('a spindle restart (M6) in flight refuses the reservation, and still completes', async () => {
      const ctx = setup();
      const state = await ctx.loaded();
      let ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      await ctx.req('start', { nonce: ticket.nonce });
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6', msg: 'T2 M6' } };
      ctx.c.state.status = { activeState: 'Idle', spindle: 12000 };
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M3' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ctx.c.state.status = { activeState: 'Idle', spindle: 0 };
      ctx.c.state.parserstate = { modal: { wcs: 'G54', spindle: 'M5' }, spindle: '12000' };
      ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
      ctx.report();
      ticket = await ctx.req('prepare', { operation: 'resume', revision: state.revision });
      const resume = ctx.req('resume', { nonce: ticket.nonce });
      expect(() => reserve(ctx)).toThrow(/travail est en cours/);
      ctx.c.runner.emit('ok');
      ctx.c.runner.emit('ok');
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      await expect(resume).resolves.toMatchObject({ message: expect.stringMatching(/relancée/) });
      expect(ctx.c.commands.at(-1)).toEqual(['gcode:resume']);
    });

    test('a macro sent (feeder busy) refuses the reservation until the queue is empty', async () => {
      const ctx = setup();
      ctx.macros = [{ id: 'm1', name: 'Park' }];
      ctx.report();
      const original = ctx.c.command;
      ctx.c.command = (name, ...args) => {
        original(name, ...args);
        if (name === 'macro:run') {
          ctx.c.macroDone = args[2];
        }
      };
      const ticket = await ctx.req('prepare', { operation: 'macro', macroId: 'm1' });
      const run = ctx.req('macro', { nonce: ticket.nonce });
      ctx.c.feeder = { toJSON: () => ({ queue: 1, pending: true }) };
      expect(() => reserve(ctx)).toThrow(/attente/);
      ctx.c.macroDone(null);
      await run;
      ctx.c.feeder = { toJSON: () => ({ queue: 0, pending: false }) };
      reserve(ctx).release();
    });

    test('a reservation taken before a load makes its first check refuse; after release the load passes', async () => {
      const ctx = setup();
      ctx.report();
      const reservation = reserve(ctx);
      await expect(ctx.req('load', { file: 'test.nc' })).rejects.toThrow(/Commande système/);
      expect(ctx.state().loading).toBe(false);
      reservation.release();
      await expect(ctx.req('load', { file: 'test.nc' })).resolves.toBeTruthy();
    });

    test('reservation, then the controller closes and a new one opens: the reservation holds, release frees it', () => {
      const ctx = setup();
      ctx.report();
      const reservation = reserve(ctx);
      ctx.c.isClose = () => true;
      expect(ctx.service.list()).toEqual([]);
      const fresh = fakeController();
      ctx.controllers.TEST = fresh;
      ctx.service.list(); // registers the new controller (listeners on)
      fresh.runner.emit('status');
      const [state] = ctx.service.list();
      expect(state.canLoad).toBe(false);
      expect(state.loadReason).toMatch(/Commande système en cours/);
      expect(ctx.service.systemCommand()).toMatchObject({ title: 'Redémarrer' });
      expect(() => reserve(ctx, 'Éteindre')).toThrow(/déjà en cours/);
      reservation.release();
      expect(ctx.service.list()[0].canLoad).toBe(true);
      reserve(ctx, 'Éteindre').release();
    });

    test('reservation, dispose, release(): no error, and a new instance is not affected', () => {
      const ctx = setup();
      ctx.report();
      const reservation = reserve(ctx);
      ctx.service.dispose();
      expect(ctx.service.systemCommand()).toBe(null);
      expect(() => reservation.release()).not.toThrow();
      expect(() => reservation.release()).not.toThrow();
      const next = setup();
      next.report();
      expect(next.service.systemCommand()).toBe(null);
      const r2 = reserve(next);
      reservation.release(); // the old one does not touch the new one
      expect(next.service.systemCommand()).toMatchObject({ title: 'Redémarrer' });
      r2.release();
    });

    test('two synchronous reservations: one passes; a stale release does not free the next one; the title is bounded', () => {
      const ctx = setup();
      ctx.report();
      const first = reserve(ctx, 'A');
      expect(() => reserve(ctx, 'B')).toThrow(/déjà en cours \(A\)/);
      first.release();
      const second = reserve(ctx, 'B');
      first.release(); // stale: must not free B
      expect(ctx.service.systemCommand()).toMatchObject({ title: 'B' });
      second.release();
      expect(ctx.service.systemCommand()).toBe(null);
      const r = ctx.service.reserveSystemCommand({ id: 'x', title: '', commands: 'y'.repeat(200) });
      expect(ctx.service.systemCommand().title).toBe('y'.repeat(80));
      r.release();
    });

    test('a reservation is exclusive, blocks every start until released, and stays visible in the snapshot', async () => {
      const ctx = setup();
      const state = await ctx.loaded();
      const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
      const reservation = reserve(ctx);
      expect(ctx.service.systemCommand()).toEqual({ title: 'Redémarrer', since: expect.any(Number) });
      expect(() => ctx.service.reserveSystemCommand({ id: 'cmd-2', title: 'Éteindre', commands: 'sudo poweroff' })).toThrow(/déjà en cours/);
      await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/commande système en cours/i);
      expect(ctx.c.commands.filter(([n]) => n === 'gcode:start')).toHaveLength(0);
      await expect(ctx.req('load', { file: 'test.nc' })).rejects.toThrow(/commande système/i);
      await expect(ctx.req('prepare', { operation: 'home' })).rejects.toThrow(/commande système/i);
      await expect(ctx.req('prepare', { operation: 'macro', macroId: 'x' })).rejects.toThrow(/commande système/i);
      await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 10 })).rejects.toThrow(/commande système/i);
      await expect(ctx.req('resumePlan', { file: 'resume.nc', line: 7 })).rejects.toThrow(/commande système/i);
      const snapshot = ctx.state();
      ['canLoad', 'canStart', 'canHome', 'canUnlock', 'canMacro', 'canSpindleTest', 'canZeroZ'].forEach((key) => {
        expect(snapshot[key]).toBe(false);
      });
      expect(snapshot.startReason).toMatch(/commande système/i);
      expect(ctx.c.commands.filter(([n]) => n !== 'gcode:load')).toEqual([]);
      reservation.release();
      reservation.release(); // idempotent
      expect(ctx.service.systemCommand()).toBe(null);
      expect(ctx.state().canStart).toBe(true);
    });

    test('a reservation is refused while a controller works, pauses, homes, moves, loads or has a stale report', async () => {
      const ctx = setup();
      expect(() => reserve(ctx)).toThrow(/trop ancien/);
      ctx.report();
      ctx.c.workflow.state = 'running';
      expect(() => reserve(ctx)).toThrow(/travail/);
      ctx.c.workflow.state = 'paused';
      expect(() => reserve(ctx)).toThrow(/travail/);
      ctx.c.workflow.state = 'idle';
      ['Run', 'Hold', 'Home', 'Jog'].forEach((activeState) => {
        ctx.c.state.status.activeState = activeState;
        expect(() => reserve(ctx)).toThrow(/mouvement|occupée/);
      });
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.feeder = { toJSON: () => ({ queue: 1, pending: false }) };
      expect(() => reserve(ctx)).toThrow(/attente/);
      ctx.c.feeder = { toJSON: () => ({ queue: 0, pending: false }) };
      // A homing cycle: Grbl reports nothing during it, the $H sent is enough.
      ctx.c.settings = { settings: { $22: 1, $110: 1000, $111: 1000, $112: 200 } };
      const ticket = await ctx.req('prepare', { operation: 'home' });
      await ctx.req('home', { nonce: ticket.nonce });
      expect(() => reserve(ctx)).toThrow(/origine/);
      ctx.now += 5000;
      ctx.report();
      // A load in progress.
      const load = ctx.req('load', { file: 'test.nc' });
      expect(() => reserve(ctx)).toThrow(/Chargement/);
      await load;
      expect(ctx.service.systemCommand()).toBe(null);
      reserve(ctx).release();
      // A closed controller does not count.
      ctx.c.isClose = () => true;
      reserve(ctx).release();
    });

    test('pause, stop and M5 stay possible during a reservation; a disposed service refuses one', async () => {
      const ctx = setup();
      ctx.report();
      const reservation = reserve(ctx);
      // A job started from the PC during the reservation can still be paused and stopped.
      ctx.c.workflow.state = 'running';
      ctx.c.state.status.activeState = 'Run';
      await ctx.req('pause');
      expect(ctx.c.commands.at(-1)).toEqual(['gcode:pause']);
      await ctx.req('stop');
      expect(ctx.c.commands.some(([n]) => n === 'gcode:stop')).toBe(true);
      ctx.c.state.status.activeState = 'Idle';
      ctx.c.workflow.state = 'idle';
      await ctx.service.action({ port: 'TEST', action: 'spindleStop' });
      expect(ctx.c.commands.at(-1)).toEqual(['gcode', 'M5']);
      reservation.release();
      ctx.service.dispose();
      expect(() => reserve(ctx)).toThrow(/indisponible/);
    });
  });

  test('the rapid override may be set at rest before a start; feed and spindle only during a job', async () => {
    const ctx = setup();
    ctx.report();
    let state = ctx.state();
    expect(state.canRapidOverride).toBe(true);
    expect(state.canOverride).toBe(false);
    await ctx.req('override', { kind: 'rapid', value: 25 });
    expect(ctx.c.commands).toEqual([['rapidOverride', 25]]);
    await expect(ctx.req('override', { kind: 'feed', value: 10 })).rejects.toThrow(/pendant un travail/);
    await expect(ctx.req('override', { kind: 'rapid', value: 30 })).rejects.toThrow(/invalide/);

    ctx.c.state.status.activeState = 'Alarm';
    state = ctx.state();
    expect(state.canRapidOverride).toBe(false);
    expect(state.rapidOverrideReason).toMatch(/au repos/);
    await expect(ctx.req('override', { kind: 'rapid', value: 50 })).rejects.toThrow(/au repos/);

    ctx.c.state.status.activeState = 'Run';
    ctx.c.workflow.state = 'running';
    expect(ctx.state().canRapidOverride).toBe(true);
    await ctx.req('override', { kind: 'rapid', value: 100 });
    expect(ctx.c.commands.at(-1)).toEqual(['rapidOverride', 100]);

    ctx.now += 10000;
    expect(ctx.state().canRapidOverride).toBe(false);
  });
});

// Audit 31, wave 2 (Services): the start bound to the exact program (A5), the
// durable history (F4), the travel pre-check (F2) and the attribution of
// control (F5), as wired into the service.
const TABLET_A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' };
const TABLET_B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'bob' };
const HTTP_USER = { kind: 'http', id: 'http:carl', user: 'carl' };

// Loads `file`, confirms and starts it as `actor`; returns the state after the start.
const started = async (ctx, actor, file = 'test.nc') => {
  ctx.report();
  await ctx.req('load', { file }, actor);
  const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision }, actor);
  await ctx.req('start', { nonce: ticket.nonce }, actor);
  return ctx.state();
};

describe('A5: a start is bound to the exact file that was loaded', () => {
  test('the snapshot carries the SHA-256 of the loaded file; a file replaced since the load refuses the confirmation and the start', async () => {
    const ctx = setup();
    const file = path.join(root, 'replaced.nc');
    await fs.writeFile(file, 'G21 G90\nG1 X1 F100\nM2');
    ctx.report();
    await ctx.req('load', { file: 'replaced.nc' });
    const state = ctx.state();
    expect(state.fingerprint).toBe(sha256('G21 G90\nG1 X1 F100\nM2'));
    expect(state.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    // A confirmation issued, then the file replaced under the same name (a new upload from the PC).
    const ticket = await ctx.req('prepare', { operation: 'start', revision: state.revision });
    await fs.writeFile(file, 'G21 G90\nG1 X999 F100\nM2');
    await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/Fichier modifié depuis le chargement : rechargez-le\./);
    expect(ctx.c.commands.some(([n]) => n === 'gcode:start')).toBe(false);
    expect(ctx.state().canStart).toBe(true); // the state itself is fine: a reload fixes it
    await expect(ctx.req('prepare', { operation: 'start', revision: state.revision })).rejects.toThrow(/Fichier modifié depuis le chargement/);
    // Reloaded: the new content is the one bound to the start.
    await ctx.req('load', { file: 'replaced.nc' });
    expect(ctx.state().fingerprint).toBe(sha256('G21 G90\nG1 X999 F100\nM2'));
    const again = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: again.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:start');
  });

  test('the same bytes written again (new mtime) or under another name are the same program: accepted', async () => {
    const ctx = setup();
    const file = path.join(root, 'rewritten.nc');
    await fs.writeFile(file, 'G21 G90\nG1 X2 F100\nM2');
    ctx.report();
    await ctx.req('load', { file: 'rewritten.nc' });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    await fs.writeFile(file, 'G21 G90\nG1 X2 F100\nM2');
    await ctx.req('start', { nonce: ticket.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:start');
    // Another name with the same content: its own load, its own (equal) fingerprint.
    await fs.writeFile(path.join(root, 'rewritten-copy.nc'), 'G21 G90\nG1 X2 F100\nM2');
    ctx.c.workflow.state = 'idle';
    ctx.report();
    await ctx.req('load', { file: 'rewritten-copy.nc' });
    expect(ctx.state().fingerprint).toBe(sha256('G21 G90\nG1 X2 F100\nM2'));
    const t2 = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: t2.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:start');
  });

  test('file access failures are answered with a stable French message (monitor error codes)', async () => {
    const ctx = setup();
    ctx.report();
    await expect(ctx.req('load', { file: 'missing.nc' })).rejects.toThrow(/introuvable/);
    const codes = ['ENOTCONFIGURED', 'EINVALIDNAME', 'EOUTSIDE', 'ENOTFILE', 'ETOOLARGE', 'EEMPTY', 'EBINARY', 'ECHANGED'];
    for (const code of codes) {
      const failing = setup({
        files: {
          readProgram: () => Promise.reject(Object.assign(new Error(code), { code })),
          fingerprintOf: () => Promise.resolve({})
        }
      });
      failing.report();
      // eslint-disable-next-line no-await-in-loop
      await expect(failing.req('load', { file: 'test.nc' })).rejects.toMatchObject({ status: 409, message: expect.not.stringMatching(/^E[A-Z]+$/) });
    }
    // A failure the monitor did not code is passed through (a server fault, not a 409).
    const odd = setup({
      files: {
        readProgram: () => Promise.reject(new Error('disk on fire')),
        fingerprintOf: () => Promise.resolve({})
      }
    });
    odd.report();
    await expect(odd.req('load', { file: 'test.nc' })).rejects.toThrow('disk on fire');
  });

  describe('through the real monitor service (production wiring)', () => {
    beforeAll(async () => {
      monitor.start({ watchDirectory: root });
      await new Promise((resolve, reject) => {
        const until = Date.now() + 5000;
        const poll = () => {
          if (monitor.isConfigured()) {
            resolve();
          } else if (Date.now() > until) {
            reject(new Error('monitor did not become configured'));
          } else {
            setTimeout(poll, 20);
          }
        };
        poll();
      });
    });

    afterAll(() => {
      monitor.stop();
    });

    test('load reads through monitor.readProgram, the start re-reads monitor.fingerprintOf, a replaced file is refused', async () => {
      const ctx = setup({ files: monitor });
      const file = path.join(root, 'monitored.nc');
      await fs.writeFile(file, 'G21 G90\nG1 X3 F100\nM2');
      ctx.report();
      await ctx.req('load', { file: 'monitored.nc' });
      expect(ctx.state().fingerprint).toBe(sha256('G21 G90\nG1 X3 F100\nM2'));
      const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
      await fs.writeFile(file, 'G21 G90\nG1 X4 F100\nM2');
      await expect(ctx.req('start', { nonce: ticket.nonce })).rejects.toThrow(/Fichier modifié depuis le chargement/);
      await expect(ctx.req('load', { file: '../monitored.nc' })).rejects.toThrow(/invalide/);
      await expect(ctx.req('load', { file: 'absent.nc' })).rejects.toThrow(/introuvable/);
    });
  });
});

describe('F4: job events reach the durable history', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-job-history-'));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  let n = 0;
  const withHistory = () => {
    const history = createHistory({ file: path.join(dir, 'h' + (++n) + '.jsonl'), now: () => 1700000000000 });
    const ctx = setup({ history });
    ctx.history = history;
    ctx.recorded = async () => {
      await history.flush();
      return (await history.read({ limit: 50 })).entries.reverse();
    };
    return ctx;
  };

  test('load, start, pause, resume and stop are recorded with the job, the controller and the actor; no ticket reaches the file', async () => {
    const ctx = withHistory();
    await started(ctx, TABLET_A);
    await ctx.req('pause', {}, TABLET_B);
    let ticket = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, TABLET_A);
    await ctx.req('resume', { nonce: ticket.nonce }, TABLET_A);
    ctx.c.state.status.activeState = 'Hold';
    ctx.c.sender.state = { ...ctx.c.sender.state, received: 2 };
    await ctx.req('stop', {}, HTTP_USER);
    const events = await ctx.recorded();
    expect(events.map((e) => e.event)).toEqual(['load', 'start', 'pause', 'resume', 'stop']);
    const [load, start, pause, , stop] = events;
    expect(load).toMatchObject({ program: 'test.nc', file: 'test.nc', fingerprint: sha256('G21 G90\nG1 X1 F100\nM2'), controller: { port: 'TEST', type: 'Grbl' }, actor: { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' } });
    expect(load.jobId).toMatch(/^[0-9a-f]{12}$/);
    expect(start).toMatchObject({ jobId: load.jobId, actor: { id: 'tablet-A' }, startedAt: expect.any(String) });
    expect(pause.actor).toMatchObject({ id: 'tablet-B' });
    expect(stop).toMatchObject({ result: 'stopped', line: 2, actor: { kind: 'http', id: 'http:carl', user: 'carl' } });
    const text = await fs.readFile(ctx.history.file, 'utf8');
    expect(text).not.toContain(ticket.nonce);
    expect(text).not.toContain('offline-transport');
    expect(text).not.toMatch(/"nonce"|"revision"|"transportId"/);
    ticket = null;
  });

  test('a program that ends is recorded finished (or in error with the count); the first refused line, an alarm and a board restart are recorded', async () => {
    const ctx = withHistory();
    await started(ctx, TABLET_A);
    ctx.c.sender.emit('end');
    let events = await ctx.recorded();
    expect(events.at(-1)).toMatchObject({ event: 'finish', result: 'finished', errors: 0, actor: { kind: 'system' } });

    // A new run from the PC, two refused lines, then the end.
    ctx.c.workflow.state = 'running';
    ctx.c.workflow.emit('start');
    ctx.c.sender.state = { ...ctx.c.sender.state, received: 1 };
    ctx.c.runner.emit('error', { message: '20' });
    ctx.c.runner.emit('error', { message: '33' });
    ctx.c.sender.emit('end');
    events = await ctx.recorded();
    expect(events.slice(-4).map((e) => e.event)).toEqual(['finish', 'start', 'error', 'finish']);
    expect(events.at(-3)).toMatchObject({ event: 'start', actor: { kind: 'socket', id: 'cncjs' } });
    expect(events.at(-2)).toMatchObject({ event: 'error', code: 20, line: 1 });
    expect(events.at(-1)).toMatchObject({ event: 'finish', result: 'error', errors: 2, lastError: 33 });

    // Alarm during a run, then a board restart during a pause.
    ctx.c.workflow.state = 'running';
    ctx.c.workflow.emit('start');
    ctx.c.runner.emit('alarm', { message: '1' });
    ctx.c.workflow.state = 'paused';
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    ctx.c.runner.emit('startup', {}); // a second restart is not a second abort
    events = await ctx.recorded();
    expect(events.slice(-3).map((e) => [e.event, e.code || e.result])).toEqual([['start', undefined], ['alarm', 1], ['aborted', 'aborted']]);
  });
});

describe('F2: the travel pre-check of the loaded program follows the machine state', () => {
  const machineReady = (ctx, extra = {}) => {
    ctx.c.settings.settings = { ...ctx.c.settings.settings, $13: 0, $20: 1, $22: 1, $23: 0, $130: 300, $131: 200, $132: 80, ...extra };
    ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Idle', mpos: { x: -250, y: -150, z: -40 }, wpos: { x: 0, y: 0, z: 0 } };
    ctx.c.state.parserstate = { modal: { wcs: 'G54', units: 'G21', distance: 'G90' } };
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
    ctx.report();
  };

  test('homing enabled is not homing done: unknown until a homing cycle is seen complete, then validated; an alarm or a restart undoes it', async () => {
    const ctx = setup();
    machineReady(ctx);
    await ctx.req('load', { file: 'square.nc' });
    let check = ctx.state().programCheck;
    expect(check.verdict).toBe('unknown');
    expect(check.reasons.join(' ')).toMatch(/Référencement non constaté/);
    expect(ctx.state().homed).toBe(false);
    // The confirmation carries the same check, as a warning: the start is not blocked.
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    expect(ticket.programCheck.verdict).toBe('unknown');
    // A homing made from anywhere (Home state then Idle) is observed.
    ctx.c.state.status.activeState = 'Home';
    ctx.report();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    expect(ctx.state().homed).toBe(true);
    check = ctx.state().programCheck;
    expect(check.verdict).toBe('validated');
    expect(check.axes.Z).toMatchObject({ verdict: 'validated', machineMin: -43, machineMax: -35 });
    expect(check.zMin).toBe(-3);
    // A shorter Z travel: outside, with the figures.
    machineReady(ctx, { $132: 40 });
    check = ctx.state().programCheck;
    expect(check.verdict).toBe('outside');
    expect(check.axes.Z.reasons[0]).toMatch(/Hors course Z : -43 → -35 mm machine \(course -40 → 0\)/);
    // An alarm loses the reference.
    ctx.c.runner.emit('alarm', { message: '1' });
    ctx.report();
    expect(ctx.state().homed).toBe(false);
    expect(ctx.state().programCheck.verdict).toBe('unknown');
    // Our own homing cycle, seen complete, restores it; a board restart undoes it.
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    const home = await ctx.req('prepare', { operation: 'home' });
    await ctx.req('home', { nonce: home.nonce });
    ctx.now += 1500;
    ctx.report();
    expect(ctx.state().homed).toBe(true);
    ctx.c.runner.emit('startup', {});
    ctx.report();
    expect(ctx.state().homed).toBe(false);
  });

  test('a program that leaves its units to the machine, a stale $G, and a macro file: never a green light', async () => {
    const ctx = setup();
    machineReady(ctx);
    ctx.c.state.status.activeState = 'Home';
    ctx.report();
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    await ctx.req('load', { file: 'bare.nc' });
    expect(ctx.state().programCheck.verdict).toBe('validated'); // machine in a fresh G21 G90
    ctx.now += 3000;
    ctx.report();
    expect(ctx.state().programCheck.verdict).toBe('unknown');
    expect(ctx.state().programCheck.reasons.join(' ')).toMatch(/ne fixe pas ses unités.*modal.*inconnu/);
    // The `check` action looks at any library file against this controller, without loading it.
    ctx.c.runner.emit('parserstate', ctx.c.state.parserstate);
    ctx.report();
    const result = await ctx.req('check', { file: 'square.nc' });
    expect(result).toMatchObject({ file: 'square.nc', fingerprint: expect.stringMatching(/^sha256:/), programCheck: { verdict: 'validated', scope: expect.stringMatching(/ni brides/) } });
    // A CNCjs macro file is refused outright (the library takes plain G-code only); an
    // unfollowed word (dynamic tool offset) makes the verdict unknown, never validated.
    await fs.writeFile(path.join(root, 'macro-check.nc'), 'G21 G90\n%wait\nG0 X10');
    await expect(ctx.req('check', { file: 'macro-check.nc' })).rejects.toThrow(/directives CNCjs %/);
    await fs.writeFile(path.join(root, 'tlo-check.nc'), 'G21 G90\nG43.1 Z2\nG0 X10 Z5');
    const tlo = await ctx.req('check', { file: 'tlo-check.nc' });
    expect(tlo.programCheck.verdict).toBe('unknown');
    expect(tlo.programCheck.axes.X.verdict).toBe('validated');
    expect(tlo.programCheck.uninterpreted).toEqual([{ line: 2, code: 'G43.1', impact: true }]);
    // A resume from a line checks the rebuilt program (preamble included).
    await ctx.req('load', { file: 'resume.nc', fromLine: 7 });
    expect(ctx.state().programCheck).toMatchObject({ verdict: 'validated', zMax: 5 });
  });
});

describe('F5: attribution of control in the service', () => {
  const withControl = () => {
    // The control module shares the test clock (ctx.now) through a box read by both.
    const box = { now: 10000 };
    const control = createControl({ now: () => box.now, elapsed: () => box.now, graceMs: 60000 });
    const ctx = setup({ control });
    Object.defineProperty(ctx, 'now', {
      get: () => box.now,
      set: (v) => {
        box.now = v;
      }
    });
    ctx.control = control;
    return ctx;
  };

  test('a touch client claims a free port by its first guarded operation; a second one is refused naming it; Pause and Stop stay open to everyone', async () => {
    const ctx = withControl();
    expect(ctx.state().control.owner).toBeNull();
    await started(ctx, TABLET_A);
    expect(ctx.state().control.owner).toMatchObject({ kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' });
    expect(ctx.state().control.lastChange).toMatchObject({ type: 'claim' });
    await expect(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, TABLET_B)).rejects.toMatchObject({
      status: 409,
      code: 'ECONTROL',
      message: expect.stringMatching(/Pilotage de TEST attribué à « Tablette A » \(tablette, ana\).*Pause et Arrêt restent possibles/)
    });
    await expect(ctx.req('override', { kind: 'feed', value: 10 }, TABLET_B)).rejects.toThrow(/Tablette A/);
    await expect(ctx.req('load', { file: 'test.nc' }, HTTP_USER)).rejects.toThrow(/Tablette A/);
    // Pause by another tablet, stop by an HTTP caller, M5 by anyone: never refused for the lease.
    await ctx.req('pause', {}, TABLET_B);
    expect(ctx.c.commands.at(-1)).toEqual(['gcode:pause']);
    ctx.c.state.status.activeState = 'Hold';
    await ctx.req('stop', {}, HTTP_USER);
    expect(ctx.c.commands.slice(-2)).toEqual([['gcode:stop'], ['reset']]);
    ctx.c.state.status.activeState = 'Idle';
    ctx.report();
    await ctx.req('spindleStop', {}, TABLET_B);
    expect(ctx.c.commands.at(-1)).toEqual(['gcode', 'M5']);
    // The owner still pilots; the status operation tells each client its role.
    expect(await ctx.req('control', { operation: 'status' }, TABLET_A)).toMatchObject({ role: 'operator', owner: { id: 'tablet-A' } });
    expect(await ctx.req('control', { operation: 'status' }, TABLET_B)).toMatchObject({ role: 'observer' });
  });

  test('a free port is open to the classic interface (HTTP without clientId) and is not claimed by it', async () => {
    const ctx = withControl();
    await started(ctx, HTTP_USER);
    expect(ctx.state().control.owner).toBeNull();
    // And to an anonymous call (no actor at all), as before this wave.
    ctx.c.workflow.state = 'idle';
    ctx.report();
    await ctx.req('load', { file: 'test.nc' });
    expect(ctx.state().control.owner).toBeNull();
  });

  test('an abandoned tablet (stream closed) frees the port after the grace delay; a reconnection with the same clientId inside it keeps the lease', async () => {
    const ctx = withControl();
    ctx.service.openTransport('stream-A', TABLET_A);
    await started(ctx, TABLET_A);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A', present: true, expires: null });
    // The tablet's stream closes (tab closed, network lost).
    ctx.service.closeTransport('stream-A');
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A', present: false, expires: ctx.now + 60000 });
    ctx.now += 30000;
    ctx.report();
    await expect(ctx.req('pause', {}, TABLET_B)).resolves.toBeTruthy(); // pause stays open
    await expect(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, TABLET_B)).rejects.toThrow(/Tablette A/);
    // Back within the grace delay: the lease is restored, nothing was transferred.
    ctx.service.openTransport('stream-A2', TABLET_A);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-A', present: true });
    expect(ctx.state().control.lastChange.type).toBe('restored');
    ctx.service.closeTransport('stream-A2');
    ctx.now += 60001;
    ctx.report();
    // The heartbeat's observe() ends the lease: the port is free, nobody inherited it.
    ctx.service.observe();
    expect(ctx.state().control.owner).toBeNull();
    expect(ctx.state().control.lastChange).toMatchObject({ type: 'expired', previous: { id: 'tablet-A' } });
    const ticket = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, TABLET_B);
    expect(ctx.state().control.owner).toMatchObject({ id: 'tablet-B' });
    await ctx.req('resume', { nonce: ticket.nonce }, TABLET_B);
    expect(ctx.c.commands.at(-1)).toEqual(['gcode:resume']);
  });

  test('an explicit takeover needs a reason, is visible to the previous owner through the snapshot, and the previous owner is then refused', async () => {
    const ctx = withControl();
    ctx.service.openTransport('stream-A', TABLET_A);
    await started(ctx, TABLET_A);
    await expect(ctx.req('control', { operation: 'takeover' }, TABLET_B)).rejects.toThrow(/indiquez un motif/);
    await expect(ctx.req('control', { operation: 'claim' }, TABLET_B)).rejects.toThrow(/Tablette A/);
    const taken = await ctx.req('control', { operation: 'takeover', reason: 'Tablette A hors de portée' }, TABLET_B);
    expect(taken).toMatchObject({ owner: { id: 'tablet-B' }, previous: { id: 'tablet-A' }, role: 'operator' });
    expect(ctx.state().control).toMatchObject({ owner: { id: 'tablet-B' }, lastChange: { type: 'takeover', reason: 'Tablette A hors de portée', previous: { id: 'tablet-A' } } });
    await ctx.req('pause', {}, TABLET_A);
    await expect(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, TABLET_A)).rejects.toThrow(/Tablette B/);
    // Release by the owner: free again; by someone else: refused.
    await expect(ctx.req('control', { operation: 'release' }, TABLET_A)).rejects.toThrow(/Tablette B/);
    expect(await ctx.req('control', { operation: 'release' }, TABLET_B)).toMatchObject({ owner: null });
    expect(ctx.state().control.owner).toBeNull();
    await expect(ctx.req('control', { operation: 'nonsense' }, TABLET_B)).rejects.toThrow(/inconnue/);
  });

  test('a port whose controller closes loses its lease (release by the system, no transfer)', async () => {
    const ctx = withControl();
    await started(ctx, TABLET_A);
    ctx.c.isClose = () => true;
    ctx.service.observe();
    expect(ctx.control.inspect('TEST').owner).toBeNull();
    expect(ctx.control.inspect('TEST').lastChange).toMatchObject({ type: 'release', by: { kind: 'system', id: 'port-closed' } });
  });
});

// Counter-review 2 (audit 31): observe() / tick() / reserveSystemCommand
// without a stream client, now with the stream's guarded tick and the
// probe-input sync made by observe().
const fakeTimers = () => {
  let id = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    intervals,
    timeouts,
    setInterval: (fn) => {
      intervals.set(++id, fn);
      return id;
    },
    clearInterval: (key) => intervals.delete(key),
    setTimeout: (fn) => {
      timeouts.set(++id, fn);
      return id;
    },
    clearTimeout: (key) => timeouts.delete(key),
    flush: () => {
      const tasks = Array.from(timeouts.values());
      timeouts.clear();
      tasks.forEach((fn) => fn());
    }
  };
};

const fakeResponse = () => {
  const res = new EventEmitter();
  return Object.assign(res, {
    lines: [],
    headers: {},
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    write(line) {
      this.lines.push(JSON.parse(line));
      return true;
    },
    flush() {},
    flushHeaders() {},
    end() {
      this.ended = true;
    }
  });
};

const RUNNER_EVENTS = ['status', 'startup', 'parserstate', 'raw', 'error', 'alarm'];
const listenersOf = (c) => ({
  runner: Object.fromEntries(RUNNER_EVENTS.map((e) => [e, c.runner.listenerCount(e)])),
  sender: Object.fromEntries(['load', 'unload', 'end'].map((e) => [e, c.sender.listenerCount(e)])),
  workflow: c.workflow.listenerCount('start')
});
const ONE = {
  runner: { status: 1, startup: 1, parserstate: 1, raw: 1, error: 1, alarm: 1 },
  sender: { load: 1, unload: 1, end: 1 },
  workflow: 1
};
const NONE = {
  runner: { status: 0, startup: 0, parserstate: 0, raw: 0, error: 0, alarm: 0 },
  sender: { load: 0, unload: 0, end: 0 },
  workflow: 0
};

const xvSetup = () => {
  const ctx = { now: 10000, registry: { A: fakeController('A') }, timers: fakeTimers(), gets: 0 };
  const store = {
    get: () => {
      ctx.gets += 1;
      return ctx.registry;
    }
  };
  ctx.service = createService(store, { get: () => [] }, () => ctx.now);
  services.push(ctx.service);
  ctx.stream = createStream(ctx.service, { clock: () => ctx.now, timers: ctx.timers });
  [ctx.tick] = ctx.timers.intervals.values();
  ctx.connect = () => {
    const req = new EventEmitter();
    const res = fakeResponse();
    expect(ctx.stream.open(req, res)).toBe(true);
    return { req, res };
  };
  ctx.reserve = (title = 'Redémarrer') => ctx.service.reserveSystemCommand({ id: 'c1', title, commands: 'sudo reboot' });
  return ctx;
};

describe('observe cross-check: cost and idempotence of the heartbeat without a client', () => {
  test('100 ticks: one listener per event, one store.get per tick, the same generation', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    expect(listenersOf(c)).toEqual(NONE);
    ctx.tick();
    expect(listenersOf(c)).toEqual(ONE);
    const before = ctx.gets;
    for (let i = 0; i < 100; i++) {
      ctx.now += 1000;
      ctx.tick();
    }
    expect(listenersOf(c)).toEqual(ONE);
    // observe() reads the registry once, probeInput.sync() once more; publish() leaves at once without a client.
    expect(ctx.gets - before).toBe(200);
    c.runner.emit('status');
    const [first] = ctx.service.list();
    expect(ctx.service.list()[0].generation).toBe(first.generation);
    // A listing adds the probe-input and motion-preflight status listeners (3 in all), once.
    expect(c.runner.listenerCount('status')).toBe(3);
    const perTick = [];
    for (let i = 0; i < 100; i++) {
      const start = ctx.gets;
      ctx.now += 1000;
      ctx.tick();
      perTick.push(ctx.gets - start);
    }
    expect(c.runner.listenerCount('status')).toBe(3);
    expect(new Set(perTick).size).toBe(1);
    expect(ctx.service.list()[0].generation).toBe(first.generation);
    ctx.stream.dispose();
    expect(listenersOf(c)).toEqual(NONE);
  });

  test('with a client, the cost per tick is constant (no growth over 50 ticks) and reports still coalesce', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    const { res } = ctx.connect();
    c.runner.emit('status');
    ctx.timers.flush();
    const perTick = [];
    for (let i = 0; i < 50; i++) {
      const start = ctx.gets;
      ctx.now += 1000;
      ctx.tick();
      perTick.push(ctx.gets - start);
    }
    // The cost depends on the content (a stale report short-circuits some checks), never grows.
    expect(perTick.slice(1).every((v) => v <= perTick[1])).toBe(true);
    expect(new Set(perTick).size).toBeLessThanOrEqual(2);
    expect(c.runner.listenerCount('status')).toBe(3);
    expect(res.lines.length).toBeGreaterThanOrEqual(50);
    ctx.stream.dispose();
  });

  test('observe() after dispose: [] and no listener; a tick after the stream is disposed is harmless', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    ctx.tick();
    expect(listenersOf(c)).toEqual(ONE);
    ctx.service.dispose();
    expect(listenersOf(c)).toEqual(NONE);
    expect(ctx.service.observe()).toEqual([]);
    expect(listenersOf(c)).toEqual(NONE);
    expect(() => ctx.service.list()).toThrow(/indisponible/);
    expect(() => ctx.tick()).not.toThrow();
    ctx.registry.B = fakeController('B');
    expect(() => ctx.tick()).not.toThrow();
    expect(listenersOf(ctx.registry.B)).toEqual(NONE);
    ctx.stream.dispose();
    expect(() => ctx.tick()).not.toThrow();
  });
});

describe('observe cross-check: controllers replaced, closed or destroyed between two ticks', () => {
  test('closed then reopened (new object, same port): the old one is forgotten, the new one listened to', () => {
    const ctx = xvSetup();
    const old = ctx.registry.A;
    ctx.tick();
    old.runner.emit('status');
    old.isClose = () => true;
    const fresh = fakeController('A');
    ctx.registry.A = fresh;
    ctx.tick();
    expect(listenersOf(old)).toEqual(NONE);
    // observe() calls motion.inspect(port) while forgetting the old one: the
    // preflight then watches the replacement too (status: job-service + preflight).
    expect(listenersOf(fresh)).toEqual({ ...ONE, runner: { ...ONE.runner, status: 2 } });
    old.runner = null;
    old.sender = null;
    old.workflow = null;
    expect(() => ctx.tick()).not.toThrow();
    expect(listenersOf(fresh)).toEqual({ ...ONE, runner: { ...ONE.runner, status: 2 } });
    expect(() => ctx.reserve()).toThrow(/trop ancien/);
    fresh.runner.emit('status');
    expect(() => ctx.reserve().release()).not.toThrow();
    ctx.stream.dispose();
  });

  test('replaced by a new object while the old one still says open: forgotten anyway (registry identity)', () => {
    const ctx = xvSetup();
    const old = ctx.registry.A;
    ctx.tick();
    const fresh = fakeController('A');
    ctx.registry.A = fresh;
    ctx.tick();
    expect(listenersOf(old)).toEqual(NONE);
    expect(listenersOf(fresh)).toEqual({ ...ONE, runner: { ...ONE.runner, status: 2 } });
    for (let i = 0; i < 10; i++) {
      ctx.tick();
    }
    expect(listenersOf(fresh)).toEqual({ ...ONE, runner: { ...ONE.runner, status: 2 } });
    ctx.stream.dispose();
  });

  test('destroyed as CNCjs does it (closed, runner/sender/workflow null) before any tick: skipped, no throw', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    c.isClose = () => true;
    c.runner = null;
    c.sender = null;
    c.workflow = null;
    expect(() => ctx.tick()).not.toThrow();
    expect(ctx.service.observe()).toEqual([]);
    delete ctx.registry.A;
    expect(() => ctx.tick()).not.toThrow();
    ctx.stream.dispose();
  });

  test('a controller open but without runner: observe() throws, the heartbeat tick does not (guarded)', () => {
    const ctx = xvSetup();
    ctx.registry.A.runner = null;
    expect(() => ctx.service.observe()).toThrow(TypeError);
    expect(() => ctx.tick()).not.toThrow();
    ctx.registry.A = fakeController('A');
    expect(() => ctx.tick()).not.toThrow();
    expect(listenersOf(ctx.registry.A)).toEqual(ONE);
    ctx.stream.dispose();
  });

  test('probeInput.sync() runs with observe(): after a client listed, a replaced controller loses its probe-input listeners at the next tick', () => {
    const ctx = xvSetup();
    const old = ctx.registry.A;
    const { res } = ctx.connect();
    old.runner.emit('status');
    ctx.timers.flush();
    expect(old.runner.listenerCount('status')).toBe(3);
    res.emit('close');
    old.isClose = () => true;
    ctx.registry.A = fakeController('A');
    ctx.tick();
    expect(old.runner.listenerCount('status')).toBe(0);
    expect(old.runner.listenerCount('startup')).toBe(0);
    ctx.stream.dispose();
  });
});

describe('observe cross-check: host command reservation without a client', () => {
  test('controller opened after the last tick: a report nobody heard, 409 then OK; after a tick: OK at once', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    c.runner.emit('status');
    expect(() => ctx.reserve()).toThrow(/trop ancien.*réessayer/);
    expect(listenersOf(c)).toEqual(ONE);
    c.runner.emit('status');
    const r = ctx.reserve();
    expect(ctx.service.systemCommand()).toMatchObject({ title: 'Redémarrer' });
    r.release();
    ctx.registry.B = fakeController('B');
    ctx.tick();
    ctx.registry.B.runner.emit('status');
    expect(() => ctx.reserve().release()).not.toThrow();
    ctx.now += 2501;
    c.runner.emit('status');
    expect(() => ctx.reserve()).toThrow(/trop ancien sur B/);
    ctx.registry.B.runner.emit('status');
    expect(() => ctx.reserve().release()).not.toThrow();
    ctx.stream.dispose();
  });

  test('the record made by the reservation is the one the heartbeat and list() reuse (no second listener)', () => {
    const ctx = xvSetup();
    const c = ctx.registry.A;
    expect(() => ctx.reserve()).toThrow(/réessayer/);
    expect(listenersOf(c)).toEqual(ONE);
    ctx.tick();
    ctx.tick();
    expect(listenersOf(c)).toEqual(ONE);
    c.runner.emit('status');
    expect(ctx.service.list()).toHaveLength(1);
    expect(c.runner.listenerCount('status')).toBe(3);
    expect(() => ctx.reserve().release()).not.toThrow();
    expect(c.runner.listenerCount('status')).toBe(3);
    ctx.stream.dispose();
  });

  test('reservation versus list()/tick: a closed controller is skipped, a tick that forgets a controller keeps the reservation, a new controller is listed as held', () => {
    const ctx = xvSetup();
    const a = ctx.registry.A;
    ctx.tick();
    a.runner.emit('status');
    const closed = Object.assign(fakeController('C'), { isClose: () => true, workflow: Object.assign(new EventEmitter(), { state: 'running' }) });
    ctx.registry.C = closed;
    const r = ctx.reserve();
    expect(listenersOf(closed)).toEqual(NONE);
    expect(ctx.service.list().map((s) => s.port)).toEqual(['A']);
    a.isClose = () => true;
    ctx.tick();
    // probe-input's pair goes with the tick too now (sync in observe()).
    expect(listenersOf(a)).toEqual(NONE);
    expect(ctx.service.systemCommand()).toMatchObject({ title: 'Redémarrer' });
    ctx.registry.A = fakeController('A');
    ctx.tick();
    ctx.registry.A.runner.emit('status');
    const [s] = ctx.service.list();
    expect(s.canLoad).toBe(false);
    expect(s.loadReason).toMatch(/Commande système/);
    expect(() => ctx.reserve('Éteindre')).toThrow(/déjà en cours \(Redémarrer\)/);
    r.release();
    expect(ctx.service.list()[0].canLoad).toBe(true);
    ctx.stream.dispose();
  });
});
