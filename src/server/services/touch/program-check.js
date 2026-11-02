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

const MM_PER_INCH = 25.4;
const TOLERANCE_MM = 0.001;
const AXES = ['X', 'Y', 'Z'];
const TWO_PI = 2 * Math.PI;

// Words Grbl 1.1 accepts; everything else is listed as not interpreted.
const KNOWN_G = [0, 1, 2, 3, 4, 10, 17, 18, 19, 20, 21, 28, 28.1, 30, 30.1, 38.2, 38.3, 38.4, 38.5, 40, 43.1, 49, 53,
  54, 55, 56, 57, 58, 59, 61, 80, 90, 90.1, 91, 91.1, 92, 92.1, 93, 94];
const KNOWN_M = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30];

export const programLines = (gcode) => String(gcode).split('\n').filter((line) => line.trim().length > 0);

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

const fmt = (n) => String(Math.round(n * 1000) / 1000);

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

// Walks the program. `extent` is in millimetres in the work coordinates of the
// (single) work offset the program uses; `unknownAxes[axis]` tells why an axis
// could not be followed. `rawUnits` is true when the program never fixes its
// units before moving: the extent is then in the controller's units, which the
// comparison converts when the machine's modal state is known.
export const analyzeProgram = (gcode) => {
  const lines = programLines(gcode);
  const a = {
    lines: lines.length,
    moves: 0,
    units: null,
    unitsChanges: [],
    rawUnits: false,
    distance: null,
    distanceChanges: [],
    relativeStart: false,
    wcs: null,
    wcsChanges: [],
    offsetChanges: [],
    machineMoves: [],
    uninterpreted: [],
    extent: { X: null, Y: null, Z: null },
    // G53 targets, in machine coordinates (program units when rawUnits).
    machineExtent: { X: null, Y: null, Z: null },
    unknownAxes: { X: null, Y: null, Z: null },
    // The same first reason per axis, coded ({ code, params, message }).
    unknownCodes: { X: null, Y: null, Z: null },
    zMin: null,
    zMax: null
  };
  const pos = { X: null, Y: null, Z: null };
  // Modal state while walking (one object, so the per-line closures below
  // never capture a loop-modified binding).
  const st = {
    scale: 1, // mm per program unit
    unitsKnown: false, // the program chose G20/G21 before moving
    distance: 'G90',
    distanceSet: false,
    motion: null,
    plane: 'G17',
    arcMode: 'G91.1',
    moved: false
  };
  const unknown = (axis, r) => {
    if (!a.unknownAxes[axis]) {
      a.unknownAxes[axis] = r.message;
      a.unknownCodes[axis] = r;
    }
  };
  const listed = (lineNo, code, impact) => {
    if (a.uninterpreted.length < 50) {
      a.uninterpreted.push({ line: lineNo, code, impact });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const code = clean(raw);
    if (!code || code === '%') {
      continue;
    }
    // CNCjs directives and expressions execute on the server, G-code words
    // depend on variables: nothing can be followed after them.
    if (/^%/.test(code) || /[[\]#]/.test(code)) {
      listed(lineNo, raw.trim().slice(0, 40), true);
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_MACRO', { line: lineNo }, 'Macro ou expression CNCjs à la ligne ' + lineNo + ' : contenu non prévisible.')));
      continue;
    }
    const w = words(code);
    const g = w.filter(([l]) => l === 'G').map(([, v]) => v);
    const m = w.filter(([l]) => l === 'M').map(([, v]) => v);
    const at = (letter) => {
      const found = w.find(([l]) => l === letter);
      return found ? found[1] : null;
    };
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
    });

    // Modal words first (G90 G1 X10 on one line is absolute).
    g.forEach((v) => {
      if (v === 20 || v === 21) {
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
      } else if (v === 92 || v === 92.1 || v === 10) {
        a.offsetChanges.push({ line: lineNo, code: 'G' + v });
      } else if ([0, 1, 2, 3].includes(v)) {
        st.motion = 'G' + v;
      } else if (v === 80) {
        st.motion = null;
      }
    });
    if (a.wcsChanges.length) {
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_WCS_CHANGE', { line: a.wcsChanges[0] }, 'Le programme change de repère (ligne ' + a.wcsChanges[0] + ') : une seule origine de travail peut être vérifiée.')));
    }
    if (a.offsetChanges.length) {
      const first = a.offsetChanges[0];
      AXES.forEach((axis) => unknown(axis, reason('ETOUCH_CHECK_ORIGIN_CHANGE', { code: first.code, line: first.line }, 'Le programme modifie l’origine (' + first.code + ' ligne ' + first.line + ') : position de travail non prévisible.')));
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
        if (axes.length && !st.moved) {
          st.moved = true;
          if (!st.unitsKnown) {
            a.rawUnits = true;
          }
        }
        axes.forEach((axis) => {
          extend(a.machineExtent, axis, at(axis) * st.scale);
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
  return a;
};

const number = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// Compares an analysis with the machine:
//   machine = { settings: {$20,$22,$23,$130,$131,$132}, mpos: {x,y,z}, wpos: {x,y,z},
//               modal: {units, distance, wcs} (fresh $G only, else null),
//               parameters: {G54: {x,y,z}, …, G92: {…}, TLO: n} ($# if known, else null),
//               homed: true when a homing cycle was seen complete since the last board restart,
//               reportUnits: 'mm' | 'in' | null }
export const checkProgram = (analysis, machine = {}) => {
  const s = machine.settings || {};
  const modal = machine.modal || null;
  const global = [];
  const info = [];
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
  const softLimits = number(s.$20);
  if (softLimits === 1) {
    info.push('Limites logicielles Grbl actives ($20=1) : la carte refuserait elle-même un dépassement (alarme 2).');
  } else if (softLimits === 0) {
    info.push('Limites logicielles Grbl inactives ($20=0) : aucune protection de la carte.');
  }

  AXES.forEach((axis, i) => {
    const reasons = global.slice();
    const travel = number(s['$' + (130 + i)]);
    const extent = analysis.extent[axis];
    const machineExtent = (analysis.machineExtent && analysis.machineExtent[axis]) || null;
    if (!extent && !machineExtent && !analysis.unknownAxes[axis]) {
      // The program never moves this axis: it stays where the operator left it.
      const idle = reason('ETOUCH_CHECK_AXIS_IDLE', { axis }, 'Axe ' + axis + ' non sollicité par le programme.');
      axesOut[axis] = { axis, verdict: 'validated', min: null, max: null, low: null, high: null, reasons: [idle.message], codedReasons: [idle] };
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
    const entry = { axis, verdict: 'unknown', min: null, max: null, low: null, high: null, reasons: [], codedReasons: [] };
    if (extent) {
      entry.min = extent.min * scale;
      entry.max = extent.max * scale;
    }
    if (travel !== null && travel > 0) {
      entry.low = Math.floor(mask / (2 ** i)) % 2 === 1 ? 0 : -travel;
      entry.high = entry.low + travel;
    }
    // With a doubtful reference (global), machine coordinates mean nothing:
    // no comparison at all, no false alarm. Otherwise what was followed is
    // compared, even when another part of the program could not be.
    const outside = [];
    const compare = (min, max, code, label, unit) => {
      entry.machineMin = entry.machineMin === undefined ? min : Math.min(entry.machineMin, min);
      entry.machineMax = entry.machineMax === undefined ? max : Math.max(entry.machineMax, max);
      if (min < entry.low - TOLERANCE_MM || max > entry.high + TOLERANCE_MM) {
        outside.push(reason(code, { axis, min: fmt(min), max: fmt(max), low: fmt(entry.low), high: fmt(entry.high) }, label + fmt(min) + ' → ' + fmt(max) + unit + ' (course ' + fmt(entry.low) + ' → ' + fmt(entry.high) + ').'));
      }
    };
    if (entry.low !== null && !global.length) {
      if (extent && offset[axis] !== null) {
        compare(entry.min + offset[axis], entry.max + offset[axis], 'ETOUCH_CHECK_OUTSIDE', 'Hors course ' + axis + ' : ', ' mm machine');
      }
      if (machineExtent) {
        compare(machineExtent.min * scale, machineExtent.max * scale, 'ETOUCH_CHECK_OUTSIDE_G53', 'Hors course ' + axis + ' en coordonnées machine (G53) : ', ' mm');
      }
    }
    const listed = outside.concat(reasons);
    if (outside.length) {
      entry.verdict = 'outside';
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
  return {
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
    scope: 'Course machine X/Y/Z et profondeur Z du programme, dans le repère de travail : ni brides, ni outil, ni matière.'
  };
};

export const programCheck = (gcode, machine) => checkProgram(analyzeProgram(gcode), machine);

export default { analyzeProgram, checkProgram, programCheck };
