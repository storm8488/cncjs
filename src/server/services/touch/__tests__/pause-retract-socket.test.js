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
      mockService.current = actual.createService(s, c, clock, { ...options, workOffset: offset });
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

  test('D9. the PC: what acts is refused in every phase, a status query passes, a stop ends the sequence', async () => {
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
});
