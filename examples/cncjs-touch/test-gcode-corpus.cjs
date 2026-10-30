'use strict';
// Shared G-code corpus (gcode-corpus/*.nc, expectations in *.json): the Touch
// library preview scan and the travel check on its projection give the stored
// results, and the preview box equals the hand-computed truth, possibly grown
// towards the assumed X0 Y0 Z0 start (arcs within the 0.02 mm sagitta). The
// server analysers (program check, resume) and the classic CNCjs visualizer
// run on the same files in src/server/services/touch/__tests__/corpus.test.js.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {scan} = require('./touch/library-preview.js');
const travel = require('./touch/travel-check.js');
const dir = path.join(__dirname, 'gcode-corpus');
const machine = {operator: {reportUnits: 'mm'}, settings: {$20: '1', $22: '1', $23: '0', $130: '400', $131: '300', $132: '100'},
  coordinates: {mpos: {x: '-350', y: '-250', z: '-60'}, wpos: {x: '0', y: '0', z: '0'}}};
function near(a, b, tol, label) { assert(Math.abs(a - b) <= tol, label + ': ' + a + ' / ' + b); }
// The box may only differ from the truth towards the assumed origin.
function towardsOrigin(box, truth, tol, label) {
  for (const axis of ['X', 'Y', 'Z']) {
    const t = truth[axis], b = box[axis];
    if (!t) { if (b) { near(b[0], 0, tol, label + axis + ' min'); near(b[1], 0, tol, label + axis + ' max'); } continue; }
    assert(b[0] >= Math.min(t[0], 0) - tol && b[0] <= t[0] + tol, label + axis + ' min ' + b[0] + ' vs ' + t[0]);
    assert(b[1] <= Math.max(t[1], 0) + tol && b[1] >= t[1] - tol, label + axis + ' max ' + b[1] + ' vs ' + t[1]);
  }
}
(async () => {
  const names = fs.readdirSync(dir).filter(n => n.endsWith('.nc')).map(n => n.slice(0, -3)).sort();
  assert(names.length >= 25, 'corpus of at least 25 programs');
  let accepted = 0, refused = 0;
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name + '.nc'), 'latin1');
    const e = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')), truth = e.truth;
    let result = null, error = null;
    try { result = await scan(text); } catch (err) { error = err; }
    if (!e.preview.accept) {
      assert(error, name + ' must be refused');
      assert(error.message.includes('Ligne ' + e.preview.line + ' : ' + e.preview.error), name + ': ' + error.message);
      assert.equal(e.preview.difference, 'D-REFUSE', name);
      refused++; continue;
    }
    assert.equal(error, null, name + ': ' + (error && error.message));
    accepted++;
    assert.equal(result.count, e.preview.count, name + ' segments');
    assert.equal(result.relativeStart, truth.relativeStart, name + ' relative start');
    if (!truth.bbox) assert.equal(result.count, 0, name + ' draws nothing');
    else {
      const box = {X: [result.bounds[0], result.bounds[2]], Y: [result.bounds[1], result.bounds[3]], Z: result.zBounds};
      const b = e.preview.bounds;
      [b[0], b[1], b[2], b[3]].forEach((v, i) => near(result.bounds[i], v, 1e-6, name + ' bounds ' + i));
      e.preview.zBounds.forEach((v, i) => near(result.zBounds[i], v, 1e-6, name + ' zBounds ' + i));
      towardsOrigin(box, truth.bbox, truth.arcs ? 0.02 : 1e-6, name + ' vs truth ');
    }
    if (truth.final) {
      const n = result.trail.length;
      near(result.trail[n - 2], truth.final[0], 1e-3, name + ' final X');
      near(result.trail[n - 1], truth.final[1], 1e-3, name + ' final Y');
      near(result.trailZ[result.trailZ.length - 1], truth.final[2], 1e-3, name + ' final Z');
    }
    const projection = {version: 1, units: 'mm', wcs: 'G54', bounds: result.bounds, relativeStart: result.relativeStart};
    assert.equal(travel.check({projection}, machine).state, e.travel, name + ' travel check');
  }
  assert(accepted >= 15 && refused >= 8, accepted + ' accepted, ' + refused + ' refused');
  console.log('PASS gcode corpus: ' + names.length + ' programs, ' + accepted + ' previewed as the truth (origin and arc rules), ' + refused + ' refused as documented, travel checks as stored.');
})().catch(error => { console.error(error); process.exit(1); });
