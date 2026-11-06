'use strict';
// Chasse aux bugs, angle B, n° 3 (non commité). job-stream.js : une fois la santé passée
// (available=true), un refus de session (403 du middleware express-jwt de CNCjs, ou 401)
// sur GET touch-events n'est jamais reconnu comme tel : la page rouvre le flux avec le même
// jeton toutes les 30 s, ne refait jamais la santé (seul endroit qui dit « Session CNCjs
// expirée. ») et rien ne demande un renouvellement (app.js ne renouvelle qu'au chargement
// et toutes les 12 h). Attendu : le refus est nommé comme une session expirée.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const requests = [];
function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = () => { requests.push(this); }; this.abort = () => {}; }
let tick = null;
const root = { navigator: { onLine: true }, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
let now = 1e6;
const status = [], disconnects = [];
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'expired-token', clientId: 't-abc-1234', clock: () => now, timer: root, XMLHttpRequest: XHR,
  onStatus: (s) => status.push(s), onSnapshot() {}, onDisconnect: (r) => disconnects.push(r) });
// Santé acceptée au chargement (jeton encore valide).
const health = requests.shift();
assert.match(health.url, /custom\/health$/);
health.status = 200; health.responseText = JSON.stringify({ loaded: true, protocol: 1 }); health.onload();
const first = requests.shift();
assert.match(first.url, /touch-events/);
// Le jeton expire : le serveur ferme ce flux, puis refuse les suivants (403 « Forbidden Access », texte).
first.status = 200; first.responseText = ''; first.onload();
for (let s = 0; s < 300; s++) {           // 5 minutes
  now += 1000; tick();
  const r = requests.shift();
  if (!r) continue;
  r.status = 403; r.responseText = 'Forbidden Access';
  if (r.onload) r.onload();
}
const urls = requests.map((r) => r.url);
const said = status.concat(disconnects).join(' | ');
console.log('raisons vues :', Array.from(new Set(status.concat(disconnects))).join(' | '));
assert.match(said, /Session CNCjs expirée|Session CNCjs requise/, 'un 403 du flux doit être dit « session expirée » (observé : « Flux interrompu… » en boucle, santé jamais refaite)');
console.log('PASS', urls.length);
