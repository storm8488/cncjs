'use strict';
// Catalog of the visualisation strings (touch/i18n-messages-viz.js): every phrase passed to t() in the
// visualisation files, and the phrases they translate through a table, has a row in one of the page
// catalogs; the viz rows have English and Spanish, and none duplicates a row of another catalog.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dir = path.join(__dirname, 'touch');
const key = s => s.trim().replace(/\s+/g, ' ');
const sandbox = { window: {} };
const others = ['i18n-messages.js', 'i18n-messages-machine.js', 'i18n-messages-profiles.js'];
others.forEach(f => vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox));
const before = sandbox.window.CNCTouchMessages.length, otherKeys = new Set(sandbox.window.CNCTouchMessages.map(r => key(r[0])));
vm.runInNewContext(fs.readFileSync(path.join(dir, 'i18n-messages-viz.js'), 'utf8'), sandbox);
const viz = sandbox.window.CNCTouchMessages.slice(before), seen = new Set();
assert(viz.length > 100);
for (const row of viz) {
  assert.equal(row.length, 3, JSON.stringify(row));
  row.forEach(v => assert(typeof v === 'string' && v.length > 0));
  const k = key(row[0]);
  assert(!otherKeys.has(k), 'already in another catalog: ' + row[0]);
  assert(!seen.has(k), 'duplicate in the viz catalog: ' + row[0]); seen.add(k);
}
const known = new Set([...otherKeys, ...seen]), missing = [];
const files = ['preview-gl.js', 'preview-inspect.js', 'laser-view.js', 'motion-estimate.js', 'preview-3d.js', 'job-dashboard.js', 'tool-position.js', 'projects.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) {
    const v = key(m[1].replace(/\\'/g, "'"));
    if (v && /[a-zà-ÿ]{2}/i.test(v) && !known.has(v)) missing.push(f + ': ' + v);
  }
}
// Phrases translated through a table (job-dashboard UNKNOWN_TEXT, preview-inspect REASONS).
const tables = [[/var UNKNOWN_TEXT=\{([^}]*)\}/, 'job-dashboard.js'], [/var REASONS = \{([\s\S]*?)\n  \};/, 'preview-inspect.js']];
for (const [re, f] of tables) {
  const body = re.exec(fs.readFileSync(path.join(dir, f), 'utf8'))[1];
  for (const m of body.matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)) if (!known.has(key(m[1]))) missing.push(f + ' (table): ' + m[1]);
}
assert.deepEqual(missing, [], 'phrases without a catalog row');
console.log('PASS viz catalog: ' + viz.length + ' rows with EN/ES, no duplicate with the other catalogs, every visualisation phrase covered (tables included).');
