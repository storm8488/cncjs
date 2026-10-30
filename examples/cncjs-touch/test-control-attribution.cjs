'use strict';
// Attribution of control (F5), client side: persistent clientId (regenerated when unreadable)
// sent with every POST and on the event stream; the strip always names who pilots (this
// device, another named one, free); an ECONTROL refusal names the owner and the next step;
// the takeover needs a reason in an accessible dialog and is never sent on its own; Pause and
// Stop stay usable whoever owns the port. No network: every request is a recorded fake.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { load } = require('./job-controls-fixture.cjs');
const other = { kind: 'touch', id: 't-other-1234abcd', label: 'Tablette B', user: 'ana', since: 1, present: true, expires: null };
(async () => {
  // 1. A first visit stores a new id; the next page load reuses it; every POST and the stream carry it.
  const storage = new Map([['cnc', JSON.stringify({ state: { session: { token: 'offline-fixture' } } })]]);
  let f = load({ storage });
  const id = storage.get('cnc-touch-client-id');
  assert.match(id, /^t-[a-z0-9]+-[a-z0-9]{4,}$/, 'a persistent id is stored');
  assert.equal(f.controls().clientId(), id);
  await f.connect();
  assert(f.requests.find((r) => f.isStream(r.url)).url.endsWith('/touch-events?clientId=' + encodeURIComponent(id)), 'the stream carries the id (presence)');
  f.window.dispatchEvent({ type: 'cnc-library-select', detail: { file: 'part.nc', name: 'part.nc' } });
  f.el('job-load').click();
  const load1 = f.posts().at(-1);
  assert.equal(load1.body.action, 'load'); assert.equal(load1.body.clientId, id); assert.match(load1.body.clientLabel, /^Tablette [a-z0-9]{4}$/);
  f.answer(load1, { message: 'Chargé' }); await f.flush();
  f.controls().dispose();
  const again = load({ storage }); assert.equal(again.controls().clientId(), id, 'reload keeps the same id'); again.controls().dispose();
  // A PC (no touch points) names itself "Poste": the other devices see which one pilots.
  const desk = load({ storage: new Map(storage), touchPoints: 0 }); await desk.connect();
  desk.window.dispatchEvent({ type: 'cnc-library-select', detail: { file: 'part.nc', name: 'part.nc' } }); desk.el('job-load').click();
  assert.match(desk.posts().at(-1).body.clientLabel, /^Poste [a-z0-9]{4}$/); desk.controls().dispose();

  // 2. Unreadable id: a malformed stored value is replaced; a storage that throws gives a page-long id.
  for (const bad of ['{"not":"an id"}', 't-', 'x'.repeat(500), '<script>']) {
    const s = new Map(storage); s.set('cnc-touch-client-id', bad);
    const g = load({ storage: s }); const fresh = g.controls().clientId();
    assert.notEqual(fresh, bad); assert.match(fresh, /^t-[a-z0-9]+-[a-z0-9]{4,}$/); assert.equal(s.get('cnc-touch-client-id'), fresh, 'the replacement is stored');
    g.controls().dispose();
  }
  {
    const throwing = { getItem: (k) => { if (k === 'cnc') return JSON.stringify({ state: { session: { token: 'x' } } }); throw Error('SecurityError'); }, setItem: () => { throw Error('QuotaExceeded'); } };
    const g = load({ localStorage: throwing }); assert.match(g.controls().clientId(), /^t-[a-z0-9]+-[a-z0-9]{4,}$/, 'storage failures never break the page'); g.controls().dispose();
  }

  // 3. Two owners: free, this device, another named one (present, then away), shown in the status detail.
  f = load({ storage }); await f.connect(f.machine());
  assert.equal(f.controls().pilot().state, 'free'); assert.equal(f.lastStatus().pilot.value, 'Libre');
  f.push([f.machine({ control: { owner: { kind: 'touch', id, label: 'Tablette ' + id.slice(-4), present: true }, lastChange: { type: 'claim' } } })]);
  assert.equal(f.controls().pilot().state, 'mine'); assert.equal(f.lastStatus().pilot.value, 'Cet appareil');
  const mine = f.lastStatus().pilot;
  f.push([f.machine({ control: { owner: other, lastChange: null } })]);
  let p = f.lastStatus().pilot; assert.equal(p.state, 'other'); assert.equal(p.value, 'Tablette B'); assert.match(p.sentence, /Piloté par « Tablette B »/); assert.match(p.sentence, /Pause et Arrêter restent possibles/);
  const otherDetail = p;
  f.push([f.machine({ control: { owner: Object.assign({}, other, { present: false, expires: 1700000060000 }), lastChange: null } })]);
  p = f.lastStatus().pilot; assert.equal(p.value, 'Tablette B (absent)'); assert.match(p.sentence, /absent : libéré vers/);
  // A socket client (classic CNCjs) as owner is named too; a same id of another kind is not "this device".
  f.push([f.machine({ control: { owner: { kind: 'socket', id, label: 'interface CNCjs', present: true }, lastChange: null } })]);
  assert.equal(f.controls().pilot().state, 'other', 'kind and id together identify this device');

  // 4. Pause and Stop stay usable while another device pilots; nothing on the client blocks them.
  f.push([f.machine({ workflow: 'running', activeState: 'Run', canStart: false, canLoad: false, canPause: true, canStop: true, control: { owner: other, lastChange: null } })]);
  assert.equal(f.el('job-pause').disabled, false); assert.equal(f.el('job-stop').disabled, false);
  f.el('job-pause').click(); assert.equal(f.posts().at(-1).body.action, 'pause'); f.answer(f.posts().at(-1), { message: 'Pause' }); await f.flush();
  f.el('job-stop').click(); assert.equal(f.posts().at(-1).body.action, 'stop'); f.answer(f.posts().at(-1), { message: 'Arrêt' }); await f.flush();

  // 5. ECONTROL refusal: the owner's name and the next step, no takeover sent.
  f.push([f.machine({ control: { owner: other, lastChange: null } })]);
  f.window.dispatchEvent({ type: 'cnc-library-select', detail: { file: 'part.nc', name: 'part.nc' } });
  f.el('job-load').click(); const refused = f.posts().at(-1);
  f.answer(refused, { message: 'Pilotage de COM3 attribué à « Tablette B » (tablette, ana) : …', code: 'ECONTROL', owner: other }, 409); await f.flush();
  assert.match(f.el('job-feedback').textContent, /^Refusé : pilotage attribué à « Tablette B »/);
  assert.match(f.el('job-feedback').textContent, /touchez Pilote dans le bandeau et prenez le pilotage avec un motif/);
  assert.equal(f.el('job-feedback').getAttribute('data-state'), 'failed');
  assert(!f.posts().some((r) => r.body.action === 'control'), 'a refusal never takes over by itself');
  // Any other 409 keeps the server message as it is.
  f.el('job-load').click(); f.answer(f.posts().at(-1), { message: 'Machine occupée.' }, 409); await f.flush();
  assert.equal(f.el('job-feedback').textContent, 'Machine occupée.');

  // 6. Takeover dialog: opened by a tap (from the strip chip), focus on the reason, background inert.
  const chip = f.el('t-pilot'); chip.focus();
  assert.equal(f.controls().openPilot(), true);
  assert.equal(f.el('pilot-dialog').hidden, false); assert.equal(f.document.activeElement.id, 'pilot-reason'); assert.equal(f.el('main').inert, true);
  assert.equal(f.el('real-banner').inert, false, 'the strip (Pause, Arrêter) stays usable under the pilot dialog');
  assert.match(f.el('pilot-dialog-text').textContent, /Piloté par « Tablette B »/);
  assert.equal(f.el('pilot-form').hidden, false); assert.equal(f.el('pilot-takeover').hidden, false); assert.equal(f.el('pilot-takeover').disabled, true, 'no reason, no takeover');
  f.el('pilot-reason').value = 'ab'; f.el('pilot-reason').fire('input'); assert.equal(f.el('pilot-takeover').disabled, true, '2 characters are not a reason');
  f.el('pilot-reason').value = '   ab  '; f.el('pilot-reason').fire('input'); assert.equal(f.el('pilot-takeover').disabled, true, 'spaces do not count');
  // Tab stays inside: last → first, first (shift) → last.
  f.el('pilot-reason').value = 'Opérateur présent'; f.el('pilot-reason').fire('input'); assert.equal(f.el('pilot-takeover').disabled, false);
  f.el('pilot-takeover').focus(); assert(f.key('Tab')); assert.equal(f.document.activeElement.id, 'pilot-reason');
  assert(f.key('Tab', { shiftKey: true })); assert.equal(f.document.activeElement.id, 'pilot-takeover');
  // Cancelled (Escape): nothing sent, focus back on the chip, background restored, reason cleared.
  assert(f.key('Escape')); assert.equal(f.el('pilot-dialog').hidden, true); assert.equal(f.document.activeElement, chip); assert.equal(f.el('main').inert, false);
  assert.equal(f.el('pilot-reason').value, ''); assert(!f.posts().some((r) => r.body.action === 'control'), 'a cancelled takeover sends nothing');
  // Cancelled (Fermer) the same way.
  f.controls().openPilot(); f.el('pilot-reason').value = 'Opérateur présent'; f.el('pilot-dismiss').click();
  assert.equal(f.el('pilot-dialog').hidden, true); assert(!f.posts().some((r) => r.body.action === 'control'));
  // A preset reason fills the field; the takeover is sent only by the button, with the reason and the id.
  f.controls().openPilot(); f.el('pilot-reason-a').textContent = 'Opérateur devant la machine'; f.el('pilot-reason-a').click();
  assert.equal(f.el('pilot-reason').value, 'Opérateur devant la machine'); assert.equal(f.document.activeElement.id, 'pilot-takeover');
  assert(!f.posts().some((r) => r.body.action === 'control'), 'choosing a reason does not send');
  f.el('pilot-takeover').click(); f.el('pilot-takeover').click();
  const takeovers = f.posts().filter((r) => r.body.action === 'control');
  assert.equal(takeovers.length, 1, 'one request per tap, none while it is on its way');
  assert.deepEqual({ op: takeovers[0].body.operation, reason: takeovers[0].body.reason, id: takeovers[0].body.clientId }, { op: 'takeover', reason: 'Opérateur devant la machine', id });
  // A refused takeover (reason rejected by the server) stays in the dialog with its message.
  f.answer(takeovers[0], { message: 'Prise de pilotage refusée : indiquez un motif (3 caractères au moins).', code: 'ECONTROL', owner: other }, 409); await f.flush();
  assert.equal(f.el('pilot-dialog').hidden, false); assert.match(f.el('pilot-feedback').textContent, /Refusé : pilotage attribué à « Tablette B »/);
  f.el('pilot-takeover').click(); const accepted = f.posts().filter((r) => r.body.action === 'control').at(-1);
  f.answer(accepted, { owner: { kind: 'touch', id }, previous: other, role: 'operator' }); await f.flush();
  assert.equal(f.el('pilot-dialog').hidden, true); assert.equal(f.el('job-feedback').textContent, 'Pilotage pris par cet appareil.'); assert.equal(f.document.activeElement, chip);
  // When this device owns or the port is free, the dialog informs only (no takeover form).
  f.push([f.machine({ control: { owner: { kind: 'touch', id, label: 'x', present: true }, lastChange: null } })]);
  f.controls().openPilot(); assert.equal(f.el('pilot-form').hidden, true); assert.equal(f.el('pilot-takeover').hidden, true); assert.equal(f.document.activeElement.id, 'pilot-dismiss');
  // The owner changes while the dialog is open: the form follows.
  f.push([f.machine({ control: { owner: other, lastChange: null } })]); assert.equal(f.el('pilot-form').hidden, false);
  f.key('Escape');
  // The previous owner is told who took over and why (once).
  f.push([f.machine({ control: { owner: other, lastChange: { type: 'takeover', at: 42, previous: { kind: 'touch', id }, owner: other, reason: 'Changement d’équipe' } } })]);
  assert.equal(f.el('job-feedback').textContent, 'Pilotage repris par « Tablette B » — motif : Changement d’équipe');
  f.el('job-feedback').textContent = 'autre'; f.push([f.machine({ control: { owner: other, lastChange: { type: 'takeover', at: 42, previous: { kind: 'touch', id }, owner: other, reason: 'Changement d’équipe' } } })]);
  assert.equal(f.el('job-feedback').textContent, 'autre', 'shown once per takeover');
  // The dialog never stacks on another dialog, and closes with a screen change or a hidden page.
  f.el('job-dialog').hidden = false; assert.equal(f.controls().openPilot(), false); f.el('job-dialog').hidden = true;
  f.controls().openPilot(); f.window.dispatchEvent({ type: 'cnc-screen-change', detail: 'files' }); assert.equal(f.el('pilot-dialog').hidden, true);
  f.controls().dispose();

  // 7. The strip always shows the pilot (also with a message shown, also at rest), from the same detail.
  const dom = require('./dom-fixture.cjs').createDOM(['home']);
  dom.document.body.getAttribute = () => null;
  const banner = dom.node('real-banner'), handlers = {}, opened = [];
  const win = { cncI18n: { t: (s) => s, html: (s) => s, locale: 'fr-FR' }, cncJobControls: { openPilot() { opened.push(1); return true; } }, addEventListener(n, fn) { handlers[n] = fn; }, removeEventListener(n) { delete handlers[n]; } };
  const realCreate = dom.document.createElement;
  dom.document.createElement = (tag) => { const e = realCreate(tag); Object.defineProperty(e, 'innerHTML', { set() { e._path = { setAttribute() {} }; }, get() { return ''; } }); e.querySelector = () => e._path; return e; };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/status-strip.js', 'utf8'), { document: dom.document, window: win, Date });
  const byId = (x) => banner.querySelectorAll('*').find((e) => e.id === x);
  const strip = (pilot, m) => handlers['cnc-job-status']({ detail: { simulation: false, transportConnected: true, machine: Object.assign({ port: 'COM3', activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 100, canPause: false, canStop: false }, m || {}), pilot } });
  const chipNode = byId('t-pilot');
  assert(chipNode, 'the chip exists'); assert.equal(chipNode.hidden, false); assert.equal(byId('t-pilot-value').textContent, '—', 'unknown before any state');
  assert.equal(chipNode.parentNode.className, 't-strip-actions', 'in the actions cell, which a message never covers');
  strip(mine); assert.equal(byId('t-pilot-value').textContent, 'Cet appareil'); assert.equal(chipNode.getAttribute('data-state'), 'mine');
  strip(otherDetail, { workflow: 'running', activeState: 'Run', canPause: true, canStop: true });
  assert.equal(byId('t-pilot-value').textContent, 'Tablette B'); assert.equal(chipNode.getAttribute('data-state'), 'other');
  assert.match(chipNode.getAttribute('aria-label'), /^Pilote : Piloté par « Tablette B »/);
  assert.equal(byId('t-pause').disabled, false); assert.equal(byId('t-stop').disabled, false, 'Pause and Stop stay active under another owner');
  strip({ state: 'free', value: 'Libre', sentence: 'Libre : …' }); assert.equal(byId('t-pilot-value').textContent, 'Libre'); assert.equal(chipNode.hidden, false);
  handlers['cnc-job-status']({ detail: { simulation: false, transportConnected: false, machine: null } }); assert.equal(chipNode.hidden, false); assert.equal(byId('t-pilot-value').textContent, '—');
  chipNode.click(); assert.equal(opened.length, 1, 'a tap opens the pilot dialog');
  // A shown message (notice) leaves the chip visible: it is not in the message's columns.
  const css = fs.readFileSync(__dirname + '/touch/ui-2027.css', 'utf8');
  assert(/\[data-message="true"\]>\.t-fresh,\.ks-ui \[data-message="true"\]>\.t-vitals\{visibility:hidden\}/.test(css), 'messages hide the age and values only');
  assert(!/t-pilot[^{]*\{[^}]*display:none/.test(css), 'no rule hides the chip');
  console.log('PASS control attribution (F5): persistent clientId, unreadable id regenerated, two owners, ECONTROL refusal, cancelled and confirmed takeover, focus return, Pause/Stop always active, chip always shown.');
})().catch((e) => { console.error(e); process.exit(1); });
