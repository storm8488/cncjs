'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const P = require('./touch/probe-model.js');
const source = fs.readFileSync(__dirname + '/../../src/server/services/touch/block-probe.js', 'utf8');
const limits = JSON.parse('{' + source.match(/const LIMITS = \{([\s\S]*?)\n\};/)[1].replace(/(\w+):/g, '"$1":').replace(/,\s*$/, '') + '}');
const profile = P.empty();
for (const [key, value] of Object.entries({ fast: 100, slow: 25, search: 10, retract: 1, clearance: 5 })) {
  assert.equal(profile[key], value, key + ' default');
  assert(value >= limits[key][0] && value <= limits[key][1], key + ' within real server bounds');
}
assert.equal(profile.corner, '--'); assert.equal(profile.directionX, 1); assert.equal(profile.directionY, 1);
for (const key of ['thickness', 'faceX', 'faceY']) assert.equal(profile[key], null, key + ' must be measured');
assert(P.validate(profile, 'XYZ', null).length > 0, 'defaults cannot enable an unmeasured probe');
const zOnly = { ...profile, corner: '', directionX: null, directionY: null, thickness: 10 };
assert.deepEqual(P.validate(zOnly, 'Z', null), [], 'Z needs neither a corner nor an XY direction or diameter');
assert(P.validate(zOnly, 'XYZ', 6).length > 0, 'XYZ still needs the physical XY setup');
const stored = { ...P.demo(), fast: 80, slow: 20, search: 8, retract: 2, clearance: 4 };
assert.deepEqual(P.normalize(stored), stored, 'saved measured choices survive');
assert.equal(P.normalize({ fast: 10000 }).fast, null, 'invalid saved data cannot silently become a usable default');
assert.equal(P.normalize({ fast: null }).fast, null, 'explicit unconfigured saved data remains unconfigured');
console.log('PASS D4: bounded probe defaults, no invented dimensions, saved values preserved and Z alone needs no corner.');
