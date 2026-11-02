/* eslint-env jest */
// Shared G-code corpus (examples/cncjs-touch/gcode-corpus): every program goes
// through every analyser that reads programs, and each result is compared
// with the hand-computed truth stored next to it (<name>.json, `truth`):
//   - Touch library preview scan (client, library-preview.js), and the travel
//     check that uses its projection (travel-check.js);
//   - F2 program check (program-check.js, analyzeProgram/checkProgram);
//   - resume (resume.js, stateBefore/modalsBeforeFirstMove);
//   - the classic CNCjs visualizer geometry (gcode-toolpath through
//     src/app/widgets/Visualizer/toolpath-buffers.js).
// motion-preflight.js does not read programs (jog preview only): not run here.
//
// An analyser may differ from the truth only in a documented way:
//   D-ORIGIN   (rule, no declaration) the start is assumed at X0 Y0 Z0, so
//              the box may only grow towards the origin (preview, toolpath).
//   D-ARC      (rule) arcs drawn as chords: preview within 0.02 mm (its
//              sagitta), classic visualizer within r (1 - cos 6 deg) (30 chords
//              per arc, cardinal points not sampled).
//   D-REFUSE   the analyser refuses the program (conservative: no wrong box).
//   D-UNKNOWN  the analyser reports the axis / position as unknown
//              (conservative: never validated, never a wrong position).
//   D-CLASSIC-* defects of the classic CNCjs visualizer, outside Touch (none
//     declared since audit 31: the helix Z, G53/G28/G30 and nested comments
//     are fixed in src/app/widgets/Visualizer/toolpath-trace.js; G53, G28 and
//     G30 now cut the drawn path, the axes they move stay unknown).
// A resume or program-check position that differs from the truth is never a
// documented difference: it is a defect (16-nested-comment proved one).
import fs from 'fs';
import path from 'path';
import * as gcodeParser from 'gcode-parser';
import { analyzeProgram, checkProgram, codeOf } from '../program-check';
import { stateBefore, modalsBeforeFirstMove, programLines } from '../resume';
import { buildToolpathBuffers } from '../../../../app/widgets/Visualizer/toolpath-buffers';

const preview = require('../../../../../examples/cncjs-touch/touch/library-preview');
const travel = require('../../../../../examples/cncjs-touch/touch/travel-check');

const DIR = path.join(__dirname, '../../../../../examples/cncjs-touch/gcode-corpus');
const AXES = ['X', 'Y', 'Z'];
const EPS = 1e-6;
const FLOAT32 = 1e-4; // toolpath-buffers stores Float32 vertices
const PREVIEW_ARC = 0.02;
const CLASSIC_ARC = 1 - Math.cos(Math.PI / 30); // times the largest radius (<= 25.4 mm here)
const DIFFERENCES = ['D-REFUSE', 'D-UNKNOWN', 'D-CLASSIC-HELIX-Z', 'D-CLASSIC-MACHINE', 'D-CLASSIC-NESTED-COMMENT'];

// Reference machine: homed Grbl, 400 x 300 x 100 mm, homing towards +
// (machine space [-travel, 0]), G54 origin at machine X-350 Y-250 Z-60.
const MACHINE = {
  settings: { $20: '1', $22: '1', $23: '0', $130: '400', $131: '300', $132: '100' },
  mpos: { x: -350, y: -250, z: -60 },
  wpos: { x: 0, y: 0, z: 0 },
  modal: { units: 'G21', distance: 'G90', wcs: 'G54' },
  parameters: null,
  homed: true,
  reportUnits: 'mm'
};
const TRAVEL_MACHINE = {
  operator: { reportUnits: 'mm' },
  settings: MACHINE.settings,
  coordinates: { mpos: { x: '-350', y: '-250', z: '-60' }, wpos: { x: '0', y: '0', z: '0' } }
};

const names = fs.readdirSync(DIR).filter((n) => n.endsWith('.nc')).map((n) => n.slice(0, -3)).sort();
const load = (name) => ({
  text: fs.readFileSync(path.join(DIR, name + '.nc'), 'latin1'),
  expected: JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'))
});

const close = (a, b, tol, label) => {
  if (a === null || b === null || a === undefined || b === undefined) {
    expect([label, a ?? null]).toEqual([label, b ?? null]);
  } else if (Math.abs(a - b) > tol) {
    throw new Error(label + ': ' + a + ' differs from ' + b + ' (tolerance ' + tol + ')');
  }
};
// [min, max] per axis from a preview result or a toolpath box.
const previewBox = (p) => (p.count ? { X: [p.bounds[0], p.bounds[2]], Y: [p.bounds[1], p.bounds[3]], Z: p.zBounds } : null);
const toolpathBox = (b) => (b ? { X: [b.min[0], b.max[0]], Y: [b.min[1], b.max[1]], Z: [b.min[2], b.max[2]] } : null);
// D-ORIGIN: the box equals the truth, possibly grown towards the assumed origin.
const withinOrigin = (box, truth, tol, label) => {
  AXES.forEach((axis) => {
    const t = truth && truth[axis];
    const b = box && box[axis];
    if (!t) {
      // An axis the program never gives: only the assumed origin may appear.
      if (b) {
        close(b[0], 0, tol, label + ' ' + axis + ' min (origin)');
        close(b[1], 0, tol, label + ' ' + axis + ' max (origin)');
      }
      return;
    }
    expect(b).toBeTruthy();
    if (b[0] < Math.min(t[0], 0) - tol || b[0] > t[0] + tol) {
      throw new Error(label + ' ' + axis + ' min ' + b[0] + ' is neither ' + t[0] + ' nor towards 0');
    }
    if (b[1] > Math.max(t[1], 0) + tol || b[1] < t[1] - tol) {
      throw new Error(label + ' ' + axis + ' max ' + b[1] + ' is neither ' + t[1] + ' nor towards 0');
    }
  });
};
const sameBox = (box, ref, tol, label) => {
  AXES.forEach((axis) => {
    const b = box && box[axis];
    const r = ref && ref[axis];
    if (!b || !r) {
      expect([label, axis, b || null]).toEqual([label, axis, r || null]);
      return;
    }
    close(b[0], r[0], tol, label + ' ' + axis + ' min');
    close(b[1], r[1], tol, label + ' ' + axis + ' max');
  });
};
const toMm = (pos, units) => AXES.map((a) => (pos[a] === null ? null : pos[a] * (units === 'G20' ? 25.4 : 1)));

describe('shared G-code corpus', () => {
  test('every program has its expectations, with documented differences only', () => {
    expect(names.length).toBeGreaterThanOrEqual(25);
    names.forEach((name) => {
      const { expected } = load(name);
      ['preview', 'programCheck', 'resume', 'toolpath'].forEach((k) => {
        expect(expected[k]).toBeTruthy();
        if (expected[k].difference) {
          expect([name, k, DIFFERENCES.includes(expected[k].difference)]).toEqual([name, k, true]);
        }
      });
    });
  });

  describe.each(names)('%s', (name) => {
    const { text, expected } = load(name);
    const truth = expected.truth;

    test('library preview scan (Touch) and its travel check', async () => {
      const e = expected.preview;
      let result = null;
      let error = null;
      try {
        result = await preview.scan(text);
      } catch (err) {
        error = err;
      }
      if (!e.accept) {
        expect(error).toBeTruthy();
        expect(error.message).toContain('Ligne ' + e.line + ' : ' + e.error);
        expect(e.difference).toBe('D-REFUSE');
        return;
      }
      expect(error).toBeNull();
      expect(result.count).toBe(e.count);
      expect(result.relativeStart).toBe(truth.relativeStart);
      const tol = truth.arcs ? PREVIEW_ARC : EPS;
      sameBox(previewBox(result), e.bounds && { X: [e.bounds[0], e.bounds[2]], Y: [e.bounds[1], e.bounds[3]], Z: e.zBounds }, EPS, 'preview');
      if (truth.bbox) {
        withinOrigin(previewBox(result), truth.bbox, tol, 'preview vs truth');
      } else {
        expect(result.count).toBe(0);
      }
      if (truth.final) {
        const n = result.trail.length;
        close(result.trail[n - 2], truth.final[0], 1e-3, 'preview final X');
        close(result.trail[n - 1], truth.final[1], 1e-3, 'preview final Y');
        close(result.trailZ[result.trailZ.length - 1], truth.final[2], 1e-3, 'preview final Z');
      }
      const projection = { version: 1, units: 'mm', wcs: 'G54', bounds: result.bounds, relativeStart: result.relativeStart };
      expect(travel.check({ projection }, TRAVEL_MACHINE).state).toBe(expected.travel);
    });

    test('F2 program check', () => {
      const e = expected.programCheck;
      const a = analyzeProgram(text);
      const unknownAxes = AXES.filter((axis) => a.unknownAxes[axis]);
      expect(unknownAxes).toEqual(e.unknownAxes);
      if (unknownAxes.length) {
        expect(e.difference).toBe('D-UNKNOWN');
      }
      const extent = Object.fromEntries(AXES.map((axis) => [axis, a.extent[axis] && [a.extent[axis].min, a.extent[axis].max]]));
      sameBox(extent, e.extent, EPS, 'program check');
      // Every axis it follows is exactly the truth.
      AXES.filter((axis) => !unknownAxes.includes(axis)).forEach((axis) => {
        sameBox({ [axis]: extent[axis] }, { [axis]: truth.bbox ? truth.bbox[axis] : null }, EPS, 'program check vs truth');
      });
      if (truth.machineBbox) {
        const machine = Object.fromEntries(AXES.map((axis) => [axis, a.machineExtent[axis] && [a.machineExtent[axis].min, a.machineExtent[axis].max]]));
        sameBox(machine, truth.machineBbox, EPS, 'program check G53');
      }
      expect(a.units).toBe(truth.units);
      expect(a.rawUnits).toBe(e.rawUnits);
      expect(a.rawUnits).toBe(truth.units === null && a.moves > 0);
      expect(checkProgram(a, MACHINE).verdict).toBe(e.verdict);
    });

    test('resume: state before the end of the program and modes before the first move', () => {
      const e = expected.resume;
      const modals = modalsBeforeFirstMove(text);
      // Same reading of the units as the program check and the truth.
      if (truth.units !== null) {
        expect(modals.units).toBe(true);
      } else if (analyzeProgram(text).moves > 0) {
        expect(modals.units).toBe(false);
      }
      const lines = programLines(text);
      let state = null;
      let error = null;
      try {
        state = stateBefore(lines, lines.length + 1);
      } catch (err) {
        error = err;
      }
      if (e.difference === 'D-REFUSE') {
        expect(error).toBeTruthy();
        expect(error.status).toBe(409);
        return;
      }
      expect(error).toBeNull();
      const final = toMm(state.pos, state.units);
      if (final.every((v) => v !== null)) {
        // A known position must be the true one: a wrong resume position is a defect.
        expect(truth.final).toBeTruthy();
        AXES.forEach((axis, i) => close(final[i], truth.final[i], EPS, 'resume final ' + axis));
        expect(e.final).toEqual(truth.final);
      } else {
        expect(e.final).toBeNull();
        if (truth.final) {
          expect(e.difference).toBe('D-UNKNOWN');
        }
      }
    });

    test('classic visualizer (gcode-toolpath)', () => {
      const e = expected.toolpath;
      const built = buildToolpathBuffers(text);
      const box = toolpathBox(built.bounds);
      const ref = e.bounds && { X: [e.bounds.min[0], e.bounds.max[0]], Y: [e.bounds.min[1], e.bounds.max[1]], Z: [e.bounds.min[2], e.bounds.max[2]] };
      sameBox(box, ref, FLOAT32, 'toolpath');
      if (!e.difference && truth.bbox) {
        withinOrigin(box, truth.bbox, truth.arcs ? 25.4 * CLASSIC_ARC : FLOAT32, 'toolpath vs truth');
      }
      if (!e.difference && truth.final) {
        AXES.forEach((axis, i) => close(built.position[axis.toLowerCase()], truth.final[i], FLOAT32, 'toolpath final ' + axis));
      }
      // A position the visualizer cannot know (after G53, G28, G30) is never a wrong one.
      if (!truth.final && truth.bbox && /G(53|28|30)(?![0-9.])/i.test(text)) {
        expect(AXES.some((axis) => built.position[axis.toLowerCase()] === null)).toBe(true);
      }
    });
  });

  test('program check and resume read comments exactly like the CNCjs sender (gcode-parser 2.2)', () => {
    const sent = (line) => gcodeParser.parseLine(line, { flatten: true, lineMode: 'stripped' }).line.toUpperCase();
    [
      'G1 X1 Y2', '(old (v1) G0 X50 Y50', '(note (v2) end) G1 X5', 'G1 Z-1 F100 (plunge ; slowly)', 'G1 X1 (a ; b',
      'G1 X1 ) Y2', 'G1 X1 (a) ; (b) Y9', 'g0x10y10(c)z2', ';G1 X9', '((deep) (deeper)) G0 Z3 (tail', 'G0 X1 ; c ; d'
    ].forEach((line) => {
      expect([line, codeOf(line)]).toEqual([line, sent(line)]);
    });
  });

  // Generated programs (not stored): a very long one, and the Latin-1 file
  // read as UTF-8, the way the server reads uploads.
  test('a 60 000-line generated program gives the same box everywhere', async () => {
    const lines = ['G21 G90', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F1000'];
    for (let i = 0; i < 60000; i++) {
      lines.push('G1 X' + (i % 2 ? 100 : 0) + ' Y' + (i / 1000).toFixed(3));
    }
    lines.push('G0 Z5', 'M30');
    const text = lines.join('\n') + '\n';
    const truth = { X: [0, 100], Y: [0, 59.999], Z: [-1, 5] };
    const p = await preview.scan(text);
    sameBox(previewBox(p), truth, EPS, 'long preview');
    const a = analyzeProgram(text);
    sameBox(Object.fromEntries(AXES.map((axis) => [axis, [a.extent[axis].min, a.extent[axis].max]])), truth, EPS, 'long program check');
    expect(a.lines).toBe(60006);
    const s = stateBefore(programLines(text), 60007);
    expect([s.pos.X, s.pos.Y, s.pos.Z]).toEqual([100, 59.999, 5]);
    sameBox(toolpathBox(buildToolpathBuffers(text, { keepLines: false }).bounds), truth, FLOAT32, 'long toolpath');
  });

  test('Latin-1 comments read as UTF-8 give the same results', async () => {
    const latin1 = load('23-latin1').text;
    const utf8 = fs.readFileSync(path.join(DIR, '23-latin1.nc'), 'utf8');
    expect(utf8).toContain('�');
    expect((await preview.scan(utf8)).bounds).toEqual((await preview.scan(latin1)).bounds);
    expect(analyzeProgram(utf8).extent).toEqual(analyzeProgram(latin1).extent);
    expect(stateBefore(programLines(utf8), 9).pos).toEqual(stateBefore(programLines(latin1), 9).pos);
  });
});
