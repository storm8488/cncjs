'use strict';
// job-stream.js without a CNCjs session: no request leaves (the server would only log a 403 a
// minute), the status says why; once a token exists the health check goes out as usual.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const requests = [];
function XHR() { this.headers = {}; this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = (k, v) => { this.headers[k] = v; }; this.send = () => { requests.push(this); }; this.abort = () => {}; }
const root = { navigator: { onLine: true }, XMLHttpRequest: XHR, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} };
const context = { window: root, document: {}, Date, Promise, XMLHttpRequest: XHR };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/touch/job-stream.js', 'utf8'), context);
let token = '', now = 10000;
const status = [];
const stream = context.window.CNCJobStream.create({ apiBase: '/api', token: () => token, clock: () => now, timer: root, XMLHttpRequest: XHR, onStatus: (s) => status.push(s), onSnapshot() {}, onDisconnect() {} });
stream.reconnect('', true);
assert.deepEqual(requests, [], 'no request without a session');
assert.match(status[status.length - 1], /Session CNCjs requise/);
now += 61000; stream.reconnect('', true);
assert.deepEqual(requests, [], 'still nothing a minute later');
token = 'fresh'; now += 61000; stream.reconnect('', true);
assert.equal(requests.length, 1);
assert.match(requests[0].url, /\/custom\/health$/);
assert.equal(requests[0].headers.Authorization, 'Bearer fresh');
console.log('PASS: no health or stream request without a session token, status explains, requests resume once a token exists.');
