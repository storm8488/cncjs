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
import { provenOffset } from './support/proven-offset';

jest.mock('../system-stats', () => ({ createSystemStats: () => ({ start: jest.fn(), stop: jest.fn(), read: () => ({}) }) }));
// What the facade tells the job service about the socket commands it allows (full homing cycle or not).
const mockSocketCommands = [];
// mockService.workOffset: a work offset factory given to the facade's service (D2, a fake board that
// does not answer `$#`); mockService.current: the service the facade built.
const mockService = { workOffset: null, current: null };
jest.mock('../job-service', () => {
  const actual = jest.requireActual('../job-service');
  return {
    ...actual,
    createService: (store, config, clock, options = {}) => {
      const service = actual.createService(store, config, clock, mockService.workOffset ? { ...options, workOffset: mockService.workOffset } : options);
      mockService.current = service;
      const socketCommand = service.socketCommand;
      service.socketCommand = (port, full) => {
        mockSocketCommands.push([port, full]);
        return socketCommand(port, full);
      };
      return service;
    }
  };
});
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
    mockService.workOffset = null;
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

  test('refuseSocket : homing et writeln $H annoncent une origine complète ; gcode $H (file du feeder), $HX, une autre commande l’annulent ; un refus ou un arrêt n’annonce rien', async () => {
    touch.start();
    const c = fakeController('COM3');
    store.set('controllers', { COM3: c });
    c.runner.emit('status');
    const socket = fakeSocket('s4');
    mockSocketCommands.splice(0);
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'homing')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$H')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', ' $h ')).toBeNull();
    expect(mockSocketCommands).toEqual([['COM3', true], ['COM3', true], ['COM3', true]]);
    mockSocketCommands.splice(0);
    // Not a full cycle written at once, the intention is cancelled: a $H queued in the feeder
    // (which feeder:stop or an Alarm may drop), partial cycles, a raw write, a macro.
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$HX')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$HZ')).toBeNull();
    // A non-breaking space: GrblController.writeln sends it as a realtime byte, without the newline.
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '\u00a0$H')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$H\nG0 X10')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'write', '$H\n')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'macro:run')).toBeNull();
    expect(mockSocketCommands).toEqual([['COM3', false], ['COM3', false], ['COM3', false], ['COM3', false], ['COM3', false], ['COM3', false], ['COM3', false]]);
    mockSocketCommands.splice(0);
    // Stops and status queries say nothing; a refused command (another owner) says nothing either.
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'statusreport')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'write', '?')).toBeNull();
    const tablet = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' };
    await touch.action({ port: 'COM3', action: 'control', operation: 'claim' }, tablet);
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'homing')).not.toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', '$H')).not.toBeNull();
    expect(mockSocketCommands).toEqual([]);
  });

  test('D2: while the work offset check writes its lines, a socket command that is not safe is refused; a stop ends the check and passes', () => {
    touch.start();
    const c = fakeController('COM3');
    c.settings = { version: '1.1f', settings: { $13: '0' } };
    store.set('controllers', { COM3: c });
    // A fresh $G, then a fresh Idle report: the real service starts its check (`$#`, unanswered here).
    c.state.parserstate = { modal: { wcs: 'G54', units: 'G21', distance: 'G90', motion: 'G0', spindle: 'M5' } };
    touch.snapshot();
    c.runner.emit('parserstate', c.state.parserstate);
    c.runner.emit('status', {});
    expect(c.commands).toEqual([['gcode', '$#']]);
    expect(touch.snapshot().controllers[0].workOffset.state).toBe('checking');
    const socket = fakeSocket('s5');
    mockSocketCommands.splice(0);
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode')).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING', message: expect.stringMatching(/^Vérification de l’origine de la pièce/) });
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', 'G10 L20 P1 X0')).toMatchObject({ code: 'ETOUCH_OFFSET_CHECKING' });
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'statusreport')).toBeNull();
    expect(mockSocketCommands).toEqual([]);
    expect(touch.snapshot().controllers[0].workOffset.state).toBe('checking');
    // A feed hold from the PC: the check ends where it is, the hold goes its way.
    expect(touch.refuseSocket(socket, 'COM3', 'write', '!')).toBeNull();
    expect(touch.snapshot().controllers[0].workOffset).toMatchObject({ state: 'unknown', detail: 'interrupted' });
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode')).toBeNull();
    expect(mockSocketCommands).toEqual([['COM3', false]]);
    expect(c.commands).toEqual([['gcode', '$#']]);
  });

  // A homed LUNYEE board at rest, a fresh $G, and a tablet whose stream is open: a plate probe of
  // the tablet sends its first G38.2 and waits (no answer from this board).
  const plateRunning = async () => {
    mockService.workOffset = provenOffset;
    touch.start();
    const c = fakeController('COM3');
    c.settings = { version: '1.1f', settings: { $10: '1', $13: '0', $20: '1', $22: '1', $23: '3', $130: '408', $131: '396', $132: '130' } };
    c.state.parserstate = { modal: { wcs: 'G54', units: 'G21', distance: 'G90', motion: 'G0', spindle: 'M5' }, feedrate: '0', spindle: '0' };
    store.set('controllers', { COM3: c });
    const report = (active) => {
      c.state.status = { activeState: active, spindle: 0, mpos: { x: '150.000', y: '120.000', z: '-100.000' }, wpos: { x: '50.000', y: '20.000', z: '15.000' } };
      c.runner.emit('status', { raw: '<' + active + '|MPos:150.000,120.000,-100.000|FS:0,0>' });
    };
    touch.snapshot();
    report('Home');
    report('Idle');
    c.runner.emit('parserstate', c.state.parserstate);
    const tablet = { kind: 'touch', id: 'tablet-A', label: 'Tablette A', user: 'ana' };
    mockService.current.openTransport('tA', tablet);
    const body = { port: 'COM3', generation: touch.snapshot().controllers[0].generation, transportId: 'tA' };
    const ticket = await touch.action({ ...body, action: 'prepare', operation: 'zeroZ', thickness: 10, search: 20 }, tablet);
    const run = touch.action({ ...body, action: 'zeroZ', nonce: ticket.nonce }, tablet).catch((err) => err);
    expect(c.commands).toEqual([['gcode', 'G38.2 Z-5 F100']]);
    return { c, run };
  };

  test('C-09, C-12: during a plate probe a socket command that is not safe is refused; a socket stop holds the machine first, and no further line leaves', async () => {
    const { c } = await plateRunning();
    const socket = fakeSocket('s6');
    mockSocketCommands.splice(0);
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', 'M3 S1000')).toMatchObject({ message: 'Palpage en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).' });
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode')).not.toBeNull();
    expect(mockSocketCommands).toEqual([]);
    // CNCjs's Stop on the PC: the probe is stopped before the command goes its way (the report still says Idle).
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode:stop')).toBeNull();
    expect(c.commands.map((entry) => entry[0])).toEqual(['gcode', 'feeder:stop', 'gcode:stop', 'feedhold']);
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(c.commands.filter((entry) => entry[0] === 'gcode')).toEqual([['gcode', 'G38.2 Z-5 F100']]);
  });

  test('C-60: while a host command holds the machine, a socket command that is not safe is refused on a free port; stops pass', () => {
    touch.start();
    const c = fakeController('COM3');
    store.set('controllers', { COM3: c });
    touch.snapshot();
    c.runner.emit('status');
    const socket = fakeSocket('s7');
    const reservation = touch.reserveSystemCommand({ id: 'touch-wifi', title: 'Recherche des réseaux Wi-Fi' });
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode:start')).toMatchObject({ message: 'Commande système en cours sur la tablette : commande refusée jusqu’à sa fin (Arrêter reste possible).' });
    expect(touch.refuseSocket(socket, 'COM3', 'writeln', 'G0 X10')).not.toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'feedhold')).toBeNull();
    expect(touch.refuseSocket(socket, 'COM3', 'write', '!')).toBeNull();
    reservation.release();
    expect(touch.refuseSocket(socket, 'COM3', 'command', 'gcode:start')).toBeNull();
  });

  test('before start, the policies allow everything (no control module yet)', () => {
    expect(touch.refuseSocket(fakeSocket('s3'), 'COM3', 'command', 'gcode:start')).toBeNull();
    expect(touch.refuseSystemCommand({ kind: 'http', id: 'http:x' })).toBeNull();
    expect(() => touch.attachSocket(fakeSocket('s3'))).not.toThrow();
    expect(() => touch.detachSocket(fakeSocket('s3'))).not.toThrow();
  });
});
