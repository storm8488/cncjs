/* eslint-env jest */
// Lot N8: dated backups of the board's settings ($$) on the CNCjs host, bounded,
// compared with the board. Files only: no controller is involved here.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createSettingsBackups, cleanSettings, diffSettings, BACKUP_DIR, BACKUP_FORMAT, MAX_BACKUPS } from '../settings-backup';

let root;
let counter = 0;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-settings-'));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

// One after the other.
const each = (items, task) => items.reduce((done, item, i) => done.then(() => task(item, i)), Promise.resolve());

const T0 = Date.UTC(2026, 10, 26, 21, 15, 30);
const LUNYEE = { $6: '1', $10: '1', $13: '0', $20: '1', $21: '1', $22: '1', $23: '3', $27: '2.000', $30: '1000', $130: '408.000', $131: '396.000', $132: '130.000' };
const BOARD = { settings: LUNYEE, firmware: 'Grbl 1.1f.20231030', port: '/dev/ttyUSB0', profile: { label: 'LUNYEE 4040', kind: 'cnc' } };

// A store in its own folder, with a clock the test moves.
const make = (options = {}) => {
  const clock = { now: T0 };
  const dir = path.join(root, 'b' + (++counter));
  const store = createSettingsBackups({ dir, now: () => clock.now, ...options });
  return { store, dir, clock };
};

describe('settings backups: where and what', () => {
  test('the default folder is next to the .cncrc file, as the job history', () => {
    const store = createSettingsBackups({ rcfile: path.join(root, 'conf', '.cncrc') });
    expect(store.folder).toBe(path.join(root, 'conf', BACKUP_DIR));
  });

  test('a save writes one dated JSON file with the date, the firmware, the profile and every $n pair', async () => {
    const { store, dir } = make();
    const saved = await store.save(BOARD);
    expect(saved.id).toBe('reglages-20261126T211530Z.json');
    expect(await fs.readdir(dir)).toEqual(['reglages-20261126T211530Z.json']);
    const file = JSON.parse(await fs.readFile(path.join(dir, saved.id), 'utf8'));
    expect(file).toEqual({
      format: BACKUP_FORMAT,
      version: 1,
      at: '2026-11-26T21:15:30.000Z',
      port: '/dev/ttyUSB0',
      firmware: 'Grbl 1.1f.20231030',
      profile: { label: 'LUNYEE 4040', kind: 'cnc' },
      count: 12,
      settings: LUNYEE
    });
    // The pairs are written in $n order, whatever order they were read in.
    expect(Object.keys(file.settings)).toEqual(['$6', '$10', '$13', '$20', '$21', '$22', '$23', '$27', '$30', '$130', '$131', '$132']);
    expect(await store.read(saved.id)).toEqual({ ...file, id: saved.id });
  });

  test('without any setting read, nothing is written', async () => {
    const { store, dir } = make();
    await expect(store.save({ ...BOARD, settings: {} })).rejects.toMatchObject({ code: 'EBACKUP_NO_SETTINGS', status: 409 });
    await expect(store.save({ ...BOARD, settings: { $N0: 'G54', version: '1.1f' } })).rejects.toMatchObject({ code: 'EBACKUP_NO_SETTINGS' });
    await expect(fs.readdir(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('only numeric settings with a short value are kept', () => {
    expect(cleanSettings({ $130: 408, $0: ' 10 ', $N0: 'G54', $12345: '1', $1: '', $2: 'x'.repeat(40), $3: NaN, other: 1 })).toEqual({ $0: '10', $130: '408' });
    expect(cleanSettings(null)).toEqual({});
    expect(cleanSettings(['$1'])).toEqual({});
  });
});

describe('settings backups: the list and its bound', () => {
  test('the list is most recent first and marks the first backup', async () => {
    const { store, clock } = make();
    await store.save(BOARD);
    clock.now += 86400000;
    await store.save({ ...BOARD, settings: { ...LUNYEE, $110: '4000.000' } });
    const { backups, max } = await store.list();
    expect(max).toBe(MAX_BACKUPS);
    expect(backups).toEqual([
      { id: 'reglages-20261127T211530Z.json', at: '2026-11-27T21:15:30.000Z', port: '/dev/ttyUSB0', firmware: 'Grbl 1.1f.20231030', profile: { label: 'LUNYEE 4040', kind: 'cnc' }, count: 13, first: false },
      { id: 'reglages-20261126T211530Z.json', at: '2026-11-26T21:15:30.000Z', port: '/dev/ttyUSB0', firmware: 'Grbl 1.1f.20231030', profile: { label: 'LUNYEE 4040', kind: 'cnc' }, count: 12, first: true }
    ]);
  });

  test('the number of backups is bounded: the oldest ones go, never the very first', async () => {
    const { store, dir, clock } = make({ max: 4 });
    const ids = [];
    await each([0, 1, 2, 3, 4, 5, 6, 7, 8], async (i) => {
      ids.push((await store.save({ ...BOARD, settings: { ...LUNYEE, $30: String(1000 + i) } })).id);
      clock.now += 60000;
    });
    const kept = (await fs.readdir(dir)).sort();
    expect(kept).toEqual([ids[0], ids[6], ids[7], ids[8]]);
    const { backups } = await store.list();
    expect(backups.map((b) => b.id)).toEqual([ids[8], ids[7], ids[6], ids[0]]);
    expect(backups.map((b) => b.first)).toEqual([false, false, false, true]);
    // The reference still holds what the board said first.
    expect((await store.read(ids[0])).settings.$30).toBe('1000');
  });

  test('two saves within the same second are two files, in order', async () => {
    const { store, dir } = make();
    const a = await store.save(BOARD);
    const b = await store.save({ ...BOARD, settings: { ...LUNYEE, $30: '2000' } });
    expect([a.id, b.id]).toEqual(['reglages-20261126T211530Z.json', 'reglages-20261126T211530Z-2.json']);
    expect((await fs.readdir(dir)).length).toBe(2);
    expect((await store.list()).backups.map((x) => x.id)).toEqual([b.id, a.id]);
    expect((await store.read(a.id)).settings.$30).toBe('1000');
  });

  test('pruning never touches a file that is not a backup', async () => {
    const { store, dir, clock } = make({ max: 2 });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'notes.txt'), 'mine');
    await fs.writeFile(path.join(dir, 'reglages-old.json'), '{}');
    await each([0, 1, 2, 3], async () => {
      await store.save(BOARD);
      clock.now += 1000;
    });
    const names = (await fs.readdir(dir)).sort();
    expect(names).toEqual(['notes.txt', 'reglages-20261126T211530Z.json', 'reglages-20261126T211533Z.json', 'reglages-old.json']);
    expect((await store.list()).backups).toHaveLength(2);
  });

  test('a damaged file is listed as damaged and refused, an id outside the folder is refused', async () => {
    const { store, dir, clock } = make();
    const good = await store.save(BOARD);
    clock.now += 1000;
    await fs.writeFile(path.join(dir, 'reglages-20261126T211531Z.json'), '{"format":"cncjs-touch-settings-backup","at":"2026-11-26T21:15:31.000Z","settings":{"$0"');
    const { backups } = await store.list();
    expect(backups[0]).toEqual({ id: 'reglages-20261126T211531Z.json', damaged: true, first: false });
    expect(backups[1].id).toBe(good.id);
    await expect(store.read('reglages-20261126T211531Z.json')).rejects.toMatchObject({ code: 'EBACKUP_UNREADABLE', status: 404 });
    await expect(store.read('reglages-20270101T000000Z.json')).rejects.toMatchObject({ code: 'EBACKUP_UNREADABLE' });
    await each(['../.cncrc', '..\\reglages-20261126T211530Z.json', 'sub/reglages-20261126T211530Z.json', '', null, undefined, 12, 'notes.txt'], async (id) => {
      await expect(store.read(id)).rejects.toMatchObject({ code: 'EBACKUP_ID', status: 400 });
      await expect(store.compare(id, LUNYEE)).rejects.toMatchObject({ code: 'EBACKUP_ID' });
    });
  });
});

describe('settings backups: comparing the board with a backup', () => {
  test('the comparison lists what differs, old value then current value, in $n order', async () => {
    const { store } = make();
    const saved = await store.save(BOARD);
    const now = { ...LUNYEE, $130: '400.000', $23: '0', $39: '1' };
    delete now.$27;
    expect(await store.compare(saved.id, now)).toEqual({
      id: saved.id,
      at: '2026-11-26T21:15:30.000Z',
      firmware: 'Grbl 1.1f.20231030',
      changes: [
        { name: '$23', saved: '3', current: '0' },
        { name: '$27', saved: '2.000', current: null },
        { name: '$39', saved: null, current: '1' },
        { name: '$130', saved: '408.000', current: '400.000' }
      ],
      same: 9
    });
    expect((await store.compare(saved.id, LUNYEE)).changes).toEqual([]);
  });

  test('the same number written differently is not a change', () => {
    expect(diffSettings({ $100: '250.000', $10: '1' }, { $100: 250, $10: '1.0' })).toEqual({ changes: [], same: 2 });
    expect(diffSettings({ $100: '250.000' }, { $100: '250.001' }).changes).toEqual([{ name: '$100', saved: '250.000', current: '250.001' }]);
  });

  test('the drift counts what changed since the most recent readable backup, and says nothing without one', async () => {
    const { store, dir, clock } = make();
    expect(await store.drift(LUNYEE)).toBeNull();
    await store.save(BOARD);
    clock.now += 3600000;
    const last = await store.save({ ...BOARD, settings: { ...LUNYEE, $110: '4000.000' } });
    expect(await store.drift({ ...LUNYEE, $110: '4000.000' })).toEqual({ id: last.id, at: '2026-11-26T22:15:30.000Z', changed: 0 });
    expect(await store.drift({ ...LUNYEE, $110: '3000.000', $132: '120.000' })).toEqual({ id: last.id, at: '2026-11-26T22:15:30.000Z', changed: 2 });
    // Settings not read yet: no conclusion, never "everything changed".
    expect(await store.drift({})).toBeNull();
    // A newer damaged file is skipped.
    await fs.writeFile(path.join(dir, 'reglages-20261127T000000Z.json'), 'not json');
    expect((await store.drift({ ...LUNYEE, $110: '4000.000' })).id).toBe(last.id);
  });
});
