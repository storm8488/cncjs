/* eslint-env jest */
// Lot C1 (design/plaque/C1-CONCEPTION.md § 4): the bench of its own tests. The real GrblRunner, the
// real service; everything "the board says" is a line of text given to runner.parse, one by one:
// a `[GC:…]` report then its own `ok`, the `ok` of our lines apart. A fake serial side notes every
// byte written, in order: the tests are judged on `ctx.c.written`. Time is the bench's (`ctx.now`,
// fake timers); `tick` lets the supervisors and the microtasks really run between two injections.
import { EventEmitter } from 'events';
import GrblRunner from '../../../../controllers/Grbl/GrblRunner';
import { createService } from '../../job-service';
import { createControl } from '../../control';
import { fingerprint as sha256 } from '../../program-identity';
import { signatureOf } from '../../machine-profile';
import { provenOffset } from './proven-offset';

export const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
export const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };

// Standard Grbl conventions ($23=0): machine X, Y in [-400, 0], Z in [-80, 0]; MPos reports ($10=1).
const BOARD = { 10: 1, 13: 0, 20: 1, 22: 1, 23: 0, 30: 1000, 31: 0, 32: 0, 100: 80, 101: 80, 102: 400 };
const AXES = { 110: 3000, 111: 3000, 112: 500, 120: 200, 121: 200, 122: 50, 130: 400, 131: 400, 132: 80 };
export const SETTINGS = { ...BOARD, ...AXES };

export const PROGRAMS = {
  // X 10 → 60, Y 20 → 50 (work).
  'box.nc': ['G21 G90 G94', 'M3 S9000', 'G0 Z5', 'G0 X10 Y20', 'G1 Z-1 F200', 'G1 X60 F800', 'G1 Y50', 'G1 X10', 'G1 Y20', 'G0 Z5', 'M5', 'M30'].join('\n'),
  'frame.nc': ['G21 G90 G94', 'G0 X10 Y20', 'M4 S300', 'G1 X60 F1500', 'G1 Y50', 'G1 X10', 'G1 Y20', 'M5', 'M30'].join('\n')
};

const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
export const gcLine = (spindle = 'M5', { wcs = 'G54', s = '0', motion = 'G0' } = {}) => '[GC:' + [motion, wcs, 'G17', 'G21', 'G90', 'G94'].concat(spindle ? [spindle] : [], ['M9', 'T0', 'F0', 'S' + s]).join(' ') + ']';

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const services = [];
export const disposeAll = () => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
};

// The machine homed (Home then Idle seen), at `at` machine, the work offset `wco` said once; two
// reports at rest and one $G exchange (M5) unless `rest: false`.
// realD2: the real proof of the work offset (work-offset.js); the bench then answers its `$#`.
// wpos: a board that reports WPos ($10=0).
export const setup = async ({
  settings = SETTINGS, at = [-100, -100, -60], wco = [-105, -105, -12], realD2 = false, wpos = false, laser = false, macros = [], fs = '0,0', rest = true, homed = true
} = {}) => {
  jest.useFakeTimers();
  const set = { ...settings, ...(wpos ? { 10: 0 } : {}), ...(laser ? { 32: 1 } : {}) };
  const runner = new GrblRunner();
  const ctx = { now: 10000, m: at.slice(), wco: wco.slice(), fs, invalidated: [], history: [], programs: { ...PROGRAMS }, proof: 1, onLine: null, wpos };
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner,
    sender: Object.assign(new EventEmitter(), { state: { name: '', context: {}, total: 0 } }),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    // CNCjs's own flags of its $G query (GrblController): `reply` true while its ok is on its way.
    actionMask: { queryParserState: { state: false, reply: false } },
    written: [],
    commands: []
  };
  Object.defineProperty(c, 'settings', { get: () => runner.settings });
  Object.defineProperty(c, 'state', { get: () => runner.state });
  c.sender.toJSON = () => ({ ...c.sender.state });
  const REALTIME = { jogCancel: '\x85', reset: '\x18', feedhold: '!', cyclestart: '~' };
  c.writeln = (data) => c.written.push(data + '\n');
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => {
        c.written.push(line + '\n');
        if (ctx.onLine) {
          ctx.onLine(line);
        }
      });
    } else if (REALTIME[name]) {
      c.written.push(REALTIME[name]);
    } else if (name === 'homing') {
      c.written.push('$H\n');
    } else if (name === 'unlock') {
      c.written.push('$X\n');
    } else if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: args[1].split('\n').filter((l) => l.trim()).length };
      c.sender.emit('load');
      args[3](null);
    } else if (name === 'gcode:start') {
      c.written.push('START\n');
      c.workflow.state = 'running';
      c.workflow.emit('start');
    } else if (name === 'macro:run') {
      c.written.push('MACRO ' + args[0] + '\n');
      args[2](null);
    }
  };
  ctx.c = c;
  ctx.controllers = { TEST: c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const version = '1.1h';
  const machines = laser ? [{
    id: 'm-0123456789ab', label: 'Atelier', kind: 'laser', signature: signatureOf(Object.fromEntries(Object.keys(set).map((k) => ['$' + k, String(set[k])])), version, version), createdAt: 'x', updatedAt: 'x'
  }] : [];
  const config = { get: (key) => ({ 'touch.motion.enabled': true, 'touch.machines': machines, events: [], macros }[key]) };
  const files = {
    readProgram: (name) => Promise.resolve({
      text: ctx.programs[name], fingerprint: sha256(Buffer.from(ctx.programs[name])), size: ctx.programs[name].length, mtimeMs: 1
    }),
    fingerprintOf: (name) => Promise.resolve({ fingerprint: sha256(Buffer.from(ctx.programs[name])), size: 1, mtimeMs: 1 })
  };
  const workOffset = realD2 ? undefined : () => ({ ...provenOffset(), proof: () => ctx.proof, invalidate: (cause) => ctx.invalidated.push(cause) });
  ctx.service = createService({ get: () => ctx.controllers }, config, () => ctx.now, {
    ...(workOffset ? { workOffset } : {}), control: ctx.control, history: { record: (e) => ctx.history.push(e) }, files
  });
  services.push(ctx.service);

  // What the board says.
  ctx.say = (...lines) => lines.forEach((line) => runner.parse(line));
  ctx.ok = () => ctx.say('ok');
  // A whole $G exchange: the report, then its own ok.
  ctx.gc = (spindle = 'M5', options) => ctx.say(gcLine(spindle, options), 'ok');
  // A status line: the position (MPos, or WPos for a WPos board), FS:, then what `o` adds or removes
  // (`pos: null` no position, `fs: null` no FS:, `wco: [x, y, z]`, `extra: '|Pn:P'`).
  ctx.line = (state = 'Idle', o = {}) => {
    const pos = o.pos === undefined ? ctx.m : o.pos;
    const said = pos && wpos ? pos.map((v, i) => v - ctx.wco[i]) : pos;
    const speed = o.fs === undefined ? ctx.fs : o.fs;
    return '<' + [state].concat(
      said ? [(wpos ? 'WPos:' : 'MPos:') + said.map(f3).join(',')] : [],
      speed === null ? [] : ['FS:' + speed],
      o.wco ? ['WCO:' + o.wco.map(f3).join(',')] : []
    ).join('|') + (o.extra || '') + '>';
  };
  ctx.rep = (state, o) => ctx.say(ctx.line(state, o));
  // Bench time: every 50 ms the supervisors run, then the microtasks; `each(t)` says what the board
  // says in that step (nothing by default: the test writes every report).
  ctx.tick = async (ms = 50, each = null) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      if (each) {
        each(t);
      }
      jest.advanceTimersByTime(50);
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
  };
  // `ms` of reports at rest every 50 ms, a $G exchange (M5) every 500 ms.
  ctx.quiet = (ms, state = 'Idle', o) => ctx.tick(ms, (t) => {
    if (t % 500 === 450) {
      ctx.gc();
    }
    ctx.rep(state, o);
  });
  // Two reports at rest here and a fresh $G exchange saying M5: what a start needs.
  ctx.rest = (o) => {
    ctx.rep('Idle', o);
    ctx.rep('Idle', o);
    ctx.gc();
  };
  ctx.flush = flush;

  // Requests.
  ctx.state = () => ctx.service.list()[0];
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  // The refusal of a request, or null when it was accepted.
  ctx.refused = (promise) => promise.then(() => null, (err) => err);
  ctx.codeOf = async (promise) => {
    const err = await ctx.refused(promise);
    return err ? err.code || err.message : null;
  };
  ctx.jog = (step = 10, axis = 'X', direction = 1) => ctx.req('motion', {
    operation: 'jog', axis, direction, step, feed: axis === 'Z' ? 300 : 600
  });
  ctx.hold = (axis = 'X', direction = 1) => ctx.req('motion', { operation: 'jog-start', axis, direction, feed: 600 });
  ctx.machine = (operation, extra = {}, actor) => ctx.req('machine', { operation, ...extra }, actor);
  ctx.load = (file = laser ? 'frame.nc' : 'box.nc') => ctx.req('load', { file });
  ctx.frame = async () => {
    const ticket = await ctx.machine('frame-prepare');
    return ctx.machine('frame', { nonce: ticket.nonce });
  };
  ctx.confirmed = async (operation, extra = {}) => {
    const ticket = await ctx.req('prepare', { operation, ...extra });
    return ctx.req(operation, { nonce: ticket.nonce });
  };
  // A confirmed operation that lasts (a probe): refused at once → throws; else it goes on, and
  // `ctx.result` becomes { ok } or { err } at its end.
  ctx.launch = async (operation, extra = {}) => {
    const ticket = await ctx.req('prepare', { operation, ...extra });
    ctx.result = null;
    ctx.req(operation, { nonce: ticket.nonce }).then((ok) => {
      ctx.result = { ok };
    }, (err) => {
      ctx.result = { err };
    });
    await flush();
    if (ctx.result && ctx.result.err) {
      throw ctx.result.err;
    }
  };
  ctx.lines = () => c.written.filter((b) => /\n$/.test(b)).map((b) => b.trim());

  // The board starts, its settings are read, it homes, then stands at rest.
  ctx.say('Grbl ' + version + ' [\'$\' for help]');
  Object.keys(set).forEach((k) => ctx.say('$' + k + '=' + set[k]));
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.rep('Idle', { wco: ctx.wco });
  if (homed) {
    ctx.rep('Home');
    ctx.rep('Idle');
  }
  if (rest) {
    ctx.rest();
  }
  await flush();
  if (realD2) {
    // The board's answer to the `$#` of the proof: the stored offsets, then ok.
    ctx.stored = ctx.wco.slice();
    ctx.onLine = (line) => {
      if (line === '$#') {
        ctx.say('[G54:' + ctx.stored.map(f3).join(',') + ']', '[G55:0.000,0.000,0.000]', '[G92:0.000,0.000,0.000]', '[TLO:0.000]', '[PRB:0.000,0.000,0.000:0]', 'ok');
      } else if (/^G5[4-9]$/.test(line)) {
        ctx.say('ok');
      }
    };
  }
  return ctx;
};
