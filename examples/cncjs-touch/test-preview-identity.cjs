'use strict';
// Program identity (A5) on the client: when the loaded job's fingerprint differs from the
// preview's (same name, another version of the file), the preview and the Suivi trail are not
// drawn as the loaded program's: the preview box is marked, ui-2027.css hides the image, the
// trail and the marker, and a notice says "Aperçu d'une autre version du fichier". The start
// confirmation's XY estimate and the guided preparation ignore that preview too.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { load } = require('./job-controls-fixture.cjs');
const A = 'sha256:' + 'a'.repeat(64), B = 'sha256:' + 'b'.repeat(64);
const projection = { units: 'mm', bounds: [0, 0, 10, 10], width: 960, height: 540, wcs: 'G54', version: 1 };
(async () => {
  const f = load(); f.window.CNCTravelCheck = require('./touch/travel-check.js');
  const img = f.el('home-job-image'), art = f.el('job-art'); art.appendChild(img);
  img.cncPreview = { file: 'part.nc', fingerprint: A, projection };
  await f.connect(f.machine({ fingerprint: B, settings: { $22: '1', $130: '300', $131: '200' }, coordinates: { mpos: { x: -100, y: -100 }, wpos: { x: 0, y: 0 } } }));
  const note = f.el('home-preview-identity');
  assert.equal(art.getAttribute('data-identity'), 'other', 'different fingerprints: the preview box is marked');
  assert.equal(note.parentNode, art); assert.equal(note.hidden, false); assert.match(note.textContent, /^Aperçu d’une autre version du fichier/);
  assert.equal(note.getAttribute('role'), 'status');
  // The confirmation does not place that preview's extent on the machine.
  f.el('job-start').click(); f.answer(f.posts().at(-1), { nonce: 'n', name: 'Part.nc', expiresIn: 15 }); await f.flush();
  assert.match(f.el('job-travel').textContent, /aperçu du fichier indisponible/, 'another version is no preview for the travel estimate');
  f.el('job-dismiss').click();
  // Same fingerprint: shown as the loaded program's, the estimate uses it.
  f.push([f.machine({ fingerprint: A, settings: { $22: '1', $130: '300', $131: '200' }, coordinates: { mpos: { x: -100, y: -100 }, wpos: { x: 0, y: 0 } } })]);
  assert.equal(art.getAttribute('data-identity'), 'same'); assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  f.el('job-start').click(); f.answer(f.posts().at(-1), { nonce: 'n', name: 'Part.nc', expiresIn: 15 }); await f.flush();
  assert.match(f.el('job-travel').textContent, /Dans la course machine/); f.el('job-dismiss').click();
  // Unknown on either side (older server, old preview without fingerprint): not called "another version".
  f.push([f.machine({ fingerprint: null })]); assert.equal(art.getAttribute('data-identity'), 'same');
  img.cncPreview = { file: 'part.nc', fingerprint: '', projection }; f.push([f.machine({ fingerprint: B })]); assert.equal(art.getAttribute('data-identity'), 'same');
  // A preview of another file is not this check's business (job-dashboard shows the loaded file's).
  img.cncPreview = { file: 'other.nc', fingerprint: A, projection }; f.push([f.machine({ fingerprint: B })]); assert.equal(art.getAttribute('data-identity'), 'same');
  // A preview arriving for another version is marked at its load event, before any report.
  img.cncPreview = { file: 'part.nc', fingerprint: A, projection };
  (f.listeners['doc:load'] || []).forEach((fn) => fn({ target: img }));
  assert.equal(art.getAttribute('data-identity'), 'other', 'marked when the image loads');
  // No recent state: nothing to compare with.
  f.advance(4000); f.tick(); assert.equal(art.getAttribute('data-identity'), 'same');
  f.controls().dispose();

  // The style hides the image, the trail, the marker, the enlarge button and the trail's note.
  const css = fs.readFileSync(__dirname + '/touch/ui-2027.css', 'utf8').replace(/\s+/g, ' ');
  for (const target of ['>#home-job-image', '>.tool-position-marker', '>.toolpath-progress', '>.preview-open', '+.tool-position-note'])
    assert(css.includes('.ks-ui .job-art[data-identity="other"]' + target), 'hidden on another version: ' + target);
  assert(/\.tool-position-note\{display:none!important\}/.test(css.replace(/ /g, '')));

  // The guided preparation: that preview counts as stale, the file step is not green.
  const dom = require('./dom-fixture.cjs').createDOM(['jog']);
  dom.document.body.getAttribute = () => null;
  const listeners = {}, sheet = dom.element('div', 'sheet-content'), image = dom.node('home-job-image');
  image.cncPreview = { file: 'part.nc', fingerprint: A, projection };
  const window = { cncI18n: { t: (s) => s, message: (s) => s }, addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
    cncShell: { sheet: () => ({ content: sheet, open() {} }), preparationActions: dom.element('div', 'actions') }, CNCTravelCheck: require('./touch/travel-check.js') };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-preparation.js', 'utf8'), { window, document: dom.document });
  const send = (m) => listeners['cnc-job-status'].forEach((fn) => fn({ detail: { simulation: false, machine: m } }));
  const fileStep = () => sheet.querySelectorAll('*').find((e) => e.getAttribute && e.getAttribute('data-step') === 'file');
  const idle = { fresh: true, name: 'part.nc', originalName: 'Part.nc', workflow: 'idle', activeState: 'Idle', canStart: true, settings: { $22: '1' } };
  send(Object.assign({ fingerprint: B }, idle));
  assert.equal(fileStep().getAttribute('data-state'), 'warn'); assert.match(fileStep()._next.textContent, /ne correspond plus au programme/);
  send(Object.assign({ fingerprint: A }, idle)); assert.equal(fileStep().getAttribute('data-state'), 'ok');
  console.log('PASS preview identity (A5): different fingerprints hide the preview and the trail with a notice, at the image load too; unknown fingerprints are not "another version"; travel estimate and preparation ignore that preview.');
})().catch((e) => { console.error(e); process.exit(1); });
