'use strict';
// Review (Codex, round 3): once the v2 band was built, shared-library.js asked for an animation frame
// on every status batch even after the v2 gate closed (Éco at rest), while the document was hidden and
// after pagehide (RAF per batch [1,1,1,1] against the L0 baseline [0,0,0,0]). Real L0 bootstrap
// (tablet-profile.js + v2 contract, test-v2-gate.cjs) with the real shared-library.js on the DOM fixture.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { page } = require('./test-v2-gate.cjs');
const { createDOM } = require('./dom-fixture.cjs');
async function setup(withLibrary) {
  const p = page(), dom = createDOM(['files']), docListeners = {};
  // The library's nodes come from the DOM fixture; the loader keeps the harness's own elements.
  const content = dom.element('div', 'perf-v2-files'); content.hidden = true;
  p.window.cncShell = { v2Mounts: () => ({ files: { screen: 'files', root: dom.node('screen-files'), content, origin: null } }) };
  p.status(); p.frame(); await p.complete();
  assert.equal(p.api.state().layout, true, 'v2 layout open'); assert.equal(p.api.gate(), true);
  if (withLibrary) {
    const doc = p.document, addDoc = doc.addEventListener;
    doc.getElementById = dom.node;
    const create = doc.createElement; doc.createElement = tag => /^(script|link)$/i.test(tag) ? create(tag) : dom.element(tag);
    doc.addEventListener = (n, f) => { (docListeners[n] ||= []).push(f); addDoc.call(doc, n, f); };
    vm.runInContext(fs.readFileSync(__dirname + '/touch/shared-library.js', 'utf8'), p.context, { filename: 'shared-library.js' });
    p.emit('cnc-v2-change', p.api.state()); p.frame();
    assert(!content.hidden, 'band built and shown');
  }
  // Animation frames requested by one status batch (the batch is drawn, then nothing is pending).
  const batch = () => { p.frame(); p.status(); return p.frames.size; };
  return { p, content, batch, visibility: hidden => { p.document.hidden = hidden; (docListeners.visibilitychange || []).forEach(f => f({})); } };
}
(async () => {
  const runs = [];
  for (const withLibrary of [false, true]) {
    const s = await setup(withLibrary), counts = [];
    // 1. Éco at rest: the gate closes (and the layout goes back at this known Idle).
    s.p.window.cncProfile.setPerformance('eco'); s.p.frame(); s.p.frame();
    assert(!s.p.api.gate());
    if (withLibrary) assert(s.content.hidden, 'the band is hidden once the v2 layout has gone');
    counts.push(s.batch(), s.batch());
    runs.push(counts);
  }
  // 2. Hidden document, then pagehide, gate still open.
  for (const withLibrary of [false, true]) {
    const s = await setup(withLibrary), counts = [];
    s.visibility(true); counts.push(s.batch());
    s.visibility(false); s.p.frame();
    s.p.emit('pagehide', {}); counts.push(s.batch(), s.batch());
    runs.push(counts);
  }
  assert.deepEqual(runs[1], runs[0], 'Éco at rest: no frame beyond the L0 baseline ' + JSON.stringify(runs));
  assert.deepEqual(runs[3], runs[2], 'hidden / pagehide: no frame beyond the L0 baseline ' + JSON.stringify(runs));
  // A frame already requested when the document hides or the page ends is cancelled.
  {
    const s = await setup(true); s.p.frame();
    s.p.status(); const pending = s.p.frames.size; assert(pending >= 1, 'a status batch at rest asks for one frame');
    s.visibility(true); assert.equal(s.p.frames.size, pending - 1, 'pending frame cancelled when hidden');
    s.visibility(false); s.p.frame(); s.p.status();
    const again = s.p.frames.size; s.p.emit('pagehide', {}); assert(s.p.frames.size < again, 'pending frame cancelled at pagehide');
  }
  // 3. Éco during a job: the gate closes, the layout is held. One last frame marks the band « non suivi »
  //    (rectangle kept), then no frame beyond the L0 baseline.
  const held = [];
  for (const withLibrary of [false, true]) {
    const s = await setup(withLibrary), counts = [], run = { workflow: 'running', activeState: 'Run', canStop: true };
    s.p.status(run); s.p.frame(); s.p.frame();
    const find = id => s.content.querySelectorAll('*').find(e => e.id === id);
    if (withLibrary) assert.equal(find('lv2-load-state').textContent, '▶ En cours', 'live before Éco');
    s.p.window.cncProfile.setPerformance('eco'); s.p.frame(); s.p.frame();
    assert(!s.p.api.gate()); assert(s.p.api.state().layout, 'layout held during the job');
    if (withLibrary) {
      assert(!s.content.hidden, 'the band keeps its rectangle');
      assert.equal(find('lv2-load-name').textContent, 'non suivi'); assert.equal(find('lv2-load-state').textContent, '');
      ['version', 'dims', 'tool', 'print'].forEach(r => assert.equal(find('lv2-' + r + '-load').textContent, '—', r));
      assert.match(find('lv2-match').textContent, /non suivi/); assert.equal(find('lv2-match').getAttribute('data-tone'), 'neutral');
      assert.doesNotMatch(s.content.querySelectorAll('*').map(e => e.textContent).join(' '), /En cours|même empreinte/);
    }
    const batch = () => { s.p.frame(); s.p.status(run); return s.p.frames.size; };
    counts.push(batch(), batch());
    held.push(counts);
  }
  assert.deepEqual(held[1], held[0], 'Éco during a job: no frame beyond the L0 baseline after the invalidation ' + JSON.stringify(held));
  console.log('PASS v2 files frames: no animation frame after the v2 gate closes, while hidden or after pagehide; pending frame cancelled; same as the L0 baseline.');
})().catch(e => { console.error(e); process.exitCode = 1; });
