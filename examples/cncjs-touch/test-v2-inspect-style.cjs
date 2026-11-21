'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const css = fs.readFileSync(__dirname + '/touch/preview-advanced.css', 'utf8');
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
  assert(found, 'missing isolated inspection style: ' + selector);
  return found[1];
}
assert.match(rule('.perf-v2 .pgl-v2-inspection'), /position:absolute/);
assert.match(rule('.perf-v2 .pgl-v2-inspection'), /overflow:auto/);
assert.match(rule('.perf-v2 .pgl-v2-inspection'), /font-size:(?:var\(--fs-16\)|16px)/);
assert.match(rule('.perf-v2 .pgl-candidate'), /min-height:48px/);
assert.match(rule('.perf-v2 .pgl-inspection-return'), /min-height:64px/);
assert.match(rule('.perf-v2 .pgl-inspection-crosshair'), /pointer-events:none/);
assert.match(rule('.perf-v2 .pgl-inspection-crosshair'), /border-radius:0/);
assert.match(rule('.perf-v2 .pgl-loupe-frame'), /pointer-events:none/);
assert.match(css, /\.perf-v2 \.pgl-v2-inspection\[hidden\]/);
assert(!/\.perf-v2[^{}]*\{[^{}]*(?:position:fixed|z-index:7\d\d)/.test(css), 'inspection stays inside its scene, below the safety strip');
assert(!css.includes('\r'), 'LF only');
console.log('PASS v2 inspection styles: scene containment, independent reticle, 64/48px controls and 16px text.');
