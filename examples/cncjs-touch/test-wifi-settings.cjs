'use strict';
// Réglages → Système → Wi-Fi (wifi-settings.js): current network read on the Système tab, scan on
// request, a protected network asks its password, a saved or open one does not, the password field
// is emptied as soon as it is sent, a job blocks every button; requests go to api/touch-wifi only.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'touch', 'wifi-settings.js'), 'utf8');

function el(tag) {
  const n = { tagName: tag.toUpperCase(), children: [], parentNode: null, hidden: false, disabled: false, value: '', type: '', id: '', className: '', attrs: {}, handlers: {},
    _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    insertBefore(c) { c.parentNode = n; n.children.push(c); return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener(t, f) { n.handlers[t] = f; }, click() { if (n.handlers.click) n.handlers.click(); }, focus() {},
    querySelectorAll(sel) { const out = []; const walk = (x) => x.children.forEach((c) => { if (sel === 'button' && c.tagName === 'BUTTON') out.push(c); walk(c); }); walk(n); return out; },
    get lastChild() { return n.children[n.children.length - 1] || null; },
    classList: { contains: (c) => c === 'active' } };
  return n;
}
function find(root, pred) { let hit = null; const walk = (x) => x.children.forEach((c) => { if (!hit && pred(c)) hit = c; walk(c); }); walk(root); return hit; }

function setup(state) {
  const section = el('div'), panel = el('section'), requests = [], listeners = {};
  panel.attrs['data-settings-tab'] = 'system';
  const document = { hidden: false, createElement: el, getElementById: (id) => (id === 'ks-system' ? section : id === 'screen-settings' ? panel : null) };
  const window = { addEventListener: (n, f) => { listeners[n] = f; }, cncI18n: { t: (s) => s }, cncState: { get: () => ({ apiBase: '/api', machine: state.machine }) } };
  function XMLHttpRequest() { this.headers = {}; }
  XMLHttpRequest.prototype.open = function (m, u) { this.method = m; this.url = u; };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XMLHttpRequest.prototype.send = function (body) { requests.push(this); this.body = body ? JSON.parse(body) : null; };
  const answer = (x, status, data) => { x.status = status; x.responseText = JSON.stringify(data); x.onload(); };
  const localStorage = { getItem: () => JSON.stringify({ state: { session: { token: 'tok' } } }) };
  vm.runInNewContext(source, { window, document, XMLHttpRequest, localStorage, JSON, setTimeout: (f) => f(), Array });
  const box = section.children[0];
  const by = (text) => find(box, (c) => c.tagName === 'BUTTON' && c.textContent === text);
  return { box, requests, answer, listeners, by, find: (pred) => find(box, pred), window };
}

const state = { machine: { workflow: 'idle' } };
const s = setup(state);
// Système tab opened: the current network is read once.
s.listeners['cnc-settings-tab']({ detail: 'system' });
let x = s.requests.pop(); assert.equal(x.method, 'GET'); assert.equal(x.url, '/api/touch-wifi'); assert.equal(x.headers.Authorization, 'Bearer tok');
s.answer(x, 200, { available: true, ssid: 'Livebox', signal: 59, saved: ['Livebox', 'Airbox'] });
// (also read when the page opened on the Système tab)
while (s.requests.length) s.answer(s.requests.pop(), 200, { available: true, ssid: 'Livebox', signal: 59, saved: [] });
assert.match(s.box.textContent, /Connecté à « Livebox » · 59 %/);
// Scan: a POST, then the list.
s.by('Rechercher les réseaux').click();
x = s.requests.pop(); assert.deepEqual(x.body, { action: 'scan' });
s.answer(x, 200, { networks: [{ ssid: 'Livebox', signal: 59, secure: true, inUse: true, saved: true }, { ssid: 'Atelier', signal: 70, secure: true, inUse: false, saved: false }, { ssid: 'Invités', signal: 40, secure: false, inUse: false, saved: false }] });
const net = (name) => s.find((c) => c.tagName === 'BUTTON' && c.textContent.indexOf(name) === 0);
assert(net('Livebox') && net('Atelier') && net('Invités'));
const input = s.find((c) => c.id === 'wifi-password'), form = input.parentNode.parentNode;
// A protected new network: its password is asked; too short refused before any request.
net('Atelier').click(); assert.equal(form.hidden, false); assert.equal(input.parentNode.hidden, false);
input.value = 'court'; s.by('Se connecter').click(); assert.equal(s.requests.length, 0); assert.match(s.box.textContent, /trop court/);
input.value = 'secret-pass-1'; s.by('Se connecter').click();
x = s.requests.pop(); assert.deepEqual(x.body, { action: 'connect', ssid: 'Atelier', password: 'secret-pass-1' });
assert.equal(input.value, '', 'password field emptied as soon as it is sent');
s.answer(x, 200, { message: 'Connecté au réseau Wi-Fi « Atelier ».', ssid: 'Atelier' });
assert.match(s.box.textContent, /Connecté au réseau Wi-Fi « Atelier »/); assert.equal(form.hidden, true);
x = s.requests.pop(); assert.equal(x.method, 'GET', 'current network read again after joining');
s.answer(x, 200, { available: true, ssid: 'Atelier', signal: 70, saved: [] });
// A saved network joins without a password; an open one shows no password field.
net('Livebox').click(); assert.match(s.box.textContent, /enregistré : laissez vide/);
s.by('Se connecter').click(); x = s.requests.pop(); assert.deepEqual(x.body, { action: 'connect', ssid: 'Livebox', password: '' });
s.answer(x, 409, { message: 'Un travail est en cours ou en pause sur COM3 : commande système refusée.' });
assert.match(s.box.textContent, /commande système refusée/, 'server refusal shown as it comes');
net('Invités').click(); assert.equal(input.parentNode.hidden, true, 'open network: no password field');
s.by('Annuler').click(); assert.equal(form.hidden, true);
// During a job: every button disabled, nothing sent.
state.machine = { workflow: 'running' }; s.listeners['cnc-job-status']();
assert.equal(s.by('Rechercher les réseaux').disabled, true); assert.equal(net('Atelier').disabled, true);
s.by('Rechercher les réseaux').click(); assert.equal(s.requests.length, 0);
assert.match(s.box.textContent, /Travail en cours : réseau Wi-Fi non modifiable/);
for (const page of ['index.html', 'simulation.html']) assert(fs.readFileSync(path.join(__dirname, 'touch', page), 'utf8').includes('wifi-settings.js?v='), page);
console.log('PASS wifi settings: current network on the Système tab, scan, password asked only for a new protected network, field emptied on send, saved and open networks, server refusals shown, blocked during a job.');
