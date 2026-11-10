/* eslint-env jest */
// Rehearsal before the CNC trial (2026-11): findings of the rehearsal and the
// fault hunt (E9, N1, E6 / N10, SRV-2), against the real touch job service with
// the fake controller of job-service.test.js. Each non-witness test fails
// without its fix; a test named "witness" shows what already held.
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createService } from '../job-service';
import { createControl } from '../control';
import { buildResume } from '../resume';

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
      c.sender.state = { name: args[0], context: args[2], total: 3, gcode: args[1] };
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
    if (name === 'gcode:stop' || name === 'reset') {
      const was = c.workflow.state;
      c.workflow.state = 'idle';
      if (was !== 'idle') {
        c.workflow.emit('stop');
      }
    }
  };
  return c;
};

// The trial file of the commissioning wizard (commissioning.js:93-95), CNC.
const TRIAL = ['(CNCjs Touch - essai en l air : carre de 40 mm a Z0, SANS fraise)', '(Origine X0 Y0 au centre, Z0 au moins 30 mm au-dessus de tout)',
  'G21 G90 G17 G94', 'G0 Z5', 'G0 X-20 Y-20', 'M3 S250', 'G4 P3', 'G1 Z0 F300', 'G1 X20 Y-20 F1000', 'G1 X20 Y20', 'G1 X-20 Y20', 'G1 X-20 Y-20',
  'G0 Z5', 'M5', 'G0 X0 Y0', 'M2', ''].join('\n');

let root;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-triage-'));
  await fs.writeFile(path.join(root, 'test.nc'), 'G21 G90\nG1 X1 F100\nM2');
  await fs.writeFile(path.join(root, 'resume.nc'), ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F200',
    'G1 X10 F800', 'G1 Y10', 'G1 X0', 'G0 Z5', 'M5', 'M30'].join('\n'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
});

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Poste B' };

const setup = () => {
  const ctx = { now: 10000, c: fakeController(), logged: [] };
  ctx.controllers = { TEST: ctx.c };
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ watchDirectory: root, macros: [], events: [] }[key]) },
    () => ctx.now,
    { history: { record: (e) => ctx.logged.push(e) }, control: createControl({ clock: () => ctx.now }) }
  );
  services.push(ctx.service);
  ctx.generation = ctx.service.list()[0].generation;
  ctx.transportId = 'tA';
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.req = (action, extra = {}, actor = A, transportId = 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  ctx.report = () => ctx.c.runner.emit('status');
  ctx.state = () => ctx.service.list()[0];
  ctx.started = async (file = 'test.nc') => {
    ctx.report();
    await ctx.req('load', { file });
    const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
    await ctx.req('start', { nonce: ticket.nonce });
    ctx.c.state.status.activeState = 'Run';
    ctx.c.sender.state = { ...ctx.c.sender.state, sent: 3, received: 2 };
    ctx.report();
  };
  return ctx;
};

describe('E9: "Charger la reprise" is not bound to the plan the operator verified', () => {
  test('a file changed on disk between "Vérifier" and "Charger la reprise" must be refused', async () => {
    const ctx = setup();
    ctx.report();
    const plan = await ctx.req('resumePlan', { file: 'resume.nc', line: 7 });
    expect(plan.preamble.join(' ')).toMatch(/G0 X10 Y0/);
    // Same name, another program (what the fault hunt did by hand: X10 -> X12).
    const original = await fs.readFile(path.join(root, 'resume.nc'), 'utf8');
    await fs.writeFile(path.join(root, 'resume.nc'), original.replace('G1 X10 F800', 'G1 X12 F800'));
    try {
      await expect(ctx.req('load', { file: 'resume.nc', fromLine: 7 })).rejects.toThrow('Fichier modifié depuis « Vérifier » : vérifiez à nouveau la reprise.');
      expect(ctx.c.commands.map((x) => x[0])).not.toContain('gcode:load');
      // Checked again: the plan shown is the program loaded.
      const again = await ctx.req('resumePlan', { file: 'resume.nc', line: 7 });
      expect(again.preamble.join(' ')).toMatch(/G0 X12 Y0/);
      await expect(ctx.req('load', { file: 'resume.nc', fromLine: 7 })).resolves.toMatchObject({ message: expect.stringMatching(/Reprise à la ligne 7/) });
    } finally {
      await fs.writeFile(path.join(root, 'resume.nc'), original);
    }
  });
});

describe('E9 (phase 7): the verified plan belongs to the screen that verified it', () => {
  test('another screen’s "Vérifier" after the file changed does not clear the refusal', async () => {
    const ctx = setup();
    ctx.report();
    await ctx.req('resumePlan', { file: 'resume.nc', line: 7 });
    const original = await fs.readFile(path.join(root, 'resume.nc'), 'utf8');
    await fs.writeFile(path.join(root, 'resume.nc'), original.replace('G1 X10 F800', 'G1 X12 F800'));
    try {
      // Screen B (observer) checks another line of the changed file.
      await ctx.req('resumePlan', { file: 'resume.nc', line: 8 }, B, 'tB');
      await expect(ctx.req('load', { file: 'resume.nc', fromLine: 7 })).rejects.toThrow('Fichier modifié depuis « Vérifier » : vérifiez à nouveau la reprise.');
      expect(ctx.c.commands.map((x) => x[0])).not.toContain('gcode:load');
    } finally {
      await fs.writeFile(path.join(root, 'resume.nc'), original);
    }
  });
});

describe('N1: feed hold sent from the PC (`!` only), the tablet pilots', () => {
  test('witness: the server offers a way out without stopping (Pause, then Reprendre)', async () => {
    const ctx = setup();
    await ctx.started();
    // CNCjs's `feedhold` writes `!` and leaves the workflow running.
    ctx.c.state.status.activeState = 'Hold';
    ctx.report();
    let s = ctx.state();
    expect(s.workflow).toBe('running');
    expect(s.canResume).toBe(false);
    expect(s.canResume).toBe(false);
    expect(s.canPause).toBe(true);
    await ctx.req('pause');
    ctx.report();
    s = ctx.state();
    expect(s.canResume).toBe(true);
    const ticket = await ctx.req('prepare', { operation: 'resume', revision: s.revision });
    await ctx.req('resume', { nonce: ticket.nonce });
    expect(ctx.c.commands.at(-1)[0]).toBe('gcode:resume');
  });

  test('N1: the reason shown to the pilot must say what to do (touch Pause first)', async () => {
    const ctx = setup();
    await ctx.started();
    ctx.c.state.status.activeState = 'Hold';
    ctx.report();
    expect(ctx.state().resumeReason).toBe('Pause donnée hors de cet écran : touchez Pause, puis Reprendre.');
  });
});

describe('Hold:1 / Hold:0 (phase 7): the tablet must know whether the axes are still decelerating', () => {
  test('the snapshot carries the Grbl hold sub-state', async () => {
    const ctx = setup();
    await ctx.started();
    await ctx.req('pause');
    ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Hold', subState: 1 };
    ctx.report();
    expect(ctx.state().subState).toBe(1);
    ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Hold', subState: 0 };
    ctx.report();
    expect(ctx.state().subState).toBe(0);
    ctx.c.state.status = { ...ctx.c.state.status, activeState: 'Run', subState: 0 };
    ctx.report();
    expect(ctx.state().subState).toBe(null);
  });
});

describe('N2 (Pause greyed for an observer when the report is stale): false positive', () => {
  test('witness: canPause does not depend on the report age or on who pilots', async () => {
    const ctx = setup();
    await ctx.started();
    ctx.now += 4000; // report 4 s old
    const s = ctx.state();
    expect(s.fresh).toBe(false);
    expect(s.control.owner.id).toBe('tablet-A');
    expect(s.canPause).toBe(true);
    expect(s.canStop).toBe(true);
    await expect(ctx.req('pause', {}, B, 'tB')).resolves.toMatchObject({ message: expect.stringMatching(/Pause demandée/) });
  });
});

describe('E6 / N10: a stop or a reset made from the PC during a job of the tablet', () => {
  test('the job must be marked stopped, with its line and a "stop" entry in the history', async () => {
    const ctx = setup();
    await ctx.started();
    // CNCjs classic: `gcode:stop {force:true}` or `reset` (GrblController.js:1424, 1508).
    ctx.c.command('gcode:stop', { force: true });
    ctx.c.state.status.activeState = 'Alarm';
    ctx.c.runner.emit('alarm', { message: '3', raw: 'ALARM:3' });
    ctx.report();
    const s = ctx.state();
    expect(ctx.logged.map((e) => e.event)).toContain('stop');
    expect(s.jobStopped).toBe(true);
    expect(s.stoppedAtLine).toBe(2);
  });
});

describe('E3: spindle left on at rest (board finished its buffer after a link or CNCjs loss)', () => {
  test('witness: the server refuses Stop (nothing to stop) but accepts M5 from anyone', async () => {
    const ctx = setup();
    ctx.c.state.status = { activeState: 'Idle', spindle: 6000 };
    ctx.report();
    const s = ctx.state();
    expect(s.spindleSpeed).toBe(6000);
    expect(s.canStop).toBe(false);
    expect(s.canSpindleStop).toBe(true);
    await expect(ctx.req('stop')).rejects.toThrow('Aucun travail à arrêter.');
    await expect(ctx.req('spindleStop', {}, B, 'tB')).resolves.toMatchObject({ message: 'Arrêt broche (M5) envoyé.' });
    expect(ctx.c.commands.at(-1)).toEqual(['gcode', 'M5']);
  });
});

describe('E1: critical alarm (ALARM:1, "Reset to continue") during a job, the board silent', () => {
  test('witness: Stop ends the job with a feed hold only; then nothing on the tablet can reset or unlock', async () => {
    jest.useFakeTimers();
    try {
      const ctx = setup();
      await ctx.started();
      ctx.c.state.status.activeState = 'Alarm';
      ctx.c.runner.emit('alarm', { message: '1', raw: 'ALARM:1' });
      ctx.report();
      ctx.now += 5000; // the board no longer reports
      await ctx.req('stop');
      ctx.now += 6000;
      jest.advanceTimersByTime(6000);
      expect(ctx.c.commands.map((x) => x[0])).toEqual(['gcode:load', 'gcode:start', 'gcode:stop', 'feedhold']);
      const s = ctx.state();
      expect(s.canStop).toBe(false);
      expect(s.canUnlock).toBe(false);
      expect(s.unlockReason).toBe('État machine trop ancien : attendre un rapport récent.');
      await expect(ctx.req('stop')).rejects.toThrow('Aucun travail à arrêter.');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('SRV-3 / N9: alarms in the server journal', () => {
  test('witness: an alarm during a started job is recorded', async () => {
    const ctx = setup();
    await ctx.started();
    ctx.c.runner.emit('alarm', { message: '1', raw: 'ALARM:1' });
    expect(ctx.logged.map((e) => e.event)).toEqual(['load', 'start', 'alarm']);
  });
});

describe('SRV-2: resume from a line on the 16-line trial file', () => {
  test('the line the tablet proposes (2) is refused with its own code, lines 9 to 13 are accepted', () => {
    expect(() => buildResume(TRIAL, 2)).toThrow(expect.objectContaining({ code: 'ETOUCH_RESUME_DISTANCE_BEFORE' }));
    [3, 4, 5, 6, 7, 8].forEach((n) => expect(() => buildResume(TRIAL, n)).toThrow());
    [9, 10, 11, 12, 13].forEach((n) => expect(buildResume(TRIAL, n).from).toBe(n));
  });

  test('SRV-2: the refusal must not call a comment line "the first move of the program"', () => {
    let message = '';
    try {
      buildResume(TRIAL, 2);
    } catch (err) {
      message = err.message;
    }
    // Line 2 is a comment; the first move is line 4.
    expect(message).toBe('Mode de distance (G90/G91) non fixé avant la ligne 2 : le mode de la carte est inconnu, reprise impossible.');
  });
});
