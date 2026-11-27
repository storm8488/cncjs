// Server-side pre-check of a program's XYZ travel (F2): the exact text that
// will be sent to the controller is walked once at load time (units, distance
// mode, work offset, linear and arc moves, machine-coordinate moves, offset
// changes, uninterpreted words), then its extent is compared with the Grbl
// travel settings ($130-$132, homing direction $23), the current position and
// the active work offset. Every verdict is `validated`, `outside` or `unknown`
// with French reasons; anything the analysis could not follow (a macro, a
// probe, a dynamic tool offset, an offset change, a homing not observed) ends
// in `unknown`, never in `validated`. This is a travel check against the
// machine envelope, not a collision check against clamps, tool or stock.
// Every reason also exists as `{ code, params, message }` (codedReasons): a
// stable ETOUCH_CHECK_* code and the values of its French message, so a client
// can show it in its own language; the French text is unchanged.

// The homing convention per axis and the usable travel (C-04, C-06), shared with the moves.
// Explicit extension: examples/cncjs-touch loads this module with Node's native ES module loader.
// eslint-disable-next-line import/extensions
import { envelopeOf, usableOf } from './motion.js';
// eslint-disable-next-line import/extensions
import { createProgramTime } from './program-time.js';

const MM_PER_INCH = 25.4;
// Arc geometry only; travel comparisons are strict (float rounding guard only).
const TOLERANCE_MM = 0.001;
const ROUNDING_MM = 1e-9;
const AXES = ['X', 'Y', 'Z'];
const TWO_PI = 2 * Math.PI;

// Words Grbl 1.1 accepts; everything else is listed as not interpreted.
const KNOWN_G = [0, 1, 2, 3, 4, 10, 17, 18, 19, 20, 21, 28, 28.1, 30, 30.1, 38.2, 38.3, 38.4, 38.5, 40, 43.1, 49, 53,
  54, 55, 56, 57, 58, 59, 61, 80, 90, 90.1, 91, 91.1, 92, 92.1, 93, 94];
const KNOWN_M = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30];

export const programLines = (gcode) => String(gcode).split('\n').filter((line) => line.trim().length > 0);

// Same nonempty-line numbering as programLines/the sender, without a line array.
function* walkLines(gcode) {
  const text = String(gcode);
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(start, end);
    if (line.trim().length > 0) {
      yield line;
    }
    start = end + 1;
  }
}

// The code part of a line exactly as the CNCjs sender keeps it (gcode-parser
// 2.2 stripComments, the `line` it sends to Grbl): parentheses nest, so
// "(a (b) G0 X50" is a comment to the end of the line; a ';' outside
// parentheses ends the line, inside them it is comment text; an unmatched ')'
// is dropped. Shared with resume.js so both read the lines the sender sends.
export const stripComments = (line) => {
  const text = String(line);
  if (text.indexOf('(') < 0 && text.indexOf(')') < 0) {
    const semicolon = text.indexOf(';');
    return semicolon < 0 ? text : text.slice(0, semicolon);
  }
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ';' && depth === 0) {
      break;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += c;
    }
  }
  return out;
};

export const codeOf = (line) => stripComments(line).trim().toUpperCase();

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

// Grbl drops every space of a line before reading it (protocol.c) and CNCjs sends the line as
// written: a line whose words change once its spaces are gone (`Z-1 40` is Z−140, `X - 5` is
// X−5) is read otherwise by the board (C-57).
const sameWithoutSpaces = (code) => {
  const spaced = words(code);
  const packed = words(code.replace(/\s+/g, ''));
  return spaced.length === packed.length && spaced.every(([letter, value], i) => letter === packed[i][0] && value === packed[i][1]);
};

const fmt = (n) => String(Math.round(n * 1000) / 1000);

// Axis A, lot L0 (design/axe-a/AXE-A-CONCEPTION.md): the rotary axis letters (A, B, C) a line
// commands, as the board reads it (spaces dropped), in that order; '' when none. `code` is a
// line without its comments (codeOf). A `$` line is a board command, not G-code: never counted.
export const rotaryLetters = (code) => {
  if (/^\$/.test(code)) {
    return '';
  }
  const found = words(code.replace(/\s+/g, '')).map(([letter]) => letter);
  return ['A', 'B', 'C'].filter((letter) => found.includes(letter)).join('');
};

// N1, display only: the tools the file names. Bounded in number and in length; the description
// is the file's own text, which the page writes as text (never as markup).
const MAX_TOOLS = 8;
const MAX_TOOL_TEXT = 60;
const MAX_LINE_COMMENTS = 4;

// The comment texts of a line as written: what stripComments drops (same nesting rules).
const commentsOf = (line) => {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < line.length && out.length < MAX_LINE_COMMENTS; i++) {
    const c = line[i];
    if (c === ';' && depth === 0) {
      out.push(line.slice(i + 1));
      return out;
    }
    if (c === '(') {
      if (depth === 0) {
        start = i + 1;
      }
      depth++;
    } else if (c === ')' && depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(line.slice(start, i));
      }
    }
  }
  if (depth > 0 && out.length < MAX_LINE_COMMENTS) {
    out.push(line.slice(start));
  }
  return out;
};

// Tool comments of the usual post-processors: `(T1 D=6. CR=0. - flat end mill)` (Fusion 360),
// `(T1=6mm_Endmill)` and `(Begin operation: TC: 6mm Endmill)` (FreeCAD), `(Tool 1 = End Mill)`,
// `; Tool: 6 mm end mill` (Vectric, Estlcam and others), `(TOOL/MILL,6,0,10,0)`.
// Returns { number, text } (number null when the comment gives none), or null.
const TOOL_NUMBERED = /^T\s*(\d{1,6})(?![\d.])\s*[:=-]?\s*(.*)$/i;
const TOOL_WORD = /^(?:TOOL|OUTIL|WERKZEUG)\s*(?:(?:NUMBER|NO\.?|#)\s*)?(\d{1,6})?\s*[:=]\s*(.+)$/i;
const TOOL_OTHER = /^(?:TOOL\/\w+\s*,|BEGIN OPERATION\s*:\s*TC\s*:)\s*(.+)$/i;
// Control characters become a space; the invisible characters that reorder or hide text
// (bidirectional marks, zero-width, line separators) and half surrogate pairs are dropped.
const INVISIBLE = /[\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]|^[\uD800-\uDFFF]$/;
const printable = (text) => Array.from(text).map((ch) => {
  if (INVISIBLE.test(ch)) {
    return '';
  }
  return ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch;
}).join('');
const toolNote = (comment) => {
  const text = printable(comment.slice(0, 200)).trim();
  // Cut by code points: never half a character.
  const brief = (value) => Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, MAX_TOOL_TEXT).join('').trim();
  let m = TOOL_NUMBERED.exec(text);
  if (m) {
    return { number: Number(m[1]), text: brief(m[2]) };
  }
  m = TOOL_WORD.exec(text);
  if (m) {
    // `Tool number: 3` names the number after the colon.
    const alone = m[1] === undefined && /^\d{1,6}$/.test(m[2].trim());
    return alone ? { number: Number(m[2]), text: '' } : { number: m[1] === undefined ? null : Number(m[1]), text: brief(m[2]) };
  }
  m = TOOL_OTHER.exec(text);
  return m ? { number: null, text: brief(text) } : null;
};

// A reason: the French text (unchanged) with its stable code and its values.
const reason = (code, params, message) => ({ code, params, message });

const extend = (extent, axis, value) => {
  if (value === null || !Number.isFinite(value)) {
    return;
  }
  const e = extent[axis];
  if (!e) {
    extent[axis] = { min: value, max: value };
  } else {
    e.min = Math.min(e.min, value);
    e.max = Math.max(e.max, value);
  }
};

// A separate closure keeps only the source, not the previous walk's analysis/state.
const rebuildTiming = (source) => (context) => analyzeProgram(source, context).timing;

// Walks the program. `extent` is in millimetres in the work coordinates of the
// (single) work offset the program uses; `unknownAxes[axis]` tells why an axis
// could not be followed. `rawUnits` is true when the program never fixes its
// units before moving: the extent is then in the controller's units, which the
// comparison converts when the machine's modal state is known.
export const analyzeProgram = (gcode, timingContext) => {
  const time = createProgramTime(timingContext);
  // N1: the spin-up time is summed apart, at the overrides that leave the spindle the least
  // time (rapids 100 %, feed at least 100 %): the operator may change them after the load.
  const loadFeed = Number(timingContext && timingContext.overrides && timingContext.overrides.feed);
  const spin = createProgramTime({ settings: timingContext && timingContext.settings, overrides: { feed: loadFeed > 100 ? loadFeed : 100, rapid: 100 } });
  const a = {
    lines: 0,
    moves: 0,
    // Display-only timing model. Never participates in a travel verdict or a command guard.
    timing: time.timing,
    units: null,
    unitsChanges: [],
    rawUnits: false,
    distance: null,
    distanceChanges: [],
    relativeStart: false,
    wcs: null,
    wcsChanges: [],
    offsetChanges: [],
    // First line with G49 (tool length offset cancelled), or null.
    tloCancel: null,
    machineMoves: [],
    uninterpreted: [],
    // System writes and server expressions can invalidate the board protections used by D1.
    unsafeOverride: false,
    extent: { X: null, Y: null, Z: null },
    // G53 targets, in machine coordinates (program units when rawUnits).
    machineExtent: { X: null, Y: null, Z: null },
    unknownAxes: { X: null, Y: null, Z: null },
    // The same first reason per axis, coded ({ code, params, message }).
    unknownCodes: { X: null, Y: null, Z: null },
    zMin: null,
    zMax: null,
    // Spindle / laser commands (laser check): highest S and its line, first M3, first M4.
    spindle: { sMax: null, sMaxLine: null, m3Line: null, m4Line: null },
    // N1, display only. `tools.list`: { number, text, line (first T word), noteLine (its comment) },
    // at most MAX_TOOLS; `changes`: how many M6, the first at `changeLine`.
    tools: { list: [], truncated: false, changes: 0, changeLine: null },
    // N1, display only: the spindle start in force at the first entry into the material, and
    // the time the duration model counts between the two (a lower bound when `atLeast`).
    // `opaque`: a line that was not read (expression, line the board reads otherwise) came
    // before the entry; it may hold the spindle start.
    spinUp: { startLine: null, entryLine: null, seconds: null, dwell: 0, atLeast: false, feedInherited: false, supported: false, opaque: false }
  };
  const pos = { X: null, Y: null, Z: null };
  // Modal state while walking (one object, so the per-line closures below
  // never capture a loop-modified binding).
  const st = {
    scale: 1, // mm per program unit
    unitsKnown: false, // the program chose G20/G21 before moving
    machineUnitsKnown: true, // inherited units are usable until an opaque line may change them
    distance: 'G90',
    distanceSet: false,
    motion: null,
    plane: 'G17',
    arcMode: 'G91.1',
    moved: false,
    // N1: the duration mark at the spindle start, until the first entry into the material;
    // M3/M4 in force, and the last S setpoint the file gave (null: none yet).
    spinMark: null,
    spinning: false,
    speed: null,
    entered: false
  };
  let timingFeed = null;
  let timingMode = null;
  let timingEnded = false;
  const unknown = (axis, r) => {
    if (!a.unknownAxes[axis]) {
      a.unknownAxes[axis] = r.message;
      a.unknownCodes[axis] = r;
    }
  };
  const tool = (number, text, line, noteLine) => {
    const t = a.tools;
    let entry = t.list.find((e) => e.number === number && (number !== null || e.text === text));
    if (!entry) {
      if (t.list.length >= MAX_TOOLS) {
        t.truncated = true;
        return;
      }
      entry = { number, text: '', line: null, noteLine: null };
      t.list.push(entry);
    }
    if (!entry.text && text) {
      entry.text = text;
      entry.noteLine = noteLine;
    }
    if (entry.line === null && line !== null) {
      entry.line = line;
    }
  };
  const listed = (lineNo, code, impact) => {
    if (a.uninterpreted.length < 50) {
      a.uninterpreted.push({ line: lineNo, code, impact });
    }
  };

  for (const raw of walkLines(gcode)) {
    const lineNo = ++a.lines;
    const code = clean(raw);
    if (raw.indexOf('(') >= 0 || raw.indexOf(';') >= 0) {
      commentsOf(raw).forEach((comment) => {
        const note = toolNote(comment);
        if (note) {
          tool(note.number, note.text, null, lineNo);
        }
      });
    }
    if (!code || code === '%') {
      continue;
    }
    const timed = !timingEnded;
    // CNCjs directives and expressions execute on the server, G-code words
    // depend on variables: nothing can be followed after them.
    if (/^%/.test(code) || /[[\]#]/.test(code)) {
      a.timing.supported = false;
      a.unsafeOverride = true;
      a.spinUp.opaque = a.spinUp.opaque || (timed && !st.entered);
      st.machineUnitsKnown = false;
      listed(lineNo, raw.trim().slice(0, 40), true);
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_MACRO', { line: lineNo }, 'Macro ou expression CNCjs à la ligne ' + lineNo + ' : contenu non prévisible.')));
      continue;
    }
    // A line the board reads otherwise (C-57), or a system command ($20=0, $H…, C-61): what
    // follows cannot be judged from what was read here.
    // Axis A, lot L0: noted apart. It takes no part in the extents, in the unknown axes or in any
    // verdict below; the key exists only for a program that has such a word.
    const rotary = rotaryLetters(code);
    if (rotary) {
      a.rotary = a.rotary || { letters: '', line: lineNo, count: 0 };
      a.rotary.letters = ['A', 'B', 'C'].filter((letter) => (a.rotary.letters + rotary).includes(letter)).join('');
      a.rotary.count += 1;
    }
    if (/^\$/.test(code) || !sameWithoutSpaces(code)) {
      a.timing.supported = false;
      a.unsafeOverride = a.unsafeOverride || /^\$/.test(code);
      a.spinUp.opaque = a.spinUp.opaque || (timed && !st.entered);
      st.machineUnitsKnown = false;
      listed(lineNo, raw.trim().slice(0, 40), true);
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_SYNTAX', { line: lineNo }, 'Ligne ' + lineNo + ' lue autrement par la carte (espace dans un nombre, ou commande $) : non interprétée.')));
      continue;
    }
    const w = words(code);
    const g = w.filter(([l]) => l === 'G').map(([, v]) => v);
    const m = w.filter(([l]) => l === 'M').map(([, v]) => v);
    const at = (letter) => {
      const found = w.find(([l]) => l === letter);
      return found ? found[1] : null;
    };
    if (timed) {
      // Only fully understood lines contribute a duration. Pauses, probing, frame changes,
      // machine-coordinate moves and opaque syntax deliberately yield no numeric progress.
      const rest = code.replace(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g, '').trim();
      if (rest || w.some(([l]) => !'NGMXYZIJKRPFST'.includes(l)) ||
          g.some((v) => ![0, 1, 2, 3, 4, 17, 20, 21, 40, 49, 54, 61, 80, 90, 91, 91.1, 93, 94].includes(v)) ||
          m.some((v) => ![2, 3, 4, 5, 7, 8, 9, 30].includes(v))) {
        a.timing.supported = false;
      }
      if (g.includes(93)) {
        timingMode = 'G93';
      }
      if (g.includes(94)) {
        timingMode = 'G94';
      }
      // N1: Grbl starts the spindle before the dwell and the motion of the same line. A stop
      // before the first entry cancels the start: the next one counts. The spindle only turns
      // at its setpoint from the last M3/M4 or the last change of S, whichever comes last:
      // the time is counted from there. S0: not started (no start line); no S in the file
      // yet: the setpoint is the machine's, no time is counted (start line kept, no mark).
      if (!st.entered) {
        const setpoint = at('S');
        const changed = setpoint !== null && setpoint !== st.speed;
        const started = m.includes(3) || m.includes(4);
        if (setpoint !== null) {
          st.speed = setpoint;
        }
        if (m.includes(5)) {
          st.spinning = false;
          st.spinMark = null;
          a.spinUp.startLine = null;
        }
        if (started) {
          st.spinning = true;
        }
        if (st.spinning && (started || changed)) {
          st.spinMark = st.speed > 0 ? spin.mark() : null;
          a.spinUp.startLine = st.speed === 0 ? null : lineNo;
          a.spinUp.dwell = 0;
          a.spinUp.feedInherited = false;
        }
      }
      if (g.includes(4)) {
        const seconds = at('P');
        if (seconds === null || seconds < 0 || ['X', 'Y', 'Z'].some((axis) => at(axis) !== null)) {
          a.timing.supported = false;
        } else {
          time.dwell(seconds, lineNo);
          if (!st.entered) {
            spin.dwell(seconds, lineNo);
            if (st.spinMark) {
              a.spinUp.dwell += seconds;
            }
          }
        }
      }
      if (m.includes(2) || m.includes(30)) {
        timingEnded = true;
      }
    }
    g.forEach((v) => {
      if (!KNOWN_G.includes(v)) {
        listed(lineNo, 'G' + v, true);
        AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_UNINTERPRETED', { code: 'G' + v, line: lineNo }, 'Code G' + v + ' (ligne ' + lineNo + ') non interprété.')));
      }
    });
    m.forEach((v) => {
      if (!KNOWN_M.includes(v)) {
        listed(lineNo, 'M' + v, false);
      }
      if (v === 3 && a.spindle.m3Line === null) {
        a.spindle.m3Line = lineNo;
      } else if (v === 4 && a.spindle.m4Line === null) {
        a.spindle.m4Line = lineNo;
      }
    });
    const toolWord = at('T');
    if (toolWord !== null && Number.isInteger(toolWord) && toolWord >= 0) {
      tool(toolWord, '', lineNo, null);
    }
    if (m.includes(6)) {
      a.tools.changes += 1;
      if (a.tools.changeLine === null) {
        a.tools.changeLine = lineNo;
      }
    }
    const speed = at('S');
    if (speed !== null && (a.spindle.sMax === null || speed > a.spindle.sMax)) {
      a.spindle.sMax = speed;
      a.spindle.sMaxLine = lineNo;
    }

    // Modal words first (G90 G1 X10 on one line is absolute).
    g.forEach((v) => {
      if (v === 20 || v === 21) {
        st.machineUnitsKnown = true;
        const next = v === 20 ? MM_PER_INCH : 1;
        if (!st.unitsKnown) {
          if (st.moved) {
            a.unitsChanges.push(lineNo);
            AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_UNITS_LATE', { code: 'G' + v, line: lineNo }, 'Unités fixées (G' + v + ') à la ligne ' + lineNo + ' après des déplacements faits dans les unités de la machine.')));
          } else {
            a.units = 'G' + v;
          }
          st.unitsKnown = true;
          st.scale = next;
        } else if (st.scale !== next) {
          a.unitsChanges.push(lineNo);
          st.scale = next;
        }
      } else if (v === 90 || v === 91) {
        const next = 'G' + v;
        if (!st.distanceSet && !st.moved) {
          a.distance = next;
        } else if (next !== st.distance) {
          a.distanceChanges.push(lineNo);
        }
        st.distance = next;
        st.distanceSet = true;
      } else if (v === 90.1 || v === 91.1) {
        st.arcMode = 'G' + v;
      } else if (v === 17 || v === 18 || v === 19) {
        st.plane = 'G' + v;
      } else if (v >= 54 && v <= 59) {
        const next = 'G' + v;
        if (a.wcs === null) {
          a.wcs = next;
          if (st.moved) {
            a.wcsChanges.push(lineNo);
          }
        } else if (a.wcs !== next) {
          a.wcsChanges.push(lineNo);
        }
      } else if (v === 49) {
        // Cancels the tool length offset (C-58): judged against the inherited one (checkProgram).
        if (a.tloCancel === null) {
          a.tloCancel = lineNo;
        }
      } else if (v === 92 || v === 92.1 || v === 10) {
        a.offsetChanges.push({ line: lineNo, code: 'G' + v });
      } else if ([0, 1, 2, 3].includes(v)) {
        st.motion = 'G' + v;
      } else if (v === 80) {
        st.motion = null;
      }
    });
    if (a.wcsChanges.length) {
      a.timing.supported = false;
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_WCS_CHANGE', { line: a.wcsChanges[0] }, 'Le programme change de repère (ligne ' + a.wcsChanges[0] + ') : une seule origine de travail peut être vérifiée.')));
    }
    if (a.offsetChanges.length) {
      const first = a.offsetChanges[0];
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_ORIGIN_CHANGE', { code: first.code, line: first.line }, 'Le programme modifie l’origine (' + first.code + ' ligne ' + first.line + ') : position de travail non prévisible.')));
    }
    if (at('F') !== null) {
      timingFeed = at('F') * (timingMode === 'G93' ? 1 : st.scale);
    }

    const axes = AXES.filter((axis) => at(axis) !== null);
    const probe = g.some((v) => v >= 38.2 && v <= 38.5);
    const machineMove = g.includes(53) || g.includes(28) || g.includes(30) || g.includes(28.1) || g.includes(30.1);
    if (g.includes(43.1)) {
      listed(lineNo, 'G43.1', true);
      unknown('Z', reason('ETOUCH_CHECK_DYNAMIC_TLO', { line: lineNo }, 'Décalage d’outil dynamique (G43.1 ligne ' + lineNo + ') : position Z non prévisible.'));
      continue;
    }
    if (probe) {
      listed(lineNo, 'G' + g.find((v) => v >= 38.2 && v <= 38.5), true);
      axes.forEach((axis) => {
        pos[axis] = null;
        unknown(axis, reason('ETOUCH_CHECK_PROBE', { line: lineNo, axis }, 'Palpage (G38 ligne ' + lineNo + ') : la position ' + axis + ' dépend du contact.'));
      });
      continue;
    }
    if (machineMove) {
      const machineCode = 'G' + g.find((v) => [53, 28, 30, 28.1, 30.1].includes(v));
      a.machineMoves.push({ line: lineNo, code: machineCode });
      if (g.includes(53)) {
        // Explicit machine coordinates (absolute even under G91): compared
        // with the travel directly, without any work offset.
        if (st.machineUnitsKnown && axes.length && !st.moved) {
          st.moved = true;
          if (!st.unitsKnown) {
            a.rawUnits = true;
          }
        }
        axes.forEach((axis) => {
          if (st.machineUnitsKnown) {
            extend(a.machineExtent, axis, at(axis) * st.scale);
          }
          pos[axis] = null;
        });
        continue;
      }
      // G28/G30 first go through the intermediate point given by the axis
      // words (work coordinates), then to the stored position. A relative
      // zero (G28 G91 Z0) is no intermediate motion; any other point is not
      // followed. The stored position itself is not compared (see report).
      if ((g.includes(28) || g.includes(30)) && !(st.distance === 'G91' && axes.every((axis) => at(axis) === 0))) {
        axes.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_RETURN_INTERMEDIATE', { code: machineCode, axis, line: lineNo }, 'Retour ' + machineCode + ' par un point intermédiaire ' + axis + ' (ligne ' + lineNo + ') : non suivi.')));
      }
      AXES.forEach((axis) => {
        pos[axis] = null;
      });
      continue;
    }
    if (!axes.length) {
      if ((st.motion === 'G2' || st.motion === 'G3') && ['I', 'J', 'K', 'R'].some((axis) => at(axis) !== null)) {
        a.timing.supported = false;
      }
      continue;
    }
    if (!(st.motion || g.some((v) => [0, 1, 2, 3].includes(v)))) {
      // Axis words with no motion mode yet: Grbl moves in its own modal
      // motion (G0 after a reset), which the program does not state.
      if (!g.some((v) => [10, 92, 92.1].includes(v))) {
        axes.forEach((axis) => {
          pos[axis] = null;
          unknown(axis, reason('ETOUCH_CHECK_NO_MOTION_MODE', { axis, line: lineNo }, 'Mot d’axe ' + axis + ' sans mode de déplacement (ligne ' + lineNo + ') : exécuté dans le mode modal de la carte, non suivi.'));
        });
      }
      continue;
    }

    // A move.
    if (!st.moved) {
      st.moved = true;
      if (!st.unitsKnown) {
        a.rawUnits = true;
      }
      if (st.distance === 'G91') {
        a.relativeStart = true;
      }
    }
    a.moves += 1;
    const start = { ...pos };
    axes.forEach((axis) => {
      const v = at(axis) * st.scale;
      if (st.distance === 'G91') {
        if (pos[axis] === null) {
          unknown(axis, reason('ETOUCH_CHECK_RELATIVE_FROM_UNKNOWN', { line: lineNo, axis }, 'Déplacement relatif (G91 ligne ' + lineNo + ') depuis une position ' + axis + ' inconnue.'));
        } else {
          pos[axis] += v;
        }
      } else {
        pos[axis] = v;
      }
    });
    const arc = st.motion === 'G2' || st.motion === 'G3';
    let arcLength = null;
    if (arc) {
      if (st.plane !== 'G17' || st.arcMode !== 'G91.1') {
        listed(lineNo, st.motion + ' ' + (st.plane !== 'G17' ? st.plane : st.arcMode), true);
        AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_ARC_PLANE', { line: lineNo }, 'Arc hors plan XY ou en centre absolu (ligne ' + lineNo + ') : non interprété.')));
      } else if (start.X === null || start.Y === null || pos.X === null || pos.Y === null) {
        ['X', 'Y'].forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_ARC_FROM_UNKNOWN', { line: lineNo }, 'Arc (ligne ' + lineNo + ') depuis une position XY inconnue.')));
      } else {
        const r = at('R');
        let cx;
        let cy;
        let radius;
        if (r !== null) {
          const dx = pos.X - start.X;
          const dy = pos.Y - start.Y;
          const d2 = dx * dx + dy * dy;
          radius = Math.abs(r) * st.scale;
          const h2 = 4 * radius * radius - d2;
          if (h2 < -TOLERANCE_MM || d2 === 0) {
            listed(lineNo, st.motion + ' R', true);
            ['X', 'Y'].forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_ARC_RADIUS', { line: lineNo }, 'Arc impossible (rayon trop court, ligne ' + lineNo + ').')));
          } else {
            let h = -Math.sqrt(Math.max(0, h2)) / Math.sqrt(d2);
            if (st.motion === 'G3') {
              h = -h;
            }
            if (r < 0) {
              h = -h;
            }
            cx = start.X + 0.5 * (dx - dy * h);
            cy = start.Y + 0.5 * (dy + dx * h);
          }
        } else {
          const ci = (at('I') || 0) * st.scale;
          const cj = (at('J') || 0) * st.scale;
          cx = start.X + ci;
          cy = start.Y + cj;
          radius = Math.hypot(ci, cj);
        }
        if (cx !== undefined) {
          // Exact envelope: the end points (extended below) plus every
          // cardinal point of the circle the arc sweeps through; same start
          // and end is a full circle.
          const a0 = Math.atan2(start.Y - cy, start.X - cx);
          const a1 = Math.atan2(pos.Y - cy, pos.X - cx);
          const turn = (x) => ((x % TWO_PI) + TWO_PI) % TWO_PI;
          const cw = st.motion === 'G2';
          const closed = Math.abs(pos.X - start.X) < TOLERANCE_MM && Math.abs(pos.Y - start.Y) < TOLERANCE_MM;
          const sweep = closed ? TWO_PI : turn(cw ? a0 - a1 : a1 - a0);
          arcLength = radius * sweep;
          [0, 0.5, 1, 1.5].forEach((k) => {
            const angle = k * Math.PI;
            if (turn(cw ? a0 - angle : angle - a0) <= sweep + 1e-9) {
              extend(a.extent, 'X', cx + radius * Math.round(Math.cos(angle)));
              extend(a.extent, 'Y', cy + radius * Math.round(Math.sin(angle)));
            }
          });
        }
      }
    }
    if (timed && !st.entered) {
      // N1: the first entry into the material is the first move that ends below the work zero,
      // or the first feed move that goes down (or whose height is not known): the earliest of
      // the two readings of the work zero (top of the stock, spoilboard). Counted up to the
      // start of that move, before the tool reaches the material: never too long.
      const feedMove = st.motion !== 'G0';
      const down = pos.Z === null || (start.Z === null ? at('Z') !== null : pos.Z < start.Z);
      if ((pos.Z !== null && pos.Z < 0) || (feedMove && down)) {
        st.entered = true;
        a.spinUp.entryLine = lineNo;
        if (st.spinMark) {
          const now = spin.mark();
          a.spinUp.seconds = now.seconds - st.spinMark.seconds;
          a.spinUp.atLeast = now.pending > st.spinMark.pending;
          // Every line understood (the duration model's own flag) and every move timed.
          a.spinUp.supported = now.supported && time.mark().supported;
        }
      } else if (st.spinMark && feedMove && timingMode === null) {
        a.spinUp.feedInherited = true;
      }
    }
    if (timed && a.timing.supported) {
      if (arc && arcLength === null) {
        a.timing.supported = false;
      } else {
        const move = { start, end: { ...pos }, rapid: st.motion === 'G0', feed: timingFeed, mode: timingMode, arcLength };
        time.move(move, lineNo);
        // The entry move itself is not counted (st.entered is already set for it).
        if (!st.entered) {
          spin.move(move, lineNo);
        }
      }
    }
    AXES.forEach((axis) => {
      extend(a.extent, axis, start[axis]);
      extend(a.extent, axis, pos[axis]);
    });
  }
  AXES.forEach((axis) => {
    if (a.unknownAxes[axis]) {
      a.extent[axis] = null;
    }
  });
  if (a.extent.Z) {
    a.zMin = a.extent.Z.min;
    a.zMax = a.extent.Z.max;
  }
  time.finish(a.lines);
  // Retain only a reference to the exact source (the sender already keeps it).
  // Rebuild solely when the rates/overrides at a new start differ from the load profile.
  time.timing.rebuild = rebuildTiming(gcode);
  return a;
};

const number = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// Laser additions (machine declared laser): the highest S setpoint against $30
// (Grbl clamps it there), and M3 (constant) vs M4 (dynamic) reported. Wording:
// "consigne S", never a power.
const laserCheck = (analysis, laser) => {
  const sp = analysis.spindle || { sMax: null, sMaxLine: null, m3Line: null, m4Line: null };
  const max = number(laser && laser.sMax);
  const reasons = [];
  if (sp.m3Line !== null) {
    reasons.push(reason('ETOUCH_LASER_CHECK_M3', { line: sp.m3Line }, 'Laser en M3 (consigne S constante) à partir de la ligne ' + sp.m3Line + '.'));
  }
  if (sp.m4Line !== null) {
    reasons.push(reason('ETOUCH_LASER_CHECK_M4', { line: sp.m4Line }, 'Laser en M4 (consigne S dynamique, ajustée à la vitesse) à partir de la ligne ' + sp.m4Line + '.'));
  }
  if (sp.m3Line === null && sp.m4Line === null) {
    reasons.push(reason('ETOUCH_LASER_CHECK_NO_M3_M4', {}, 'Aucun M3 ni M4 dans le programme : le laser n’est pas commandé par ce programme.'));
  }
  const aboveMax = sp.sMax !== null && max !== null && sp.sMax > max;
  if (sp.sMax !== null && max === null) {
    reasons.push(reason('ETOUCH_LASER_CHECK_MAX_UNKNOWN', {}, 'Réglage $30 inconnu : consignes S non comparées au maximum de la carte.'));
  } else if (aboveMax) {
    const text = 'Consigne S' + fmt(sp.sMax) + ' (ligne ' + sp.sMaxLine + ') au-dessus de $30=' + fmt(max) + ' : la carte la ramènera à $30.';
    reasons.push(reason('ETOUCH_LASER_CHECK_S_ABOVE_MAX', { s: fmt(sp.sMax), line: sp.sMaxLine, max: fmt(max) }, text));
  }
  let mode = null;
  if (sp.m3Line !== null && sp.m4Line !== null) {
    mode = 'M3+M4';
  } else if (sp.m3Line !== null || sp.m4Line !== null) {
    mode = sp.m3Line !== null ? 'M3' : 'M4';
  }
  return {
    mode,
    m3Line: sp.m3Line,
    m4Line: sp.m4Line,
    sMax: sp.sMax,
    sMaxLine: sp.sMaxLine,
    settingMax: max,
    aboveMax,
    reasons: reasons.map((r) => r.message),
    codedReasons: reasons
  };
};

// N1, display only: the time the spindle has between its start and the first entry into the
// material. `computed` carries the model's seconds (a lower bound when `atLeast`: the approach
// from the start position is not counted), at rapids 100 % and feed at least 100 % whatever the
// overrides at load; `unknown` whenever the duration model could not follow the program up to
// there or the file starts the spindle without any S setpoint, never a guessed figure; and
// `noStart` only when every line up to the entry was read (a line that was not may hold the
// start). No verdict, no guard reads it.
const spinUpOf = (analysis, modal) => {
  const s = analysis.spinUp;
  if (!s) {
    return null;
  }
  const lines = { startLine: s.startLine, entryLine: s.entryLine };
  if (s.entryLine === null) {
    return { state: 'noEntry', ...lines };
  }
  if (s.startLine === null) {
    return { state: s.opaque ? 'unknown' : 'noStart', ...lines };
  }
  const followed = s.supported && Number.isFinite(s.seconds) && !analysis.relativeStart &&
    !(analysis.rawUnits && !(modal && modal.units === 'G21')) &&
    !(analysis.distance === null && !(modal && modal.distance === 'G90')) &&
    !(s.feedInherited && !(modal && modal.feedMode === 'G94'));
  if (!followed) {
    return { state: 'unknown', ...lines };
  }
  return { state: 'computed', seconds: Math.round(s.seconds * 1000) / 1000, dwell: Math.round(s.dwell * 1000) / 1000, atLeast: s.atLeast, ...lines };
};

// How far past the usable bound, in mm, rounded up to the tenth: raising the stock (or moving the
// origin) by that much is enough.
const overOf = (distance) => Math.ceil(distance * 10 - ROUNDING_MM) / 10;

// D1: the overruns of an axis judged outside, one per side, in the operator's terms. `limit` is
// the usable bound; Z says too low or too high, X and Y the side (+ or −) past the travel.
const overruns = (axis, entry) => {
  const out = [];
  const { usable, machineMin: min, machineMax: max } = entry;
  if (min < usable.low - ROUNDING_MM) {
    const over = fmt(overOf(usable.low - min));
    const limit = fmt(usable.low);
    const beyond = 'Le programme dépasse la course de ' + over + ' mm en ' + axis + '− (' + axis + ' machine ' + fmt(min) + ', limite ' + limit + ').';
    out.push(axis === 'Z'
      ? reason('ETOUCH_TRAVEL_TOO_LOW', { over, min: fmt(min), limit }, 'Le programme descend ' + over + ' mm trop bas (Z machine ' + fmt(min) + ', limite ' + limit + ').')
      : reason('ETOUCH_TRAVEL_BEYOND', { axis, sign: '−', over, value: fmt(min), limit }, beyond));
  }
  if (max > usable.high + ROUNDING_MM) {
    const over = fmt(overOf(max - usable.high));
    const limit = fmt(usable.high);
    const beyond = 'Le programme dépasse la course de ' + over + ' mm en ' + axis + '+ (' + axis + ' machine ' + fmt(max) + ', limite ' + limit + ').';
    out.push(axis === 'Z'
      ? reason('ETOUCH_TRAVEL_TOO_HIGH', { over, max: fmt(max), limit }, 'Le programme monte ' + over + ' mm trop haut (Z machine ' + fmt(max) + ', limite ' + limit + ').')
      : reason('ETOUCH_TRAVEL_BEYOND', { axis, sign: '+', over, value: fmt(max), limit }, beyond));
  }
  return out;
};

// Compares an analysis with the machine:
//   machine = { settings: {$20,$22,$23,$130,$131,$132}, mpos: {x,y,z}, wpos: {x,y,z},
//               modal: {units, distance, wcs} (fresh $G only, else null),
//               parameters: {G54: {x,y,z}, …, G92: {…}, TLO: n} ($# if known, else null),
//               homed: true when a homing cycle was seen complete since the last board restart,
//               homeAt: where our last full homing cycle left the machine, with its $23
//                 ({ X, Y, Z, mask }, job-service.js homeMpos) or null: an axis homed towards its
//                 negative end found at 0 has the travel [0, $13x] (motion.js envelopeOf),
//               reportUnits: 'mm' | 'in' | null,
//               offsetProven: false while the work offset the board applies is not proven equal to
//                 `$#` (D2, work-offset.js): no work extent is compared then (G53 targets still are);
//                 absent, the reported offset is taken as it is,
//               laser: { sMax } only for a machine declared laser (adds `laser` to the result) }
export const checkProgram = (analysis, machine = {}) => {
  const s = machine.settings || {};
  const modal = machine.modal || null;
  const global = [];
  const info = [];
  // As elsewhere in the service, a machine without a laser declaration uses
  // CNC semantics. This is information only: it changes no travel verdict.
  const spindle = analysis.spindle || {};
  const sMax = number(s.$30);
  if (!machine.laser && sMax !== null && sMax > 0 && spindle.sMax > sMax) {
    info.push(reason('ETOUCH_CHECK_S_ABOVE_MAX', { s: fmt(spindle.sMax), line: spindle.sMaxLine, max: fmt(sMax) }, 'Consigne S' + fmt(spindle.sMax) + ' (ligne ' + spindle.sMaxLine + ') au-dessus du maximum de la carte (' + fmt(sMax) + ') : la broche tournera au maximum.'));
  }
  const axesOut = {};
  const homingSetting = number(s.$22);
  if (homingSetting === null) {
    global.push(reason('ETOUCH_CHECK_HOMING_SETTING', {}, 'Réglage $22 inconnu : relisez les réglages de la carte.'));
  } else if (homingSetting !== 1) {
    global.push(reason('ETOUCH_CHECK_HOMING_DISABLED', {}, 'Prise d’origine désactivée ($22=0) : les coordonnées machine ne sont pas repérées.'));
  } else if (machine.homed !== true) {
    global.push(reason('ETOUCH_CHECK_NOT_HOMED', {}, 'Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué) : course non vérifiable.'));
  }
  if (machine.reportUnits === 'in') {
    global.push(reason('ETOUCH_CHECK_REPORT_INCHES', {}, 'Positions rapportées en pouces ($13=1) : comparaison non faite.'));
  } else if (machine.reportUnits !== 'mm') {
    global.push(reason('ETOUCH_CHECK_REPORT_UNITS', {}, 'Unités des rapports ($13) inconnues.'));
  }
  // Units and distance mode the program leaves to the machine.
  let scale = 1;
  if (analysis.rawUnits) {
    if (!modal || !modal.units) {
      global.push(reason('ETOUCH_CHECK_UNITS_UNKNOWN', {}, 'Le programme ne fixe pas ses unités (G20/G21) et l’état modal de la machine est inconnu.'));
    } else {
      scale = modal.units === 'G20' ? MM_PER_INCH : 1;
      info.push('Unités laissées à la machine : ' + modal.units + ' appliqué.');
    }
  }
  if (analysis.distance === null && analysis.moves > 0) {
    if (!modal || modal.distance !== 'G90') {
      global.push(reason('ETOUCH_CHECK_DISTANCE_UNKNOWN', {}, 'Le programme ne fixe pas son mode (G90/G91) et la machine n’est pas en G90 connu.'));
    }
  }
  if (analysis.relativeStart) {
    global.push(reason('ETOUCH_CHECK_RELATIVE_START', {}, 'Le programme commence en déplacements relatifs (G91) : parcours lié à la position de l’outil, non vérifiable.'));
  }
  // Work offset: mpos = wpos + offset for the offset active now; another
  // offset selected by the program needs the $# parameters.
  const offset = { X: null, Y: null, Z: null };
  const mpos = machine.mpos || {};
  const wpos = machine.wpos || {};
  const activeWcs = modal && /^G5[4-9]$/.test(modal.wcs || '') ? modal.wcs : null;
  const programWcs = analysis.wcs;
  if (programWcs && activeWcs && programWcs !== activeWcs) {
    const p = machine.parameters && machine.parameters[programWcs];
    if (p && AXES.every((axis) => number(p[axis.toLowerCase()]) !== null)) {
      const g92 = (machine.parameters && machine.parameters.G92) || {};
      const tlo = number(machine.parameters && machine.parameters.TLO) || 0;
      AXES.forEach((axis) => {
        offset[axis] = number(p[axis.toLowerCase()]) + (number(g92[axis.toLowerCase()]) || 0) + (axis === 'Z' ? tlo : 0);
      });
      info.push('Repère ' + programWcs + ' du programme lu dans les paramètres ($#) ; repère actif ' + activeWcs + '.');
    } else {
      global.push(reason('ETOUCH_CHECK_WCS_OFFSET_UNKNOWN', { wcs: programWcs, active: activeWcs }, 'Le programme utilise ' + programWcs + ' alors que le repère actif est ' + activeWcs + ' et que ses décalages ($#) sont inconnus.'));
    }
  } else {
    if (programWcs && !activeWcs) {
      global.push(reason('ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN', { wcs: programWcs }, 'Repère actif inconnu (état $G trop ancien) : le programme utilise ' + programWcs + '.'));
    }
    AXES.forEach((axis) => {
      const m = number(mpos[axis.toLowerCase()]);
      const w = number(wpos[axis.toLowerCase()]);
      if (m !== null && w !== null) {
        offset[axis] = m - w;
      }
    });
  }
  const mask = number(s.$23) || 0;
  // The convention of each axis (motion.js envelopeOf): one candidate envelope, or two for an
  // axis homed towards its negative end until our own homing found it at 0. Only the convention
  // is taken from it: the reference and the positions are judged above.
  const conventions = envelopeOf({ ...s, $22: 1, $23: mask }, true, { wcoSeen: true, homeAt: machine.homeAt || null });
  const softLimits = number(s.$20);
  if (softLimits === 1) {
    info.push('Limites logicielles Grbl actives ($20=1) : la carte refuserait elle-même un dépassement (alarme 2).');
  } else if (softLimits === 0) {
    info.push('Limites logicielles Grbl inactives ($20=0) : aucune protection de la carte.');
  }
  // D1: every proven overrun, in the operator's terms (job-service.js refuses the start on them).
  const blocking = [];
  // C-58: an inherited tool length offset, known from `$#` (D2 reads it), cancelled by the program.
  const inheritedTlo = number(machine.parameters && machine.parameters.TLO);
  const tloCancelled = Number.isInteger(analysis.tloCancel) && inheritedTlo !== null && inheritedTlo !== 0;

  AXES.forEach((axis, i) => {
    const reasons = global.slice();
    const travel = number(s['$' + (130 + i)]);
    const extent = analysis.extent[axis];
    const machineExtent = (analysis.machineExtent && analysis.machineExtent[axis]) || null;
    if (!extent && !machineExtent && !analysis.unknownAxes[axis]) {
      // The program never moves this axis: it stays where the operator left it.
      const idle = reason('ETOUCH_CHECK_AXIS_IDLE', { axis }, 'Axe ' + axis + ' non sollicité par le programme.');
      axesOut[axis] = { axis, verdict: 'validated', min: null, max: null, low: null, high: null, usable: null, reasons: [idle.message], codedReasons: [idle] };
      return;
    }
    if (analysis.unknownAxes[axis]) {
      // An analysis made before reasons were coded keeps its text, uncoded.
      const coded = analysis.unknownCodes && analysis.unknownCodes[axis];
      reasons.push(coded && coded.message === analysis.unknownAxes[axis] ? coded : reason(null, {}, analysis.unknownAxes[axis]));
    }
    if (travel === null || travel <= 0) {
      reasons.push(reason('ETOUCH_CHECK_TRAVEL_UNKNOWN', { setting: 130 + i }, 'Course $' + (130 + i) + ' inconnue.'));
    }
    // G53 targets need no work offset; everything else does.
    if (offset[axis] === null && (extent || analysis.unknownAxes[axis])) {
      reasons.push(reason('ETOUCH_CHECK_POSITION_UNKNOWN', { axis }, 'Position machine ou de travail ' + axis + ' inconnue.'));
    }
    // D2: a work extent means nothing in machine coordinates until the offset is proven.
    const unproven = machine.offsetProven === false && !!extent;
    if (unproven) {
      reasons.push(reason('ETOUCH_CHECK_OFFSET_UNPROVEN', {}, 'Origine de la pièce pas encore vérifiée auprès de la carte : course non vérifiable.'));
    }
    // C-58: the reported WCO includes the inherited tool length offset; G49 in the program drops it
    // from some line on: the work Z extent is not followed (G53 targets still are).
    const tloDropped = axis === 'Z' && !!extent && tloCancelled;
    if (tloDropped) {
      reasons.push(reason('ETOUCH_CHECK_TLO_CANCEL', { line: analysis.tloCancel }, 'Le programme annule le décalage d’outil (G49 ligne ' + analysis.tloCancel + ') alors qu’un décalage d’outil est actif : position Z non prévisible.'));
    }
    const entry = { axis, verdict: 'unknown', min: null, max: null, low: null, high: null, usable: null, reasons: [], codedReasons: [] };
    if (extent) {
      entry.min = extent.min * scale;
      entry.max = extent.max * scale;
    }
    // Stock Grbl 1.1 keeps machine positions in [-travel, 0] whatever $23 says
    // (limits.c); a build with HOMING_FORCE_SET_ORIGIN, or Grbl_ESP32, gives
    // [0, travel] to an axis homed towards its negative end ($23 bit set). The
    // report does not tell them apart: such an axis is not checked, never
    // "inside" or "outside" from a guessed envelope, until our own homing cycle
    // found it at 0 under the same $23 (homeAt, C-04): then [0, travel] only.
    // The bound away from the homing end keeps SOFT_LIMIT_MARGIN_MM (`usable`, C-06).
    if (travel !== null && travel > 0) {
      const candidates = conventions[axis].candidates;
      if (!candidates || candidates.length !== 1) {
        const setting = '$' + (130 + i);
        const text = 'Sens de prise d’origine inversé ($23) en ' + axis + ' : selon la compilation du firmware, la course va de −' + setting + ' à 0 ou de 0 à ' + setting + ' ; axe non vérifié.';
        reasons.push(reason('ETOUCH_CHECK_HOMING_DIRECTION', { axis, setting: 130 + i }, text));
      } else {
        entry.low = candidates[0].low;
        entry.high = candidates[0].high;
        entry.usable = usableOf(candidates[0]);
      }
    }
    // With a doubtful reference (global), machine coordinates mean nothing:
    // no comparison at all, no false alarm. Otherwise what was followed is
    // compared, even when another part of the program could not be: strictly
    // with the usable bounds (no tolerance outwards).
    const outside = [];
    const compare = (min, max, code, label, unit) => {
      entry.machineMin = entry.machineMin === undefined ? min : Math.min(entry.machineMin, min);
      entry.machineMax = entry.machineMax === undefined ? max : Math.max(entry.machineMax, max);
      if (min < entry.usable.low - ROUNDING_MM || max > entry.usable.high + ROUNDING_MM) {
        outside.push(reason(code, { axis, min: fmt(min), max: fmt(max), low: fmt(entry.low), high: fmt(entry.high) }, label + fmt(min) + ' → ' + fmt(max) + unit + ' (course ' + fmt(entry.low) + ' → ' + fmt(entry.high) + ').'));
      }
    };
    if (entry.low !== null && !global.length) {
      if (extent && offset[axis] !== null && !unproven && !tloDropped) {
        compare(entry.min + offset[axis], entry.max + offset[axis], 'ETOUCH_CHECK_OUTSIDE', 'Hors course ' + axis + ' : ', ' mm machine');
      }
      if (machineExtent) {
        compare(machineExtent.min * scale, machineExtent.max * scale, 'ETOUCH_CHECK_OUTSIDE_G53', 'Hors course ' + axis + ' en coordonnées machine (G53) : ', ' mm');
      }
    }
    const listed = outside.concat(reasons);
    if (outside.length) {
      entry.verdict = 'outside';
      blocking.push(...overruns(axis, entry));
    } else if (!reasons.length) {
      entry.verdict = 'validated';
    }
    entry.reasons = listed.map((r) => r.message);
    entry.codedReasons = listed;
    axesOut[axis] = entry;
  });

  const verdicts = AXES.map((axis) => axesOut[axis].verdict);
  let verdict = 'validated';
  if (verdicts.includes('outside')) {
    verdict = 'outside';
  } else if (verdicts.includes('unknown')) {
    verdict = 'unknown';
  }
  // Deduplicated by message, in the same order: codedReasons[i].message === reasons[i].
  const reasons = [];
  const codedReasons = [];
  AXES.forEach((axis) => {
    axesOut[axis].codedReasons.forEach((r) => {
      if (!reasons.includes(r.message)) {
        reasons.push(r.message);
        codedReasons.push(r);
      }
    });
  });
  // Axis A, lot L0: a warning of its own, after everything above was decided. No axis reason, no
  // extent, no `blocking` entry and no verdict depends on it.
  const rotary = analysis.rotary || null;
  if (rotary) {
    const letters = rotary.letters.split('').join(', ');
    const message = 'Ce programme fait tourner un axe rotatif (' + letters + ', première ligne ' + rotary.line + ') : CNC Touch ne le contrôle pas encore. Seuls X, Y et Z sont vérifiés.';
    info.push(reason('ETOUCH_ROTARY_UNCHECKED', { axis: letters, line: rotary.line, count: rotary.count }, message));
  }
  const out = {
    verdict,
    axes: axesOut,
    reasons,
    codedReasons,
    info,
    zMin: analysis.zMin === null ? null : analysis.zMin * scale,
    zMax: analysis.zMax === null ? null : analysis.zMax * scale,
    units: analysis.units,
    unitsChanges: analysis.unitsChanges,
    distance: analysis.distance,
    distanceChanges: analysis.distanceChanges,
    wcs: analysis.wcs,
    wcsChanges: analysis.wcsChanges,
    offsetChanges: analysis.offsetChanges,
    machineMoves: analysis.machineMoves,
    uninterpreted: analysis.uninterpreted,
    moves: analysis.moves,
    lines: analysis.lines,
    scope: 'Course machine X/Y/Z et profondeur Z du programme, dans le repère de travail : ni brides, ni outil, ni matière.',
    // D1: the proven overruns ({ code, params, message }), empty when there is none; whether the
    // start may still be confirmed deliberately (the board's soft limits on, $20=1).
    blocking,
    overridable: softLimits === 1 && !analysis.unsafeOverride,
    // N1: display-only data (tools named by the file, spindle spin-up time). They take no part
    // in the verdict above, in `blocking` or in any guard; a laser has no spin-up.
    tools: analysis.tools || { list: [], truncated: false, changes: 0, changeLine: null },
    spinUp: machine.laser ? null : spinUpOf(analysis, modal)
  };
  if (machine.laser) {
    out.laser = laserCheck(analysis, machine.laser);
  }
  if (rotary) {
    out.rotary = { letters: rotary.letters, line: rotary.line, count: rotary.count };
  }
  return out;
};

export const programCheck = (gcode, machine) => checkProgram(analyzeProgram(gcode), machine);

export default { analyzeProgram, checkProgram, programCheck };
