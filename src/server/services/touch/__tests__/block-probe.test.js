/* eslint-env jest */
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createService } from '../job-service';
import { createControl } from '../control';
import { blockParams, blockPlan, originOf, MESSAGES, createBlockProbe, refusal } from '../block-probe';
import { provenOffset } from './support/proven-offset';
import { expectCatalogMatch } from './touch-codes-catalog';

// The page's side of the contract: its pure module and its catalog of the server's codes.
const TOUCH = path.join(__dirname, '../../../../../examples/cncjs-touch/touch');
// eslint-disable-next-line import/no-dynamic-require
const real = require(path.join(TOUCH, 'probe-real.js'));
const catalog = () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(TOUCH, 'i18n-messages-machine.js'), 'utf8'), sandbox);
  const rows = {};
  (sandbox.window.CNCTouchCodes || []).forEach((row) => {
    rows[row[0]] = row;
  });
  return rows;
};

// A fake Grbl 1.1f (the operator's LUNYEE 4040: $10=1, $13=0, $22=1, $23=3,
// travel 408 / 396 / 130, origin forced to 0) with a geometric world: solid
// conductive boxes (machine coordinates) and a cylindrical tool. G38.3 stops
// at the first contact and reports PRB (:1, or :0 at the target), G53 G1 moves
// without looking; every sample of every move is checked, so a tool entering
// a box (or the piece under the block) is recorded. Lines run one after the
// other; as on Grbl, a G53 G1 is answered `ok` once planned (the move still to
// run), a G38.3 once its probe cycle is over; a line received while another is
// still planned or running is recorded (`overlaps`). Each of the six offsets
// G54-G59 is kept apart (G10 L20 P writes its own). $G polls ([GC] + ok) come
// every 500 ms. It never touches a serial port.
//
// Option `lunyee` (PLAN-CORRECTIONS § 2.2, the field facts of the board): three offsets kept
// apart, the stored one (`$#`), the executed one (the targets) and the reported one (WCO:);
// after a homing the last two are zero (`executedAfterHoming: 'stored'`: only the reported
// one) until loaded again by another system (G54-G59 alone on a line), G10 L2/L20 on the
// active one, a reset or M2/M30. WCO: comes in the status payload one report in ten and at
// the report after a change, and CNCjs's WPos follows the last one. A G38.3 or G53 G1 target
// outside the soft limits ($23 bits, far end 0.2 mm early) raises ALARM:2 before any move, then
// the board restarts (banner, Alarm, MPos 0). A reset in motion: ALARM:3, then the same
// restart. $H, $HX, $HY, $HZ lines run the whole cycle. `probeStuck`: permanent contact.
const SCALE = 0.1;
const LUNYEE_INSET = 0.2;
const round3 = (n) => Math.round(n * 1000) / 1000;
const TOP = -119.565;
const block = (corner = '--') => {
  // The tool starts at (100, 100), 4 mm inside the X face and 5 mm inside the Y face.
  const [cX, cY] = { '--': [-1, -1], '+-': [1, -1], '-+': [-1, 1], '++': [1, 1] }[corner];
  const fx = 100 + 4 * cX;
  const fy = 100 + 5 * cY;
  return { x0: Math.min(fx, fx - 30 * cX), x1: Math.max(fx, fx - 30 * cX), y0: Math.min(fy, fy - 30 * cY), y1: Math.max(fy, fy - 30 * cY), top: TOP };
};

const fakeGrbl = (ctx, {
  solids = [block()], radius = 3, start = { x: 100, y: 100, z: -110 }, lunyee = false, executedAfterHoming = 'zero', probeStuck = false
} = {}) => {
  const g = {
    lunyee,
    // LUNYEE: { executed, reported } zero after a homing, or null (the stored offset); the
    // last WCO: reported (strings, as CNCjs keeps it) and the reports until the next one.
    offsetVoid: null,
    lastWco: null,
    wcoCounter: 0,
    stuck: probeStuck,
    m: { x: 0, y: 0, z: 0 },
    wco: { x: 20, y: 30, z: -100 },
    // G55-G59 (P2-P6); G54 (P1) is `wco`.
    others: { 2: { x: 20, y: 30, z: -100 }, 3: { x: 0, y: 0, z: 0 }, 4: { x: 0, y: 0, z: 0 }, 5: { x: 0, y: 0, z: 0 }, 6: { x: 0, y: 0, z: 0 } },
    overlaps: [],
    // Test hooks: a line answered error:20 instead of running, a G10 written off by this much.
    rejects: () => false,
    writeSkew: 0,
    g92: { x: '0.000', y: '0.000', z: '0.000' },
    tlo: '0.000',
    active: 'Idle',
    subState: null,
    queue: [],
    current: null,
    sent: [],
    realtime: [],
    collisions: [],
    minTip: Infinity,
    solids,
    radius,
    start,
    pinForced: null,
    silent: false,
    lastPoll: -Infinity,
    homeEnd: null,
    // Test hooks: onStart(line, motion), onComplete(line, info) with info.ok / info.prb.
    onStart: null,
    onComplete: null,
    stalled: (line) => false
  };
  const modal = { motion: 'G0', wcs: 'G54', distance: 'G90', units: 'G21', spindle: 'M5', feedrate: 'G94' };
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: {
      version: '1.1f',
      settings: { $10: '1', $13: '0', $20: '1', $21: '1', $22: '1', $23: '3', $110: '4000', $111: '4000', $112: '800', $130: '408', $131: '396', $132: '130' }
    },
    commands: []
  };
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  g.modal = modal;
  g.spindle = 0;
  const f3 = (n) => n.toFixed(3);
  const touching = (p) => g.stuck || (g.pinForced !== null ? g.pinForced : g.solids.some((s) => {
    const dx = Math.max(s.x0 - p.x, 0, p.x - s.x1);
    const dy = Math.max(s.y0 - p.y, 0, p.y - s.y1);
    return p.z <= s.top + 1e-9 && Math.hypot(dx, dy) <= g.radius + 1e-9;
  }));
  // Inside a solid (deeper than 5 µm), or the tip under the piece's top (block top − 5 mm).
  const inside = (p) => g.solids.some((s) => {
    const dx = Math.max(s.x0 - p.x, 0, p.x - s.x1);
    const dy = Math.max(s.y0 - p.y, 0, p.y - s.y1);
    return p.z < s.top - 0.005 && Math.hypot(dx, dy) < g.radius - 0.005;
  });
  // The active offset (G54 → wco, G55-G59 → others).
  g.activeIndex = () => ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'].indexOf(modal.wcs) + 1;
  g.offset = (p = g.activeIndex()) => (p === 1 ? g.wco : g.others[p]);
  const ZERO = { x: 0, y: 0, z: 0 };
  // LUNYEE: the offset the moves use, and the one the board reports.
  g.executed = () => (g.offsetVoid && g.offsetVoid.executed ? ZERO : g.offset());
  g.reported = () => (g.offsetVoid && g.offsetVoid.reported ? ZERO : g.offset());
  // LUNYEE: the stored offset is loaded again; the next report carries WCO:.
  const reload = () => {
    g.offsetVoid = null;
    g.wcoCounter = 0;
  };
  g.refresh = () => {
    // CNCjs computes WPos from the last WCO: it received (LUNYEE); the standard fake from G54-G59.
    const last = g.lunyee && g.lastWco ? { x: Number(g.lastWco.x), y: Number(g.lastWco.y), z: Number(g.lastWco.z) } : null;
    const o = last || (g.lunyee ? g.reported() : g.offset());
    const w = { x: g.m.x - o.x, y: g.m.y - o.y, z: g.m.z - o.z };
    c.runner.state = {
      status: {
        activeState: g.active,
        subState: g.subState,
        mpos: { x: f3(g.m.x), y: f3(g.m.y), z: f3(g.m.z) },
        wpos: { x: f3(w.x), y: f3(w.y), z: f3(w.z) },
        ...(g.lunyee && g.lastWco ? { wco: { ...g.lastWco } } : {}),
        spindle: g.spindle,
        feedrate: 0
      },
      parserstate: { modal: { ...modal }, feedrate: '0', spindle: '0' }
    };
  };
  g.report = () => {
    let wco = null;
    // WCO: one report in ten, and at the report after a change (Grbl 1.1 at rest; LUNYEE in
    // every state). The standard fake reports it too: the block probe checks `$#` against it (C-03).
    if (g.wcoCounter > 0) {
      g.wcoCounter -= 1;
    } else {
      g.wcoCounter = 9;
      const o = g.lunyee ? g.reported() : g.offset();
      wco = { x: f3(o.x), y: f3(o.y), z: f3(o.z) };
      if (g.lunyee) {
        g.lastWco = wco;
      }
    }
    g.refresh();
    const state = g.active + (g.subState !== null && g.active === 'Hold' ? ':' + g.subState : '');
    const pin = touching(g.m) ? '|Pn:P' : '';
    const field = wco ? '|WCO:' + wco.x + ',' + wco.y + ',' + wco.z : '';
    const raw = '<' + state + '|MPos:' + f3(g.m.x) + ',' + f3(g.m.y) + ',' + f3(g.m.z) + '|FS:0,' + g.spindle + pin + field + '>';
    c.runner.emit('status', wco ? { raw, wco: { ...wco } } : { raw });
  };
  // LUNYEE: the board restarts (after ALARM:n when given): nothing more runs, MPos 0,0,0, G54,
  // G92 and the tool offset cleared, the stored offset loaded, locked in Alarm.
  const restart = (alarm) => {
    if (alarm) {
      c.runner.emit('alarm', { message: String(alarm), raw: 'ALARM:' + alarm });
    }
    g.queue = [];
    g.current = null;
    g.homeEnd = null;
    g.m = { x: 0, y: 0, z: 0 };
    g.active = 'Alarm';
    g.subState = null;
    Object.assign(modal, { motion: 'G0', wcs: 'G54', distance: 'G90', units: 'G21', spindle: 'M5', feedrate: 'G94' });
    g.g92 = { x: '0.000', y: '0.000', z: '0.000' };
    g.tlo = '0.000';
    reload();
    c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
  };
  // LUNYEE: a machine target outside the soft limits (bit of $23 set: [0, travel], otherwise
  // [-travel, 0]; the far end refused LUNYEE_INSET early).
  const outsideTravel = (to) => ['x', 'y', 'z'].some((k, i) => {
    const travel = Number(c.settings.settings['$13' + i]);
    const towardsPlus = Math.floor(Number(c.settings.settings.$23) / 2 ** i) % 2 === 1;
    const low = towardsPlus ? 0 : -travel + LUNYEE_INSET;
    const high = towardsPlus ? travel - LUNYEE_INSET : 0;
    return to[k] < low || to[k] > high;
  });
  const reset = () => {
    if (g.ignoreReset) {
      return;
    }
    if (g.lunyee) {
      // In motion (a held one included, or a homing), the board restarts and loses its position.
      if (g.current || ['Run', 'Hold', 'Home'].includes(g.active)) {
        restart(3);
        return;
      }
      g.g92 = { x: '0.000', y: '0.000', z: '0.000' };
      g.tlo = '0.000';
      modal.wcs = 'G54';
      reload();
    }
    g.queue = [];
    g.current = null;
    g.active = 'Alarm';
    g.subState = null;
    modal.motion = 'G0';
    c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
  };
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => {
        if (g.current || g.queue.length) {
          g.overlaps.push(line);
        }
        g.sent.push(line);
        g.queue.push(line);
      });
    } else if (name === 'feedhold') {
      g.realtime.push('!');
      if (g.active === 'Run' || (g.active === 'Idle' && (g.current || g.queue.length))) {
        g.active = 'Hold';
        g.subState = 0;
      }
    } else if (name === 'reset') {
      g.realtime.push('\x18');
      reset();
    } else if (name === 'homing') {
      g.active = 'Home';
      g.homeEnd = ctx.now + 1500;
    }
  };
  const machineTarget = (line) => {
    const to = { ...g.m };
    const words = line.replace(/^G53 G1 |^G38\.3 /, '').split(' ');
    let feed = null;
    words.forEach((word) => {
      const axis = word[0];
      const v = Number(word.slice(1));
      if (axis === 'F') {
        feed = v;
      } else {
        const k = axis.toLowerCase();
        to[k] = /^G53/.test(line) ? v : v + g.executed()[k];
      }
    });
    return { to, feed };
  };
  const done = (line, info) => {
    if (g.onComplete) {
      g.onComplete(line, info);
    }
    g.current = null;
    if (info.alarm) {
      return;
    }
    g.active = 'Idle';
    g.refresh();
    for (let i = 0; i < info.prb; i++) {
      c.runner.emit('parameters', { name: 'PRB', value: { x: f3(info.at.x), y: f3(info.at.y), z: f3(info.at.z), result: info.result } });
    }
    if (info.ok) {
      c.runner.emit('ok');
    }
  };
  const begin = (line) => {
    if (g.rejects(line)) {
      c.runner.emit('error', { message: '20' });
      return;
    }
    if (line === '$#') {
      ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G28', 'G30'].forEach((name, i) => {
        const o = i < 6 ? g.offset(i + 1) : { x: 0, y: 0, z: 0 };
        c.runner.emit('parameters', { name, value: { x: f3(o.x), y: f3(o.y), z: f3(o.z) } });
      });
      c.runner.emit('parameters', { name: 'G92', value: { ...g.g92 } });
      c.runner.emit('parameters', { name: 'TLO', value: g.tlo });
      c.runner.emit('parameters', { name: 'PRB', value: { x: '0.000', y: '0.000', z: '0.000', result: 0 } });
      c.runner.emit('ok');
      return;
    }
    if (line === 'G0' || line === 'M5') {
      modal.motion = line === 'G0' ? 'G0' : modal.motion;
      done(line, { ok: true, prb: 0 });
      return;
    }
    if (g.lunyee) {
      if (/^G5[4-9]$/.test(line)) {
        // Only another system loads a stored offset; the active one again does nothing.
        if (line !== modal.wcs) {
          modal.wcs = line;
          reload();
        }
        done(line, { ok: true, prb: 0 });
        return;
      }
      if (/^M0*(2|30)$/.test(line)) {
        Object.assign(modal, { motion: 'G1', wcs: 'G54', distance: 'G90', spindle: 'M5', feedrate: 'G94' });
        reload();
        done(line, { ok: true, prb: 0 });
        return;
      }
      if (/^\$H[XYZ]?$/.test(line)) {
        // The whole cycle, whatever the axis letter; `ok` at its end (advance).
        g.active = 'Home';
        g.homeEnd = ctx.now + 1500;
        return;
      }
    }
    let m = /^G10 L(2|20) P(\d) (.+)$/.exec(line);
    if (m && (m[1] === '20' || g.lunyee)) {
      // P0: the active system.
      const p = Number(m[2]) || g.activeIndex();
      const o = g.offset(p);
      m[3].split(' ').forEach((word) => {
        const k = word[0].toLowerCase();
        o[k] = m[1] === '2' ? Number(word.slice(1)) : g.m[k] - Number(word.slice(1)) + g.writeSkew;
      });
      if (g.lunyee && p === g.activeIndex()) {
        reload();
      }
      // The next report carries WCO:.
      g.wcoCounter = 0;
      done(line, { ok: true, prb: 0 });
      return;
    }
    m = /^(G38\.3|G53 G1) /.exec(line);
    if (!m) {
      c.runner.emit('error', { message: '20' });
      return;
    }
    const probe = m[1] === 'G38.3';
    const { to, feed } = machineTarget(line);
    if (g.lunyee && outsideTravel(to)) {
      // Checked when the line is read: ALARM:2 before any move, then the board restarts.
      restart(2);
      return;
    }
    const from = { ...g.m };
    const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const motion = { line, probe, from, to, distance, t0: ctx.now, dur: Math.max(1, 60000 * distance / feed * SCALE), done: 0 };
    if (g.onStart) {
      g.onStart(line, motion);
    }
    modal.motion = probe ? 'G38.3' : 'G1';
    if (probe && touching(from)) {
      // Contact already there: ALARM:4, the line is not run.
      g.active = 'Alarm';
      c.runner.emit('alarm', { message: '4', raw: 'ALARM:4' });
      return;
    }
    g.current = motion;
    g.active = 'Run';
    if (!probe) {
      // Planned: Grbl answers at once, the move still to run.
      c.runner.emit('ok');
    }
  };
  const at = (cur, k) => ({
    x: cur.from.x + (cur.to.x - cur.from.x) * k,
    y: cur.from.y + (cur.to.y - cur.from.y) * k,
    z: cur.from.z + (cur.to.z - cur.from.z) * k
  });
  const progress = () => {
    const cur = g.current;
    if (ctx.now < cur.t0) {
      return;
    }
    const until = Math.min(1, (ctx.now - cur.t0) / cur.dur);
    const n = Math.max(1, Math.ceil(cur.distance * (until - cur.done) / 0.002));
    let k = cur.done;
    for (let i = 1; i <= n; i++) {
      const next = cur.done + (until - cur.done) * i / n;
      const p = at(cur, next);
      g.minTip = Math.min(g.minTip, p.z);
      if (inside(p)) {
        g.collisions.push({ line: cur.line, at: p });
      }
      if (cur.probe && touching(p)) {
        // Exact contact between the last free sample and this one.
        let lo = k;
        let hi = next;
        for (let j = 0; j < 40; j++) {
          const mid = (lo + hi) / 2;
          if (touching(at(cur, mid))) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        g.m = at(cur, hi);
        done(cur.line, { ok: true, prb: 1, result: 1, at: { ...g.m } });
        return;
      }
      k = next;
    }
    cur.done = until;
    g.m = at(cur, until);
    if (until >= 1) {
      g.m = { ...cur.to };
      done(cur.line, cur.probe ? { ok: true, prb: 1, result: 0, at: { ...g.m } } : { ok: false, prb: 0 });
    }
  };
  g.advance = () => {
    if (ctx.now - g.lastPoll >= 500) {
      g.lastPoll = ctx.now;
      g.refresh();
      c.runner.emit('parserstate', { modal: { ...modal } });
      c.runner.emit('ok');
    }
    if (g.active === 'Home') {
      if (ctx.now >= g.homeEnd) {
        g.m = { x: 0, y: 0, z: 0 };
        g.active = 'Idle';
        if (g.lunyee) {
          // WCO:0,0,0 reported at once while $# keeps the stored offset.
          g.offsetVoid = { executed: executedAfterHoming === 'zero', reported: true };
          g.wcoCounter = 0;
        }
        c.runner.emit('ok');
      }
      return;
    }
    if (g.active !== 'Idle' && g.active !== 'Run') {
      return;
    }
    // The next line is picked up (a stalled one stays in the planner).
    if (!g.current && g.queue.length && !g.stalled(g.queue[0]) && (g.active === 'Idle' || g.active === 'Run')) {
      begin(g.queue.shift());
    }
    if (g.current) {
      progress();
    }
  };
  g.refresh();
  return { c, g };
};

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };

const PROFILE = { thickness: 5, faceX: -9.9, faceY: -9.9, fast: 100, slow: 25, search: 10, retract: 2, clearance: 5, corner: '--', directionX: 1, directionY: 1 };
const XYZ = { axes: 'XYZ', wcs: 'G54', diameter: 6, profile: PROFILE };

const services = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose());
  jest.useRealTimers();
});

const setup = async ({ world = {}, homed = true, tested = true, enabled = true, workOffset = provenOffset } = {}) => {
  jest.useFakeTimers();
  const ctx = { now: 100000, history: [] };
  const { c, g } = fakeGrbl(ctx, world);
  Object.assign(ctx, { c, g });
  ctx.controllers = { TEST: c };
  ctx.control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  ctx.service = createService(
    { get: () => ctx.controllers },
    { get: (key) => ({ 'touch.motion.enabled': enabled, events: [], macros: [], 'touch.machines': [] }[key]) },
    () => ctx.now,
    { workOffset, control: ctx.control, history: { record: (event) => ctx.history.push(event) } }
  );
  services.push(ctx.service);
  ctx.state = () => ctx.service.list()[0];
  ctx.generation = ctx.state().generation;
  ctx.service.openTransport('tA', A);
  ctx.service.openTransport('tB', B);
  ctx.req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => ctx.service.action({
    port: 'TEST', generation: ctx.generation, transportId, action, ...extra
  }, actor);
  // Advances both clocks; the machine runs and reports every 50 ms (CNCjs polls).
  ctx.tick = async (ms) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      g.advance();
      if (!g.silent && !(g.silentUntil > ctx.now)) {
        g.report();
      }
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
  };
  ctx.until = async (test, max = 300000) => {
    for (let t = 0; t < max && !test(); t += 50) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.tick(50);
    }
    expect(test()).toBe(true);
  };
  await ctx.tick(600);
  if (homed) {
    const t = await ctx.req('prepare', { operation: 'home' });
    await ctx.req('home', { nonce: t.nonce });
    await ctx.tick(2000);
  }
  g.m = { ...g.start };
  await ctx.tick(200);
  if (tested) {
    ctx.contactTest = async () => {
      g.pinForced = true;
      await ctx.tick(100);
      g.pinForced = null;
      await ctx.tick(100);
    };
    await ctx.contactTest();
  }
  // Listeners the service keeps for itself (job-service and probe input).
  ctx.baseline = ['ok', 'parameters', 'startup', 'alarm', 'error', 'status'].map((e) => [e, c.runner.listenerCount(e)]);
  ctx.listeners = () => ['ok', 'parameters', 'startup', 'alarm', 'error', 'status'].map((e) => [e, c.runner.listenerCount(e)]);
  ctx.prepare = (body = XYZ, actor, transportId) => ctx.req('prepare', { operation: 'blockProbe', ...body }, actor, transportId);
  // Prepares and launches; resolves with { ok } or { err } once the cycle is over.
  ctx.launch = async (body = XYZ) => {
    const ticket = await ctx.prepare(body);
    ctx.ticket = ticket;
    ctx.outcome = null;
    ctx.req('blockProbe', { nonce: ticket.nonce }).then((ok) => {
      ctx.outcome = { ok };
    }, (err) => {
      ctx.outcome = { err };
    });
    await jest.advanceTimersByTimeAsync(0);
    return ticket;
  };
  ctx.finish = async () => {
    await ctx.until(() => ctx.outcome !== null);
    return ctx.outcome;
  };
  ctx.step = () => (ctx.state().blockProbe && ctx.state().blockProbe.step.code) || null;
  // After a failure: no G10, nothing more sent, lock released, no listener left behind.
  ctx.failedCleanly = async (code) => {
    const { err } = await ctx.finish();
    expect(err && err.code).toBe(code);
    const sent = ctx.g.sent.slice();
    await ctx.tick(1000);
    expect(ctx.g.sent).toEqual(sent);
    expect(sent.some((l) => /^G10/.test(l))).toBe(false);
    expect(ctx.state().probing).toBe(false);
    expect(ctx.state().blockProbe).toMatchObject({ state: 'failed', written: 'no', failure: { code } });
    expect(err.message).toMatch(/Origine de travail inchangée\./);
    expect(ctx.listeners()).toEqual(ctx.baseline);
    // G38.3 never stays the motion mode (a reset, or a G0 without a move at rest).
    expect(ctx.g.modal.motion).not.toBe('G38.3');
    // Never a line while another one is planned or running.
    expect(ctx.g.overlaps).toEqual([]);
    return err;
  };
  return ctx;
};

// The plan of the reference example (coin --, start machine 100, 100, -110).
const PLAN_XYZ = {
  axes: 'XYZ',
  wcs: 'G54',
  approach: 'outside',
  direction: { X: 1, Y: 1 },
  start: { x: 100, y: 100, z: -110 },
  search: 10,
  window: 8,
  lateral: 12,
  depth: 4,
  clearance: 5,
  toolRadius: 3,
  reach: 23.9,
  envelope: { X: [88, 109.9], Y: [88, 109.9], Z: [-125, -104] },
  feeds: { fast: 100, slow: 25, travelXY: 600, travelZ: 500 },
  steps: 22
};
const DONE_XYZ = {
  state: 'done',
  written: 'yes',
  step: { index: 22, total: 22, code: 'VERIFY' },
  contacts: { Z: -119.565, X: 93, Y: 92 },
  origin: { X: 105.9, Y: 104.9, Z: -124.565 },
  values: { X: 0, Y: 0, Z: 10 },
  command: 'G10 L20 P1 X0 Y0 Z10',
  work: { x: 0, y: 0, z: 10 },
  failure: null,
  needsHoming: false
};

const EXPECTED_XYZ = [
  '$#',
  'G38.3 Z-20 F100',
  'G53 G1 Z-117.565 F500',
  'G38.3 Z-20.565 F25',
  'G53 G1 Z-114.565 F500',
  'G38.3 X68 Y70 F600',
  'G38.3 Z-23.565 F100',
  'G38.3 X78 F100',
  'G53 G1 X91 F600',
  'G38.3 X74 F25',
  'G53 G1 X91 F600',
  'G53 G1 Z-114.565 F500',
  'G38.3 X80 Y58 F600',
  'G38.3 Z-23.565 F100',
  'G38.3 Y68 F100',
  'G53 G1 Y90 F600',
  'G38.3 Y63 F25',
  'G53 G1 Y90 F600',
  'G53 G1 Z-114.565 F500',
  'G38.3 X85.9 Y74.9 F600',
  'G0',
  'G10 L20 P1 X0 Y0 Z10'
];

describe('block probe: pure parts', () => {
  test('S4 compensation: the reference vectors shared with the page (probe-model.js compensate)', () => {
    expect(originOf({ axis: 'X', contact: 93, direction: 1, diameter: 6, face: -9.9 })).toBe(105.9);
    expect(originOf({ axis: 'X', contact: 113, direction: -1, diameter: 6, face: 9.9 })).toBe(100.1);
    expect(originOf({ axis: 'Y', contact: 92, direction: 1, diameter: 6, face: -9.9 })).toBe(104.9);
    expect(originOf({ axis: 'Y', contact: 200, direction: -1, diameter: 6, face: 9.9 })).toBe(187.1);
    expect(originOf({ axis: 'X', contact: 50, direction: -1, diameter: 3.175, face: 0 })).toBe(48.4125);
    expect(originOf({ axis: 'Z', contact: -119.565, thickness: 5 })).toBe(-124.565);
  });

  test('S18 server bounds of the profile, whatever the form says', () => {
    const codeOf = (body) => {
      try {
        blockParams(body);
        return null;
      } catch (err) {
        return [err.code, err.params, err.status];
      }
    };
    const xyz = (profile, extra = {}) => ({ ...XYZ, ...extra, profile: { ...PROFILE, ...profile } });
    expect(codeOf({ ...XYZ, axes: 'W' })).toEqual(['ETOUCH_PROBE_AXES', {}, 409]);
    expect(codeOf(xyz({ fast: 300 }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'fast', min: 10, max: 200 }, 409]);
    expect(codeOf(xyz({ search: 40 }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'search', min: 4, max: 30 }, 409]);
    expect(codeOf(xyz({ fast: 40, slow: 50 }))).toEqual(['ETOUCH_PROBE_SLOW_FAST', {}, 409]);
    expect(codeOf(xyz({ retract: 5, search: 5 }))).toEqual(['ETOUCH_PROBE_RETRACT', {}, 409]);
    expect(codeOf(xyz({ thickness: 2 }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'thickness', min: 3, max: 50 }, 409]);
    expect(codeOf({ ...XYZ, axes: 'Z', profile: { ...PROFILE, thickness: 2 } })).toBeNull();
    expect(codeOf(xyz({ fast: '100' }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'fast', min: 10, max: 200 }, 409]);
    expect(codeOf(xyz({ fast: Number.NaN }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'fast', min: 10, max: 200 }, 409]);
    expect(codeOf(xyz({ clearance: null }))).toEqual(['ETOUCH_PROBE_MISSING', { field: 'clearance' }, 409]);
    expect(codeOf(xyz({}, { diameter: null }))).toEqual(['ETOUCH_PROBE_MISSING', { field: 'diameter' }, 409]);
    expect(codeOf(xyz({ corner: 'x' }))).toEqual(['ETOUCH_PROBE_MISSING', { field: 'corner' }, 409]);
    expect(codeOf(xyz({ directionX: 0 }))).toEqual(['ETOUCH_PROBE_MISSING', { field: 'directionX' }, 409]);
    // Inside approach (the hole) is refused for XYZ; X alone may go either way.
    expect(codeOf(xyz({ directionX: -1 }))).toEqual(['ETOUCH_PROBE_APPROACH', {}, 409]);
    expect(codeOf({ axes: 'X', wcs: 'G54', diameter: 6, profile: { ...PROFILE, directionX: -1 } })).toBeNull();
    // 9.9 typed instead of −9.9: 19.8 mm off, refused.
    expect(codeOf(xyz({ faceX: 9.9 }))).toEqual(['ETOUCH_PROBE_FACE_SIGN', { axis: 'X' }, 409]);
    expect(codeOf(xyz({ faceY: 9.9 }))).toEqual(['ETOUCH_PROBE_FACE_SIGN', { axis: 'Y' }, 409]);
    expect(codeOf(xyz({ faceX: 31 }))).toEqual(['ETOUCH_PROBE_PARAM', { field: 'faceX', min: -30, max: 30 }, 409]);
    // Fields an operation does not use are ignored.
    expect(blockParams({ axes: 'Z', wcs: 'G55', profile: { ...PROFILE, faceX: 'n/a', corner: null } })).toMatchObject({ axes: 'Z', wcs: 'G55', faceX: null, corner: null, thickness: 5 });
    expect(codeOf({ ...XYZ, wcs: 'G53' })).toEqual(['ETOUCH_PROBE_MISSING', { field: 'wcs' }, 409]);
  });

  test('S31 plan: envelope, reach, feeds and travel (worst case, machine coordinates)', () => {
    const limits = { X: { low: 0, high: 408 }, Y: { low: 0, high: 396 }, Z: { low: -130, high: 0 } };
    const settings = { $110: 4000, $111: 4000, $112: 800 };
    const plan = blockPlan(blockParams(XYZ), { x: 100, y: 100, z: -110 }, limits, settings);
    expect(plan).toMatchObject(PLAN_XYZ);
    expect(plan.seconds).toBeLessThanOrEqual(180);
    expect(plan.timeoutMs).toBe(Math.min(240000, plan.seconds * 2000 + 30000));
    const wide = blockPlan(blockParams({ ...XYZ, profile: { ...PROFILE, faceX: -30, faceY: -30 } }), { x: 100, y: 100, z: -110 }, limits, settings);
    expect(wide.envelope.X).toEqual([88, 130]);
    expect(wide.reach).toBe(44);
    expect(() => blockParams({ ...XYZ, profile: { ...PROFILE, faceX: -31 } })).toThrow(/faceX hors des limites/);
    // A large block: the side step follows the search distance up to 30 mm (window 28 mm).
    const far = blockPlan(blockParams({ ...XYZ, profile: { ...PROFILE, search: 30 } }), { x: 100, y: 100, z: -90 }, limits, settings);
    expect(far).toMatchObject({ window: 28, lateral: 32 });
    expect(far.envelope.X).toEqual([68, 109.9]);
    // Z, X alone: only the moving axis in the envelope.
    expect(blockPlan(blockParams({ ...XYZ, axes: 'Z' }), { x: 100, y: 100, z: -110 }, limits, settings)).toMatchObject({ envelope: { Z: [-121, -110] }, steps: 7, direction: {}, reach: null, window: null });
    expect(blockPlan(blockParams({ ...XYZ, axes: 'X' }), { x: 90, y: 100, z: -122 }, limits, settings)).toMatchObject({ envelope: { X: [90, 101] }, direction: { X: 1 }, clearance: null });
    // S16 travel: 1 mm margin on each end.
    const travel = (start, body = XYZ) => {
      try {
        blockPlan(blockParams(body), start, limits, settings);
        return null;
      } catch (err) {
        return [err.code, err.params];
      }
    };
    expect(travel({ x: 13, y: 100, z: -110 })).toBeNull();
    expect(travel({ x: 12.9, y: 100, z: -110 })).toEqual(['ETOUCH_PROBE_TRAVEL', { axis: 'X', min: '0.9', max: '22.8', low: '0', high: '408' }]);
    expect(travel({ x: 100, y: 385.2, z: -110 })).toEqual(['ETOUCH_PROBE_TRAVEL', { axis: 'Y', min: '373.2', max: '395.1', low: '0', high: '396' }]);
    expect(travel({ x: 100, y: 100, z: -7 })).toBeNull();
    expect(travel({ x: 100, y: 100, z: -6 })).toEqual(['ETOUCH_PROBE_TRAVEL', { axis: 'Z', min: '-21', max: '0', low: '-130', high: '0' }]);
    // Feeds bounded by $11x.
    const here = { x: 100, y: 100, z: -110 };
    expect(() => blockPlan(blockParams(XYZ), here, limits, { ...settings, $112: 80 })).toThrow(/Vitesse 100 mm\/min supérieure au maximum de l’axe Z \(80 mm\/min\)/);
    const slower = { ...settings, $112: 300, $111: 450 };
    expect(blockPlan(blockParams(XYZ), here, limits, slower).feeds).toEqual({ fast: 100, slow: 25, travelXY: 450, travelZ: 300 });
    // Too long at low feeds.
    expect(travel({ x: 150, y: 150, z: -50 }, { ...XYZ, profile: { ...PROFILE, fast: 10, slow: 5, search: 30, clearance: 20 } })).toEqual(['ETOUCH_PROBE_TOO_SLOW', { seconds: expect.any(Number), max: 180 }]);
    expect(travel({ x: 150, y: 150, z: -50 }, { ...XYZ, profile: { ...PROFILE, search: 30, clearance: 20 } })).toBeNull();
  });
});

describe('XYZ probe travel at the machine edges', () => {
  const limits = { X: { low: 0, high: 408 }, Y: { low: 0, high: 396 }, Z: { low: -130, high: 0 } };
  const settings = { $110: 4000, $111: 4000, $112: 800 };

  test('T7: Y 15 fits the real path, while Y 12.5 still violates the 1 mm margin', () => {
    const plan = blockPlan(blockParams(XYZ), { x: 100, y: 15, z: -110 }, limits, settings);
    expect(plan.lateral).toBe(12);
    expect(plan.envelope.Y).toEqual([3, 24.9]);
    expect(plan.envelope.Y[0]).toBeGreaterThanOrEqual(1);
    expect(() => blockPlan(blockParams(XYZ), { x: 100, y: 12.5, z: -110 }, limits, settings)).toThrow(/hors de la course/);
  });

  test.each(['--', '+-', '-+', '++'])('corner %s mirrors the envelope and includes the slow search overshoot', (corner) => {
    const [cX, cY] = { '--': [-1, -1], '+-': [1, -1], '-+': [-1, 1], '++': [1, 1] }[corner];
    const profile = { ...PROFILE, corner, faceX: cX * 9.9, faceY: cY * 9.9, directionX: -cX, directionY: -cY, retract: 2 };
    const plan = blockPlan(blockParams({ ...XYZ, profile }), { x: 100, y: 100, z: -110 }, limits, settings);
    ['X', 'Y'].forEach((axis) => {
      expect(plan.envelope[axis]).toEqual(profile['direction' + axis] === 1 ? [88, 109.9] : [90.1, 112]);
    });
    // A small tool makes -L + search + 1 positive; a zero face alone cannot bound it.
    const short = blockPlan(blockParams({ ...XYZ, diameter: 0.5, profile: { ...profile, faceX: 0, faceY: 0, search: 4 } }),
      { x: 100, y: 100, z: -110 },
limits,
settings);
    ['X', 'Y'].forEach((axis) => {
      expect(short.envelope[axis]).toEqual(profile['direction' + axis] === 1 ? [96.75, 101.75] : [98.25, 103.25]);
    });
  });
});

describe('coded block probe refusals', () => {
  test('an ambiguous plan is coded with its axis, without an embedded French reason', () => {
    const limits = { X: { low: 0, high: 0, ambiguous: 'legacy detail' } };
    const err = (() => {
      try {
        blockPlan(blockParams(XYZ), { x: 0, y: 100, z: -110 }, limits, { $110: 4000, $111: 4000, $112: 800 });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toMatchObject({ status: 409, code: 'ETOUCH_PROBE_AMBIGUOUS', params: { axis: 'X' } });
    expectCatalogMatch(err);
  });

  test('unknown travel is coded before any line is sent', async () => {
    const ctx = await setup();
    delete ctx.c.settings.settings.$131;
    await ctx.tick(100);
    const err = await ctx.prepare().then(() => null, (e) => e);
    expect(err).toMatchObject({ code: 'ETOUCH_PROBE_TRAVEL_UNKNOWN', params: { axis: 'Y' } });
    expectCatalogMatch(err);
    expect(ctx.g.sent).toEqual([]);
    expect(ctx.state().refusals.blockProbe).toMatchObject({ code: err.code, params: err.params });
  });

  test('an unknown active system is null, and the catalog handles null alarm and system values', () => {
    const probe = createBlockProbe({ record: () => ({}), modalWcs: () => null });
    let err;
    try {
      probe.bind({}, { wcs: 'G54' });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'ETOUCH_PROBE_WCS', params: { wcs: 'G54', active: null } });
    expectCatalogMatch(err);
    expect(err.message).not.toMatch(/inconnu|\{active\}/);
    const alarm = refusal('ETOUCH_PROBE_ALARM', { alarm: null });
    expectCatalogMatch(alarm);
    expect(alarm.message).toBe('Alarme pendant le palpage.');
  });
});

describe('block probe: real cycle on a fake Grbl', () => {
  test('LUNYEE: T7 completes near Y 15 without collisions, overlaps or an ALARM:2 restart', async () => {
    const solid = block();
    const ctx = await setup({ world: { lunyee: true, start: { x: 100, y: 15, z: -110 }, solids: [{ ...solid, y0: solid.y0 - 85, y1: solid.y1 - 85 }] } });
    ctx.g.offsetVoid = null;
    ctx.g.wcoCounter = 0;
    await ctx.tick(600);
    await ctx.launch();
    const { ok, err } = await ctx.finish();
    expect(err).toBeUndefined();
    expect(ok.blockProbe).toMatchObject({ state: 'done', written: 'yes' });
    expect(ctx.g.collisions).toEqual([]);
    expect(ctx.g.overlaps).toEqual([]);
    expect(ctx.g.sent.filter((line) => /^G10/.test(line))).toHaveLength(1);
    expect(ctx.history.filter((entry) => entry.event === 'alarm')).toEqual([]);
    expect(ctx.state().homed).toBe(true);
  });

  test('S1 XYZ at the -- corner: the exact lines, one G10 last, the work position read back, nothing ever touched', async () => {
    const ctx = await setup();
    expect(ctx.state()).toMatchObject({ canBlockProbe: true, blockProbeReason: '', homed: true });
    const ticket = await ctx.launch();
    expect(ticket).toMatchObject({
      name: 'Palpage XYZ au bloc, repère G54',
      operation: 'blockProbe',
      expiresIn: 15,
      blockProbe: PLAN_XYZ
    });
    expect(ticket.blockProbe.timeoutMs).toBeUndefined();
    await ctx.until(() => ctx.step() === 'Z_FAST');
    expect(ctx.state()).toMatchObject({ probing: true, canPause: true, canStop: true, blockProbe: { state: 'running', step: { total: 22 } } });
    const { ok, err } = await ctx.finish();
    expect(err).toBeUndefined();
    expect(ctx.g.sent).toEqual(EXPECTED_XYZ);
    expect(ctx.g.overlaps).toEqual([]);
    expect(ok.message).toBe('Origine G54 réglée par palpage XYZ.');
    expect(ok.blockProbe).toMatchObject(DONE_XYZ);
    expect(ctx.g.collisions).toEqual([]);
    // The tip never went lower than 1 mm above the piece (block top − 5 mm).
    expect(ctx.g.minTip).toBeGreaterThanOrEqual(TOP - 5 + 1 - 1e-6);
    expect(ctx.state()).toMatchObject({ probing: false, canPause: false, homed: true, blockProbe: { state: 'done' } });
    expect(ctx.listeners()).toEqual(ctx.baseline);
    expect(ctx.history.filter((e) => e.event === 'probe')).toEqual([expect.objectContaining({ kind: 'block', result: 'set', command: 'G10 L20 P1 X0 Y0 Z10', actor: expect.objectContaining({ id: 'tablet-A' }) })]);
    // The same, in the modal state Grbl is left in: G0 G90 G21 G94.
    expect(ctx.g.modal).toMatchObject({ motion: 'G0', distance: 'G90', units: 'G21', feedrate: 'G94' });
  }, 30000);

  test.each([
    ['+-', { directionX: -1, directionY: 1, faceX: 9.9, faceY: -9.9 }],
    ['-+', { directionX: 1, directionY: -1, faceX: -9.9, faceY: 9.9 }],
    ['++', { directionX: -1, directionY: -1, faceX: 9.9, faceY: 9.9 }],
    ['--', { directionX: 1, directionY: 1, faceX: -9.9, faceY: -9.9 }]
  ])('S2 XYZ at the %s corner: descent points and origin of each corner', async (corner, signs) => {
    const ctx = await setup({ world: { solids: [block(corner)] } });
    const [cX, cY] = { '--': [-1, -1], '+-': [1, -1], '-+': [-1, 1], '++': [1, 1] }[corner];
    await ctx.launch({ ...XYZ, profile: { ...PROFILE, corner, ...signs } });
    const { ok } = await ctx.finish();
    // Descent points PX = (x0 − dX·L, y0), PY = (x0, y0 − dY·L), in work coordinates (offset 20, 30).
    expect(ctx.g.sent[5]).toBe('G38.3 X' + (100 + 12 * cX - 20) + ' Y70 F600');
    expect(ctx.g.sent[12]).toBe('G38.3 X80 Y' + (100 + 12 * cY - 30) + ' F600');
    expect(ok.blockProbe.contacts).toEqual({ Z: -119.565, X: 100 + 7 * cX, Y: 100 + 8 * cY });
    expect(ok.blockProbe.origin).toEqual({ X: round3(100 - 5.9 * cX), Y: round3(100 - 4.9 * cY), Z: -124.565 });
    expect(ok.blockProbe.work).toEqual({ x: 0, y: 0, z: 10 });
    expect(ctx.g.collisions).toEqual([]);
    expect(ctx.g.minTip).toBeGreaterThanOrEqual(TOP - 4 - 1e-6);
  }, 30000);

  test('S3 Z alone on G55 (P2), X alone and Y alone: only the probed axis is written; X / Y alone never move Z', async () => {
    const ctx = await setup();
    ctx.g.modal.wcs = 'G55';
    await ctx.tick(600);
    await ctx.launch({ axes: 'Z', wcs: 'G55', profile: PROFILE });
    let { ok } = await ctx.finish();
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G38.3 Z-20.565 F25', 'G53 G1 Z-114.565 F500', 'G0', 'G10 L20 P2 Z10']);
    expect(ok.blockProbe).toMatchObject({ values: { Z: 10 }, origin: { Z: -124.565 }, command: 'G10 L20 P2 Z10' });
    expect(ok.message).toBe('Origine G55 réglée par palpage Z.');
    // Only G55 changed: G54 and G56-G59 as they were.
    expect(ctx.g.others[2]).toEqual({ x: 20, y: 30, z: -124.565 });
    expect(ctx.g.wco).toEqual({ x: 20, y: 30, z: -100 });
    [3, 4, 5, 6].forEach((p) => expect(ctx.g.others[p]).toEqual({ x: 0, y: 0, z: 0 }));

    // X alone: beside the X face, at probing height (the operator placed it).
    ctx.g.modal.wcs = 'G54';
    ctx.g.wco = { x: 20, y: 30, z: -100 };
    ctx.g.m = { x: 90, y: 100, z: -122 };
    ctx.g.sent = [];
    await ctx.tick(600);
    await ctx.contactTest();
    await ctx.launch({ axes: 'X', wcs: 'G54', diameter: 6, profile: PROFILE });
    ({ ok } = await ctx.finish());
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 X80 F100', 'G53 G1 X91 F600', 'G38.3 X74 F25', 'G53 G1 X91 F600', 'G0', 'G10 L20 P1 X-14.9']);
    expect(ok.blockProbe).toMatchObject({ origin: { X: 105.9 }, values: { X: -14.9 }, work: { x: -14.9 } });

    // Y alone, approaching −Y (X/Y alone may go either way).
    ctx.g.solids = [{ x0: 70, x1: 130, y0: 70, y1: 110, top: TOP }];
    ctx.g.m = { x: 100, y: 120, z: -122 };
    ctx.g.sent = [];
    await ctx.tick(600);
    await ctx.contactTest();
    await ctx.launch({ axes: 'Y', wcs: 'G54', diameter: 6, profile: { ...PROFILE, directionY: -1, faceY: 9.9 } });
    ({ ok } = await ctx.finish());
    expect(ctx.g.sent.filter((l) => /Z/.test(l) && l !== '$#')).toEqual([]);
    expect(ok.blockProbe).toMatchObject({ contacts: { Y: 113 }, origin: { Y: 100.1 }, command: 'G10 L20 P1 Y' + round3(115 - 100.1) });
  }, 60000);

  test('S5 no contact within the search: clean failure, machine idle and still referenced, origin unchanged', async () => {
    const ctx = await setup({ world: { solids: [] } });
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const err = await ctx.failedCleanly('ETOUCH_PROBE_NO_CONTACT');
    expect(err.params).toEqual({ axis: 'Z', search: '10' });
    expect(err.message).toBe('Aucun contact en Z sur 10 mm : rapprochez l’outil et vérifiez la pince. Origine de travail inchangée.');
    expect(err.status).toBe(409);
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G0']);
    expect(ctx.g.realtime).toEqual([]);
    expect(ctx.state()).toMatchObject({ homed: true, activeState: 'Idle', blockProbe: { needsHoming: false } });
    // A failure asks for a new contact test before the next one (D7, S22).
    expect(ctx.state().blockProbeReason).toMatch(/Test du contact à faire/);
    await ctx.contactTest();
    expect(ctx.state().canBlockProbe).toBe(true);
  }, 30000);

  test('S6 contact already there: refused before any move; stuck after the retract: no second approach', async () => {
    const ctx = await setup();
    ctx.g.pinForced = true;
    await ctx.tick(100);
    expect(ctx.state().blockProbeReason).toBe('La sonde est déjà en contact : dégagez-la avant de palper.');
    await expect(ctx.prepare()).rejects.toThrow(/déjà en contact/);
    ctx.g.pinForced = null;
    await ctx.tick(100);
    ctx.g.onComplete = (line) => {
      if (/^G53 G1 Z/.test(line)) {
        ctx.g.pinForced = true;
      }
    };
    await ctx.launch();
    const err = await ctx.failedCleanly('ETOUCH_PROBE_STUCK');
    expect(err.message).toBe('La sonde reste en contact après le retrait de 2 mm en Z. Origine de travail inchangée.');
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G0']);
  }, 30000);

  test('S7 S8 a touch without its own PRB, or with two, is rejected', async () => {
    const ctx = await setup();
    ctx.g.onComplete = (line, info) => {
      if (/^G38/.test(line)) {
        info.prb = 0;
      }
    };
    await ctx.launch();
    await ctx.failedCleanly('ETOUCH_PROBE_PRB');
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G0']);

    await ctx.contactTest();
    ctx.g.m = { ...ctx.g.start };
    ctx.g.sent = [];
    ctx.g.onComplete = (line, info) => {
      if (/^G38/.test(line)) {
        info.prb = 2;
      }
    };
    await ctx.tick(200);
    await ctx.launch();
    await ctx.failedCleanly('ETOUCH_PROBE_PRB');
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G0']);
  }, 30000);

  test('S9 ALARM:4 then a late ok and Idle: the cycle ends at once and never goes on', async () => {
    const ctx = await setup();
    ctx.g.onStart = (line) => {
      if (line === 'G38.3 Z-20 F100') {
        ctx.g.pinForced = true;
      }
    };
    await ctx.launch();
    await ctx.until(() => ctx.g.active === 'Alarm');
    ctx.g.pinForced = null;
    // The late answers of the line.
    ctx.c.runner.emit('ok');
    ctx.g.active = 'Idle';
    await ctx.tick(300);
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_ALARM');
    expect(err.params).toEqual({ alarm: 'ALARM:4' });
    expect(err.message).toBe('Alarme ALARM:4 pendant le palpage. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.');
    await ctx.tick(1000);
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100']);
    expect(ctx.state()).toMatchObject({ probing: false, blockProbe: { needsHoming: true } });
  }, 30000);

  test('S10 Arrêter in the middle of a touch: feed hold, then reset; the lock holds until the reset is seen', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'X_FAST' && ctx.g.active === 'Run');
    const sent = ctx.g.sent.length;
    const res = await ctx.req('stop', {}, B, 'tB');
    expect(res.message).toBe('Palpage interrompu. Vérifiez l’immobilisation ; origine de travail inchangée.');
    expect(ctx.g.realtime).toEqual(['!']);
    // Between the feed hold and the reset: stopping, still locked.
    expect(ctx.state()).toMatchObject({ probing: true, blockProbe: { state: 'stopping', failure: { code: 'ETOUCH_PROBE_STOPPED' } } });
    expect(ctx.state().loadReason).toMatch(/Palpage en cours/);
    await expect(ctx.req('motion', { operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 500 })).rejects.toThrow(/Palpage en cours/);
    expect(() => ctx.service.reserveSystemCommand({ id: 'cmd', title: 'Éteindre', commands: 'sudo poweroff' })).toThrow(/Palpage en cours|commande système refusée/);
    const err = await ctx.failedCleanly('ETOUCH_PROBE_STOPPED');
    expect(ctx.g.realtime).toEqual(['!', '\x18']);
    expect(ctx.g.sent.length).toBe(sent);
    expect(err.message).toBe('Palpage interrompu par Arrêter. Origine de travail inchangée. Refaites la prise d’origine ($H) avant de recommencer.');
    expect(ctx.state()).toMatchObject({ homed: false, blockProbe: { needsHoming: true, contacts: { Z: -119.565 } } });
  }, 30000);

  test('S11 Arrêter right after a line is sent, the last report still Idle: a feed hold anyway', async () => {
    const ctx = await setup();
    let stopped = null;
    ctx.g.stalled = (line) => {
      if (line === 'G38.3 Z-20 F100' && stopped === null) {
        stopped = ctx.req('stop', {});
      }
      return false;
    };
    // The stop is requested when the machine picks the line up, still Idle in the last report.
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    await ctx.until(() => stopped !== null);
    await stopped;
    expect(ctx.g.realtime[0]).toBe('!');
    await ctx.failedCleanly('ETOUCH_PROBE_STOPPED');
    expect(ctx.g.realtime).toEqual(['!', '\x18']);
  }, 30000);

  test('S12 Pause during a block probe interrupts it (it cannot be resumed)', async () => {
    const ctx = await setup();
    expect(ctx.state().canPause).toBe(false);
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_SLOW' && ctx.g.active === 'Run');
    expect(ctx.state().canPause).toBe(true);
    const res = await ctx.req('pause', {});
    expect(res.message).toBe('Pause pendant un palpage : palpage interrompu, il ne se reprend pas. Origine de travail inchangée.');
    const err = await ctx.failedCleanly('ETOUCH_PROBE_PAUSED');
    expect(err.message).toMatch(/^Palpage interrompu par Pause : un palpage ne se reprend pas\. Origine de travail inchangée\./);
    expect(ctx.g.realtime).toEqual(['!', '\x18']);
  }, 30000);

  test('S13 the tablet stream closed stops the machine at once; renewed by the server, no line leaves until it is back', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_CLEAR');
    // Rotation of the stream by the server: closed, reopened by the same device 1 s later.
    expect(ctx.service.ticketPending('tA')).toBe(true);
    ctx.service.closeTransport('tA', true);
    const sent = ctx.g.sent.length;
    await ctx.tick(1000);
    // The line in flight ends; none follows while the device has no stream.
    expect(ctx.g.current).toBe(null);
    expect(ctx.g.sent.length).toBe(sent);
    expect(ctx.g.realtime).toEqual([]);
    ctx.service.openTransport('tA2', A);
    const { ok } = await ctx.finish();
    expect(ok.blockProbe.state).toBe('done');
    expect(ctx.g.sent).toEqual(EXPECTED_XYZ);
    expect(ctx.g.realtime).toEqual([]);

    // Renewed but never reopened: stopped after 3 s, before any new line (no G10).
    ctx.req = ((req) => (action, extra = {}, actor = A, transportId = 'tA2') => req(action, extra, actor, transportId))(ctx.req);
    const again = async () => {
      await ctx.contactTest();
      ctx.g.m = { ...ctx.g.start };
      ctx.g.wco = { x: 20, y: 30, z: -100 };
      ctx.g.sent = [];
      ctx.g.realtime = [];
      await ctx.tick(200);
    };
    await again();
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    await ctx.until(() => ctx.step() === 'Z_CLEAR');
    ctx.service.closeTransport('tA2', true);
    await ctx.tick(3200);
    let err = await ctx.failedCleanly('ETOUCH_PROBE_STREAM');
    // No line at all without the stream, not even the G0 of a clean failure.
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G38.3 Z-20.565 F25', 'G53 G1 Z-114.565 F500']);
    expect(err.message).toBe('Suivi de la tablette perdu pendant le palpage : mouvement arrêté. Origine de travail inchangée.');

    // Closed (the tablet gone, not a renewal): feed hold at once, in the middle of a touch.
    ctx.service.openTransport('tA2', A);
    await again();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    ctx.service.closeTransport('tA2');
    expect(ctx.g.realtime).toEqual(['!']);
    expect(ctx.state().blockProbe).toMatchObject({ state: 'stopping', failure: { code: 'ETOUCH_PROBE_STREAM' } });
    err = await ctx.failedCleanly('ETOUCH_PROBE_STREAM');
    expect(ctx.g.realtime).toEqual(['!', '\x18']);
    expect(err.message).toMatch(/Refaites la prise d’origine/);
  }, 60000);

  test('S14 reports interrupted for 2.5 s: hardware stop', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    ctx.g.silent = true;
    await ctx.tick(2700);
    expect(ctx.g.realtime[0]).toBe('!');
    ctx.g.silent = false;
    await ctx.failedCleanly('ETOUCH_PROBE_STALE');
    expect(ctx.state().blockProbe.needsHoming).toBe(true);
  }, 30000);

  test('S15 control taken by another device stops it; a launch bound to another device\'s stream is refused', async () => {
    const ctx = await setup();
    await expect(ctx.prepare(XYZ, A, 'tB')).rejects.toMatchObject({ code: 'ETOUCH_PROBE_PILOT', message: 'Pilotage requis : cet appareil doit piloter la machine pour palper. Touchez Pilote dans le bandeau.' });
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    await ctx.req('control', { operation: 'takeover', reason: 'test' }, B, 'tB');
    await ctx.tick(200);
    expect(ctx.g.realtime[0]).toBe('!');
    await ctx.failedCleanly('ETOUCH_PROBE_CONTROL');
  }, 30000);

  test('S16 out of travel: refused at prepare, nothing sent', async () => {
    const ctx = await setup({ world: { start: { x: 12.5, y: 100, z: -110 } } });
    await expect(ctx.prepare()).rejects.toMatchObject({
      code: 'ETOUCH_PROBE_TRAVEL', params: { axis: 'X', min: '0.5', max: '22.4', low: '0', high: '408' }
    });
    ctx.g.m = { x: 100, y: 100, z: -5 };
    await ctx.tick(100);
    await expect(ctx.prepare()).rejects.toMatchObject({ code: 'ETOUCH_PROBE_TRAVEL', params: { axis: 'Z', low: '-130', high: '0' } });
    expect(ctx.g.sent).toEqual([]);
  }, 30000);

  test('S17 machine guards: not referenced, $11x unknown, M3 with FS 0, G93, M6 pause, real moves disabled', async () => {
    let ctx = await setup({ homed: false });
    expect(ctx.state().blockProbeReason).toBe('Machine non référencée : faites la prise d’origine ($H) avant de palper.');
    await expect(ctx.prepare()).rejects.toThrow(/non référencée/);
    services.splice(0).forEach((service) => service.dispose());

    ctx = await setup();
    const reason = async (change) => {
      change();
      await ctx.tick(600);
      return ctx.state().blockProbeReason;
    };
    ctx.g.modal.spindle = 'M3';
    expect(await reason(() => {})).toBe('La broche est commandée (M3 ou M4) : arrêtez-la d’abord (M5).');
    await expect(ctx.prepare()).rejects.toThrow(/broche est commandée/);
    ctx.g.modal.spindle = 'M5';
    ctx.g.spindle = 1200;
    expect(await reason(() => {})).toMatch(/La broche tourne encore/);
    ctx.g.spindle = 0;
    ctx.g.modal.feedrate = 'G93';
    expect(await reason(() => {})).toBe('Mode d’avance en temps inverse (G93) actif : le palpage exige G94.');
    ctx.g.modal.feedrate = 'G94';
    const settings = ctx.c.settings.settings;
    delete settings.$111;
    expect(await reason(() => {})).toBe('Vitesse maximale des axes ($110 à $112) inconnue : relisez les réglages de la carte.');
    settings.$111 = '4000';
    expect(await reason(() => {
      ctx.c.workflow.state = 'paused';
      ctx.c.sender.state = { ...ctx.c.sender.state, hold: true, holdReason: { data: 'M6' } };
    })).toBe('Palpage au bloc : machine au repos uniquement, sans programme en cours ni en pause.');
    ctx.c.workflow.state = 'idle';
    ctx.c.sender.state = { name: '', context: {}, total: 0 };
    expect(await reason(() => {})).toBe('');
    services.splice(0).forEach((service) => service.dispose());

    ctx = await setup({ enabled: false });
    expect(ctx.state().blockProbeReason).toMatch(/Déplacements réels non activés/);
  }, 60000);

  test('S19 machine moved or offset changed between the confirmation and the launch: refused, nothing sent', async () => {
    const ctx = await setup();
    let ticket = await ctx.prepare();
    ctx.g.m.x += 0.05;
    await ctx.tick(100);
    await expect(ctx.req('blockProbe', { nonce: ticket.nonce })).rejects.toThrow('La machine a bougé depuis la confirmation : confirmez à nouveau à la position actuelle.');
    ctx.g.m.x -= 0.05;
    await ctx.tick(100);
    ticket = await ctx.prepare();
    ctx.g.modal.wcs = 'G55';
    await ctx.tick(600);
    await expect(ctx.req('blockProbe', { nonce: ticket.nonce })).rejects.toMatchObject({ code: 'ETOUCH_PROBE_WCS', params: { wcs: 'G54', active: 'G55' } });
    await expect(ctx.prepare()).rejects.toMatchObject({ code: 'ETOUCH_PROBE_WCS', message: 'Le repère choisi (G54) n’est pas le repère actif (G55) : sélectionnez le repère actif.' });
    expect(ctx.g.sent).toEqual([]);
    expect(ctx.state().probing).toBe(false);
  }, 30000);

  test('S20 contact during a supervised descent: stopped, nothing more', async () => {
    // A clamp, conductive, where the tool comes down beside the X face.
    const ctx = await setup({ world: { solids: [block(), { x0: 86, x1: 87, y0: 99, y1: 101, top: TOP + 2 }] } });
    await ctx.launch();
    const err = await ctx.failedCleanly('ETOUCH_PROBE_DESCENT_CONTACT');
    expect(err.params).toEqual({ axis: 'X' });
    expect(ctx.g.sent.slice(-2)).toEqual(['G38.3 Z-23.565 F100', 'G0']);
    expect(ctx.g.collisions).toEqual([]);
  }, 30000);

  test('S28 obstacle on a linking move, or the start outside the block: stopped by the supervised traverse', async () => {
    const ctx = await setup({ world: { solids: [block(), { x0: 92, x1: 93, y0: 99, y1: 101, top: -100 }] } });
    await ctx.launch();
    const err = await ctx.failedCleanly('ETOUCH_PROBE_TRAVERSE_CONTACT');
    expect(err.message).toMatch(/^Contact pendant un déplacement de liaison/);
    expect(ctx.g.sent.slice(-2)).toEqual(['G38.3 X68 Y70 F600', 'G0']);
    expect(ctx.g.collisions).toEqual([]);
  }, 30000);

  test('S21 G92 or a tool length offset in $#: refused before any move', async () => {
    const ctx = await setup();
    ctx.g.g92 = { x: '0.000', y: '0.000', z: '1.500' };
    await ctx.launch();
    const err = await ctx.failedCleanly('ETOUCH_PROBE_G92');
    expect(err.message).toBe('Décalage temporaire G92 actif : annulez-le (G92.1) avant de palper. Origine de travail inchangée.');
    expect(ctx.g.sent).toEqual(['$#']);
    await ctx.contactTest();
    ctx.g.g92 = { x: '0.000', y: '0.000', z: '0.000' };
    ctx.g.tlo = '2.000';
    ctx.g.sent = [];
    await ctx.launch();
    await ctx.failedCleanly('ETOUCH_PROBE_TLO');
    expect(ctx.g.sent).toEqual(['$#']);
  }, 30000);

  test('S22 contact test: missing, too old', async () => {
    const ctx = await setup({ tested: false });
    expect(ctx.state().blockProbeReason).toBe('Test du contact à faire : touchez l’outil avec le bloc puis relâchez (contact vu, puis libre) avant de palper.');
    expect(ctx.state().probeInput.test).toEqual({ done: false, ageMs: null, stage: 'free' });
    ctx.g.pinForced = true;
    await ctx.tick(100);
    ctx.g.pinForced = null;
    await ctx.tick(100);
    expect(ctx.state()).toMatchObject({ canBlockProbe: true, probeInput: { test: { done: true } } });
    ctx.now += 600001;
    await ctx.tick(600);
    expect(ctx.state().blockProbeReason).toMatch(/Test du contact à faire/);
  }, 30000);

  test('S23 the G10 executed but its ok lost: written uncertain, never sent again', async () => {
    const ctx = await setup();
    ctx.g.onComplete = (line, info) => {
      if (/^G10/.test(line)) {
        info.ok = false;
      }
    };
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_WRITE_UNCERTAIN');
    expect(err.message).toMatch(/^Écriture de l’origine sans confirmation\. Le repère a peut-être changé : vérifiez-le avant tout travail\./);
    await ctx.tick(1000);
    expect(ctx.g.sent.filter((l) => /^G10/.test(l))).toEqual(['G10 L20 P1 Z10']);
    expect(ctx.state()).toMatchObject({ probing: false, blockProbe: { state: 'failed', written: 'uncertain' } });
  }, 60000);

  test('S24 board restart: no further line, even with the ok already counted and the last state Idle; none before WRITE', async () => {
    const ctx = await setup();
    ctx.g.onComplete = (line, info) => {
      if (line === 'G53 G1 Z-117.565 F500') {
        // ok emitted, then the banner, the last report still Idle.
        info.ok = false;
        ctx.c.runner.emit('ok');
        ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
      }
    };
    await ctx.launch();
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_RESTART');
    await ctx.tick(1000);
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500']);
    expect(ctx.g.realtime).toEqual([]);

    // Just before WRITE (the last move of a Z probe).
    services.splice(0).forEach((service) => service.dispose());
    const fresh = await setup();
    fresh.g.onComplete = (line, info) => {
      if (line === 'G53 G1 Z-114.565 F500') {
        info.ok = false;
        fresh.c.runner.emit('ok');
        fresh.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1f' });
      }
    };
    await fresh.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const out = await fresh.finish();
    expect(out.err.code).toBe('ETOUCH_PROBE_RESTART');
    await fresh.tick(1000);
    expect(fresh.g.sent.some((l) => l === 'G0' || /^G10/.test(l))).toBe(false);
  }, 60000);

  test('S25 global time limit: reports keep coming but the cycle is too long: hardware stop', async () => {
    const ctx = await setup();
    // Every move starts 14.7 s late (real speed), each line within its own limit (search or move at its feed + 15 s).
    ctx.g.onStart = (line, motion) => {
      motion.dur /= SCALE;
      motion.t0 += 14700;
    };
    const ticket = await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    expect(ticket.blockProbe.seconds).toBe(20);
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_TIMEOUT');
    // Stopped by the 70 s limit of the cycle, during its last move.
    expect(ctx.g.sent.slice(-1)).toEqual(['G53 G1 Z-114.565 F500']);
    expect(ctx.g.realtime[0]).toBe('!');
    expect(ctx.g.sent.some((l) => /^G10/.test(l))).toBe(false);
  }, 60000);

  test('S26 the service disposed during a touch: one feed hold, rejection, nothing else, no listener left', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    const sent = ctx.g.sent.slice();
    ctx.service.dispose();
    await jest.advanceTimersByTimeAsync(500);
    expect(ctx.outcome && ctx.outcome.err && ctx.outcome.err.code).toBe('ETOUCH_PROBE_LOST');
    expect(ctx.g.realtime).toEqual(['!']);
    for (let i = 0; i < 20; i++) {
      ctx.now += 50;
      ctx.g.advance();
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50);
    }
    expect(ctx.g.sent).toEqual(sent);
    expect(ctx.g.realtime).toEqual(['!']);
    ['ok', 'parameters', 'startup', 'alarm', 'error', 'status'].forEach((e) => expect([e, ctx.c.runner.listenerCount(e)]).toEqual([e, 0]));
  }, 30000);

  test('S27 during the cycle: load, macro, jog, system command, zero Z and a second probe refused; the stream is not rotated', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST');
    const state = ctx.state();
    expect(state).toMatchObject({ probing: true, canBlockProbe: false, blockProbeReason: 'Palpage en cours.', canZeroZ: false });
    expect(state.loadReason).toMatch(/Palpage en cours/);
    expect(state.macroReason).toMatch(/Palpage en cours/);
    expect(state.motion.jogReason).toMatch(/Palpage en cours/);
    expect(ctx.service.ticketPending('tA')).toBe(true);
    expect(ctx.service.ticketPending('tB')).toBe(false);
    const commands = ctx.c.commands.slice();
    await expect(ctx.req('load', { file: 'piece.nc' })).rejects.toThrow('Palpage en cours.');
    await expect(ctx.req('prepare', { operation: 'macro', macroId: 'test' })).rejects.toThrow('Palpage en cours.');
    await expect(ctx.req('motion', { operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 100 })).rejects.toThrow('Palpage en cours.');
    expect(() => ctx.service.reserveSystemCommand({ id: 'test', title: 'test', commands: [] })).toThrow(/Palpage en cours/);
    expect(ctx.c.commands).toEqual(commands);
    await expect(ctx.prepare()).rejects.toThrow('Palpage en cours.');
    await expect(ctx.req('prepare', { operation: 'zeroZ', thickness: 5, search: 10 })).rejects.toThrow('Palpage en cours.');
    const { ok } = await ctx.finish();
    expect(ok.blockProbe.state).toBe('done');
    expect(ctx.service.ticketPending('tA')).toBe(false);
  }, 30000);

  test('S30 the two touches differ by more than 0.3 mm: rejected; by 0.25 mm: accepted (the slow one counts)', async () => {
    const ctx = await setup();
    const shift = (mm) => {
      let first = true;
      ctx.g.onComplete = (line) => {
        if (first && line === 'G38.3 Z-20 F100') {
          first = false;
          ctx.g.solids = ctx.g.solids.map((b) => ({ ...b, top: b.top - mm }));
        }
      };
    };
    shift(0.5);
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const err = await ctx.failedCleanly('ETOUCH_PROBE_MISMATCH');
    expect(err.params).toEqual({ axis: 'Z', delta: '0.5' });
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G38.3 Z-20.565 F25', 'G0']);

    ctx.g.solids = [block()];
    ctx.g.m = { ...ctx.g.start };
    ctx.g.sent = [];
    await ctx.tick(200);
    await ctx.contactTest();
    shift(0.25);
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const { ok } = await ctx.finish();
    expect(ok.blockProbe.contacts).toEqual({ Z: -119.815 });
    expect(ok.blockProbe.origin).toEqual({ Z: -124.815 });
  }, 30000);

  test('S32 start closer than 0.2 mm to the surface: refused after the first touch, no second one', async () => {
    const ctx = await setup({ world: { start: { x: 100, y: 100, z: TOP + 0.1 } } });
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: { ...PROFILE, search: 5 } });
    const err = await ctx.failedCleanly('ETOUCH_PROBE_START_CLOSE');
    expect(err.params).toEqual({ axis: 'Z' });
    expect(ctx.g.sent.filter((l) => /^G38/.test(l))).toHaveLength(1);
  }, 30000);

  test('S33 a move that does not end at its target, a line Grbl refuses, unreadable $#: stopped, no G10', async () => {
    const ctx = await setup();
    ctx.g.onComplete = (line) => {
      if (line === 'G53 G1 Z-117.565 F500') {
        ctx.g.m.z += 0.05;
      }
    };
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    let err = await ctx.failedCleanly('ETOUCH_PROBE_POSITION');
    expect(err.params).toEqual({ axis: 'Z' });

    // error:20 on the retract: the line never ran, the machine is at rest: no feed hold, no reset, no $H needed.
    ctx.g.onComplete = null;
    ctx.g.m = { ...ctx.g.start };
    ctx.g.sent = [];
    await ctx.tick(200);
    await ctx.contactTest();
    ctx.g.rejects = (line) => line === 'G53 G1 Z-117.565 F500';
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    err = await ctx.failedCleanly('ETOUCH_PROBE_ERROR');
    expect(err.message).toMatch(/^Grbl a refusé une ligne du palpage \(error:20\)\. Origine de travail inchangée\.$/);
    expect(ctx.g.realtime).toEqual([]);
    expect(ctx.state()).toMatchObject({ homed: true, blockProbe: { needsHoming: false } });
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G0']);

    // $# without TLO: nothing moves.
    ctx.g.rejects = () => false;
    ctx.g.m = { ...ctx.g.start };
    ctx.g.sent = [];
    ctx.g.tlo = undefined;
    await ctx.tick(200);
    await ctx.contactTest();
    await ctx.launch();
    await ctx.failedCleanly('ETOUCH_PROBE_PARAMETERS');
    expect(ctx.g.sent).toEqual(['$#']);
  }, 30000);

  test('S34 the origin read back differs from the one written: failure, written uncertain, said on screen', async () => {
    const ctx = await setup();
    ctx.g.writeSkew = 0.2;
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_WRITE');
    expect(err.params).toEqual({ axis: 'Z', value: '9.8', expected: '10' });
    expect(err.message).toBe('L’origine écrite ne se relit pas comme attendu (Z 9.8 au lieu de 10). Le repère a peut-être changé : vérifiez-le avant tout travail.');
    expect(ctx.state().blockProbe).toMatchObject({ state: 'failed', written: 'uncertain' });
    expect(ctx.g.sent.filter((l) => /^G10/.test(l))).toEqual(['G10 L20 P1 Z10']);
  }, 30000);

  test('S35 contact before a supervised descent (mid-cycle), ALARM:5 on the X touch, no contact in Y after Z and X: stopped, no G10', async () => {
    let ctx = await setup();
    ctx.g.onComplete = (line) => {
      if (line === 'G38.3 X68 Y70 F600') {
        ctx.g.pinForced = true;
      }
    };
    await ctx.launch();
    let err = await ctx.failedCleanly('ETOUCH_PROBE_CONTACT_AT_START');
    expect(err.params).toEqual({ axis: 'Z' });
    expect(ctx.g.sent.slice(-2)).toEqual(['G38.3 X68 Y70 F600', 'G0']);
    services.splice(0).forEach((service) => service.dispose());

    ctx = await setup();
    ctx.g.onComplete = (line, info) => {
      if (line === 'G38.3 X78 F100') {
        info.alarm = true;
        ctx.g.active = 'Alarm';
        ctx.c.runner.emit('alarm', { message: '5', raw: 'ALARM:5' });
      }
    };
    await ctx.launch();
    ({ err } = await ctx.finish());
    expect(err).toMatchObject({ code: 'ETOUCH_PROBE_ALARM', params: { alarm: 'ALARM:5' } });
    await ctx.tick(1000);
    expect(ctx.g.sent.slice(-1)).toEqual(['G38.3 X78 F100']);
    expect(ctx.state()).toMatchObject({ probing: false, blockProbe: { state: 'failed', written: 'no' } });
    services.splice(0).forEach((service) => service.dispose());

    // Y finds nothing after Z and X succeeded.
    ctx = await setup();
    let lifts = 0;
    ctx.g.onComplete = (line) => {
      if (line === 'G53 G1 Z-114.565 F500' && ++lifts === 2) {
        ctx.g.solids = [];
      }
    };
    await ctx.launch();
    err = await ctx.failedCleanly('ETOUCH_PROBE_NO_CONTACT');
    expect(err.params).toEqual({ axis: 'Y', search: '10' });
    expect(ctx.state().blockProbe.contacts).toEqual({ Z: -119.565, X: 93 });
  }, 60000);

  test('S36 the slow touch finds nothing: the message gives its own distance (retract + 1 mm)', async () => {
    const ctx = await setup();
    ctx.g.onComplete = (line) => {
      if (line === 'G38.3 Z-20 F100') {
        ctx.g.solids = [];
      }
    };
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const err = await ctx.failedCleanly('ETOUCH_PROBE_NO_CONTACT');
    expect(err.params).toEqual({ axis: 'Z', search: '3' });
  }, 30000);

  test('S37 XYZ started beside the hole of the block: the hole wall is not taken for the outer face, no G10', async () => {
    // Block 80-130 × 80-130 with a hole; the tool starts on its rim (a corner of solid at 100.5, 100.5):
    // the Z touch hits the rim, both descents fall into the hole, X touches the hole wall.
    const solids = [
      { x0: 80, x1: 84, y0: 80, y1: 130 },
      { x0: 104, x1: 130, y0: 80, y1: 130 },
      { x0: 84, x1: 104, y0: 80, y1: 84 },
      { x0: 84, x1: 104, y0: 104, y1: 130 },
      { x0: 100.5, x1: 104, y0: 100.5, y1: 104 }
    ].map((b) => ({ ...b, top: TOP }));
    const ctx = await setup({ world: { solids } });
    await ctx.launch();
    const err = await ctx.failedCleanly('ETOUCH_PROBE_WINDOW');
    expect(err.params).toEqual({ axis: 'X', window: '8' });
    expect(ctx.state().blockProbe.contacts).toMatchObject({ Z: -119.565 });
    expect(ctx.g.collisions).toEqual([]);
  }, 30000);

  test('S38 a retract answered ok once planned, the reports late: no line leaves before two newer reports at rest', async () => {
    const ctx = await setup();
    let paused = false;
    let intercepted = false;
    const emit = ctx.c.runner.emit.bind(ctx.c.runner);
    ctx.c.runner.emit = (event, ...args) => {
      if (paused && !intercepted && event === 'ok') {
        intercepted = true;
        return true;
      }
      return emit(event, ...args);
    };
    ctx.g.onStart = (line) => {
      if (!intercepted && /^G53 G1/.test(line)) {
        paused = true;
        ctx.g.silent = true;
        // No automatic status or parser poll during the manual ok / Idle / Idle sequence.
        ctx.g.lastPoll = Infinity;
      }
    };
    await ctx.launch();
    await ctx.until(() => intercepted && ctx.g.active === 'Idle');
    const sent = ctx.g.sent.slice();
    expect(sent).toEqual(EXPECTED_XYZ.slice(0, 3));
    // Even two Idle reports before the ok cannot release the retract.
    ctx.g.report();
    ctx.g.report();
    await ctx.tick(100);
    expect(ctx.g.sent).toEqual(sent);
    emit('ok');
    await ctx.tick(100);
    expect(ctx.g.sent).toEqual(sent);
    ctx.g.report();
    await ctx.tick(100);
    expect(ctx.g.sent).toEqual(sent);
    ctx.g.report();
    await ctx.tick(100);
    expect(ctx.g.sent).toEqual(EXPECTED_XYZ.slice(0, 4));
    ctx.g.silent = false;
    ctx.g.lastPoll = ctx.now;
    const { ok, err } = await ctx.finish();
    expect(err).toBeUndefined();
    expect(ok.blockProbe.state).toBe('done');
    expect(ctx.g.sent).toEqual(EXPECTED_XYZ);
    expect(ctx.g.overlaps).toEqual([]);
  }, 30000);

  test('S39 Arrêter, the reset not taken: the lock holds (stopping) past 7 s until a report at rest proves the stop', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'X_RETRACT' && ctx.g.active === 'Run');
    ctx.g.ignoreReset = true;
    await ctx.req('stop', {});
    await ctx.tick(10000);
    expect(ctx.g.realtime).toEqual(expect.arrayContaining(['!', '\x18']));
    expect(ctx.outcome).toBe(null);
    expect(ctx.state()).toMatchObject({ probing: true, blockProbe: { state: 'stopping', failure: { code: 'ETOUCH_PROBE_STOPPED' } } });
    // At rest (the hold released to Idle by the board).
    ctx.g.current = null;
    ctx.g.queue = [];
    ctx.g.active = 'Idle';
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_STOPPED');
    expect(ctx.state()).toMatchObject({ probing: false, blockProbe: { state: 'failed', needsHoming: true } });
  }, 60000);

  test('S40 control taken the moment a line ends: the next line is not sent', async () => {
    const ctx = await setup();
    // Taken in the same instant the cycle announces its next line (between the
    // end of the retract and the slow touch), before any supervisor tick.
    let taken = false;
    ctx.service.subscribe(() => {
      const b = ctx.service.list()[0].blockProbe;
      if (!taken && b && b.step.code === 'Z_SLOW') {
        taken = true;
        ctx.control.takeover('TEST', B, 'test');
      }
    });
    await ctx.launch();
    await ctx.failedCleanly('ETOUCH_PROBE_CONTROL');
    expect(taken).toBe(true);
    expect(ctx.g.realtime).toEqual([]);
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500', 'G0']);
  }, 30000);

  test('S43 a report in Alarm without its ALARM:n line, between two lines: no further line', async () => {
    const ctx = await setup();
    let set = false;
    ctx.service.subscribe(() => {
      const b = ctx.service.list()[0].blockProbe;
      if (!set && b && b.step.code === 'Z_SLOW') {
        set = true;
        ctx.g.active = 'Alarm';
        ctx.g.refresh();
      }
    });
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const { err } = await ctx.finish();
    expect(set).toBe(true);
    expect(err.code).toBe('ETOUCH_PROBE_ALARM');
    expect(err.params).toEqual({ alarm: null });
    expectCatalogMatch({ code: err.code, params: err.params, message: 'Alarme pendant le palpage.' });
    await ctx.tick(1000);
    expect(ctx.g.sent).toEqual(['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500']);
  }, 30000);

  test('S49 C-09 a socket stop at rest between two lines (retract over, slow touch announced): no line leaves afterwards', async () => {
    const ctx = await setup();
    // CNCjs's Stop on the PC (index.js refuseSocket calls socketStop before the command goes its
    // way), in the same instant the cycle announces its next line, before any supervisor tick.
    let stopped = null;
    ctx.service.subscribe(() => {
      const b = ctx.service.list()[0].blockProbe;
      if (!stopped && b && b.step.code === 'Z_SLOW') {
        stopped = { sent: ctx.g.sent.slice(), active: ctx.g.active };
        ctx.service.socketStop('TEST');
      }
    });
    await ctx.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    const { err } = await ctx.finish();
    expect(stopped).toEqual({ sent: ['$#', 'G38.3 Z-20 F100', 'G53 G1 Z-117.565 F500'], active: 'Idle' });
    expect(err.code).toBe('ETOUCH_PROBE_STOPPED');
    await ctx.tick(1000);
    // Nothing was moving: no hold, only the G0 that keeps G38.3 from staying the motion mode.
    expect(ctx.g.sent).toEqual(stopped.sent.concat(['G0']));
    expect(ctx.state().probing).toBe(false);
  }, 30000);

  test('S50 C-12 the lease released during the cycle: stopped in the same step, a socket command that is not safe refused until the stop is proven', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    expect(ctx.service.socketRefusal('TEST')).toMatchObject({ message: 'Palpage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).' });
    await ctx.req('control', { operation: 'release' });
    // Before any supervisor tick: the feed hold is out, `M3 S1000` from the PC would be refused.
    expect(ctx.g.realtime).toEqual(['!']);
    expect(ctx.state().blockProbe).toMatchObject({ state: 'stopping', failure: { code: 'ETOUCH_PROBE_CONTROL' } });
    expect(ctx.service.socketRefusal('TEST')).not.toBeNull();
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_CONTROL');
    expect(ctx.service.socketRefusal('TEST')).toBeNull();
  }, 30000);

  test('S41 the page and the server agree: the page request, the confirmation note, progress, result and failure texts', async () => {
    const ctx = await setup();
    const body = real.request(PROFILE, 'XYZ', 6, 'G54');
    expect(body).toEqual(XYZ);
    const pilot = { state: 'self', name: 'Tablette A' };
    const ready = () => real.launchState({
      machine: ctx.state(), connected: true, pilot, profile: PROFILE, operation: 'XYZ', diameter: 6, wcs: 'G54', pending: false, validate: () => []
    });
    expect(ready()).toEqual({ ready: true, reason: '' });
    const ticket = await ctx.launch(body);
    expect(real.dialogNote(ticket.blockProbe)).toBe('Centre de l’outil au-dessus du bloc, à 8 mm au plus en retrait des deux faces. L’outil palpe Z, sort de 12 mm de chaque côté, descend de 4 mm sous le dessus du bloc, palpe X puis Y et revient au-dessus du coin de la pièce. Rien ne doit dépasser le dessus du bloc à moins de 23.9 mm du point de départ. Jamais au bord du trou du bloc. Zéro Z = contact − 5 mm (épaisseur du bloc). Zéro X = contact + 12.9 mm (rayon 3 vers X+, face −9.9). Zéro Y = contact + 12.9 mm (rayon 3 vers Y+, face −9.9). Origine G54 écrite seulement à la fin.');
    await ctx.until(() => ctx.step() === 'X_SLOW');
    expect(real.cycle(ctx.state())).toBe(true);
    expect(ready()).toEqual({ ready: false, reason: '' });
    expect(real.summary(ctx.state().blockProbe)).toEqual({ phase: 'Étape 10 / 22 · X · touche lente', message: 'Palpage en cours. Arrêter interrompt.' });
    await ctx.finish();
    const done = ctx.state().blockProbe;
    expect(real.summary(done)).toEqual({ phase: 'Palpage XYZ terminé', message: 'Origine G54 écrite. Position de travail : X 0.000 · Y 0.000 · Z 10.000.' });
    expect(real.resultLines(done)).toEqual([
      'X · contact machine 93.000 · zéro machine 105.900 · valeur écrite 0.000',
      'Y · contact machine 92.000 · zéro machine 104.900 · valeur écrite 0.000',
      'Z · contact machine -119.565 · zéro machine -124.565 · valeur écrite 10.000',
      'Ligne envoyée : G10 L20 P1 X0 Y0 Z10',
      'Position de travail relue : X 0.000 · Y 0.000 · Z 10.000'
    ]);
    // X alone: the note gives the compensation that will be written, a wrong face sign shows in it.
    ctx.g.m = { x: 90, y: 100, z: -122 };
    await ctx.tick(200);
    await ctx.contactTest();
    const x = await ctx.prepare(real.request(PROFILE, 'X', 6, 'G54'));
    expect(real.dialogNote(x.blockProbe)).toBe('Recherche de 10 mm au plus vers X+, sans mouvement en Z. Zéro X = contact + 12.9 mm (rayon 3 vers X+, face −9.9). Origine G54 écrite seulement à la fin.');
    const wrong = await ctx.prepare(real.request({ ...PROFILE, faceX: 9.9 }, 'X', 6, 'G54'));
    expect(real.dialogNote(wrong.blockProbe)).toMatch(/Zéro X = contact − 6\.9 mm \(rayon 3 vers X\+, face 9\.9\)/);
    // A failure: the page shows the server's own words (without a catalog, its message).
    ctx.g.solids = [];
    await ctx.launch(real.request(PROFILE, 'X', 6, 'G54'));
    const { err } = await ctx.finish();
    expect(err.code).toBe('ETOUCH_PROBE_NO_CONTACT');
    expect(real.summary(ctx.state().blockProbe)).toEqual({ phase: 'Palpage interrompu', message: err.message });
    // A refusal of the profile: without a catalog, the server's message.
    await ctx.contactTest();
    const refused = await ctx.prepare(real.request({ ...PROFILE, fast: 300 }, 'Z', null, 'G54')).catch((e) => e);
    expect(refused.code).toBe('ETOUCH_PROBE_PARAM');
    expect(real.refusalText({ code: refused.code, params: refused.params, message: refused.message })).toBe(refused.message);
  }, 60000);

  test('S42 the page catalog carries every server code with the same French template and the same placeholders in English and Spanish', () => {
    const rows = catalog();
    const holes = (text) => (String(text).match(/\{\w+\}/g) || []).sort();
    Object.keys(MESSAGES).forEach((code) => {
      expect([code, rows[code] && rows[code][1]]).toEqual([code, MESSAGES[code]]);
      expect([code, holes(rows[code][2]), holes(rows[code][3])]).toEqual([code, holes(MESSAGES[code]), holes(MESSAGES[code])]);
    });
  });

  test('S29 spindle stop during a touch or during WRITE: no M5 in the queue, the same hardware stop; at rest M5 as before', async () => {
    const ctx = await setup();
    await ctx.launch();
    await ctx.until(() => ctx.step() === 'Z_FAST' && ctx.g.active === 'Run');
    const res = await ctx.req('spindleStop', {}, B, 'tB');
    expect(res.message).toBe('Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée. Origine de travail inchangée.');
    await ctx.failedCleanly('ETOUCH_PROBE_STOPPED');
    expect(ctx.g.sent).not.toContain('M5');
    expect(ctx.g.realtime).toEqual(['!', '\x18']);

    // During WRITE: the G10 sent, not answered yet.
    services.splice(0).forEach((service) => service.dispose());
    const fresh = await setup();
    let write = false;
    fresh.g.stalled = (line) => {
      write = write || /^G10/.test(line);
      return write;
    };
    await fresh.launch({ axes: 'Z', wcs: 'G54', profile: PROFILE });
    await fresh.until(() => write);
    const during = await fresh.req('spindleStop', {});
    expect(during.message).toBe('Arrêt broche pendant un palpage : palpage interrompu, carte réinitialisée ; l’origine a peut-être été écrite : vérifiez-la avant tout travail.');
    const { err } = await fresh.finish();
    expect(err.code).toBe('ETOUCH_PROBE_STOPPED');
    expect(err.message).toMatch(/Le repère a peut-être changé : vérifiez-le avant tout travail\./);
    expect(fresh.state().blockProbe.written).toBe('uncertain');
    expect(fresh.g.sent).not.toContain('M5');

    // At rest, outside any probe: M5 as before.
    services.splice(0).forEach((service) => service.dispose());
    const rest = await setup();
    await rest.req('spindleStop', {});
    expect(rest.g.sent).toEqual(['M5']);
  }, 60000);
});

describe('block probe: the LUNYEE options of the fake Grbl (PLAN-CORRECTIONS § 2.2)', () => {
  const ZERO = { x: 0, y: 0, z: 0 };
  // What CNCjs and the board would see: the WCO: of each report, the machine target of each
  // move, the answers to $#, the alarms and the banners.
  const watch = (ctx) => {
    const seen = { wco: [], starts: [], params: {}, events: [] };
    ctx.c.runner.on('status', (p) => {
      if (p.wco) {
        seen.wco.push([p.wco.x, p.wco.y, p.wco.z].map(Number));
      }
    });
    ctx.c.runner.on('parameters', (p) => {
      seen.params[p.name] = p.value;
    });
    ctx.c.runner.on('alarm', (a) => seen.events.push('ALARM:' + a.message));
    ctx.c.runner.on('startup', () => seen.events.push('startup'));
    ctx.g.onStart = (line, motion) => seen.starts.push({ line, to: { ...motion.to } });
    return seen;
  };
  const send = (ctx, line) => ctx.c.command('gcode', line);
  const atRest = (ctx) => ctx.g.active === 'Idle' && !ctx.g.current && ctx.g.queue.length === 0;

  test('S44 WCO:0,0,0 after the homing while $# keeps G54, the moves use a zero offset; G55 then G54 loads it again; $HX homes again', async () => {
    const ctx = await setup({ world: { lunyee: true }, tested: false });
    const seen = watch(ctx);
    // Twenty reports: WCO: in two of them, zero.
    await ctx.tick(1000);
    expect(seen.wco).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(ctx.c.runner.state.status.wpos).toEqual(ctx.c.runner.state.status.mpos);
    send(ctx, '$#');
    await ctx.tick(100);
    expect(seen.params.G54).toEqual({ x: '20.000', y: '30.000', z: '-100.000' });
    // G54 again changes nothing: a work target is a machine target.
    send(ctx, 'G54');
    send(ctx, 'G38.3 Z-105 F100');
    await ctx.until(() => atRest(ctx));
    expect(seen.starts.at(-1).to.z).toBe(-105);
    // Another system, then G54: the stored offset is loaded, reported at the next report.
    send(ctx, 'G55');
    send(ctx, 'G54');
    await ctx.tick(100);
    expect(seen.wco.at(-1)).toEqual([20, 30, -100]);
    send(ctx, 'G38.3 Z-8 F100');
    await ctx.until(() => atRest(ctx));
    expect(seen.starts.at(-1).to.z).toBe(-108);
    expect(Number(ctx.c.runner.state.status.wpos.z)).toBeCloseTo(-8, 3);
    // $HX: the whole cycle, then WCO:0,0,0 again.
    send(ctx, '$HX');
    await ctx.tick(200);
    expect(ctx.g.active).toBe('Home');
    await ctx.tick(1500);
    expect(ctx.g.active).toBe('Idle');
    expect(ctx.g.m).toEqual(ZERO);
    expect(seen.wco.at(-1)).toEqual([0, 0, 0]);

    // executedAfterHoming 'stored': WCO:0,0,0 reported, the moves keep G54.
    services.splice(0).forEach((service) => service.dispose());
    const stored = await setup({ world: { lunyee: true, executedAfterHoming: 'stored' }, tested: false });
    const storedSeen = watch(stored);
    await stored.tick(1000);
    expect(storedSeen.wco).toEqual([[0, 0, 0], [0, 0, 0]]);
    send(stored, 'G38.3 Z-8 F100');
    await stored.until(() => atRest(stored));
    expect(storedSeen.starts.at(-1).to.z).toBe(-108);

    // probeStuck: the contact stays whatever the contact test hook says.
    const stuck = fakeGrbl({ now: 0 }, { lunyee: true, probeStuck: true });
    const raws = [];
    stuck.c.runner.on('status', (p) => raws.push(p.raw));
    stuck.g.pinForced = false;
    stuck.g.report();
    expect(raws[0]).toMatch(/\|Pn:P/);
  }, 60000);

  test('S45 a target outside the soft limits: ALARM:2 when the line is read, nothing moves, the board restarts at MPos 0', async () => {
    const ctx = await setup({ world: { lunyee: true }, tested: false });
    const seen = watch(ctx);
    // 0.1 mm before the refused band (Z -129.8 with $132=130): it runs.
    send(ctx, 'G53 G1 Z-129.7 F500');
    await ctx.until(() => atRest(ctx));
    expect(ctx.g.m.z).toBeCloseTo(-129.7, 3);
    expect(seen.events).toEqual([]);
    // The executed offset is zero after the homing: work Z -131 is machine Z -131.
    send(ctx, 'G38.3 Z-131 F100');
    await ctx.tick(100);
    expect(seen.events).toEqual(['ALARM:2', 'startup']);
    expect(ctx.g.minTip).toBeCloseTo(-129.7, 3);
    expect(ctx.g.m).toEqual(ZERO);
    expect(ctx.g.active).toBe('Alarm');
    expect(ctx.state().homed).toBe(false);
    expect(ctx.state().lastAlarm).toMatchObject({ code: 2, at: expect.any(Number), restarted: true });
    expect(ctx.history.filter((entry) => entry.event === 'alarm')).toEqual([expect.objectContaining({ code: 2 })]);
    // The stored offset is loaded by the restart.
    await ctx.tick(600);
    expect(seen.wco.at(-1)).toEqual([20, 30, -100]);

    // In the band: refused as well.
    services.splice(0).forEach((service) => service.dispose());
    const band = await setup({ world: { lunyee: true }, tested: false });
    const bandSeen = watch(band);
    send(band, 'G53 G1 Z-129.9 F500');
    await band.tick(100);
    expect(bandSeen.events).toEqual(['ALARM:2', 'startup']);
    expect(bandSeen.starts).toEqual([]);
    expect(band.g.m).toEqual(ZERO);
  }, 60000);

  test('S46 a reset in motion: ALARM:3, the board restarts at MPos 0, not homed; at rest the position stays', async () => {
    const ctx = await setup({ world: { lunyee: true }, tested: false });
    const seen = watch(ctx);
    send(ctx, 'G53 G1 X150 F600');
    await ctx.tick(200);
    expect(ctx.g.active).toBe('Run');
    expect(ctx.g.m.x).toBeGreaterThan(100);
    ctx.c.command('reset');
    expect(seen.events).toEqual(['ALARM:3', 'startup']);
    expect(ctx.g.m).toEqual(ZERO);
    expect(ctx.g.active).toBe('Alarm');
    await ctx.tick(100);
    expect(ctx.state().homed).toBe(false);

    services.splice(0).forEach((service) => service.dispose());
    const rest = await setup({ world: { lunyee: true }, tested: false });
    const restSeen = watch(rest);
    rest.c.command('reset');
    expect(restSeen.events).toEqual(['startup']);
    expect(rest.g.m).toEqual({ x: 100, y: 100, z: -110 });
    await rest.tick(100);
    expect(restSeen.wco.at(-1)).toEqual([20, 30, -100]);
  }, 60000);

  // C-03 (A1-7 = A4-1), converted from the proof test bughunt-A1-7: the work offset taken as
  // proven by D2 (provenOffset), so that the block probe's own check at CHECK is what stops it.
  test('S47 WCO:0 after the homing while $# keeps G54: stopped at CHECK, before any G38.3, origin unchanged; once loaded again, the probe runs', async () => {
    const refused = async (executedAfterHoming) => {
      services.splice(0).forEach((service) => service.dispose());
      const ctx = await setup({ world: { lunyee: true, executedAfterHoming } });
      expect(ctx.state()).toMatchObject({ homed: true, canBlockProbe: true, workOffset: { state: 'proven' } });
      await ctx.launch({ axes: 'Z', wcs: 'G54', diameter: 6, profile: PROFILE });
      await ctx.failedCleanly('ETOUCH_PROBE_OFFSET');
      // Only `$#`: no G38.3 (its work target would be 100 mm off if the board applies G54).
      expect(ctx.g.sent).toEqual(['$#']);
      const { err } = ctx.outcome;
      expect(err.params).toEqual({ axis: 'X', stored: '20', reported: '0' });
      expect(err.message).toBe('La carte n’applique pas l’origine enregistrée en X (20 mm enregistré, 0 mm appliqué) : palpage annulé avant tout mouvement. Origine de travail inchangée.');
      expect(ctx.history.filter((e) => e.event === 'probe')).toEqual([expect.objectContaining({ result: 'failed', code: 'ETOUCH_PROBE_OFFSET', written: 'no' })]);
    };
    // Both hypotheses of the offset executed after the homing (FIRMWARE.md E-B).
    await refused('zero');
    await refused('stored');
    // G55 then G54 (what D2 sends): the stored offset applied and reported, the probe goes on.
    services.splice(0).forEach((service) => service.dispose());
    const loaded = await setup({ world: { lunyee: true } });
    send(loaded, 'G55');
    send(loaded, 'G54');
    await loaded.tick(200);
    await loaded.launch({ axes: 'Z', wcs: 'G54', diameter: 6, profile: PROFILE });
    const { ok } = await loaded.finish();
    expect(ok.blockProbe).toMatchObject({ state: 'done', written: 'yes' });
    expect(loaded.g.sent.filter((l) => /^(\$#|G38\.3|G10)/.test(l)).map((l) => l.split(' ')[0])).toEqual(['$#', 'G38.3', 'G38.3', 'G10']);
    expect(loaded.g.collisions).toEqual([]);
  }, 60000);

  // D2: the G10 written at the end loads the offset again; it is proven anew. A failure before
  // WRITE wrote nothing: the proof holds.
  test('S48 the work offset is invalidated after the G10 of the cycle, not after a failure that wrote nothing', async () => {
    const causes = [];
    const spy = () => ({ ...provenOffset(), invalidate: (cause) => causes.push(cause) });
    const ctx = await setup({ workOffset: spy });
    causes.splice(0);
    await ctx.launch({ axes: 'Z', wcs: 'G54', diameter: 6, profile: PROFILE });
    const { ok } = await ctx.finish();
    expect(ok.blockProbe).toMatchObject({ state: 'done', written: 'yes' });
    expect(causes).toEqual(['zero']);
    services.splice(0).forEach((service) => service.dispose());
    causes.splice(0);
    const none = await setup({ workOffset: spy, world: { solids: [] } });
    causes.splice(0);
    await none.launch({ axes: 'Z', wcs: 'G54', diameter: 6, profile: PROFILE });
    await none.failedCleanly('ETOUCH_PROBE_NO_CONTACT');
    expect(causes).toEqual([]);
  }, 60000);
});
