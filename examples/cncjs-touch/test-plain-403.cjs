'use strict';
// B-5 (bug hunt 2026-11-06). In production CNCjs refuses an expired or invalid token with a
// plain-text 403 « Forbidden Access » (src/server/app.js, express-jwt). The page read it as
// « Commande désactivée dans CNCjs. », « Recherche impossible. » or « (HTTP 403) ». A 401, or a
// 403 without a JSON body, is a refused session in these modules (job-controls.js:
// test-session-refused.cjs). A 403 with a JSON message keeps its message.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { createDOM } = require('./dom-fixture.cjs');

function settings(file) {
  const { document, node } = createDOM(['settings']);
  node('screen-settings').setAttribute('data-settings-tab', 'system');
  const section = node('ks-system'), requests = [], handlers = {};
  function XHR() { this.headers = {}; requests.push(this); }
  XHR.prototype.open = function (m, u) { this.method = m; this.url = u; };
  XHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XHR.prototype.send = function (body) { this.body = body ? JSON.parse(body) : null; };
  const window = { addEventListener: (n, f) => { handlers[n] = f; }, cncState: { get: () => ({ apiBase: '/api', machine: { workflow: 'idle' } }) } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/' + file, 'utf8'), { window, document, XMLHttpRequest: XHR, Date, JSON, Array,
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'tok' } } }) }, setTimeout: () => 1, clearTimeout() {} });
  const box = section.children[section.children.length - 1];
  const raw = (x, status, text) => { x.status = status; x.responseText = text; x.onload(); };
  return { requests, handlers, box, button: (t) => box.querySelectorAll('button').find((b) => b.textContent === t), raw, text: () => [box].concat(box.querySelectorAll('*')).map((n) => n.textContent || '').join(' ') };
}
const SESSION = /Session CNCjs requise : ouvrez CNCjs et connectez-vous\./;

// Wi-Fi scan refused with the plain-text 403.
let p = settings('wifi-settings.js');
p.button('Rechercher les réseaux').click();
p.raw(p.requests.find((r) => r.method === 'POST'), 403, 'Forbidden Access');
assert.match(p.text(), SESSION, 'wifi: plain 403 = session');
// A refusal with its JSON message keeps it.
p.button('Rechercher les réseaux').click();
p.raw(p.requests.filter((r) => r.method === 'POST').at(-1), 409, JSON.stringify({ message: 'Refusé : travail en cours.' }));
assert.match(p.text(), /Refusé : travail en cours\./);

// Host command: the state read refused, then the run refused, with the plain-text 403.
p = settings('tablet-actions.js');
p.handlers['cnc-settings-tab']({ detail: 'system' });
p.raw(p.requests.find((r) => r.url === '/api/commands'), 200, JSON.stringify({ records: [{ id: 'r1', title: 'Redémarrer', enabled: true }] }));
const run = () => { p.button('Redémarrer').click(); p.button('Confirmer : Redémarrer').click(); };
run();
p.raw(p.requests.filter((r) => r.url === '/api/touch-job').at(-1), 403, 'Forbidden Access');
assert.match(p.text(), SESSION, 'tablet: plain 403 on the state read = session (not « illisible »)');
run();
p.raw(p.requests.filter((r) => r.url === '/api/touch-job').at(-1), 200, JSON.stringify({ controllers: [] }));
p.raw(p.requests.find((r) => r.method === 'POST'), 403, 'Forbidden Access');
assert.match(p.text(), SESSION, 'tablet: plain 403 on run = session (not « Commande désactivée »)');
assert.doesNotMatch(p.text(), /désactivée/);
// The disabled command (403 with its JSON message) stays what the server says.
run();
p.raw(p.requests.filter((r) => r.url === '/api/touch-job').at(-1), 200, JSON.stringify({ controllers: [] }));
p.raw(p.requests.filter((r) => r.method === 'POST').at(-1), 403, JSON.stringify({ msg: 'Commande désactivée.', message: 'Commande désactivée.' }));
assert.match(p.text(), /Commande désactivée\./);

// Journal → Serveur refused with the plain-text 403.
{
  const { document, node, element, activeScreens } = createDOM([]);
  const requests = [], handlers = {};
  function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
  const card = element('div', 'history-card');
  document.querySelector = (sel) => (sel === '#screen-history .ks-history-card' ? card : node('panel'));
  document.querySelectorAll = () => [];
  const window = { cncSessionJournal: null, cncState: { get: () => ({ apiBase: '/api' }) }, CNCJobStream: {}, addEventListener(n, f) { handlers[n] = f; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/session-journal.js', 'utf8'), { window, Date });
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/real-history.js', 'utf8'), { document, window, Date, Blob, XMLHttpRequest: XHR,
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'tok' } } }) } });
  activeScreens.add('history'); handlers['cnc-screen-change']({ detail: 'history' });
  card.querySelectorAll('*').find((e) => e.id === 'real-history-source-server').click();
  const x = requests.at(-1); x.status = 403; x.responseText = 'Forbidden Access'; x.onload();
  const shown = node('real-history-list').children.map((li) => li.children[0].textContent);
  assert.deepEqual(shown, ['Session CNCjs requise.'], 'history: plain 403 = session (not « HTTP 403 »)');
}
console.log('PASS');
