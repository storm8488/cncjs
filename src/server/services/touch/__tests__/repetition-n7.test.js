/* eslint-env jest */
// Rehearsal before the CNC trial (2026-11), finding N7 / E4. Fails without the
// hold of the sender in r.reset (job-service.js).
// N7 / E4: the board restarts in the middle of a job started from the tablet
// (E-stop wired to the board's reset input, brown-out, raw 0x18 from another
// client) and comes back Idle ($22=0, or homing lock compiled out).
// Real GrblController (CNCjs's own sender, workflow and `ok` handler) with a
// recorded serial line, and the real touch job service on top of it.
//
// Real Grbl 1.1 prints the `ok` of the block it was waiting in (mc_line with a
// full planner, G4 dwell: both return on sys.abort, then report_status_message
// prints `ok`) BEFORE the banner. The simulator printed it after (SIM-5). Both
// orders are tried.
import fs from 'fs';
import os from 'os';
import path from 'path';
import GrblController from '../../../controllers/Grbl/GrblController';
import config from '../../configstore';
import { createController } from '../../../controllers/__tests__/helpers/createController';
import { createService } from '../job-service';
import { createControl } from '../control';

jest.mock('../../../lib/logger', () => {
  const l = () => ({ error: () => {}, warn: () => {}, info: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} });
  return { __esModule: true, default: l, getLevel: () => 'info', setLevel: () => {} };
});

const BANNER = 'Grbl 1.1h [\'$\' for help]';
const IDLE = '<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>';
const RUN = '<Run|MPos:1.000,0.000,0.000|FS:600,6000>';
const A = { kind: 'touch', id: 'tablet-A', label: 'Tablette A' };

let root;
let controller;
let service;
let writes;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-'));
  const lines = ['G21 G90 G17 G94', 'G0 Z5', 'G0 X0 Y0', 'M3 S6000', 'G4 P3', 'G1 Z-1 F300'];
  for (let i = 1; i <= 60; i++) {
    lines.push('G1 X' + (i % 2 ? 10 : 0) + ' Y' + (i * 0.2).toFixed(1) + ' F600');
  }
  lines.push('G0 Z5', 'M5', 'M2');
  fs.writeFileSync(path.join(root, 'long.nc'), lines.join('\n'));

  jest.spyOn(config, 'get').mockImplementation((key, def) => def);
  const made = createController(GrblController);
  controller = made.controller;
  writes = made.writes;
  clearInterval(controller.queryTimer);
  const registry = { '/dev/null': controller };
  service = createService({ get: () => registry }, { get: (key, def) => ({ watchDirectory: root, events: [], macros: [] }[key] ?? def) }, undefined, { control: createControl() });
  service.list();
  service.openTransport('tA', A);

  const parse = (line) => controller.runner.parse(line);
  parse(BANNER);
  parse('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]');
  parse(IDLE);
  const generation = service.list()[0].generation;
  const req = (action, extra = {}) => service.action({ port: '/dev/null', generation, transportId: 'tA', action, ...extra }, A);
  await req('load', { file: 'long.nc' });
  parse(IDLE);
  const state = service.list()[0];
  const ticket = await req('prepare', { operation: 'start', revision: state.revision });
  await req('start', { nonce: ticket.nonce });
  // A few lines acknowledged, the machine cutting.
  for (let i = 0; i < 12; i++) {
    parse('ok');
  }
  parse(RUN);
  expect(controller.workflow.state).toBe('running');
});

afterEach(async () => {
  // initController() ends 50 ms after the first banner.
  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
  service.dispose();
  controller.destroy();
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const programLines = (from) => writes.slice(from).map((w) => w.data).filter((d) => /^[GM]/.test(d));

test('N7 (real Grbl order): `ok` of the aborted block, then the banner, board back Idle', () => {
  const parse = (line) => controller.runner.parse(line);
  parse('ok');
  const afterReset = writes.length;
  parse(BANNER);
  // The board is Idle with an empty buffer and answers every line it gets.
  parse(IDLE);
  for (let i = 0; i < 10; i++) {
    parse('ok');
  }
  const sent = programLines(afterReset);
  // Lines of the program must not keep flowing into a board that restarted
  // (spindle off, lines lost in between).
  expect(sent).toEqual([]);
  expect(controller.workflow.state).toBe('paused');
  expect(service.list()[0].canResume).toBe(false);
});

test('N7 (simulator order): banner first, then a late `ok`', () => {
  const parse = (line) => controller.runner.parse(line);
  const afterReset = writes.length;
  parse(BANNER);
  parse(IDLE);
  for (let i = 0; i < 10; i++) {
    parse('ok');
  }
  expect(programLines(afterReset)).toEqual([]);
});

test('witness ($22=1): the board is in alarm lock, the first line is refused and CNCjs pauses by itself', () => {
  const parse = (line) => controller.runner.parse(line);
  parse(BANNER);
  parse('[MSG:\'$H\'|\'$X\' to unlock]');
  parse('<Alarm|MPos:0.000,0.000,0.000|FS:0,0>');
  const afterReset = writes.length;
  parse('error:9');
  for (let i = 0; i < 10; i++) {
    parse('error:9');
  }
  expect(controller.workflow.state).toBe('paused');
  expect(programLines(afterReset)).toEqual([]);
  expect(service.list()[0].canResume).toBe(false);
});
