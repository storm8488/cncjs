'use strict';
// F10 + FIGE integration: real session/stream owners, simulated server restart.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./job-controls-fixture.cjs');
(async () => {
  let now = 1700000000000;
  const f = load({ app: true, now, performance: { now: () => now } });
  f.el('screen-settings').classList = { contains: () => false };
  const navigations = [];
  f.window.location.href = 'http://localhost/cnc/touch/index.html';
  f.window.location.replace = url => navigations.push(url);
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/tablet-actions.js', 'utf8'), {
    window: f.window, document: f.document, XMLHttpRequest: f.window.XMLHttpRequest,
    localStorage: { getItem: key => f.storage.get(key) }, URL,
    Date: class extends Date { static now() { return now; } },
    setTimeout: f.window.setTimeout, clearTimeout: f.window.clearTimeout
  });
  const pending = suffix => f.requests.filter(r => !r.answered && suffix.test(r.url)).at(-1);
  function answer(suffix, data, code = 200) { const r = pending(suffix); assert(r, String(suffix)); r.answered = true; f.answer(r, data, code); return r; }
  answer(/^VERSION\.json\?/, { commit: 'aaaaaaaa' });
  answer(/\/signin$/, { enabled: false, token: 'offline-fixture' });
  const old = await f.connect(f.machine({ spindleSpeed: 0 }));
  answer(/^VERSION\.json\?/, { commit: 'aaaaaaaa' });
  // Lose the stream, refuse the old session and renew through app.js, as in FIGE.
  old.onerror(); now += 60001; f.advance(60001); f.tick(); await f.flush();
  answer(/^VERSION\.json\?/, {}, 503);
  answer(/\/touch-events\?/, {}, 403);
  answer(/\/custom\/health$/, {}, 403);
  answer(/\/signin$/, { enabled: false, token: 'after-restart' });
  answer(/\/custom\/health$/, { loaded: true, protocol: 1 });
  const recovered = f.requests.filter(r => f.isStream(r.url)).at(-1);
  assert.equal(recovered.headers.Authorization, 'Bearer after-restart');
  assert.equal(navigations.length, 0, 'session/HTTP recovery alone cannot reload');
  let sequence = 0;
  function heartbeat() {
    recovered.status = 200;
    recovered.responseText += JSON.stringify({ version: 1, epoch: 'server-two', sequence: ++sequence,
      sentAt: now, transportId: 'stream-two', controllers: [f.machine({ generation: 'new-board', spindleSpeed: 0 })] }) + '\n';
    recovered.onprogress();
  }
  heartbeat(); await f.flush();
  answer(/^VERSION\.json\?/, { commit: 'bbbbbbbb' });
  const preflight = answer(/\/touch-job$/, { controllers: [f.machine({ spindleSpeed: 0 })] });
  assert.equal(preflight.headers.Authorization, 'Bearer after-restart');
  const banner = f.document.body.children.find(n => n.className === 'ks-auto-reload');
  assert(banner && !banner.hidden);
  for (let i = 0; i < 10; i++) { now += 1000; f.advance(1000); heartbeat(); f.tick(); await f.flush(); }
  answer(/\/touch-job$/, { controllers: [f.machine({ spindleSpeed: 0 })] });
  assert.equal(navigations.length, 1, 'new version reloads after the recovered stream and ten idle seconds');
  assert.equal(f.posts().filter(r => !/\/signin$/.test(r.url)).length, 0, 'no old action, ticket or machine command replayed');
  f.controls().dispose(); f.window.cncConnection.dispose();
  f.window.dispatchEvent({ type: 'pagehide' });
  console.log('PASS F10/FIGE: session renewal and a new server epoch trigger a guarded version reload without replay.');
})().catch(error => { console.error(error); process.exitCode = 1; });
