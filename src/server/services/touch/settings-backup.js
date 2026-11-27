// Backups of the board's settings ($$) for the touch interface (lot N8): one
// dated JSON file per backup in a folder next to the CNCjs configuration (as
// the job history), a bounded number of them (the oldest ones are deleted,
// except the very first, kept as the reference), and a comparison of a backup
// with the settings the board gave at its last reading.
//
// "Oldest", "first" and "last" follow the order of writing (a counter in the
// file name), never the host's clock: a tablet whose clock went back must not
// lose its reference nor be compared with another backup than its last one.
//
// Read-only for the machine: nothing here writes to a controller, and there is
// no restoration. The settings come from the caller (what CNCjs read by `$$`).
import { promises as fs } from 'fs';
import path from 'path';

export const BACKUP_DIR = 'cncjs-touch-settings';
export const BACKUP_FORMAT = 'cncjs-touch-settings-backup';
export const MAX_BACKUPS = 20;

const MAX_SETTINGS = 400;
const MAX_FILE_BYTES = 262144;
const ID = /^reglages-(\d{4,9})-\d{8}T\d{6}Z\.json$/;
const NAME = /^\$\d{1,4}$/;

const failure = (code, message, status) => Object.assign(new Error(message), { code, status });

const short = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// `$n` in numeric order.
const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

// The numeric settings only (`$n`), each value as a short string, in order.
export const cleanSettings = (source) => {
  const out = {};
  const from = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const names = Object.keys(from).filter((k) => NAME.test(k)).sort(byNumber).slice(0, MAX_SETTINGS);
  names.forEach((k) => {
    const v = from[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = String(v);
    } else if (typeof v === 'string' && v.trim() !== '' && v.length < 32) {
      out[k] = v.trim();
    }
  });
  return out;
};

// Grbl prints `10.000` where another reading may hold `10`: two numbers are
// compared as numbers, anything else as text.
const sameValue = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  const x = Number(a);
  const y = Number(b);
  return a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && Number.isFinite(y) && x === y;
};

// What differs between a backup and the board: [{ name, saved, current }] in
// `$n` order; `saved` or `current` is null when the setting exists on one side only.
export const diffSettings = (saved, current) => {
  const a = cleanSettings(saved);
  const b = cleanSettings(current);
  const names = Object.keys({ ...a, ...b }).sort(byNumber);
  const changes = [];
  names.forEach((name) => {
    const before = name in a ? a[name] : null;
    const after = name in b ? b[name] : null;
    if (!sameValue(before, after)) {
      changes.push({ name, saved: before, current: after });
    }
  });
  return { changes, same: names.length - changes.length };
};

const pad = (n, width = 2) => String(n).padStart(width, '0');
const stamp = (ms) => {
  const d = new Date(ms);
  return pad(d.getUTCFullYear(), 4) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
};

// `options.dir` overrides the folder (tests); otherwise it sits next to `rcfile`.
export const createSettingsBackups = ({ rcfile, dir, now = Date.now, max = MAX_BACKUPS } = {}) => {
  const folder = dir || path.join(path.dirname(rcfile || path.join(process.cwd(), '.cncrc')), BACKUP_DIR);
  const limit = Math.max(2, Math.floor(max));
  // Every disk operation is chained here: a save and its pruning never overlap another one.
  let queue = Promise.resolve();
  const serial = (task) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };

  // Backup file names in the order they were written (the counter of the name).
  const rank = (name) => Number(ID.exec(name)[1]);
  const names = async () => {
    let entries = [];
    try {
      entries = await fs.readdir(folder);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    return entries.filter((name) => ID.test(name)).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  };

  const validId = (id) => {
    if (typeof id !== 'string' || !ID.test(id) || id !== path.basename(id)) {
      throw failure('EBACKUP_ID', 'Sauvegarde inconnue.', 400);
    }
    return id;
  };

  // A whole backup, or null when the file cannot be read as one.
  const load = async (id) => {
    let text;
    try {
      const file = path.join(folder, id);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        return null;
      }
      text = await fs.readFile(file, 'utf8');
    } catch (_) {
      return null;
    }
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT || typeof data.at !== 'string' || !Number.isFinite(Date.parse(data.at))) {
        return null;
      }
      const settings = cleanSettings(data.settings);
      const profile = data.profile && typeof data.profile === 'object' ? data.profile : {};
      return {
        format: BACKUP_FORMAT,
        version: 1,
        id,
        at: new Date(Date.parse(data.at)).toISOString(),
        port: short(data.port, 120),
        firmware: short(data.firmware, 64),
        profile: { label: short(profile.label, 60), kind: short(profile.kind, 16) },
        count: Object.keys(settings).length,
        settings
      };
    } catch (_) {
      return null;
    }
  };

  const meta = (id, backup, first) => (backup
    ? { id, at: backup.at, port: backup.port, firmware: backup.firmware, profile: backup.profile, count: backup.count, first }
    : { id, damaged: true, first });

  // Every backup in the order of writing; `reference` is the place of the first one that reads
  // (a damaged file is never the reference), -1 without any.
  const inOrder = async () => {
    const ids = await names();
    const loaded = await Promise.all(ids.map(load));
    return { ids, loaded, reference: loaded.findIndex(Boolean) };
  };

  // Last written first; `first` marks the reference kept whatever the number of backups.
  const listNow = async () => {
    const { ids, loaded, reference } = await inOrder();
    const backups = ids.map((id, i) => meta(id, loaded[i], i === reference));
    return { backups: backups.reverse(), max: limit, folder };
  };

  // More than `limit` files: the first written go, never the reference nor the last ones.
  const prune = async () => {
    const { ids, reference } = await inOrder();
    const extra = ids.filter((id, i) => i !== reference).slice(0, Math.max(0, ids.length - limit));
    await Promise.all(extra.map((id) => fs.unlink(path.join(folder, id)).catch(() => {})));
  };

  const saveNow = async ({ settings, firmware, profile, port } = {}) => {
    const clean = cleanSettings(settings);
    if (!Object.keys(clean).length) {
      throw failure('EBACKUP_NO_SETTINGS', 'Aucun réglage lu : relisez les réglages, machine au repos.', 409);
    }
    const at = now();
    const p = profile && typeof profile === 'object' ? profile : {};
    const backup = {
      format: BACKUP_FORMAT,
      version: 1,
      at: new Date(at).toISOString(),
      port: short(port, 120),
      firmware: short(firmware, 64),
      profile: { label: short(p.label, 60), kind: short(p.kind, 16) },
      count: Object.keys(clean).length,
      settings: clean
    };
    await fs.mkdir(folder, { recursive: true });
    const text = JSON.stringify(backup, null, 2) + '\n';
    // The counter follows the highest one in the folder: the date of the name is for the reader.
    const next = (await names()).reduce((n, name) => Math.max(n, rank(name)), 0) + 1;
    // Never replaces an existing backup (`wx`); a name taken meanwhile gets the following counter.
    // A write cut short leaves a file that reads as damaged, listed as such.
    const write = async (n) => {
      if (n > next + 8) {
        throw failure('EBACKUP_BUSY', 'Sauvegarde impossible pour l’instant : réessayez.', 409);
      }
      const candidate = 'reglages-' + pad(n, 4) + '-' + stamp(at) + '.json';
      try {
        await fs.writeFile(path.join(folder, candidate), text, { flag: 'wx' });
        return candidate;
      } catch (err) {
        if (err.code !== 'EEXIST') {
          throw err;
        }
        return write(n + 1);
      }
    };
    const id = await write(next);
    await prune();
    return { ...backup, id };
  };

  const readNow = async (id) => {
    const backup = await load(validId(id));
    if (!backup) {
      throw failure('EBACKUP_UNREADABLE', 'Sauvegarde introuvable ou illisible.', 404);
    }
    return backup;
  };

  const save = (data) => serial(() => saveNow(data));
  const list = () => serial(listNow);
  const read = (id) => serial(() => readNow(id));

  // The board (its settings as last read) against one backup.
  const compare = (id, current) => serial(async () => {
    const backup = await readNow(id);
    return { id: backup.id, at: backup.at, firmware: backup.firmware, ...diffSettings(backup.settings, current) };
  });

  // How many settings differ from the last written readable backup; null without
  // a backup or without settings read from the board (nothing is concluded).
  const drift = (current) => serial(async () => {
    if (!Object.keys(cleanSettings(current)).length) {
      return null;
    }
    const ids = (await names()).reverse();
    const backup = (await Promise.all(ids.map(load))).find(Boolean);
    return backup ? { id: backup.id, at: backup.at, changed: diffSettings(backup.settings, current).changes.length } : null;
  });

  return { folder, save, list, read, compare, drift };
};

export default { createSettingsBackups, cleanSettings, diffSettings, BACKUP_DIR, BACKUP_FORMAT, MAX_BACKUPS };
