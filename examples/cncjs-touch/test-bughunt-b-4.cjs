'use strict';
// Chasse aux bugs, angle B, n° 4 (non commité). Le kiosque ouvre http://localhost:8000/touch/
// (INSTALL.md:48,76) : la page et CNCjs sont sur la même tablette. Chromium met
// navigator.onLine à false dès qu'aucune interface autre que la boucle locale n'est active
// (Wi-Fi coupé, hors de portée, ou pendant un changement de réseau depuis Réglages → Wi-Fi).
// job-stream.js (l. 26, 38, 78, 99, 109) ne fait alors plus aucune requête, alors que le
// serveur (localhost) répond. Attendu : avec une API sur la même origine locale, l'état
// reste suivi. Observé : aucune requête, « Réseau indisponible… » jusqu'au retour du Wi-Fi.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const requests = [];
function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
let tick = null;
const root = { navigator: { onLine: false }, location: { origin: 'http://localhost:8000', hostname: 'localhost' }, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
let now = 1e6; const reasons = [];
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', clientId: 't-abc-1234', clock: () => now, timer: root, XMLHttpRequest: XHR,
  onStatus: (s) => reasons.push(s), onSnapshot() {}, onDisconnect: (r) => reasons.push(r) });
for (let s = 0; s < 120; s++) { now += 1000; tick(); }
console.log('requêtes en 2 min :', requests.length, '; raison :', reasons[reasons.length - 1]);
assert.ok(requests.length > 0, 'page servie par localhost, Wi-Fi coupé : la santé / le flux local doivent encore partir');
console.log('PASS');
