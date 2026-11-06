// Machine type (CNC or laser) bound to a stable machine identity
// (examples/cncjs-touch/PROFILES-CONTRACT.md, §2 and §3). The identity is a
// signature of the firmware family and of the Grbl settings that describe the
// mechanics; the type itself lives in the CNCjs configuration (.cncrc,
// `touch.machines`), never in a browser. This module only reads settings and
// writes the configuration: it never sends anything to a controller and never
// changes $30, $31 or $32 (the laser settings are checked for coherence).
//
// Effective behaviour: `laser` → laser behaviour; `cnc` or not associated →
// the existing CNC behaviour, except that $32=1 then blocks every CNC operation
// that turns the spindle (incoherence), and a laser with $32 other than 1
// blocks every laser operation that could emit.
import crypto from 'crypto';
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads the
// service with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { grblVersion } from './motion.js';

export const CONFIG_KEY = 'touch.machines';
export const KINDS = ['cnc', 'laser'];
// Mechanics: steps/mm, max rates, accelerations, travel, homing enable and direction.
export const MECHANICS = [100, 101, 102, 110, 111, 112, 120, 121, 122, 130, 131, 132, 22, 23];
const ID = /^m-[0-9a-f]{12}$/;
const SIGNATURE = /^[0-9a-f]{16}$/;
const MAX_LABEL = 60;
const MAX_RECORDS = 100;

// French message of every coded refusal or issue of this module and of the
// laser operations (the client catalog, touch/i18n-messages-machine.js, has
// the same French templates with EN/ES rows).
const MESSAGES = {
  'ETOUCH_MACHINE_LASER_MODE_ON': () => 'Mode laser actif sur la carte ($32=1) alors que cette machine n’est pas déclarée laser : opérations CNC qui font tourner la broche bloquées.',
  'ETOUCH_MACHINE_LASER_MODE_OFF': () => 'Machine déclarée laser mais mode laser de la carte inactif ou inconnu ($32 différent de 1) : opérations laser qui peuvent émettre bloquées.',
  'ETOUCH_MACHINE_AMBIGUOUS': (p) => 'Plusieurs fiches machine (' + p.count + ') ont la signature de cette carte : oubliez-les puis déclarez le type à nouveau.',
  'ETOUCH_MACHINE_SETTINGS_UNKNOWN': () => 'Version ou réglages de la carte ($$) non lus : lisez les réglages avant de déclarer le type de machine.',
  'ETOUCH_MACHINE_CONNECTION': () => 'Connexion machine indisponible : type de machine non modifié.',
  'ETOUCH_MACHINE_STALE': () => 'État machine trop ancien : attendez un rapport récent avant de changer le type de machine.',
  'ETOUCH_MACHINE_NOT_IDLE': (p) => 'La machine doit être au repos (Idle) pour changer son type : état ' + p.state + '.',
  'ETOUCH_MACHINE_BUSY': () => 'Travail, pause, chargement, prise d’origine, palpage, déplacement, commande en attente ou commande système en cours : type de machine modifiable seulement au repos.',
  'ETOUCH_MACHINE_CONTROLLER_CHANGED': () => 'Le contrôleur a changé ou son identité manque. Choisissez-le à nouveau.',
  'ETOUCH_MACHINE_TRANSPORT': () => 'Connexion de suivi interrompue. Confirmez à nouveau.',
  'ETOUCH_MACHINE_KIND_INVALID': () => 'Type de machine invalide : choisissez CNC ou laser.',
  'ETOUCH_MACHINE_NOT_ASSOCIATED': () => 'Aucune fiche machine associée à cette carte : rien à oublier.',
  'ETOUCH_MACHINE_STORE': () => 'Enregistrement impossible dans la configuration CNCjs (.cncrc) : type de machine non modifié.',
  'ETOUCH_MACHINE_RESUME_MODE_CHANGED': (p) => 'Reprise chargée en mode ' + p.loaded + ', machine désormais en mode ' + p.now + ' : rechargez la reprise depuis Reprendre.',
  'ETOUCH_MACHINE_OPERATION': () => 'Opération machine inconnue.',
  'ETOUCH_LASER_NOT_LASER': () => 'Opération réservée à une machine déclarée laser.',
  'ETOUCH_LASER_NO_SPINDLE_TEST': () => 'Machine déclarée laser : pas de test de broche (aucune commande M3 de test envoyée).',
  'ETOUCH_LASER_NO_PLATE_PROBE': () => 'Machine déclarée laser : pas de palpage Z avec plaque.',
  'ETOUCH_LASER_NO_TOOL_CHANGE': () => 'Machine déclarée laser : pas de changement d’outil (M6) ni de relance de broche ; arrêtez le travail.',
  'ETOUCH_LASER_NO_CNC_RESUME': () => 'Machine déclarée laser : la reprise CNC (dégagement, broche, plongée) est refusée.',
  'ETOUCH_LASER_FRAME_DISABLED': () => 'Cadrage indisponible : déplacements réels non activés ou non pris en charge par cette carte (touch.motion.enabled, Grbl 1.1 ou plus).',
  'ETOUCH_LASER_FRAME_NO_PROGRAM': () => 'Aucun programme chargé : cadrage impossible.',
  'ETOUCH_LASER_FRAME_CHECK': () => 'Cadrage refusé : la vérification de course du programme doit être validée en X et Y (machine référencée, programme dans la course).',
  'ETOUCH_LASER_FRAME_BOUNDS': () => 'Cadrage refusé : contour X/Y du programme inconnu (unités non fixées, changement de repère ou déplacements non suivis).',
  'ETOUCH_LASER_FRAME_WCS': (p) => 'Cadrage refusé : le programme utilise ' + p.wcs + ' alors que le repère actif est ' + p.active + '.',
  'ETOUCH_LASER_FRAME_POSITION': () => 'Position de travail X/Y inconnue : cadrage impossible.',
  'ETOUCH_LASER_FRAME_FEED': (p) => 'Avance de cadrage hors limites : de ' + p.min + ' à ' + p.max + ' mm/min.',
  'ETOUCH_LASER_FRAME_SLOW': (p) => 'Cadrage trop lent : un côté durerait ' + p.seconds + ' s (' + p.max + ' s au plus). Augmentez l’avance.',
  'ETOUCH_LASER_FRAME_CHANGED': () => 'Le programme ou la machine ont changé depuis la confirmation du cadrage : confirmez à nouveau.',
  'ETOUCH_LASER_FRAME_EXPIRED': () => 'Confirmation du cadrage expirée ou déjà utilisée.'
};

// A 409 refusal with its stable code and the values of its French message.
export const machineRefusal = (code, params = {}) => {
  const err = new Error(MESSAGES[code](params));
  err.status = 409;
  err.code = code;
  err.params = params;
  return err;
};

const issue = (code, params = {}) => ({ code, params, message: MESSAGES[code](params) });

const settingText = (v) => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  if (typeof v === 'string') {
    const t = v.trim();
    return t !== '' && Number.isFinite(Number(t)) ? String(Number(t)) : t.slice(0, 32);
  }
  return '';
};

const numberOf = (v) => {
  const t = settingText(v);
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null;
};

// The firmware family: Grbl major.minor (1.1 for Grbl 1.1h, 1.3 for Grbl_ESP32 1.3a).
export const firmwareFamily = (firmware, version) => {
  const v = grblVersion(firmware, version);
  return v ? 'grbl-' + v.major + '.' + v.minor : null;
};

// `$$` counts as read once the homing enable and the last travel setting are
// known: Grbl prints its settings in ascending order, so a reply still being
// received never yields a partial signature.
export const settingsRead = (settings) => {
  const s = settings || {};
  return settingText(s.$22) !== '' && settingText(s.$132) !== '';
};

// SHA-256 (16 hex characters kept) of the firmware family and the mechanics
// settings; null while either is unknown. Not $30-$32, not the port.
export const signatureOf = (settings, firmware, version) => {
  const family = firmwareFamily(firmware, version);
  if (!family || !settingsRead(settings)) {
    return null;
  }
  const s = settings || {};
  const text = family + '|' + MECHANICS.map((n) => '$' + n + '=' + settingText(s['$' + n])).join('|');
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
};

export const validRecord = (m) => !!m && typeof m === 'object' && !Array.isArray(m) &&
  typeof m.id === 'string' && ID.test(m.id) && KINDS.includes(m.kind) &&
  typeof m.signature === 'string' && SIGNATURE.test(m.signature);

// The raw list stored in .cncrc (anything else reads as empty; invalid
// entries are ignored, and kept as they are when the list is written).
export const storedMachines = (config) => {
  let raw;
  try {
    raw = config ? config.get(CONFIG_KEY) : null;
  } catch (_) {
    raw = null;
  }
  return Array.isArray(raw) ? raw : [];
};

export const matchMachine = (records, signature) => {
  if (!signature) {
    return { match: 'unknown', record: null, count: 0 };
  }
  const found = (records || []).filter((m) => validRecord(m) && m.signature === signature);
  if (found.length === 1) {
    return { match: 'signature', record: found[0], count: 1 };
  }
  return { match: found.length ? 'ambiguous' : 'none', record: null, count: found.length };
};

const flag = (code) => (code ? { supported: false, reason: MESSAGES[code]({}), code } : { supported: true, reason: '', code: '' });

// What each kind allows (§3). CNC flags are kind-level: the existing rules of
// the moment still apply on top of them (canSpindleTest, canZeroZ…).
export const capabilitiesFor = ({ kind, mode, frameEnabled }) => {
  const laser = kind === 'laser';
  // $32=1 without a laser declaration: nothing that turns the spindle.
  const cncBlock = !laser && mode === 1 ? 'ETOUCH_MACHINE_LASER_MODE_ON' : null;
  let frame = null;
  if (!laser) {
    frame = 'ETOUCH_LASER_NOT_LASER';
  } else if (!frameEnabled) {
    frame = 'ETOUCH_LASER_FRAME_DISABLED';
  }
  let laserResume = null;
  if (!laser) {
    laserResume = 'ETOUCH_LASER_NOT_LASER';
  } else if (mode !== 1) {
    laserResume = 'ETOUCH_MACHINE_LASER_MODE_OFF';
  }
  return {
    spindleTest: flag(laser ? 'ETOUCH_LASER_NO_SPINDLE_TEST' : cncBlock),
    plateProbe: flag(laser ? 'ETOUCH_LASER_NO_PLATE_PROBE' : cncBlock),
    toolChange: flag(laser ? 'ETOUCH_LASER_NO_TOOL_CHANGE' : cncBlock),
    resume: flag(laser ? 'ETOUCH_LASER_NO_CNC_RESUME' : cncBlock),
    laserResume: flag(laserResume),
    laserFrame: flag(frame),
    focus: flag(laser ? null : 'ETOUCH_LASER_NOT_LASER')
  };
};

// The `machineProfile` of a controller snapshot (§2), without canChange /
// changeReason, which the job service adds (they depend on the machine state).
export const describeProfile = ({ settings, firmware, version, port, records, frameEnabled }) => {
  const s = settings || {};
  const signature = signatureOf(s, firmware, version);
  const { match, record, count } = matchMachine(records, signature);
  const kind = record ? record.kind : null;
  const rawMode = numberOf(s.$32);
  const mode = rawMode === 0 || rawMode === 1 ? rawMode : null;
  const issues = [];
  if (kind !== 'laser' && mode === 1) {
    issues.push(issue('ETOUCH_MACHINE_LASER_MODE_ON'));
  }
  if (kind === 'laser' && mode !== 1) {
    issues.push(issue('ETOUCH_MACHINE_LASER_MODE_OFF'));
  }
  const coherent = !issues.length;
  if (match === 'ambiguous') {
    issues.push(issue('ETOUCH_MACHINE_AMBIGUOUS', { count }));
  }
  return {
    version: 1,
    id: record ? record.id : null,
    label: record && typeof record.label === 'string' ? record.label.slice(0, MAX_LABEL) : '',
    kind,
    match,
    signature,
    portHint: typeof port === 'string' ? port : '',
    laser: { mode, sMax: numberOf(s.$30), sMin: numberOf(s.$31) },
    coherent,
    // Coded for the tablet: { code, params } (the French message stays on the server).
    issues: issues.map(({ code, params }) => ({ code, params })),
    capabilities: capabilitiesFor({ kind, mode, frameEnabled })
  };
};

export const cleanLabel = (label) => (typeof label === 'string'
  // eslint-disable-next-line no-control-regex
  ? label.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) : '');

// Writes of `touch.machines` through the CNCjs configuration store (the same
// path as touch.backlight.percent). `revision` changes with every write, for
// the stream's change detection.
export const createProfiles = ({ config, now = () => new Date().toISOString(), randomId = () => crypto.randomBytes(6).toString('hex') } = {}) => {
  let revision = 0;
  const write = (list) => {
    if (!config || typeof config.set !== 'function') {
      throw machineRefusal('ETOUCH_MACHINE_STORE');
    }
    try {
      config.set(CONFIG_KEY, list);
    } catch (_) {
      throw machineRefusal('ETOUCH_MACHINE_STORE');
    }
    revision += 1;
  };

  // Declares the kind of the machine with this signature: the matching record
  // is updated, or a new one is created. Returns { record, previous }.
  const setKind = ({ signature, kind, label }) => {
    const list = storedMachines(config);
    const { match, record, count } = matchMachine(list, signature);
    if (match === 'unknown') {
      throw machineRefusal('ETOUCH_MACHINE_SETTINGS_UNKNOWN');
    }
    if (match === 'ambiguous') {
      throw machineRefusal('ETOUCH_MACHINE_AMBIGUOUS', { count });
    }
    const at = now();
    const name = cleanLabel(label);
    let next;
    let saved;
    if (record) {
      saved = { ...record, kind, label: name || (typeof record.label === 'string' ? record.label : ''), updatedAt: at };
      next = list.map((m) => (m === record ? saved : m));
    } else {
      if (list.length >= MAX_RECORDS) {
        throw machineRefusal('ETOUCH_MACHINE_STORE');
      }
      saved = { id: 'm-' + randomId(), label: name, kind, signature, createdAt: at, updatedAt: at };
      next = list.concat([saved]);
    }
    write(next);
    return { record: saved, previous: record ? { kind: record.kind, label: record.label || '' } : null };
  };

  // Removes every record with this signature (one, or the ambiguous ones).
  const forget = ({ signature }) => {
    const list = storedMachines(config);
    const removed = list.filter((m) => validRecord(m) && m.signature === signature);
    if (!signature || !removed.length) {
      throw machineRefusal(signature ? 'ETOUCH_MACHINE_NOT_ASSOCIATED' : 'ETOUCH_MACHINE_SETTINGS_UNKNOWN');
    }
    write(list.filter((m) => !removed.includes(m)));
    return removed;
  };

  return { list: () => storedMachines(config), setKind, forget, revision: () => revision };
};

export default { createProfiles, describeProfile, capabilitiesFor, signatureOf, settingsRead, matchMachine, machineRefusal, firmwareFamily };
