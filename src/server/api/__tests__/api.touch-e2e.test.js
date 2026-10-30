/* eslint-env jest */
// Contre-vérification finale (33b32db9) : bout en bout HTTP -> service Touch
// réel (index.js, job-service, control, flux) -> faux contrôleur Grbl, avec
// deux tablettes ; commandes système par api.commands. Aucune machine réelle :
// taskRunner est remplacé (aucune commande hôte lancée), settings.rcfile pointe
// vers un dossier temporaire.
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import store from '../../store';
import config from '../../services/configstore';
import taskRunner from '../../services/taskrunner';
import touch from '../../services/touch';
import { postJob, getEvents } from '../api.touch';
import { run as runCommand } from '../api.commands';

jest.mock('../../config/settings', () => {
  const p = require('path');
  const o = require('os');
  const actual = jest.requireActual('../../config/settings').default;
  return { __esModule: true, default: { ...actual, rcfile: p.join(o.tmpdir(), 'xvf-e2e-rc', '.cncrc'), route: '/' } };
});
jest.mock('../../services/taskrunner', () => {
  const E = require('events');
  const t = new E();
  t.run = jest.fn(() => 'task-' + t.run.mock.calls.length);
  return { __esModule: true, default: t };
});

const fakeController = (port = 'TEST') => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: {
      status: {
        activeState: 'Idle', spindle: 0, mpos: { x: '-100', y: '-100', z: '-10' }, wpos: { x: '5', y: '5', z: '2' }
      },
      parserstate: { modal: { units: 'G21', distance: 'G90', wcs: 'G54', motion: 'G0', spindle: 'M5' } }
    },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { $10: '1', $13: '0', $22: '1', $23: '0', $110: '1000', $111: '1000', $112: '500', $130: '400', $131: '400', $132: '80' } },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => {
    c.commands.push([name, ...args]);
    if (name === 'gcode:load') {
      c.sender.state = { name: args[0], context: args[2], total: 3, sent: 0, received: 0 };
      c.sender.emit('load');
      args[3](null);
    }
    if (name === 'gcode:start' || name === 'gcode:resume') {
      c.workflow.state = 'running';
      c.state.status.activeState = 'Run';
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
    }
    if (name === 'reset') {
      c.state.status.activeState = 'Idle';
    }
  };
  return c;
};

const makeRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.lines = [];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = () => res;
  res.setHeader = () => {};
  res.send = (payload) => {
    res.payload = payload;
    res.emit('sent');
    return res;
  };
  res.write = (line) => {
    res.lines.push(JSON.parse(line));
    return true;
  };
  res.end = () => {};
  return res;
};
const answer = (handler, req) => new Promise((resolve) => {
  const res = makeRes();
  res.on('sent', () => resolve(res));
  handler(req, res);
});

// One tablet: its event stream (transport) and its HTTP calls.
const tablet = (clientId) => {
  const req = Object.assign(new EventEmitter(), { user: { id: 'u1', name: 'op' }, query: { clientId, clientLabel: clientId }, body: {} });
  const res = makeRes();
  touch.snapshot();
  getEvents(req, res);
  const t = {
    req,
    res,
    transportId: res.lines[0].transportId,
    post: (body) => answer(postJob, { user: { id: 'u1', name: 'op' }, body: { port: 'TEST', clientId, clientLabel: clientId, transportId: t.transportId, ...body } }),
    close: () => res.emit('close')
  };
  return t;
};

let dir;
let c;
const report = () => c.runner.emit('status');
const snap = () => touch.snapshot().controllers[0];

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xvf-e2e-'));
  fs.mkdirSync(path.join(os.tmpdir(), 'xvf-e2e-rc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'job.nc'), 'G21 G90\nG0 X1 Y1 Z5\nG1 X2 F100\nM2\n');
  config.set('watchDirectory', dir, { silent: true });
  config.set('commands', [
    { id: 'reboot', mtime: 1, enabled: true, title: 'Redémarrer', commands: 'sudo reboot' },
    { id: 'off', mtime: 1, enabled: false, title: 'Éteindre', commands: 'sudo poweroff' }
  ], { silent: true });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), 'xvf-e2e-rc'), { recursive: true, force: true });
});

beforeEach(() => {
  config.set('touch', { motion: { enabled: false } }, { silent: true });
  c = fakeController();
  store.set('controllers', { TEST: c });
  touch.start();
  // The service listens to a controller once it has listed it (a stream heartbeat or a snapshot).
  touch.snapshot();
  report();
  c.runner.emit('parserstate', c.state.parserstate);
});

afterEach(() => {
  touch.stop();
  taskRunner.removeAllListeners();
  taskRunner.run.mockClear();
});

const runReq = (id, body = {}) => answer(runCommand, { user: { id: 'u1', name: 'op' }, params: { id }, body });

describe('xvf bout en bout : deux tablettes', () => {
  test('A charge et démarre ; B est refusé ; B peut Pause et Arrêter', async () => {
    const A = tablet('tab-A');
    const B = tablet('tab-B');
    const gen = snap().generation;
    let res = await A.post({ action: 'load', file: 'job.nc' });
    expect(res.statusCode).toBe(200);
    expect(snap().control.owner).toMatchObject({ kind: 'touch', id: 'tab-A' });
    res = await B.post({ action: 'load', file: 'job.nc' });
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ code: 'ECONTROL', owner: { id: 'tab-A' } });
    report();
    const revision = snap().revision;
    res = await A.post({ action: 'prepare', operation: 'start', revision, generation: gen });
    expect(res.statusCode).toBe(200);
    res = await A.post({ action: 'start', nonce: res.payload.nonce, generation: gen });
    expect(res.statusCode).toBe(200);
    expect(c.commands.map((x) => x[0])).toContain('gcode:start');
    report();
    res = await B.post({ action: 'pause' });
    expect(res.statusCode).toBe(200);
    expect(c.workflow.state).toBe('paused');
    // B ne peut pas reprendre (confirmation gardée).
    res = await B.post({ action: 'prepare', operation: 'resume', revision, generation: gen });
    expect(res.statusCode).toBe(409);
    res = await B.post({ action: 'stop' });
    expect(res.statusCode).toBe(200);
    expect(c.commands.map((x) => x[0])).toEqual(expect.arrayContaining(['gcode:stop', 'reset']));
    A.close();
    B.close();
  });

  test('A en pause perd son flux puis revient : bail rendu, aucune reprise envoyée', async () => {
    const A = tablet('tab-A');
    const gen = snap().generation;
    await A.post({ action: 'load', file: 'job.nc' });
    report();
    const t = await A.post({ action: 'prepare', operation: 'start', revision: snap().revision, generation: gen });
    await A.post({ action: 'start', nonce: t.payload.nonce, generation: gen });
    await A.post({ action: 'pause' });
    const before = c.commands.length;
    A.close();
    expect(snap().control.owner).toMatchObject({ id: 'tab-A', present: false });
    const A2 = tablet('tab-A');
    report();
    expect(snap().control.owner).toMatchObject({ id: 'tab-A', present: true });
    expect(c.commands.slice(before).map((x) => x[0])).toEqual([]);
    expect(c.workflow.state).toBe('paused');
    // L'ancienne confirmation éventuelle et l'ancien transport ne valent plus.
    const res = await A2.post({ action: 'start', nonce: t.payload.nonce, generation: gen, transportId: A.transportId });
    expect(res.statusCode).toBe(409);
    A2.close();
  });

  test('jog réel désactivé par défaut : 409 avant tout refus de pilotage, rien écrit', async () => {
    const A = tablet('tab-A');
    const B = tablet('tab-B');
    await A.post({ action: 'load', file: 'job.nc' });
    const res = await B.post({ action: 'motion', operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 500, generation: snap().generation });
    expect(res.statusCode).toBe(409);
    expect(res.payload.code).not.toBe('ECONTROL');
    expect(res.payload.message).toMatch(/non activés/);
    expect(c.commands.filter((x) => x[0] === 'gcode')).toEqual([]);
    A.close();
    B.close();
  });

  test('jog activé : B arrête le jog de A (libre), A ne peut pas jogger pendant que B pilote', async () => {
    config.set('touch', { motion: { enabled: true } }, { silent: true });
    c.state.status.activeState = 'Home';
    report();
    c.state.status.activeState = 'Idle';
    report();
    const A = tablet('tab-A');
    const B = tablet('tab-B');
    const gen = snap().generation;
    let res = await A.post({ action: 'motion', operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 500, generation: gen });
    expect(res.statusCode).toBe(200);
    expect(snap().canStop).toBe(true);
    res = await B.post({ action: 'stop' });
    expect(res.statusCode).toBe(200);
    expect(c.commands.map((x) => x[0])).toContain('jogCancel');
    res = await B.post({ action: 'motion', operation: 'jog', axis: 'X', direction: 1, step: 1, feed: 500, generation: gen });
    expect(res.statusCode).toBe(409);
    expect(res.payload.code).toBe('ECONTROL');
    A.close();
    B.close();
  });
});

describe('xvf bout en bout : commandes système', () => {
  test('désactivée : 403, rien lancé', async () => {
    const res = await runReq('off');
    expect(res.statusCode).toBe(403);
    expect(taskRunner.run).not.toHaveBeenCalled();
  });

  test('sensible pendant un travail : 409 ; au repos : réservée, la machine refuse tout, libérée à la fin', async () => {
    const A = tablet('tab-A');
    const gen = snap().generation;
    await A.post({ action: 'load', file: 'job.nc' });
    // A pilote : la commande (identifiée http:op) est refusée, même lancée depuis la tablette A.
    let res = await runReq('reboot');
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/Pilotage de TEST/);
    await A.post({ action: 'control', operation: 'release' });
    report();
    res = await runReq('reboot');
    expect(res.statusCode).toBe(200);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(touch.snapshot().systemCommand).toMatchObject({ title: 'Redémarrer' });
    // Deuxième commande simultanée : refusée.
    res = await runReq('reboot');
    expect(res.statusCode).toBe(409);
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    // Pendant la commande : chargement et jog refusés, Arrêter reste possible.
    res = await A.post({ action: 'load', file: 'job.nc' });
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/Commande système en cours/);
    res = await A.post({ action: 'stop', generation: gen });
    expect(res.payload.message).toMatch(/Aucun travail à arrêter/);
    taskRunner.emit('finish', 'task-1');
    expect(touch.snapshot().systemCommand).toBe(null);
    res = await A.post({ action: 'load', file: 'job.nc' });
    expect(res.statusCode).toBe(200);
    A.close();
  });

  test('sensible pendant un travail en cours : 409, rien lancé', async () => {
    const A = tablet('tab-A');
    const gen = snap().generation;
    await A.post({ action: 'load', file: 'job.nc' });
    report();
    const t = await A.post({ action: 'prepare', operation: 'start', revision: snap().revision, generation: gen });
    await A.post({ action: 'start', nonce: t.payload.nonce, generation: gen });
    await A.post({ action: 'control', operation: 'release' });
    report();
    const res = await runReq('reboot');
    expect(res.statusCode).toBe(409);
    expect(res.payload.message).toMatch(/travail est en cours/);
    expect(taskRunner.run).not.toHaveBeenCalled();
    A.close();
  });
});
