/* eslint-env jest */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHistory, parseLines, sanitize, HISTORY_FILE } from '../history';

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
