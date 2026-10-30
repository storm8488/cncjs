import Toolpath from 'gcode-toolpath';

// The vertices of a G-code toolpath, as the classic visualizer draws them: one
// vertex per linear move (its end point), 31 per arc (THREE.ArcCurve sampling
// with 30 divisions, G17/G18/G19 planes), in work coordinates, the start
// assumed at X0 Y0 Z0. Shared by GCodeVisualizer (THREE.Line strips) and
// toolpath-buffers (typed arrays), so both draw the same path.
//
// traceToolpath(gcode, { vertex, cut, line }) → { position, modal }
//   vertex(x, y, z, motion)  next vertex of the current strip ('G0'…'G3');
//   cut()                    the path is interrupted: the next vertex starts a
//                            new strip, never joined to the previous one;
//   line(data, index)        after each non-empty line (one per line the
//                            CNCjs sender sends, same numbering): data is
//                            { line: the trimmed line, words: [[letter, value]] };
//   position                 { x, y, z } at the end, null for an axis whose
//                            work position is unknown (see below).
//
// Comments are read as gcode-parser 2.2 reads them, the version the CNCjs
// sender uses (nested parentheses, ';' inside parentheses, a stray ')'):
// gcode-toolpath depends on gcode-interpreter 3.0, which bundles gcode-parser
// 2.0 and does not nest them, so `(old (v1) G0 X50 Y50` would draw a rapid that
// is never sent. Each line is therefore reduced to its code (stripComments
// below: the algorithm of 2.2, as in src/server/services/touch/program-check.js)
// and only that code, without comments and whitespace, is given to the
// interpreter, whose 2.0 parser then finds the same words as 2.2.
//
// Moves the visualizer cannot place: it draws in work coordinates and does not
// know the machine position nor the stored G28/G30 positions. A line with G53
// leaves the X/Y/Z axes it names at an unknown work position; G28 or G30 the
// axes it names, all three when it names none (Grbl moves only the named axes).
// Such a line draws nothing and cuts the path, instead of a false segment to a
// machine coordinate drawn as a work one. Drawing resumes, as a new strip, at
// the end of the first move after which every axis is known again: an axis is
// known again once an absolute (G90) move names it. Relative (G91) moves of an
// unknown axis are not drawn. G28.1/G30.1 (store a position) move nothing.

export const ARC_DIVISIONS = 30;
const TWO_PI = Math.PI * 2;
const AXES = ['X', 'Y', 'Z'];

// THREE.EllipseCurve.getPoint (three 0.103) for a circle without rotation,
// kept bit for bit so the vertices equal the former ArcCurve sampling. That
// includes the constructor's defaults (`|| 1`, `|| 0`, `|| 2π`): a zero radius
// (an arc whose centre equals its start in the plane's x/y, which the radius
// formula below, unchanged from before, gives for G18/G19 arcs) draws a unit
// circle, an end angle of exactly 0 becomes a full turn.
const arcPoint = (aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise, t) => {
  const cx = aX || 0, cy = aY || 0, radius = aRadius || 1;
  const startAngle = aStartAngle || 0, endAngle = aEndAngle || TWO_PI, clockwise = aClockwise || false;
  let deltaAngle = endAngle - startAngle;
  const samePoints = Math.abs(deltaAngle) < Number.EPSILON;
  while (deltaAngle < 0) {
    deltaAngle += TWO_PI;
  }
  while (deltaAngle > TWO_PI) {
    deltaAngle -= TWO_PI;
  }
  if (deltaAngle < Number.EPSILON) {
    deltaAngle = samePoints ? 0 : TWO_PI;
  }
  if (clockwise === true && !samePoints) {
    deltaAngle = (deltaAngle === TWO_PI) ? -TWO_PI : deltaAngle - TWO_PI;
  }
  const angle = startAngle + t * deltaAngle;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
};

// gcode-parser 2.2 stripComments (the code the sender sends), without the
// comment texts: parentheses nest, a ';' outside them ends the line, inside
// them it is comment text, an unmatched ')' is dropped.
export const stripComments = (line) => {
  if (line.indexOf('(') < 0 && line.indexOf(')') < 0) {
    const semicolon = line.indexOf(';');
    return semicolon < 0 ? line : line.slice(0, semicolon);
  }
  let out = '';
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
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

// The word pattern of gcode-parser (2.0 and 2.2), on a compact code.
// eslint-disable-next-line no-useless-escape
const WORD = /(%.*)|({.*)|((?:\$\$)|(?:\$[a-zA-Z0-9#]*))|([a-zA-Z][0-9\+\-\.]+)|(\*[0-9]+)/g;
const axesOf = (code) => {
  const named = [];
  (code.match(WORD) || []).forEach((word) => {
    const letter = word[0].toUpperCase();
    if (AXES.includes(letter) && !named.includes(letter)) {
      named.push(letter);
    }
  });
  return named;
};
// G53, G28, G30 (with leading zeros), not G28.1 / G30.1 / G530.
const MACHINE_WORD = /G0*(53|28|30)(?![0-9.])/gi;

// The axes a line leaves at an unknown work position (G53, G28, G30), or null.
const machineAxesOf = (code) => {
  const found = code.match(MACHINE_WORD);
  if (!found) {
    return null;
  }
  const named = axesOf(code);
  const home = found.some((word) => !word.endsWith('53'));
  if (home && !named.length) {
    return AXES.slice();
  }
  return named.length ? named : null;
};

export function traceToolpath(gcode, handlers = {}) {
  const vertex = handlers.vertex || (() => {});
  const cut = handlers.cut || (() => {});
  const onLine = handlers.line || (() => {});
  const unknown = new Set();
  const machine = new Map(); // line index → axes it leaves unknown
  let codes = []; // compact code of each non-empty line
  let current = 0; // index of the line being interpreted
  let skipLine = false; // the line moves to a machine position: draws nothing
  let broken = false; // the path was cut: the next drawn move starts a strip

  // Whether a move ending at v2 is drawn. An absolute move makes the axes it
  // names known again; the move that makes them all known starts the new
  // strip at its end point (its start is unknown).
  const drawable = (modal, end) => {
    if (skipLine) {
      return false;
    }
    if (unknown.size && modal.distance === 'G90') {
      axesOf(codes[current]).forEach((axis) => unknown.delete(axis));
    }
    if (unknown.size) {
      return false;
    }
    if (broken) {
      broken = false;
      cut();
      end();
      return false;
    }
    return true;
  };

  const toolpath = new Toolpath({
    addLine: (modal, v1, v2) => {
      if (drawable(modal, () => vertex(v2.x, v2.y, v2.z, modal.motion))) {
        vertex(v2.x, v2.y, v2.z, modal.motion);
      }
    },
    addArcCurve: (modal, v1, v2, v0) => {
      const { motion, plane } = modal;
      // v0, v1, v2 are in the plane's frame (x, y in the plane, z along the
      // helix axis); back to X, Y, Z.
      const emit = (px, py, pz) => {
        if (plane === 'G17') {
          vertex(px, py, pz, motion);
        } else if (plane === 'G18') {
          vertex(py, pz, px, motion);
        } else if (plane === 'G19') {
          vertex(pz, px, py, motion);
        }
      };
      if (!drawable(modal, () => emit(v2.x, v2.y, v2.z))) {
        return;
      }
      const clockwise = (motion === 'G2');
      const radius = Math.sqrt(((v1.x - v0.x) ** 2) + ((v1.y - v0.y) ** 2));
      const startAngle = Math.atan2(v1.y - v0.y, v1.x - v0.x);
      let endAngle = Math.atan2(v2.y - v0.y, v2.x - v0.x);
      if (startAngle === endAngle) {
        endAngle += TWO_PI;
      }
      for (let i = 0; i <= ARC_DIVISIONS; ++i) {
        const point = arcPoint(v0.x, v0.y, radius, startAngle, endAngle, clockwise, i / ARC_DIVISIONS);
        // Z moves linearly with the angle and reaches the end of the helix on
        // the last vertex (it used to stop at 30/31 of its travel).
        const z = (i === ARC_DIVISIONS) ? v2.z : v1.z + (v2.z - v1.z) * (i / ARC_DIVISIONS);
        emit(point[0], point[1], z);
      }
    }
  });

  // One pass over the text, then one interpreter run over the codes: one code
  // per non-empty line, '%' for a comment-only line so that the numbering is
  // kept (2.0 skips empty lines, and reads '%' as a command without words).
  const originals = [];
  String(gcode).split('\n').forEach((text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return; // as gcode-parser and the sender: an empty line is not a frame
    }
    const code = stripComments(trimmed).replace(/\s+/g, '');
    const axes = machineAxesOf(code);
    if (axes) {
      machine.set(codes.length, axes);
    }
    originals.push(trimmed);
    codes.push(code || '%');
  });

  skipLine = machine.has(0);
  toolpath.loadFromStringSync(codes.join('\n'), (data, index) => {
    if (skipLine) {
      machine.get(index).forEach((axis) => unknown.add(axis));
      broken = true;
    }
    const line = { line: originals[index], words: data.words };
    originals[index] = null;
    current = index + 1;
    skipLine = machine.has(current);
    onLine(line, index);
  });
  codes = null;

  const p = toolpath.getPosition();
  return {
    position: {
      x: unknown.has('X') ? null : p.x,
      y: unknown.has('Y') ? null : p.y,
      z: unknown.has('Z') ? null : p.z
    },
    modal: toolpath.getModal()
  };
}

export default traceToolpath;
