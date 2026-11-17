/* eslint-env jest */
// « Pause et dégager » (F2) seen from the Socket.IO entry (F2-CORRECTIONS.md D6, D9): every command
// and raw write goes through the touch facade's refuseSocket, exactly as CNCEngine calls it, then,
// when allowed, to the real GrblController like CNCEngine does. The facade builds the real job
// service and the real control; the board is played by the test (reports, `ok`, [GC:] replies).
import fs from 'fs';
import os from 'os';
import path from 'path';
import GrblController from '../../../controllers/Grbl/GrblController';
import { createController } from '../../../controllers/__tests__/helpers/createController';
import config from '../../configstore';
import store from '../../../store';
import settings from '../../../config/settings';
import touch from '../index';
import { SAFE_COMMANDS, SAFE_WRITES } from '../control';

jest.mock('../../../lib/logger', () => {
  const l = () => ({ error: () => {}, warn: () => {}, info: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} });
  return { __esModule: true, default: l, getLevel: () => 'info', setLevel: () => {} };
});
jest.mock('../system-stats', () => ({ createSystemStats: () => ({ start: jest.fn(), stop: jest.fn(), read: () => ({}) }) }));
jest.mock('../backlight', () => ({ createBacklight: () => ({ restore: jest.fn(), status: () => ({}), set: jest.fn(), dim: jest.fn(), wake: jest.fn() }) }));
// The service the facade builds, with a work offset already proven (D2 is not the subject here).
const mockService = { current: null };
jest.mock('../job-service', () => {
  const actual = jest.requireActual('../job-service');
  return {
    ...actual,
    createService: (s, c, clock, options = {}) => {
      // eslint-disable-next-line global-require
      const { provenOffset: offset } = require('./support/proven-offset');
      // The fake clock of the timers (Date.now), so the service's delays follow advanceTimersByTime.
      mockService.current = actual.createService(s, c, clock || (() => Date.now()), { ...options, workOffset: offset });
      return mockService.current;
    }
  };
});

const BANNER = 'Grbl 1.1f [\'$\' for help]';
const LUNYEE = ['$10=1', '$13=0', '$20=1', '$21=1', '$22=1', '$23=3', '$30=1000', '$31=0', '$32=0', '$100=800', '$101=800', '$102=800',
  '$110=4000', '$111=4000', '$112=800', '$120=200', '$121=200', '$122=100', '$130=408', '$131=396', '$132=130'];
const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };
const PORT = '/dev/null';
const f3 = (n) => n.toFixed(3);
const pc = { id: 'sock-pc', handshake: { address: '192.168.1.20' }, decoded_token: { id: 'u1', name: 'ana' } };

let root;
let ctx = null;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'retract-socket-'));
  const lines = ['G21 G90 G17 G94', 'M3 S1000', 'G4 P1', 'G1 Z-3.4 F300'];
  for (let i = 1; i <= 80; i++) {
    lines.push('G1 X' + (i % 2 ? 10 : 0) + ' Y' + (i * 0.2).toFixed(1) + ' F600');
  }
  lines.push('G0 Z5', 'M5', 'M2');
  fs.writeFileSync(path.join(root, 'long.nc'), lines.join('\n'));
  settings.rcfile = path.join(root, '.cncrc');
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
afterEach(() => {
  touch.stop();
  store.set('controllers', {});
  if (ctx) {
    ctx.controller.destroy();
    ctx = null;
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const setup = async () => {
  const machines = [];
  jest.spyOn(config, 'get').mockImplementation((key, def) => (key === 'touch.machines' ? machines
    : { watchDirectory: root, events: [], macros: [], 'touch.motion.enabled': true }[key] ?? def));
  jest.useFakeTimers();
  const made = createController(GrblController);
  const controller = made.controller;
  clearInterval(controller.queryTimer);
  store.set('controllers', { [PORT]: controller });
  touch.start();
  const service = mockService.current;
  ctx = { controller, writes: made.writes, service, m: { x: -290, y: -240, z: -118.4 }, gc: { motion: 'G1', wcs: 'G54', plane: 'G17', units: 'G21', distance: 'G90', feed: 'G94', spindle: 'M5', coolant: 'M9', T: '0', F: '600', S: '1000' } };
  const parse = (line) => controller.runner.parse(line);
  ctx.parse = parse;
  ctx.report = (state = 'Idle', { wco = false, speed = null } = {}) => {
    const turning = ctx.gc.spindle === 'M5' ? 0 : Number(ctx.gc.S);
    const s = speed === null ? turning : speed;
    parse('<' + state + '|MPos:' + f3(ctx.m.x) + ',' + f3(ctx.m.y) + ',' + f3(ctx.m.z) + '|FS:0,' + s + (wco ? '|WCO:-300.000,-250.000,-115.000' : '') + '>');
  };
  ctx.modal = () => {
    const g = ctx.gc;
    parse('[GC:' + [g.motion, g.wcs, g.plane, g.units, g.distance, g.feed, 'M0', g.spindle, g.coolant, 'T' + g.T, 'F' + g.F, 'S' + g.S].join(' ') + ']');
    parse('ok');
  };
  ctx.idle = async (n = 2, opts = {}) => {
    for (let i = 0; i < n; i++) {
      ctx.report('Idle', opts);
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
  };
  ctx.wait = (ms) => jest.advanceTimersByTimeAsync(ms);
  ctx.state = () => service.list()[0];
  ctx.mark = () => ctx.writes.length;
  ctx.lines = (mark) => ctx.writes.slice(mark).map((w) => w.data).filter((d) => d !== '?' && d !== '$G\n');
  // What CNCEngine does with a socket's command or write: the facade decides, then the controller.
  ctx.socket = (kind, data) => {
    const refusal = touch.refuseSocket(pc, PORT, kind, data);
    if (!refusal) {
      if (kind === 'command') {
        controller.command(data);
      } else {
        controller.write(data);
      }
    }
    return refusal;
  };

  parse(BANNER);
  LUNYEE.forEach(parse);
  controller.settings = controller.runner.settings;
  service.list();
  service.openTransport('tA', A);
  ctx.report('Home');
  await ctx.wait(1000);
  ctx.report('Idle', { wco: true });
  ctx.modal();
  machines.push({ id: 'm-0123456789ab', label: 'CNC', kind: 'cnc', signature: ctx.state().machineProfile.signature, createdAt: 'x', updatedAt: 'x' });
  const generation = ctx.state().generation;
  ctx.req = (action, extra = {}) => service.action({ port: PORT, generation, transportId: 'tA', action, ...extra }, A);
  await ctx.req('load', { file: 'long.nc' });
  ctx.report('Idle', { wco: true });
  const ticket = await ctx.req('prepare', { operation: 'start', revision: ctx.state().revision });
  await ctx.req('start', { nonce: ticket.nonce });
  for (let i = 0; i < 12; i++) {
    parse('ok');
  }
  ctx.gc.spindle = 'M3';
  ctx.report('Run');
  // To parked: « Pause et dégager », rest, the lift to Z -5, M5.
  ctx.park = async () => {
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    const s = controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(ctx.mark() - 1)).toEqual(['$J=G91 G21 Z113.4 F600\n']);
    parse('ok');
    ctx.m.z = -5;
    await ctx.idle(2);
    await ctx.wait(100);
    ctx.gc.spindle = 'M5';
    parse('ok');
    await ctx.idle(2, { wco: true });
    await ctx.wait(100);
    expect(ctx.state().pauseRetract.phase).toBe('parked');
  };
  // « Pause et dégager », rest, the lift written and answered, a report says Jog.
  ctx.toLift = async () => {
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    const s = controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(ctx.mark() - 1)).toEqual(['$J=G91 G21 Z113.4 F600\n']);
    parse('ok');
    ctx.report('Jog');
    expect(ctx.state().pauseRetract.phase).toBe('lifting');
  };
  ctx.jogging = async (n) => {
    for (let i = 0; i < n; i++) {
      ctx.report('Jog');
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(250);
    }
  };
  // « Reprendre… », then the spindle restarted: the dwell G4 P3 is the last line written.
  ctx.toDwell = async () => {
    ctx.report('Idle', { wco: true });
    ctx.modal();
    const t = await ctx.req('prepare', { operation: 'resume', revision: ctx.state().revision });
    await ctx.req('resume', { nonce: t.nonce });
    await ctx.wait(100);
    ctx.gc.spindle = 'M3';
    parse('ok');
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(ctx.mark() - 1)).toEqual(['G4 P3\n']);
  };
  return ctx;
};

describe('Pause et dégager through the Socket.IO entry (index.js refuseSocket)', () => {
  test.each([['command', 'jogCancel'], ['write', '\x85']])('D6. a jog cancel from the PC (%s %j) during the dwell of the resume: no descent follows', async (kind, data) => {
    await setup();
    await ctx.park();
    await ctx.toDwell();
    const mark = ctx.mark();
    expect(ctx.socket(kind, data)).toBe(null);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_FOREIGN' } });
    // The dwell ends, the board is at rest: nothing of ours but the spindle stop.
    ctx.parse('ok');
    await ctx.idle(4);
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => /^\$J=/.test(d))).toEqual([]);
    expect(ctx.lines(mark).filter((d) => d !== '\x85')).toEqual(['M5\n']);
  });

  test('D6. a jog cancel from the PC during the lift: the lift ends there, failed, and nothing goes down', async () => {
    await setup();
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    const s = ctx.controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      ctx.parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    ctx.parse('ok');
    ctx.report('Jog');
    const mark = ctx.mark();
    expect(ctx.socket('write', '\x85')).toBe(null);
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_FOREIGN' } });
    ctx.m.z = -60;
    await ctx.idle(3);
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => /^\$J=|^M[34]/.test(d))).toEqual([]);
  });

  test('D9. the PC: what acts is refused while draining and lifting (2-D9: the other phases), a status query passes, a stop ends the sequence', async () => {
    await setup();
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    const busy = 'Fraise dégagée par la tablette : commande refusée jusqu’à la reprise (Arrêter reste possible).';
    const acts = [['command', 'gcode:resume'], ['command', 'cyclestart'], ['write', '~'], ['command', 'gcode', 'G0 Z0'], ['writeln', 'M5']];
    acts.forEach(([kind, data]) => expect([data, (ctx.socket(kind, data) || {}).message]).toEqual([data, busy]));
    expect(ctx.socket('write', '?')).toBe(null);
    ctx.modal();
    const s = ctx.controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      ctx.parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.state().pauseRetract.phase).toBe('lifting');
    acts.forEach(([kind, data]) => expect([data, (ctx.socket(kind, data) || {}).message]).toEqual([data, busy]));
    ctx.parse('ok');
    ctx.report('Jog');
    const mark = ctx.mark();
    // Feed hold from the PC: the lift is cancelled through the socket's own path.
    expect(ctx.socket('write', '!')).toBe(null);
    expect(ctx.lines(mark)).toEqual(expect.arrayContaining(['\x85', '!']));
    expect(ctx.state().pauseRetract).toMatchObject({ phase: 'failed', failure: { code: 'ETOUCH_RETRACT_FOREIGN' } });
  });

  // Second review (F2-CORRECTIONS.md, second round): every command and raw write that index.js lets
  // pass while a retract exists, enumerated from control.js, not from the review.
  const QUERIES = ['statusreport', 'autolevel:getProbeState', '?'];
  const PASSING = SAFE_COMMANDS.filter((cmd) => !QUERIES.includes(cmd)).map((cmd) => ['command', cmd])
    .concat(SAFE_WRITES.filter((ch) => !QUERIES.includes(ch)).map((ch) => ['write', ch]));

  test('2-D1. the list of what passes is the one of control.js (stops, cancels, queries only)', () => {
    expect(PASSING.length).toBe(SAFE_COMMANDS.length + SAFE_WRITES.length - QUERIES.length);
    expect(PASSING.length).toBeGreaterThan(10);
  });

  test.each(PASSING)('2-D1. %s %j passed to the board during the lift: the lift ends at once, a jog cancel first, nothing of ours goes down', async (kind, data) => {
    await setup();
    await ctx.toLift();
    const mark = ctx.mark();
    expect(ctx.socket(kind, data)).toBe(null);
    expect(ctx.lines(mark)[0]).toBe('\x85');
    expect(['failed', undefined]).toContain((ctx.state().pauseRetract || {}).phase);
    await ctx.jogging(3);
    ctx.m.z = -60;
    await ctx.idle(3);
    await ctx.wait(300);
    expect(ctx.lines(mark).filter((d) => /^\$J=|^M[34]|^G4/.test(d))).toEqual([]);
  });

  test.each(QUERIES.map((q) => [q === '?' ? 'write' : 'command', q]))('2-D1. a status query (%s %j) changes nothing', async (kind, data) => {
    await setup();
    await ctx.toLift();
    const mark = ctx.mark();
    expect(ctx.socket(kind, data)).toBe(null);
    expect(ctx.lines(mark).filter((d) => d !== '?')).toEqual([]);
    expect(ctx.state().pauseRetract.phase).toBe('lifting');
  });

  test('2-D1. a stop from the PC (gcode:stop) during the lift: the jog cancel is repeated while Jog, then M5 at rest; the PC waits meanwhile', async () => {
    await setup();
    await ctx.toLift();
    const mark = ctx.mark();
    expect(ctx.socket('command', 'gcode:stop')).toBe(null);
    expect(ctx.controller.workflow.state).toBe('idle');
    // 30 more reports say Jog (the cancel lost on the link, or a long deceleration).
    await ctx.jogging(30);
    expect(ctx.lines(mark).filter((d) => d === '\x85').length).toBeGreaterThan(5);
    expect(ctx.lines(mark)).not.toContain('M5\n');
    // What acts from the PC waits until the jog is proven over.
    expect(ctx.socket('command', 'gcode')).not.toBe(null);
    ctx.m.z = -60;
    await ctx.idle(3);
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => d !== '\x85')).toEqual(['M5\n']);
  });

  test('2-D1. the program loaded again from outside (gcode:load) during the lift: the jog cancel and M5 at rest still follow', async () => {
    await setup();
    await ctx.toLift();
    const mark = ctx.mark();
    // api.gcode.js loads a file without passing through the socket refusal.
    ctx.controller.command('gcode:load', 'other.nc', 'G0 X0', {}, () => {});
    await ctx.jogging(4);
    expect(ctx.lines(mark).filter((d) => d === '\x85').length).toBeGreaterThanOrEqual(2);
    ctx.m.z = -60;
    await ctx.idle(3);
    await ctx.wait(200);
    expect(ctx.lines(mark).filter((d) => d !== '\x85')).toEqual(['M5\n']);
  });

  test('2-D1. a stop from the PC during the dwell of the resume (spindle restarted, nothing moving): M5 at rest still follows', async () => {
    await setup();
    await ctx.park();
    await ctx.toDwell();
    const mark = ctx.mark();
    expect(ctx.socket('command', 'gcode:stop')).toBe(null);
    ctx.parse('ok');
    await ctx.idle(3);
    await ctx.wait(200);
    expect(ctx.lines(mark)).toEqual(['M5\n']);
    // The tail is over: nothing of F2 keeps the PC waiting any more.
    expect(ctx.service.socketRefusal(PORT)).toBe(null);
  });

  test('2-D9. what acts is also refused while parked, during the descent, held and failed', async () => {
    const busy = 'Fraise dégagée par la tablette : commande refusée jusqu’à la reprise (Arrêter reste possible).';
    const acts = [['command', 'gcode:resume'], ['command', 'cyclestart'], ['write', '~'], ['command', 'gcode'], ['writeln', 'M5'], ['command', 'homing'], ['command', 'unlock']];
    const refused = (phase) => acts.forEach(([kind, data]) => expect([phase, data, (ctx.socket(kind, data) || {}).message]).toEqual([phase, data, busy]));
    await setup();
    await ctx.park();
    refused('parked');
    await ctx.toDwell();
    refused('returning');
    expect(ctx.socket('command', 'jogCancel')).toBe(null);
    expect(ctx.state().pauseRetract.phase).toBe('failed');
    refused('failed');
    touch.stop();
    store.set('controllers', {});
    ctx.controller.destroy();
    ctx = null;
    // Held: the stream closed for good while draining.
    await setup();
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    ctx.service.closeTransport('tA');
    const s = ctx.controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      ctx.parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(500);
    expect(ctx.state().pauseRetract.phase).toBe('held');
    refused('held');
  });
});

// Third review (F2-CORRECTIONS.md, third round): the tail of a retract stopped from the PC, seen
// from the tablet. The tail is the move of ours not proven over (and its spindle stop): Arrêter is
// the stop of F2 there too, and nothing else that moves may start meanwhile, from any client.
describe('Pause et dégager: the tail of a retract stopped from the PC, from the tablet (third review)', () => {
  const TAIL = /fin du déplacement de la fraise n’est pas prouvée/;
  // « Pause et dégager », rest, the lift written and answered; the reports still say Idle.
  const liftAnswered = async () => {
    const t = await ctx.req('prepare', { operation: 'retract', revision: ctx.state().revision });
    await ctx.req('retract', { nonce: t.nonce });
    const s = ctx.controller.sender.state;
    for (let i = s.received; i < s.sent; i++) {
      ctx.parse('ok');
    }
    await ctx.idle(2);
    ctx.modal();
    await ctx.wait(100);
    expect(ctx.lines(ctx.mark() - 1)).toEqual(['$J=G91 G21 Z113.4 F600\n']);
    ctx.parse('ok');
  };

  test('3-D1. a stop from the PC during the lift, then Arrêter on the tablet while Jog lasts: feed hold first, cancels repeated, the reset only at rest', async () => {
    await setup();
    await liftAnswered();
    ctx.report('Jog');
    expect(ctx.socket('command', 'gcode:stop')).toBe(null);
    expect(ctx.controller.workflow.state).toBe('idle');
    const mark = ctx.mark();
    const out = await ctx.req('stop');
    expect(out.message).toMatch(/Arrêt demandé/);
    expect(ctx.lines(mark)[0]).toBe('!');
    // Two seconds more of Jog: cancels repeated, never a reset.
    await ctx.jogging(8);
    expect(ctx.lines(mark).filter((d) => d === '\x85').length).toBeGreaterThanOrEqual(2);
    expect(ctx.lines(mark)).not.toContain('\x18');
    ctx.m.z = -60;
    await ctx.idle(2);
    await ctx.wait(100);
    expect(ctx.lines(mark)).toContain('\x18');
  });

  test('3-D2. a stop from the PC during the lift: no tablet move starts while the jog of ours is not proven over (before its first Jog, before the second Idle)', async () => {
    await setup();
    await liftAnswered();
    expect(ctx.socket('command', 'gcode:stop')).toBe(null);
    const STEP = { axis: 'X', direction: 1, step: 0.1, feed: 100 };
    const refusedNow = async () => {
      expect(ctx.state().motion.canJog).toBe(false);
      expect(ctx.state().motion.jogReason).toMatch(TAIL);
      const mark = ctx.mark();
      await expect(ctx.req('motion', { operation: 'jog', ...STEP })).rejects.toThrow(TAIL);
      for (const operation of ['start', 'set-origin', 'zeroZ', 'home', 'unlock', 'spindle']) {
        // eslint-disable-next-line no-await-in-loop
        await expect(ctx.req('prepare', { operation, revision: ctx.state().revision })).rejects.toThrow();
      }
      await expect(ctx.req('prepare', { operation: 'start', revision: ctx.state().revision })).rejects.toThrow(TAIL);
      await expect(ctx.req('override', { kind: 'spindle', value: 10 })).rejects.toThrow(TAIL);
      await expect(ctx.req('verifyOffset')).rejects.toThrow(TAIL);
      expect(ctx.lines(mark).filter((d) => d !== '\x85')).toEqual([]);
    };
    // The last report still says Idle: the jog may start any moment.
    await refusedNow();
    ctx.report('Jog');
    await ctx.wait(100);
    await refusedNow();
    // One report at rest only.
    ctx.m.z = -60;
    ctx.report('Idle');
    await ctx.wait(100);
    await refusedNow();
    // The second one proves the jog over: M5 at rest, then the tablet may move again.
    await ctx.idle(2);
    await ctx.wait(200);
    expect(ctx.state().motion.canJog).toBe(true);
  });
});
