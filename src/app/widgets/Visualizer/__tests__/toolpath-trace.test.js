/* eslint-env jest */
// Classic visualizer path (toolpath-trace.js, shared by GCodeVisualizer and
// toolpath-buffers). Not in the default Jest testMatch (src/server only); run:
//   npx jest --coverage=false --testMatch "<rootDir>/src/app/widgets/Visualizer/__tests__/*.test.js"
// The same fixes are also checked on the shared corpus by
// src/server/services/touch/__tests__/corpus.test.js (08, 10, 11, 16, 20).
import * as THREE from 'three';
import * as gcodeParser from 'gcode-parser';
import { traceToolpath, stripComments, ARC_DIVISIONS } from '../toolpath-trace';
import { codeOf } from '../../../../server/services/touch/program-check';
import { buildToolpathBuffers } from '../toolpath-buffers';
import GCodeVisualizer from '../GCodeVisualizer';

jest.mock('app/lib/log', () => ({ debug: () => {} }), { virtual: true });

// gcode-parser 2.0, as gcode-interpreter loads it (its own nested copy).
const bundledParser = require('gcode-interpreter/node_modules/gcode-parser');

test('two gcode-parser versions coexist: 2.2 for the app and the sender, 2.0 inside gcode-interpreter', () => {
  expect(require('gcode-parser/package.json').version).toBe('2.2.0');
  expect(require('gcode-interpreter/node_modules/gcode-parser/package.json').version).toBe('2.0.0');
  // The one gcode-interpreter really loads is the nested 2.0.
  const fromInterpreter = require.resolve('gcode-parser', { paths: [require.resolve('gcode-interpreter')] });
  expect(fromInterpreter).toBe(require.resolve('gcode-interpreter/node_modules/gcode-parser'));
});

// The strips of a program: arrays of [x, y, z] (rounded to 1e-9).
const strips = (gcode) => {
  const out = [[]];
  const r = (v) => Math.round(v * 1e9) / 1e9;
  const result = traceToolpath(gcode, {
    vertex: (x, y, z) => out[out.length - 1].push([r(x), r(y), r(z)]),
    cut: () => out.push([])
  });
  return { strips: out.filter((s) => s.length), position: result.position };
};

describe('helix Z', () => {
  test('the last vertex of an arc reaches the end of its Z travel', () => {
    const { strips: [path] } = strips('G21 G90 G17\nG0 X10 Y0 Z0\nG2 X10 Y0 Z-2 I-10 J0\nG2 X10 Y0 Z-4 I-10 J0');
    expect(path.length).toBe(1 + 2 * (ARC_DIVISIONS + 1));
    expect(path[ARC_DIVISIONS + 1][2]).toBe(-2); // end of the first turn
    expect(path[path.length - 1][2]).toBe(-4); // was -3.935484 (30/31 of the travel)
    // Z is linear in the angle: 1/30 of the travel per division.
    expect(path[2][2]).toBeCloseTo(-2 / ARC_DIVISIONS, 9);
    expect(Math.min(...path.map((p) => p[2]))).toBe(-4);
  });

  test('G18 / G19 helices end on their helix axis value too', () => {
    // G18: helix along Y; G19: along X.
    expect(strips('G90 G18\nG0 X0 Y0 Z10\nG2 X0 Z10 Y-3 I0 K-10').strips[0].slice(-1)[0][1]).toBe(-3);
    expect(strips('G90 G19\nG0 X0 Y10 Z0\nG2 Y10 Z0 X-3 J-10 K0').strips[0].slice(-1)[0][0]).toBe(-3);
  });
});

describe('G53, G28, G30 cut the path', () => {
  test('a G53 move is not drawn in work coordinates; drawing resumes at the next absolute move', () => {
    const { strips: s, position } = strips('G21 G90\nG0 X10 Y10 Z5\nG53 G0 X-5 Y-5\nG0 X20 Y20\nG1 X30');
    expect(s).toEqual([[[10, 10, 5]], [[20, 20, 5], [30, 20, 5]]]);
    expect(position).toEqual({ x: 30, y: 20, z: 5 });
  });

  test('G53 leaves only the axes it names unknown', () => {
    // Z unknown after line 2: line 3 (X only) is not drawn, line 4 restores Z.
    const { strips: s } = strips('G90\nG53 G0 Z-1\nG0 X10 Y10\nG0 Z5\nG1 X20');
    expect(s).toEqual([[[10, 10, 5], [20, 10, 5]]]);
  });

  test('axis words grouped with G53 (no motion word) are handled the same way', () => {
    const { strips: s, position } = strips('G90\nG0 X1 Y1 Z1\nG53 X-5');
    expect(s).toEqual([[[1, 1, 1]]]);
    expect(position).toEqual({ x: null, y: 1, z: 1 });
  });

  test('G28 G91 Z0 (Fusion 360 retract): only Z is unknown, relative moves of it are not drawn', () => {
    const { strips: s, position } = strips('G90\nG0 X10 Y10 Z5\nG28 G91 Z0\nG90\nG0 X20 Y20\nG91 G0 Z1\nG90 G0 Z5\nG1 X25');
    expect(s).toEqual([[[10, 10, 5]], [[20, 20, 5], [25, 20, 5]]]);
    expect(position).toEqual({ x: 25, y: 20, z: 5 });
  });

  test('G28 and G30 without axis words leave every axis unknown', () => {
    ['G28', 'G30'].forEach((code) => {
      const { strips: s, position } = strips('G90\nG0 X10 Y10 Z5\n' + code + '\nG0 X1 Y1\nG0 Z2\nG0 X3');
      expect([code, s]).toEqual([code, [[[10, 10, 5]], [[1, 1, 2], [3, 1, 2]]]]);
      expect(position).toEqual({ x: 3, y: 1, z: 2 });
    });
    expect(strips('G0 X1\nG30').position).toEqual({ x: null, y: null, z: null });
  });

  test('G28.1 / G30.1 (store a position) do not cut the path', () => {
    expect(strips('G90\nG0 X1\nG28.1\nG30.1\nG0 X2').strips).toEqual([[[1, 0, 0], [2, 0, 0]]]);
  });

  test('an arc after a cut restarts the path at its end point', () => {
    const { strips: s } = strips('G90 G17\nG0 X10 Y0 Z0\nG53 G0 X0 Y0 Z0\nG3 X-10 Y0 Z0 I-10 J0\nG1 X-20');
    expect(s).toEqual([[[10, 0, 0]], [[-10, 0, 0], [-20, 0, 0]]]);
  });

  test('toolpath-buffers reports the strip starts and leaves G53 out of the box', () => {
    const b = buildToolpathBuffers('G90\nG0 X10 Y10 Z5\nG53 G0 X-5 Y-5\nG0 X20 Y20\nG1 X30');
    expect(b.count).toBe(3);
    expect(Array.from(b.breaks)).toEqual([1]);
    expect(b.bounds).toEqual({ min: [10, 10, 5], max: [30, 20, 5] });
  });
});

describe('comments are read like the CNCjs sender (gcode-parser 2.2)', () => {
  test('a nested "(" leaves the rest of the line in the comment', () => {
    const { strips: s } = strips('G90\nG0 X0 Y0\n(old (v1) G0 X50 Y50\n(note (v2) end) G1 X5\nG1 X1 (a ; b) Y2');
    expect(s).toEqual([[[0, 0, 0], [5, 0, 0], [1, 2, 0]]]);
  });

  test('stripComments equals gcode-parser 2.2 (the sender) and the F2 program check', () => {
    [
      'G1 X1 Y2', '(old (v1) G0 X50 Y50', '(note (v2) end) G1 X5', 'G1 Z-1 F100 (plunge ; slowly)', 'G1 X1 (a ; b',
      'G1 X1 ) Y2', 'G1 X1 (a) ; (b) Y9', 'g0x10y10(c)z2', ';G1 X9', '((deep) (deeper)) G0 Z3 (tail', 'G0 X1 ; c ; d',
      ')(', '(()', '%', 'G53 G0 Z-1 (park)'
    ].forEach((line) => {
      const sent = gcodeParser.parseLine(line, { lineMode: 'stripped' }).line;
      expect([line, stripComments(line).trim()]).toEqual([line, sent]);
      expect([line, stripComments(line).trim().toUpperCase()]).toEqual([line, codeOf(line)]);
      // The 2.0 parser bundled with gcode-interpreter finds the 2.2 words on the code.
      const code = stripComments(line).replace(/\s+/g, '') || '%';
      expect([line, bundledParser.parseLine(code).words]).toEqual([line, gcodeParser.parseLine(line).words]);
    });
  });

  test('one frame per non-empty line, as the sender counts lines', () => {
    const gcode = 'G90\n\n(only a comment)\n  \n(old (v1) G0 X50\r\nG0 X1\n';
    const frames = [];
    traceToolpath(gcode, { line: (data, index) => frames.push([index, data.line]) });
    expect(frames).toEqual([[0, 'G90'], [1, '(only a comment)'], [2, '(old (v1) G0 X50'], [3, 'G0 X1']]);
    expect(frames.length).toBe(gcode.split('\n').filter((line) => line.trim().length > 0).length);
  });
});

describe('GCodeVisualizer', () => {
  test('one THREE.Line per strip, and frames recolour across strips', () => {
    const v = new GCodeVisualizer();
    const group = v.render('G90\nG0 X10 Y10 Z5\nG1 X20\nG53 G0 X-5 Y-5\nG0 X30 Y30\nG1 X40');
    expect(group.children.length).toBe(2);
    expect(group.children.map((line) => line.geometry.vertices.map((p) => [p.x, p.y, p.z])))
      .toEqual([[[10, 10, 5], [20, 10, 5]], [[30, 30, 5], [40, 30, 5]]]);
    const box = new THREE.Box3().setFromObject(group);
    expect([box.min.x, box.max.x]).toEqual([10, 40]);

    const grey = v.geometry.colors[0].clone().setStyle('lightgrey');
    // A frame's vertex index is taken after its line (as before): frame 4
    // (G0 X30 Y30) ends at vertex 3, so vertices 0..2 are greyed.
    expect(v.frames.map((f) => f.vertexIndex)).toEqual([0, 1, 2, 2, 3, 4]);
    v.setFrameIndex(4);
    expect(group.children[0].geometry.colors.every((c) => c.equals(grey))).toBe(true);
    expect(group.children[1].geometry.colors[0].equals(grey)).toBe(true);
    expect(group.children[1].geometry.colors[1].equals(grey)).toBe(false);
    v.setFrameIndex(0);
    expect(group.children[1].geometry.colors[0].equals(v.geometry.colors[2])).toBe(true);
    expect(group.children[0].geometry.colors[0].equals(v.geometry.colors[0])).toBe(true);
  });

  test('an empty program still gives one (empty) line', () => {
    const v = new GCodeVisualizer();
    expect(v.render('(nothing)\n').children.length).toBe(1);
  });
});
