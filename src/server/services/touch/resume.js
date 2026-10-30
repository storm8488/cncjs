// Start a program again from one of its lines (after a broken tool, a stop or
// a power cut). The state the program had built up to that line is replayed
// (units, plane, work offset, motion mode, feed, spindle, coolant, tool and
// position), and a preamble brings the machine there safely: rapid to the
// clearance height, rapid over the XY start, spindle and coolant back on with a
// spin-up dwell, plunge at the program's feed. Programs whose state cannot be
// known for sure are refused instead of guessed.
//
// Lines are numbered like the CNCjs sender counts them: non-empty lines,
// comment-only lines included, so the number shown during a job can be used.

// The offline preview server loads these modules natively: keep the extension.
// eslint-disable-next-line import/extensions
import { codeOf } from './program-check.js';

const SPINUP_SECONDS = 3;

// Every refusal carries a stable code (ETOUCH_RESUME_*) and the values its
// French message is built from, so a client can translate it without parsing
// the text; the message itself is unchanged.
const refuse = (code, message, params = {}) => {
  const err = new Error(message);
  err.status = 409;
  err.code = code;
  err.params = params;
  return err;
};

// Comments removed the way the CNCjs sender does (nested parentheses).
const clean = codeOf;

const words = (code) => {
  const out = [];
  const re = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
  let m;
  while ((m = re.exec(code))) {
    out.push([m[1], Number(m[2])]);
  }
  return out;
};

const fmt = (n) => String(Math.round(n * 10000) / 10000);

const MM_PER_INCH = 25.4;

export const programLines = (gcode) => String(gcode).split('\n').filter((line) => line.trim().length > 0);

// Everything kept in program units: positions, clearance height and feeds
// (G94: units per minute). They are converted together when the program
// changes units, so a clearance seen in millimetres is never sent in inches.
const acquired = (s) => s.feed !== null || s.safeZ !== null || ['X', 'Y', 'Z'].some((a) => s.pos[a] !== null);
const positioned = (s) => s.safeZ !== null || ['X', 'Y', 'Z'].some((a) => s.pos[a] !== null);
const scale = (s, k) => {
  ['X', 'Y', 'Z'].forEach((a) => {
    if (s.pos[a] !== null) {
      s.pos[a] *= k;
    }
  });
  if (s.safeZ !== null) {
    s.safeZ *= k;
  }
  if (s.rapidZ !== null) {
    s.rapidZ *= k;
  }
  if (s.feed !== null) {
    s.feed *= k;
  }
  if (s.plungeFeed !== null) {
    s.plungeFeed *= k;
  }
};

// State of the program just before line `from` (1-based, sender numbering).
// Units and work offset stay null when the program never chose them: the
// program then relies on the controller's own state, which the preamble must
// leave alone (a forced G54 would move a G55 job to another origin).
export const stateBefore = (lines, from) => {
  const s = {
    units: null,
distance: 'G90',
plane: 'G17',
wcs: null,
feedMode: 'G94',
motion: null,
    feed: null,
plungeFeed: null,
speed: null,
spindle: 'M5',
coolant: 'M9',
tool: null,
toolChanged: false,
    pos: { X: null, Y: null, Z: null },
safeZ: null,
    // Highest absolute Z reached by a rapid (G0) under the current work
    // offset: a Z the program itself treats as free. The clearance (highest Z
    // of all) is at or above it; without any rapid Z, the highest Z is only a
    // cutting depth, not a clearance.
    rapidZ: null,
    // Line of the last unit change that converted acquired values, of the
    // work offset change that made them unknown, and of a G43.1 still active.
    unitsChanged: null,
wcsReset: null,
toolOffset: null
  };
  for (let i = 0; i < from - 1; i++) {
    const code = clean(lines[i]);
    if (!code || code === '%') {
      continue;
    }
    const w = words(code);
    const g = w.filter(([l]) => l === 'G').map(([, v]) => v);
    const m = w.filter(([l]) => l === 'M').map(([, v]) => v);
    const at = (letter) => {
      const found = w.find(([l]) => l === letter);
      return found ? found[1] : null;
    };
    const lineNo = i + 1;
    if (g.some((v) => [10, 92, 92.1, 92.2, 92.3].includes(v))) {
      throw refuse('ETOUCH_RESUME_ORIGIN_CHANGED', 'Le programme change l’origine (G10/G92) avant la ligne ' + from + ' (ligne ' + lineNo + ') : reprise impossible.', { from, line: lineNo });
    }
    if (g.includes(93)) {
      throw refuse('ETOUCH_RESUME_INVERSE_TIME', 'Avance inverse du temps (G93) avant la ligne ' + from + ' : reprise impossible.', { from });
    }
    // Compensations the preamble does not replay (Grbl supports G43.1/G49 only).
    if (g.some((v) => [41, 41.1, 42, 42.1].includes(v))) {
      throw refuse('ETOUCH_RESUME_CUTTER_COMPENSATION', 'Compensation de rayon d’outil (G41/G42) à la ligne ' + lineNo + ' : non rejouée, reprise impossible.', { line: lineNo });
    }
    if (g.includes(43)) {
      throw refuse('ETOUCH_RESUME_TOOL_LENGTH', 'Décalage de longueur d’outil (G43) à la ligne ' + lineNo + ' : non rejoué, reprise impossible.', { line: lineNo });
    }
    g.forEach((v) => {
      if (v === 20 || v === 21) {
        const units = 'G' + v;
        if (s.units !== units) {
          if (s.units === null && acquired(s)) {
            throw refuse('ETOUCH_RESUME_UNITS_LATE', 'Le programme fixe ses unités (' + units + ') à la ligne ' + lineNo + ' après des déplacements faits dans les unités de la machine : reprise impossible.', { units, line: lineNo });
          }
          if (s.units !== null && acquired(s)) {
            scale(s, v === 20 ? 1 / MM_PER_INCH : MM_PER_INCH);
            s.unitsChanged = lineNo;
          }
          s.units = units;
        }
      } else if (v === 43.1) {
        s.toolOffset = lineNo;
      } else if (v === 49) {
        s.toolOffset = null;
      } else if (v === 90 || v === 91) {
        s.distance = 'G' + v;
      } else if (v === 17 || v === 18 || v === 19) {
        s.plane = 'G' + v;
      } else if (v === 94) {
        s.feedMode = 'G94';
      } else if ([54, 55, 56, 57, 58, 59].includes(v)) {
        const wcs = 'G' + v;
        if (s.wcs !== wcs) {
          // Positions acquired under another offset (or under the controller's
          // unknown one) do not carry over: X, Y and Z must be given again.
          if (positioned(s)) {
            s.pos = { X: null, Y: null, Z: null };
            s.safeZ = null;
            s.rapidZ = null;
            s.wcsReset = { line: lineNo, wcs };
          }
          s.wcs = wcs;
        }
      } else if ([0, 1, 2, 3].includes(v)) {
        s.motion = 'G' + v;
      } else if (v === 80) {
        s.motion = null;
      }
    });
    if (at('F') !== null) {
      s.feed = at('F');
    }
    if (at('S') !== null) {
      s.speed = at('S');
    }
    if (at('T') !== null) {
      s.tool = at('T');
    }
    m.forEach((v) => {
      if (v === 3 || v === 4 || v === 5) {
        s.spindle = 'M' + v;
      } else if (v === 7 || v === 8 || v === 9) {
        s.coolant = 'M' + v;
      } else if (v === 6) {
        s.toolChanged = true;
      }
    });
    const machineMove = g.includes(53) || g.includes(28) || g.includes(30);
    const probe = g.some((v) => v >= 38.2 && v <= 38.5);
    const axes = ['X', 'Y', 'Z'].filter((a) => at(a) !== null);
    if (g.includes(43.1)) {
      // The axis word of G43.1 is the offset, not a move.
      continue;
    }
    if (machineMove || probe) {
      // G53/G28/G30 moves are in machine coordinates and a probe stops at the
      // contact: the work position of those axes is unknown until the program
      // sets it again.
      (g.includes(53) || probe ? axes : ['X', 'Y', 'Z']).forEach((a) => {
        s.pos[a] = null;
      });
      continue;
    }
    if (axes.length && (s.motion || g.some((v) => [0, 1, 2, 3].includes(v)))) {
      axes.forEach((a) => {
        const v = at(a);
        const before = s.pos[a];
        if (s.distance === 'G91') {
          s.pos[a] = s.pos[a] === null ? null : s.pos[a] + v;
        } else {
          s.pos[a] = v;
        }
        // The feed of the last cutting move down in Z is the plunge feed.
        const cutting = g.includes(1) || (!g.some((x) => [0, 2, 3].includes(x)) && s.motion === 'G1');
        if (a === 'Z' && cutting && before !== null && s.pos.Z !== null && s.pos.Z < before && s.feed > 0) {
          s.plungeFeed = s.feed;
        }
        if (a === 'Z' && s.pos.Z !== null) {
          s.safeZ = s.safeZ === null ? s.pos.Z : Math.max(s.safeZ, s.pos.Z);
          // s.motion already holds this line's motion word, or the modal one.
          if (s.motion === 'G0') {
            s.rapidZ = s.rapidZ === null ? s.pos.Z : Math.max(s.rapidZ, s.pos.Z);
          }
        }
      });
    }
  }
  return s;
};

// Whether a program sets its units (G20/G21) and distance mode (G90/G91)
// before its first move. When it does not, it runs in whatever modes Grbl is
// left in (Grbl keeps G20 after M2/M30, and a macro can leave G91), while the
// preview and the travel check assume millimetres and absolute coordinates.
export const modalsBeforeFirstMove = (gcode) => {
  const out = { units: false, distance: false };
  const lines = programLines(gcode);
  for (let i = 0; i < lines.length; i++) {
    const w = words(clean(lines[i]));
    w.forEach(([l, v]) => {
      if (l === 'G' && (v === 20 || v === 21)) {
        out.units = true;
      } else if (l === 'G' && (v === 90 || v === 91)) {
        out.distance = true;
      }
    });
    if ((out.units && out.distance) || w.some(([l]) => 'XYZIJKR'.indexOf(l) >= 0)) {
      break;
    }
  }
  return out;
};

// Builds the program that restarts at line `from`.
export const buildResume = (gcode, from, { name = '' } = {}) => {
  const lines = programLines(gcode);
  if (!Number.isInteger(from) || from < 2 || from > lines.length) {
    throw refuse('ETOUCH_RESUME_LINE', 'Ligne de reprise invalide : choisissez entre 2 et ' + lines.length + '.', { min: 2, max: lines.length });
  }
  const s = stateBefore(lines, from);
  if (s.distance === 'G91') {
    throw refuse('ETOUCH_RESUME_RELATIVE', 'Le programme est en coordonnées relatives (G91) à la ligne ' + from + ' : reprise impossible.', { from });
  }
  if (s.toolOffset !== null) {
    throw refuse('ETOUCH_RESUME_TOOL_OFFSET_ACTIVE', 'Décalage de longueur d’outil (G43.1) actif depuis la ligne ' + s.toolOffset + ' : non rejoué, reprise impossible avant son annulation (G49).', { line: s.toolOffset });
  }
  if (s.pos.X === null || s.pos.Y === null || s.pos.Z === null) {
    if (s.wcsReset) {
      throw refuse('ETOUCH_RESUME_WCS_POSITION', 'Le programme change de repère (' + s.wcsReset.wcs + ' à la ligne ' + s.wcsReset.line + ') : X, Y et Z doivent être redonnés en absolu sous ce repère avant la ligne ' + from + '. Choisissez une ligne plus loin.', { wcs: s.wcsReset.wcs, line: s.wcsReset.line, from });
    }
    throw refuse('ETOUCH_RESUME_POSITION', 'Position avant la ligne ' + from + ' inconnue (X, Y et Z doivent avoir été donnés en absolu) : choisissez une ligne plus loin.', { from });
  }
  if (s.safeZ === null || s.safeZ < s.pos.Z) {
    throw refuse('ETOUCH_RESUME_CLEARANCE', 'Hauteur de dégagement inconnue avant la ligne ' + from + ' : choisissez une ligne plus loin.', { from });
  }
  // The clearance is the highest Z seen; it is a height the program treats as
  // free only when a rapid (G0) reached that height or one below it. Without
  // any rapid Z under this offset, the highest Z is a cutting depth: the rapid
  // XY move of the preamble would cross the part.
  if (s.rapidZ === null) {
    throw refuse('ETOUCH_RESUME_NO_RAPID_Z', 'Hauteur de dégagement inconnue avant la ligne ' + from + ' (aucun déplacement rapide G0 en Z' + (s.wcsReset ? ' sous ' + s.wcs : '') + ') : choisissez une ligne après un retrait en rapide.', { from, wcs: s.wcsReset ? s.wcs : null });
  }
  if (s.feed === null || s.feed <= 0) {
    throw refuse('ETOUCH_RESUME_FEED', 'Avance inconnue avant la ligne ' + from + ' : choisissez une ligne plus loin.', { from });
  }
  const spindleOn = s.spindle === 'M3' || s.spindle === 'M4';
  if (spindleOn && !(s.speed > 0)) {
    throw refuse('ETOUCH_RESUME_SPINDLE_SPEED', 'Vitesse de broche inconnue avant la ligne ' + from + ' : reprise impossible.', { from });
  }
  const preamble = [
    '(CNCjs Touch : reprise a la ligne ' + from + (name ? ' de ' + name.replace(/[()]/g, '') : '') + ')',
    [s.units, 'G90', s.plane, s.wcs, s.feedMode].filter(Boolean).join(' '),
    'G0 Z' + fmt(s.safeZ),
    'G0 X' + fmt(s.pos.X) + ' Y' + fmt(s.pos.Y)
  ];
  if (spindleOn) {
    preamble.push(s.spindle + ' S' + fmt(s.speed), 'G4 P' + SPINUP_SECONDS);
  }
  if (s.coolant !== 'M9') {
    preamble.push(s.coolant);
  }
  const plunge = s.plungeFeed || s.feed;
  preamble.push('G1 Z' + fmt(s.pos.Z) + ' F' + fmt(plunge));
  if (plunge !== s.feed) {
    preamble.push('F' + fmt(s.feed));
  }
  // A first line relying on the modal motion (e.g. "X10 Y5" after G1) gets it back.
  let first = lines[from - 1];
  const firstCode = clean(first);
  const hasAxis = /(^|[^A-Z])[XYZIJKR]\s*[-+]?[\d.]/.test(firstCode);
  // Motion words, compact code included (G90G1X10: the G1 follows a digit).
  const hasMotion = words(firstCode).some(([l, v]) => l === 'G' && [0, 1, 2, 3].includes(v));
  if (hasAxis && !hasMotion && s.motion) {
    first = s.motion + ' ' + first.trim();
  }
  const program = preamble.concat([first], lines.slice(from)).join('\n') + '\n';
  // Limits the operator must know before confirming (shown with the plan).
  const notes = [
    'Le dégagement Z' + fmt(s.safeZ) + ' est le Z le plus haut vu avant la ligne ' + from + ', pas une garantie d’absence d’obstacle (brides, pièce).',
    // Variant B of the counter-review: a program without any rapid Z retract
    // (G1-only posts) is not resumable; the rapid that justifies the clearance is named.
    'Retrait en rapide constaté à Z' + fmt(s.rapidZ) + (s.wcsReset ? ' sous ' + s.wcs : '') + ' : sans déplacement rapide G0 en Z, aucune reprise ne serait proposée.'
  ];
  if (!s.units) {
    notes.push('Le programme ne fixe pas ses unités (G20/G21) : la machine garde les siennes.');
  }
  if (!s.wcs) {
    notes.push('Le programme ne choisit pas de repère (G54-G59) : la machine garde le sien.');
  }
  if (s.unitsChanged) {
    notes.push('Le programme change d’unités (ligne ' + s.unitsChanged + ') : positions et avances de la reprise converties en ' + s.units + '.');
  }
  if (s.wcsReset) {
    notes.push('Repère ' + s.wcs + ' choisi à la ligne ' + s.wcsReset.line + ' : la reprise part des positions redonnées sous ce repère.');
  }
  return {
    program,
    from,
    total: lines.length,
    line: lines[from - 1].trim().slice(0, 120),
    tool: s.tool,
    toolChanged: s.toolChanged,
    spindle: spindleOn ? { mode: s.spindle, speed: s.speed } : null,
    coolant: s.coolant !== 'M9' ? s.coolant : null,
    position: { ...s.pos },
    safeZ: s.safeZ,
    units: s.units,
    wcs: s.wcs,
    preamble,
    notes
  };
};
