'use strict';
// Real jogging and work origins (F1), client side: real-motion.js with the real job controls
// (cnc-state.js, job-stream.js, program-check-view.js, job-controls.js) in one VM context, a fake
// XMLHttpRequest that records every request (none leaves the process), fake timers and clock.
// Checks: nothing real without the server's capability; one step per tap; hold → keepalive →
// release (jog-stop); pointercancel, blur, hidden page, stream lost (no jog-start again after the
// reconnection); ECONTROL named; origin in two steps (ticket, then confirmation); idle release told.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm'), path = require('path');

function load() {
  let now = 1700000000000, timerId = 0;
  const nodes = {}, requests = [], listeners = {}, events = [], intervals = new Map();
  const storage = new Map([['cnc', JSON.stringify({ state: { session: { token: 'offline-fixture' } } })]]);
  const doc = { hidden: false, activeElement: null };
  function element(id, tag) {
    const node = { tagName: tag || 'DIV', value: '', className: '', type: '', hidden: false, disabled: false, inert: false, isConnected: true, checked: false,
      handlers: {}, attributes: {}, children: [], parentNode: null, style: {}, captured: null,
      addEventListener(n, f) { (this.handlers[n] || (this.handlers[n] = [])).push(f); },
      removeEventListener(n, f) { this.handlers[n] = (this.handlers[n] || []).filter((x) => x !== f); },
      fire(n, event) { (this.handlers[n] || []).slice().forEach((f) => f.call(this, Object.assign({ type: n, preventDefault() {} }, event || {}))); },
      click() { if (!this.disabled) this.fire('click'); },
      appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c) { return this.appendChild(c); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      setPointerCapture(p) { this.captured = p; }, releasePointerCapture() { this.captured = null; },
      focus() { doc.activeElement = this; }, getClientRects() { return this.hidden ? [] : [{}]; }, contains(t) { return t === this; } };
    let content = '', ident = id;
    Object.defineProperty(node, 'textContent', { get: () => content + node.children.map((c) => c.textContent).join(''), set(v) { content = String(v); node.children = []; }, enumerable: true });
    // Assigning an id makes the node reachable by getElementById, as in a browser.
    Object.defineProperty(node, 'id', { get: () => ident, set(v) { ident = v; nodes[v] = node; }, enumerable: true });
    if (id) nodes[id] = node;
    return node;
  }
  const el = (id) => nodes[id] || element(id);
  ['job-dialog', 'pilot-dialog', 'pilot-form', 'pilot-takeover', 'job-travel', 'job-program-check', 'job-note'].forEach((id) => { el(id).hidden = true; });
  const body = element('body', 'BODY'); body.getAttribute = () => null; body.appendChild(el('real-banner')); body.appendChild(el('main'));
  el('ks-origin-explanation').hidden = true;
  const selectors = { '#screen-jog .ks-preparation-actions': 'prep-actions', '#screen-jog .ks-panel-intro': 'intro' };
  Object.assign(doc, { body, getElementById: (id) => nodes[id] || null, querySelector: (sel) => el(selectors[sel] || 'panel'),
    querySelectorAll: (sel) => (sel === '[role="dialog"]' ? [el('job-dialog'), el('pilot-dialog')] : []),
    createElement: (tag) => element('', String(tag).toUpperCase()),
    addEventListener(n, f) { (listeners['doc:' + n] || (listeners['doc:' + n] = [])).push(f); },
    removeEventListener(n, f) { listeners['doc:' + n] = (listeners['doc:' + n] || []).filter((x) => x !== f); } });
  // job-controls reads these by id from its own markup (innerHTML is not parsed here).
  ['job-port', 'job-feedback', 'job-load', 'job-start', 'job-pause', 'job-resume', 'job-stop', 'job-progress', 'job-check', 'job-confirm', 'job-dismiss',
    'pilot-reason', 'pilot-dismiss', 'pilot-reason-a', 'pilot-reason-b', 'pilot-feedback', 'pilot-dialog-text', 'job-dialog-title', 'job-dialog-file', 'job-countdown', 'job-countdown-bar',
    'job-state', 'job-selected', 'job-loaded', 'job-reason'].forEach(el);
  function XHR() { this.responseText = ''; this.status = 0; this.headers = {}; this.open = (method, url) => { this.method = method; this.url = url; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = (b) => { this.body = b && JSON.parse(b); requests.push(this); }; this.abort = () => { this.aborted = true; }; }
  const window = { location: { pathname: '/cnc/touch/' }, navigator: { onLine: true, maxTouchPoints: 5 }, XMLHttpRequest: XHR,
    setInterval(fn, ms) { intervals.set(++timerId, { fn, ms }); return timerId; }, clearInterval(id) { intervals.delete(id); },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  const context = { window, document: doc, XMLHttpRequest: XHR, localStorage, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
    Date: class extends Date { static now() { return now; } }, Math, Promise, JSON, setInterval: window.setInterval, clearInterval: window.clearInterval };
  vm.createContext(context);
  for (const file of ['cnc-state.js', 'job-stream.js', 'program-check-view.js', 'job-controls.js', 'real-motion.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', file), 'utf8'), context, { filename: file });
  const isStream = (url) => /\/touch-events(\?clientId=[^&]+)?$/.test(url);
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
  function answer(xhr, data, status = 200) { xhr.status = status; xhr.responseText = JSON.stringify(data); xhr.onload(); }
  let sequence = 0, transport = 'stream-one';
  function packet(controllers) { return { version: 1, epoch: 'server-one', sequence: ++sequence, sentAt: now, transportId: transport, controllers }; }
  let stream = null;
  function push(controllers) { stream.status = 200; stream.responseText += JSON.stringify(packet(controllers)) + '\n'; stream.onprogress(); }
  async function connect(first) {
    answer(requests.find((r) => r.url.endsWith('/custom/health')), { loaded: true, protocol: 1 });
    stream = requests.find((r) => isStream(r.url));
    push([first]); await flush();
  }
  // The stream breaks; after the retry delay a new one opens and carries a packet.
  async function reconnect(next) {
    stream.onerror(); await flush();
    now += 31000; tick(1000); await flush();
    stream = requests.filter((r) => isStream(r.url)).at(-1);
    transport = 'stream-two';
    push([next]); await flush();
  }
  function tick(ms) { Array.from(intervals.values()).filter((i) => ms === undefined || i.ms === ms).forEach((i) => i.fn()); }
  const posts = () => requests.filter((r) => r.method === 'POST');
  const motion = (op) => posts().filter((r) => r.body.action === 'motion' && (!op || r.body.operation === op));
  const lastStatus = () => events.filter((e) => e.type === 'cnc-job-status').at(-1).detail;
  return { window, document: doc, el, nodes, requests, listeners, flush, answer, push, connect, reconnect, posts, motion, lastStatus, tick, intervals,
    controls: () => window.cncJobControls, advance(ms) { now += ms; }, now: () => now,
    fireWindow(n, e) { (listeners[n] || []).slice().forEach((f) => f(e || {})); }, fireDoc(n, e) { (listeners['doc:' + n] || []).slice().forEach((f) => f(e || {})); } };
}

const DISABLED = 'Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).';
function caps(enabled, extra = {}) {
  const c = (more) => Object.assign({ supported: true, enabled, experimental: true, reason: enabled ? '' : DISABLED }, more);
  return { jog: c({ steps: [0.01, 0.1, 1, 10] }), jogContinuous: c({ keepalivePeriodMs: 100, keepaliveTimeoutMs: 250 }), jogCancel: c(), setOrigin: c({ axes: ['X', 'Y', 'Z'] }), ...extra };
}
function machine(patch) {
  return Object.assign({ port: 'COM3', controllerId: 'COM3', generation: 'gen-1', type: 'Grbl', activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: 1700000000000,
    name: '', originalName: '', revision: 'rev-1', total: 0, received: 0, canLoad: true, canStart: false, canResume: false, canPause: false, canStop: false,
    control: { owner: null, lastChange: null }, operator: { reportUnits: 'mm', wcs: 'G54' },
    coordinates: { mpos: { x: -100, y: -50, z: -2 }, wpos: { x: 12.5, y: 3, z: 1 } },
    capabilities: caps(true),
    motion: { canJog: true, jogReason: '', continuousReason: { X: '', Y: '', Z: '' }, canSetOrigin: true, setOriginReason: '',
      maxFeed: { X: { max: 1000, source: '$110' }, Y: { max: 1000, source: '$111' }, Z: { max: 500, source: '$112' } }, jog: null, cancelling: false, cancelUnconfirmed: false, lastJog: null, lastOrigin: null } }, patch || {});
}
const down = (b) => b.fire('pointerdown', { pointerId: 7, button: 0 });
async function ready(patch) {
  const f = load(); await f.connect(machine(patch));
  return f;
}
async function opened(patch) {
  const f = await ready(patch);
  f.el('real-motion-open').click(); await f.flush();
  assert.equal(f.el('real-motion').hidden, false, 'the real move panel opens');
  return f;
}
async function holding(f, button = 'real-motion-yp') {
  // Mode buttons: the second choice of the first segment is "Maintien".
  modeButton(f, 'hold').click(); await f.flush();
  down(f.el(button)); await f.flush();
  const start = f.motion('jog-start').at(-1);
  assert(start, 'pointerdown sends jog-start');
  return start;
}
function findAll(node, test, out = []) { if (test(node)) out.push(node); (node.children || []).forEach((c) => findAll(c, test, out)); return out; }
function modeButton(f, value) { return findAll(f.el('real-motion'), (n) => n.getAttribute && n.getAttribute('data-value') === value)[0]; }
function choice(f, value) { return findAll(f.el('real-motion'), (n) => n.getAttribute && n.getAttribute('data-value') === String(value))[0]; }

(async () => {
  // 1. Capability disabled (the default): no real button, no panel, no request; a discreet note
  //    in the origin help with the server's reason. An old server (no capabilities): nothing.
  {
    const f = await ready({ capabilities: caps(false), motion: { canJog: false, jogReason: DISABLED, continuousReason: { X: DISABLED, Y: DISABLED, Z: DISABLED }, canSetOrigin: false, setOriginReason: DISABLED, maxFeed: {} } });
    assert.equal(f.nodes['real-motion-open'], undefined, 'no real move button when disabled');
    assert.equal(f.nodes['real-motion'], undefined, 'no real move panel when disabled');
    assert.match(f.el('real-motion-note').textContent, /Déplacements réels non activés \(validation matérielle requise\)/);
    f.tick(); await f.flush();
    assert.equal(f.motion().length, 0, 'no motion request at all');
    // Supported but another reason (unknown Grbl version): the reason is given.
    const v = 'Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).';
    f.push([machine({ capabilities: { jog: { supported: false, enabled: false, reason: v }, jogContinuous: { supported: false, enabled: false, reason: v } } })]); await f.flush();
    assert(f.el('real-motion-note').textContent.includes(v));
    assert.equal(f.nodes['real-motion-open'], undefined);
    const old = await ready({ capabilities: undefined, motion: undefined });
    assert.equal(old.nodes['real-motion-open'], undefined); assert.equal(old.nodes['real-motion-note'], undefined, 'an old server: nothing new at all');
  }
  // 2. Enabled: the entry is marked EXPERIMENTAL; one step per tap, with the stream's identity.
  {
    const f = await opened();
    assert.match(f.el('real-motion-open').textContent, /Déplacement réel.*EXPÉRIMENTAL/);
    assert.match(f.el('real-motion-title').textContent, /EXPÉRIMENTAL/);
    assert.match(f.el('real-motion-frame').textContent, /repère G54 · mm/);
    assert.equal(f.el('real-motion-mx').textContent, '-100.000', 'the position reported by the controller');
    assert.equal(f.el('real-motion-wx').textContent, '12.500');
    assert.equal(f.el('real-banner').inert, false, 'the strip (Pause / Arrêter) stays usable');
    assert.equal(f.el('main').inert, true);
    f.el('real-motion-xp').click(); f.el('real-motion-xp').click(); await f.flush();
    assert.equal(f.motion().length, 1, 'a double tap sends one step');
    const s = f.motion('jog')[0];
    assert.deepEqual([s.body.axis, s.body.direction, s.body.step, s.body.feed, s.body.port, s.body.generation, s.body.transportId], ['X', 1, 0.1, 250, 'COM3', 'gen-1', 'stream-one']);
    assert.match(s.body.clientId, /^t-/);
    assert.match(f.el('real-motion-sent').textContent, /Demande envoyée : X\+ · pas 0.1 mm · 250 mm\/min/);
    assert.equal(f.el('real-motion-answer').getAttribute('data-state'), 'sent');
    f.answer(s, { message: 'Pas de 0.1 mm en X+ envoyé ($J=G91 G21 X0.1 F250).', command: '$J=G91 G21 X0.1 F250' }); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /^Accepté par le serveur : Pas de 0.1 mm en X\+ envoyé/);
    assert.equal(f.el('real-motion-answer').getAttribute('data-state'), 'confirmed');
    // The server's refusal is shown with its reason.
    f.advance(400); choice(f, 10).click(); f.el('real-motion-xm').click(); await f.flush();
    const big = f.motion('jog').at(-1); assert.equal(big.body.step, 10);
    f.answer(big, { message: 'Pas de 10 mm refusé : au-delà de 1 mm, il faut une machine référencée et une course connue (machine non référencée).' }, 409); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Refusé par le serveur : Pas de 10 mm refusé.*non référencée/);
    assert.equal(f.el('real-motion-answer').getAttribute('data-state'), 'failed');
    // Observed: a server jog and its last result come from the snapshot.
    f.push([machine({ activeState: 'Jog', motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).', lastJog: { result: 'ended', message: 'fin de la course autorisée atteinte' } }) })]); await f.flush();
    assert.match(f.el('real-motion-observed').textContent, /État observé : Jog.*fin de la course autorisée atteinte/);
    assert.match(f.el('real-motion-reason').textContent, /Déplacement précédent non terminé/);
    assert.equal(f.el('real-motion-xp').disabled, true);
  }
  // 3. Hold → keepalive → release: jog-stop at once, no keepalive after it.
  {
    const f = await opened();
    const start = await holding(f);
    assert.deepEqual([start.body.axis, start.body.direction, start.body.feed, start.body.transportId], ['Y', 1, 250, 'stream-one']);
    f.tick(150); await f.flush();
    assert.equal(f.motion('jog-keepalive').length, 0, 'no keepalive before the server accepted');
    f.answer(start, { jogId: 'j1', keepalivePeriodMs: 100, keepaliveTimeoutMs: 250, distanceMm: 49, message: 'Déplacement continu Y+ (au plus 49 mm, 250 mm/min) : relâchez pour arrêter.' }); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Accepté par le serveur : Déplacement continu Y\+/);
    const keep = Array.from(f.intervals.values()).find((i) => i.ms === 100);
    assert(keep, 'keepalive every 100 ms (the server period, at most 150 ms)');
    f.tick(100); await f.flush();
    const k = f.motion('jog-keepalive'); assert.equal(k.length, 1); assert.equal(k[0].body.jogId, 'j1');
    f.answer(k[0], { active: true, jogId: 'j1' }); await f.flush();
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 2);
    assert.equal(f.el('real-motion-yp').getAttribute('data-held'), 'true');
    const before = f.motion().length;
    f.el('real-motion-yp').fire('pointerup');
    assert.equal(f.motion().length, before + 1, 'jog-stop leaves synchronously on release');
    const stop = f.motion('jog-stop')[0]; assert.equal(stop.body.jogId, 'j1'); assert.equal(stop.body.port, 'COM3');
    f.el('real-motion-yp').fire('lostpointercapture'); f.tick(100); f.tick(100); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'one stop'); assert.equal(f.motion('jog-keepalive').length, 2, 'no keepalive after the release');
    f.answer(stop, { message: 'Déplacement arrêté : annulation de jog (0x85) envoyée.' }); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Arrêt accepté : Déplacement arrêté/);
    // The Stop of the strip / Suivi is offered while the server's jog runs, even before Jog is reported.
    f.push([machine({ motion: Object.assign(machine().motion, { jog: { axis: 'Y', direction: 1, feed: 250, distanceMm: 49 } }) })]); await f.flush();
    assert.equal(f.el('job-stop').disabled, false, 'Arrêter usable during our jog');
    // A double press right after the release is ignored; later a new press starts a new jog.
    f.push([machine()]); await f.flush();
    down(f.el('real-motion-yp')); await f.flush(); assert.equal(f.motion('jog-start').length, 1);
    f.advance(400); down(f.el('real-motion-yp')); await f.flush(); assert.equal(f.motion('jog-start').length, 2);
  }
  // 4. pointercancel, blur and a hidden page stop the jog.
  for (const [name, act] of [['pointercancel', (f) => f.el('real-motion-yp').fire('pointercancel')], ['pointerleave', (f) => f.el('real-motion-yp').fire('pointerleave')],
    ['blur', (f) => f.fireWindow('blur')], ['hidden', (f) => { f.document.hidden = true; f.fireDoc('visibilitychange'); }], ['screen', (f) => f.fireWindow('cnc-screen-change', { detail: 'home' })]]) {
    const f = await opened();
    const start = await holding(f);
    f.answer(start, { jogId: 'j-' + name, keepalivePeriodMs: 100 }); await f.flush();
    act(f);
    assert.equal(f.motion('jog-stop').length, 1, name + ' sends jog-stop'); assert.equal(f.motion('jog-stop')[0].body.jogId, 'j-' + name);
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 0, name + ': no keepalive after it');
  }
  // 5. Released before the server's answer: stop at once, and again with the jog's id when it comes.
  {
    const f = await opened();
    const start = await holding(f);
    f.el('real-motion-yp').fire('pointerup');
    assert.equal(f.motion('jog-stop').length, 1); assert.equal(f.motion('jog-stop')[0].body.jogId, undefined);
    f.answer(start, { jogId: 'late', keepalivePeriodMs: 100 }); await f.flush();
    assert.equal(f.motion('jog-stop').length, 2); assert.equal(f.motion('jog-stop')[1].body.jogId, 'late');
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 0);
  }
  // 6. The stream lost while holding: jog-stop at once (not held back), and after the reconnection
  //    no jog-start is sent again, even with the finger still down.
  {
    const f = await opened();
    const start = await holding(f);
    f.answer(start, { jogId: 'j6', keepalivePeriodMs: 100 }); await f.flush();
    await f.reconnect(machine());
    const stops = f.motion('jog-stop'); assert.equal(stops.length, 1, 'the stream loss sends jog-stop'); assert.equal(stops[0].body.jogId, 'j6');
    f.tick(100); f.tick(1000); await f.flush();
    assert.equal(f.motion('jog-start').length, 1, 'no jog-start repeated after the reconnection');
    assert.equal(f.lastStatus().transportConnected, true, 'the stream is back'); assert.equal(f.el('real-motion-yp').disabled, false);
    assert.equal(f.motion('jog-keepalive').length, 0);
    f.el('real-motion-yp').fire('pointerup'); await f.flush(); assert.equal(f.motion('jog-stop').length, 1);
    // Offline flag: a jog stop still goes out (the browser may be wrong).
    f.advance(400); down(f.el('real-motion-yp')); await f.flush();
    const s2 = f.motion('jog-start').at(-1); f.answer(s2, { jogId: 'j6b', keepalivePeriodMs: 100 }); await f.flush();
    f.fireWindow('offline'); await f.flush();
    assert(f.motion('jog-stop').some((r) => r.body.jogId === 'j6b'), 'jog-stop sent although offline');
  }
  // 7. A refused keepalive (409): no more keepalives, the message shown, a stop sent.
  {
    const f = await opened();
    const start = await holding(f);
    f.answer(start, { jogId: 'j7', keepalivePeriodMs: 100 }); await f.flush();
    f.tick(100); await f.flush();
    f.answer(f.motion('jog-keepalive')[0], { message: 'Maintien reçu trop tard : déplacement annulé (0x85).' }, 409); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Maintien reçu trop tard/);
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 1, 'no keepalive after a refusal');
    assert.equal(f.motion('jog-stop').length, 1);
    // A keepalive saying the jog ended (bound reached): no more keepalives.
    f.advance(400); down(f.el('real-motion-yp')); await f.flush();
    f.answer(f.motion('jog-start').at(-1), { jogId: 'j7b', keepalivePeriodMs: 100 }); await f.flush();
    f.tick(100); await f.flush();
    f.answer(f.motion('jog-keepalive').at(-1), { active: false, message: 'Déplacement terminé ou annulé : fin de la course autorisée atteinte.' }); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /fin de la course autorisée atteinte/);
    const n = f.motion('jog-keepalive').length; f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, n);
  }
  // 8. ECONTROL: the owner is named, nothing else is sent; the hold is refused per axis by the server's reason.
  {
    const f = await opened();
    const start = await holding(f);
    f.answer(start, { message: 'Machine pilotée par Tablette B.', code: 'ECONTROL', owner: { kind: 'touch', id: 't-b-1234', label: 'Tablette B' } }, 409); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Refusé par le serveur : Refusé : pilotage attribué à « Tablette B »/);
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 0);
    const why = 'Maintien continu impossible : machine non référencée ($H). Utilisez les pas (1 mm au plus).';
    f.push([machine({ motion: Object.assign(machine().motion, { continuousReason: { X: why, Y: why, Z: why } }) })]); await f.flush();
    f.advance(400); down(f.el('real-motion-xp')); await f.flush();
    assert.equal(f.motion('jog-start').length, 1, 'no jog-start when the server says the hold is impossible');
    assert(f.el('real-motion-answer').textContent.includes(why));
  }
  // 9. Origin in two steps: a ticket from the server, then the confirmation here; nothing sent on expiry.
  {
    const f = await opened();
    f.el('real-motion-origin-x').click(); await f.flush();
    const prep = f.posts().at(-1);
    assert.deepEqual([prep.body.action, prep.body.operation, prep.body.axes, prep.body.transportId], ['prepare', 'set-origin', ['X'], 'stream-one']);
    assert.equal(f.posts().filter((r) => r.body.action === 'set-origin').length, 0, 'nothing set before the confirmation');
    f.answer(prep, { nonce: 'n1', name: 'Origine X du repère G54 à la position actuelle (G10 L20 P1 X0)', operation: 'set-origin', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    assert.equal(f.el('real-motion-ticket').hidden, false);
    assert.match(f.el('real-motion-ticket-name').textContent, /repère G54.*G10 L20 P1 X0.*position machine X -100.000 mm → travail X 0/);
    assert.match(f.el('real-motion-origin-confirm').textContent, /Confirmer l’origine X · G54/);
    assert.match(f.el('real-motion-ticket-left').textContent, /Arrêter reste disponible/);
    assert.equal(f.el('real-motion-xp').disabled, true, 'no move while an origin waits');
    f.el('real-motion-origin-confirm').click(); await f.flush();
    const set = f.posts().at(-1); assert.deepEqual([set.body.action, set.body.nonce, set.body.generation], ['set-origin', 'n1', 'gen-1']);
    f.answer(set, { message: 'Origine X du repère G54 réglée à la position actuelle (G10 L20 P1 X0).' }); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Accepté par le serveur : Origine X du repère G54 réglée/);
    // Expired ticket: the confirmation sends nothing.
    f.el('real-motion-origin-y').click(); await f.flush();
    f.answer(f.posts().at(-1), { nonce: 'n2', name: 'Origine Y du repère G54 à la position actuelle (G10 L20 P1 Y0)', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    f.advance(16000); const count = f.posts().length; f.el('real-motion-origin-confirm').click(); await f.flush();
    assert.equal(f.posts().length, count, 'an expired ticket sends nothing');
    assert.equal(f.el('real-motion-ticket').hidden, true);
    // A refusal of the ticket is shown with its reason.
    f.push([machine()]); await f.flush();
    f.el('real-motion-origin-z').click(); await f.flush();
    f.answer(f.posts().at(-1), { message: 'Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.' }, 409); await f.flush();
    assert.match(f.el('real-motion-answer').textContent, /Refusé par le serveur : Repère de travail inconnu/);
  }
  // 10. The capability switched off while holding: stop, panel closed, button gone.
  {
    const f = await opened();
    const start = await holding(f);
    f.answer(start, { jogId: 'j10', keepalivePeriodMs: 100 }); await f.flush();
    f.push([machine({ capabilities: caps(false) })]); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1); assert.equal(f.el('real-motion').hidden, true); assert.equal(f.el('real-motion-open').hidden, true);
    assert.equal(f.el('main').inert, false, 'the background is restored');
  }
  // 11. Idle release (control.lastChange.type 'idle'): told in the pilot sentence, who still shown.
  {
    const f = load(); const id = f.controls().clientId();
    await f.connect(machine({ control: { owner: null, lastChange: { type: 'idle', port: 'COM3', owner: null, at: 5, previous: { kind: 'touch', id, label: 'Tablette ab12' }, idleMs: 300000 } } }));
    const p = f.lastStatus().pilot;
    assert.equal(p.state, 'free'); assert.equal(p.value, 'Libre');
    assert.match(p.sentence, /^Libéré après 5 min d’inactivité \(« Tablette ab12 »\)\. Libre/);
    assert.match(f.el('job-feedback').textContent, /Pilotage de cet appareil libéré après 5 min d’inactivité\./);
    f.el('real-motion-open').click(); await f.flush();
    assert.match(f.el('real-motion-pilot').textContent, /Libéré après 5 min d’inactivité/);
    // Another owner now: who pilots is shown, the idle note is gone.
    f.push([machine({ control: { owner: { kind: 'touch', id: 't-b-1234', label: 'Tablette B', present: true }, lastChange: { type: 'claim', at: 6 } } })]); await f.flush();
    assert.match(f.lastStatus().pilot.sentence, /Piloté par « Tablette B »/); assert(!/inactivité/.test(f.lastStatus().pilot.sentence));
  }
  // 12. The dry-run check stays apart: real-motion never touches the .jog arrows nor the preview endpoint.
  {
    const src = fs.readFileSync(path.join(__dirname, 'touch', 'real-motion.js'), 'utf8');
    assert(!/touch-motion\/preview/.test(src) && !/querySelectorAll\('\.jog'\)/.test(src));
    assert(!/real|jog-start|touch-job/.test(fs.readFileSync(path.join(__dirname, 'touch', 'dry-motion.js'), 'utf8').replace(/Aucun déplacement réel|déplacement réel/g, '')), 'dry-motion.js unchanged in meaning');
  }
  console.log('PASS: real moves hidden unless enabled; step; hold → keepalive → release; pointercancel/leave, blur, hidden, screen change; stream loss without restart; refused keepalive; ECONTROL; origin in two steps; idle release.');
})().catch((e) => { console.error(e); process.exit(1); });
