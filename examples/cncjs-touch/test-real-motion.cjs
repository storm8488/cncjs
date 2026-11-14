'use strict';
// Préparer, real page: real-motion.js drives the arrows, steps, speed and Zéro buttons of #screen-jog
// with the real job controls (cnc-state.js, job-stream.js, program-check-view.js, job-controls.js) in one
// VM context, a fake XMLHttpRequest that records every request (none leaves the process), fake timers
// and clock. Checks: one real step per tap (never the old preview endpoint); « Continu » → jog-start,
// keepalive, jog-stop on every exit; the guards that replace the old modal panel (another press, held
// button hidden or inert, a step in flight cancelled when Préparer is left, locked or hidden screen);
// Zéro X / Y / Z / XYZ in two steps (one ticket per button); one actionable sentence per refusal row
// (EN and ES rows too); no DOM write for identical reports; a stale state greys everything.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm'), path = require('path');

function load(options = {}) {
  let now = 1700000000000, timerId = 0, writes = 0;
  const nodes = {}, requests = [], listeners = {}, events = [], intervals = new Map();
  const storage = new Map([['cnc', JSON.stringify({ state: { session: { token: 'offline-fixture' } } })]]);
  const doc = { hidden: false, activeElement: null };
  function element(id, tag) {
    let hidden = false, disabled = false, classes = new Set();
    const node = { tagName: tag || 'DIV', value: '', type: '', inert: false, isConnected: true, checked: false,
      handlers: {}, attributes: {}, children: [], parentNode: null, style: {}, captured: null, selectors: {},
      addEventListener(n, f) { (this.handlers[n] || (this.handlers[n] = [])).push(f); },
      removeEventListener(n, f) { this.handlers[n] = (this.handlers[n] || []).filter((x) => x !== f); },
      fire(n, event) { (this.handlers[n] || []).slice().forEach((f) => f.call(this, Object.assign({ type: n, target: this, preventDefault() {} }, event || {}))); },
      click() { if (!this.disabled) this.fire('click'); },
      appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c) { return this.appendChild(c); },
      setAttribute(k, v) { if (this.attributes[k] !== String(v)) writes++; this.attributes[k] = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      removeAttribute(k) { if (k in this.attributes) { writes++; delete this.attributes[k]; } },
      setPointerCapture(p) { this.captured = p; }, releasePointerCapture() { this.captured = null; },
      focus() { doc.activeElement = this; },
      getClientRects() { for (let n = this; n; n = n.parentNode) if (n.hidden || n.noBox) return []; return [{}]; },
      contains(t) { for (let n = t; n; n = n.parentNode) if (n === this) return true; return false; },
      querySelectorAll(sel) { return this.selectors[sel] ? this.selectors[sel]() : []; },
      querySelector(sel) { const all = this.querySelectorAll(sel); return all[0] || null; },
      classList: { contains: (c) => classes.has(c), add: (c) => { if (!classes.has(c)) { writes++; classes.add(c); } }, remove: (c) => { if (classes.has(c)) { writes++; classes.delete(c); } },
        toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; if (want !== classes.has(c)) { writes++; if (want) classes.add(c); else classes.delete(c); } return want; } } };
    let content = '', ident = id;
    Object.defineProperty(node, 'textContent', { get: () => content + node.children.map((c) => c.textContent).join(''), set(v) { writes++; content = String(v); node.children = []; }, enumerable: true });
    Object.defineProperty(node, 'hidden', { get: () => hidden, set(v) { if (hidden !== !!v) writes++; hidden = !!v; }, enumerable: true });
    Object.defineProperty(node, 'disabled', { get: () => disabled, set(v) { if (disabled !== !!v) writes++; disabled = !!v; }, enumerable: true });
    Object.defineProperty(node, 'className', { get: () => Array.from(classes).join(' '), set(v) { classes = new Set(String(v).split(/\s+/).filter(Boolean)); }, enumerable: true });
    Object.defineProperty(node, 'title', { get: () => node.getAttribute('title') || '', set(v) { node.setAttribute('title', v); }, enumerable: true });
    // Assigning an id makes the node reachable by getElementById, as in a browser.
    Object.defineProperty(node, 'id', { get: () => ident, set(v) { ident = v; nodes[v] = node; }, enumerable: true });
    if (id) nodes[id] = node;
    return node;
  }
  const el = (id) => nodes[id] || element(id);
  ['job-dialog', 'pilot-dialog', 'pilot-form', 'pilot-takeover', 'job-travel', 'job-program-check', 'job-note'].forEach((id) => { el(id).hidden = true; });
  const body = element('body', 'BODY'); body.getAttribute = () => null; body.appendChild(el('real-banner')); body.appendChild(el('main'));
  // #screen-jog as in index.html: intro (status line, actions), coordinates card (Zéro X / Y / Z,
  // steps, Zéro XYZ, speed, controller and answer lines), the cross; the speed sheet elsewhere.
  const screen = element('screen-jog', 'SECTION'); el('main').appendChild(screen); screen.classList.add('active');
  const intro = screen.appendChild(element('intro')), actions = intro.appendChild(element('prep-actions'));
  intro.appendChild(element('jog-msg', 'P')).textContent = 'Machine non prête.';
  const coords = screen.appendChild(element('coords')), heading = coords.appendChild(element('coords-h2', 'H2'));
  heading.textContent = 'Coordonnées du contrôleur';
  const zeros = ['x', 'y', 'z', 'xyz'].map((a) => { const b = coords.appendChild(element('jog-zero-' + a, 'BUTTON')); b.textContent = 'Zéro ' + a.toUpperCase(); b.setAttribute('data-origin', ''); b.setAttribute('data-axis', a); b.disabled = true; return b; });
  const stepBox = coords.appendChild(element('steps'));
  const steps = ['0.1', '1', '10', 'hold'].map((v) => { const b = stepBox.appendChild(element('step-' + v, 'BUTTON')); b.setAttribute('data-step', v); b.className = 'step' + (v === '1' ? ' active' : ''); if (v === 'hold') b.hidden = true; b.textContent = v === 'hold' ? 'Continu' : v; return b; });
  coords.appendChild(element('ks-jog-settings', 'BUTTON')).textContent = 'Vitesse…';
  coords.appendChild(element('jog-controller', 'P')); coords.appendChild(element('jog-feedback', 'P'));
  const cross = screen.appendChild(element('cross')), mid = cross.appendChild(element('pad-mid'));
  const arrows = {};
  [['X', 1], ['X', -1], ['Y', 1], ['Y', -1], ['Z', 1], ['Z', -1]].forEach(([a, d]) => { const b = cross.appendChild(element('arrow-' + a + (d > 0 ? '+' : '-'), 'BUTTON')); b.className = 'jog'; b.setAttribute('data-axis', a); b.setAttribute('data-dir', String(d)); b.disabled = true; arrows[a + (d > 0 ? '+' : '-')] = b; });
  const sheet = body.appendChild(element('ks-jog-sheet')); sheet.appendChild(element('feeds')); sheet.appendChild(element('jog-feed-limits', 'P'));
  screen.selectors = { '.jog': () => Object.values(arrows), '[data-origin]': () => zeros, '.pad-mid': () => [mid], '.ks-motion-coordinates h2': () => [heading],
    '.ks-preparation-actions': () => [actions], '.ks-panel-intro': () => [intro] };
  stepBox.selectors = { button: () => steps };
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
  if (options.locale) {
    // The interface in another language: the catalogs and i18n.js before the modules.
    const store = { 'cncjs-touch-language-v1': options.locale };
    window.cncI18nStore = store;
  }
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
  return { window, document: doc, el, nodes, requests, listeners, flush, answer, push, connect, reconnect, posts, motion, lastStatus, tick, intervals, arrows, steps, zeros, screen,
    controls: () => window.cncJobControls, advance(ms) { now += ms; }, now: () => now, writes: () => writes,
    fireWindow(n, e) { (listeners[n] || []).slice().forEach((f) => f(e || {})); }, fireDoc(n, e) { (listeners['doc:' + n] || []).slice().forEach((f) => f(e || {})); } };
}

const DISABLED = 'Déplacements réels non activés : validation matérielle supervisée requise (voir HANDOFF.md).';
function caps(enabled, extra = {}) {
  const c = (more) => Object.assign({ supported: true, enabled, experimental: true, reason: enabled ? '' : DISABLED }, more);
  return { jog: c({ steps: [0.01, 0.1, 1, 10] }), jogContinuous: c({ keepalivePeriodMs: 100, keepaliveTimeoutMs: 250 }), jogCancel: c(), setOrigin: c({ axes: ['X', 'Y', 'Z'] }), ...extra };
}
function machine(patch) {
  return Object.assign({ port: 'COM3', controllerId: 'COM3', generation: 'gen-1', type: 'Grbl', activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: 1700000000000,
    name: '', originalName: '', revision: 'rev-1', total: 0, received: 0, canLoad: true, canStart: false, canResume: false, canPause: false, canStop: false, homed: true,
    control: { owner: null, lastChange: null }, operator: { reportUnits: 'mm', wcs: 'G54' },
    coordinates: { mpos: { x: -100, y: -50, z: -2 }, wpos: { x: 12.5, y: 3, z: 1 } },
    capabilities: caps(true),
    motion: { canJog: true, jogReason: '', continuousReason: { X: '', Y: '', Z: '' }, canSetOrigin: true, setOriginReason: '',
      maxFeed: { X: { max: 1000, source: '$110' }, Y: { max: 1000, source: '$111' }, Z: { max: 500, source: '$112' } }, jog: null, cancelling: false, cancelUnconfirmed: false, lastJog: null, lastOrigin: null } }, patch || {});
}
const withMotion = (patch, more) => machine(Object.assign({ motion: Object.assign(machine().motion, patch) }, more || {}));
const down = (b) => b.fire('pointerdown', { pointerId: 7, button: 0 });
async function ready(patch) { const f = load(); await f.connect(machine(patch)); return f; }
async function holding(f, button = 'Y+') {
  f.el('step-hold').click(); await f.flush();
  assert.equal(f.el('jog-msg').textContent, 'Les flèches déplacent la machine · continu · 250 mm/min · relâchez pour arrêter');
  down(f.arrows[button]); await f.flush();
  const start = f.motion('jog-start').at(-1);
  assert(start, 'pointerdown sends jog-start');
  return start;
}
async function started(f, id, button) { const s = await holding(f, button); f.answer(s, { jogId: id, keepalivePeriodMs: 100 }); await f.flush(); return s; }
const allArrows = (f) => Object.values(f.arrows);
const noPreview = (f) => assert(!f.requests.some((r) => /touch-motion\/preview/.test(r.url)), 'never the preview endpoint');

(async () => {
  // 1. The capability disabled, an old server, an unknown version: the controls stay in place, greyed
  //    out, with one sentence saying what to do; nothing is sent, even by a programmatic click.
  {
    const f = await ready({ capabilities: caps(false), motion: { canJog: false, jogReason: DISABLED, continuousReason: { X: DISABLED, Y: DISABLED, Z: DISABLED }, canSetOrigin: false, setOriginReason: DISABLED, maxFeed: {} } });
    assert(allArrows(f).every((b) => b.disabled) && f.zeros.every((b) => b.disabled), 'arrows and zeros greyed out');
    assert.equal(f.el('jog-msg').textContent, 'Déplacements non activés sur ce serveur CNCjs (touch.motion.enabled).');
    assert.equal(f.arrows['X+'].title, f.el('jog-msg').textContent, 'a greyed arrow carries the same sentence');
    f.arrows['X+'].fire('click'); f.zeros[0].fire('click'); f.tick(); await f.flush();
    assert.equal(f.motion().length, 0, 'no motion request at all'); assert.equal(f.posts().filter((r) => r.body.action === 'prepare').length, 0);
    assert.equal(f.nodes['real-motion-open'], undefined, 'no separate « Déplacement réel » entry'); assert.equal(f.nodes['real-motion'], undefined, 'no separate panel');
    const v = 'Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).';
    f.push([machine({ capabilities: { jog: { supported: false, enabled: false, reason: v }, jogContinuous: { supported: false, enabled: false, reason: v }, setOrigin: { supported: false, enabled: false, reason: v } } })]); await f.flush();
    assert.equal(f.el('jog-msg').textContent, 'Version de la carte inconnue : touchez Relire les réglages.');
    // « Relire les réglages ($$) » is offered where the refusal shows, and reads $$ through job-controls.
    assert.equal(f.el('jog-read-settings').hidden, false); assert.equal(f.el('jog-read-settings').disabled, false);
    f.el('jog-read-settings').click(); await f.flush();
    assert.equal(f.posts().at(-1).body.action, 'readSettings');
    const old = await ready({ capabilities: undefined, motion: undefined });
    assert.equal(old.el('jog-msg').textContent, 'Ce serveur CNCjs ne permet pas les déplacements depuis la tablette.');
    assert(allArrows(old).every((b) => b.disabled)); assert.equal(old.el('jog-read-settings').hidden, true);
    noPreview(f); noPreview(old);
  }
  // 2. Enabled: one step per tap with the stream's identity, 1 mm and 250 mm/min by default; steps and
  //    speed taken from the controls; the server's refusal said as what to do; the answer never says « done ».
  {
    const f = await ready();
    assert.equal(f.el('jog-msg').textContent, 'Les flèches déplacent la machine · pas 1 mm · 250 mm/min');
    assert.equal(f.el('coordinate-frame-label').textContent, ' · G54 · mm');
    assert.equal(f.el('pad-mid').textContent, '1 mm'); assert.equal(f.el('ks-jog-settings').textContent, 'Vitesse · 250 mm/min…');
    assert.deepEqual(f.el('feeds').children.map((b) => b.getAttribute('data-feed')), ['100', '250', '500'], 'speeds bounded by the slowest axis ($112 = 500)');
    assert.match(f.el('jog-feed-limits').textContent, /Avance max X \/ Y \/ Z : 1000 \/ 1000 \/ 500 mm\/min/);
    assert(f.zeros.every((b) => !b.disabled), 'zeros enabled when the server allows the origin');
    f.arrows['X+'].click(); f.arrows['X+'].click(); await f.flush();
    assert.equal(f.motion().length, 1, 'a double tap sends one step');
    const s = f.motion('jog')[0];
    assert.deepEqual([s.body.axis, s.body.direction, s.body.step, s.body.feed, s.body.port, s.body.generation, s.body.transportId], ['X', 1, 1, 250, 'COM3', 'gen-1', 'stream-one']);
    assert.match(s.body.clientId, /^t-/);
    assert.equal(f.el('jog-feedback').textContent, 'X+ · 1 mm · 250 mm/min : envoi…'); assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'sent');
    f.answer(s, { message: 'Pas de 1 mm en X+ envoyé ($J=G91 G21 X1 F250).', command: '$J=G91 G21 X1 F250' }); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'X+ · 1 mm · 250 mm/min : envoyé à la machine.');
    assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'confirmed');
    // In flight until a report shows the machine free again: the other controls wait.
    assert(allArrows(f).every((b) => b.disabled) && f.steps.every((b) => b.disabled) && f.zeros.every((b) => b.disabled), 'everything waits while the step runs');
    f.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).' }, { activeState: 'Jog' })]); await f.flush();
    assert.equal(f.el('jog-msg').textContent, 'Déplacement en cours : attendez l’arrêt.');
    f.push([machine({ revision: 'rev-2' })]); await f.flush(); f.advance(400); f.tick(1000);
    assert.equal(f.arrows['X+'].disabled, false, 'free again once a report shows it');
    // 10 mm, refused by the server on an unhomed machine: the table's sentence.
    f.el('step-10').click(); f.arrows['X-'].click(); await f.flush();
    const big = f.motion('jog').at(-1); assert.deepEqual([big.body.step, big.body.direction], [10, -1]);
    f.answer(big, { message: 'Pas de 10 mm refusé : au-delà de 1 mm, il faut une machine référencée et une course connue (référencement ($H) non constaté depuis le dernier redémarrage de la carte).' }, 409); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'X− · 10 mm · 250 mm/min : Refusé : Pas de 10 mm refusé : machine non référencée ou course inconnue. Faites la prise d’origine (Machine) ; sinon 1 mm au plus.');
    assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'failed');
    // 0.1 mm and 500 mm/min reach the request.
    f.advance(400); f.el('step-0.1').click(); f.el('feeds').children.find((b) => b.getAttribute('data-feed') === '500').click(); await f.flush();
    assert.equal(f.el('pad-mid').textContent, '0.1 mm'); assert.equal(f.el('ks-jog-settings').textContent, 'Vitesse · 500 mm/min…');
    f.arrows['Z-'].click(); await f.flush();
    const small = f.motion('jog').at(-1); assert.deepEqual([small.body.axis, small.body.direction, small.body.step, small.body.feed], ['Z', -1, 0.1, 500]);
    // A refusal of the pilot (ECONTROL): job-controls' actionable sentence, as is.
    f.answer(small, { message: 'Machine pilotée par Tablette B.', code: 'ECONTROL', owner: { kind: 'touch', id: 't-b-1234', label: 'Tablette B' } }, 409); await f.flush();
    assert.match(f.el('jog-feedback').textContent, /Refusé : pilotage attribué à « Tablette B »/);
    // No answer: uncertain, the position must be checked.
    f.advance(400); f.arrows['Z+'].click(); await f.flush(); f.motion('jog').at(-1).onerror(); await f.flush();
    assert.match(f.el('jog-feedback').textContent, /Sans réponse du serveur : vérifiez la position avant de continuer\.$/); assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'uncertain');
    noPreview(f);
    // The coordinates are never written here (coordinate-display.js copies the reported ones).
    assert(!/mpos\.[xyz]\s*=|wpos\.[xyz]\s*=/.test(fs.readFileSync(path.join(__dirname, 'touch', 'real-motion.js'), 'utf8')));
  }
  // 2b. Unhomed at rest: the hint under the coordinates; a frame unknown: no « repère inconnu » label.
  {
    const f = await ready({ homed: false, operator: { reportUnits: 'mm', wcs: null } });
    assert.equal(f.el('jog-feedback').textContent, 'Machine non référencée : pas de 1 mm au plus, pas de continu. Prise d’origine dans Machine.');
    assert.equal(f.el('coordinate-frame-label').textContent, ' · mm');
  }
  // 3. « Continu »: hidden without the server's capability; hold → keepalive → release (jog-stop), the
  //    held button never greyed out while canJog is false (its release must reach it).
  {
    const f = await ready({ capabilities: caps(true, { jogContinuous: { supported: true, enabled: false, reason: DISABLED } }) });
    assert.equal(f.el('step-hold').hidden, true, '« Continu » hidden without jogContinuous');
    f.el('step-hold').fire('click'); await f.flush(); assert.equal(f.el('pad-mid').textContent, '1 mm', 'no hold mode without the capability');
  }
  {
    const f = await ready();
    assert.equal(f.el('step-hold').hidden, false);
    const start = await holding(f);
    assert.deepEqual([start.body.axis, start.body.direction, start.body.feed, start.body.transportId], ['Y', 1, 250, 'stream-one']);
    assert.equal(f.el('pad-mid').textContent, 'continu');
    f.tick(150); await f.flush();
    assert.equal(f.motion('jog-keepalive').length, 0, 'no keepalive before the server accepted');
    f.answer(start, { jogId: 'j1', keepalivePeriodMs: 100, keepaliveTimeoutMs: 250, distanceMm: 49, message: 'Déplacement continu Y+ (au plus 49 mm, 250 mm/min) : relâchez pour arrêter.' }); await f.flush();
    assert.equal(f.el('jog-msg').textContent, 'Déplacement continu Y+ : relâchez pour arrêter.');
    assert(Array.from(f.intervals.values()).some((i) => i.ms === 100), 'keepalive every 100 ms (the server period, at most 150 ms)');
    f.tick(100); await f.flush();
    const k = f.motion('jog-keepalive'); assert.equal(k.length, 1); assert.equal(k[0].body.jogId, 'j1');
    f.answer(k[0], { active: true, jogId: 'j1' }); await f.flush();
    f.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).', jog: { axis: 'Y', direction: 1, feed: 250, distanceMm: 49 } }, { activeState: 'Jog' })]); await f.flush();
    assert.equal(f.arrows['Y+'].disabled, false, 'the held button stays enabled'); assert.equal(f.arrows['X+'].disabled, true, 'the others wait');
    assert.equal(f.arrows['Y+'].getAttribute('data-held'), 'true');
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 2);
    const before = f.motion().length;
    f.arrows['Y+'].fire('pointerup');
    assert.equal(f.motion().length, before + 1, 'jog-stop leaves synchronously on release');
    const stop = f.motion('jog-stop')[0]; assert.equal(stop.body.jogId, 'j1'); assert.equal(stop.body.port, 'COM3');
    f.arrows['Y+'].fire('lostpointercapture'); f.tick(100); f.tick(100); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'one stop'); assert.equal(f.motion('jog-keepalive').length, 2, 'no keepalive after the release');
    f.answer(stop, { message: 'Déplacement arrêté : annulation de jog (0x85) envoyée.' }); await f.flush();
    // Contre-revue M2: the answer says the cancel went out, not that the machine stopped. Still Jog and
    // cancelling: « attente de l'arrêt » stays; a recent report at rest: « arrêté ».
    assert.equal(f.el('jog-feedback').textContent, 'Y+ · continu : annulation envoyée, attente de l’arrêt…');
    assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'sent');
    f.push([withMotion({ canJog: false, cancelling: true, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).' }, { activeState: 'Jog' })]); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Y+ · continu : annulation envoyée, attente de l’arrêt…');
    // A double press right after the release is ignored; later a new press starts a new jog.
    f.push([machine()]); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Y+ · continu : arrêté.'); assert.equal(f.el('jog-feedback').getAttribute('data-state'), 'confirmed');
    down(f.arrows['Y+']); await f.flush(); assert.equal(f.motion('jog-start').length, 1);
    f.advance(400); down(f.arrows['Y+']); await f.flush(); assert.equal(f.motion('jog-start').length, 2);
    // In hold mode a click never sends a step.
    f.arrows['X+'].fire('click'); await f.flush(); assert.equal(f.motion('jog').length, 0);
  }
  // Contre-revue P2-5: a press begun in « Continu », stopped by another press, the mode switched to a step
  // meanwhile, then released: the click that follows never sends a step.
  {
    const f = await ready();
    await started(f, 'j-mode');
    f.fireDoc('pointerdown', { target: f.el('step-1') });
    assert.equal(f.window.cncRealMotion.holding(), false);
    f.el('step-1').click(); await f.flush(); assert.equal(f.el('pad-mid').textContent, '1 mm');
    f.advance(400);
    f.arrows['Y+'].fire('pointerup'); f.arrows['Y+'].fire('click'); await f.flush();
    assert.equal(f.motion('jog').length, 0, 'no step from the release of a continuous press');
    // The next tap in step mode sends its step.
    f.advance(400); f.arrows['Y+'].fire('pointerdown', { pointerId: 8, button: 0 }); f.arrows['Y+'].fire('click'); await f.flush();
    assert.equal(f.motion('jog').length, 1, 'a tap begun in step mode sends its step');
  }
  // Two fingers: Y held in « Continu », the mode switched, X tapped in step mode, then Y released: no Y step.
  {
    const f = await ready();
    await started(f, 'j-two');
    f.fireDoc('pointerdown', { target: f.el('step-1') }); f.el('step-1').click(); await f.flush();
    f.advance(400); f.arrows['X+'].fire('pointerdown', { pointerId: 9, button: 0 }); f.arrows['X+'].fire('click'); await f.flush();
    assert.equal(f.motion('jog').length, 1); assert.equal(f.motion('jog')[0].body.axis, 'X');
    f.answer(f.motion('jog')[0], { message: 'ok' }); await f.flush(); f.push([machine({ revision: 'r-two' })]); await f.flush(); f.advance(400);
    f.arrows['Y+'].fire('pointerup'); f.arrows['Y+'].fire('click'); await f.flush();
    assert.equal(f.motion('jog').length, 1, 'no Y step from the first finger');
  }
  // Contre-revue: « arrêté » only for the controller whose jog was stopped (another one at rest proves nothing).
  {
    const f = await ready();
    await started(f, 'j-port');
    f.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).', jog: { axis: 'Y', direction: 1, feed: 250, distanceMm: 49 } }, { activeState: 'Jog' })]); await f.flush();
    f.arrows['Y+'].fire('pointerup');
    f.answer(f.motion('jog-stop')[0], { message: 'Déplacement arrêté : annulation de jog (0x85) envoyée.' }); await f.flush();
    f.push([machine({ port: 'COM4', controllerId: 'COM4', generation: 'gen-4' })]); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Y+ · continu : annulation envoyée, attente de l’arrêt…');
  }
  // Contre-revue M1: a step in flight is cancelled when the report goes stale, and stays followed until the
  // server lets it go (past its nominal time, « Déplacement précédent non terminé » still holds it).
  {
    const f = await ready();
    f.arrows['X+'].click(); await f.flush();
    f.answer(f.motion('jog').at(-1), { message: 'ok' }); await f.flush();
    f.push([machine({ fresh: false, activeState: 'Jog' })]); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'a stale report cancels the step in flight');
    const g = await ready();
    g.arrows['X+'].click(); await g.flush();
    g.answer(g.motion('jog').at(-1), { message: 'ok' }); await g.flush();
    g.advance(5000);
    g.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).' })]); await g.flush(); g.tick(1000);
    assert(allArrows(g).every((b) => b.disabled), 'still followed past its nominal time');
    g.screen.classList.remove('active'); g.fireWindow('cnc-screen-change', { detail: 'home' });
    assert.equal(g.motion('jog-stop').length, 1, 'leaving Préparer still cancels it');
    // Let go once the server no longer holds it.
    g.screen.classList.add('active'); g.fireWindow('cnc-screen-change', { detail: 'jog' });
    g.push([machine({ revision: 'r9' })]); await g.flush();
    assert.equal(g.arrows['X+'].disabled, false);
  }
  // Contre-revue M3: « Zéro XYZ » asked from a visible relay (v2 summary) while its own row is not shown.
  {
    const f = await ready();
    const via = f.el('body').appendChild(f.el('pv2-tool-zero'));
    f.zeros[3].noBox = true;
    f.zeros[3].click(); await f.flush();
    assert.equal(f.posts().filter((r) => r.body.action === 'prepare').length, 0, 'the hidden button itself does nothing');
    via.closest = (sel) => (sel === '#pv2-tool-zero' ? via : null);
    f.fireDoc('click', { target: via }); await f.flush();
    const prep = f.posts().filter((r) => r.body.action === 'prepare').at(-1);
    assert(prep, 'one request through the relay'); assert.deepEqual(prep.body.axes, ['X', 'Y', 'Z']);
    const g = await ready({ motion: Object.assign(machine().motion, { canSetOrigin: false, setOriginReason: 'Travail en cours.' }) });
    const gv = g.el('body').appendChild(g.el('pv2-tool-zero')); gv.closest = (sel) => (sel === '#pv2-tool-zero' ? gv : null);
    g.fireDoc('click', { target: gv }); await g.flush();
    assert.equal(g.posts().filter((r) => r.body.action === 'prepare').length, 0, 'refused origin: nothing through the relay');
  }
  // 4. Every exit stops the held jog: no keepalive after it.
  for (const [name, act] of [['pointercancel', (f) => f.arrows['Y+'].fire('pointercancel')], ['pointerleave', (f) => f.arrows['Y+'].fire('pointerleave')],
    ['blur', (f) => f.fireWindow('blur')], ['hidden', (f) => { f.document.hidden = true; f.fireDoc('visibilitychange'); }],
    ['screen', (f) => { f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' }); }],
    ['lock', (f) => f.fireWindow('cnc-screen-lock', { detail: true })], ['pagehide', (f) => f.fireWindow('pagehide', { persisted: false })],
    // Guard 2: another press anywhere (a second finger may open a sheet that makes the cross inert).
    ['another press', (f) => f.fireDoc('pointerdown', { target: f.el('ks-jog-settings') })]]) {
    const f = await ready();
    await started(f, 'j-' + name);
    act(f);
    assert.equal(f.motion('jog-stop').length, 1, name + ' sends jog-stop'); assert.equal(f.motion('jog-stop')[0].body.jogId, 'j-' + name);
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 0, name + ': no keepalive after it');
  }
  // A press on the held button itself (the same finger) keeps the jog.
  {
    const f = await ready();
    await started(f, 'j-same');
    f.fireDoc('pointerdown', { target: f.arrows['Y+'] });
    assert.equal(f.window.cncRealMotion.holding(), true);
  }
  // Guard 3: the held button hidden (« Revenir à la comparaison » in v2) or under an inert ancestor (a
  // sheet or dialog opened over it): stopped at the next keepalive tick, whatever the cause.
  for (const [name, act] of [['hidden card', (f) => { f.el('cross').noBox = true; }], ['inert', (f) => { f.el('main').inert = true; }]]) {
    const f = await ready();
    await started(f, 'j-' + name);
    act(f);
    f.tick(100); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, name + ': jog-stop at the next keepalive'); assert.equal(f.motion('jog-keepalive').length, 0, name + ': no keepalive sent');
    assert.equal(f.window.cncRealMotion.holding(), false);
  }
  // 5. Released before the server's answer: stop at once, and again with the jog's id when it comes.
  {
    const f = await ready();
    const start = await holding(f);
    f.arrows['Y+'].fire('pointerup');
    assert.equal(f.motion('jog-stop').length, 1); assert.equal(f.motion('jog-stop')[0].body.jogId, undefined);
    f.answer(start, { jogId: 'late', keepalivePeriodMs: 100 }); await f.flush();
    assert.equal(f.motion('jog-stop').length, 2); assert.equal(f.motion('jog-stop')[1].body.jogId, 'late');
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 0);
  }
  // 6. The stream lost while holding: jog-stop at once, and after the reconnection no jog-start again.
  {
    const f = await ready();
    await started(f, 'j6');
    await f.reconnect(machine());
    const stops = f.motion('jog-stop'); assert.equal(stops.length, 1, 'the stream loss sends jog-stop'); assert.equal(stops[0].body.jogId, 'j6');
    f.tick(100); f.tick(1000); await f.flush();
    assert.equal(f.motion('jog-start').length, 1, 'no jog-start repeated after the reconnection');
    assert.equal(f.lastStatus().transportConnected, true, 'the stream is back'); assert.equal(f.arrows['Y+'].disabled, false);
    assert.equal(f.motion('jog-keepalive').length, 0);
    f.arrows['Y+'].fire('pointerup'); await f.flush(); assert.equal(f.motion('jog-stop').length, 1);
    // Offline flag: only a hint (B-4), the stream still answers: the jog goes on, and its stop still goes out.
    f.advance(400); down(f.arrows['Y+']); await f.flush();
    const s2 = f.motion('jog-start').at(-1); f.answer(s2, { jogId: 'j6b', keepalivePeriodMs: 100 }); await f.flush();
    f.fireWindow('offline'); await f.flush();
    assert(!f.motion('jog-stop').some((r) => r.body.jogId === 'j6b'), 'the offline flag alone does not stop the jog');
    f.arrows['Y+'].fire('pointerup'); await f.flush();
    assert(f.motion('jog-stop').some((r) => r.body.jogId === 'j6b'), 'jog-stop sent although offline');
  }
  // 7. A refused keepalive (409): no more keepalives, the message shown, a stop sent; a keepalive saying the jog ended: no more.
  {
    const f = await ready();
    await started(f, 'j7');
    f.tick(100); await f.flush();
    f.answer(f.motion('jog-keepalive')[0], { message: 'Maintien reçu trop tard : déplacement annulé (0x85).' }, 409); await f.flush();
    assert.match(f.el('jog-feedback').textContent, /Maintien reçu trop tard/);
    f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, 1, 'no keepalive after a refusal');
    assert.equal(f.motion('jog-stop').length, 1);
    f.advance(400); down(f.arrows['Y+']); await f.flush();
    f.answer(f.motion('jog-start').at(-1), { jogId: 'j7b', keepalivePeriodMs: 100 }); await f.flush();
    f.tick(100); await f.flush();
    f.answer(f.motion('jog-keepalive').at(-1), { active: false, message: 'Déplacement terminé ou annulé : fin de la course autorisée atteinte.' }); await f.flush();
    assert.match(f.el('jog-feedback').textContent, /fin de la course autorisée atteinte/);
    const n = f.motion('jog-keepalive').length; f.tick(100); await f.flush(); assert.equal(f.motion('jog-keepalive').length, n);
    // The server's own end of a jog (motion.lastJog, not a release): said once.
    f.push([withMotion({ lastJog: { result: 'cancelled', reason: 'keepalive', message: 'maintien non confirmé à temps (connexion lente ou perdue)', at: 99 } })]); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Déplacement arrêté : maintien non confirmé à temps (connexion lente ou perdue).');
  }
  // 8. Per axis in « Continu »: only the arrows of the axis the server refuses are greyed out; all three: the sentence.
  {
    const f = await ready();
    f.el('step-hold').click(); await f.flush();
    const why = 'Maintien continu impossible : référencement ($H) non constaté depuis le dernier redémarrage de la carte. Utilisez les pas (1 mm au plus).';
    f.push([withMotion({ continuousReason: { X: why, Y: '', Z: '' } })]); await f.flush();
    assert.deepEqual(['X+', 'X-', 'Y+', 'Z-'].map((a) => f.arrows[a].disabled), [true, true, false, false], 'only X greyed out');
    assert.equal(f.arrows['X+'].title, 'Continu indisponible : machine non référencée ou course inconnue. Faites la prise d’origine (Machine) ou utilisez les pas.');
    down(f.arrows['X+']); await f.flush(); assert.equal(f.motion('jog-start').length, 0, 'no jog-start on a refused axis');
    f.push([withMotion({ continuousReason: { X: why, Y: why, Z: why } })]); await f.flush();
    assert.equal(f.el('jog-msg').textContent, 'Continu indisponible : machine non référencée ou course inconnue. Faites la prise d’origine (Machine) ou utilisez les pas.');
    // Just after a homing, a $23 axis at 0 may be ambiguous to the server: what to do is said.
    const amb = 'Maintien continu impossible : convention de course ambiguë à cette position (Y 0, bit $23 à 1 : -400 → 0 ou 0 → 400) : aucun déplacement n’y est sûr dans les deux ; déplacez l’axe depuis l’interface classique et faites vérifier la convention (étape 0 de HANDOFF.md).';
    f.push([withMotion({ continuousReason: { X: '', Y: amb, Z: '' } })]); await f.flush();
    assert.equal(f.arrows['Y+'].title, 'Course Y ambiguë à cette position : refaites la prise d’origine (Machine) pour fixer le sens de la course.');
  }
  // 9. Zéro X / XYZ / XY: a ticket from the server for all the button's axes, then the confirmation here;
  //    nothing on expiry; the refusal said; the report's units in the dialog.
  {
    const f = await ready();
    f.el('jog-zero-x').click(); await f.flush();
    const prep = f.posts().at(-1);
    assert.deepEqual([prep.body.action, prep.body.operation, prep.body.axes, prep.body.transportId], ['prepare', 'set-origin', ['X'], 'stream-one']);
    assert.equal(f.posts().filter((r) => r.body.action === 'set-origin').length, 0, 'nothing set before the confirmation');
    f.answer(prep, { nonce: 'n1', name: 'Origine X du repère G54 à la position actuelle (G10 L20 P1 X0)', operation: 'set-origin', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    assert.equal(f.el('real-motion-ticket').hidden, false);
    // Contre-revue P3: the work position (Travail column) goes to 0, not the machine position.
    assert.equal(f.el('real-motion-ticket-plan').textContent, 'Repère G54 · X 12.500 → 0 · mm. Aucun axe ne bouge.');
    assert.match(f.el('real-motion-ticket-name').textContent, /G10 L20 P1 X0/);
    assert.equal(f.el('real-motion-origin-confirm').textContent, 'Confirmer l’origine X · G54');
    assert.match(f.el('real-motion-ticket-left').textContent, /^Confirmation valable 15 s · Arrêter reste disponible/);
    assert.equal(f.el('real-banner').inert, false, 'the strip (Pause / Arrêter) stays usable'); assert.equal(f.el('main').inert, true);
    assert.equal(f.arrows['X+'].disabled, true, 'no move while an origin waits');
    f.el('real-motion-origin-confirm').click(); await f.flush();
    const set = f.posts().at(-1); assert.deepEqual([set.body.action, set.body.nonce, set.body.generation], ['set-origin', 'n1', 'gen-1']);
    assert.equal(f.el('real-motion-ticket').hidden, true); assert.equal(f.el('main').inert, false, 'the background is restored');
    f.answer(set, { message: 'Origine X du repère G54 réglée à la position actuelle (G10 L20 P1 X0).' }); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Origine X · G54 réglée.');
    // Zéro XYZ: one preparation for the three axes, never three zeros in a row.
    const count = f.posts().filter((r) => r.body.action === 'prepare').length;
    f.el('jog-zero-xyz').click(); await f.flush();
    assert.equal(f.posts().filter((r) => r.body.action === 'prepare').length, count + 1);
    const xyz = f.posts().at(-1); assert.deepEqual(xyz.body.axes, ['X', 'Y', 'Z']);
    f.answer(xyz, { nonce: 'n2', name: 'Origine X Y Z du repère G54 à la position actuelle (G10 L20 P1 X0 Y0 Z0)', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    assert.equal(f.el('real-motion-ticket-plan').textContent, 'Repère G54 · X 12.500 → 0 · Y 3.000 → 0 · Z 1.000 → 0 · mm. Aucun axe ne bouge.');
    // Expired ticket: the confirmation sends nothing.
    f.advance(16000); const n = f.posts().length; f.el('real-motion-origin-confirm').click(); await f.flush();
    assert.equal(f.posts().length, n, 'an expired ticket sends nothing');
    assert.equal(f.el('real-motion-ticket').hidden, true);
    // laser-z.js renames Zéro XYZ to Zéro XY and sets data-axis="xy": the origin follows the label.
    f.push([machine({ revision: 'rev-9' })]); await f.flush();
    f.el('jog-zero-xyz').setAttribute('data-axis', 'xy'); f.el('jog-zero-xyz').click(); await f.flush();
    assert.deepEqual(f.posts().at(-1).body.axes, ['X', 'Y']);
    f.answer(f.posts().at(-1), { message: 'Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.' }, 409); await f.flush();
    assert.equal(f.el('jog-feedback').textContent, 'Origine X Y : Refusé : Repère de travail inconnu ou état $G trop ancien : attendez un rapport récent.');
    // Cancel and Escape send nothing; leaving Préparer closes the dialog.
    f.el('jog-zero-y').click(); await f.flush();
    f.answer(f.posts().at(-1), { nonce: 'n3', name: 'Origine Y', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    f.el('real-motion-ticket').fire('keydown', { key: 'Escape' });
    assert.equal(f.el('real-motion-ticket').hidden, true); assert.equal(f.el('jog-feedback').textContent, 'Définition d’origine annulée : rien n’a été envoyé.');
    f.el('jog-zero-y').click(); await f.flush();
    f.answer(f.posts().at(-1), { nonce: 'n4', name: 'Origine Y', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' });
    assert.equal(f.el('real-motion-ticket').hidden, true, 'the dialog closes when Préparer is left');
    assert.equal(f.posts().filter((r) => r.body.action === 'set-origin').length, 1, 'only the confirmed one was set');
    // Préparer left before the ticket arrived: nothing is offered.
    f.screen.classList.add('active'); f.fireWindow('cnc-screen-change', { detail: 'jog' });
    f.el('jog-zero-z').click(); await f.flush();
    f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' });
    f.answer(f.posts().at(-1), { nonce: 'n5', name: 'Origine Z', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    assert.equal(f.el('real-motion-ticket').hidden, true);
  }
  // 10. The capability switched off while holding: stop, arrows greyed out with the sentence.
  {
    const f = await ready();
    await started(f, 'j10');
    f.push([machine({ capabilities: caps(false) })]); await f.flush();
    f.tick(100); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'stopped at the next keepalive tick (live but disabled → refused) or by the release');
    assert(allArrows(f).filter((b) => b !== f.arrows['Y+']).every((b) => b.disabled));
  }
  // 11. A step in flight (guard 4): leaving Préparer, the lock, a hidden page, the stream or the pilot
  //     lost send one jog-stop of the port (the server watches a step only for the stream closing).
  for (const [name, act] of [['screen', (f) => { f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' }); }],
    ['lock', (f) => f.fireWindow('cnc-screen-lock', { detail: true })], ['hidden', (f) => { f.document.hidden = true; f.fireDoc('visibilitychange'); }],
    ['pilot', async (f) => { f.push([machine({ control: { owner: { kind: 'touch', id: 't-b-1234', label: 'Tablette B', present: true }, lastChange: { type: 'takeover', at: 6 } } })]); await f.flush(); }]]) {
    const f = await ready();
    f.arrows['X+'].click(); await f.flush();
    f.answer(f.motion('jog')[0], { message: 'Pas envoyé.' }); await f.flush();
    await act(f);
    const stops = f.motion('jog-stop'); assert.equal(stops.length, 1, name + ': one jog-stop for the step in flight'); assert.equal(stops[0].body.port, 'COM3');
    await act(f); assert.equal(f.motion('jog-stop').length, 1, name + ': not twice');
  }
  {
    // Over (a report shows the machine free): leaving sends nothing.
    const f = await ready();
    f.arrows['X+'].click(); await f.flush(); f.answer(f.motion('jog')[0], { message: 'Pas envoyé.' }); await f.flush();
    f.push([machine({ revision: 'rev-3' })]); await f.flush();
    f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' });
    assert.equal(f.motion('jog-stop').length, 0, 'a step over is not cancelled');
  }
  {
    // Stopped while the step request was on its way: the stop may reach the server first; the step's late
    // answer sends jog-stop again (review Astra, P1).
    const f = await ready();
    f.arrows['X+'].click(); await f.flush();
    f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' });
    assert.equal(f.motion('jog-stop').length, 1);
    f.answer(f.motion('jog')[0], { message: 'Pas envoyé.' }); await f.flush();
    assert.equal(f.motion('jog-stop').length, 2, 'stopped again after the late answer');
  }
  {
    // Past its nominal time (accelerations) while the reports still show it moving: still followed, so
    // leaving Préparer still stops it (review Astra, P1).
    const f = await ready();
    f.el('step-10').click(); f.el('feeds').children.find((b) => b.getAttribute('data-feed') === '100').click(); await f.flush();
    f.arrows['X+'].click(); await f.flush(); f.answer(f.motion('jog')[0], { message: 'Pas envoyé.' }); await f.flush();
    f.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).' }, { activeState: 'Jog' })]); await f.flush();
    for (let i = 0; i < 9; i++) { f.advance(1000); f.push([withMotion({ canJog: false, jogReason: 'Déplacement précédent non terminé : attendez le retour au repos (Idle).' }, { activeState: 'Jog', revision: 'r' + i })]); await f.flush(); f.tick(1000); await f.flush(); }
    f.screen.classList.remove('active'); f.fireWindow('cnc-screen-change', { detail: 'home' });
    assert.equal(f.motion('jog-stop').length, 1, 'a step still reported moving is still stopped');
  }
  {
    // The state changed under an open origin ticket (alarm): Confirmer sends nothing, the sentence says why (P2).
    const f = await ready();
    f.el('jog-zero-x').click(); await f.flush();
    f.answer(f.posts().at(-1), { nonce: 'n9', name: 'Origine X', expiresIn: 15, generation: 'gen-1' }); await f.flush();
    f.push([machine({ activeState: 'Alarm', alarmCode: 1 })]); await f.flush();
    const n = f.posts().length;
    f.el('real-motion-origin-confirm').click(); await f.flush();
    assert.equal(f.posts().length, n, 'nothing sent'); assert.equal(f.el('real-motion-ticket').hidden, true);
    assert.equal(f.el('jog-feedback').textContent, 'Alarme 1 : Déverrouiller ($X) ou Prise d’origine ($H) dans Machine.');
  }
  // Locked screen, Préparer not shown, a hidden page: nothing is sent, even by a programmatic click.
  for (const [name, act] of [['locked', (f) => { f.window.cncScreenLock = { locked: () => true }; }], ['other screen', (f) => { f.screen.classList.remove('active'); }],
    ['hidden page', (f) => { f.document.hidden = true; }]]) {
    const f = await ready();
    act(f);
    f.arrows['X+'].fire('click'); f.el('step-hold').fire('click'); down(f.arrows['Y+']); f.zeros[0].fire('click'); await f.flush();
    assert.equal(f.posts().filter((r) => r.body.action === 'motion' || r.body.action === 'prepare').length, 0, name + ': nothing sent');
  }
  // 12. One sentence per refusal row, in the order of the report's fields; every arrow greyed out, no request.
  const ROWS = [
    ['cancel unconfirmed (first, whatever else)', { activeState: 'Alarm', fresh: false, motion: Object.assign(machine().motion, { cancelUnconfirmed: true }) }, 'ANNULATION NON CONFIRMÉE : utilisez l’arrêt physique si la machine bouge encore'],
    ['stale report', { fresh: false, statusAgeMs: 7000 }, 'État machine trop ancien : attendez un rapport récent.'],
    ['another pilot', { control: { owner: { kind: 'touch', id: 't-b-1234', label: 'Tablette B', present: true }, lastChange: null } }, 'Pilotée par « Tablette B » : touchez Pilote (bandeau) pour prendre la main.'],
    ['old server', { capabilities: undefined, motion: undefined }, 'Ce serveur CNCjs ne permet pas les déplacements depuis la tablette.'],
    ['Grbl 0.9', { capabilities: caps(false, { jog: { supported: false, enabled: false, reason: 'Grbl 0.9j : le jog $J= et son annulation 0x85 exigent Grbl 1.1 ou plus.' } }) }, 'Grbl 0.9j : le jog $J= et son annulation 0x85 exigent Grbl 1.1 ou plus.'],
    ['probing', { probing: true }, 'Palpage en cours : attendez sa fin.'],
    ['loading', { loading: true }, 'Chargement en cours : attendez sa fin.'],
    ['running', { workflow: 'running', activeState: 'Run' }, 'Travail en cours : déplacement manuel impossible.'],
    ['paused', { workflow: 'paused', activeState: 'Hold:0' }, 'Travail en pause : reprenez-le ou arrêtez-le avant de déplacer.'],
    ['alarm', { activeState: 'Alarm', alarmCode: 1 }, 'Alarme 1 : Déverrouiller ($X) ou Prise d’origine ($H) dans Machine.'],
    ['homing', { homing: true, activeState: 'Idle' }, 'Prise d’origine en cours : attendez sa fin.'],
    ['jog of another', { activeState: 'Jog' }, 'Déplacement en cours : attendez l’arrêt.'],
    ['hold without a job', { activeState: 'Hold:0' }, 'Machine en pause : touchez Arrêter (bandeau), puis Prise d’origine.'],
    ['door', { activeState: 'Door:1' }, 'Porte de sécurité ouverte : fermez-la, puis touchez Arrêter (bandeau).'],
    ['sleep', { activeState: 'Sleep' }, 'Carte en veille : réinitialisez-la (bouton de la carte ou remise sous tension).'],
    ['other state', { activeState: 'Check' }, 'La machine doit être au repos : état Check.'],
    // Contre-revue m1: $13 unknown (reportUnits null) → read $$; $13=1 known (inches) → set $13=0, no reading.
    ['idle but refused ($13 unknown)', { operator: { reportUnits: null, wcs: 'G54' }, motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.' }) }, 'Réglage $13 inconnu : touchez Relire les réglages ($$).'],
    ['idle but refused ($13=1)', { operator: { reportUnits: 'in', wcs: 'G54' }, motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.' }) }, 'Rapports de la carte en pouces ($13=1) : réglez $13=0 sur la carte pour déplacer depuis la tablette.']];
  for (const [name, patch, sentence] of ROWS) {
    const f = await ready(patch);
    assert.equal(f.el('jog-msg').textContent, sentence, name);
    assert(allArrows(f).every((b) => b.disabled), name + ': every arrow greyed out');
    // The zeros follow the same rows, except a refusal of the jog alone ($13): the origin has its own (canSetOrigin).
    if (!/^idle but refused/.test(name)) assert(f.zeros.every((b) => b.disabled), name + ': the zeros too');
    else assert(f.zeros.every((b) => !b.disabled), name + ': the origin is not the jog');
    f.arrows['X+'].fire('click'); await f.flush();
    assert.equal(f.motion().length, 0, name + ': no request');
  }
  {
    // $13 unknown: « Relire les réglages ($$) » offered at rest; $13=1 known: not offered (a reading changes nothing).
    const f = await ready({ operator: { reportUnits: null, wcs: 'G54' }, motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.' }) });
    assert.equal(f.el('jog-read-settings').hidden, false);
    const inch = await ready({ operator: { reportUnits: 'in', wcs: 'G54' }, motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Rapports en pouces ($13=1) ou réglage $13 inconnu : le déplacement réel exige $13=0.' }) });
    assert.equal(inch.el('jog-read-settings').hidden, true, '$13=1 known: no « Relire »');
    // Contre-revue P2-2: « Réglage $22 inconnu » (capital R) is recognised; in alarm the reading needs $X first, said so.
    const cap22 = await ready({ motion: Object.assign(machine().motion, { canSetOrigin: false, setOriginReason: 'Réglage $22 inconnu : relisez les réglages de la carte.' }) });
    assert.equal(cap22.el('jog-read-settings').hidden, false, '« Réglage $22 inconnu » offers the reading');
    const al = await ready({ activeState: 'Alarm', alarmCode: 1, homeReason: 'Réglage $22 inconnu : relisez les réglages de la carte.',
      motion: Object.assign(machine().motion, { canJog: false, jogReason: 'Machine en alarme (ALARM:1) : déverrouillez ($X) ou référencez ($H) d’abord.', canSetOrigin: false, setOriginReason: 'Réglage $22 inconnu : relisez les réglages de la carte.' }) });
    const ALARM_REREAD = 'Alarme : touchez Déverrouiller ($X) dans Machine, puis Relire les réglages ($$), puis Prise d’origine ($H).';
    assert.equal(al.el('jog-msg').textContent, ALARM_REREAD);
    assert.equal(al.el('jog-read-settings').hidden, false); assert.equal(al.el('jog-read-settings').disabled, true);
    assert.equal(al.el('jog-read-settings').title, ALARM_REREAD, 'the greyed button says why');
    const v = 'Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).';
    const alv = await ready({ activeState: 'Alarm', capabilities: { jog: { supported: false, enabled: false, reason: v }, jogContinuous: { supported: false, enabled: false, reason: v }, setOrigin: { supported: false, enabled: false, reason: v } } });
    assert.equal(alv.el('jog-msg').textContent, ALARM_REREAD, 'version unknown in alarm: $X first');
    // The stream down (row 2), and nothing published since (rows 1 / 3).
    const g = await ready(); await g.reconnect(machine({ revision: 'x' })); g.lastStatus();
    g.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: machine(), transportConnected: false, simulation: false, pilot: null } });
    assert.equal(g.el('jog-msg').textContent, 'Suivi interrompu : déplacement bloqué jusqu’à son retour.');
    g.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: null, transportConnected: true, observedAt: g.now(), simulation: false, pilot: null } });
    assert.equal(g.el('jog-msg').textContent, 'Aucune machine connectée : touchez Connecter la CNC dans le Menu.');
    g.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: null, transportConnected: true, observedAt: g.now() - 5000, simulation: false, pilot: null } });
    assert.equal(g.el('jog-msg').textContent, 'État machine trop ancien : attendez un rapport récent.');
    // Row 0 even with the stream down.
    g.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: withMotion({ cancelUnconfirmed: true }), transportConnected: false, simulation: false, pilot: null } });
    assert.equal(g.el('jog-msg').textContent, 'ANNULATION NON CONFIRMÉE : utilisez l’arrêt physique si la machine bouge encore');
  }
  // Every sentence of the table has its EN and ES rows (the catalogue, i18n.js).
  {
    const sandbox = { window: {} };
    ['i18n-messages.js'].concat(fs.readdirSync(path.join(__dirname, 'touch')).filter((n) => /^i18n-messages-[a-z]+\.js$/.test(n))).forEach((n) => vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', n), 'utf8'), sandbox));
    const key = (v) => v.trim().replace(/\s+/g, ' ');
    const rows = new Map(sandbox.window.CNCTouchMessages.map((r) => [key(r[0]), r]));
    const src = fs.readFileSync(path.join(__dirname, 'touch', 'real-motion.js'), 'utf8');
    const phrases = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]).filter((p) => /[a-zà-ÿ]{2}/i.test(p));
    assert(phrases.length > 60);
    for (const p of phrases) { const r = rows.get(key(p)); assert(r, 'catalogue row: ' + p); assert(r[1] && r[2], 'EN and ES: ' + p); }
    // Table 4.3, its five patterns.
    for (const [reason, out] of [
      ['Pas de 10 mm refusé : au-delà de 1 mm, il faut une machine référencée et une course connue (course $130 inconnue).', /^Pas de 10 mm refusé : machine non référencée/],
      ['Maintien continu impossible : course $131 inconnue. Utilisez les pas (1 mm au plus).', /^Continu indisponible : machine non référencée/],
      ['Broche en rotation : maintien continu refusé ; pas de 0.1 mm au plus.', /^Broche en rotation : pas de continu, pas de 0,1 mm au plus\. Arrêtez la broche \(M5\)\.$/],
      ['Avance hors limites pour Z : de 1 à 300 mm/min (limite $112).', /^Vitesse trop élevée pour Z : 300 mm\/min au plus\./],
      ['Pas refusé : position machine X 5 hors de la course supposée (-400 → 0) : vérifiez $23 et l’origine machine.', /^Position machine incohérente avec la course/]]) {
      const f = await ready();
      f.arrows['X+'].click(); await f.flush();
      f.answer(f.motion('jog').at(-1), { message: reason }, 409); await f.flush();
      assert.match(f.el('jog-feedback').textContent.replace(/^X\+ · 1 mm · 250 mm\/min : Refusé : /, ''), out, reason);
    }
  }
  // 13. Sobriety: twenty identical reports write nothing; a simulation event is ignored; three seconds
  //     without any state event grey everything out.
  {
    const f = await ready();
    const writes = f.writes();
    for (let i = 0; i < 20; i++) { f.push([machine()]); await f.flush(); }
    assert.equal(f.writes(), writes, 'no DOM write for identical reports');
    f.window.dispatchEvent({ type: 'cnc-job-status', detail: { machine: machine({ activeState: 'Alarm' }), transportConnected: true, simulation: true } });
    assert.equal(f.arrows['X+'].disabled, false, 'a simulation event cannot overwrite the real state');
    f.advance(3100); Array.from(f.intervals.values()).filter((i) => i.ms === 1000).forEach((i) => i.fn()); await f.flush();
    assert(allArrows(f).every((b) => b.disabled) && f.zeros.every((b) => b.disabled), 'stale: everything greyed out');
    // job-controls' own clock may say the stream is muted first: either sentence says why.
    assert.match(f.el('jog-msg').textContent, /^(État machine trop ancien : attendez un rapport récent\.|Suivi interrompu : déplacement bloqué jusqu’à son retour\.)$/);
  }
  // 14. Arrêter (strip, Suivi or preview viewer) during a hold ends the keepalives in the same tap,
  //     before the stop is relayed; the job's stop still leaves at once (Audit 31, R-M1).
  for (const target of ['#t-stop', '#job-stop', '#home-job-stop', '#preview-job-stop']) {
    const f = await ready();
    await started(f, 'j-stop');
    f.push([withMotion({ jog: { axis: 'Y', direction: 1, feed: 250, distanceMm: 49 } }, { canStop: true, activeState: 'Jog' })]); await f.flush();
    const n = f.posts().length;
    f.fireDoc('click', { target: { closest: (sel) => (sel.split(',').indexOf(target) >= 0 ? {} : null) } });
    f.el('job-stop').click();
    const sent = f.posts().slice(n).map((r) => r.body.action + (r.body.operation ? ':' + r.body.operation : ''));
    assert.deepEqual(sent, ['motion:jog-stop', 'stop'], target + ': jog-stop and stop in the same tap (' + sent.join(', ') + ')');
    assert.equal(f.window.cncRealMotion.holding(), false, target + ': no longer holding');
    const keepalives = f.motion('jog-keepalive').length;
    f.tick(100); await f.flush();
    assert.equal(f.motion('jog-keepalive').length, keepalives, target + ': no keepalive after Arrêter');
  }
  // Audit 31 (R-M2): a jog-start left without an answer sends a precautionary jog-stop of the port at
  // once; a refusal (answered) sends none.
  {
    const f = await ready();
    const start = await holding(f);
    start.onerror(); await f.flush();
    const stops = f.motion('jog-stop');
    assert.equal(stops.length, 1, 'precautionary jog-stop after a jog-start without answer');
    assert.equal(stops[0].body.port, machine().port); assert(!('jogId' in stops[0].body), 'without jogId: any jog of ours');
    f.arrows['Y+'].fire('pointerup'); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'the release then sends nothing more (no hold left)');
  }
  {
    const f = await ready();
    const start = await holding(f);
    start.ontimeout(); await f.flush();
    assert.equal(f.motion('jog-stop').length, 1, 'precautionary jog-stop after a jog-start timeout');
  }
  {
    const f = await ready();
    const start = await holding(f);
    f.answer(start, { message: 'Refusé.', code: 'ETOUCH_X' }, 409); await f.flush();
    assert.equal(f.motion('jog-stop').length, 0, 'a refused jog-start (answered) needs no stop');
  }
  // 15. Idle release (control.lastChange.type 'idle') and lease ended by absence: told by job-controls.
  {
    const f = load(); const id = f.controls().clientId();
    await f.connect(machine({ control: { owner: null, lastChange: { type: 'idle', port: 'COM3', owner: null, at: 5, previous: { kind: 'touch', id, label: 'Tablette ab12' }, idleMs: 300000 } } }));
    const p = f.lastStatus().pilot;
    assert.equal(p.state, 'free'); assert.match(p.sentence, /^Libéré après 5 min d’inactivité \(« Tablette ab12 »\)\. Libre/);
    assert.match(f.el('job-feedback').textContent, /Pilotage de cet appareil libéré après 5 min d’inactivité\./);
    assert.equal(f.arrows['X+'].disabled, false, 'a free pilot does not block');
  }
  {
    const f = load(); const id = f.controls().clientId();
    await f.connect(machine({ control: { owner: null, lastChange: { type: 'expired', port: 'COM3', owner: null, at: 7, previous: { kind: 'touch', id, label: 'Tablette ab12' } } } }));
    assert.match(f.el('job-feedback').textContent, /^Pilotage de cet appareil libéré : appareil absent trop longtemps\./);
  }
  // 16. One owner of the arrows: real-motion.js only, never the preview endpoint; no « EXPÉRIMENTAL ».
  {
    const src = fs.readFileSync(path.join(__dirname, 'touch', 'real-motion.js'), 'utf8');
    assert(!/touch-motion\/preview|EXPÉRIMENTAL|real-motion-open/.test(src));
    assert(!fs.existsSync(path.join(__dirname, 'touch', 'dry-motion.js')), 'dry-motion.js is gone');
  }
  console.log('PASS: Préparer real: one step per tap, Continu hold → keepalive → release and every exit, guards (another press, hidden or inert held button, step in flight, locked or hidden screen), Zéro X / XYZ / XY in two steps, one actionable sentence per refusal (EN/ES rows), no write for identical reports, stale greys out, Arrêter in the same tap.');
})().catch((e) => { console.error(e); process.exit(1); });
