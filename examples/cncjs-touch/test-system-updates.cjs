'use strict';
// Réglages → Système → Mises à jour du système (system-updates.js): status read on the Système tab,
// « Rechercher » posts a check, « Installer » needs a second tap, the page follows a running task
// until it ends, a needed restart is shown, a job blocks both buttons, a failure is told; requests
// go to api/touch-updates only, with the session token.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'touch', 'system-updates.js'), 'utf8');

function el(tag) {
  const n = { tagName: tag.toUpperCase(), children: [], parentNode: null, hidden: false, disabled: false, type: '', className: '', attrs: {}, handlers: {}, _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    insertBefore(c) { c.parentNode = n; n.children.push(c); return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener(t, f) { n.handlers[t] = f; }, click() { if (n.handlers.click) n.handlers.click(); },
    get lastChild() { return n.children[n.children.length - 1] || null; },
    classList: { contains: (c) => c === 'active' } };
  return n;
}
function find(root, pred) { let hit = null; const walk = (x) => x.children.forEach((c) => { if (!hit && pred(c)) hit = c; walk(c); }); walk(root); return hit; }

const state = { machine: { workflow: 'idle' } }, requests = [], listeners = {}, timers = [];
const section = el('div'), panel = el('section'); panel.attrs['data-settings-tab'] = 'system';
const document = { hidden: false, createElement: el, addEventListener() {}, getElementById: (id) => (id === 'ks-system' ? section : id === 'screen-settings' ? panel : null) };
const window = { addEventListener: (n, f) => { listeners[n] = f; }, cncI18n: { t: (s) => s, locale: 'fr-FR' }, cncState: { get: () => ({ apiBase: '/api', machine: state.machine }) } };
function XMLHttpRequest() { this.headers = {}; }
XMLHttpRequest.prototype.open = function (m, u) { this.method = m; this.url = u; };
XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
XMLHttpRequest.prototype.send = function (body) { requests.push(this); this.body = body ? JSON.parse(body) : null; };
const answer = (x, status, data) => { x.status = status; x.responseText = JSON.stringify(data); x.onload(); };
const localStorage = { getItem: () => JSON.stringify({ state: { session: { token: 'tok' } } }) };
vm.runInNewContext(source, { window, document, XMLHttpRequest, localStorage, JSON, Date,
  setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; }, Array });
const box = section.children[0], text = () => box.textContent;
const check = find(box, (c) => c.tagName === 'BUTTON' && /ks-updates-check/.test(c.className));
const install = find(box, (c) => c.tagName === 'BUTTON' && /ks-updates-install/.test(c.className));
const reboot = find(box, (c) => /ks-updates-reboot/.test(c.className));
const IDLE = { available: true, running: null, checkedAt: null, packages: [], lastRun: null, rebootRequired: false };
const flush = () => { const due = timers.splice(0).filter((x) => x.f && x.ms === 3000); due.forEach((x) => x.f()); return due.length; };

// The page opened on the Système tab reads the status once; then the tab event reads it again.
while (requests.length) answer(requests.shift(), 200, IDLE);
listeners['cnc-settings-tab']({ detail: 'system' });
let x = requests.pop();
assert.equal(x.method, 'GET'); assert.equal(x.url, '/api/touch-updates'); assert.equal(x.headers.Authorization, 'Bearer tok');
answer(x, 200, IDLE);
assert.match(text(), /Pas encore vérifié depuis le démarrage de CNCjs/);
assert.equal(check.disabled, false); assert.equal(reboot.hidden, true);

// Rechercher: a POST, the running task followed every 3 s until it ends.
check.click();
x = requests.pop(); assert.equal(x.method, 'POST'); assert.deepEqual(x.body, { action: 'check' });
answer(x, 200, { ...IDLE, running: { action: 'check', since: 1 } });
assert.match(text(), /Recherche des mises à jour en cours/); assert.equal(check.disabled, true); assert.equal(install.disabled, true);
assert.equal(flush(), 1);
x = requests.pop(); assert.equal(x.method, 'GET');
const at = new Date(2026, 10, 7, 23, 5).getTime();
answer(x, 200, { ...IDLE, checkedAt: at, packages: [{ name: 'zlib1g', security: true }, { name: 'libfoo1', security: false }], lastRun: { action: 'check', ok: true, message: '2 mise(s) à jour disponible(s).' } });
assert.equal(flush(), 0, 'polling stops once the task ended');
assert.match(text(), /2 mise\(s\) à jour disponible\(s\), dont 1 de sécurité \(vérifié à 23:05\)/);
assert.match(text(), /zlib1g, libfoo1/);
assert.equal(check.disabled, false);

// Installer: the first tap only arms, the second posts.
install.click();
assert.equal(requests.length, 0); assert.equal(install.textContent, 'Confirmer : installer les mises à jour'); assert.match(text(), /Touchez à nouveau pour confirmer/);
install.click();
x = requests.pop(); assert.deepEqual(x.body, { action: 'install' });
answer(x, 200, { ...IDLE, running: { action: 'install', since: 2 } });
assert.match(text(), /Installation des mises à jour en cours… n’éteignez pas la tablette/);
flush(); x = requests.pop();
answer(x, 200, { ...IDLE, checkedAt: at, rebootRequired: true, lastRun: { action: 'install', ok: true, message: '2 paquet(s) mis à jour. Redémarrage de la tablette nécessaire.' } });
assert.match(text(), /Système à jour \(vérifié à 23:05\)/);
assert.equal(reboot.hidden, false); assert.match(text(), /2 paquet\(s\) mis à jour/);

// A refusal from the server is told; a failed task is told as a failure.
check.click(); answer(requests.pop(), 409, { message: 'Un travail est en cours ou en pause sur /dev/ttyUSB0 : commande système refusée.' });
assert.match(text(), /commande système refusée/);
listeners['cnc-settings-tab']({ detail: 'system' });
answer(requests.pop(), 200, { ...IDLE, checkedAt: at, lastRun: { action: 'install', ok: false, message: 'Droits administrateur manquants : faites la mise à jour par SSH.' } });
assert.match(text(), /Échec : Droits administrateur manquants/);

// A job blocks both buttons and disarms a pending confirmation.
install.click(); assert.equal(install.getAttribute('data-state'), 'armed');
state.machine = { workflow: 'running' }; listeners['cnc-job-status']();
assert.equal(install.getAttribute('data-state'), 'idle');
assert.equal(check.disabled, true); assert.equal(install.disabled, true);
assert.match(text(), /Travail en cours : mise à jour impossible/);
check.click(); install.click(); assert.equal(requests.length, 0);

// Off Linux (or without apt) the server says why; both buttons stay off.
state.machine = { workflow: 'idle' };
listeners['cnc-settings-tab']({ detail: 'system' });
answer(requests.pop(), 200, { available: false, reason: 'Mises à jour indisponibles : pas de gestionnaire apt sur l’ordinateur du serveur CNCjs.' });
assert.match(text(), /pas de gestionnaire apt/); assert.equal(check.disabled, true);
for (const page of ['index.html', 'simulation.html']) assert(fs.readFileSync(path.join(__dirname, 'touch', page), 'utf8').includes('system-updates.js?v='), page);
console.log('PASS system updates: status on the Système tab, check and install posted to api/touch-updates, install confirmed by a second tap, running task followed until it ends, restart needed shown, server refusal and failed task told, blocked during a job, unavailable without apt.');
