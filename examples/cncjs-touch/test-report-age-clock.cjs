'use strict';
// v1 (job-controls.js): the age of the last machine report was recomputed with Date.now(). A civil
// clock set back (NTP at kiosk boot, RTC in local time) made a stale report « fresh » again and
// re-enabled Charger / Démarrer. The age and the online window now run on performance.now().
const assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');
(async () => {
  let m = 1000;
  const f = load({ performance: { now: () => m } });
  await f.connect(f.machine());
  const after = (civil, mono) => { f.advance(civil); m += mono; f.tick(); return f.lastStatus().machine; };
  let s = after(0, 0);
  assert.equal(s.fresh, true, 'fresh report at arrival');
  s = after(2600, 2600);
  assert.equal(s.fresh, false, 'report older than 2.5 s is stale'); assert.equal(s.canStart, false);
  s = after(-2600, 100);                 // civil clock back 2.6 s, 0.1 s really elapsed
  assert.ok(s, 'still within the 3 s window (2.7 s)');
  assert.equal(s.fresh, false, 'a civil rollback must not renew the report'); assert.equal(s.canStart, false); assert.equal(s.canLoad, false);
  // Normal successive reports still work.
  f.push([f.machine({ statusObservedAt: Date.now() })]); await f.flush();
  s = after(0, 0); assert.equal(s.fresh, true, 'a new report is fresh'); assert.equal(s.canStart, true);
  s = after(-5000, 3100);                // 3.1 s really elapsed, civil clock now well behind
  assert.equal(s, null, 'offline after 3 s of real time, whatever the civil clock');
  console.log('PASS v1 report age: monotone, a civil clock set back renews nothing, new reports stay fresh');
})().catch((e) => { console.error(e); process.exit(1); });
