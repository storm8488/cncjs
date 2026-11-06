'use strict';
// cncDashboardView.loadedPreview() (job-dashboard.js): a sidecar read left pending by its consumer is
// aborted and forgotten when a job starts, when Éco is chosen or the v2 gate closes, and on pagehide;
// a late answer is never resolved after that, and no new read starts during a job. Synthetic window.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const source = fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8');

function fixture() {
  const lists = {}, requests = [], dom = require('./dom-fixture.cjs').createDOM(['menu']);
  let profile = 'performance', gate = true;
  const win = {
    addEventListener(n, f) { (lists[n] || (lists[n] = [])).push(f); },
    cncProfile: {kind: () => 'cnc', performance: () => profile},
    cncV2: {gate: () => gate, state: () => ({layout: true, sessionEnabled: true, open: gate, holdLayout: false})}
  };
  function XHR() {
    this.open = (m, p) => { assert.equal(m, 'POST'); assert.equal(p, '/api/watch/file'); };
    this.setRequestHeader = () => {}; this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
    this.send = (body) => requests.push({xhr: this, file: JSON.parse(body).file});
  }
  vm.runInNewContext(source, {window: win, document: dom.document, Date, Promise, XMLHttpRequest: XHR,
    localStorage: {getItem: () => JSON.stringify({state: {session: {token: 'fake'}}})}});
  const emit = (n, detail) => (lists[n] || []).slice().forEach((f) => f({type: n, detail}));
  const status = (patch) => emit('cnc-job-status', {machine: Object.assign({port: 'P', name: 'piece.nc', revision: 1, fresh: true, workflow: 'idle', activeState: 'Idle'}, patch), simulation: false});
  const answer = (xhr) => { xhr.status = 200; xhr.responseText = JSON.stringify({preview: {stale: false}, data: JSON.stringify({file: 'piece.nc', fingerprint: 'f1',
    preview: {image: 'data:image/png;base64,AAAA', lines: 40, path3d: {version: 1}}})}); xhr.onload(); };
  return {view: win.cncDashboardView, requests, emit, status, answer, setProfile(p) { profile = p; }, closeGate() { gate = false; }};
}

(async () => {
  const transitions = {
    'job starts': (f) => f.status({workflow: 'running', activeState: 'Run'}),
    'Éco chosen': (f) => { f.setProfile('eco'); f.emit('cnc-profile-change', {performance: 'eco'}); },
    'v2 gate closes': (f) => { f.closeGate(); f.emit('cnc-v2-change', {open: false}); },
    'pagehide': (f) => f.emit('pagehide', {persisted: false})
  };
  for (const [name, transition] of Object.entries(transitions)) {
    const f = fixture(); f.status();
    const pending = f.view.loadedPreview();
    assert.equal(f.requests.length, 1, name + ': one read in flight'); const xhr = f.requests[0].xhr;
    transition(f);
    assert.equal(xhr.aborted, true, name + ': the pending read is aborted');
    assert.notEqual(typeof xhr.onload, 'function', name + ': no handler left for a late answer');
    assert.equal(await pending, null, name + ': the consumer gets null');
    // A late valid answer (if a browser delivered it anyway) cannot be returned or cached.
    if (typeof xhr.onload === 'function') f.answer(xhr);
    if (name === 'job starts') {
      const again = await f.view.loadedPreview();
      assert.equal(again, null, 'no new sidecar read during a job'); assert.equal(f.requests.length, 1);
    }
  }
  // Unchanged at rest: the read completes and is kept for the same program.
  const f = fixture(); f.status(); const p = f.view.loadedPreview(); f.answer(f.requests[0].xhr);
  const meta = await p; assert(meta && meta.path3d, 'at rest the preview is returned');
  assert.equal(await f.view.loadedPreview(), meta); assert.equal(f.requests.length, 1);
  // The program changes while a read is pending: aborted too.
  const g = fixture(); g.status(); const q = g.view.loadedPreview(); g.status({name: 'other.nc', revision: 2});
  assert.equal(g.requests[0].xhr.aborted, true); assert.equal(await q, null);
  console.log('PASS loadedPreview: pending sidecar read aborted and forgotten on job start, Éco, v2 gate closing, pagehide and program change; no late answer, no read during a job; unchanged at rest.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
