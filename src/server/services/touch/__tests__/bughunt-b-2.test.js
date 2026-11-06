/* eslint-env jest */
// Chasse aux bugs, angle B, n° 2 (non commité) : la tablette qui pilote ne peut
// pas lancer une recherche Wi-Fi. La page (wifi-settings.js:22-29) n'envoie pas
// de clientId ; api.touch.js:actorOf en fait « http:<user> », différent du bail
// « touch:<clientId> » de la même tablette, et refuseSystemCommand refuse.
// PROFILES.md : refusé « while another device pilots ».
import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';
import fs from 'fs';
import store from '../../../store';
import config from '../../configstore';
import touch from '..';
import { postJob, getEvents, postWifi } from '../../../api/api.touch';

jest.mock('../../../config/settings', () => {
  const p = require('path');
  const o = require('os');
  const actual = jest.requireActual('../../../config/settings').default;
  return { __esModule: true, default: { ...actual, rcfile: p.join(o.tmpdir(), 'bughunt-b-2-rc', '.cncrc'), route: '/' } };
});
jest.mock('../wifi', () => ({
  createWifi: () => ({
    status: async () => ({ available: true }),
    scan: async () => ({ networks: [] }),
    connect: async () => ({ ok: true }),
    forget: async () => ({ ok: true })
  })
}));

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
      status: { activeState: 'Idle', mpos: { x: '-100', y: '-100', z: '-10' }, wpos: { x: '5', y: '5', z: '2' } },
      parserstate: { modal: { units: 'G21', distance: 'G90', wcs: 'G54', motion: 'G0', spindle: 'M5' } }
    },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    settings: { version: '1.1h', settings: { $10: '1', $13: '0', $22: '1', $23: '0', $130: '400', $131: '400', $132: '80' } },
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

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bughunt-b-2-'));
  fs.mkdirSync(path.join(os.tmpdir(), 'bughunt-b-2-rc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'job.nc'), 'G21 G90\nG0 X1 Y1 Z5\nG1 X2 F100\nM2\n');
  config.set('watchDirectory', dir, { silent: true });
});
afterAll(() => {
  touch.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), 'bughunt-b-2-rc'), { recursive: true, force: true });
});

test('la tablette qui pilote lance une recherche Wi-Fi (comme wifi-settings.js l’envoie)', async () => {
  const c = fakeController();
  store.set('controllers', { TEST: c });
  touch.start();
  touch.snapshot();
  c.runner.emit('status');
  const user = { id: 'u1', name: 'op' };
  // Flux de la tablette (job-stream.js:42) puis une action réussie : elle prend le pilotage.
  const req = Object.assign(new EventEmitter(), { user, query: { clientId: 't-abc-1234' }, body: {} });
  const res = makeRes();
  getEvents(req, res);
  const transportId = res.lines[0].transportId;
  const gen = touch.snapshot().controllers[0].generation;
  const load = await answer(postJob, { user, body: { action: 'load', port: 'TEST', file: 'job.nc', generation: gen, transportId, clientId: 't-abc-1234', clientLabel: 'Tablette 1234' } });
  expect(load.statusCode).toBe(200);
  expect(touch.snapshot().controllers[0].control.owner).toMatchObject({ kind: 'touch', id: 't-abc-1234' });
  // Même tablette, Réglages → Système → Rechercher les réseaux : corps { action: 'scan' } sans clientId.
  const scan = await answer(postWifi, { user, body: { action: 'scan' }, query: {} });
  expect(scan.payload).not.toMatchObject({ message: expect.stringMatching(/tant qu’il pilote/) });
  expect(scan.statusCode).toBe(200);
});
