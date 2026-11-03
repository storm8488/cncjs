'use strict';
// Motion-based estimate (touch/motion-estimate.js): lengths / feeds, arcs and helices, plunges,
// G4 dwells, rapids from $110-$112 (or unknown), unknown durations listed with their line
// (M0/M1, M6, G28/G30, probing, G53, G10/G92, missing F), correction from acknowledged progress,
// the shared interpreter (sender numbering, comments, tools and operations), worker use.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ME = require('./touch/motion-estimate.js');
const close = (a, b, eps = 1e-6, msg) => assert(Math.abs(a - b) <= eps, (msg || '') + ' ' + a + ' ≠ ' + b);

// Straight feed moves and a plunge: length / F.
let e = ME.estimate('G21 G90\nG0 Z5\nG1 Z-1 F120\nG1 X60 F600\nM30');
close(e.feedSeconds, 6 / 120 * 60 + 60 / 600 * 60, 0.05, 'plunge 3 s + 6 s');
assert.equal(e.rapid.count, 1); assert.deepEqual(e.rapid.sum, [0, 0, 5]);
assert.equal(e.known, false, 'rapids without $110-$112: not known');
assert.deepEqual(e.unknowns, [{ kind: 'rapid', line: 0 }]);
// With the rates: rapid time exact (max over axes), known.
e = ME.estimate('G21 G90\nG0 Z5\nG0 X100 Y50\nG1 X0 F1000\nM30', { rates: { x: 6000, y: 3000, z: 600 } });
close(e.rapid.seconds, 5 / 600 * 60 + Math.max(100 / 6000, 50 / 3000) * 60, 0.05, 'rapids exact');
assert.equal(e.known, true); close(e.seconds, e.feedSeconds + e.rapid.seconds, 0.11);
// Bounds from the per-axis sums when the rates are only known at display time.
const unrated = ME.estimate('G21 G90\nG0 Z5\nG0 X100 Y50\nG1 X0 F1000\nM30');
const total = ME.total(unrated, { x: 6000, y: 3000, z: 600 });
assert(total.low <= e.seconds + 0.1 && total.high >= e.seconds - 0.1, 'exact value inside the bounds ' + JSON.stringify(total) + ' ' + e.seconds);
assert.equal(total.rapidKnown, true); assert.equal(total.known, true);
assert.equal(ME.total(unrated, null).high, null, 'no rates: upper bound unknown');
assert.equal(ME.total(unrated, null).rapidKnown, false);

// Arcs: a full circle (I/J), an R arc, a helix; inch units.
e = ME.estimate('G21 G90\nG0 X10 Y0\nG1 F600\nG2 X10 Y0 I-10 J0\nM30');
close(e.workLength, 2 * Math.PI * 10, 0.06, 'full circle length'); close(e.feedSeconds, 2 * Math.PI * 10 / 600 * 60, 0.05);
e = ME.estimate('G21 G90\nG0 X0 Y0\nG3 X20 Y0 R10 F600\nM30');
close(e.workLength, Math.PI * 10, 0.06, 'half circle by R');
e = ME.estimate('G21 G90\nG0 X10 Y0\nG2 X10 Y0 Z-3 I-10 J0 F600\nM30');
close(e.workLength, Math.sqrt(Math.pow(2 * Math.PI * 10, 2) + 9), 0.06, 'helix length');
e = ME.estimate('G20 G90\nG1 X1 F10\nM30');
close(e.workLength, 25.4, 1e-9); close(e.feedSeconds, 6, 1e-6, 'G20: 1 in at 10 in/min = 6 s');
// Arcs in G18 (XZ plane).
e = ME.estimate('G21 G90 G18\nG0 X10 Z0\nG2 X-10 Z0 I-10 K0 F600\nM30');
close(e.workLength, Math.PI * 10, 0.06, 'G18 half circle');
// Relative moves and inverse time.
e = ME.estimate('G21 G91\nG1 X10 F600\nG1 X10\nG90\nM30');
close(e.workLength, 20, 1e-9);
e = ME.estimate('G21 G90 G93\nG1 X10 F2\nG94\nM30');
close(e.feedSeconds, 30, 1e-6, 'G93: F2 = half a minute');

// Dwells and unknown durations, each with its sender line (non-empty lines, comments count).
const program = ['G21 G90', '', 'G0 Z5 (approach)', 'M3 S10000', 'G4 P2.5', 'G1 Z-1', 'M0', 'M1', 'T2 M6', 'G28', 'G1 X10 Y10 Z-1 F300', 'G38.2 Z-20 F50', 'G53 G0 Z0', 'G92 X0', 'G4', 'M30'].join('\n');
e = ME.estimate(program);
close(e.dwellSeconds, 2.5, 1e-9);
const kinds = e.unknowns.map(u => u.kind + '@' + u.line);
for (const k of ['feed@5', 'pause@6', 'optional-pause@7', 'toolchange@8', 'home@9', 'probe@11', 'machine@12', 'frame@13', 'dwell@14', 'rapid@0']) assert(kinds.includes(k), 'unknown ' + k + ' in ' + kinds);
// The move that leaves the unknown G28 position has no known length: listed, never invented.
assert.deepEqual(kinds.filter(k => k.startsWith('position@')), ['position@10']);
assert.equal(e.known, false); assert.equal(e.lines, 15);
// A relative move after G28 stays unknown (no invented distance).
e = ME.estimate('G21 G90\nG28\nG91\nG1 X10 F100\nM30');
assert(e.unknowns.some(u => u.kind === 'position' && u.line === 4)); assert.equal(e.workLength, 0);
// No feed known: not counted, listed once.
e = ME.estimate('G21 G90\nG1 X10\nG1 X20\nM30');
assert.equal(e.feedSeconds, 0); assert.equal(e.unknowns.filter(u => u.kind === 'feed').length, 1);

// Tools and operations: only what the program says.
e = ME.estimate('(operation: Poche)\nT1 M6\nG1 X1 F100\n(begin operation: Contour)\nT2 M6\nG1 X2\n(finish operation: Contour)\nM30');
assert.deepEqual(e.tools, [{ tool: 1, line: 2 }, { tool: 2, line: 5 }]);
assert.deepEqual(e.operations, [{ name: 'Poche', line: 1 }, { name: 'Contour', line: 4 }]);

// Remaining time from the timeline, corrected by the observed progress.
const lines = ['G21 G90', 'G0 Z1'];
for (let i = 0; i < 200; i++) lines.push('G1 X' + (i % 2 ? 0 : 100) + ' Y' + i + ' F6000');
lines.push('M30');
const job = ME.estimate(lines.join('\n'), { rates: { x: 5000, y: 5000, z: 1000 } });
close(job.feedSeconds, 200 * 1, 2, '200 strokes of ~100 mm at 6000 mm/min');
const atHalf = ME.remaining(job, null, job.lines / 2);
close(atHalf.seconds, job.feedSeconds / 2, 3, 'half way: half left'); assert.equal(atHalf.corrected, false);
const slow = ME.remaining(job, null, job.lines / 2, { activeSeconds: 60, fromLine: job.lines / 4 });
// The model says 50 s between a quarter and a half; 60 s were observed: factor 1.2.
close(slow.factor, 60 / 50, 0.06); assert.equal(slow.corrected, true); close(slow.seconds, atHalf.seconds * slow.factor, 0.5);
assert.equal(ME.remaining(job, null, job.lines / 2, { activeSeconds: 10, fromLine: 0 }).corrected, false, 'not before 20 s observed');
assert(ME.remaining(job, null, job.lines / 2, { activeSeconds: 10000, fromLine: job.lines / 4 }).factor <= 5, 'bounded factor');
assert(job.timeline.data.length / 5 <= 501, 'bounded timeline');
const big = ['G21 G90'];
for (let i = 0; i < 30000; i++) big.push('G1 X' + (i % 7) + ' F1000');
const long = ME.estimate(big.join('\n'));
assert(long.timeline.data.length / 5 <= 501 && long.timeline.data.length / 5 >= 200, 'decimated timeline: ' + long.timeline.data.length / 5);
close(ME.at(long, long.lines)[0], long.feedSeconds, 0.2);

// Settings and sidecar shape.
assert.deepEqual(ME.ratesFrom({ $110: '5000', $111: 4000, $112: '800.5' }), { x: 5000, y: 4000, z: 800.5 });
assert.equal(ME.ratesFrom({ $110: '5000', $111: '' }), null); assert.equal(ME.ratesFrom(null), null);
assert.equal(ME.valid(job), true); assert.equal(ME.valid({ version: 2 }), false); assert.equal(ME.valid(null), false);
const json = JSON.parse(JSON.stringify(job)); assert.equal(ME.valid(json), true, 'survives the sidecar JSON');

// Laser summary in the same pass: emitting = G1/G2/G3 with M3/M4 and S > 0.
e = ME.estimate('G21 G90\nM4 S0\nG0 X0 Y0\nG1 X10 F1000 S500\nG1 X20 S0\nM5\nG1 X30\nM3 S800\nG1 X40\nM30', { laser: true });
assert.deepEqual(e.laser, { sMax: 800, hasM4: true, emittingLength: 20, travelLength: 20 });
assert.equal(ME.estimate('G21\nG1 X1 F100\nM30', { laser: true }).laser, null, 'no M3/M4: no laser summary');

// Usable in a worker: the file loads with importScripts-style globals (no module, no window).
const context = { Math, Number, isFinite, Array, Float32Array };
context.self = context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'motion-estimate.js'), 'utf8'), context);
assert.equal(typeof context.CNCMotionEstimate.estimate, 'function');
close(context.CNCMotionEstimate.estimate('G1 X10 F600').feedSeconds, 1, 1e-6);
console.log('PASS motion estimate: lines, plunges, arcs, helices, G18, G20, G91, G93, dwells, unknown durations with lines, rapids exact or bounded, remaining time corrected by acknowledged progress, tools/operations, laser summary, worker globals.');
