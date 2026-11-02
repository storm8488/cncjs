/* eslint-env jest */
/* eslint-disable no-await-in-loop */
// Project sheets (F3) and compensation provenance (F6) over the real monitor in
// a temporary watch directory.
import fs from 'fs';
import os from 'os';
import path from 'path';
import monitor from '../../monitor';
import * as projects from '../projects';
import { STORE_NAME, LIMITS, summarizeProbe } from '../projects';
import { fingerprint } from '../program-identity';

const write = (dir, name, text) => fs.writeFileSync(path.join(dir, name), text);
const waitConfigured = () => new Promise((resolve, reject) => {
  const deadline = Date.now() + 2000;
  const poll = () => {
    if (monitor.isConfigured()) {
      resolve();
    } else if (Date.now() > deadline) {
      reject(new Error('monitor did not become configured'));
    } else {
      setTimeout(poll, 20);
    }
  };
  poll();
});
const code = (promise) => promise.then(() => 'resolved', (err) => err.code);
const GRID = ['0 0 -0.1 0 0 0 0 0 0', '10 0 0 0 0 0 0 0 0', '20 0 0.05 0 0 0 0 0 0',
  '0 15 -0.2 0 0 0 0 0 0', '10 15 0 0 0 0 0 0 0', '20 15 0.1 0 0 0 0 0 0'].join('\n');

describe('touch project sheets', () => {
  let dir;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-projects-'));
    write(dir, 'part.nc', 'G21 G90\nG0 X0 Y0\nG1 X10 F300\n');
    write(dir, 'AL_part.nc', 'G21 G90\nG0 X0 Y0 Z0.1\nG1 X10 Z0.05 F300\n');
    write(dir, 'other.nc', 'G0 X1\n');
    monitor.start({ watchDirectory: dir });
    await waitConfigured();
  });

  afterAll(() => {
    monitor.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const fp = (name) => fingerprint(fs.readFileSync(path.join(dir, name)));
  const store = () => JSON.parse(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8'));

  test('a file without a sheet reads as none, and the store does not exist yet', async () => {
    const res = await projects.read('part.nc');
    expect(res).toMatchObject({ file: 'part.nc', version: 'none', entry: null, fingerprint: fp('part.nc') });
    expect(fs.existsSync(path.join(dir, STORE_NAME))).toBe(false);
    expect((await projects.list()).entries).toEqual([]);
  });

  test('a sheet is stored with the fingerprint of the file it describes', async () => {
    const res = await projects.write({
      file: 'part.nc',
      fingerprint: fp('part.nc'),
      meta: { material: ' MDF 10 mm ', tool: 'Fraise 3 mm 2 dents', stock: { x: 200, y: 100.0004, z: 10 }, notes: 'Brides à gauche\r\nZ0 dessus', favorite: true, related: ['other.nc', 'part.nc', 'other.nc'] }
    });
    expect(res.version).toBe('current');
    expect(res.entry).toMatchObject({
      file: 'part.nc',
material: 'MDF 10 mm',
tool: 'Fraise 3 mm 2 dents',
stock: { x: 200, y: 100, z: 10 },
      notes: 'Brides à gauche\nZ0 dessus',
favorite: true,
related: ['other.nc'],
fingerprint: fp('part.nc')
    });
    const saved = store();
    expect(saved.version).toBe(1);
    expect(saved.entries['part.nc'].fingerprint).toBe(fp('part.nc'));
    // A sheet carries no feed, spindle or machine setting.
    expect(Object.keys(saved.entries['part.nc']).sort()).toEqual(['compensation', 'favorite', 'file', 'fingerprint', 'ino', 'material', 'mtimeMs', 'notes', 'related', 'size', 'stock', 'tool', 'updatedAt'].sort());
    const listed = await projects.list();
    expect(listed.entries.map((e) => [e.file, e.version])).toEqual([['part.nc', 'current']]);
  });

  test('a partial update changes only the fields it names', async () => {
    const res = await projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { favorite: false } });
    expect(res.entry).toMatchObject({ favorite: false, material: 'MDF 10 mm', related: ['other.nc'] });
  });

  test('the file a caller annotates must be the one on disk', async () => {
    expect(await code(projects.write({ file: 'part.nc', fingerprint: 'sha256:' + '0'.repeat(64), meta: { notes: 'x' } }))).toBe('ECHANGED');
    expect(await code(projects.write({ file: 'part.nc', meta: { notes: 'x' } }))).toBe('ECHANGED');
    expect(store().entries['part.nc'].notes).toBe('Brides à gauche\nZ0 dessus');
  });

  test('a changed file reports its sheet as another version and never reapplies it silently', async () => {
    const before = fp('part.nc');
    // Same length, so only the fingerprint can tell.
    write(dir, 'part.nc', 'G21 G90\nG0 X0 Y0\nG1 X20 F300\n');
    expect(fp('part.nc')).not.toBe(before);
    const res = await projects.read('part.nc');
    expect(res.version).toBe('other');
    expect(res.entry.fingerprint).toBe(before);
    expect((await projects.list()).entries[0].version).toBe('other');
    // Editing is refused until the operator keeps the sheet for this version.
    expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { notes: 'nouvelle' } }))).toBe('EOTHERVERSION');
    expect(store().entries['part.nc'].fingerprint).toBe(before);
    const kept = await projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), adopt: true });
    expect(kept.version).toBe('current');
    expect(kept.entry).toMatchObject({ fingerprint: fp('part.nc'), material: 'MDF 10 mm' });
    expect((await projects.read('part.nc')).version).toBe('current');
  });

  test('a file touched without a change keeps its sheet current', async () => {
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(dir, 'part.nc'), later, later);
    expect((await projects.list()).entries.find((e) => e.file === 'part.nc').version).toBe('current');
    expect((await projects.read('part.nc')).version).toBe('current');
  });

  test('invalid names and fields are refused with a code, nothing written', async () => {
    const text = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
    for (const name of ['../part.nc', 'sub/part.nc', '', '.cnctouch-projects.json', 'part.nc.cnctouch.json', 'a\0b.nc', 42]) {
      expect(await code(projects.read(name))).toBe('EINVALIDNAME');
      expect(await code(projects.write({ file: name, fingerprint: fp('part.nc'), meta: { notes: 'x' } }))).toBe('EINVALIDNAME');
    }
    const bad = [
      { material: 'x'.repeat(LIMITS.material + 1) },
      { tool: 'ligne\nautre' },
      { notes: 'n'.repeat(LIMITS.notes + 1) },
      { stock: { x: -1 } },
      { stock: { x: 'abc' } },
      { stock: { z: LIMITS.stockMm + 1 } },
      { favorite: 'oui' },
      { related: ['../x.nc'] },
      { related: Array.from({ length: LIMITS.related + 1 }, (_, i) => `f${i}.nc`) },
      { feed: 1000, material: 'x'.repeat(200) }
    ];
    for (const meta of bad) {
      expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta }))).toBe('EINVALID');
    }
    expect(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8')).toBe(text);
  });

  test('unknown fields such as a feed or a spindle speed are ignored, never stored', async () => {
    const res = await projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { feed: 5000, spindle: 24000, settings: { $110: 1 } } });
    expect(res.entry.feed).toBeUndefined();
    expect(store().entries['part.nc'].spindle).toBeUndefined();
  });

  test('the store is bounded in entries and bytes', async () => {
    const entries = {};
    for (let i = 0; i < LIMITS.entries; i++) {
      entries[`f${i}.nc`] = { file: `f${i}.nc`, notes: 'x', fingerprint: 'sha256:' + '1'.repeat(64) };
    }
    entries['part.nc'] = store().entries['part.nc'];
    const saved = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
    fs.writeFileSync(path.join(dir, STORE_NAME), JSON.stringify({ version: 1, entries }));
    expect(await code(projects.write({ file: 'other.nc', fingerprint: fp('other.nc'), meta: { notes: 'x' } }))).toBe('ETOOMANY');
    // An existing sheet can still be edited, and an oversized result is refused.
    expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { notes: 'y' } }))).toBe('resolved');
    fs.writeFileSync(path.join(dir, STORE_NAME), saved);
    const big = {};
    for (let i = 0; i < 1200; i++) {
      big[`n${i}.nc`] = { file: `n${i}.nc`, notes: 'z'.repeat(1990), fingerprint: 'sha256:' + '1'.repeat(64) };
    }
    big['part.nc'] = JSON.parse(saved).entries['part.nc'];
    fs.writeFileSync(path.join(dir, STORE_NAME), JSON.stringify({ version: 1, entries: big }));
    expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { notes: 'w' } }))).toBe('ETOOLARGE');
    fs.writeFileSync(path.join(dir, STORE_NAME), saved);
  });

  test('an unreadable store is reported and never overwritten', async () => {
    const saved = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
    fs.writeFileSync(path.join(dir, STORE_NAME), '{ not json');
    expect(await code(projects.list())).toBe('ECORRUPT');
    expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { notes: 'x' } }))).toBe('ECORRUPT');
    expect(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8')).toBe('{ not json');
    fs.writeFileSync(path.join(dir, STORE_NAME), saved);
  });

  test('writes are atomic: a failed write keeps the previous store whole and leaves no temporary', async () => {
    const saved = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
    const spy = jest.spyOn(fs, 'rename').mockImplementation((from, to, cb) => cb(Object.assign(new Error('disk'), { code: 'EIO' })));
    try {
      expect(await code(projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { notes: 'perdu' } }))).toBe('EIO');
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8')).toBe(saved);
    expect(fs.readdirSync(dir).filter((n) => /\.tmp$/.test(n))).toEqual([]);
    // Two writes at once: both land, one after the other.
    await Promise.all([
      projects.write({ file: 'part.nc', fingerprint: fp('part.nc'), meta: { material: 'Chêne' } }),
      projects.write({ file: 'other.nc', fingerprint: fp('other.nc'), meta: { material: 'Alu' } })
    ]);
    expect(store().entries['part.nc'].material).toBe('Chêne');
    expect(store().entries['other.nc'].material).toBe('Alu');
  });

  test('meta null removes a sheet, also for a file gone from the library', async () => {
    write(dir, 'gone.nc', 'G0 X2\n');
    await projects.write({ file: 'gone.nc', fingerprint: fp('gone.nc'), meta: { notes: 'temporaire' } });
    fs.unlinkSync(path.join(dir, 'gone.nc'));
    expect((await projects.list()).entries.find((e) => e.file === 'gone.nc').version).toBe('missing');
    expect(await code(projects.read('gone.nc'))).toBe('ENOENT');
    await projects.write({ file: 'gone.nc', meta: null });
    expect(store().entries['gone.nc']).toBeUndefined();
    // Clearing every field removes the sheet too.
    await projects.write({ file: 'other.nc', fingerprint: fp('other.nc'), meta: { material: '' } });
    expect(store().entries['other.nc']).toBeUndefined();
  });

  describe('compensation provenance (F6)', () => {
    test('the probe summary follows the Autolevel file format', () => {
      expect(summarizeProbe(GRID)).toMatchObject({
        points: 6,
columns: 3,
rows: 2,
regular: true,
xMin: 0,
xMax: 20,
yMin: 0,
yMax: 15,
stepX: 10,
stepY: 15,
zMin: -0.2,
zMax: 0.1,
units: 'mm',
        fingerprint: fingerprint(GRID)
      });
      // Quantised readings (59.999 for 60) stay one grid line.
      expect(summarizeProbe('0 0 0\n60 0 0\n59.9995 10 0\n0 10 0').columns).toBe(2);
      expect(() => summarizeProbe('0 0 0\n1 1')).toThrow(/ligne 2/);
      expect(() => summarizeProbe('0 0 0\n1 1 1')).toThrow(/au moins 3/);
      expect(() => summarizeProbe('')).toThrow(/vide/);
    });

    test('a compensated file records its original, grid, frame, tool and profile', async () => {
      const res = await projects.write({
        file: 'AL_part.nc',
        fingerprint: fp('AL_part.nc'),
        meta: {
          tool: 'V 30°',
          compensation: {
            original: 'part.nc',
            probe: { name: 'part.probe', text: GRID, probedAt: '2026-10-30T08:00:00.000Z' },
            capture: { wcs: 'G54', reportUnits: 'mm', offset: { x: -150.0004, y: -100, z: -40.5 } },
            tool: 'V 30°',
            probeProfile: { name: 'Plaque', revision: 'abc123' }
          }
        }
      });
      const c = res.entry.compensation;
      expect(c).toMatchObject({
        original: 'part.nc',
originalFingerprint: fp('part.nc'),
originalVersion: 'current',
engine: 'cncjs-autolevel',
        probedAt: '2026-10-30T08:00:00.000Z',
capture: { wcs: 'G54', reportUnits: 'mm', offset: { x: -150, y: -100, z: -40.5 } },
        tool: 'V 30°',
probeProfile: { name: 'Plaque', revision: 'abc123' }
      });
      expect(c.grid).toMatchObject({ name: 'part.probe', points: 6, stepX: 10, stepY: 15, units: 'mm' });
      // The points are not stored, only their summary and fingerprint.
      expect(JSON.stringify(store().entries['AL_part.nc'])).not.toContain('0 15 -0.2');
      // Editing the sheet without naming the compensation keeps it.
      const edited = await projects.write({ file: 'AL_part.nc', fingerprint: fp('AL_part.nc'), meta: { notes: 'ok' } });
      expect(edited.entry.compensation.grid.points).toBe(6);
    });

    test('an original changed since the compensation is reported', async () => {
      write(dir, 'part.nc', 'G21 G90\nG0 X0 Y0\nG1 X30 F300\n');
      const res = await projects.read('AL_part.nc');
      expect(res.version).toBe('current');
      expect(res.entry.compensation.originalVersion).toBe('other');
      fs.unlinkSync(path.join(dir, 'part.nc'));
      expect((await projects.read('AL_part.nc')).entry.compensation.originalVersion).toBe('missing');
    });

    test('a compensation needs an original present in the library and a valid grid', async () => {
      const base = { file: 'AL_part.nc', fingerprint: fp('AL_part.nc') };
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'part.nc', probe: { text: GRID } } } }))).toBe('ENOORIGINAL');
      write(dir, 'part.nc', 'G21 G90\nG0 X0 Y0\nG1 X10 F300\n');
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'AL_part.nc', probe: { text: GRID } } } }))).toBe('EINVALID');
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'part.nc' } } }))).toBe('EINVALID');
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'part.nc', probe: { text: 'x'.repeat(LIMITS.probeText + 1) } } } }))).toBe('ETOOLARGE');
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'part.nc', probe: { text: GRID }, capture: { wcs: 'G53', reportUnits: 'mm', offset: { x: 0, y: 0, z: 0 } } } } }))).toBe('EINVALID');
      expect(await code(projects.write({ ...base, meta: { compensation: { original: 'part.nc', probe: { text: GRID, probedAt: '2099-01-01' } } } }))).toBe('EINVALID');
      // null removes the provenance only.
      const res = await projects.write({ ...base, meta: { compensation: null } });
      expect(res.entry.compensation).toBeNull();
      expect(res.entry.notes).toBe('ok');
    });
  });
});

// Final server cross-check (xvf) of 33b32db9, integrated (own helpers, scoped).
describe('projects, final cross-check', () => {
  const waitConfigured = () => new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000;
    const poll = () => {
      if (monitor.isConfigured()) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error('monitor not configured'));
      } else {
        setTimeout(poll, 20);
      }
    };
    poll();
  });
  const code = (promise) => promise.then(() => 'resolved', (err) => err.code);

  describe('projects, final cross-check (xvf): concurrence, chemins, fichier changé, vrai moniteur', () => {
    let dir;
    let outside;
    const fp = (name) => fingerprint(fs.readFileSync(path.join(dir, name)));
    const store = () => JSON.parse(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8'));

    beforeAll(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xvf-projects-'));
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'xvf-outside-'));
      ['a.nc', 'b.nc', 'c.nc', 'same.nc'].forEach((n) => fs.writeFileSync(path.join(dir, n), 'G21 G90\nG0 X1 ; ' + n + '\n'));
      fs.writeFileSync(path.join(outside, 'secret.nc'), 'G0 X999\n');
      monitor.start({ watchDirectory: dir });
      await waitConfigured();
      // The monitor of the suite above may still answer for its own (removed)
      // directory for a moment: wait until this one serves its files.
      const deadline = Date.now() + 5000;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const seen = await monitor.fingerprintOf('a.nc').then(() => true, () => false);
        if (seen || Date.now() > deadline) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      }
    });

    afterAll(() => {
      monitor.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    });

    test('20 écritures simultanées sur 3 fichiers : toutes gardées, magasin JSON valide, aucun temporaire', async () => {
      const jobs = [];
      for (let i = 0; i < 20; i++) {
        const file = ['a.nc', 'b.nc', 'c.nc'][i % 3];
        jobs.push(projects.write({ file, fingerprint: fp(file), meta: { notes: 'n' + i } }));
      }
      const results = await Promise.all(jobs);
      expect(results.every((r) => r.version === 'current')).toBe(true);
      const s = store();
      // Dernière écriture de chaque fichier (ordre d'arrivée conservé par la file).
      expect(s.entries['a.nc'].notes).toBe('n18');
      expect(s.entries['b.nc'].notes).toBe('n19');
      expect(s.entries['c.nc'].notes).toBe('n17');
      expect(fs.readdirSync(dir).filter((n) => !/\.nc$/.test(n) && n !== STORE_NAME)).toEqual([]);
    });

    test('deux clients, champs différents en même temps : fusion ; même champ : le dernier gagne sans avertissement', async () => {
      const f = fp('same.nc');
      await Promise.all([
        projects.write({ file: 'same.nc', fingerprint: f, meta: { material: 'MDF' } }),
        projects.write({ file: 'same.nc', fingerprint: f, meta: { tool: 'fraise 3 mm' } })
      ]);
      expect(store().entries['same.nc']).toMatchObject({ material: 'MDF', tool: 'fraise 3 mm' });
      const [first, second] = await Promise.all([
        projects.write({ file: 'same.nc', fingerprint: f, meta: { notes: 'client A' } }),
        projects.write({ file: 'same.nc', fingerprint: f, meta: { notes: 'client B' } })
      ]);
      expect(first.entry.notes).toBe('client A');
      expect(second.entry.notes).toBe('client B');
      expect(store().entries['same.nc'].notes).toBe('client B');
    });

    test('noms hors bibliothèque refusés, rien écrit', async () => {
      const before = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
      for (const file of ['../' + path.basename(outside) + '/secret.nc', path.join(outside, 'secret.nc'), '..\\x.nc', STORE_NAME, '.hidden.nc', 'a.nc\0']) {
        expect(await code(projects.write({ file, fingerprint: fp('a.nc'), meta: { notes: 'x' } }))).toBe('EINVALIDNAME');
      }
      expect(fs.readFileSync(path.join(dir, STORE_NAME), 'utf8')).toBe(before);
    });

    test('lien vers un fichier hors bibliothèque : refusé comme absent (si le système permet le lien)', async () => {
      let linked = true;
      try {
        fs.symlinkSync(path.join(outside, 'secret.nc'), path.join(dir, 'link.nc'));
      } catch (err) {
        linked = false;
      }
      if (!linked) {
        // Windows sans privilège : EPERM, rien à vérifier ici.
        expect(linked).toBe(false);
        return;
      }
      expect(await code(projects.read('link.nc'))).toBe('ENOENT');
      expect(await code(projects.write({ file: 'link.nc', fingerprint: fingerprint(fs.readFileSync(path.join(outside, 'secret.nc'))), meta: { notes: 'x' } }))).toBe('ENOENT');
    });

    test('magasin remplacé par un dossier : illisible, jamais écrasé', async () => {
      const saved = fs.readFileSync(path.join(dir, STORE_NAME), 'utf8');
      fs.rmSync(path.join(dir, STORE_NAME));
      fs.mkdirSync(path.join(dir, STORE_NAME));
      expect(await code(projects.write({ file: 'a.nc', fingerprint: fp('a.nc'), meta: { notes: 'y' } }))).toBe('ECORRUPT');
      expect(fs.statSync(path.join(dir, STORE_NAME)).isDirectory()).toBe(true);
      fs.rmdirSync(path.join(dir, STORE_NAME));
      fs.writeFileSync(path.join(dir, STORE_NAME), saved);
    });

    // Sur NTFS, utimes ne rend pas la date au 100 ns près : l'identité diffère et la
    // liste détecte aussi le changement. Sur FAT32 (date à 2 s) la liste pourrait dire « current ».
    test('fichier modifié en place, même taille, date remise : liste et lecture disent « other » ici (NTFS)', async () => {
      const file = path.join(dir, 'b.nc');
      const st = fs.statSync(file);
      const text = fs.readFileSync(file, 'utf8');
      const changed = text.replace('X1', 'X9');
      expect(changed.length).toBe(text.length);
      fs.writeFileSync(file, changed);
      fs.utimesSync(file, st.atime, st.mtime);
      const listed = (await projects.list()).entries.find((e) => e.file === 'b.nc');
      const read = await projects.read('b.nc');
      expect(listed.version).toBe('other');
      expect(read.version).toBe('other');
    });
  });
});
