'use strict';
// B-3 follow-up (review of the bug hunt fixes). With CNCjs users and an expired session, every
// request is refused (403 « Forbidden Access ») and /signin fails: the whole page (app.js +
// job-stream.js + job-controls.js) must not loop. At most one renewal attempt a minute, and the
// health check and the fallback state read back off while the session is refused.
const assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');

(async () => {
  let mono = 1000;
  const storage = new Map([['cnc', JSON.stringify({ state: { session: { enabled: true, token: 'expired', name: 'ana' } } })]]);
  const f = load({ app: true, storage, performance: { now: () => mono } });
  const answered = new Set();
  const count = (test) => f.requests.filter(test).length;
  const signin = (r) => r.method === 'POST' && /\/signin$/.test(r.url);
  const health = (r) => /\/custom\/health$/.test(r.url);
  const read = (r) => r.method === 'GET' && /\/touch-job$/.test(r.url);
  async function serve() {
    for (const r of f.requests.slice()) {
      if (answered.has(r)) continue;
      answered.add(r);
      if (signin(r)) { r.status = 500; r.responseText = JSON.stringify({ msg: 'Internal server error' }); }
      else { r.status = 403; r.responseText = 'Forbidden Access'; }
      if (r.onload) r.onload();
      await f.flush();
    }
  }
  await serve();
  for (let s = 0; s < 60; s++) { f.advance(1000); mono += 1000; f.tick(); await f.flush(); await serve(); }
  const totals = { signin: count(signin), health: count(health), reads: count(read) };
  assert.ok(totals.signin <= 2, 'at most one renewal attempt a minute: ' + JSON.stringify(totals));
  assert.ok(totals.health <= 3, 'health checks back off: ' + JSON.stringify(totals));
  assert.ok(totals.reads <= 3, 'state reads back off: ' + JSON.stringify(totals));
  assert.equal(f.reloads.length, 0);
  assert.match(f.el('notice').textContent, /reconnectez-vous/, 'the operator is asked to sign in again');
  // The next minute: one more attempt of each, not sixty.
  for (let s = 0; s < 60; s++) { f.advance(1000); mono += 1000; f.tick(); await f.flush(); await serve(); }
  assert.ok(count(signin) <= 3 && count(health) <= 5 && count(read) <= 5, 'second minute: ' + JSON.stringify({ signin: count(signin), health: count(health), reads: count(read) }));
  console.log('PASS', JSON.stringify(totals));
})().catch((e) => { console.error(e); process.exit(1); });
