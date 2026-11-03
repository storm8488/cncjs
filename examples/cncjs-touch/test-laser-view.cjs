'use strict';
// Laser view (touch/laser-view.js): emitting moves coloured by their S setpoint (not optical power),
// non-emitting moves distinct, placement identical to the stored 2D preview (tool marker aligned),
// summary computed on demand, a large generated raster file, and the worker entry.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const LV = require('./touch/laser-view.js');
const TP = require('./touch/tool-position.js');

function pixel(r, x, y) { const i = (y * r.width + x) * 4; return [r.pixels[i], r.pixels[i + 1], r.pixels[i + 2]]; }
function at(r, mmX, mmY) { const m = r.projection.matrix; return pixel(r, Math.round(m[0] * mmX + m[3]), Math.round(m[5] * mmY + m[7])); }

// Colour by S: low S darker red, high S pale yellow; travel blue; background untouched.
let r = LV.analyze('G21 G90\nM4 S0\nG0 X0 Y0\nG1 X100 Y0 F3000 S100\nG0 X0 Y50\nG1 X100 Y50 S1000\nM5\nG1 X100 Y100\nM2');
assert.deepEqual(at(r, 50, 0), LV.rampColour(0.1), 'S100 of S1000 max');
assert.deepEqual(at(r, 50, 50), LV.rampColour(1), 'S1000: full colour');
const travel = [];
for (let y = 0; y <= 100; y += 0.5) travel.push(at(r, 100, y).join(','));
assert(travel.includes(LV.colours.travel.join(',')), 'M5 move drawn as travel');
assert(travel.includes(LV.colours.background.join(',')), 'travel dashed');
assert.equal(r.summary.sMax, 1000); assert.equal(r.summary.hasM4, true); assert.equal(r.summary.hasM3, false);
assert.equal(r.summary.emittingLength, 200); assert(r.summary.travelLength > 150);
assert.equal(r.summary.sRefSource, 'program');
// $30 given: the colour scale follows it, and S above it is flagged (Grbl caps the setpoint).
r = LV.analyze('G21 G90\nM3\nG1 X10 F1000 S1200\nM2', { sRef: 1000 });
assert.equal(r.summary.sRefSource, '$30'); assert.equal(r.summary.overRef, true); assert.deepEqual(at(r, 5, 0), LV.rampColour(1));
// S0 or no M3/M4: never emitting.
r = LV.analyze('G21 G90\nM3 S0\nG1 X10 F1000\nM5 S500\nG1 X20\nM2');
assert.equal(r.summary.emittingLength, 0); assert.equal(r.summary.travelLength, 20);
// The words: consigne S, never "puissance" as a measured value.
const text = LV.describe ? LV.describe(r.summary) : '';
assert.equal(text, '', 'page-only describe absent under Node');
const src = fs.readFileSync(path.join(__dirname, 'touch', 'laser-view.js'), 'utf8');
assert(/consigne S, pas la puissance optique/.test(src));

// Same placement as the stored 2D preview: the tool marker (tool-position.js) lands on the same pixel
// with the stored projection (version 1) and with the laser view's (version 2).
const bounds = [-20, 5, 180, 95];
r = LV.analyze('G21 G90\nM3 S500\nG0 X-20 Y5\nG1 X180 Y95 F1000\nM2', { bounds });
const v1 = { version: 1, width: 960, height: 540, units: 'mm', wcs: 'G54', bounds };
for (const p of [{ x: -20, y: 5 }, { x: 180, y: 95 }, { x: 33.3, y: 61.7 }]) {
  const a = TP.project(v1, p), b = TP.project(r.projection, p);
  assert(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, 'aligned at ' + JSON.stringify(p));
}

// Arcs follow the circle.
r = LV.analyze('G21 G90\nM3 S800\nG0 X10 Y0\nG2 X10 Y0 I-10 J0 F1000\nM2');
assert.deepEqual(at(r, -10, 0), LV.rampColour(1)); assert.deepEqual(at(r, 0, 10), LV.rampColour(1));

// Large generated raster: 400 rows x 1000 pixels of varying S (about 400 000 lines).
const lines = ['G21 G90', 'M4 S0', 'G0 X0 Y0', 'G1 F6000'];
for (let row = 0; row < 400; row++) {
  const y = (row * 0.1).toFixed(1), dir = row % 2;
  lines.push('G0 X' + (dir ? 100 : 0) + ' Y' + y);
  for (let col = 1; col <= 1000; col++) lines.push('G1 X' + (dir ? 100 - col * 0.1 : col * 0.1).toFixed(1) + ' S' + Math.round(500 + 499 * Math.sin(col / 50 + row / 40)));
}
lines.push('M5', 'M2');
const big = lines.join('\n'), started = Date.now();
r = LV.analyze(big);
const ms = Date.now() - started;
assert.equal(r.summary.sMax, 999); assert.equal(r.summary.hasM4, true);
assert(Math.abs(r.summary.emittingLength - 400 * 100) < 1, 'emitting length ' + r.summary.emittingLength);
assert(r.summary.levels.filter(n => n > 0).length >= 8, 'many S levels visible: ' + r.summary.levels);
assert.equal(r.pixels.length, 960 * 540 * 4);
assert(ms < 20000, 'large file in ' + ms + ' ms');
const summary = LV.sidecarSummary(big);
assert.deepEqual(Object.keys(summary).sort(), ['emittingLength', 'hasM4', 'sMax', 'travelLength']);
assert.equal(LV.validSummary(summary), true); assert.equal(LV.validSummary({ sMax: 1 }), false);

// Worker entry: posts the pixels (transferred) and the summary; nothing else.
const posted = [];
const context = { Math, Number, isFinite, Array, Float32Array, Uint8Array, Uint8ClampedArray, JSON, Promise, Error, String,
  importScripts(...names) { names.forEach(n => vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', n.split('?')[0]), 'utf8'), context)); },
  postMessage(m, transfer) { posted.push({ m, transfer }); } };
context.self = context; vm.createContext(context);
vm.runInContext(src, context);
assert.equal(posted[0].m.type, 'ready');
context.onmessage({ data: { type: 'render', id: 7, blob: { text: () => Promise.resolve(JSON.stringify({ data: 'G21\nM3 S300\nG1 X10 F100\nM2' })) }, bounds: null, sRef: 0 } });
setTimeout(() => {
  const img = posted[1];
  assert.equal(img.m.type, 'image'); assert.equal(img.m.id, 7); assert.equal(img.m.summary.sMax, 300);
  assert.equal(img.transfer[0], img.m.pixels, 'pixels transferred, not copied');
  console.log('PASS laser view: S setpoint colours, distinct non-emitting moves, $30 scale and over-$30 flag, placement aligned with the stored preview, arcs, ' +
    '400 000-line raster in ' + ms + ' ms (PC, Node), sidecar summary, worker entry.');
}, 20);
