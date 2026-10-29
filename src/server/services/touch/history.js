// Durable job history for the touch interface: a bounded JSON Lines file next
// to the CNCjs configuration (one line per job event), written asynchronously
// and serialized so that recording never blocks machine control. Reading is
// tolerant: a truncated last line (the process died mid-write) or a corrupted
// line is skipped and counted, never fatal.
import { promises as fs } from 'fs';
import path from 'path';

export const HISTORY_FILE = 'cncjs-touch-history.jsonl';

// Retention: at most this many entries and about this many bytes; the file is
// rewritten (temporary file, then rename) with the most recent entries when a
// record pushes it over either limit.
export const MAX_ENTRIES = 500;
export const MAX_BYTES = 1048576;

// Keys that never reach the file whatever object is recorded (confirmation
// tickets, session tokens, passwords); matched case-insensitively.
const SECRET_KEYS = /^(nonce|ticket|token|authorization|password|secret|jwt|cookie)$/i;
// A long hexadecimal string is a credential-shaped value (nonce, transport id).
const SECRET_SHAPE = /^[0-9a-f]{32,}$/i;

const MAX_STRING = 300;
const MAX_DEPTH = 4;

// Deep copy of an entry without secrets, oversized strings or deep nesting.
export const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return SECRET_SHAPE.test(value) ? '[masqué]' : value.slice(0, MAX_STRING);
  }
  if (depth >= MAX_DEPTH) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (!SECRET_KEYS.test(key)) {
        const v = sanitize(value[key], depth + 1);
        if (v !== null) {
          out[key] = v;
        }
      }
    });
    return out;
  }
  return null;
};

// Parses the file content: entries in file order, plus the count of lines that
// could not be read (partial last line without newline, invalid JSON).
export const parseLines = (text) => {
  const entries = [];
  let skipped = 0;
  const source = String(text);
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === lines.length - 1) {
      // After the last newline: empty, or a line the process died while writing.
      if (line !== '') {
        skipped += 1;
      }
      continue;
    }
    if (line.trim() === '') {
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && Number.isInteger(entry.seq)) {
        entries.push(entry);
      } else {
        skipped += 1;
      }
    } catch (_) {
      skipped += 1;
    }
  }
  return { entries, skipped };
};

// `options.file` overrides the location (tests); otherwise the file sits next
// to `rcfile`. `options.now` gives the wall-clock time of an event.
export const createHistory = ({ rcfile, file, now = Date.now, maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES, onError } = {}) => {
  const target = file || path.join(path.dirname(rcfile || path.join(process.cwd(), '.cncrc')), HISTORY_FILE);
  let entries = null;
  let skipped = 0;
  let seq = 0;
  let bytes = 0;
  let damagedTail = false;
  // Every disk operation is chained here: records never overlap or block.
  let queue = Promise.resolve();
  let disposed = false;
  const listeners = new Set();

  const report = (err) => {
    if (typeof onError === 'function') {
      onError(err);
    }
  };

  const load = async () => {
    if (entries !== null) {
      return;
    }
    let text = '';
    try {
      text = await fs.readFile(target, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        report(err);
      }
    }
    const parsed = parseLines(text);
    entries = parsed.entries.slice(-maxEntries);
    skipped = parsed.skipped;
    seq = entries.reduce((max, e) => Math.max(max, e.seq), 0);
    bytes = Buffer.byteLength(text);
    // A tail without newline would swallow the next appended line too.
    damagedTail = text.length > 0 && !text.endsWith('\n');
  };

  const rewrite = async () => {
    const temp = target + '.' + process.pid + '.' + now() + '.tmp';
    const text = entries.map((e) => JSON.stringify(e) + '\n').join('');
    await fs.writeFile(temp, text, { flag: 'wx' });
    try {
      await fs.rename(temp, target);
    } catch (err) {
      await fs.unlink(temp).catch(() => {});
      throw err;
    }
    bytes = Buffer.byteLength(text);
    damagedTail = false;
  };

  const append = async (entry) => {
    await load();
    const line = JSON.stringify(entry) + '\n';
    entries.push(entry);
    bytes += Buffer.byteLength(line);
    if (damagedTail || entries.length > maxEntries || bytes > maxBytes) {
      entries = entries.slice(-maxEntries);
      while (entries.length > 1 && bytes > maxBytes) {
        bytes -= Buffer.byteLength(JSON.stringify(entries[0]) + '\n');
        entries.shift();
      }
      await rewrite();
      return;
    }
    await fs.appendFile(target, line);
  };

  // Records an event; returns the entry as it will be written. Never throws
  // and never waits for the disk: failures go to `onError`.
  const record = (event) => {
    if (disposed) {
      return null;
    }
    const entry = { ...sanitize(event), seq: 0, at: new Date(now()).toISOString() };
    queue = queue.then(async () => {
      await load();
      seq += 1;
      entry.seq = seq;
      await append(entry);
      listeners.forEach((fn) => fn(entry));
    }).catch(report);
    return entry;
  };

  // Most recent first; `before` is a `seq` cursor (entries older than it).
  const read = async ({ limit = 50, before } = {}) => {
    await queue;
    await load();
    const n = Math.max(1, Math.min(200, Number(limit) || 50));
    let list = entries;
    if (Number.isFinite(Number(before)) && before !== null && before !== undefined && before !== '') {
      list = entries.filter((e) => e.seq < Number(before));
    }
    const page = list.slice(-n).reverse();
    return { entries: page, total: entries.length, skipped, more: list.length > n, file: target };
  };

  // Resolves once every record so far is on disk (tests, shutdown).
  const flush = () => queue;

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const dispose = () => {
    disposed = true;
    listeners.clear();
    return queue;
  };

  return { file: target, record, read, flush, subscribe, dispose };
};

export default { createHistory, parseLines, sanitize, HISTORY_FILE, MAX_ENTRIES, MAX_BYTES };
