/* eslint-env jest */
// « Pause et dégager » (F2, pause-retract.js, design examples/cncjs-touch/design/fonctions/F2-CONCEPTION.md § 12.1).
// Real GrblController (CNCjs's own sender, workflow, feeder and `ok` handling) with a recorded
// serial line, and the real touch job service on top of it, on the LUNYEE settings. The board is
// played by the test, one line at a time: its reports, its `ok`, its [GC:] replies. Time is fake.
import fs from 'fs';
import os from 'os';
import path from 'path';
import GrblController from '../../../controllers/Grbl/GrblController';
import config from '../../configstore';
import { createController } from '../../../controllers/__tests__/helpers/createController';
import { createService } from '../job-service';
import { createControl } from '../control';
import { RETRACT_MESSAGES, failureOf } from '../pause-retract';
import { provenOffset } from './support/proven-offset';
import { expectCatalogMatch } from './touch-codes-catalog';

jest.mock('../../../lib/logger', () => {
  const l = () => ({ error: () => {}, warn: () => {}, info: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} });
  return { __esModule: true, default: l, getLevel: () => 'info', setLevel: () => {} };
});

const BANNER = 'Grbl 1.1f [\'$\' for help]';
const LUNYEE = ['$10=1', '$13=0', '$20=1', '$21=1', '$22=1', '$23=3', '$30=1000', '$31=0', '$32=0', '$100=800', '$101=800', '$102=800',
  '$110=4000', '$111=4000', '$112=800', '$120=200', '$121=200', '$122=100', '$130=408', '$131=396', '$132=130'];
const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B' };
const WCO = { x: -300, y: -250, z: -115 };
const f3 = (n) => n.toFixed(3);
const GC = { motion: 'G1', wcs: 'G54', plane: 'G17', units: 'G21', distance: 'G90', feed: 'G94', spindle: 'M3', coolant: 'M9', T: '0', F: '600', S: '1000' };

let root;
const ctxs = [];

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'retract-'));
  const lines = ['G21 G90 G17 G94', 'M3 S1000', 'G4 P1', 'G1 Z-3.4 F300'];
  for (let i = 1; i <= 80; i++) {
    lines.push('G1 X' + (i % 2 ? 10 : 0) + ' Y' + (i * 0.2).toFixed(1) + ' F600');
  }
  lines.push('G0 Z5', 'M5', 'M2');
  fs.writeFileSync(path.join(root, 'long.nc'), lines.join('\n'));
  fs.writeFileSync(path.join(root, 'short.nc'), ['G21 G90 G94', 'M3 S1000', 'G1 X1 F600', 'G1 X2', 'M5', 'M2'].join('\n'));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  ctxs.splice(0).forEach((ctx) => {
    ctx.service.dispose();
    ctx.controller.destroy();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// A machine homed, G54 known, a job of `file` started from tablet A and cutting at machine Z `z`.
const setup = async ({ file = 'long.nc', z = -118.4, motion = true, kind = 'cnc', acks = 12 } = {}) => {
  jest.spyOn(config, 'get').mockImplementation((key, def) => def);
  const made = createController(GrblController);
  const controller = made.controller;
  clearInterval(controller.queryTimer);
  jest.useFakeTimers();
  const ctx = { controller, writes: made.writes, now: 100000, m: { x: -290, y: -240, z }, wco: { ...WCO }, gc: { ...GC }, machines: [], log: [] };
  ctxs.push(ctx);
  const registry = { '/dev/null': controller };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => registry },
    { get: (key, def) => (key === 'touch.machines' ? ctx.machines : { watchDirectory: root, events: [], macros: [], 'touch.motion.enabled': motion }[key] ?? def) },
    () => ctx.now,
    { workOffset: provenOffset, control: ctx.control, history: { record: (e) => ctx.log.push(e) } }
  );
  ctx.parse = (line) => controller.runner.parse(line);
  // One status report of the board; `wco` adds the offset (one report in ten on a real board).
  ctx.report = (state = 'Idle', { speed = null, wco = false, feed = 0, at = ctx.m } = {}) => {
    const turning = ctx.gc.spindle === 'M5' ? 0 : Number(ctx.gc.S);
    const s = speed === null ? turning : speed;
    ctx.parse('<' + state + '|MPos:' + f3(at.x) + ',' + f3(at.y) + ',' + f3(at.z) + '|FS:' + feed + ',' + s + (wco ? '|WCO:' + f3(ctx.wco.x) + ',' + f3(ctx.wco.y) + ',' + f3(ctx.wco.z) : '') + '>');
  };
  // A $G reply, with its `ok` (CNCjs takes the next `ok` for it).
  ctx.modal = () => {
    const g = ctx.gc;
    ctx.parse('[GC:' + [g.motion, g.wcs, g.plane, g.units, g.distance, g.feed, 'M0', g.spindle, g.coolant, 'T' + g.T, 'F' + g.F, 'S' + g.S].join(' ') + ']');
    ctx.parse('ok');
  };
  // Time goes by in steps of 50 ms (the service's own timers run).
  ctx.wait = async (ms = 0) => {
    if (!ms) {
      await jest.advanceTimersByTimeAsync(0);
      return;
    }
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  // Reports every 250 ms for `ms`, like CNCjs's poll.
  ctx.idle = async (n = 2, opts = {}) => {
    for (let i = 0; i < n; i++) {
      ctx.now += 250;
      ctx.report('Idle', opts);
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
  };
  ctx.state = () => ctx.service.list()[0];
  ctx.mark = () => ctx.writes.length;
  ctx.since = (mark) => ctx.writes.slice(mark).map((w) => w.data);
  ctx.lines = (mark) => ctx.since(mark).filter((d) => d !== '?' && d !== '$G\n');

  ctx.parse(BANNER);
  LUNYEE.forEach(ctx.parse);
  controller.settings = controller.runner.settings;
  ctx.service.list();
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  // Homing seen (Home then Idle), then the offset and the modal state.
  ctx.report('Home', { at: { x: -1, y: -1, z: -1 } });
  ctx.now += 1000;
  ctx.report('Idle', { wco: true });
  ctx.gc.spindle = 'M5';
  ctx.modal();
  const signature = ctx.state().machineProfile.signature;
  ctx.machines.push({ id: 'm-0123456789ab', label: 'CNC', kind, signature, createdAt: 'x', updatedAt: 'x' });
  ctx.generation = ctx.state().generation;
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: '/dev/null', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  await ctx.req('load', { file });
  ctx.report('Idle', { wco: true });
  const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
  await ctx.req('start', { nonce: ticket.nonce });
  for (let i = 0; i < acks; i++) {
    ctx.parse('ok');
  }
  ctx.gc.spindle = 'M3';
  ctx.report('Run', { feed: 600 });
  expect(controller.workflow.state).toBe('running');
  // « Pause et dégager… » with its two steps.
  ctx.retract = async (actor = A) => {
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision }, actor);
    return ctx.req('retract', { nonce: t.nonce }, actor);
  };
  // CNCjs's own poll before the resume: a report with the offset, a $G reply.
  ctx.resume = async (actor = A) => {
    ctx.report('Idle', { wco: true });
    ctx.modal();
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, actor);
    return ctx.req('resume', { nonce: t.nonce }, actor);
  };
  // The board finishes its lines: an `ok` for each one CNCjs sent and not answered yet.
  ctx.finish = () => {
    const s = controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      ctx.parse('ok');
    }
  };
  // Draining to rest: lines finished, two Idle reports, then the $G reply.
  ctx.rest = async () => {
    ctx.finish();
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
  };
  // The board runs the line just written: `ok`, `Jog` then Idle at `z`.
  ctx.jog = async (z) => {
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    ctx.m.z = z;
    await ctx.idle(2);
    await ctx.wait(100);
  };
  ctx.okIdle = async (n = 2, opts) => {
    ctx.parse('ok');
    await ctx.idle(n, opts);
    await ctx.wait(100);
  };
  // To parked: rest, the lift to Z -5, M5 with FS:0.
  ctx.park = async () => {
    await ctx.retract();
    await ctx.rest();
    ctx.lifted = ctx.mark();
    await ctx.jog(-5);
    ctx.gc.spindle = 'M5';
    await ctx.okIdle(2, { wco: true });
    ctx.modal();
    expect(ctx.state().pauseRetract.phase).toBe('parked');
  };
  return ctx;
};

const phase = (ctx) => (ctx.state().pauseRetract || {}).phase;

describe('Pause et dégager: what is written to the board', () => {
  test('1. no feed hold, no reset: CNCjs holds its sender and no line of the file leaves while `ok` come', async () => {
    const ctx = await setup();
    const mark = ctx.mark();
    const out = await ctx.retract();
    expect(out.message).toBe('Dégagement demandé.');
    expect(ctx.controller.workflow.state).toBe('paused');
    ctx.finish();
    for (let i = 0; i < 5; i++) {
      ctx.parse('ok');
    }
    await ctx.wait(200);
    expect(ctx.since(mark).some((d) => d.includes('!') || d.includes('\x18'))).toBe(false);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'draining', step: 'drain', owner: { kind: 'touch', id: 'tablet-A' } });
    expect(ctx.state().canPause).toBe(true);
  });

  test('2. nothing before rest is proven: lines unanswered, one Idle, two Idle at different places, a dwell', async () => {
    const ctx = await setup();
    await ctx.retract();
    const mark = ctx.mark();
    // Lines still unanswered: Idle reports prove nothing (a G4 of the file answers at its end).
    await ctx.idle(4);
    ctx.modal();
    await ctx.wait(300);
    expect(ctx.lines(mark)).toEqual([]);
    ctx.finish();
    // One Idle report only.
    ctx.now += 250;
    ctx.report('Idle');
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual([]);
    // Two Idle reports at different places.
    ctx.m.x += 0.5;
    ctx.now += 250;
    ctx.report('Idle');
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual([]);
    expect(phase(ctx)).toBe('draining');
    // Then at rest: the lift leaves, once a $G reply came after the rest.
    await ctx.idle(1);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual([]);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['$J=G91 G21 Z113.4 F600\n']);
  });

  test('3-4. exact lift: the relative jog to 5 mm under the top, then M5; parked only once FS says 0; the sender count untouched', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    const s0 = { ...ctx.controller.sender.state };
    const mark = ctx.mark();
    expect(ctx.lines(mark)).toEqual([]);
    expect(phase(ctx)).toBe('lifting');
    await ctx.wait(0);
    expect(ctx.writes.slice(mark - 1).map((w) => w.data).pop()).toBe('$J=G91 G21 Z113.4 F600\n');
    // The jog answered but the reports still at the old height: no M5 yet, and an error of position.
    const m2 = ctx.mark();
    await ctx.jog(-5);
    expect(ctx.lines(m2)).toEqual(['M5\n']);
    // FS still turning: not parked.
    ctx.parse('ok');
    await ctx.idle(2, { speed: 1000 });
    await ctx.wait(100);
    expect(phase(ctx)).toBe('lifting');
    ctx.gc.spindle = 'M5';
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'parked', lift: { from: '-118.400', to: '-5.000', distance: '113.400' }, spindle: { mode: 'M3', speed: 1000 } });
    const s1 = ctx.controller.sender.state;
    expect([s1.sent, s1.received]).toEqual([s0.sent, s0.received]);
    expect(ctx.log.filter((e) => e.event === 'retract').map((e) => e.stage)).toEqual(['requested', 'lifting', 'parked']);
  });

  test('5. exact resume: M3 S, G4 P3, the fast then the slow descent, then `~` and the next line of the file', async () => {
    const ctx = await setup();
    await ctx.park();
    const sent = ctx.controller.sender.state.sent;
    const mark = ctx.mark();
    const out = await ctx.resume();
    expect(out.message).toMatch(/Reprise demandée/);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n']);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n', 'G4 P3\n']);
    await ctx.okIdle(2, { speed: 1000 });
    expect(ctx.lines(mark).pop()).toBe('$J=G91 G21 Z-108.4 F600\n');
    await ctx.jog(-113.4);
    expect(ctx.lines(mark).pop()).toBe('$J=G91 G21 Z-5 F100\n');
    await ctx.jog(-118.4);
    // R5: a $G after the last `ok`, equal to the state at rest.
    expect(ctx.lines(mark).some((d) => d === '~')).toBe(false);
    ctx.modal();
    await ctx.wait(200);
    const after = ctx.lines(mark);
    expect(after.slice(0, 5)).toEqual(['M3 S1000\n', 'G4 P3\n', '$J=G91 G21 Z-108.4 F600\n', '$J=G91 G21 Z-5 F100\n', '~']);
    // The file's line of index `sent` (four lines before the first G1 X… Y…).
    expect(after[5]).toBe('G1 X' + (((sent - 3) % 2) ? 10 : 0) + ' Y' + ((sent - 3) * 0.2).toFixed(1) + ' F600\n');
    expect(ctx.controller.workflow.state).toBe('running');
    expect(ctx.state().pauseRetract).toBe(null);
    expect(ctx.log.filter((e) => e.event === 'retract').map((e) => e.stage)).toEqual(['requested', 'lifting', 'parked', 'resume', 'resumed']);
    expect(ctx.log.filter((e) => e.event === 'resume')).toHaveLength(1);
  });

  test('5b. a lift of 5 mm or less goes back down in one slow jog; a spindle off before the pause is not restarted', async () => {
    const ctx = await setup({ z: -8 });
    ctx.gc.spindle = 'M5';
    ctx.report('Run', { feed: 600 });
    await ctx.retract();
    await ctx.rest();
    const mark = ctx.mark();
    await ctx.wait(0);
    await ctx.jog(-5);
    // M5 before the pause: no M5 written.
    expect(phase(ctx)).toBe('parked');
    expect(ctx.lines(mark - 1)).toEqual(['$J=G91 G21 Z3 F600\n']);
    const m2 = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    expect(ctx.lines(m2)).toEqual(['$J=G91 G21 Z-3 F100\n']);
    await ctx.jog(-8);
    ctx.modal();
    await ctx.wait(200);
    expect(ctx.lines(m2).slice(0, 2)).toEqual(['$J=G91 G21 Z-3 F100\n', '~']);
  });

  test('6. no descent without the spindle: FS:0 after the dwell stops the resume', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    await ctx.okIdle(2, { speed: 0 });
    await ctx.okIdle(2, { speed: 0 });
    expect(ctx.lines(mark).filter((d) => /^\$J/.test(d))).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_SPINDLE' } });
    expect(ctx.lines(mark).includes('~')).toBe(false);
    expect(ctx.state().canResume).toBe(false);
  });

  test.each([
    ['distance', 'G91'], ['units', 'G20'], ['wcs', 'G55'], ['motion', 'G0'], ['F', '900'], ['feed', 'G93'], ['coolant', 'M8']
  ])('7. a modal state changed during the pause (%s → %s): no `~`, the in-place resume ends', async (key, value) => {
    const ctx = await setup();
    await ctx.park();
    ctx.gc[key] = value;
    ctx.modal();
    const mark = ctx.mark();
    await expect(ctx.resume()).rejects.toMatchObject({ code: 'ETOUCH_RETRACT_STATE_CHANGED' });
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual([]);
    expect(phase(ctx)).toBe('failed');
  });

  test('7b. a modal state changed after the descent (R5): no `~`, the spindle is stopped', async () => {
    const ctx = await setup({ z: -8 });
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    await ctx.jog(-5);
    ctx.gc.spindle = 'M5';
    await ctx.okIdle(2, { wco: true });
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2);
    ctx.modal();
    await ctx.okIdle(2);
    await ctx.jog(-8);
    ctx.gc.distance = 'G91';
    ctx.modal();
    await ctx.wait(200);
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(mark).includes('~')).toBe(false);
    expect(ctx.lines(mark).pop()).toBe('M5\n');
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_STATE_CHANGED');
  });

  test('8. the work offset changed, or no WCO after the rest within 5 s: nothing written', async () => {
    const ctx = await setup();
    await ctx.park();
    ctx.wco.z = -114;
    ctx.report('Idle', { wco: true });
    const mark = ctx.mark();
    await expect(ctx.resume()).rejects.toMatchObject({ code: 'ETOUCH_RETRACT_ZERO_CHANGED' });
    expect(ctx.lines(mark)).toEqual([]);

    const other = await setup();
    await other.retract();
    await other.rest();
    await other.wait(0);
    await other.jog(-5);
    other.gc.spindle = 'M5';
    await other.okIdle(2);
    expect(phase(other)).toBe('parked');
    const m2 = other.mark();
    // No report with the offset after the rest: the sequence waits for one 5 s, then gives up.
    other.modal();
    const t = await other.req('prepare', { operation: 'resume', revision: other.state().revision });
    await other.req('resume', { nonce: t.nonce });
    await other.idle(24);
    expect(other.lines(m2)).toEqual([]);
    expect(other.state().pauseRetract.failure).toMatchObject({ code: 'ETOUCH_RETRACT_ZERO_CHANGED', params: { axis: 'WCO' } });
  });

  test.each(['x', 'y', 'z'])('9. the machine moved in %s while parked: the in-place resume ends, nothing written', async (axis) => {
    const ctx = await setup();
    await ctx.park();
    ctx.m[axis] -= 0.05;
    await ctx.idle(1);
    const mark = ctx.mark();
    await expect(ctx.resume()).rejects.toMatchObject({ code: 'ETOUCH_RETRACT_MOVED', params: { axis: axis.toUpperCase() } });
    expect(ctx.lines(mark)).toEqual([]);
    expect(phase(ctx)).toBe('failed');
  });
});

describe('Pause et dégager: Arrêter, Pause and the other stops', () => {
  test('10a. Arrêter while draining: the current stop (feed hold, then a reset at rest)', async () => {
    const ctx = await setup();
    await ctx.retract();
    const mark = ctx.mark();
    await ctx.req('stop');
    expect(ctx.since(mark)[0]).toBe('!');
    expect(ctx.state().pauseRetract).toBe(null);
  });

  test('10b. Arrêter during the lift, report still Idle: a feed hold only, the reset waits for a newer report at rest', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    const mark = ctx.mark();
    await ctx.req('stop');
    expect(ctx.since(mark)).toEqual(['!']);
    ctx.now += 250;
    ctx.report('Jog');
    await ctx.wait(100);
    expect(ctx.since(mark).includes('\x18')).toBe(false);
    await ctx.idle(1);
    await ctx.wait(100);
    expect(ctx.since(mark).includes('\x18')).toBe(true);
  });

  test('10c. Arrêter while parked: no byte at all, the job stopped at its line, the machine still homed', async () => {
    const ctx = await setup();
    await ctx.park();
    const line = ctx.state().pauseRetract.line;
    const mark = ctx.mark();
    await ctx.req('stop');
    await ctx.wait(1000);
    expect(ctx.since(mark).filter((d) => d !== '?' && d !== '$G\n')).toEqual([]);
    expect(ctx.state()).toMatchObject({ jobStopped: true, stoppedAtLine: line, homed: true, pauseRetract: null });
  });

  test('10d. Arrêter during the descent: a feed hold first (the jog is cancelled), never a reset before rest', async () => {
    const ctx = await setup();
    await ctx.park();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2);
    ctx.modal();
    await ctx.okIdle(2);
    const mark = ctx.mark();
    await ctx.req('stop');
    expect(ctx.since(mark)[0]).toBe('!');
    expect(ctx.since(mark).includes('\x18')).toBe(false);
  });

  test('11a. Pause while draining: an ordinary feed hold, then the ordinary resume writes `~` only', async () => {
    const ctx = await setup();
    await ctx.retract();
    const mark = ctx.mark();
    const out = await ctx.req('pause');
    expect(out.message).toBe('Pause demandée. Attendre l’état Hold.');
    expect(ctx.since(mark)).toEqual(['!']);
    expect(ctx.state().pauseRetract).toBe(null);
    ctx.finish();
    ctx.parse('<Hold:0|MPos:-290.000,-240.000,-118.400|FS:0,1000>');
    const m2 = ctx.mark();
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision });
    await ctx.req('resume', { nonce: t.nonce });
    expect(ctx.since(m2)[0]).toBe('~');
    expect(ctx.lines(m2).some((d) => /^\$J|^M5/.test(d))).toBe(false);
  });

  test.each(['pause', 'spindleStop', 'jog-stop'])('11b. %s during the lift: jog cancel, then M5 once at rest; failed', async (how) => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    const mark = ctx.mark();
    if (how === 'jog-stop') {
      await ctx.req('motion', { operation: 'jog-stop' });
    } else {
      await ctx.req(how);
    }
    expect(ctx.since(mark)[0]).toBe('\x85');
    ctx.m.z = -60;
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['\x85', 'M5\n']);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_PAUSED' } });
    expect(ctx.state().canResume).toBe(false);
  });
});

describe('Pause et dégager: supervision', () => {
  test('12a. the stream closed for good while draining: never a jog, held; the resume writes `~` only', async () => {
    const ctx = await setup();
    await ctx.retract();
    ctx.service.closeTransport('tA');
    ctx.service.openTransport('tA2', A);
    await ctx.rest();
    await ctx.wait(500);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_STREAM' } });
    ctx.report('Idle', { wco: true });
    const mark = ctx.mark();
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, A, 'tA2');
    await ctx.req('resume', { nonce: t.nonce }, A, 'tA2');
    await ctx.wait(200);
    expect(ctx.lines(mark).slice(0, 1)).toEqual(['~']);
    expect(ctx.lines(mark).some((d) => /^\$J|^M[345]/.test(d))).toBe(false);
  });

  test('12b. the stream closed during the lift: jog cancel then M5, failed', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    const mark = ctx.mark();
    ctx.service.closeTransport('tA');
    expect(ctx.since(mark)).toEqual(['\x85']);
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['\x85', 'M5\n']);
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_STREAM');
  });

  test('12c. a stream renewed (rotation) within 3 s: the sequence goes on, nothing leaves while it is gone', async () => {
    const ctx = await setup();
    await ctx.retract();
    expect(ctx.service.ticketPending('tA')).toBe(true);
    ctx.finish();
    ctx.service.closeTransport('tA', true);
    await ctx.idle(2);
    ctx.modal();
    const mark = ctx.mark();
    await ctx.wait(100);
    // Rest proven, but the device has no stream: no lift until it is back.
    expect(ctx.lines(mark)).toEqual([]);
    // The device's own stream back within the grace (a stream of another device alone: D9).
    ctx.service.openTransport('tA3', A);
    await ctx.idle(1);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['$J=G91 G21 Z113.4 F600\n']);
  });

  test('13. the lease taken by another device: held while draining; failed when parked, in the takeover itself', async () => {
    // Parked, the stream of tablet A gone for good: its lease expires after its grace (60 s).
    const ctx = await setup();
    await ctx.park();
    ctx.service.closeTransport('tA');
    for (let i = 0; i < 62 && phase(ctx) === 'parked'; i++) {
      ctx.now += 1000;
      ctx.report('Idle');
      ctx.service.observe();
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_CONTROL' } });
    // The takeover through the service: the retract fails in the takeover itself.
    const other = await setup();
    await other.park();
    await other.service.action({ port: '/dev/null', action: 'control', operation: 'takeover', reason: 'essai' }, B);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    expect(other.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_CONTROL' } });
    const third = await setup();
    await third.retract();
    await third.service.action({ port: '/dev/null', action: 'control', operation: 'takeover', reason: 'essai' }, B);
    const mark = third.mark();
    await third.rest();
    await third.wait(300);
    expect(third.lines(mark)).toEqual([]);
    expect(third.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_CONTROL' } });
  });

  test('14. reports interrupted while draining (held), and during the lift (jog cancel, failed)', async () => {
    const ctx = await setup();
    await ctx.retract();
    ctx.finish();
    await ctx.wait(3000);
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_STALE' } });

    const other = await setup();
    await other.retract();
    await other.rest();
    await other.wait(0);
    const mark = other.mark();
    await other.wait(3000);
    expect(other.since(mark)).toContain('\x85');
    expect(other.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_STALE');
  });

  test.each(['banner-first', 'ok-first'])('15. a board restart during the lift (%s): nothing more written, resume refused', async (order) => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    const mark = ctx.mark();
    if (order === 'ok-first') {
      ctx.parse('ok');
    }
    ctx.parse(BANNER);
    ctx.m = { x: 0, y: 0, z: 0 };
    ctx.report('Idle');
    if (order === 'banner-first') {
      ctx.parse('ok');
    }
    await ctx.idle(4);
    ctx.modal();
    await ctx.wait(500);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_RESTART');
    expect(ctx.state().canResume).toBe(false);
  });

  test('15b. an alarm while parked or draining: failed, nothing written', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    ctx.parse('ALARM:1');
    ctx.report('Alarm');
    await ctx.wait(1200);
    expect(ctx.state().pauseRetract.failure).toEqual(failureOf('ETOUCH_RETRACT_ALARM', { alarm: 'ALARM:1' }));
    expect(ctx.lines(mark)).toEqual([]);
    const other = await setup();
    await other.retract();
    const m2 = other.mark();
    other.parse('ALARM:2');
    await other.rest();
    expect(other.lines(m2)).toEqual([]);
    expect(phase(other)).toBe('failed');
  });

  test('16. error:n on the lift: held, nothing else; error:n on M5: failed', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    const mark = ctx.mark();
    ctx.parse('error:15');
    await ctx.idle(2);
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_ERROR', params: { error: 15 } } });

    const other = await setup();
    await other.retract();
    await other.rest();
    await other.wait(0);
    await other.jog(-5);
    other.parse('error:20');
    await other.idle(2);
    await other.wait(200);
    expect(phase(other)).toBe('failed');
  });

  test('17. a jog that never ends: jog cancel and TIMEOUT; the limit follows a known feed override', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    const mark = ctx.mark();
    // 113.4 mm at 600 mm/min = 11.3 s; no override known → ×10, plus 15 s.
    for (let i = 0; i < 40; i++) {
      ctx.now += 250;
      ctx.report('Jog');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
    expect(ctx.lines(mark)).toEqual([]);
    for (let i = 0; i < 800 && phase(ctx) === 'lifting'; i++) {
      ctx.now += 250;
      ctx.report('Jog');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_TIMEOUT');
    expect(ctx.since(mark)).toContain('\x85');
    expect(ctx.now - 100000).toBeGreaterThan(113.4 / 600 * 60000 * 10);
  });

  test('18. travel: at rest outside the usable travel no jog (held); near the top no jog but M5 (parked); unknown travel refused', async () => {
    const ctx = await setup({ z: -129.7 });
    await ctx.retract();
    const mark = ctx.mark();
    await ctx.rest();
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract.failure).toMatchObject({ code: 'ETOUCH_RETRACT_TRAVEL', params: { z: '-129.7', low: '-129.5', high: '0' } });

    const top = await setup({ z: -3 });
    await top.retract();
    await top.rest();
    const m2 = top.mark();
    await top.wait(0);
    expect(top.lines(m2 - 1)).toEqual(['M5\n']);
    top.gc.spindle = 'M5';
    await top.okIdle(2, { wco: true });
    expect(phase(top)).toBe('parked');
    const m3 = top.mark();
    await top.resume();
    await top.wait(100);
    expect(top.lines(m3)).toEqual(['M3 S1000\n']);

    const unknown = await setup();
    unknown.parse('$13=1');
    unknown.controller.settings = unknown.controller.runner.settings;
    expect(unknown.state()).toMatchObject({ canRetract: false, refusals: { retract: { code: 'ETOUCH_RETRACT_TRAVEL_UNKNOWN' } } });
  });

  test('19. refused before: laser, real moves off, another device, the end of the file, a ticket expired, replayed or of another stream', async () => {
    const laser = await setup();
    laser.parse('$32=1');
    laser.controller.settings = laser.controller.runner.settings;
    expect(laser.state().refusals.retract.code).toBe('ETOUCH_RETRACT_LASER');
    const off = await setup({ motion: false });
    expect(off.state().refusals.retract.code).toBe('ETOUCH_MOTION_DISABLED');
    const ctx = await setup();
    expect(ctx.state()).toMatchObject({ canRetract: true, retractReason: '' });
    await expect(ctx.retract(B)).rejects.toMatchObject({ code: 'ECONTROL' });
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    ctx.now += 16000;
    ctx.report('Run');
    await expect(ctx.req('retract', { nonce: t.nonce })).rejects.toThrow('Confirmation expirée ou déjà utilisée.');
    const t2 = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await expect(ctx.req('retract', { nonce: t2.nonce }, A, 'tB')).rejects.toThrow();
    // A pause in progress, then a feed hold: nothing more to retract.
    await ctx.req('pause');
    expect(ctx.state().refusals.retract.code).toBe('ETOUCH_RETRACT_NOT_RUNNING');
    // Every line of the short file already sent (none answered yet).
    const end = await setup({ file: 'short.nc', acks: 2 });
    expect(end.state().refusals.retract.code).toBe('ETOUCH_RETRACT_ENDING');
  });

  test('20. sockets: what acts is refused in every phase, the holder included; a stop ends the sequence', async () => {
    const ctx = await setup();
    await ctx.retract();
    expect(ctx.service.socketRefusal('/dev/null').message).toBe('Fraise dégagée par la tablette : commande refusée jusqu’à la reprise (Arrêter reste possible).');
    await ctx.rest();
    await ctx.wait(0);
    expect(ctx.service.socketRefusal('/dev/null')).not.toBe(null);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    const mark = ctx.mark();
    ctx.service.socketStop('/dev/null');
    expect(ctx.since(mark)).toEqual(['\x85']);
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_FOREIGN');
    const drain = await setup();
    await drain.retract();
    drain.service.socketStop('/dev/null');
    expect(drain.state().pauseRetract).toBe(null);
    const parked = await setup();
    await parked.park();
    expect(parked.service.socketRefusal('/dev/null')).not.toBe(null);
    parked.service.socketStop('/dev/null');
    expect(parked.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_FOREIGN');
  });

  test('21. nothing else writes while parked: macro, load, settings, spindle stop, jog refused', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    const s = ctx.state();
    expect([s.canMacro, s.canLoad, s.canReadSettings, s.canZeroZ, s.canBlockProbe, s.canPause]).toEqual([false, false, false, false, false, false]);
    await expect(ctx.req('spindleStop')).rejects.toThrow();
    await expect(ctx.req('motion', { operation: 'jog', axis: 'Z', distance: 1, feed: 100 })).rejects.toThrow();
    await expect(ctx.req('pause')).rejects.toThrow('Aucun travail en cours.');
    await ctx.wait(500);
    expect(ctx.lines(mark)).toEqual([]);
  });

  test('22. every code has its catalog line in FR, EN and ES', () => {
    const params = { z: '-129.7', low: '-129.5', high: '0', error: 15, axis: 'X', state: 'Hold', field: 'distance', alarm: 'ALARM:1' };
    Object.keys(RETRACT_MESSAGES).forEach((code) => expectCatalogMatch(failureOf(code, params)));
    expectCatalogMatch(failureOf('ETOUCH_RETRACT_ALARM', { alarm: null }));
  });

  test('23. the service disposed during the lift: one jog cancel, no timer left', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    const mark = ctx.mark();
    ctx.service.dispose();
    expect(ctx.since(mark)).toEqual(['\x85']);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// Review of the lot (F2-CORRECTIONS.md): each test plays the exact window of a finding.
describe('Pause et dégager: the windows found by the review', () => {
  // The lift cancelled by Pause while the jog still decelerates (phase failed).
  const cancelledLift = async (ctx) => {
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    await ctx.req('pause');
    expect(phase(ctx)).toBe('failed');
    ctx.now += 250;
    ctx.report('Jog');
  };
  const jogging = async (ctx, n) => {
    for (let i = 0; i < n; i++) {
      ctx.now += 250;
      ctx.report('Jog');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
  };

  test.each([['spindle on', 'M3'], ['spindle off', 'M5']])('D1. Arrêter after a failure, the jog still moving (%s): hold first, cancel repeated while Jog, reset only at rest', async (name, spindle) => {
    const ctx = await setup();
    if (spindle === 'M5') {
      ctx.gc.spindle = 'M5';
      ctx.report('Run', { feed: 600 });
    }
    await cancelledLift(ctx);
    const mark = ctx.mark();
    await ctx.req('stop');
    // Never a reset while the report says Jog; a stop is sent (the feed hold cancels the jog).
    expect(ctx.lines(mark)[0]).toBe('!');
    expect(ctx.lines(mark)).not.toContain('\x18');
    const m2 = ctx.mark();
    await jogging(ctx, 4);
    expect(ctx.lines(m2).filter((d) => d === '\x85').length).toBeGreaterThanOrEqual(1);
    expect(ctx.lines(mark)).not.toContain('\x18');
    ctx.m.z = -80;
    await ctx.idle(1);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toContain('\x18');
  });

  test('D1b. once two reports at rest proved the cancelled jog over (spindle off), Arrêter writes nothing: the reference is kept', async () => {
    const ctx = await setup();
    ctx.gc.spindle = 'M5';
    ctx.report('Run', { feed: 600 });
    await cancelledLift(ctx);
    ctx.m.z = -80;
    await ctx.idle(3);
    await ctx.wait(300);
    const mark = ctx.mark();
    await ctx.req('stop');
    await ctx.wait(1000);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state()).toMatchObject({ jobStopped: true, homed: true, pauseRetract: null });
  });

  test('D2. a relative move never leaves from a position other than the one it was computed from', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n', 'G4 P3\n']);
    // The stream rotates during the dwell: the descent waits for it.
    ctx.service.closeTransport('tA', true);
    await ctx.okIdle(2, { speed: 1000 });
    // Meanwhile Z is somewhere else (a client on the board's Wi-Fi).
    ctx.m.z = -30;
    await ctx.idle(2, { speed: 1000 });
    ctx.service.openTransport('tA4', A);
    await ctx.idle(2, { speed: 1000 });
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => /^\$J=/.test(d))).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_MOVED', params: { axis: 'Z' } } });
  });

  test('D3. the spindle reported stopped after the fast descent: the last millimetres do not leave', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    await ctx.okIdle(2, { speed: 1000 });
    expect(ctx.lines(mark).pop()).toBe('$J=G91 G21 Z-108.4 F600\n');
    ctx.parse('ok');
    ctx.m.z = -113.4;
    // M5 from a client on the board: FS says 0, then $G says M5.
    ctx.gc.spindle = 'M5';
    await ctx.idle(2);
    ctx.modal();
    await ctx.idle(2);
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => d === '$J=G91 G21 Z-5 F100\n')).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_SPINDLE' } });
  });

  test('D3b. the spindle reported stopped during the fast descent: the descent is cancelled at once', async () => {
    const ctx = await setup();
    await ctx.park();
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    await ctx.okIdle(2, { speed: 1000 });
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog', { speed: 1000 });
    const m2 = ctx.mark();
    ctx.now += 250;
    ctx.report('Jog', { speed: 0 });
    await ctx.wait(100);
    expect(ctx.lines(m2)[0]).toBe('\x85');
    expect(ctx.lines(mark).filter((d) => d === '$J=G91 G21 Z-5 F100\n')).toEqual([]);
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_SPINDLE');
  });

  test('D4. a work offset changed before the first WCO after the rest never becomes the reference', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    await ctx.jog(-5);
    // G54 changed by a client between the rest and the first report carrying WCO.
    ctx.wco.z = -105;
    ctx.gc.spindle = 'M5';
    await ctx.okIdle(2, { wco: true });
    ctx.modal();
    await ctx.wait(1100);
    const mark = ctx.mark();
    await expect(ctx.resume()).rejects.toMatchObject({ code: 'ETOUCH_RETRACT_ZERO_CHANGED' });
    await ctx.wait(500);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_ZERO_CHANGED' } });
  });

  test('D5. an Alarm state seen in one report, Idle again before the next tick: the in-place resume is refused', async () => {
    const ctx = await setup();
    await ctx.park();
    ctx.now += 250;
    ctx.report('Alarm');
    ctx.now += 250;
    ctx.report('Idle', { wco: true });
    const mark = ctx.mark();
    await expect(ctx.resume()).rejects.toThrow();
    await ctx.wait(500);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_ALARM' } });
  });

  test('D7. the final resume waits for an open stream (from parked)', async () => {
    const ctx = await setup({ z: -8 });
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    await ctx.jog(-5);
    ctx.gc.spindle = 'M5';
    await ctx.okIdle(2, { wco: true });
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    await ctx.okIdle(2, { speed: 1000 });
    await ctx.jog(-8);
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n', 'G4 P3\n', '$J=G91 G21 Z-3 F100\n']);
    ctx.service.closeTransport('tA', true);
    ctx.modal();
    await ctx.idle(4);
    expect(ctx.lines(mark)).not.toContain('~');
    ctx.service.openTransport('tA5', A);
    await ctx.idle(1);
    ctx.modal();
    await ctx.wait(200);
    expect(ctx.lines(mark)).toContain('~');
  });

  test('D7b. the final resume waits for an open stream (from held)', async () => {
    const ctx = await setup({ z: -129.7 });
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(100);
    expect(phase(ctx)).toBe('held');
    // No report with the offset yet: the resume waits for one; the stream rotates meanwhile.
    ctx.modal();
    const mark = ctx.mark();
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision });
    await ctx.req('resume', { nonce: t.nonce });
    ctx.service.closeTransport('tA', true);
    ctx.now += 250;
    ctx.report('Idle', { wco: true });
    await ctx.idle(2);
    expect(ctx.lines(mark)).toEqual([]);
    ctx.service.openTransport('tA6', A);
    await ctx.idle(1);
    await ctx.wait(100);
    expect(ctx.lines(mark)[0]).toBe('~');
  });

  test('D8. reports without coordinates prove no rest and give no position', async () => {
    const ctx = await setup();
    await ctx.retract();
    const mark = ctx.mark();
    ctx.finish();
    for (let i = 0; i < 3; i++) {
      ctx.now += 250;
      ctx.parse('<Idle|FS:0,1000>');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
    ctx.modal();
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual([]);
    // Z is elsewhere than the last explicit report: the lift is computed from where it really is.
    ctx.m.z = -110;
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual(['$J=G91 G21 Z105 F600\n']);
  });

  test('D8b. after a move, reports without coordinates do not prove where the bit is', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    const mark = ctx.mark();
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    ctx.m.z = -5;
    for (let i = 0; i < 3; i++) {
      ctx.now += 250;
      ctx.parse('<Idle|FS:0,1000>');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual([]);
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toEqual(['M5\n']);
  });

  test('D9. 12c redone: during the grace only streams of another device (B) are open: nothing leaves, then STREAM and held', async () => {
    const ctx = await setup();
    await ctx.retract();
    ctx.finish();
    ctx.service.closeTransport('tA', true);
    // B's own stream (tB) stays open, and B opens one more.
    ctx.service.openTransport('tB2', B);
    const mark = ctx.mark();
    await ctx.idle(2);
    ctx.modal();
    await ctx.idle(2);
    expect(ctx.lines(mark)).toEqual([]);
    for (let i = 0; i < 14; i++) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.idle(1);
    }
    ctx.modal();
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'held', failure: { code: 'ETOUCH_RETRACT_STREAM' } });
  });
});

// Second review (F2-CORRECTIONS.md, second round): each family closed at one point, its windows played.
describe('Pause et dégager: the windows of the second review', () => {
  const cancelledLift = async (ctx) => {
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    await ctx.req('pause');
    expect(phase(ctx)).toBe('failed');
  };
  const jogging = async (ctx, n) => {
    for (let i = 0; i < n; i++) {
      ctx.now += 250;
      ctx.report('Jog');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
  };

  test('2-D1b. the jog proven over after more than 5 s (spindle off): the cancel repeated meanwhile, then Arrêter writes nothing', async () => {
    const ctx = await setup();
    ctx.gc.spindle = 'M5';
    ctx.report('Run', { feed: 600 });
    await cancelledLift(ctx);
    await jogging(ctx, 22);
    const late = ctx.mark();
    await jogging(ctx, 4);
    expect(ctx.lines(late)).toContain('\x85');
    ctx.m.z = -80;
    await ctx.idle(3);
    await ctx.wait(300);
    const mark = ctx.mark();
    await ctx.req('stop');
    await ctx.wait(1000);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state()).toMatchObject({ jobStopped: true, homed: true, pauseRetract: null });
  });

  test('2-D1d. a stop from the PC during the dwell, then Arrêter on the tablet before the spindle stop: refused never, the spindle reset', async () => {
    const ctx = await setup();
    await ctx.park();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    // The PC's stop goes through the touch facade (socketStop) then CNCjs.
    ctx.service.socketStop('/dev/null');
    ctx.controller.command('gcode:stop');
    const mark = ctx.mark();
    const out = await ctx.req('stop');
    expect(out.message).toMatch(/Arrêt demandé/);
    await ctx.wait(100);
    expect(ctx.since(mark)).toContain('\x18');
  });

  test.each(['Alarm', 'banner'])('2-D5. %s while the lift waits for the stream (nothing of ours written): failed for good, even once homed again at the same place', async (event) => {
    const ctx = await setup();
    await ctx.retract();
    ctx.finish();
    ctx.service.closeTransport('tA', true);
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'lifting', step: 'lift' });
    const mark = ctx.mark();
    if (event === 'Alarm') {
      ctx.now += 250;
      ctx.report('Alarm');
    } else {
      ctx.parse(BANNER);
    }
    expect(ctx.state().pauseRetract.phase).toBe('failed');
    // A client homes the machine again; position, offset and modal state back as they were.
    ctx.now += 250;
    ctx.report('Home', { at: { x: -1, y: -1, z: -1 } });
    ctx.now += 1000;
    ctx.report('Idle', { wco: true });
    ctx.modal();
    ctx.service.openTransport('tA7', A);
    await ctx.idle(2, { wco: true });
    await expect(ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision }, A, 'tA7')).rejects.toThrow();
    await ctx.wait(500);
    expect(ctx.lines(mark)).toEqual([]);
    expect(ctx.state().pauseRetract.failure.code).toBe(event === 'Alarm' ? 'ETOUCH_RETRACT_ALARM' : 'ETOUCH_RETRACT_RESTART');
  });

  test('2-D2. a banner while the tail of a stopped lift waits for rest: no spindle stop, no line, in the new session', async () => {
    const ctx = await setup();
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Jog');
    ctx.service.socketStop('/dev/null');
    ctx.controller.command('gcode:stop');
    const mark = ctx.mark();
    ctx.parse(BANNER);
    ctx.m = { x: 0, y: 0, z: 0 };
    await ctx.idle(4);
    await ctx.wait(500);
    expect(ctx.lines(mark).filter((d) => d !== '\x85')).toEqual([]);
    expect(ctx.service.socketRefusal('/dev/null')).toBe(null);
  });

  // To the dwell: « Reprendre… », M3 answered, G4 P3 written; a $G after M3's `ok` says M3 (CNCjs's poll).
  const toDwell = async (ctx) => {
    await ctx.park();
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n', 'G4 P3\n']);
    return mark;
  };
  const descents = (ctx, mark) => ctx.lines(mark).filter((d) => /^\$J=G91 G21 Z-/.test(d));

  test('2-D3a. FS:0, then a report with XYZ and no FS before the next check: the loss is kept, no descent', async () => {
    const ctx = await setup();
    const mark = await toDwell(ctx);
    ctx.parse('ok');
    ctx.now += 250;
    ctx.report('Idle', { speed: 0 });
    for (let i = 0; i < 3; i++) {
      ctx.now += 250;
      ctx.parse('<Idle|MPos:' + f3(ctx.m.x) + ',' + f3(ctx.m.y) + ',' + f3(ctx.m.z) + '>');
    }
    ctx.modal();
    await ctx.wait(300);
    await ctx.idle(2, { speed: 1000 });
    await ctx.wait(200);
    expect(descents(ctx, mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_SPINDLE' } });
  });

  test('2-D3b. the spindle turned the other way (M4 from a client, speed above 0): no descent', async () => {
    const ctx = await setup();
    const mark = await toDwell(ctx);
    ctx.gc.spindle = 'M4';
    ctx.modal();
    await ctx.okIdle(2, { speed: 1000 });
    await ctx.wait(200);
    expect(descents(ctx, mark)).toEqual([]);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_SPINDLE' } });
  });

  test('2-D3c. FS:0 once during the dwell, turning again after: the loss is kept, no descent', async () => {
    const ctx = await setup();
    const mark = await toDwell(ctx);
    ctx.now += 250;
    ctx.report('Idle', { speed: 0 });
    await ctx.wait(50);
    ctx.parse('ok');
    await ctx.idle(2, { speed: 1000 });
    ctx.modal();
    await ctx.wait(200);
    expect(descents(ctx, mark)).toEqual([]);
    expect(ctx.state().pauseRetract.failure.code).toBe('ETOUCH_RETRACT_SPINDLE');
  });

  test('2-D3d. FS:0 after the plunge, then a $G that still says M3 S1000: no `~`', async () => {
    const ctx = await setup({ z: -8 });
    await ctx.retract();
    await ctx.rest();
    await ctx.wait(0);
    await ctx.jog(-5);
    ctx.gc.spindle = 'M5';
    await ctx.okIdle(2, { wco: true });
    const mark = ctx.mark();
    await ctx.resume();
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    await ctx.okIdle(2, { speed: 1000 });
    ctx.modal();
    await ctx.okIdle(2, { speed: 1000 });
    await ctx.jog(-8);
    expect(ctx.lines(mark)).toEqual(['M3 S1000\n', 'G4 P3\n', '$J=G91 G21 Z-3 F100\n']);
    ctx.now += 250;
    ctx.report('Idle', { speed: 0, wco: true });
    ctx.now += 250;
    ctx.parse('<Idle|MPos:' + f3(ctx.m.x) + ',' + f3(ctx.m.y) + ',' + f3(ctx.m.z) + '>');
    ctx.modal();
    await ctx.wait(300);
    expect(ctx.lines(mark)).not.toContain('~');
    expect(ctx.state().pauseRetract.phase).toBe('failed');
  });

  test('2-D1c. Arrêter, a jog still reported after 5 s: cancels repeated, no reset before the time limit, the reset at the limit (stop over position)', async () => {
    const ctx = await setup();
    await cancelledLift(ctx);
    const mark = ctx.mark();
    await ctx.req('stop');
    const t0 = ctx.now;
    let resetAt = null;
    for (let i = 0; i < 28 && resetAt === null; i++) {
      // eslint-disable-next-line no-await-in-loop
      await jogging(ctx, 1);
      if (ctx.lines(mark).includes('\x18')) {
        resetAt = ctx.now - t0;
      }
    }
    expect(ctx.lines(mark).filter((d) => d === '\x85').length).toBeGreaterThan(5);
    expect(resetAt).toBeGreaterThanOrEqual(5000);
    expect(resetAt).toBeLessThanOrEqual(5500);
  });
});
