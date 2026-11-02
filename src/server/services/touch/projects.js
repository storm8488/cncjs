// Project sheets of the shared library (F3), and the provenance of a file
// compensated by CNCjs's Autolevel (F6).
//
// One JSON file beside the programs, `.cnctouch-projects.json` in the watch
// directory, written through the monitor (temporary file, then rename: a
// failed write leaves the previous version whole). Each sheet is bound to the
// SHA-256 fingerprint of the program it describes: when the file changes, the
// sheet is reported as describing another version (`version: 'other'`) and is
// never silently carried over; only an explicit `adopt` binds it to the
// current bytes.
//
// A sheet is descriptive only. Nothing here reads or writes feeds, spindle
// speeds, machine settings or the program itself.
import path from 'path';
import monitor from '../monitor';
import { fingerprint as fingerprintOfText, isFingerprint, sameProgram } from './program-identity';

export const STORE_NAME = '.cnctouch-projects.json';
const STORE_VERSION = 1;
export const LIMITS = {
  entries: 500,
  storeBytes: 2 * 1024 * 1024,
  name: 255,
  material: 80,
  tool: 80,
  notes: 2000,
  related: 10,
  stockMm: 10000,
  probeText: 512 * 1024,
  probePoints: 10000,
  probeName: 255,
  profileName: 60
};
// Grid nodes closer than this along an axis are the same grid line (mm).
const GRID_EPSILON = 0.001;

const failure = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};
const invalid = (message) => failure('EINVALID', message);

// A plain name directly inside the library, never the store or a preview sidecar.
const validName = (name) => {
  if (typeof name !== 'string' || !name || name.length > LIMITS.name || name !== path.basename(name) ||
      name === '.' || name === '..' || name.indexOf('\0') >= 0 || /[\\/]/.test(name) ||
      name.charAt(0) === '.' || /\.cnctouch\.json$/i.test(name)) {
    throw failure('EINVALIDNAME', 'Nom de fichier invalide.');
  }
  return name;
};

// Control characters other than tab and line feed (checked by code: no control character in a regex).
const hasControl = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10) || c === 127) {
      return true;
    }
  }
  return false;
};
const shortText = (value, max, label) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw invalid(`${label} : texte attendu.`);
  }
  const s = value.trim();
  if (s.length > max) {
    throw invalid(`${label} : ${max} caractères au plus.`);
  }
  if (/[\n\r\t]/.test(s) || hasControl(s)) {
    throw invalid(`${label} : caractères de contrôle refusés.`);
  }
  return s;
};
const notesText = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw invalid('Notes : texte attendu.');
  }
  const s = value.replace(/\r\n?/g, '\n').trim();
  if (s.length > LIMITS.notes) {
    throw invalid(`Notes : ${LIMITS.notes} caractères au plus.`);
  }
  if (hasControl(s.replace(/\t/g, ''))) {
    throw invalid('Notes : caractères de contrôle refusés.');
  }
  return s;
};
const round3 = (n) => Math.round(n * 1000) / 1000;

// Stock dimensions in mm: each axis a positive number up to 10 m, or null.
const stockOf = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('Brut : dimensions X, Y, Z attendues.');
  }
  const out = {};
  ['x', 'y', 'z'].forEach((axis) => {
    const v = value[axis];
    if (v === null || v === undefined || v === '') {
      out[axis] = null;
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > LIMITS.stockMm) {
      throw invalid(`Brut ${axis.toUpperCase()} : nombre de 0 à ${LIMITS.stockMm} mm attendu.`);
    }
    out[axis] = round3(v);
  });
  return out.x === null && out.y === null && out.z === null ? null : out;
};

const relatedOf = (value, self) => {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalid('Fichiers associés : liste de noms attendue.');
  }
  const out = [];
  value.forEach((name) => {
    try {
      validName(name);
    } catch (err) {
      throw invalid('Fichiers associés : nom invalide.');
    }
    if (name !== self && out.indexOf(name) < 0) {
      out.push(name);
    }
  });
  if (out.length > LIMITS.related) {
    throw invalid(`Fichiers associés : ${LIMITS.related} au plus.`);
  }
  return out;
};

// Summary of an Autolevel probe file as CNCjs writes it (one point per line,
// `x y z a b c u v w`, work coordinates in mm: GrblController converts PRB
// reports to mm whatever $13 says). The points themselves are not stored.
export const summarizeProbe = (text) => {
  if (typeof text !== 'string' || !text.trim()) {
    throw invalid('Grille de palpage vide.');
  }
  if (text.length > LIMITS.probeText) {
    throw failure('ETOOLARGE', 'Grille de palpage trop grande (512 Ko au plus).');
  }
  const points = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const s = line.trim();
    if (!s) {
      return;
    }
    const values = s.split(/\s+/).slice(0, 3).map(Number);
    if (values.length < 3 || values.some((v) => !Number.isFinite(v))) {
      throw invalid(`Grille de palpage : ligne ${index + 1} illisible (x y z attendus).`);
    }
    points.push(values);
  });
  if (points.length < 3) {
    throw invalid('Grille de palpage : au moins 3 points.');
  }
  if (points.length > LIMITS.probePoints) {
    throw invalid(`Grille de palpage : ${LIMITS.probePoints} points au plus.`);
  }
  const lines = (axis) => {
    const sorted = points.map((p) => p[axis]).sort((a, b) => a - b);
    const out = [];
    sorted.forEach((v) => {
      if (!out.length || v - out[out.length - 1] > GRID_EPSILON) {
        out.push(v);
      }
    });
    return out;
  };
  const step = (values) => {
    let min = null;
    for (let i = 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      min = min === null || d < min ? d : min;
    }
    return min === null ? null : round3(min);
  };
  const xs = lines(0);
  const ys = lines(1);
  const zs = points.map((p) => p[2]);
  return {
    fingerprint: fingerprintOfText(text),
    points: points.length,
    columns: xs.length,
    rows: ys.length,
    regular: xs.length * ys.length === points.length,
    xMin: round3(xs[0]),
    xMax: round3(xs[xs.length - 1]),
    yMin: round3(ys[0]),
    yMax: round3(ys[ys.length - 1]),
    stepX: step(xs),
    stepY: step(ys),
    zMin: round3(Math.min(...zs)),
    zMax: round3(Math.max(...zs)),
    units: 'mm'
  };
};

const isoDate = (value, label) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.now() + 24 * 3600 * 1000) {
    throw invalid(`${label} : date invalide.`);
  }
  return new Date(t).toISOString();
};

// The work coordinate system and work offset (machine − work, in the report
// units) the operator recorded right after probing.
const captureOf = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || !/^G5[4-9]$/.test(value.wcs || '') || ['mm', 'in'].indexOf(value.reportUnits) < 0 ||
      !value.offset || typeof value.offset !== 'object') {
    throw invalid('Repère du palpage : repère G54–G59, unités et décalage attendus.');
  }
  const offset = {};
  ['x', 'y', 'z'].forEach((axis) => {
    const v = value.offset[axis];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 100000) {
      throw invalid(`Repère du palpage : décalage ${axis.toUpperCase()} invalide.`);
    }
    offset[axis] = round3(v);
  });
  return { wcs: value.wcs, reportUnits: value.reportUnits, offset };
};

const profileOf = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    throw invalid('Profil de palpage invalide.');
  }
  const name = shortText(value.name, LIMITS.profileName, 'Profil de palpage');
  const revision = typeof value.revision === 'string' && /^[a-z0-9]{1,16}$/.test(value.revision) ? value.revision : '';
  if (!name || !revision) {
    throw invalid('Profil de palpage : nom et révision attendus.');
  }
  return { name, revision };
};

// What fingerprintOf says about a name now: {state: 'present', fingerprint,
// size, mtimeMs} or {state: 'missing'}; other failures propagate.
const MISSING = ['ENOENT', 'ENOTFILE', 'EOUTSIDE'];
const lookup = async (name) => {
  try {
    const [info, st] = await Promise.all([monitor.fingerprintOf(name), monitor.statProgram(name)]);
    return { state: 'present', ...info, ino: st.ino };
  } catch (err) {
    if (MISSING.indexOf(err.code) >= 0) {
      return { state: 'missing' };
    }
    throw err;
  }
};

const compensationOf = async (value, self) => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('Compensation : description attendue.');
  }
  let original;
  try {
    original = validName(value.original);
  } catch (err) {
    throw invalid('Compensation : fichier original invalide.');
  }
  if (original === self) {
    throw invalid('Compensation : l’original doit être un autre fichier.');
  }
  const found = await lookup(original);
  if (found.state !== 'present') {
    throw failure('ENOORIGINAL', 'Original introuvable dans la bibliothèque : envoyez-le d’abord.');
  }
  const probe = value.probe;
  if (!probe || typeof probe !== 'object') {
    throw invalid('Compensation : grille de palpage (.probe) requise.');
  }
  const grid = summarizeProbe(probe.text);
  grid.name = shortText(probe.name, LIMITS.probeName, 'Nom de la grille');
  return {
    original,
    originalFingerprint: found.fingerprint,
    originalSize: found.size,
    grid,
    probedAt: isoDate(probe.probedAt, 'Date du palpage'),
    declaredAt: new Date().toISOString(),
    capture: captureOf(value.capture),
    tool: shortText(value.tool, LIMITS.tool, 'Outil de la compensation'),
    probeProfile: profileOf(value.probeProfile),
    engine: 'cncjs-autolevel'
  };
};

const emptyEntry = (file) => ({
  file,
  material: '',
  tool: '',
  stock: null,
  notes: '',
  favorite: false,
  related: [],
  compensation: null
});
const isEmpty = (e) => !e.material && !e.tool && !e.stock && !e.notes && !e.favorite && !e.related.length && !e.compensation;

// Partial update: only the fields present in `meta` change.
const applyMeta = async (entry, meta, file) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw invalid('Fiche : description attendue.');
  }
  const next = { ...entry };
  if ('material' in meta) {
    next.material = shortText(meta.material, LIMITS.material, 'Matière');
  }
  if ('tool' in meta) {
    next.tool = shortText(meta.tool, LIMITS.tool, 'Outil');
  }
  if ('stock' in meta) {
    next.stock = stockOf(meta.stock);
  }
  if ('notes' in meta) {
    next.notes = notesText(meta.notes);
  }
  if ('favorite' in meta) {
    if (typeof meta.favorite !== 'boolean') {
      throw invalid('Favori : oui ou non attendu.');
    }
    next.favorite = meta.favorite;
  }
  if ('related' in meta) {
    next.related = relatedOf(meta.related, file);
  }
  if ('compensation' in meta) {
    next.compensation = await compensationOf(meta.compensation, file);
  }
  return next;
};

// --- Store -----------------------------------------------------------------

const readStoreText = () => new Promise((resolve, reject) => {
  monitor.readFile(STORE_NAME, { maxFileSize: LIMITS.storeBytes * 2 }, (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
});

const load = async () => {
  if (!monitor.isConfigured()) {
    throw failure('ENOTCONFIGURED', 'Bibliothèque non configurée (dossier partagé CNCjs).');
  }
  let text;
  for (let attempt = 0; ; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- a retry, one read at a time
      text = await readStoreText();
      break;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return new Map();
      }
      // Replaced while it was read: read the new version once more.
      if (err.code === 'ECHANGED' && attempt < 2) {
        continue;
      }
      throw failure('ECORRUPT', 'Fiches projets illisibles (' + STORE_NAME + ') : rien n’a été modifié.');
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parsed = null;
  }
  if (!parsed || parsed.version !== STORE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
    throw failure('ECORRUPT', 'Fiches projets illisibles (' + STORE_NAME + ') : rien n’a été modifié.');
  }
  return new Map(Object.keys(parsed.entries).map((k) => [k, parsed.entries[k]]));
};

const save = (entries) => new Promise((resolve, reject) => {
  const out = {};
  Array.from(entries.keys()).sort().forEach((k) => {
    Object.defineProperty(out, k, { value: entries.get(k), enumerable: true, writable: true, configurable: true });
  });
  const text = JSON.stringify({ version: STORE_VERSION, entries: out }, null, 1);
  if (Buffer.byteLength(text, 'utf8') > LIMITS.storeBytes) {
    reject(failure('ETOOLARGE', 'Fiches projets trop volumineuses : allégez des notes ou retirez des fiches.'));
    return;
  }
  monitor.writeFile(STORE_NAME, text, (err) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  });
});

// Writes run one after the other: each reads the store, changes one sheet
// and writes the whole file back.
let queue = Promise.resolve();
const serialized = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

// --- Verdicts ----------------------------------------------------------------

// The version a sheet describes, compared with the file now: 'current',
// 'other' (the file changed since the sheet was written) or 'missing'.
const versionOf = (entry, now) => {
  if (now.state !== 'present') {
    return 'missing';
  }
  return sameProgram(entry.fingerprint, now.fingerprint) ? 'current' : 'other';
};

const withCompensationVerdict = async (entry) => {
  if (!entry.compensation) {
    return entry;
  }
  const original = await lookup(entry.compensation.original);
  return {
    ...entry,
    compensation: { ...entry.compensation, originalVersion: versionOf({ fingerprint: entry.compensation.originalFingerprint }, original) }
  };
};

// Every sheet with its verdict. A file whose identity on disk (size, mtime,
// inode, from a fresh lstat) is the one recorded with the sheet's fingerprint
// is 'current' without being read; any other is looked up (fingerprint, from
// the monitor's cache when it can), so a file touched without a change stays
// 'current'. The monitor's own listing is not used: it lags behind the disk.
// The sheet of one file (`read`) and every write compare fingerprints.
const quickVersion = async (entry) => {
  try {
    const st = await monitor.statProgram(entry.file);
    if (st.size === entry.size && st.mtimeMs === entry.mtimeMs && st.ino === entry.ino) {
      return 'current';
    }
  } catch (err) {
    if (MISSING.indexOf(err.code) >= 0) {
      return 'missing';
    }
    throw err;
  }
  return versionOf(entry, await lookup(entry.file));
};

export const list = async () => {
  const entries = await load();
  const out = [];
  for (const entry of entries.values()) {
    // One file at a time: a list may hash several programs (20 MB each at most) on a tablet.
    // eslint-disable-next-line no-await-in-loop
    out.push({ ...entry, version: await quickVersion(entry) });
  }
  return { entries: out, limits: { entries: LIMITS.entries } };
};

export const read = async (file) => {
  validName(file);
  const entries = await load();
  const now = await lookup(file);
  if (now.state !== 'present') {
    throw failure('ENOENT', 'Fichier introuvable dans la bibliothèque.');
  }
  const entry = entries.get(file);
  return {
    file,
    fingerprint: now.fingerprint,
    size: now.size,
    version: entry ? versionOf(entry, now) : 'none',
    entry: entry ? await withCompensationVerdict(entry) : null
  };
};

// write({file, fingerprint, meta, adopt}):
// - `fingerprint` is the version of the file the caller is annotating (from
//   `read`); a file changed since answers ECHANGED.
// - a sheet written for another version answers EOTHERVERSION unless `adopt`
//   ("keep for this version"), which binds it to the current bytes.
// - `meta: null` removes the sheet (also for a file no longer in the library).
export const write = (body) => serialized(async () => {
  const { file, fingerprint, meta, adopt } = body || {};
  validName(file);
  const entries = await load();
  const existing = entries.get(file);
  if (meta === null && !adopt) {
    if (existing) {
      entries.delete(file);
      await save(entries);
    }
    const now = await lookup(file);
    return now.state === 'present' ? { file, fingerprint: now.fingerprint, size: now.size, version: 'none', entry: null } : { file, version: 'none', entry: null };
  }
  const now = await lookup(file);
  if (now.state !== 'present') {
    throw failure('ENOENT', 'Fichier introuvable dans la bibliothèque.');
  }
  if (!isFingerprint(fingerprint) || !sameProgram(fingerprint, now.fingerprint)) {
    throw failure('ECHANGED', 'Le fichier a changé depuis l’ouverture de la fiche : rouvrez-la.');
  }
  if (existing && !sameProgram(existing.fingerprint, now.fingerprint) && adopt !== true) {
    throw failure('EOTHERVERSION', 'Cette fiche concerne une autre version du fichier : choisissez « Garder pour cette version » ou effacez-la.');
  }
  if (adopt === true && !existing) {
    throw failure('ENOENT', 'Aucune fiche à garder pour ce fichier.');
  }
  let next = existing ? { ...emptyEntry(file), ...existing } : emptyEntry(file);
  if (meta !== undefined && meta !== null) {
    next = await applyMeta(next, meta, file);
  }
  if (isEmpty(next)) {
    entries.delete(file);
  } else {
    if (!existing && entries.size >= LIMITS.entries) {
      throw failure('ETOOMANY', `Bibliothèque de projets pleine (${LIMITS.entries} fiches) : effacez des fiches inutiles.`);
    }
    next.file = file;
    next.fingerprint = now.fingerprint;
    next.size = now.size;
    next.mtimeMs = now.mtimeMs;
    next.ino = now.ino;
    next.updatedAt = new Date().toISOString();
    entries.set(file, next);
  }
  await save(entries);
  const stored = entries.get(file);
  return {
    file,
    fingerprint: now.fingerprint,
    size: now.size,
    version: stored ? 'current' : 'none',
    entry: stored ? await withCompensationVerdict(stored) : null
  };
});

export default { STORE_NAME, LIMITS, list, read, write, summarizeProbe };
