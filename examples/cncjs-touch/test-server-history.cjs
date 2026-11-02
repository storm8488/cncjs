'use strict';
// Journal "Serveur" view (F4): GET api/touch-history?limit=&before= paged by the seq cursor,
// read-only, "no entry", HTTP and network errors, a clear split between this session's local
// journal and the server's durable history, and only listed fields shown (no secret, no raw
// entry). Fake XMLHttpRequest: nothing leaves the process.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { document, node, element, activeScreens } = require('./dom-fixture.cjs').createDOM([]);
const requests = [], handlers = {};
function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = (b) => { this.body = b; requests.push(this); }; this.abort = () => { this.aborted = true; }; }
const answer = (x, data, status = 200) => { x.status = status; x.responseText = typeof data === 'string' ? data : JSON.stringify(data); x.onload(); };
const card = element('div', 'history-card'), filterAll = element('button'), filterErrors = element('button');
filterAll.setAttribute('data-history-filter', 'all'); filterErrors.setAttribute('data-history-filter', 'errors');
document.querySelector = (sel) => (sel === '#screen-history .ks-history-card' ? card : node('panel'));
document.querySelectorAll = (sel) => (sel === '[data-history-filter]' ? [filterAll, filterErrors] : []);
const window = { cncSessionJournal: null, cncState: { get: () => ({ apiBase: '/cnc/api' }) }, CNCJobStream: {}, addEventListener(n, f) { handlers[n] = f; } };
vm.runInNewContext(fs.readFileSync(__dirname + '/touch/session-journal.js', 'utf8'), { window, Date });
const context = { document, window, Date, Blob, XMLHttpRequest: XHR, localStorage: { getItem: (k) => (k === 'cnc' ? JSON.stringify({ state: { session: { token: 'tok' } } }) : null) } };
window.cncSessionJournal = context.window.cncSessionJournal;
vm.runInNewContext(fs.readFileSync(__dirname + '/touch/real-history.js', 'utf8'), context);
const list = () => node('real-history-list').children.map((li) => li.children[0].textContent + (li.children[1] && li.children[1].textContent ? ' | ' + li.children[1].textContent : ''));
// Hidden journal: nothing built, nothing read from the server.
assert.equal(card.children.length, 0); assert.equal(requests.length, 0);
activeScreens.add('history'); handlers['cnc-screen-change']({ detail: 'history' });
// Built by the module: found in the card's tree (the fixture's getElementById only knows its own ids).
const byId = (id) => card.querySelectorAll('*').find((e) => e.id === id);
const bar = card.children[0], server = byId('real-history-source-server'), session = byId('real-history-source-session');
assert.equal(bar.className, 'ks-history-source'); assert.equal(session.getAttribute('aria-pressed'), 'true');
assert.match(byId('real-history-scope').textContent, /^Journal de session : cet appareil seulement, 100 événements/);
assert.equal(requests.length, 0, 'the session journal is local');
// Server view: first page, newest first, cursor-free.
server.click();
assert.equal(server.getAttribute('aria-pressed'), 'true'); assert.equal(session.getAttribute('aria-pressed'), 'false');
assert.match(byId('real-history-scope').textContent, /^Historique serveur : enregistré par CNCjs pour tous les appareils.*Lecture seule\./);
assert.equal(filterErrors.disabled, true, 'the session filters do not apply to the server history');
let r = requests.at(-1); assert.equal(r.method, 'GET'); assert.equal(r.url, '/cnc/api/touch-history?limit=5'); assert.equal(r.headers.Authorization, 'Bearer tok'); assert.equal(r.body, null);
assert.deepEqual(list(), ['Lecture de l’historique serveur…']); assert.equal(node('real-history-next').disabled, true);
const at = (s) => '2026-10-30T10:00:' + String(s).padStart(2, '0') + '.000Z';
const page1 = [
  { seq: 9, at: at(9), event: 'control', change: 'takeover', previous: { kind: 'touch', id: 't-a', label: 'Tablette A' }, owner: { kind: 'touch', id: 't-b', label: 'Tablette B' }, reason: 'Changement d’équipe', actor: { kind: 'touch', id: 't-b', label: 'Tablette B', user: 'ana' }, controller: { port: 'COM3' } },
  { seq: 8, at: at(8), event: 'finish', result: 'error', errors: 2, program: 'Part.nc', jobId: '0123456789ab', fingerprint: 'sha256:' + 'f'.repeat(64), actor: { kind: 'system', id: 'grbl', label: 'machine' }, controller: { port: 'COM3' } },
  { seq: 7, at: at(7), event: 'start', program: 'Part.nc', fromLine: 120, actor: { kind: 'socket', id: 'cncjs', label: 'interface CNCjs' }, controller: { port: 'COM3', type: 'Grbl' }, nonce: 'SECRET-NONCE', token: 'SECRET-TOKEN', extra: 'SECRET-FIELD' },
  { seq: 6, at: at(6), event: 'alarm', code: 9, actor: { kind: 'system', label: 'machine' } },
  { seq: 5, at: at(5), event: 'mystery', program: 'X.nc' }
];
answer(r, { entries: page1, total: 12, skipped: 1, more: true });
const rows = list();
assert.equal(rows.length, 5);
assert.match(rows[0], / — Pilotage repris \| avant : Tablette A · après : Tablette B · motif : Changement d’équipe · par Tablette B · COM3$/);
assert.match(rows[1], / — Terminé avec erreurs · Part\.nc \| erreurs : 2 · par machine · COM3$/);
assert.match(rows[2], / — Travail démarré · Part\.nc \| depuis la ligne 120 · par interface CNCjs · COM3$/);
assert.match(rows[3], / — Alarme \| code 9 · par machine$/); assert.match(rows[4], / — mystery · X\.nc$/);
assert.equal(node('real-history-list').children[3].getAttribute('data-kind'), 'alarm');
const shown = JSON.stringify(rows); for (const secret of ['SECRET', '0123456789ab', 'sha256', 't-a', 't-b', 'ana']) assert(!shown.includes(secret), 'not shown: ' + secret);
assert.equal(node('real-history-page').textContent, 'Serveur · page 1 · 12 entrées · 1 ligne(s) illisible(s) ignorée(s)');
assert.equal(node('real-history-prev').disabled, true); assert.equal(node('real-history-next').disabled, false);
// Next page: cursor = the oldest seq shown; the last page has no next; back to the first page.
node('real-history-next').click(); r = requests.at(-1); assert.equal(r.url, '/cnc/api/touch-history?limit=5&before=5');
answer(r, { entries: [{ seq: 4, at: at(4), event: 'load', program: 'Part.nc' }], total: 12, skipped: 0, more: false });
assert.equal(list().length, 1); assert.equal(node('real-history-page').textContent, 'Serveur · page 2 · 12 entrées');
assert.equal(node('real-history-next').disabled, true); assert.equal(node('real-history-prev').disabled, false);
node('real-history-prev').click(); r = requests.at(-1); assert.equal(r.url, '/cnc/api/touch-history?limit=5');
// While a page is read, Prev and Next wait; a read left behind (source switched) is aborted and its answer dropped.
assert.equal(node('real-history-prev').disabled, true); assert.equal(node('real-history-next').disabled, true);
answer(r, { entries: page1, total: 12, skipped: 0, more: true });
session.click(); assert.equal(r.aborted, undefined, 'an answered read is not aborted');
server.click(); const slow = requests.at(-1); session.click();
assert.equal(slow.aborted, true); assert.equal(slow.onload, null, 'its answer is dropped');
assert.match(list()[0], /Journal ouvert sur cet appareil/);
// Empty history, older page empty, HTTP errors, session expired, network error, invalid JSON.
server.click(); session.click(); server.click(); answer(requests.at(-1), { entries: [], total: 0, skipped: 0, more: false });
assert.deepEqual(list(), ['Aucune entrée dans l’historique serveur.']); assert.equal(node('real-history-page').textContent, 'Serveur · page 1 · 0 entrées');
session.click(); server.click(); answer(requests.at(-1), { message: 'Historique indisponible.' }, 500);
assert.deepEqual(list(), ['Historique serveur indisponible (HTTP 500) : Historique indisponible.']);
assert.equal(node('real-history-list').children[0].getAttribute('data-kind'), 'alarm');
session.click(); server.click(); answer(requests.at(-1), { message: 'Session CNCjs requise.' }, 401); assert.deepEqual(list(), ['Session CNCjs requise.']);
session.click(); server.click(); requests.at(-1).onerror(); assert.match(list()[0], /^Historique serveur injoignable/);
session.click(); server.click(); answer(requests.at(-1), '<html>proxy</html>', 200); assert.match(list()[0], /^Historique serveur indisponible \(HTTP 200\)\.$/);
// Back to the session journal: local events again, filters usable, no server read.
const before = requests.length; session.click();
assert.equal(filterErrors.disabled, false); assert.equal(requests.length, before);
assert.match(list()[0], /Journal ouvert sur cet appareil/); assert.match(node('real-history-page').textContent, /^Page 1 \/ 1/);
// Leaving the journal on the server view aborts a pending read; coming back reads again.
server.click(); const pending = requests.at(-1); handlers['cnc-screen-change']({ detail: 'home' }); assert.equal(pending.aborted, true);
handlers['cnc-screen-change']({ detail: 'history' }); assert.notEqual(requests.at(-1), pending); assert.equal(requests.at(-1).url, '/cnc/api/touch-history?limit=5');
// Read-only: the view never sends anything but GET.
assert(requests.every((x) => x.method === 'GET' && x.body === null));
console.log('PASS server history (F4): session vs server sources, paged by before, read-only, empty, HTTP/network/invalid errors, stale answers ignored, listed fields only (no secret).');
