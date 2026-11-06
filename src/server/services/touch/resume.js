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

// Comments removed the way the CNCjs sender does (nested parentheses), upper
// case (codeOf), then read as Grbl reads the line: every whitespace removed
// ("G4 9 Z-100" is G49 Z-100, "G0 X1 0" is X10). A CNCjs [expression] or a
// "/" (block delete, stripped by Grbl, kept by CNCjs) is refused by
// checkSyntax before any line is read.
const clean = codeOf;
const grbl = (line) => clean(line).replace(/\s+/g, '');

const words = (code) => {
  const out = [];
  const re = /([A-Z])([-+]?(?:\d+\.?\d*|\.\d+))/g;
  let m;
  while ((m = re.exec(code))) {
    out.push([m[1], Number(m[2])]);
  }
  return out;
};

const fmt = (n) => String(Math.round(n * 10000) / 10000);

// A feed written with enough decimals never to round to 0 (F0.00001 stays
// F0.00001): Grbl reads no exponent, so a feed too small to write is refused.
const fmtFeed = (f, from) => {
  const short = fmt(f);
  if (Number(short) > 0) {
    return short;
  }
  for (let digits = 5; digits <= 10; digits++) {
    const text = f.toFixed(digits);
    if (Number(text) > 0) {
      return text.replace(/0+$/, '');
    }
  }
  throw refuse('ETOUCH_RESUME_FEED_PRECISION', 'Avance trop petite pour être écrite (moins de 0,0000000001) avant la ligne ' + from + ' : reprise impossible.', { from });
};

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
  if (s.zLast !== null) {
    s.zLast *= k;
  }
};

// State of the program just before line `from` (1-based, sender numbering).
// Units and work offset stay null when the program never chose them: the
// program then relies on the controller's own state, which the preamble must
// leave alone (a forced G54 would move a G55 job to another origin).
export const stateBefore = (lines, from) => {
  const s = {
    units: null,
    // Null until the program chooses them: the preamble never assumes G90, G17 or G94.
    distance: null,
    plane: null,
wcs: null,
    feedMode: null,
motion: null,
    feed: null,
plungeFeed: null,
speed: null,
spindle: 'M5',
    // Mist (M7) and flood (M8) are independent, M9 clears both; coolantSet
    // once the program commanded any of them. tloCancelled: a G49 was seen
    // (the preamble repeats it, an inherited G43.1 offset would stay).
    coolant: { mist: false, flood: false },
    coolantSet: false,
    tloCancelled: false,
    // The first line with an axis word, and the distance mode it was read in.
    firstMove: null,
tool: null,
toolChanged: false,
    pos: { X: null, Y: null, Z: null },
safeZ: null,
    // Highest absolute Z reached by a rapid (G0) under the current work
    // offset: a Z the program itself treats as free. The clearance (highest Z
    // of all) is at or above it; without any rapid Z, the highest Z is only a
    // cutting depth, not a clearance.
    rapidZ: null,
    // Line of the last unit change that converted acquired values, and of the
    // work offset change that made them unknown.
    unitsChanged: null,
wcsReset: null,
    // Laser resume: the last absolute Z reached and whether Z ever took
    // another value; the motion mode of the last line that moved.
    zLast: null,
    zVaries: false,
    moveMotion: null
  };
  for (let i = 0; i < from - 1; i++) {
    const code = grbl(lines[i]);
    if (!code || code === '%') {
      continue;
    }
    // CNCjs evaluates % lines and #variables when it sends them: the values
    // Grbl receives cannot be known here ([expressions] are refused by checkSyntax).
    if (/^%/.test(code) || /#/.test(code)) {
      throw refuse('ETOUCH_RESUME_EXPRESSION', 'Expression ou macro CNCjs à la ligne ' + (i + 1) + ' avant la ligne ' + from + ' : reprise impossible.', { line: i + 1, from });
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
    if (g49WithAxis(w)) {
      throw g49Refusal(lineNo);
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
        // The Z arithmetic of a dynamic tool offset (G43.1, then G49) is not
        // modelled: the Z positions seen after it are not the machine's.
        throw refuse('ETOUCH_RESUME_TOOL_OFFSET', 'Décalage d’outil dynamique (G43.1) à la ligne ' + lineNo + ' avant la ligne ' + from + ' : hauteurs Z non modélisées, reprise impossible.', { line: lineNo, from });
      } else if (v === 49) {
        s.tloCancelled = true;
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
      } else if (v === 7 || v === 8) {
        s.coolant[v === 7 ? 'mist' : 'flood'] = true;
        s.coolantSet = true;
      } else if (v === 9) {
        s.coolant = { mist: false, flood: false };
        s.coolantSet = true;
      } else if (v === 6) {
        s.toolChanged = true;
      }
    });
    const machineMove = g.includes(53) || g.includes(28) || g.includes(30);
    // Grbl keeps a G38.x as the modal motion: an axis-only line after it
    // probes again, and the position of a probed axis is unknown.
    const probeWord = g.find((v) => v >= 38.2 && v <= 38.5);
    if (probeWord !== undefined) {
      s.motion = 'G' + probeWord;
    }
    const probe = /^G38/.test(s.motion || '');
    const axes = ['X', 'Y', 'Z'].filter((a) => at(a) !== null);
    if (axes.length && s.firstMove === null) {
      s.firstMove = { line: lineNo, distance: s.distance };
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
      s.moveMotion = s.motion;
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
          if (s.zLast !== null && Math.abs(s.zLast - s.pos.Z) > 1e-9) {
            s.zVaries = true;
          }
          s.zLast = s.pos.Z;
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
    const w = words(grbl(lines[i]));
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

// G words whose axis words are their own, not a move in the modal motion:
// a non-modal G10/G28/G30/G92 or G43.1 with a motion word on the same block
// is error:24 in Grbl 1.1 (gcode.c, axis command conflict), a G38.x with one
// is error:21 (two words of the motion group). Such a line is complete as
// written: prefixing it would be refused after the preamble has moved the
// machine (bug hunt E-3: a resume at the "G28 G91 Z0" of a tool change).
// Any first line that does not set the motion mode itself (no G0-G3 or
// G38.x word: a non-modal command, a dwell, an M code, a comment…) would
// leave the preamble's G1 to the lines after it, so the program's modal
// motion is restored on its own line before it; a G38.x sets the motion
// mode itself, as in the program.
const OWN_AXIS_WORDS = [10, 28, 30, 92, 43.1, 38.2, 38.3, 38.4, 38.5];

// A first line relying on the modal motion (e.g. "X10 Y5" after G1) gets it back.
const firstLineOf = (lines, from, s) => {
  const first = lines[from - 1];
  const firstCode = grbl(first);
  const hasAxis = /[XYZIJKR][-+]?[\d.]/.test(firstCode);
  const g = words(firstCode).filter(([l]) => l === 'G').map(([, v]) => v);
  // Motion words, compact code included (G90G1X10: the G1 follows a digit).
  const motion = g.filter((v) => [0, 1, 2, 3].includes(v)).map((v) => 'G' + v).pop() || null;
  const modalMove = hasAxis && !g.some((v) => OWN_AXIS_WORDS.includes(v));
  // Only a G0-G3 modal motion is given back to a plain axis line (a probe
  // mode is not: see motionRestore).
  const prefixed = modalMove && !motion && /^G[0-3]$/.test(s.motion || '');
  const setsMotion = !!motion || g.some((v) => v >= 38.2 && v <= 38.5);
  return {
    text: prefixed ? s.motion + ' ' + first.trim() : first,
    motion: motion || (modalMove ? s.motion : null),
    xy: /[XY][-+]?[\d.]/.test(firstCode),
    // The lines after it run in the program's modal motion, not the preamble's.
    restoreMotion: !setsMotion && !prefixed
  };
};

// The program's modal motion, on its own line (valid Grbl, no move), before a
// first line that does not set it. Only G0 and G1 can be restored that way: an
// arc mode (G2/G3) needs I/J/R words, an unknown one cannot be guessed.
const motionRestore = (s, from) => {
  if (s.motion === 'G0') {
    return 'G0';
  }
  if (s.motion === 'G1') {
    return 'G1 F' + fmtFeed(s.feed, from);
  }
  const motion = s.motion || 'inconnu';
  throw refuse('ETOUCH_RESUME_FIRST_LINE', 'Mode de déplacement ' + motion + ' avant la ligne ' + from + ' : il ne peut pas être rétabli devant cette ligne (qui ne fixe pas le sien), choisissez une autre ligne de reprise.', { motion, from });
};

// Units, distance, plane, work offset and feed mode of the preamble.
const modalLine = (s) => [s.units, 'G90', s.plane, s.wcs, s.feedMode].filter(Boolean).join(' ');

// The coolant the program had: M9 first (whatever the controller inherited),
// then the active ones; nothing when the program never commanded it.
const coolantLines = (s) => (s.coolantSet ? ['M9'].concat(s.coolant.mist ? ['M7'] : [], s.coolant.flood ? ['M8'] : []) : []);
const coolantOf = (s) => {
  const on = [].concat(s.coolant.mist ? ['M7'] : [], s.coolant.flood ? ['M8'] : []);
  return on.length ? on.join(' ') : null;
};

// A file that never chooses G94 is resumed like one that never chooses its units or its
// work offset: the board keeps its own mode (G94 after power-up, a reset, M2 or M30), and
// the plan says so. Refusing would refuse the common posts that omit G94 (FreeCAD grbl,
// many hand-written files); a G93 of the file itself is refused earlier.
const checkFeedMode = () => {};

const commonNotes = (s) => {
  const notes = [];
  if (!s.units) {
    notes.push('Le programme ne fixe pas ses unités (G20/G21) : la machine garde les siennes.');
  }
  if (!s.wcs) {
    notes.push('Le programme ne choisit pas de repère (G54-G59) : la machine garde le sien.');
  }
  if (!s.feedMode) {
    notes.push('Le programme ne fixe pas son mode d’avance (G94) : la machine garde le sien.');
  }
  if (s.unitsChanged) {
    notes.push('Le programme change d’unités (ligne ' + s.unitsChanged + ') : positions et avances de la reprise converties en ' + s.units + '.');
  }
  if (s.wcsReset) {
    notes.push('Repère ' + s.wcs + ' choisi à la ligne ' + s.wcsReset.line + ' : la reprise part des positions redonnées sous ce repère.');
  }
  return notes;
};

// Laser resume (PROFILES-CONTRACT §4), a mode of the same builder: only from
// a pass/object boundary (the start of a new rapid G0, after a cut or with
// the laser off), with M5 first, the modal state, a rapid to the XY start, no
// Z move unless the program's Z is constant and known, then the replayed
// M3/M4 and S: no dwell, no plunge. Grbl in laser mode ($32=1, checked by the
// caller from the machine profile) emits only during G1/G2/G3 moves.
const buildLaserResume = (lines, from, s, name) => {
  const first = firstLineOf(lines, from, s);
  if (first.motion !== 'G0' || !first.xy) {
    throw refuse('ETOUCH_LASER_RESUME_NOT_RAPID', 'Reprise laser seulement au début d’un déplacement rapide (G0 en X/Y) : la ligne ' + from + ' n’en est pas un.', { from });
  }
  const off = s.spindle === 'M5' || s.speed === 0;
  const afterCut = ['G1', 'G2', 'G3'].includes(s.moveMotion);
  if (!off && !afterCut) {
    throw refuse('ETOUCH_LASER_RESUME_NOT_BOUNDARY', 'La ligne ' + from + ' n’est pas une limite de passe : choisissez le premier G0 après une découpe, ou un G0 après M5 ou S0.', { from });
  }
  if (s.pos.X === null || s.pos.Y === null) {
    throw refuse('ETOUCH_LASER_RESUME_POSITION', 'Position X/Y avant la ligne ' + from + ' inconnue (X et Y doivent avoir été donnés en absolu) : choisissez une ligne plus loin.', { from });
  }
  if (s.zVaries) {
    throw refuse('ETOUCH_LASER_RESUME_Z_VARIES', 'Hauteur Z variable avant la ligne ' + from + ' : reprise laser impossible sans hauteur de tête connue.', { from });
  }
  const emitting = s.spindle === 'M3' || s.spindle === 'M4';
  if (emitting && s.speed === null) {
    throw refuse('ETOUCH_LASER_RESUME_S_UNKNOWN', 'Consigne S inconnue avant la ligne ' + from + ' alors que le laser est commandé (M3/M4) : reprise impossible.', { from });
  }
  checkFeedMode(s, from);
  const preamble = [
    '(CNCjs Touch : reprise laser a la ligne ' + from + (name ? ' de ' + name.replace(/[()]/g, '') : '') + ')',
    'M5',
    modalLine(s)
  ].concat(s.tloCancelled ? ['G49'] : [], ['G0 X' + fmt(s.pos.X) + ' Y' + fmt(s.pos.Y)]);
  const zKnown = s.pos.Z !== null;
  if (zKnown) {
    preamble.push('G0 Z' + fmt(s.pos.Z));
  }
  preamble.push(...coolantLines(s));
  if (s.feed !== null && s.feed > 0) {
    preamble.push('F' + fmtFeed(s.feed, from));
  }
  if (emitting) {
    preamble.push(s.spindle + ' S' + fmt(s.speed));
  } else if (s.speed !== null) {
    preamble.push('S' + fmt(s.speed));
  }
  const program = preamble.concat([first.text], lines.slice(from)).join('\n') + '\n';
  const notes = [
    'Reprise laser : M5, déplacement rapide (G0) vers le départ X/Y sans émission ; le laser n’est commandé qu’au premier déplacement de coupe (G1/G2/G3, mode laser $32=1).',
    zKnown
      ? 'Z ramené à Z' + fmt(s.pos.Z) + ', hauteur constante du programme avant la ligne ' + from + '.'
      : 'Le programme ne donne pas de Z avant la ligne ' + from + ' : la tête reste à sa hauteur actuelle.'
  ].concat(commonNotes(s));
  return {
    program,
    mode: 'laser',
    from,
    total: lines.length,
    line: lines[from - 1].trim().slice(0, 120),
    tool: s.tool,
    toolChanged: s.toolChanged,
    spindle: emitting ? { mode: s.spindle, speed: s.speed } : null,
    coolant: coolantOf(s),
    position: { ...s.pos },
    safeZ: null,
    units: s.units,
    wcs: s.wcs,
    preamble,
    notes
  };
};

// G49 with an axis word: Grbl would run the axis word in the modal motion,
// other controllers cancel the offset only. Not modelled, refused.
const g49WithAxis = (w) => w.some(([l, v]) => l === 'G' && v === 49) && w.some(([l]) => 'XYZ'.indexOf(l) >= 0);
const g49Refusal = (line) => refuse('ETOUCH_RESUME_G49_AXIS', 'G49 avec mot d’axe à la ligne ' + line + ' : effet ambigu (annulation du décalage d’outil ou déplacement), reprise impossible.', { line });

// The whole file, before anything is read: a CNCjs [expression] (evaluated
// when the line is sent, its words cannot be read here) or a "/" (block
// delete, stripped by Grbl but sent as is by CNCjs) anywhere, before, at or
// after the resume line, is refused.
const checkSyntax = (lines) => {
  const line = lines.findIndex((text) => /[[\]/]/.test(clean(text)));
  if (line >= 0) {
    throw refuse('ETOUCH_RESUME_UNSUPPORTED_SYNTAX', 'Expression CNCjs ou « / » à la ligne ' + (line + 1) + ' : syntaxe non prise en charge par la reprise.', { line: line + 1 });
  }
};

// Grbl resets its modes at a program end (M2/M30): nothing after one is resumable.
const checkProgramEnd = (lines, from) => {
  for (let i = 0; i < from - 1; i++) {
    const m = words(grbl(lines[i])).filter(([l]) => l === 'M').map(([, v]) => v);
    if (m.includes(2) || m.includes(30)) {
      throw refuse('ETOUCH_RESUME_PROGRAM_END', 'Fin de programme (M2/M30) à la ligne ' + (i + 1) + ' avant la ligne ' + from + ' : la carte y remet ses modes, reprise impossible.', { line: i + 1, from });
    }
  }
};

// The resume line itself: a CNCjs directive or variable (its words cannot be
// read here), or a G49 with an axis word, is refused like the lines before it.
const checkFirstLine = (lines, from) => {
  const code = grbl(lines[from - 1]);
  if (/^%/.test(code) || /#/.test(code)) {
    throw refuse('ETOUCH_RESUME_FIRST_EXPRESSION', 'Expression ou macro CNCjs à la ligne de reprise ' + from + ' : sa valeur n’est pas connue ici, choisissez une autre ligne.', { from });
  }
  if (g49WithAxis(words(code))) {
    throw g49Refusal(from);
  }
};

// An arc from the resume line on, while the program never chose its plane
// (G17/G18/G19) before it: the preamble cannot restore a plane it does not
// know, and the controller may be in G18 or G19. The motion mode is followed
// line by line as Grbl keeps it (an axis-only line after a G2/G3 is an arc).
// A plane chosen later in the program, before its first arc, is the
// program's own business.
const checkPlane = (lines, from, s) => {
  if (s.plane) {
    return;
  }
  const refusal = (line) => refuse('ETOUCH_RESUME_PLANE', 'Plan de travail (G17/G18/G19) non fixé avant la ligne ' + from + ' et arc (G2/G3) à la ligne ' + line + ' : plan de la carte inconnu, reprise impossible.', { from, line });
  let motion = s.motion;
  for (let i = from - 1; i < lines.length; i++) {
    const w = words(grbl(lines[i]));
    const g = w.filter(([l]) => l === 'G').map(([, v]) => v);
    if (g.some((v) => v === 17 || v === 18 || v === 19)) {
      return;
    }
    const set = g.filter((v) => [0, 1, 2, 3].includes(v) || (v >= 38.2 && v <= 38.5)).pop();
    if (set !== undefined) {
      motion = 'G' + set;
    } else if (g.includes(80)) {
      motion = null;
    }
    if ((motion === 'G2' || motion === 'G3') && w.some(([l]) => 'XYZIJKR'.indexOf(l) >= 0)) {
      throw refusal(i + 1);
    }
  }
};

// Builds the program that restarts at line `from`. `mode` is chosen by the
// server from the machine profile: 'cnc' (default) or 'laser'.
export const buildResume = (gcode, from, { name = '', mode = 'cnc' } = {}) => {
  const lines = programLines(gcode);
  if (!Number.isInteger(from) || from < 2 || from > lines.length) {
    throw refuse('ETOUCH_RESUME_LINE', 'Ligne de reprise invalide : choisissez entre 2 et ' + lines.length + '.', { min: 2, max: lines.length });
  }
  checkSyntax(lines);
  checkProgramEnd(lines, from);
  const s = stateBefore(lines, from);
  checkFirstLine(lines, from);
  checkPlane(lines, from, s);
  // The controller may have been left in G91 by an earlier program: a move
  // made before the file chose G90 or G91 was read in an unknown mode, and a
  // file that never chose it is not resumed (the preamble's own G90 would hide it).
  let unchosen = s.distance === null ? from : null;
  if (s.firstMove && s.firstMove.distance === null) {
    unchosen = s.firstMove.line;
  }
  if (unchosen !== null) {
    throw refuse('ETOUCH_RESUME_DISTANCE', 'Mode de distance (G90/G91) non fixé avant le premier déplacement du programme (ligne ' + unchosen + ') : le mode de la carte est inconnu, reprise impossible.', { line: unchosen, from });
  }
  if (s.distance === 'G91') {
    throw refuse('ETOUCH_RESUME_RELATIVE', 'Le programme est en coordonnées relatives (G91) à la ligne ' + from + ' : reprise impossible.', { from });
  }
  if (mode === 'laser') {
    return buildLaserResume(lines, from, s, name);
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
  checkFeedMode(s, from);
  const preamble = [
    '(CNCjs Touch : reprise a la ligne ' + from + (name ? ' de ' + name.replace(/[()]/g, '') : '') + ')',
    modalLine(s)
  ].concat(s.tloCancelled ? ['G49'] : [], [
    'G0 Z' + fmt(s.safeZ),
    'G0 X' + fmt(s.pos.X) + ' Y' + fmt(s.pos.Y)
  ]);
  if (spindleOn) {
    preamble.push(s.spindle + ' S' + fmt(s.speed), 'G4 P' + SPINUP_SECONDS);
  } else if (s.speed !== null) {
    // The S the program had, so an M3 after the line starts at that speed.
    preamble.push('S' + fmt(s.speed));
  }
  preamble.push(...coolantLines(s));
  const plunge = s.plungeFeed || s.feed;
  preamble.push('G1 Z' + fmt(s.pos.Z) + ' F' + fmtFeed(plunge, from));
  if (plunge !== s.feed) {
    preamble.push('F' + fmtFeed(s.feed, from));
  }
  const first = firstLineOf(lines, from, s);
  if (first.restoreMotion) {
    preamble.push(motionRestore(s, from));
  }
  const program = preamble.concat([first.text], lines.slice(from)).join('\n') + '\n';
  // Limits the operator must know before confirming (shown with the plan).
  const notes = [
    'Le dégagement Z' + fmt(s.safeZ) + ' est le Z le plus haut vu avant la ligne ' + from + ', pas une garantie d’absence d’obstacle (brides, pièce).',
    // Variant B of the counter-review: a program without any rapid Z retract
    // (G1-only posts) is not resumable; the rapid that justifies the clearance is named.
    'Retrait en rapide constaté à Z' + fmt(s.rapidZ) + (s.wcsReset ? ' sous ' + s.wcs : '') + ' : sans déplacement rapide G0 en Z, aucune reprise ne serait proposée.'
  ].concat(commonNotes(s));
  return {
    program,
    mode: 'cnc',
    from,
    total: lines.length,
    line: lines[from - 1].trim().slice(0, 120),
    tool: s.tool,
    toolChanged: s.toolChanged,
    spindle: spindleOn ? { mode: s.spindle, speed: s.speed } : null,
    coolant: coolantOf(s),
    position: { ...s.pos },
    safeZ: s.safeZ,
    units: s.units,
    wcs: s.wcs,
    preamble,
    notes
  };
};
