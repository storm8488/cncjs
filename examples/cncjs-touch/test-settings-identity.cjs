'use strict';
// B-2 / E-2 (bug hunt 2026-11-06). The tablet that pilots the machine was refused a Wi-Fi scan:
// wifi-settings.js sent no clientId, so the server saw « http:<user> », not the « touch:<clientId> »
// that holds the lease (server side: src/server/services/touch/__tests__/bughunt-b-2.test.js).
// Réglages → Système requests now name this device as job-controls.js does (clientId, clientLabel):
// api/touch-wifi (wifi-settings.js) and api/commands/run (tablet-actions.js).
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const { createDOM } = require('./dom-fixture.cjs');
const controls = { clientId: () => 't-abc-1234', clientLabel: () => 'Tablette 1234' };

function page(file, withControls) {
  const { document, node } = createDOM(['settings']);
  const panel = node('screen-settings'), section = node('ks-system');
  panel.setAttribute('data-settings-tab', 'system');
  const requests = [], handlers = {};
  function XHR() { this.headers = {}; requests.push(this); }
  XHR.prototype.open = function (m, u) { this.method = m; this.url = u; };
  XHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XHR.prototype.send = function (body) { this.body = body ? JSON.parse(body) : null; };
  const window = { addEventListener: (n, f) => { handlers[n] = f; }, cncState: { get: () => ({ apiBase: '/api', machine: { workflow: 'idle' } }) } };
  if (withControls) window.cncJobControls = controls;
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/' + file, 'utf8'), { window, document, XMLHttpRequest: XHR, Date, JSON, Array,
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'tok' } } }) }, setTimeout: () => 1, clearTimeout() {} });
  const box = section.children[section.children.length - 1];
  const buttons = () => box.querySelectorAll('button');
  const answer = (x, status, data) => { x.status = status; x.responseText = JSON.stringify(data); x.onload(); };
  return { requests, handlers, box, buttons, answer };
}

// Wi-Fi scan: the body names this device.
let p = page('wifi-settings.js', true);
p.buttons().find((b) => b.textContent === 'Rechercher les réseaux').click();
let post = p.requests.find((r) => r.method === 'POST');
assert.deepEqual(post.body, { action: 'scan', clientId: 't-abc-1234', clientLabel: 'Tablette 1234' }, 'B-2: wifi-settings.js sends clientId / clientLabel');
// Without job-controls.js (no identity): the body is unchanged.
p = page('wifi-settings.js', false);
p.buttons().find((b) => b.textContent === 'Rechercher les réseaux').click();
assert.deepEqual(p.requests.find((r) => r.method === 'POST').body, { action: 'scan' });

// Host command: list, two taps, machine at rest, then the run request names this device.
p = page('tablet-actions.js', true);
p.handlers['cnc-settings-tab']({ detail: 'system' });
p.answer(p.requests.find((r) => r.url === '/api/commands'), 200, { records: [{ id: 'r1', title: 'Redémarrer', enabled: true }] });
const run = p.buttons().find((b) => b.textContent === 'Redémarrer');
run.click(); run.click();
p.answer(p.requests.find((r) => r.url === '/api/touch-job'), 200, { controllers: [] });
post = p.requests.find((r) => r.method === 'POST');
assert.equal(post.url, '/api/commands/run/r1');
assert.deepEqual(post.body, { clientId: 't-abc-1234', clientLabel: 'Tablette 1234' }, 'B-2: tablet-actions.js sends clientId / clientLabel');
console.log('PASS');
