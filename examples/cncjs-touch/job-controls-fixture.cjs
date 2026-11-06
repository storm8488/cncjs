'use strict';
// Offline fixture of the real (non-simulation) job controls: cnc-state.js, job-stream.js,
// program-check-view.js and job-controls.js in one VM context, a fake XMLHttpRequest that
// records every request (none leaves the process), a stored session token and a
// controllable clock. Used by the attribution of control (F5), travel pre-check (F2)
// and program identity (A5) tests.
const fs = require('fs'), vm = require('vm'), path = require('path');
function load(options = {}) {
  let now = options.now || 1700000000000, created = 0;
  const nodes = {}, requests = [], listeners = {}, events = [], intervals = new Map(), periods = new Map(), reloads = [];
  let timerId = 0;
  const storage = options.storage || new Map([['cnc', JSON.stringify({ state: { session: { token: 'offline-fixture' } } })]]);
  const doc = { hidden: false, activeElement: null };
  function element(id, tag) {
    const node = { id, tagName: tag || 'DIV', value: '', className: '', hidden: false, disabled: false, inert: false, isConnected: true, checked: false,
      handlers: {}, attributes: {}, children: [], parentNode: null, style: {},
      addEventListener(n, f) { (this.handlers[n] || (this.handlers[n] = [])).push(f); },
      removeEventListener(n, f) { this.handlers[n] = (this.handlers[n] || []).filter((x) => x !== f); },
      fire(n, event) { (this.handlers[n] || []).slice().forEach((f) => f.call(this, event || {})); },
      click() { if (!this.disabled) this.fire('click'); },
      appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c) { return this.appendChild(c); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      focus() { doc.activeElement = this; }, getClientRects() { return this.hidden ? [] : [{}]; }, contains(t) { return t === this; } };
    // Writing textContent replaces the children, as in a browser.
    let content = '';
    Object.defineProperty(node, 'textContent', { get: () => content, set(v) { content = String(v); node.children = []; }, enumerable: true });
    return node;
  }
  const el = (id) => nodes[id] || (nodes[id] = element(id));
  // Elements written with the hidden attribute in the panel markup start hidden.
  ['job-dialog', 'pilot-dialog', 'pilot-form', 'pilot-takeover', 'job-travel', 'job-program-check', 'job-note'].forEach((id) => { el(id).hidden = true; });
  const body = element('body', 'BODY'); body.getAttribute = () => null; body.appendChild(el('real-banner')); body.appendChild(el('main'));
  Object.assign(doc, { body, getElementById: el, querySelector: () => el('panel'),
    querySelectorAll: (sel) => (sel === '[role="dialog"]' ? [el('job-dialog'), el('pilot-dialog')] : []),
    createElement: (tag) => element('created-' + (++created), String(tag).toUpperCase()),
    addEventListener(n, f) { (listeners['doc:' + n] || (listeners['doc:' + n] = [])).push(f); },
    removeEventListener(n, f) { listeners['doc:' + n] = (listeners['doc:' + n] || []).filter((x) => x !== f); } });
  function XHR() { this.responseText = ''; this.status = 0; this.headers = {}; this.open = (method, url) => { this.method = method; this.url = url; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = (b) => { this.body = b && JSON.parse(b); requests.push(this); }; this.abort = () => { this.aborted = true; }; }
  const window = { location: { pathname: '/cnc/touch/', hostname: options.hostname || '' }, performance: options.performance, navigator: { onLine: options.onLine !== false, maxTouchPoints: options.touchPoints === undefined ? 5 : options.touchPoints }, XMLHttpRequest: XHR,
    setInterval(fn, ms) { const id = ++timerId; intervals.set(id, fn); periods.set(id, ms); return id; }, clearInterval(id) { intervals.delete(id); periods.delete(id); },
    addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).slice().forEach((f) => f(e)); } };
  const localStorage = options.localStorage || { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  // options.app: app.js is loaded too (between job-stream.js and job-controls.js, as in index.html).
  const session = new Map();
  const context = { window, document: doc, XMLHttpRequest: XHR, localStorage,
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) },
    location: { origin: 'http://192.168.1.29:8000', reload: () => reloads.push(now) }, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
    Date: class extends Date { static now() { return now; } }, Math, Promise, JSON, setInterval: window.setInterval, clearInterval: window.clearInterval };
  vm.createContext(context);
  // options.language ('en' / 'es'): the page's catalog and cncI18n are loaded first, as in index.html.
  if (options.language) { storage.set('cncjs-touch-language-v1', options.language); doc.documentElement = {}; doc.title = ''; }
  for (const file of (options.language ? ['i18n-messages.js', 'i18n.js'] : []).concat(['cnc-state.js', 'job-stream.js'], options.app ? ['app.js'] : [], ['program-check-view.js', 'job-controls.js'])) vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', file), 'utf8'), context);
  const isStream = (url) => /\/touch-events(\?clientId=[^&]+)?$/.test(url);
  const flush = () => new Promise(setImmediate);
  function answer(xhr, data, status = 200) { xhr.status = status; xhr.responseText = JSON.stringify(data); xhr.onload(); }
  let sequence = 0;
  function packet(controllers) { return { version: 1, epoch: 'server-one', sequence: ++sequence, sentAt: now, transportId: 'stream-one', controllers }; }
  function machine(patch) {
    return Object.assign({ port: 'COM3', controllerId: 'COM3', generation: 'gen-1', type: 'Grbl', activeState: 'Idle', workflow: 'idle', fresh: true, statusAgeMs: 0, statusObservedAt: now,
      name: 'part.nc', originalName: 'Part.nc', revision: 'rev-1', total: 10, received: 0, canLoad: true, canStart: true, canResume: false, canPause: false, canStop: false,
      control: { owner: null, lastChange: null } }, patch || {});
  }
  let stream = null;
  function push(controllers) { stream.status = 200; stream.responseText += JSON.stringify(packet(controllers)) + '\n'; stream.onprogress(); }
  // Health, then the first stream packet: the page is connected with one controller.
  async function connect(first) {
    answer(requests.find((r) => r.url.endsWith('/custom/health')), { loaded: true, protocol: 1 });
    stream = requests.find((r) => isStream(r.url));
    push([first || machine()]); await flush();
    return stream;
  }
  const posts = () => requests.filter((r) => r.method === 'POST');
  const lastStatus = () => events.filter((e) => e.type === 'cnc-job-status').at(-1).detail;
  const key = (k, extra = {}) => { let prevented = false; (listeners['doc:keydown'] || []).slice().forEach((f) => f(Object.assign({ key: k, preventDefault() { prevented = true; }, stopImmediatePropagation() {} }, extra))); return prevented; };
  return { window, document: doc, el, nodes, requests, storage, events, listeners, flush, answer, machine, push, connect, posts, lastStatus, key, isStream,
    controls: () => window.cncJobControls, reloads, advance(ms) { now += ms; },
    // One second of the page: the 1 s loops (a 12 h timer of app.js is not run).
    tick() { Array.from(intervals.keys()).filter((id) => !(periods.get(id) > 1000)).forEach((id) => intervals.get(id)()); } };
}
module.exports = { load };
