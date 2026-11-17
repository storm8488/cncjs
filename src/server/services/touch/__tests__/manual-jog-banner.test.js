/* eslint-env jest */
/* eslint-disable no-await-in-loop */ // the cases of a table run one after the other on purpose
// Lot F1, third safety review: the manual moves (a step, a continuous jog) behave exactly as before
// the lot (db584555), a banner of the board included. The framing alone ends for good at a banner
// (cnc-frame.test.js); a step or a continuous jog keeps its automatic stop: 0x85 when its keepalive,
// its stream or its lease is lost, repeated while Jog is reported, unconfirmed after 5 s.
//
// EXPECTED was recorded by running this very file on the sources of db584555 (touch/index.js,
// job-service.js, machine-profile.js, motion.js of that commit; RECORD=<file> writes the table).
// Fake controller only: nothing here touches a serial port.
import fs from 'fs';
import { EventEmitter } from 'events';
import { createService } from '../job-service';
import { createControl } from '../control';
import { provenOffset } from './support/proven-offset';

const fakeController = () => {
  const c = {
    type: 'Grbl',
    options: { port: 'TEST' },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: {
      status: {
        activeState: 'Idle',
        spindle: 0,
        mpos: { x: '-100.000', y: '-100.000', z: '-10.000' },
        wpos: { x: '5.000', y: '5.000', z: '2.000' }
      }
    },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: {
      version: '1.1h',
      settings: { $10: '1', $13: '0', $22: '1', $23: '0', $110: '1000', $111: '1000', $112: '500', $130: '400', $131: '400', $132: '80' }
    },
    written: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    if (name === 'gcode') {
      [].concat(args[0]).forEach((line) => c.written.push(line));
    }
    if (name === 'jogCancel') {
      c.written.push('0x85');
    }
  };
  return c;
};

const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'op' };
const B = { kind: 'touch', id: 'tablet-B', label: 'Tablette B', user: 'op' };
const MOVES = {
  step: { operation: 'jog', axis: 'X', direction: 1, step: 10, feed: 100 },
  continuous: { operation: 'jog-start', axis: 'X', direction: 1, feed: 500 }
};
// Before the event: no banner; a banner then Jog still reported (a $J run by the restarted board);
// a banner then Idle; a stop asked before the banner, then the banner while Jog is reported.
const CONTEXTS = ['none', 'banner', 'banner-idle', 'cancel-then-banner'];
const EVENTS = ['keepalive-lost', 'stream-closed', 'stream-rotated', 'lease-taken', 'lease-released', 'stale', 'jog-stop', 'stop-button',
  'socket-stop', 'dispose', 'alarm', 'disabled'];

afterEach(() => {
  jest.useRealTimers();
});

// The motion fields of the snapshot, short: J a continuous jog, C cancelling, U cancel unconfirmed,
// K canJog, then the last jog's result/reason/unconfirmed.
const short = (m) => {
  if (!m) {
    return 'disposed';
  }
  const last = m.lastJog ? [m.lastJog.result, m.lastJog.reason, m.lastJog.unconfirmed ? 'U' : ''].join('/') : '-';
  return [m.jog ? 'J' : '', m.cancelling ? 'C' : '', m.cancelUnconfirmed ? 'U' : '', m.canJog ? 'K' : '', ' ', last].join('');
};

// One scenario: the move, its context, the event; then 8 s of fresh Jog reports and 3 s at rest.
// Returns { refused, lines, cancels: [first, count, last] (ms after the start), snaps: ['ms:state', …] }.
const scenario = async (what, context, event) => {
  jest.useFakeTimers();
  const ctx = { now: 10000, enabled: true, c: fakeController() };
  const control = createControl({ now: () => ctx.now, elapsed: () => ctx.now });
  const service = createService({ get: () => ({ TEST: ctx.c }) },
    { get: (key) => ({ 'touch.motion.enabled': ctx.enabled, events: [], macros: [] }[key]) },
() => ctx.now,
    { workOffset: provenOffset, control, history: { record: () => {} } });
  const generation = service.list()[0].generation;
  service.openTransport('tA', A);
  service.openTransport('tB', B);
  const report = () => ctx.c.runner.emit('status');
  const req = (action, extra = {}, actor = A, transportId = actor === B ? 'tB' : 'tA') => service.action({
    port: 'TEST', generation, transportId, action, ...extra
  }, actor);
  report();
  ctx.c.state.status.activeState = 'Home';
  report();
  ctx.c.state.status.activeState = 'Idle';
  report();
  const t0 = ctx.now;
  const cancels = [];
  const lines = [];
  const snaps = [];
  let seen = 0;
  let last = '';
  let reports = true;
  let jogId = null;
  const record = () => {
    ctx.c.written.slice(seen).forEach((b) => (b === '0x85' ? cancels.push(ctx.now - t0) : lines.push(b)));
    seen = ctx.c.written.length;
    let m = null;
    try {
      m = service.list()[0].motion;
    } catch (_) {
      m = null;
    }
    const now = short(m);
    if (now !== last) {
      snaps.push((ctx.now - t0) + ':' + now);
      last = now;
    }
  };
  const tick = (ms, keepalive = false) => {
    for (let t = 0; t < ms; t += 50) {
      ctx.now += 50;
      if (reports) {
        report();
      }
      if (keepalive && t % 250 === 0) {
        req('motion', { operation: 'jog-keepalive', jogId }).catch(() => {});
      }
      jest.advanceTimersByTime(50);
      record();
    }
  };
  const res = await req('motion', MOVES[what]);
  jogId = res.jogId;
  record();
  ctx.c.state.status.activeState = 'Jog';
  tick(300, what === 'continuous');
  if (context === 'banner' || context === 'banner-idle') {
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    record();
    if (context === 'banner-idle') {
      ctx.c.state.status.activeState = 'Idle';
    }
    tick(300, what === 'continuous');
  } else if (context === 'cancel-then-banner') {
    await req('motion', { operation: 'jog-stop' });
    record();
    tick(300);
    ctx.c.runner.emit('startup', { firmware: 'Grbl', version: '1.1h' });
    record();
  }
  const acts = {
    'keepalive-lost': () => {},
    'stream-closed': () => service.closeTransport('tA'),
    'stream-rotated': () => service.closeTransport('tA', true),
    'lease-taken': () => req('control', { operation: 'takeover', reason: 'At the machine' }, B),
    'lease-released': () => req('control', { operation: 'release' }, A),
    stale: () => {
      reports = false;
    },
    'jog-stop': () => req('motion', { operation: 'jog-stop' }),
    'stop-button': () => req('stop', {}, B),
    'socket-stop': () => service.socketStop('TEST'),
    dispose: () => service.dispose(),
    alarm: () => {
      ctx.c.state.status.activeState = 'Alarm';
    },
    disabled: () => {
      ctx.enabled = false;
    }
  };
  // A refusal of the event itself (Arrêter with no job, a lease already free…) is part of the result.
  let refused = '';
  try {
    await acts[event]();
  } catch (err) {
    refused = err.message;
  }
  record();
  if (event === 'stale') {
    tick(3000);
    reports = true;
  }
  tick(8000);
  ctx.c.state.status.activeState = 'Idle';
  tick(3000);
  if (event !== 'dispose') {
    service.dispose();
  }
  record();
  return { refused, lines, cancels: cancels.length ? [cancels[0], cancels.length, cancels[cancels.length - 1]] : [], snaps };
};

// The case of the third review, spelled out: a continuous jog, a banner, then fresh Jog reports (a
// $J run by the restarted board) and no keepalive for six seconds.
test('a continuous jog, a banner, Jog still reported, the keepalive lost: 0x85 repeated, unconfirmed after 5 s, until the machine is at rest', async () => {
  const got = await scenario('continuous', 'banner', 'keepalive-lost');
  const [first, count, last] = got.cancels;
  // The keepalive deadline (250 ms) passes 300 ms after the banner: the cancel follows at once.
  expect(first).toBe(900);
  expect(count).toBeGreaterThan(30);
  expect(last).toBeGreaterThan(first + 7000);
  expect(got.snaps).toEqual(expect.arrayContaining([
    expect.stringMatching(/^\d+:C cancelled\/keepalive\/$/),
    expect.stringMatching(/^\d+:CU cancelled\/keepalive\/U$/)
  ]));
});

const EXPECTED = {
  'step / none / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [11300, 1, 11300],
    snaps: ['0: -', '11300:disposed']
  },
  'step / none / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [350, 41, 11300],
    snaps: ['0: -', '350:C cancelled/transport/', '5400:CU cancelled/transport/U', '11300:disposed']
  },
  'step / none / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [350, 41, 11300],
    snaps: ['0: -', '350:C cancelled/transport/', '5400:CU cancelled/transport/U', '11300:disposed']
  },
  'step / none / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [350, 41, 11300],
    snaps: ['0: -', '350:C cancelled/control/', '5400:CU cancelled/control/U', '11300:disposed']
  },
  'step / none / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [11300, 1, 11300],
    snaps: ['0: -', '11300:disposed']
  },
  'step / none / stale': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [2850, 42, 14300],
    snaps: ['0: -', '2850:C cancelled/stale/', '7900:CU cancelled/stale/U', '14300:disposed']
  },
  'step / none / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 11300],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '11300:disposed']
  },
  'step / none / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 11300],
    snaps: ['0: -', '300:C cancelled/stop/', '5350:CU cancelled/stop/U', '11300:disposed']
  },
  'step / none / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [11300, 1, 11300],
    snaps: ['0: -', '11300:disposed']
  },
  'step / none / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 1, 300],
    snaps: ['0: -', '300:disposed']
  },
  'step / none / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [11300, 1, 11300],
    snaps: ['0: -', '11300:disposed']
  },
  'step / none / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [350, 41, 11300],
    snaps: ['0: -', '350:C cancelled/disabled/', '5400:CU cancelled/disabled/U', '11300:disposed']
  },
  'step / banner / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '8650:K -', '11600:disposed']
  },
  'step / banner / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [650, 40, 8450],
    snaps: ['0: -', '650:C cancelled/transport/', '5700:CU cancelled/transport/U', '8650:K cancelled/transport/U', '11600:disposed']
  },
  'step / banner / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [650, 40, 8450],
    snaps: ['0: -', '650:C cancelled/transport/', '5700:CU cancelled/transport/U', '8650:K cancelled/transport/U', '11600:disposed']
  },
  'step / banner / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [650, 40, 8450],
    snaps: ['0: -', '650:C cancelled/control/', '5700:CU cancelled/control/U', '8650:K cancelled/control/U', '11600:disposed']
  },
  'step / banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '8650:K -', '11600:disposed']
  },
  'step / banner / stale': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [3150, 41, 11450],
    snaps: ['0: -', '3150:C cancelled/stale/', '8200:CU cancelled/stale/U', '11650:K cancelled/stale/U', '14600:disposed']
  },
  'step / banner / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [600, 41, 8600],
    snaps: ['0: -', '600:C cancelled/operator/', '5650:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / banner / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [600, 41, 8600],
    snaps: ['0: -', '600:C cancelled/stop/', '5650:CU cancelled/stop/U', '8650:K cancelled/stop/U', '11600:disposed']
  },
  'step / banner / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '8650:K -', '11600:disposed']
  },
  'step / banner / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [600, 1, 600],
    snaps: ['0: -', '600:disposed']
  },
  'step / banner / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '8650:K -', '11600:disposed']
  },
  'step / banner / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [650, 40, 8450],
    snaps: ['0: -', '650:C cancelled/disabled/', '5700:CU cancelled/disabled/U', '8650: cancelled/disabled/U', '11600:disposed']
  },
  'step / banner-idle / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / stale': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '3150: -', '3650:K -', '14600:disposed']
  },
  'step / banner-idle / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / stop-button': {
    refused: 'Aucun travail à arrêter.',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '11600:disposed']
  },
  'step / banner-idle / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '600:disposed']
  },
  'step / banner-idle / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '600: -', '8650:K -', '11600:disposed']
  },
  'step / banner-idle / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [],
    snaps: ['0: -', '400:K -', '600: -', '11600:disposed']
  },
  'step / cancel-then-banner / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / stale': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 43, 11450],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '11650:K cancelled/operator/U', '14600:disposed']
  },
  'step / cancel-then-banner / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 43, 8600],
    snaps: ['0: -', '300:C cancelled/operator/', '5650:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 43, 8600],
    snaps: ['0: -', '300:C cancelled/operator/', '600:C cancelled/stop/', '5650:CU cancelled/stop/U', '8650:K cancelled/stop/U', '11600:disposed']
  },
  'step / cancel-then-banner / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'step / cancel-then-banner / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 3, 600],
    snaps: ['0: -', '300:C cancelled/operator/', '600:disposed']
  },
  'step / cancel-then-banner / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 2, 500],
    snaps: ['0: -', '300:C cancelled/operator/', '700: cancelled/operator/', '8650:K cancelled/operator/', '11600:disposed']
  },
  'step / cancel-then-banner / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 8500],
    snaps: ['0: -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650: cancelled/operator/U', '11600:disposed']
  },
  'continuous / none / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 40, 11300],
    snaps: ['0:J -', '600:C cancelled/keepalive/', '5650:CU cancelled/keepalive/U', '11300:disposed']
  },
  'continuous / none / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 11300],
    snaps: ['0:J -', '300:C cancelled/transport/', '5350:CU cancelled/transport/U', '11300:disposed']
  },
  'continuous / none / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 11300],
    snaps: ['0:J -', '300:C cancelled/transport/', '5350:CU cancelled/transport/U', '11300:disposed']
  },
  'continuous / none / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [350, 41, 11300],
    snaps: ['0:J -', '350:C cancelled/control/', '5400:CU cancelled/control/U', '11300:disposed']
  },
  'continuous / none / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 40, 11300],
    snaps: ['0:J -', '600:C cancelled/keepalive/', '5650:CU cancelled/keepalive/U', '11300:disposed']
  },
  'continuous / none / stale': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 42, 14300],
    snaps: ['0:J -', '600:C cancelled/keepalive/', '5650:CU cancelled/keepalive/U', '14300:disposed']
  },
  'continuous / none / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 11300],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '11300:disposed']
  },
  'continuous / none / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 11300],
    snaps: ['0:J -', '300:C cancelled/stop/', '5350:CU cancelled/stop/U', '11300:disposed']
  },
  'continuous / none / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 40, 11300],
    snaps: ['0:J -', '600:C cancelled/keepalive/', '5650:CU cancelled/keepalive/U', '11300:disposed']
  },
  'continuous / none / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 1, 300],
    snaps: ['0:J -', '300:disposed']
  },
  'continuous / none / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [350, 2, 11300],
    snaps: ['0:J -', '350:C cancelled/alarm/', '5400:CU cancelled/alarm/U', '11300:disposed']
  },
  'continuous / none / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [350, 41, 11300],
    snaps: ['0:J -', '350:C cancelled/disabled/', '5400:CU cancelled/disabled/U', '11300:disposed']
  },
  'continuous / banner / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [900, 39, 8500],
    snaps: ['0:J -', '900:C cancelled/keepalive/', '5950:CU cancelled/keepalive/U', '8650:K cancelled/keepalive/U', '11600:disposed']
  },
  'continuous / banner / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 41, 8600],
    snaps: ['0:J -', '600:C cancelled/transport/', '5650:CU cancelled/transport/U', '8650:K cancelled/transport/U', '11600:disposed']
  },
  'continuous / banner / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 41, 8600],
    snaps: ['0:J -', '600:C cancelled/transport/', '5650:CU cancelled/transport/U', '8650:K cancelled/transport/U', '11600:disposed']
  },
  'continuous / banner / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [650, 40, 8450],
    snaps: ['0:J -', '650:C cancelled/control/', '5700:CU cancelled/control/U', '8650:K cancelled/control/U', '11600:disposed']
  },
  'continuous / banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [900, 39, 8500],
    snaps: ['0:J -', '900:C cancelled/keepalive/', '5950:CU cancelled/keepalive/U', '8650:K cancelled/keepalive/U', '11600:disposed']
  },
  'continuous / banner / stale': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [900, 41, 11450],
    snaps: ['0:J -', '900:C cancelled/keepalive/', '5950:CU cancelled/keepalive/U', '11650:K cancelled/keepalive/U', '14600:disposed']
  },
  'continuous / banner / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 41, 8600],
    snaps: ['0:J -', '600:C cancelled/operator/', '5650:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / banner / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 41, 8600],
    snaps: ['0:J -', '600:C cancelled/stop/', '5650:CU cancelled/stop/U', '8650:K cancelled/stop/U', '11600:disposed']
  },
  'continuous / banner / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [900, 39, 8500],
    snaps: ['0:J -', '900:C cancelled/keepalive/', '5950:CU cancelled/keepalive/U', '8650:K cancelled/keepalive/U', '11600:disposed']
  },
  'continuous / banner / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 1, 600],
    snaps: ['0:J -', '600:disposed']
  },
  'continuous / banner / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [650, 1, 650],
    snaps: ['0:J -', '650:C cancelled/alarm/', '700: cancelled/alarm/', '8650:K cancelled/alarm/', '11600:disposed']
  },
  'continuous / banner / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [650, 40, 8450],
    snaps: ['0:J -', '650:C cancelled/disabled/', '5700:CU cancelled/disabled/U', '8650: cancelled/disabled/U', '11600:disposed']
  },
  'continuous / banner-idle / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / stale': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '3150: ended/bound/', '3650:K ended/bound/', '14600:disposed']
  },
  'continuous / banner-idle / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / stop-button': {
    refused: 'Aucun travail à arrêter.',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '600:disposed']
  },
  'continuous / banner-idle / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '600: ended/bound/', '8650:K ended/bound/', '11600:disposed']
  },
  'continuous / banner-idle / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [],
    snaps: ['0:J -', '400:K ended/bound/', '600: ended/bound/', '11600:disposed']
  },
  'continuous / cancel-then-banner / keepalive-lost': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / stream-closed': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / stream-rotated': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / lease-taken': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / stale': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 43, 11450],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '11650:K cancelled/operator/U', '14600:disposed']
  },
  'continuous / cancel-then-banner / jog-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 43, 8600],
    snaps: ['0:J -', '300:C cancelled/operator/', '5650:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / stop-button': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 43, 8600],
    snaps: ['0:J -', '300:C cancelled/operator/', '600:C cancelled/stop/', '5650:CU cancelled/stop/U', '8650:K cancelled/stop/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / socket-stop': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650:K cancelled/operator/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / dispose': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 3, 600],
    snaps: ['0:J -', '300:C cancelled/operator/', '600:disposed']
  },
  'continuous / cancel-then-banner / alarm': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 2, 500],
    snaps: ['0:J -', '300:C cancelled/operator/', '700: cancelled/operator/', '8650:K cancelled/operator/', '11600:disposed']
  },
  'continuous / cancel-then-banner / disabled': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 8500],
    snaps: ['0:J -', '300:C cancelled/operator/', '5350:CU cancelled/operator/U', '8650: cancelled/operator/U', '11600:disposed']
  }
};

// Merge with lot F4 (feat/fonctions-5): « Rendre la main » stops the move of the device that gives the
// hand back (job-service.js, moves.stop 'released'). These six cases, the only ones where that device
// releases, are recorded on the merge: the cancel comes at the release instead of later or never. With
// that one stop of the release left out, this file gives EXPECTED for all 96 cases.
const WITH_F4_RELEASE = {
  'step / none / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 42, 11300],
    snaps: ['0: -', '300:C cancelled/released/', '5350:CU cancelled/released/U', '11300:disposed']
  },
  'step / banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [600, 41, 8600],
    snaps: ['0: -', '600:C cancelled/released/', '5650:CU cancelled/released/U', '8650:K cancelled/released/U', '11600:disposed']
  },
  'step / cancel-then-banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X10 F100'],
    cancels: [300, 43, 8600],
    snaps: ['0: -', '300:C cancelled/operator/', '600:C cancelled/released/', '5650:CU cancelled/released/U', '8650:K cancelled/released/U', '11600:disposed']
  },
  'continuous / none / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 42, 11300],
    snaps: ['0:J -', '300:C cancelled/released/', '5350:CU cancelled/released/U', '11300:disposed']
  },
  'continuous / banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [600, 41, 8600],
    snaps: ['0:J -', '600:C cancelled/released/', '5650:CU cancelled/released/U', '8650:K cancelled/released/U', '11600:disposed']
  },
  'continuous / cancel-then-banner / lease-released': {
    refused: '',
    lines: ['$J=G91 G21 X99 F500'],
    cancels: [300, 43, 8600],
    snaps: ['0:J -', '300:C cancelled/operator/', '600:C cancelled/released/', '5650:CU cancelled/released/U', '8650:K cancelled/released/U', '11600:disposed']
  }
};

test('the manual moves, a banner included, write and report exactly what they did before the lot (db584555)', async () => {
  const got = {};
  for (const what of Object.keys(MOVES)) {
    for (const context of CONTEXTS) {
      for (const event of EVENTS) {
        got[[what, context, event].join(' / ')] = await scenario(what, context, event);
      }
    }
  }
  if (process.env.RECORD) {
    fs.writeFileSync(process.env.RECORD, JSON.stringify(got, null, 2));
    return;
  }
  expect(Object.keys(got)).toHaveLength(Object.keys(MOVES).length * CONTEXTS.length * EVENTS.length);
  expect(Object.keys(WITH_F4_RELEASE).every((key) => key.endsWith(' / lease-released'))).toBe(true);
  Object.keys(got).forEach((key) => {
    expect([key, got[key]]).toEqual([key, WITH_F4_RELEASE[key] || EXPECTED[key]]);
  });
}, 60000);
