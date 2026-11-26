// What each status report and each $G report carried by itself (lot C1, design/plaque/C1-CONCEPTION.md).
// CNCjs merges every report into the previous one: a report without MPos: keeps the old position, a
// report without FS: keeps the old speed. The guards of the moves read what is noted here instead,
// taken from the raw line of the report alone, or refuse. Nothing here writes to a controller, and
// CNCjs's own parser is left as it is.

// A position, a speed or a $G older than this proves nothing.
export const PROOF_MAX_AGE_MS = 2500;
// Two reports within this distance show the same place (mm).
export const REST_TOLERANCE_MM = 0.01;
// A proof missing between two lines of a sequence is waited for this long, then the sequence stops.
export const PROOF_WAIT_MS = 2500;

export const PROOF_MESSAGES = {
  ETOUCH_MOTION_NO_POSITION: 'Position de la machine non confirmée : attendez deux rapports au repos (Idle) qui donnent X, Y et Z.',
  ETOUCH_MOTION_SPINDLE_COMMANDED: 'La broche est commandée ({mode}) : arrêtez-la d’abord (Arrêter la broche).',
  ETOUCH_MOTION_SPINDLE_UNKNOWN: 'État de la broche non confirmé : la carte ne donne pas une vitesse complète (FS:) ou un état $G récent. Attendez un rapport, ou arrêtez la broche.'
};

const NUM = '-?\\d+(?:\\.\\d+)?';
const POSITION = new RegExp('^(MPos|WPos):(' + NUM + '(?:,' + NUM + '){2,5})$');
const OFFSET = new RegExp('^WCO:(' + NUM + '(?:,' + NUM + '){2,5})$');
const SPEED = /^FS:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/;

const count = (text, word) => text.split(word).length - 1;
const xyz = (list) => {
  const [x, y, z] = list.split(',').map(Number);
  return { x, y, z };
};

// One status line `<…>`, cut on `|`. A field counts only when it is whole and alone:
//   position  exactly one MPos: or WPos: in the whole line, 3 to 6 plain numbers, nothing else;
//   speed     exactly one FS: in the whole line, two unsigned numbers;
//   offset    exactly one WCO: in the whole line, 3 to 6 plain numbers (`wcoBroken` when the text
//             WCO: is there without being such a field);
//   accessory the letters of an A: field.
// The values come from these raw fields, never from the parser's payload.
export const readStatus = (raw) => {
  const out = { state: '', frame: null, xyz: null, speed: null, wco: null, wcoBroken: false, accessory: '' };
  const m = typeof raw === 'string' ? /^<(.+)>$/.exec(raw.trim()) : null;
  if (!m) {
    return out;
  }
  const line = m[1];
  const fields = line.split('|');
  out.state = fields[0].split(':')[0];
  const rest = fields.slice(1);
  if (count(line, 'MPos:') + count(line, 'WPos:') === 1) {
    const hit = rest.map((f) => POSITION.exec(f)).find(Boolean);
    if (hit) {
      out.frame = hit[1] === 'MPos' ? 'm' : 'w';
      out.xyz = xyz(hit[2]);
    }
  }
  if (count(line, 'FS:') === 1) {
    const hit = rest.map((f) => SPEED.exec(f)).find(Boolean);
    if (hit) {
      out.speed = Number(hit[2]);
    }
  }
  const offsets = count(line, 'WCO:');
  if (offsets === 1) {
    const hit = rest.map((f) => OFFSET.exec(f)).find(Boolean);
    if (hit) {
      out.wco = xyz(hit[1]);
    }
  }
  out.wcoBroken = offsets > 0 && !out.wco;
  const accessory = rest.find((f) => /^A:/.test(f));
  out.accessory = accessory ? accessory.slice(2) : '';
  return out;
};

// The spindle word of a `[GC:…]` line: 'M5' only when it is the one word among M3, M4, M5; 'on'
// for a single M3 or M4 (`mode` names it); null for none or several.
export const readModal = (raw) => {
  const m = typeof raw === 'string' ? /^\[(?:GC:)?(.+)\]$/.exec(raw.trim()) : null;
  const words = m ? m[1].split(/\s+/).filter((w) => ['M3', 'M4', 'M5'].includes(w)) : [];
  if (words.length !== 1) {
    return { spindle: null, mode: null };
  }
  return words[0] === 'M5' ? { spindle: 'M5', mode: 'M5' } : { spindle: 'on', mode: words[0] };
};

// deps: clock() monotonic ms, conflict(message) a 409 error.
export const createProof = ({ clock, conflict }) => {
  const refusal = (code, params = {}) => {
    const err = conflict(PROOF_MESSAGES[code].replace(/\{(\w+)\}/g, (all, name) => String(params[name])));
    err.code = code;
    err.params = params;
    return err;
  };
  const young = (at) => Number.isFinite(at) && clock() >= at && clock() - at <= PROOF_MAX_AGE_MS;

  // Pure additions to the record of a controller.
  const init = (r) => {
    Object.assign(r, { pos: null, still: 0, fs: null, gc: null, wcoKept: null, seenCounts: { reports: 0, noXyz: 0, noFs: 0 } });
    // Never set back: a sequence compares them with what it noted at its start.
    r.spinHints = r.spinHints || 0;
    r.gcCount = r.gcCount || 0;
  };

  // Called for every status report, once r.reports counts it.
  const status = (r, payload) => {
    const rep = readStatus(payload && payload.raw);
    r.seenCounts.reports += 1;
    r.seenCounts.noXyz += rep.xyz ? 0 : 1;
    r.seenCounts.noFs += rep.speed === null ? 1 : 0;
    // The offset kept to derive the other frame: the one of this report, else the last whole one
    // received since the banner; a broken WCO: field leaves none.
    if (rep.wco) {
      r.wcoKept = rep.wco;
    } else if (rep.wcoBroken) {
      r.wcoKept = null;
    }
    if (rep.xyz) {
      const k = r.wcoKept;
      const sign = rep.frame === 'm' ? -1 : 1;
      const other = k ? { x: rep.xyz.x + sign * k.x, y: rep.xyz.y + sign * k.y, z: rep.xyz.z + sign * k.z } : null;
      const pos = {
        report: r.reports, at: clock(), state: rep.state, frame: rep.frame, m: rep.frame === 'm' ? rep.xyz : other, w: rep.frame === 'w' ? rep.xyz : other
      };
      const near = (a, b) => (!a && !b) || (!!a && !!b && ['x', 'y', 'z'].every((axis) => Math.abs(a[axis] - b[axis]) <= REST_TOLERANCE_MM));
      const same = !!r.pos && r.pos.frame === pos.frame && near(r.pos.m, pos.m) && near(r.pos.w, pos.w);
      if (rep.state !== 'Idle') {
        r.still = 0;
      } else {
        r.still = same ? r.still + 1 : 1;
      }
      r.pos = pos;
    } else {
      r.still = 0;
    }
    if (rep.speed !== null) {
      r.fs = { report: r.reports, at: clock(), speed: rep.speed };
      r.spinHints += rep.speed !== 0 ? 1 : 0;
    }
    r.spinHints += /[SC]/.test(rep.accessory) ? 1 : 0;
  };

  // Called for every `[GC:…]` report.
  const modal = (r, payload) => {
    r.gcCount += 1;
    r.gc = { n: r.gcCount, at: clock(), ...readModal(payload && payload.raw) };
    r.spinHints += r.gc.spindle !== 'M5' ? 1 : 0;
  };

  // None of the readers below throws, none returns an object to dereference.
  const positional = (r) => !!r.pos && r.pos.report === r.reports && young(r.pos.at);
  // The position of the last report, 'm' machine or 'w' work, or null: no report, an old one, or
  // one that did not carry X, Y and Z itself.
  const posOf = (r, frame, axis) => {
    const p = positional(r) ? r.pos[frame] : null;
    const v = p ? p[String(axis).toLowerCase()] : null;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  // A position was reported less than PROOF_MAX_AGE_MS ago (during a line, the last report need not carry it).
  const posYoung = (r) => !!r.pos && young(r.pos.at);
  // The two last reports carry the position, say Idle, agree, and both came after report `mark`.
  const restedSince = (r, mark) => positional(r) && Math.min(r.still, r.reports - mark) >= 2;
  const positionRefusal = (r) => (restedSince(r, 0) ? null : refusal('ETOUCH_MOTION_NO_POSITION'));
  // Where the machine stands, both frames and the active system, for a later comparison; null when unknown.
  const place = (r) => (positional(r) ? { m: r.pos.m, w: r.pos.w, wcs: r.wcs } : null);
  // The first axis (X, Y, Z) on which `now` is not where `then` was, 'wcs' for another system, '' when equal.
  const moved = (then, now) => {
    if (!then || !now) {
      return '?';
    }
    if (then.wcs !== now.wcs) {
      return 'wcs';
    }
    const off = (a, b) => ((!a && !b) ? '' : ['x', 'y', 'z'].find((axis) => !a || !b || Math.abs(a[axis] - b[axis]) > REST_TOLERANCE_MM) || '');
    return (off(then.m, now.m) || off(then.w, now.w)).toUpperCase();
  };

  const speedNow = (r) => (r.fs && r.fs.report === r.reports && young(r.fs.at) ? r.fs.speed : null);
  // At a start, at rest: the last report gives a whole FS: whose speed is 0, and the last $G, recent,
  // names M5 alone. Anything else is a refusal (null when the spindle is proven stopped).
  const spindleRefusal = (r) => {
    const speed = speedNow(r);
    if (speed !== null && speed !== 0) {
      return conflict('La broche tourne encore (' + speed + ' tr/min) : arrêtez-la d’abord (M5).');
    }
    const fresh = !!r.gc && young(r.gc.at);
    if (fresh && r.gc.spindle === 'on') {
      return refusal('ETOUCH_MOTION_SPINDLE_COMMANDED', { mode: r.gc.mode });
    }
    return speed === 0 && fresh && r.gc.spindle === 'M5' ? null : refusal('ETOUCH_MOTION_SPINDLE_UNKNOWN');
  };
  // During a sequence, at every step: a sign of a running spindle since `ref.hints` was noted, or
  // no whole FS: for PROOF_MAX_AGE_MS. No fresh $G is asked for during a line.
  const spindleWatch = (r, ref) => r.spinHints !== ref.hints || !r.fs || !young(r.fs.at);
  // Before each line after the first, in the step of the write: the last report gives FS: at 0, and a
  // $G naming M5 alone came after the ok of the previous line (`ref.gcAtOk`) and is still recent.
  const spindleHeld = (r, ref) => speedNow(r) === 0 && !!r.gc && r.gc.spindle === 'M5' && r.gc.n > ref.gcAtOk && young(r.gc.at);

  return {
    init, status, modal, posOf, posYoung, restedSince, positionRefusal, place, moved, spindleRefusal, spindleWatch, spindleHeld
  };
};
