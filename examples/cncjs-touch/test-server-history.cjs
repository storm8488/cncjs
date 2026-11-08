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
// Lot Journal m11: the message says « touchez Serveur à nouveau »; a second tap on Serveur reads again (same GET).
{
  const failed = requests.at(-1), count = requests.length; server.click();
  assert.equal(requests.length, count + 1, 'a second tap on Serveur after a network error reads again');
  assert.equal(requests.at(-1).method, 'GET'); assert.equal(requests.at(-1).url, '/cnc/api/touch-history?limit=5'); assert.notEqual(requests.at(-1), failed);
  assert.deepEqual(list(), ['Lecture de l’historique serveur…']); server.click(); assert.equal(requests.length, count + 1, 'no second read while one is pending');
  answer(requests.at(-1), { entries: [], total: 0, skipped: 0, more: false }); server.click(); assert.equal(requests.length, count + 1, 'no read again after a success');
}
// Lot Journal m12/m14: origin, jog, frame, machine have their own label (no raw key); a failed one shows its
// reason, without a doubled full stop, as an alarm. Outside control, a stop code (motion.js STOP_REASONS, jog/frame
// results) shows as its phrase, a Grbl error as « Grbl a refusé la ligne (error:N) »; an unknown code is not shown.
const reasonEntries = [
  { seq: 23, at: at(23), event: 'origin', result: 'failed', reason: 'Grbl a refusé la définition d’origine (error:9).', command: 'G10 L20 P1 X0 Y0', axes: ['X', 'Y'], actor: { kind: 'touch', label: 'Tablette atelier' }, controller: { port: 'COM3' } },
  { seq: 22, at: at(22), event: 'jog', result: 'cancelled', reason: 'operator', axis: 'X', controller: { port: 'COM3' } },
  { seq: 21, at: at(21), event: 'frame', result: 'ended', reason: '' },
  { seq: 20, at: at(20), event: 'jog-cancel-unconfirmed', reason: 'timeout' },
  { seq: 19, at: at(19), event: 'machine', operation: 'set-kind', machine: { kind: 'cnc' } },
  { seq: 18, at: at(18), event: 'jog', result: 'refused', reason: 'error:9', controller: { port: 'COM3' } },
  { seq: 17, at: at(17), event: 'frame', result: 'lost', reason: 'connection' },
  { seq: 16, at: at(16), event: 'origin', result: 'failed', reason: 'La machine a bougé pendant la définition d’origine (X 1.5, Y -2) : arrêtez et vérifiez le contrôleur.' }
];
session.click(); server.click();
answer(requests.at(-1), { entries: reasonEntries, total: 8, skipped: 0, more: false });
{
  const shown = list(), kinds = node('real-history-list').children.map((li) => li.getAttribute('data-kind'));
  assert.match(shown[0], / — Définition d’origine \| motif : Grbl a refusé la définition d’origine \(error:9\) · par Tablette atelier · COM3$/);
  assert.match(shown[1], / — Déplacement manuel \| motif : relâchement ou arrêt demandé · COM3$/); assert.match(shown[2], / — Cadrage$/);
  assert.match(shown[3], / — Arrêt de déplacement non confirmé$/); assert.match(shown[4], / — Fiche machine modifiée$/);
  assert.match(shown[5], / — Déplacement manuel \| motif : Grbl a refusé la ligne \(error:9\) · COM3$/);
  assert.match(shown[6], / — Cadrage \| motif : connexion au contrôleur perdue$/);
  assert.match(shown[7], / — Définition d’origine \| motif : La machine a bougé pendant la définition d’origine : arrêtez et vérifiez le contrôleur \(X 1\.5, Y -2\)$/);
  assert(!/operator|timeout|\bconnection\b/.test(JSON.stringify(shown)), 'no raw internal code: ' + shown.join(' | '));
  assert.deepEqual(kinds, ['alarm', 'workflow', 'workflow', 'workflow', 'workflow', 'workflow', 'workflow', 'alarm'], 'a failed origin is an alarm');
  assert(!JSON.stringify(shown).includes('G10'), 'the command line is not shown');
}
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
// Contre-revue: in the Spanish interface a reason is Spanish, its values kept (catalog of i18n-messages.js).
{
  const cat = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/touch/i18n-messages.js', 'utf8'), { window: cat });
  // Same lookup as i18n.js text(): a source written exactly as in the catalog gets its row as written.
  const es = new Map(cat.CNCTouchMessages.map((row) => [row[0].trim().replace(/\s+/g, ' '), row]));
  const t = (s) => { const p = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), r = es.get(p[2].replace(/\s+/g, ' ')); return !r ? s : r[0] === s ? r[2] : p[1] + r[2].trim() + p[3]; };
  const d = require('./dom-fixture.cjs').createDOM([]), esReq = [], h = {}, esCard = d.element('div', 'history-card');
  d.document.querySelector = (sel) => (sel === '#screen-history .ks-history-card' ? esCard : d.node('panel'));
  d.document.querySelectorAll = () => [];
  function EsXHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { esReq.push(this); }; this.abort = () => {}; }
  const w = { cncI18n: { t, html: t, language: 'es', locale: 'es-ES' }, cncSessionJournal: window.cncSessionJournal, cncState: window.cncState, CNCJobStream: {}, addEventListener(n, f) { h[n] = f; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/real-history.js', 'utf8'), { document: d.document, window: w, Date, Blob, XMLHttpRequest: EsXHR, localStorage: context.localStorage });
  d.activeScreens.add('history'); h['cnc-screen-change']({ detail: 'history' });
  esCard.querySelectorAll('*').find((e) => e.id === 'real-history-source-server').click();
  answer(esReq.at(-1), { entries: reasonEntries, total: 8, skipped: 0, more: false });
  const shown = d.node('real-history-list').children.map((li) => li.children[1].textContent);
  assert.equal(shown[0], 'motivo: Grbl rechazó la definición del origen (error:9) · por Tablette atelier · COM3');
  assert.equal(shown[1], 'motivo: soltado o parada solicitada · COM3'); assert.equal(shown[5], 'motivo: Grbl rechazó la línea (error:9) · COM3');
  assert.equal(shown[6], 'motivo: conexión con el controlador perdida');
  assert.equal(shown[7], 'motivo: La máquina se movió durante la definición del origen: detenga y compruebe el controlador (X 1.5, Y -2)');
  assert(!shown.some((s) => /définition|refusé|arrêt|perdue|bougé/.test(s)), 'no French left in the Spanish reasons: ' + shown.join(' | '));
}
console.log('PASS server history (F4): session vs server sources, paged by before, read-only, empty, HTTP/network/invalid errors, stale answers ignored, listed fields only (no secret).');
