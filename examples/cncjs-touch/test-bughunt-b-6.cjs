'use strict';
// Chasse aux bugs, angle B, n° 6 (non commité). job-stream.js mesure ses délais de reprise
// (retryAt l. 34, healthAt l. 79) sur l'horloge murale (job-controls.js:608 ne passe pas
// d'horloge : Date.now), comme job-controls.js (nextPoll l. 436). Un recul de l'horloge
// (synchronisation NTP au démarrage du kiosque, RTC à l'heure locale) après un échec gèle
// la reprise pendant toute la durée du recul. Attendu : nouvel essai ~60 s plus tard.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const requests = [];
function XHR() { this.open = (m, u) => { this.url = u; }; this.setRequestHeader = () => {}; this.send = () => { requests.push(this); }; this.abort = () => {}; }
let tick = null;
const root = { navigator: { onLine: true }, XMLHttpRequest: XHR, setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
let now = 1e9;
context.window.CNCJobStream.create({ apiBase: '/api', token: () => 'valid', clock: () => now, timer: root, XMLHttpRequest: XHR, onStatus() {}, onSnapshot() {}, onDisconnect() {} });
// Kiosque qui démarre avant CNCjs : la santé échoue (connexion refusée).
requests.shift().onerror();
now -= 3600 * 1000;                      // l'horloge recule d'une heure
for (let s = 0; s < 300; s++) { now += 1000; tick(); }   // 5 minutes réelles
console.log('requêtes de santé en 5 min après le recul :', requests.length);
assert.ok(requests.length > 0, 'la santé doit être retentée (observé : aucune tentative avant ~1 h)');
