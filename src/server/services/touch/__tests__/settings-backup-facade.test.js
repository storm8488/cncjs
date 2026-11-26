/* eslint-env jest */
// Lot N8 through the touch facade: a backup is taken from what CNCjs last read by `$$`, on the
// real job service, and nothing is ever written to the controller (no restoration, no new command).
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import store from '../../../store';
import settings from '../../../config/settings';
import touch from '../index';
import { BACKUP_DIR } from '../settings-backup';

jest.mock('../system-stats', () => ({ createSystemStats: () => ({ start: jest.fn(), stop: jest.fn(), read: () => ({}) }) }));
jest.mock('../backlight', () => ({ createBacklight: () => ({ restore: jest.fn(), status: () => ({}), set: jest.fn(), dim: jest.fn(), wake: jest.fn() }) }));

const LUNYEE = { $13: '0', $20: '1', $22: '1', $23: '3', $30: '1000', $32: '0', $130: '408.000', $131: '396.000', $132: '130.000' };
const TABLET = { kind: 'touch', id: 'tablet', user: 'op' };

let dir;

// The backups live next to the .cncrc file; the facade resolves that folder once.
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-touch-backup-facade-'));
  settings.rcfile = path.join(dir, '.cncrc');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// Everything a controller can be asked to send is recorded in `sent`.
const fakeController = (port, boardSettings) => {
  const c = {
    type: 'Grbl',
    options: { port },
    ready: true,
    isClose: () => false,
    runner: new EventEmitter(),
    sender: new EventEmitter(),
    workflow: Object.assign(new EventEmitter(), { state: 'idle' }),
    state: { status: { activeState: 'Idle' } },
    settings: { version: '1.1f', settings: { ...boardSettings } },
    feeder: { toJSON: () => ({ queue: 0, pending: false }) },
    sent: []
  };
  c.runner.state = c.state;
  c.sender.state = { name: '', context: {}, total: 0 };
  c.sender.toJSON = () => ({ ...c.sender.state });
  c.command = (...args) => c.sent.push(['command', ...args]);
  c.write = (...args) => c.sent.push(['write', ...args]);
  c.writeln = (...args) => c.sent.push(['writeln', ...args]);
  return c;
};

const files = () => {
  try {
    return fs.readdirSync(path.join(dir, BACKUP_DIR)).sort();
  } catch (_) {
    return [];
  }
};

const connect = (boardSettings = LUNYEE) => {
  touch.start();
  const c = fakeController('COM3', boardSettings);
  // replace, not set: set merges into the previous controller object.
  store.replace('controllers', { COM3: c });
  c.runner.emit('status');
  // The automatic reading of the version (existing behaviour) is not part of a backup.
  c.sent.length = 0;
  return c;
};

describe('settings backups through the touch facade (lot N8)', () => {
  afterEach(() => {
    touch.stop();
    store.replace('controllers', {});
    fs.rmSync(path.join(dir, BACKUP_DIR), { recursive: true, force: true });
  });

  test('saving, listing, comparing and reading send nothing to the controller', async () => {
    const c = connect();
    expect(await touch.settingsBackupList('COM3')).toEqual({ backups: [], max: 20, drift: null });

    const out = await touch.settingsBackupAction({ action: 'save', port: 'COM3' });
    expect(files()).toEqual([out.saved.id]);
    expect(out.saved.count).toBe(9);
    expect(out.backups).toHaveLength(1);
    expect(out.backups[0]).toMatchObject({ id: out.saved.id, port: 'COM3', count: 9, first: true });
    expect(out.drift).toEqual({ id: out.saved.id, at: out.saved.at, changed: 0 });
    const file = JSON.parse(fs.readFileSync(path.join(dir, BACKUP_DIR, out.saved.id), 'utf8'));
    expect(file.settings).toEqual(LUNYEE);
    expect(file.firmware).toBe('1.1f');
    expect(file.profile).toEqual({ label: '', kind: '' });
    expect(Date.parse(file.at)).toBeGreaterThan(0);

    // The board now says something else (as after a reading): the comparison and the drift see it.
    // The store holds a copy of the plain parts of the controller: change that one.
    Object.assign(store.get('controllers').COM3.settings.settings, { $130: '400.000', $23: '0' });
    expect((await touch.settingsBackupAction({ action: 'compare', port: 'COM3', id: out.saved.id })).changes).toEqual([
      { name: '$23', saved: '3', current: '0' },
      { name: '$130', saved: '408.000', current: '400.000' }
    ]);
    expect((await touch.settingsBackupList('COM3')).drift).toEqual({ id: out.saved.id, at: out.saved.at, changed: 2 });
    expect((await touch.settingsBackupAction({ action: 'read', id: out.saved.id })).backup.settings).toEqual(LUNYEE);

    expect(c.sent).toEqual([]);
  });

  test('a backup during a job reads the memory only and still sends nothing', async () => {
    const c = connect();
    c.workflow.state = 'running';
    c.state.status.activeState = 'Run';
    c.runner.emit('status');
    c.sent.length = 0;
    const out = await touch.settingsBackupAction({ action: 'save', port: 'COM3' });
    expect(files()).toEqual([out.saved.id]);
    expect(c.sent).toEqual([]);
  });

  test('refused without a machine and without settings read', async () => {
    touch.start();
    await expect(touch.settingsBackupAction({ action: 'save' })).rejects.toMatchObject({ status: 409, code: 'EBACKUP_NO_MACHINE' });
    await expect(touch.settingsBackupAction({ action: 'save', port: 'COM9' })).rejects.toMatchObject({ status: 409 });
    touch.stop();

    const empty = connect({});
    await expect(touch.settingsBackupAction({ action: 'save', port: 'COM3' })).rejects.toMatchObject({ status: 409, code: 'EBACKUP_NO_SETTINGS' });
    await expect(touch.settingsBackupAction({ action: 'compare', port: 'COM3', id: 'reglages-0001-20261126T211530Z.json' }))
      .rejects.toMatchObject({ status: 409, code: 'EBACKUP_NO_SETTINGS' });
    expect(files()).toEqual([]);
    expect(empty.sent).toEqual([]);
  });

  test('refused while the settings are being read again (a mix of old and new values)', async () => {
    const c = connect();
    // Relire, the existing guarded action, with the tablet's event stream open.
    const res = Object.assign(new EventEmitter(), {
      writeHead: jest.fn(), write: jest.fn(() => true), end: jest.fn(), setHeader: jest.fn(), flushHeaders: jest.fn()
    });
    const req = Object.assign(new EventEmitter(), { query: {}, headers: {}, socket: Object.assign(new EventEmitter(), { setTimeout: jest.fn() }) });
    expect(touch.openEvents(req, res, TABLET)).toBeTruthy();
    const hello = res.write.mock.calls.map((call) => String(call[0])).join('');
    const transportId = /"transportId":"([^"]+)"/.exec(hello)[1];
    const generation = touch.snapshot().controllers[0].generation;
    c.runner.emit('status', { raw: '<Idle|MPos:0.000,0.000,0.000|FS:0,0>' });
    c.sent.length = 0;
    await touch.action({ action: 'readSettings', port: 'COM3', generation, transportId }, TABLET);
    expect(c.sent).toEqual([['writeln', '$$']]);

    await expect(touch.settingsBackupAction({ action: 'save', port: 'COM3' })).rejects.toMatchObject({ status: 409, code: 'ETOUCH_SETTINGS_READING' });
    await expect(touch.settingsBackupAction({ action: 'compare', port: 'COM3', id: 'reglages-0001-20261126T211530Z.json' }))
      .rejects.toMatchObject({ status: 409, code: 'ETOUCH_SETTINGS_READING' });
    expect(files()).toEqual([]);
    // The list still answers, without a drift it cannot judge.
    expect((await touch.settingsBackupList('COM3')).drift).toBeNull();
    expect(c.sent).toEqual([['writeln', '$$']]);
    req.emit('close');
  });

  test('refused until CNCjs has copied what its parser read (the 250 ms timer of the controller)', async () => {
    const c = connect();
    const out = await touch.settingsBackupAction({ action: 'save', port: 'COM3' });
    // « Relire » has answered `ok`: the parser holds the new values, the controller still the old ones.
    const held = store.get('controllers').COM3;
    c.runner.settings = { version: '1.1f', settings: { ...LUNYEE, $130: '400.000' } };
    await expect(touch.settingsBackupAction({ action: 'save', port: 'COM3' })).rejects.toMatchObject({ status: 409, code: 'ETOUCH_SETTINGS_READING' });
    await expect(touch.settingsBackupAction({ action: 'compare', port: 'COM3', id: out.saved.id }))
      .rejects.toMatchObject({ status: 409, code: 'ETOUCH_SETTINGS_READING' });
    // Never « the same settings » on the old values: the list alone.
    expect((await touch.settingsBackupList('COM3')).drift).toBeNull();
    expect(files()).toEqual([out.saved.id]);
    // The timer has run: the change is seen.
    held.settings = c.runner.settings;
    expect((await touch.settingsBackupList('COM3')).drift).toEqual({ id: out.saved.id, at: out.saved.at, changed: 1 });
    expect(c.sent).toEqual([]);
  });

  test('an unknown action is refused: there is no restoring, writing or deleting action', async () => {
    const c = connect();
    await Promise.all(['restore', 'write', 'delete', undefined].map((action) => (
      expect(touch.settingsBackupAction({ action, port: 'COM3', id: 'reglages-0001-20261126T211530Z.json' })).rejects.toMatchObject({ status: 400 })
    )));
    expect(c.sent).toEqual([]);
    expect(files()).toEqual([]);
  });
});
