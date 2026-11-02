/* eslint-env jest */
// The touch facade: history and control wired to the service, the socket and
// host-command policies, with the real control module and a real history file.
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import store from '../../../store';
import settings from '../../../config/settings';
import touch from '../index';

jest.mock('../system-stats', () => ({ createSystemStats: () => ({ start: jest.fn(), stop: jest.fn(), read: () => ({}) }) }));
jest.mock('../backlight', () => ({ createBacklight: () => ({ restore: jest.fn(), status: () => ({}), set: jest.fn(), dim: jest.fn(), wake: jest.fn() }) }));

let dir;

let run = 0;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-touch-facade-'));
});

// The history lives next to the .cncrc file: one configuration folder per test.
beforeEach(() => {
  run += 1;
  fs.mkdirSync(path.join(dir, 'conf' + run));
  settings.rcfile = path.join(dir, 'conf' + run, '.cncrc');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const fakeController = (port) => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle' } },
    settings: { settings: {} },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    commands: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (name, ...args) => c.commands.push([name, ...args]);
  return c;
};

const fakeSocket = (id, name = 'ana') => ({ id, handshake: { address: '10.0.0.5' }, decoded_token: { id: 'u', name } });

describe('touch facade (history, control, socket and host-command policies)', () => {
  afterEach(() => {
    touch.stop();
    store.set('controllers', {});
  });

  test('a free port lets every socket command through; an owned port refuses motion from another client and lets stops through', async () => {
    touch.start();
    const c = fakeController('COM3');
    store.set('controllers', { COM3: c });
    c.runner.emit('status');
    const socket = fakeSocket('s1');
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode:start')).toBeNull();
    // A tablet claims the port through the job service (first guarded operation).
    const tablet = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' };
    await touch.action({ port: 'COM3', action: 'control', operation: 'claim' }, tablet);
    expect(touch.snapshot().controllers[0].control.owner).toMatchObject({ id: 'tablet-A' });
    const refusal = touch.refuseSocket(socket, 'COM3', 'command', 'gcode:start');
    expect(refusal.message).toMatch(/Pilotage de COM3 attribué à « Tablette A » \(tablette, ana\)/);
    expect(refusal.owner.id).toBe('tablet-A');
    expect(touch.refuseSocket(socket, 'COM3', 'write', 'G0 X1')).not.toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$H')).not.toBeNull();
    // Stops, holds, resets and status queries are never refused.
    ['gcode:pause', 'gcode:stop', 'feedhold', 'reset', 'jogCancel', 'statusreport'].forEach((cmd) => {
      expect(touch.refuseSocket(socket, 'COM3', 'command', cmd)).toBeNull();
    });
    ['!', '\x18', '?'].forEach((data) => {
      expect(touch.refuseSocket(socket, 'COM3', 'write', data)).toBeNull();
    });
    // A port nobody owns stays free for the socket.
    expect(touch.refuseSocket(socket, 'COM4', 'command', 'gcode:start')).toBeNull();
    // Host commands: refused while another client pilots a port, allowed for the owner itself.
    expect(touch.refuseSystemCommand({ kind: 'http', id: 'http:bob', user: 'bob' }).message).toMatch(/commande système refusée tant qu’il pilote/);
    expect(touch.refuseSystemCommand({ kind: 'touch', id: 'tablet-A', user: 'ana' })).toBeNull();
    await touch.action({ port: 'COM3', action: 'control', operation: 'release' }, tablet);
    expect(touch.refuseSystemCommand({ kind: 'http', id: 'http:bob', user: 'bob' })).toBeNull();
  });

  test('control changes are recorded in the history file next to the .cncrc, readable through the facade; a socket presence is attached and detached', async () => {
    touch.start();
    const c = fakeController('COM3');
    store.set('controllers', { COM3: c });
    c.runner.emit('status');
    const tablet = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' };
    const phone = { kind: 'touch', id: 'phone-B', label: 'Téléphone', user: 'bob' };
    await touch.action({ port: 'COM3', action: 'control', operation: 'claim' }, tablet);
    await touch.action({ port: 'COM3', action: 'control', operation: 'takeover', reason: 'Tablette hors de portée' }, phone);
    const socket = fakeSocket('s2', 'carl');
    touch.attachSocket(socket);
    touch.detachSocket(socket);
    // Wait for the asynchronous, serialized writes.
    let page = await touch.readHistory({ limit: 10 });
    for (let i = 0; i < 20 && page.total < 2; i++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      // eslint-disable-next-line no-await-in-loop
      page = await touch.readHistory({ limit: 10 });
    }
    expect(page.entries.map((e) => [e.event, e.change])).toEqual([['control', 'takeover'], ['control', 'claim']]);
    expect(page.entries[0]).toMatchObject({ port: 'COM3', owner: { id: 'phone-B' }, previous: { id: 'tablet-A' }, reason: 'Tablette hors de portée', admin: false });
    const file = path.join(path.dirname(settings.rcfile), 'cncjs-touch-history.jsonl');
    expect(fs.existsSync(file)).toBe(true);
    const text = fs.readFileSync(file, 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
  });

  test('before start, the policies allow everything (no control module yet)', () => {
    expect(touch.refuseSocket(fakeSocket('s3'), 'COM3', 'command', 'gcode:start')).toBeNull();
    expect(touch.refuseSystemCommand({ kind: 'http', id: 'http:x' })).toBeNull();
    expect(() => touch.attachSocket(fakeSocket('s3'))).not.toThrow();
    expect(() => touch.detachSocket(fakeSocket('s3'))).not.toThrow();
  });
});
