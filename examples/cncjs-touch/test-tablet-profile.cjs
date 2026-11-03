'use strict';
// Tablet profiles (PROFILES-CONTRACT.md §1, §5): the performance profile of this browser and the
// machine kind sent by the server. tablet-profile.js in a VM: four combinations, two browsers
// with their own storage, absent / corrupt / blocked storage (eco, never rewritten), no reload,
// no request and no command on a change, eco refusing loadAdvanced, scripts injected once, body
// classes and cnc-profile-change. Then the two Réglages rows (display-settings.js): scope texts,
// machine kind disabled with the server's reason, confirmation naming the machine and the
// pilot, the change sent only through cncJobControls.setMachineKind, the « non confirmé »
// prompt, and the performance buttons. Then the job POST of set-kind and of the laser framing
// (job-controls.js on its offline fixture), and the CNC / laser gating of the procedures
// (job-resume.js, job-preparation.js, commissioning.js, status-strip.js). No network.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm'), path = require('path');
const read = (name) => fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8');
const KEY = 'cncjs-touch-performance-v1';
const flush = () => new Promise(setImmediate);

function memory(initial) {
  const values = new Map(initial || []);
  return { values, writes: 0, failRead: false, failWrite: false,
    getItem(k) { if (this.failRead) throw Error('denied'); return values.has(k) ? values.get(k) : null; },
    setItem(k, v) { this.writes++; if (this.failWrite) throw Error('quota'); values.set(k, String(v)); },
    removeItem(k) { values.delete(k); } };
}
// One browser page: window, document.body classes, a head receiving injected scripts, spies.
function page(storage, extra) {
  const listeners = {}, events = [], classes = new Set(), scripts = [], spies = { reload: 0, xhr: 0, fetch: 0 };
  const head = { appendChild(s) { s.parentNode = head; scripts.push(s); }, removeChild(s) { s.parentNode = null; } };
  const body = { classList: { toggle(n, on) { if (on) classes.add(n); else classes.delete(n); }, contains: (n) => classes.has(n) } };
  const document = { body, head, createElement: (tag) => ({ tagName: String(tag).toUpperCase() }), addEventListener() {} };
  const window = Object.assign({ localStorage: storage, location: { reload() { spies.reload++; } },
    XMLHttpRequest: function () { spies.xhr++; }, fetch() { spies.fetch++; return Promise.reject(Error('no network')); },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); },
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach((f) => f(e)); } }, extra || {});
  const CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  const context = { window, document, CustomEvent, Promise, JSON };
  vm.runInNewContext(read('tablet-profile.js'), context);
  const status = (machine) => window.dispatchEvent(new CustomEvent('cnc-job-status', { detail: { machine, simulation: false } }));
  return { window, document, classes, events, scripts, spies, status, profile: window.cncProfile, changes: () => events.filter((e) => e.type === 'cnc-profile-change') };
}
const capability = (supported, reason, code) => ({ supported, reason: reason || '', code: code || '' });
function profileOf(kind, extra) {
  return Object.assign({ version: 1, id: kind ? 'm-0123456789ab' : null, label: kind === 'laser' ? 'Laser atelier' : kind === 'cnc' ? 'Fraiseuse' : '', kind, match: kind ? 'signature' : 'none',
    signature: 'abcdef0123456789', portHint: '/dev/ttyUSB0', laser: { mode: kind === 'laser' ? 1 : 0, sMax: 1000, sMin: 0 }, coherent: true, issues: [], canChange: true, changeReason: '',
    capabilities: kind === 'laser'
      ? { spindleTest: capability(false, 'Pas de test de broche pour un laser.', 'ETOUCH_LASER_NO_SPINDLE_TEST'), plateProbe: capability(false, 'Refusé'), toolChange: capability(false, 'Refusé'), resume: capability(false, 'Refusé'), laserResume: capability(true), laserFrame: capability(true), focus: capability(true) }
      : { spindleTest: capability(true), plateProbe: capability(true), toolChange: capability(true), resume: capability(true), laserResume: capability(false, 'Machine CNC.'), laserFrame: capability(false, 'Machine CNC.'), focus: capability(false, 'Machine CNC.') } }, extra || {});
}
const machine = (kind, extra) => Object.assign({ port: '/dev/ttyUSB0', generation: 'g1', fresh: true, workflow: 'idle', activeState: 'Idle', machineProfile: kind === undefined ? undefined : profileOf(kind) }, extra || {});

// ---- 1. Absent storage: eco, nothing written; machine unknown until the server says.
{
  const s = memory(), p = page(s);
  assert.equal(p.profile.performance(), 'eco'); assert.equal(p.profile.storage(), 'absent'); assert.equal(s.writes, 0);
  assert.equal(p.profile.kind(), null); assert.equal(p.profile.machine(), null);
  assert(p.classes.has('perf-eco') && p.classes.has('machine-unknown') && !p.classes.has('perf-performance'));
  assert.equal(p.profile.capability('laserFrame').supported, false); assert.match(p.profile.capability('laserFrame').reason, /non transmis/);
}
// ---- 2. Corrupt, unknown, other versions, blocked reads: eco, the stored value left as it is.
for (const raw of ['{', 'null', '[]', '"performance"', JSON.stringify({ version: 2, profile: 'performance' }), JSON.stringify({ version: 1, profile: 'turbo' }), JSON.stringify({ profile: 'performance' })]) {
  const s = memory([[KEY, raw], ['cncjs-touch-display-v1', '{"size":"large"}']]), p = page(s);
  assert.equal(p.profile.performance(), 'eco', raw); assert(['invalid', 'unreadable'].includes(p.profile.storage()), raw);
  assert.equal(s.values.get(KEY), raw, 'never rewritten silently'); assert.equal(s.writes, 0);
  assert.equal(s.values.get('cncjs-touch-display-v1'), '{"size":"large"}', 'other keys untouched');
}
{
  const s = memory([[KEY, JSON.stringify({ version: 1, profile: 'performance' })]]); s.failRead = true;
  const p = page(s); assert.equal(p.profile.performance(), 'eco'); assert.equal(p.profile.storage(), 'unreadable');
}
// ---- 3. Four combinations: performance × machine kind, classes, events, capabilities.
for (const perf of ['eco', 'performance']) {
  for (const kind of ['cnc', 'laser']) {
    const s = memory(), p = page(s);
    if (perf === 'performance') { const r = p.profile.setPerformance('performance'); assert(r.ok && r.persisted); }
    p.status(machine(kind));
    assert.equal(p.profile.performance(), perf); assert.equal(p.profile.kind(), kind); assert.equal(p.profile.machine().label, kind === 'laser' ? 'Laser atelier' : 'Fraiseuse');
    assert.equal(p.classes.has('perf-eco'), perf === 'eco'); assert.equal(p.classes.has('perf-performance'), perf === 'performance');
    assert.equal(p.classes.has('machine-cnc'), kind === 'cnc'); assert.equal(p.classes.has('machine-laser'), kind === 'laser'); assert(!p.classes.has('machine-unknown'));
    assert.equal(p.profile.capability('laserFrame').supported, kind === 'laser');
    assert.equal(p.profile.capability('spindleTest').supported, kind === 'cnc');
    if (kind === 'laser') assert.equal(p.profile.capability('spindleTest').code, 'ETOUCH_LASER_NO_SPINDLE_TEST');
    assert.equal(p.profile.capability('nothing').supported, false);
    const last = p.changes().at(-1).detail;
    assert.equal(last.kind, kind); assert.equal(last.performance, perf); assert.equal(last.previous.kind, null); assert.equal(last.machine.kind, kind);
    assert.equal(p.spies.reload + p.spies.xhr + p.spies.fetch, 0);
  }
}
// ---- 4. The server's profile: an identical snapshot fires nothing; a state lost keeps the last
// profile; a machine without a profile (older server) clears it; an unknown kind is « unknown ».
{
  const p = page(memory());
  p.status(machine('laser')); const n = p.changes().length;
  p.status(machine('laser', { statusAgeMs: 250 })); assert.equal(p.changes().length, n, 'same profile, no event');
  p.status(null); assert.equal(p.profile.kind(), 'laser', 'machine lost: last profile kept');
  p.status(machine('cnc')); assert.equal(p.changes().at(-1).detail.previous.kind, 'laser'); assert(p.classes.has('machine-cnc'));
  p.status(machine(null)); assert.equal(p.profile.kind(), null); assert(p.classes.has('machine-unknown'));
  p.status(machine(undefined)); assert.equal(p.profile.machine(), null); assert(p.classes.has('machine-unknown'));
  const weird = machine('cnc'); weird.machineProfile.kind = 'plasma'; p.status(weird); assert.equal(p.profile.kind(), null, 'unknown kinds read as unknown');
}
// ---- 5. Two browsers, two storages: each keeps its own profile; a reload reads it back.
{
  const a = memory(), b = memory();
  const tabletA = page(a), tabletB = page(b);
  const r = tabletA.profile.setPerformance('performance');
  assert(r.ok && r.persisted); assert.match(r.message, /ce navigateur uniquement/);
  assert.deepEqual(JSON.parse(a.values.get(KEY)), { version: 1, profile: 'performance' });
  assert.equal(b.values.has(KEY), false); assert.equal(tabletB.profile.performance(), 'eco');
  assert.equal(page(a).profile.performance(), 'performance', 'read back after a reload');
  assert.equal(page(b).profile.performance(), 'eco');
  tabletB.profile.setPerformance('performance'); tabletA.profile.setPerformance('eco');
  assert.equal(page(a).profile.performance(), 'eco'); assert.equal(page(b).profile.performance(), 'performance');
  // Unknown values are refused and change nothing.
  const before = a.values.get(KEY), bad = tabletA.profile.setPerformance('turbo');
  assert.equal(bad.ok, false); assert.equal(a.values.get(KEY), before); assert.equal(tabletA.profile.performance(), 'eco');
  // No reload, no request, no command, no machine event on any change.
  for (const t of [tabletA, tabletB]) { assert.equal(t.spies.reload + t.spies.xhr + t.spies.fetch, 0); assert(!t.events.some((e) => e.type !== 'cnc-profile-change' && e.type !== 'cnc-job-status')); }
  // Same value again: no event.
  const n = tabletA.changes().length; tabletA.profile.setPerformance('eco'); assert.equal(tabletA.changes().length, n);
}
// ---- 6. A storage that refuses writes: applied to this page, said so, still one event.
{
  const s = memory(); s.failWrite = true; const p = page(s);
  const r = p.profile.setPerformance('performance');
  assert(r.ok); assert.equal(r.persisted, false); assert.match(r.message, /mémorisation indisponible/);
  assert.equal(p.profile.performance(), 'performance'); assert(p.classes.has('perf-performance'));
  assert.equal(p.changes().length, 1); assert.deepEqual(JSON.parse(JSON.stringify(p.changes()[0].detail.previous)), { performance: 'eco', kind: null });
}
// ---- 7. loadAdvanced: refused in eco; in performance each script injected once, retried after a failure.
(async () => {
  const p = page(memory());
  await assert.rejects(p.profile.loadAdvanced(['preview-gl.js']), /Éco/); assert.equal(p.scripts.length, 0);
  p.profile.setPerformance('performance');
  await assert.rejects(p.profile.loadAdvanced(['../app.js']), /invalide/);
  await assert.rejects(p.profile.loadAdvanced(['https://x/y.js']), /invalide/); assert.equal(p.scripts.length, 0);
  const first = p.profile.loadAdvanced(['preview-gl.js']), again = p.profile.loadAdvanced('preview-gl.js');
  assert.equal(p.scripts.length, 1); assert.equal(p.scripts[0].src, 'preview-gl.js');
  p.scripts[0].onload(); assert.deepEqual(await first, ['preview-gl.js']); assert.deepEqual(await again, ['preview-gl.js']);
  await p.profile.loadAdvanced(['preview-gl.js']); assert.equal(p.scripts.length, 1, 'injected once');
  const failing = p.profile.loadAdvanced(['motion-extra.js']); p.scripts[1].onerror();
  await assert.rejects(failing, /introuvable/);
  p.profile.loadAdvanced(['motion-extra.js']); assert.equal(p.scripts.length, 3, 'a failed module may be loaded again');
  // Back to eco: new loads refused at once.
  p.profile.setPerformance('eco'); await assert.rejects(p.profile.loadAdvanced(['other.js']), /Éco/);
  assert.equal(p.spies.reload + p.spies.xhr + p.spies.fetch, 0);

  settingsRows();
  await jobPosts();
  await gating();
  console.log('PASS tablet profile: eco by default, absent/corrupt/blocked storage kept and read as eco, four combinations, two independent browsers, no reload/request/command on change, eco refuses loadAdvanced, scripts injected once, body classes and events; Réglages rows (scope, server reason, confirmation naming machine and pilot, set-kind through the job path, unknown kind prompt); set-kind and framing posts; CNC/laser gating of resume, plate, framing, preparation, commissioning and strip.');
})().catch((e) => { console.error(e); process.exit(1); });

// ---- 8. Réglages rows (display-settings.js on the DOM fixture).
function settingsRows() {
  const { createDOM } = require('./dom-fixture.cjs');
  const dom = createDOM(['settings']), listeners = {}, classes = new Set(), calls = [], spies = { reload: 0, xhr: 0 };
  dom.document.body.classList.toggle = (n, on) => (on ? classes.add(n) : classes.delete(n));
  dom.document.documentElement = {}; dom.node('screen-home').querySelector = () => null;
  const sizes = ['standard', 'large'].map((v) => { const b = dom.element('button'); b.setAttribute('data-display-size', v); return b; });
  dom.node('screen-settings').querySelectorAll = () => sizes;
  const kinds = ['cnc', 'laser'].map((v) => { const b = dom.element('button'); b.setAttribute('data-machine-kind', v); return b; });
  const perfs = ['eco', 'performance'].map((v) => { const b = dom.element('button'); b.setAttribute('data-performance', v); return b; });
  dom.node('ks-machine-kind-card').querySelectorAll = () => kinds; dom.node('ks-performance-card').querySelectorAll = () => perfs;
  dom.node('profile-machine-confirm').hidden = true; dom.node('profile-machine-unconfirmed').hidden = true;
  let answer = Promise.resolve({ message: 'ok' });
  const window = { innerWidth: 1366, innerHeight: 768, location: { reload() { spies.reload++; } }, XMLHttpRequest: function () { spies.xhr++; },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, dispatchEvent(e) { (listeners[e.type] || []).slice().forEach((f) => f(e)); },
    cncScreenSaver: { configure() {}, status: () => ({ blocked: false, reason: '' }), preview: () => true },
    cncJobControls: { clientId: () => 't-abc-1a2b3c4d', pilot: () => ({ value: 'Cet appareil' }), setMachineKind(kind, label) { calls.push([kind, label]); return answer; }, forgetMachine() { calls.push(['forget']); return answer; } } };
  const storage = memory();
  const context = { window, document: dom.document, localStorage: storage, Promise, JSON, Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } };
  window.localStorage = storage;
  vm.runInNewContext(read('tablet-profile.js'), context);
  vm.runInNewContext(read('display-settings.js'), context);
  const send = (m, pilot) => window.dispatchEvent(new context.CustomEvent('cnc-job-status', { detail: { machine: m, simulation: false, pilot: pilot || { value: 'Cet appareil', state: 'mine' } } }));
  const n = dom.node;
  // Scopes are written in the rows themselves.
  const html = read('display-settings.js');
  assert.match(html, /Performances de cette tablette <span class="ks-scope" data-scope="tablet">Cette tablette/);
  assert.match(html, /Type de machine <span class="ks-scope" data-scope="server">Serveur CNCjs/);
  assert.match(html, /ne concerne que ce navigateur/);
  // No machine: both kinds disabled, with a reason.
  kinds.forEach((b) => { assert.equal(b.disabled, true); assert.match(b.getAttribute('title'), /Aucune machine connectée/); });
  // Unknown kind: the CNC interface stays, the prompt is visible.
  send(machine(null));
  assert.equal(n('profile-machine-forget').hidden, true, 'nothing to forget without a record');
  assert.equal(n('profile-machine-unconfirmed').hidden, false); assert.match(n('profile-machine-unconfirmed').textContent, /Type de machine non confirmé/);
  assert.match(n('profile-machine-target').textContent, /\/dev\/ttyUSB0/); assert.match(n('profile-machine-target').textContent, /pas encore associée/);
  // Not allowed now: disabled with the server's reason; a tap says it.
  const busy = machine('cnc'); busy.machineProfile.canChange = false; busy.machineProfile.changeReason = 'Machine en mouvement : changement refusé.';
  send(busy);
  kinds.forEach((b) => { assert.equal(b.disabled, true); assert.equal(b.getAttribute('title'), 'Machine en mouvement : changement refusé.'); });
  assert.equal(kinds[0].getAttribute('aria-pressed'), 'true'); assert.equal(n('profile-machine-unconfirmed').hidden, true);
  kinds[1].handlers.click.call(kinds[1]); assert.equal(n('profile-machine-status').textContent, 'Machine en mouvement : changement refusé.'); assert.equal(calls.length, 0);
  // Allowed: a confirmation names the machine, the port, this device and the pilot; Annuler sends nothing.
  send(machine('cnc'), { value: 'Tablette 3c4d', state: 'mine' });
  kinds[1].click();
  assert.equal(n('profile-machine-confirm').hidden, false);
  const text = n('profile-machine-confirm-text').textContent;
  assert.match(text, /« Laser » pour la machine « Fraiseuse » \(\/dev\/ttyUSB0\)/); assert.match(text, /cet appareil \(3c4d\)/); assert.match(text, /pilote actuel : Tablette 3c4d/); assert.match(text, /Aucune commande/);
  assert.equal(n('profile-machine-label').value, 'Fraiseuse');
  n('profile-machine-cancel').click(); assert.equal(n('profile-machine-confirm').hidden, true); assert.equal(calls.length, 0);
  // Confirmed: one call to setMachineKind with the kind and the label typed.
  kinds[1].click(); n('profile-machine-label').value = '  Laser atelier  '; n('profile-machine-apply').click();
  assert.deepEqual(calls, [['laser', 'Laser atelier']]); assert.match(n('profile-machine-status').textContent, /Demande envoyée/);
  kinds.forEach((b) => assert.equal(b.disabled, true, 'no second request while one is on its way'));
  // An empty name is refused before any request.
  return flush().then(() => {
    assert.match(n('profile-machine-status').textContent, /Type enregistré par le serveur CNCjs : Laser · « Laser atelier »/);
    kinds[0].click(); n('profile-machine-label').value = '   '; n('profile-machine-apply').click(); assert.equal(calls.length, 1); assert.match(n('profile-machine-status').textContent, /Indiquez un nom/);
    // A refusal from the server is shown as it comes.
    answer = Promise.reject(new Error('Refusé : pilotage attribué à « PC atelier ».'));
    n('profile-machine-label').value = 'Fraiseuse'; n('profile-machine-apply').click(); assert.equal(calls.length, 2);
    return flush();
  }).then(() => {
    assert.match(n('profile-machine-status').textContent, /pilotage attribué/);
    // Forget: shown for a known record, confirmed like a kind change, no label asked, one call.
    answer = Promise.resolve({ message: 'ok' });
    send(machine('cnc'), { value: 'Tablette 3c4d', state: 'mine' });
    assert.equal(n('profile-machine-forget').hidden, false); assert.equal(n('profile-machine-forget').disabled, false);
    n('profile-machine-forget').click();
    assert.match(n('profile-machine-confirm-text').textContent, /Oublier la fiche de la machine « Fraiseuse » \(\/dev\/ttyUSB0\)/); assert.match(n('profile-machine-confirm-text').textContent, /Aucune commande/);
    assert.equal(n('profile-machine-label').hidden, true); assert.equal(calls.length, 2);
    n('profile-machine-apply').click(); assert.deepEqual(calls.at(-1), ['forget']); assert.equal(calls.length, 3);
    return flush();
  }).then(() => {
    assert.match(n('profile-machine-status').textContent, /Fiche machine oubliée/);
    n('profile-machine-label').hidden = false; calls.length = 2;
    // Performance: applied and saved here, no reload, no request, no machine call.
    assert.equal(perfs[0].getAttribute('aria-pressed'), 'true');
    perfs[1].click();
    assert.equal(perfs[1].getAttribute('aria-pressed'), 'true'); assert(classes.has('perf-performance'));
    assert.deepEqual(JSON.parse(storage.values.get(KEY)), { version: 1, profile: 'performance' });
    assert.match(n('profile-performance-status').textContent, /ce navigateur uniquement/);
    assert.equal(calls.length, 2); assert.equal(spies.reload + spies.xhr, 0);
  });
}

// ---- 9. set-kind and laser framing go through the job POST path (pilot, generation, stream).
async function jobPosts() {
  const { load } = require('./job-controls-fixture.cjs');
  const f = load(); await f.connect(f.machine({ machineProfile: profileOf('laser') }));
  const c = f.controls();
  assert.match(c.targetText(), /Machine : « Laser atelier » \(Laser\)/);
  const before = f.posts().length;
  c.setMachineKind('cnc', 'Fraiseuse');
  const post = f.posts().at(-1); assert.equal(f.posts().length, before + 1);
  assert.equal(post.body.action, 'machine'); assert.equal(post.body.operation, 'set-kind'); assert.equal(post.body.kind, 'cnc'); assert.equal(post.body.label, 'Fraiseuse');
  assert.equal(post.body.port, 'COM3'); assert.equal(post.body.generation, 'gen-1'); assert.equal(post.body.transportId, 'stream-one');
  f.answer(post, { message: 'Type enregistré.' }); await f.flush();
  await assert.rejects(c.setMachineKind('plasma', 'x'), /inconnu/);
  c.forgetMachine();
  const forget = f.posts().at(-1); assert.deepEqual([forget.body.action, forget.body.operation, forget.body.port, forget.body.generation], ['machine', 'forget', 'COM3', 'gen-1']);
  f.answer(forget, { message: 'Fiche oubliée.' }); await f.flush();
  // Framing: frame-prepare, then the usual confirmation naming the machine and the pilot, then frame with the nonce.
  assert.equal(c.prepareFrame(), true);
  const prep = f.posts().at(-1); assert.deepEqual([prep.body.action, prep.body.operation], ['machine', 'frame-prepare']);
  f.answer(prep, { nonce: 'n-frame', expiresIn: 15, name: 'part.nc' }); await f.flush();
  assert.equal(f.el('job-dialog').hidden, false);
  assert.match(f.el('job-dialog-title').textContent, /Cadrer le programme/);
  assert.match(f.el('job-dialog-file').textContent, /Machine : « Laser atelier » \(Laser\) · Pilote :/);
  assert.match(f.el('job-warning').textContent, /laser éteint/);
  f.el('job-check').checked = true; f.el('job-check').fire('change'); f.el('job-confirm').click();
  const frame = f.posts().at(-1); assert.deepEqual([frame.body.action, frame.body.operation, frame.body.nonce], ['machine', 'frame', 'n-frame']);
  f.answer(frame, { message: 'Cadrage lancé.' }); await f.flush();
  // A CNC profile (or framing refused by the server): nothing is prepared.
  const g = load(); await g.connect(g.machine({ machineProfile: profileOf('cnc') }));
  const n = g.posts().length; assert.equal(g.controls().prepareFrame(), false); assert.equal(g.posts().length, n);
  // No profile at all (older server): the dialog still names the target as unconfirmed.
  assert.match(load().controls().targetText(), /sans nom \(type non confirmé\)/);
}

// ---- 10. CNC / laser gating of the existing procedures (UI only; the server enforces).
async function gating() {
  const R = require('./touch/job-resume.js');
  const laser = machine('laser'), cnc = machine('cnc');
  const m6 = { kind: 'M6', tool: 2, restartSpindle: { mode: 'M3', speed: 12000 } };
  assert.match(R.pauseText(m6, laser), /pas géré pour un laser/); assert.match(R.pauseText(m6, cnc), /^Changement d’outil T2/);
  assert.equal(R.dialogNote('resume', Object.assign({ programPause: m6 }, laser)), '');
  assert.match(R.dialogNote('start', Object.assign({ resume: { from: 40, total: 90, line: 'G1 X5 S800' } }, laser)), /^Reprise laser à la ligne 40 \/ 90 : G1 X5 S800\. Laser éteint \(M5\).*consigne S/);
  assert.match(R.dialogNote('start', Object.assign({ resume: { from: 40, total: 90, line: 'G1 X5' } }, cnc)), /plonge/);
  const lp = R.planText({ from: 40, total: 90, line: 'G0 X10 Y5', kind: 'laser', preview: { version: 1, kind: 'laser', preamble: ['M5', 'G21', 'G90', 'G0 X10 Y5'] } });
  assert.match(lp, /Début de passe : laser éteint/); assert.match(lp, /M5 · G21 · G90 · G0 X10 Y5/); assert(!/puissance/i.test(lp)); assert(!/plongée/.test(lp));
  // Suivi DOM: the plate is hidden, framing offered with the server's reason, the resume renamed.
  const { createDOM } = require('./dom-fixture.cjs');
  const { document, node, element } = createDOM(['home']);
  const parent = element('div', 'home-actions'); parent.appendChild(node('home-job-ready')); document.body.getAttribute = () => null;
  const listeners = {}, calls = [];
  const window = { cncLibrarySelection: { file: 'a.nc', name: 'a.nc' }, addEventListener: (n, f) => (listeners[n] = listeners[n] || []).push(f),
    cncJobControls: { prepareFrame: () => { calls.push('frame'); return true; }, prepareCommand: (op) => calls.push(op), resumePlan: () => Promise.resolve({}), loadFrom: () => Promise.resolve({}), spindleStop: () => Promise.resolve({}) } };
  vm.runInNewContext(read('job-resume.js'), { window, document, localStorage: { getItem: () => null, setItem() {} } });
  const byId = (id) => parent.querySelectorAll('*').find((c) => c.id === id);
  const status = (m) => listeners['cnc-job-status'].forEach((fn) => fn({ detail: { machine: m, simulation: false } }));
  const idle = { canLoad: true, canZeroZ: true, programPause: null };
  status(Object.assign({}, cnc, idle));
  assert.equal(byId('home-plate').hidden, false); assert.equal(byId('home-frame').hidden, true); assert.equal(byId('home-resume-line').textContent, 'Reprendre à une ligne…');
  const refused = machine('laser', idle); refused.machineProfile.capabilities.laserFrame = capability(false, 'Programme non vérifié dans la course machine.'); refused.machineProfile.capabilities.laserResume = capability(false, 'Aucun début de passe identifiable.');
  status(refused);
  assert.equal(byId('home-plate').hidden, true, 'no plate Z zero for a laser'); assert.equal(byId('home-frame').hidden, false);
  assert.equal(byId('home-frame-start').disabled, true); assert.equal(byId('home-frame-start').title, 'Programme non vérifié dans la course machine.');
  assert.equal(byId('home-frame-why').textContent, 'Programme non vérifié dans la course machine.');
  assert.equal(byId('home-resume-line').textContent, 'Reprendre à un début de passe…'); assert.equal(byId('home-resume-line').disabled, true); assert.equal(byId('home-resume-line').title, 'Aucun début de passe identifiable.');
  byId('home-frame-start').click(); assert.deepEqual(calls, [], 'a disabled framing sends nothing');
  status(Object.assign({}, laser, idle));
  assert.equal(byId('home-frame-start').disabled, false); assert.equal(byId('home-resume-line').disabled, false);
  byId('home-frame-start').click(); assert.deepEqual(calls, ['frame']);
  status(Object.assign({}, laser, idle, { programPause: { kind: 'M6', tool: 1 }, canSpindleStop: true, spindleSpeed: 500 }));
  assert.match(byId('home-program-pause-text').textContent, /pas géré pour un laser/); assert.equal(byId('home-pause-m5').textContent, 'Éteindre le laser (M5)');
  // Préparer le travail: material and focus, no plate zero; CNC unchanged.
  const P = require('./touch/job-preparation.js');
  const stepsOf = (m) => P.assess({ machine: Object.assign({ name: 'p.nc', canStart: true, coordinates: { mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 } }, settings: { $22: 1 } }, m), selection: { file: 'p.nc', name: 'p.nc' }, ticks: {} });
  const ls = stepsOf(laser), cs = stepsOf(cnc);
  assert.equal(ls.laser, true); assert.equal(ls.steps[1].title, 'Matériau et mise au point'); assert.match(ls.steps[1].detail, /mise au point/); assert.match(ls.steps[1].next, /Aucune commande/);
  assert.match(ls.steps[2].next, /cadrage/); assert(!/plaque/.test(ls.steps[2].detail));
  assert.equal(cs.steps[1].title, 'Outil et matière'); assert.match(cs.steps[2].detail, /plaque/);
  const incoherent = machine('laser'); incoherent.machineProfile.coherent = false;
  assert.match(stepsOf(incoherent).steps[3].detail, /incohérents/);
  // Commissioning: the spindle step is a checklist without command; the test file never emits.
  const ctx = { window: {} }; vm.runInNewContext(read('commissioning.js'), ctx); const C = ctx.window.CNCCommissioning;
  assert.equal(C.result('spindle', { laser: true, checks: { goggles: true, enclosure: true, air: true } }), '');
  assert.equal(C.result('spindle', { laser: true, checks: { goggles: true, enclosure: true, air: true, focus: true } }), 'manual');
  const program = C.program(6000, true);
  assert(!/M3|M4/.test(program.replace(/\(.*\)/g, '')), 'no M3/M4 in the laser test file'); assert(/^M5/m.test(program)); assert(!/S[1-9]/.test(program.replace(/\(.*\)/g, '')));
  assert.match(C.program(6000, false), /M3 S6000/);
  // Strip: « consigne S » for a laser, never a measured power; the machine targeted, by name and kind.
  const strip = stripFixture();
  strip.render(machine('laser', { spindleSpeed: 800, fresh: true }));
  assert.equal(strip.text('t-spindle'), 'S 800'); assert.equal(strip.label('t-spindle'), 'Consigne S'); assert.equal(strip.text('t-machine'), 'Laser atelier · Laser');
  strip.render(machine('cnc', { spindleSpeed: 12000, fresh: true }));
  assert.match(strip.text('t-spindle'), /tr\/min/); assert.equal(strip.label('t-spindle'), 'Broche'); assert.equal(strip.text('t-machine'), 'Fraiseuse · CNC');
  strip.render(machine(null)); assert.equal(strip.text('t-machine'), 'sans nom · non confirmé');
  for (const name of ['status-strip.js', 'job-resume.js', 'job-preparation.js', 'commissioning.js', 'display-settings.js', 'job-controls.js']) assert(!/puissance mesurée/i.test(read(name)), name);
}
function stripFixture() {
  const nodes = {};
  function el(tag) { const n = { tagName: tag, children: [], attributes: {}, hidden: false, disabled: false, style: {}, textContent: '',
    appendChild(c) { c.parentNode = n; const prev = n.children.at(-1); if (prev) c.previousSibling = prev; n.children.push(c); return c; }, insertBefore(c) { return n.appendChild(c); },
    setAttribute(k, v) { n.attributes[k] = String(v); if (k === 'id') nodes[v] = n; }, getAttribute(k) { return k in n.attributes ? n.attributes[k] : null; },
    addEventListener() {}, querySelector: () => ({ setAttribute() {} }) };
    Object.defineProperty(n, 'id', { set(v) { nodes[v] = n; }, get() { return ''; } }); return n; }
  const banner = el('header'), body = el('body'); body.getAttribute = () => null;
  const document = { body, getElementById: (id) => (id === 'real-banner' ? banner : nodes[id] || null), createElement: el };
  const listeners = {};
  const window = { addEventListener: (n, f) => (listeners[n] = listeners[n] || []).push(f), removeEventListener() {} };
  vm.runInNewContext(read('status-strip.js'), { window, document, Date });
  return { render: (m) => window.cncStatusStrip.render({ machine: m, transportConnected: true }), text: (id) => nodes[id].textContent, label: (id) => nodes[id].previousSibling.textContent };
}
