/* eslint-env jest */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHistory, parseLines, sanitize, HISTORY_FILE, MAX_ENTRIES, MAX_BYTES } from '../history';

let dir;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-touch-history-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

let counter = 0;
const fresh = () => path.join(dir, 'h' + (++counter) + '.jsonl');

const errors = [];
const make = (options = {}) => createHistory({ file: fresh(), now: () => 1700000000000, onError: (e) => errors.push(e), ...options });

describe('touch job history (F4)', () => {
  test('the default location is next to the .cncrc file', () => {
    const h = createHistory({ rcfile: path.join(dir, 'conf', '.cncrc') });
    expect(h.file).toBe(path.join(dir, 'conf', HISTORY_FILE));
  });

  test('records are written as JSON Lines, read most recent first, and survive a restart', async () => {
    const h = make();
    h.record({ event: 'start', jobId: 'a1', program: 'part.nc' });
    h.record({ event: 'finish', jobId: 'a1', result: 'finished' });
    h.record({ event: 'start', jobId: 'b2', program: 'other.nc' });
    await h.flush();
    const text = await fs.readFile(h.file, 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(3);
    expect(text.endsWith('\n')).toBe(true);
    const page = await h.read({ limit: 2 });
    expect(page.entries.map((e) => e.seq)).toEqual([3, 2]);
    expect(page.more).toBe(true);
    expect(page.total).toBe(3);
    expect(page.entries[0]).toMatchObject({ event: 'start', jobId: 'b2', at: '2023-11-14T22:13:20.000Z' });
    const older = await h.read({ limit: 10, before: 2 });
    expect(older.entries.map((e) => e.seq)).toEqual([1]);

    // A new instance (server restarted) reads the same file and continues the sequence.
    const again = createHistory({ file: h.file, now: () => 1700000001000 });
    again.record({ event: 'stop', jobId: 'b2' });
    await again.flush();
    const all = await again.read({ limit: 50 });
    expect(all.entries.map((e) => e.seq)).toEqual([4, 3, 2, 1]);
    expect(all.skipped).toBe(0);
  });

  test('a file truncated in the middle of a line (interrupted write) loses that line only', async () => {
    const h = make();
    h.record({ event: 'start', jobId: 'x' });
    h.record({ event: 'finish', jobId: 'x' });
    await h.flush();
    const text = await fs.readFile(h.file, 'utf8');
    await fs.writeFile(h.file, text.slice(0, text.length - 7));
    const again = createHistory({ file: h.file });
    const page = await again.read();
    expect(page.entries.map((e) => e.event)).toEqual(['start']);
    expect(page.skipped).toBe(1);
    // Recording goes on after the damaged tail, and the new line is readable.
    again.record({ event: 'stop', jobId: 'y' });
    await again.flush();
    const next = createHistory({ file: h.file });
    const all = await next.read();
    expect(all.entries.map((e) => e.event)).toEqual(['stop', 'start']);
    expect(all.entries[0].seq).toBe(2);
  });

  test('a corrupted line (not JSON, or not an entry) is skipped and counted', () => {
    const text = '{"seq":1,"event":"a"}\nnot json at all\n{"seq":2,"event":"b"}\n[1,2]\n"string"\n\n{"seq":3,"event":"c"}\n';
    const parsed = parseLines(text);
    expect(parsed.entries.map((e) => e.event)).toEqual(['a', 'b', 'c']);
    expect(parsed.skipped).toBe(3);
    expect(parseLines('')).toEqual({ entries: [], skipped: 0 });
  });

  test('rotation keeps the most recent entries within the count and size limits, atomically', async () => {
    const h = make({ maxEntries: 5 });
    for (let i = 1; i <= 12; i++) {
      h.record({ event: 'e' + i });
    }
    await h.flush();
    const page = await h.read({ limit: 50 });
    expect(page.entries.map((e) => e.event)).toEqual(['e12', 'e11', 'e10', 'e9', 'e8']);
    const text = await fs.readFile(h.file, 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(5);
    const files = await fs.readdir(dir);
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);

    // Size limit: a few big entries cannot grow the file past maxBytes.
    const small = make({ maxBytes: 2000 });
    for (let i = 0; i < 10; i++) {
      small.record({ event: 'big', payload: 'x'.repeat(280) });
    }
    await small.flush();
    const size = (await fs.stat(small.file)).size;
    expect(size).toBeLessThanOrEqual(2000);
    expect((await small.read()).entries.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('no secret reaches the file: tickets, tokens and credential-shaped values are dropped or masked', async () => {
    const h = make();
    h.record({
      event: 'start',
      jobId: 'short',
      nonce: 'deadbeef',
      ticket: { nonce: 'x' },
      token: 'abc',
      Authorization: 'Bearer zzz',
      actor: { kind: 'touch', id: 'tablet-1', label: 'Tablette', user: 'ana', password: 'p' },
      transportId: 'a'.repeat(32),
      fingerprint: 'sha256:' + 'b'.repeat(64),
      nested: { deeper: { more: { toodeep: { gone: 1 } } } }
    });
    await h.flush();
    const text = await fs.readFile(h.file, 'utf8');
    expect(text).not.toMatch(/deadbeef|Bearer|zzz|abc|"password"|aaaaaaaa/);
    const [entry] = (await h.read()).entries;
    expect(entry.nonce).toBeUndefined();
    expect(entry.ticket).toBeUndefined();
    expect(entry.token).toBeUndefined();
    expect(entry.Authorization).toBeUndefined();
    expect(entry.actor).toEqual({ kind: 'touch', id: 'tablet-1', label: 'Tablette', user: 'ana' });
    expect(entry.transportId).toBe('[masqué]');
    expect(entry.fingerprint).toBe('sha256:' + 'b'.repeat(64));
    expect(entry.nested.deeper.more.toodeep).toBeUndefined();
    expect(sanitize('x'.repeat(400))).toHaveLength(300);
    expect(sanitize(Infinity)).toBeNull();
  });

  test('recording never throws and never blocks: a write failure is reported, later records still work', async () => {
    const seen = [];
    const broken = createHistory({ file: path.join(dir, 'missing-dir', 'h.jsonl'), onError: (e) => seen.push(e) });
    expect(() => broken.record({ event: 'start' })).not.toThrow();
    await broken.flush();
    expect(seen).toHaveLength(1);
    expect(seen[0].code).toBe('ENOENT');
    // The entry is still returned synchronously (the caller can log it).
    const entry = broken.record({ event: 'stop' });
    expect(entry).toMatchObject({ event: 'stop' });
    await broken.flush();
    expect(seen).toHaveLength(2);
  });

  test('subscribers see each entry once written; dispose stops recording', async () => {
    const h = make();
    const got = [];
    h.subscribe((e) => got.push(e.seq));
    h.record({ event: 'a' });
    h.record({ event: 'b' });
    await h.flush();
    expect(got).toEqual([1, 2]);
    await h.dispose();
    expect(h.record({ event: 'c' })).toBeNull();
    expect((await createHistory({ file: h.file }).read()).total).toBe(2);
  });
});

describe('history (F4), cross-check 3', () => {
  let dir;
  let n = 0;
  const fresh = () => path.join(dir, 'h' + (++n) + '.jsonl');

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-xv3-history-'));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('relecture et lignes abîmées', () => {
    test('redémarrage : la nouvelle instance relit, continue la séquence, et une ligne non JSON au milieu est ignorée et comptée sans casser la suite', async () => {
      const file = fresh();
      const h1 = createHistory({ file, now: () => 1700000000000 });
      h1.record({ event: 'load', program: 'a.nc' });
      h1.record({ event: 'start', program: 'a.nc' });
      await h1.flush();
      // Corruption au milieu (secteur abîmé) : une ligne de bruit insérée, la fin reste propre.
      const lines = (await fs.readFile(file, 'utf8')).split('\n');
      lines.splice(1, 0, '{"seq": 1, "event": "start"', '\u0000\u0000garbage');
      await fs.writeFile(file, lines.join('\n'));
      const h2 = createHistory({ file, now: () => 1700000001000 });
      h2.record({ event: 'stop', program: 'a.nc' });
      await h2.flush();
      const page = await h2.read({ limit: 10 });
      expect(page.skipped).toBe(2);
      expect(page.entries.map((e) => [e.seq, e.event])).toEqual([[3, 'stop'], [2, 'start'], [1, 'load']]);
      // Relecture froide : identique.
      const h3 = createHistory({ file });
      expect((await h3.read()).entries.map((e) => e.seq)).toEqual([3, 2, 1]);
    });

    test('dernière ligne tronquée : perdue seule ; l’ajout suivant réécrit le fichier proprement (pas de collage)', async () => {
      const file = fresh();
      const h1 = createHistory({ file });
      h1.record({ event: 'a' });
      h1.record({ event: 'b' });
      await h1.flush();
      const text = await fs.readFile(file, 'utf8');
      await fs.writeFile(file, text.slice(0, -5));
      const h2 = createHistory({ file });
      h2.record({ event: 'c' });
      await h2.flush();
      const after = await fs.readFile(file, 'utf8');
      expect(after.endsWith('\n')).toBe(true);
      expect(after.split('\n').filter(Boolean).every((l) => JSON.parse(l))).toBe(true);
      expect((await createHistory({ file }).read()).entries.map((e) => e.event)).toEqual(['c', 'a']);
    });
  });

  describe('rotation aux limites par défaut', () => {
    test('MAX_ENTRIES = 500 : 505 entrées → 500 lignes, les 5 plus anciennes parties, aucun .tmp résiduel', async () => {
      expect(MAX_ENTRIES).toBe(500);
      const file = fresh();
      const h = createHistory({ file });
      for (let i = 1; i <= 505; i++) {
        h.record({ event: 'e', i });
      }
      await h.flush();
      const lines = (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean);
      expect(lines).toHaveLength(500);
      expect(JSON.parse(lines[0]).i).toBe(6);
      expect(JSON.parse(lines[499]).i).toBe(505);
      const page = await h.read({ limit: 1 });
      expect(page.total).toBe(500);
      expect(page.entries[0].seq).toBe(505);
      expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    }, 20000);

    test('MAX_BYTES = 1 Mio : des entrées de ~15 Ko déclenchent la rotation par taille avant 500 entrées ; le fichier reste ≤ 1 Mio et lisible', async () => {
      expect(MAX_BYTES).toBe(1048576);
      const file = fresh();
      const h = createHistory({ file });
      const big = {};
      for (let k = 0; k < 50; k++) {
        big['k' + k] = 'x'.repeat(290);
      }
      for (let i = 1; i <= 120; i++) {
        h.record({ event: 'big', i, ...big });
      }
      await h.flush();
      const size = (await fs.stat(file)).size;
      expect(size).toBeLessThanOrEqual(MAX_BYTES);
      const page = await createHistory({ file }).read({ limit: 200 });
      expect(page.skipped).toBe(0);
      expect(page.total).toBeLessThan(120);
      expect(page.total).toBeGreaterThan(50);
      expect(page.entries[0].i).toBe(120); // la plus récente est conservée
    }, 20000);
  });

  describe('secrets', () => {
    test('nonce, token, hex de 40 caractères, en-tête Authorization (imbriqué ou non), cookie, mot de passe : rien n’atteint le fichier', async () => {
      const file = fresh();
      const h = createHistory({ file });
      const hex40 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
      h.record({
        event: 'start',
        nonce: 'NONCE-SECRET-1',
        token: 'TOKEN-SECRET-2',
        transportId: hex40,
        headers: { Authorization: 'Bearer AUTH-SECRET-3', cookie: 'sid=COOKIE-SECRET-4' },
        actor: { kind: 'touch', id: 'tablet-1', password: 'PASS-SECRET-5', JWT: 'eyJ-SECRET-6' },
        list: ['NONCE-ok-value', hex40, { secret: 'LIST-SECRET-7' }]
      });
      await h.flush();
      const text = await fs.readFile(file, 'utf8');
      ['NONCE-SECRET-1', 'TOKEN-SECRET-2', hex40, 'AUTH-SECRET-3', 'COOKIE-SECRET-4', 'PASS-SECRET-5', 'eyJ-SECRET-6', 'LIST-SECRET-7'].forEach((s) => {
        expect(text).not.toContain(s);
      });
      const [entry] = (await h.read()).entries;
      expect(entry.transportId).toBe('[masqué]');
      expect(entry.list[1]).toBe('[masqué]');
      expect(entry.list[2]).toEqual({});
      expect(entry.headers).toEqual({});
      // Une valeur ordinaire sous une clé anodine reste lisible.
      expect(entry.list[0]).toBe('NONCE-ok-value');
    });

    // F4-b (corrigé) : une valeur de forme jeton (Bearer, JWT) est masquée
    // quelle que soit sa clé ; les libellés ordinaires restent intacts.
    test('un jeton JWT ou « Bearer … » placé sous une clé anodine (label) est masqué', async () => {
      const file = fresh();
      const h = createHistory({ file });
      h.record({
        event: 'x',
        label: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.sig',
        note: 'jeton eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.sig collé',
        clientLabel: 'Tablette atelier',
        reason: 'Opérateur parti, reprise du travail'
      });
      await h.flush();
      const text = await fs.readFile(file, 'utf8');
      expect(text).not.toContain('eyJ');
      expect(text).not.toContain('Bearer');
      const [entry] = (await h.read()).entries;
      expect(entry).toMatchObject({ label: '[masqué]', note: '[masqué]', clientLabel: 'Tablette atelier', reason: 'Opérateur parti, reprise du travail' });
    });
  });

  describe('écritures concurrentes et échec disque', () => {
    test('300 record() sans attente : sérialisés, seq 1..300 dans l’ordre, 300 lignes valides', async () => {
      const file = fresh();
      const h = createHistory({ file });
      const returned = [];
      for (let i = 1; i <= 300; i++) {
        returned.push(h.record({ event: 'e', i }));
      }
      const reader = h.read({ limit: 5 }); // une lecture lancée pendant les écritures attend la file
      await h.flush();
      const lines = (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      expect(lines.map((e) => e.seq)).toEqual(Array.from({ length: 300 }, (_, k) => k + 1));
      expect(lines.map((e) => e.i)).toEqual(Array.from({ length: 300 }, (_, k) => k + 1));
      expect(returned[299].seq).toBe(300); // l'entrée rendue est complétée après écriture
      expect((await reader).entries[0].seq).toBe(300);
    });

    // F4-a (corrigé) : après un échec d'écriture, la mémoire revient à ce que
    // le fichier contient ; aucune lecture n'annonce une entrée non écrite.
    test('fichier en lecture seule (attribut Windows / chmod 444) : record() ne lève pas, l’erreur est rapportée, la mémoire suit le disque, l’écriture reprend quand le disque le permet', async () => {
      const file = fresh();
      const errors = [];
      const h = createHistory({ file, onError: (e) => errors.push(e) });
      const onDisk = async () => (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l).event);
      h.record({ event: 'one' });
      await h.flush();
      await fs.chmod(file, 0o444);
      let threw = false;
      try {
        h.record({ event: 'two' });
        h.record({ event: 'three' });
      } catch (_) {
        threw = true;
      }
      expect(threw).toBe(false);
      await h.flush();
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(['EPERM', 'EACCES']).toContain(errors[0].code);
      // Ce que la mémoire annonce est exactement ce que le disque contient.
      const listed = (await h.read()).entries.map((e) => e.event).reverse();
      expect(listed).toEqual(await onDisk());
      expect(listed).toContain('one');
      expect(listed).not.toContain('two');
      await fs.chmod(file, 0o644);
      h.record({ event: 'four' });
      await h.flush();
      const after = (await h.read()).entries.map((e) => e.event).reverse();
      expect(after).toEqual(await onDisk());
      expect(after.slice(-1)).toEqual(['four']);
      // Relecture froide identique, séquence toujours croissante.
      const cold = await createHistory({ file }).read();
      expect(cold.entries.map((e) => e.event).reverse()).toEqual(after);
      expect(cold.entries[0].seq).toBe(4);
    });

    test('répertoire parent absent ou cible = dossier : rapporté, jamais levé', async () => {
      const errors = [];
      const asDir = path.join(dir, 'is-a-dir.jsonl');
      await fs.mkdir(asDir);
      const h = createHistory({ file: asDir, onError: (e) => errors.push(e) });
      h.record({ event: 'x' });
      await h.flush();
      expect(errors.length).toBeGreaterThanOrEqual(1);
      // (instanceof Error échoue entre les realms Jest/Node : on vérifie la forme.)
      expect(errors.every((e) => e && typeof e.message === 'string' && typeof e.code === 'string')).toBe(true);
      expect(['EISDIR', 'EPERM', 'EACCES']).toContain(errors[0].code);
    });
  });

  describe('pagination', () => {
    test('before/limit : bornes 1..200, before non numérique ignoré, before=1 → vide, more exact', async () => {
      const file = fresh();
      const h = createHistory({ file });
      for (let i = 1; i <= 12; i++) {
        h.record({ event: 'e', i });
      }
      await h.flush();
      expect((await h.read({ limit: 0 })).entries).toHaveLength(12); // 0 → défaut 50
      expect((await h.read({ limit: -3 })).entries).toHaveLength(1);
      expect((await h.read({ limit: 1000 })).entries).toHaveLength(12);
      expect((await h.read({ limit: '5', before: '8' })).entries.map((e) => e.seq)).toEqual([7, 6, 5, 4, 3]);
      expect((await h.read({ limit: 5, before: '8' })).more).toBe(true);
      expect((await h.read({ limit: 10, before: 8 })).more).toBe(false);
      expect((await h.read({ before: 'abc' })).entries).toHaveLength(12);
      expect((await h.read({ before: 1 })).entries).toEqual([]);
      expect((await h.read({ before: 0 })).entries).toEqual([]);
      expect((await h.read({ limit: 5 })).more).toBe(true);
      expect((await h.read({ limit: 12 })).more).toBe(false);
    });
  });
});
