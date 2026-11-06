'use strict';
const assert = require('assert').strict;
const {setup, plain, cases} = require('./test-v2-observation.cjs');
function marker(identity, time, id, patch = {}) {
  return Object.assign({id, kind: 'correction', identity, time,
    interval: {fromMonoMs: time.arrivalMonoMs, toMonoMs: time.arrivalMonoMs}, value: 110,
    source: 'report', code: 'override-reported', params: {channel: 'feed', previous: 100}}, patch);
}
async function tests() {
  await cases([
    ['chart recalculated at most once per second; current observations independent', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); const a = o.chart();
      assert.equal(a.samples.length, 1); assert.equal(a.segments.length, 1);
      p.advance(500); const f = facts(); f.report.feedMmMin = 1900; o.update(f);
      assert.equal(o.snapshot().report.feedMmMin, 1900); assert.equal(o.chart(), a);
      p.advance(499); assert.equal(o.chart(), a); p.advance(1);
      const b = o.chart(); assert.notEqual(b, a); assert.equal(b.samples.length, 2); assert.equal(b.toMonoMs, 1100);
      assert.equal(o.snapshot().samples, b.samples); assert.equal(o.chart(), b);
      assert(Object.isFrozen(b.segments[0]));
    }],
    ['minute ring spans a minute under a fast stream and obeys every bound', async () => {
      const {p, o, identity, facts} = await setup();
      for (let n = 0; n < 1300; n++) {
        const f = facts(); f.markers = [marker(identity, f.time, 'c' + n)]; o.update(f); o.chart(); p.advance(100);
      }
      const c = o.chart(); assert(c.samples.length <= 240); assert(c.markers.length <= 100);
      assert(c.samples.every(s => s.atMonoMs >= c.toMonoMs - 60000));
      assert(c.markers.every(m => m.interval.toMonoMs >= c.toMonoMs - 60000));
      assert(c.samples[c.samples.length - 1].atMonoMs - c.samples[0].atMonoMs > 59000, 'fast stream must not shrink minute to last seconds');
      assert(c.samples.every(s => !s.gap && s.feedMmMin === 1800));
      p.advance(61000); const expired = o.chart(); assert.equal(expired.segments.length, 0);
      assert(expired.samples.every(s => s.feedMmMin === null), 'no synthetic zero or last value at now');
    }],
    ['reported corrections and pause markers are facts, never inferred from feed or requested clicks', async () => {
      const {p, o, identity, facts} = await setup(); const f = facts();
      f.markers = [marker(identity, f.time, 'good'), marker(identity, f.time, 'pause', {kind: 'pause', value: true, code: 'pause-reported', params: {}}),
        marker(identity, f.time, 'requested', {source: 'device'}), marker(identity, f.time, 'inferred', {source: 'inferred'}),
        marker(identity, f.time, 'no-value', {value: null}), marker(identity, f.time, 'other-job', {identity: null})];
      o.update(f); let c = o.chart(); assert.deepEqual(plain(c.markers.map(m => m.id)), ['good', 'pause']);
      assert(c.markers.every(m => m.source === 'report')); assert.equal(c.markers[1].value, true);
      assert.equal(c.samples[0].feedMmMin, 1800, 'pause does not fabricate feed zero');
      p.advance(1000); const g = facts(); g.report.feedMmMin = 0; g.markers = f.markers; o.update(g); c = o.chart();
      assert.equal(c.markers.length, 2, 'same retained event is not duplicated');
      assert.equal(c.samples[c.samples.length - 1].feedMmMin, 0, 'measured/report zero is valid');
    }],
    ['missing feed and explicit stale reports break segments without an interpolated zero', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); o.chart(); p.advance(1000);
      let f = facts(); f.report.feedMmMin = null; o.update(f); p.advance(1000);
      f = facts(); f.report.feedMmMin = 2000; o.update(f); let c = o.chart();
      assert.equal(c.segments.length, 2); assert(c.samples.some(s => s.gap && s.feedMmMin === null));
      assert(c.markers.some(m => m.kind === 'gap' && m.source === 'inferred'));
      p.advance(1000); f = facts(); f.report.ageMs = 2501; f.report.feedMmMin = 9999; o.update(f);
      c = o.chart(); assert(!c.samples.some(s => s.feedMmMin === 9999));
      assert(c.samples.every(s => s.feedMmMin !== 0));
    }],
    ['silent intervals and report-age expiry remain gaps even without a stale packet', async () => {
      const {p, o, facts} = await setup(); const f = facts(); f.report.ageMs = 2400; o.update(f); o.chart();
      p.advance(1000); o.update(facts()); let c = o.chart();
      assert.equal(c.segments.length, 2, 'initial report expired before next arrival');
      p.advance(3000); c = o.chart(); assert(c.samples[c.samples.length - 1].gap);
      assert.equal(c.markers[c.markers.length - 1].interval.toMonoMs, 4100);
      p.advance(1000); o.update(facts()); c = o.chart(); assert.equal(c.segments.length, 3);
    }],
    ['no chart work/sampling hidden, restored view has an explicit gap', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); const initial = o.chart();
      p.advance(100); p.emit('cnc-screen-change', 'files');
      for (let i = 0; i < 20; i++) { p.advance(500); o.update(facts()); assert.equal(o.chart(), null); }
      assert.equal(o.snapshot().samples, initial.samples, 'no hidden chart publication');
      assert.equal(p.frames.size, 0, 'model has no RAF loop or timer');
      p.emit('cnc-screen-change', 'home'); p.advance(100); o.update(facts()); const c = o.chart();
      assert.equal(c.segments.length, 2); assert.equal(c.samples.filter(s => !s.gap).length, 2);
      assert(c.markers.some(m => m.kind === 'gap' && m.interval.toMonoMs > m.interval.fromMonoMs));
    }],
    ['job reset clears samples and markers; duplicate/out-of-order stamps do not sample twice', async () => {
      const {p, v, o, identity, facts} = await setup(); const f = facts(); o.update(f); o.chart();
      for (let i = 0; i < 10; i++) { p.advance(100); o.update(f); }
      let c = o.chart(); assert.equal(c.samples.length, 1);
      const next = v.identity.create(Object.assign({}, identity, {generation: 'new'})); o.reset(next);
      c = o.chart(); assert.equal(c.samples.length, 0); assert.equal(c.markers.length, 0);
      o.update(facts()); p.advance(1000); assert.equal(o.chart().samples.length, 0);
    }],
    ['a packet captured while hidden cannot backfill history after returning', async () => {
      const {p, o, facts} = await setup(); o.update(facts()); o.chart();
      p.advance(100); p.emit('cnc-screen-change', 'files'); p.advance(1000);
      const hidden = facts(); hidden.report.feedMmMin = 999;
      p.advance(100); p.emit('cnc-screen-change', 'home'); o.update(hidden);
      let c = o.chart(); assert(!c.samples.some(s => s.feedMmMin === 999));
      assert.equal(c.markers[c.markers.length - 1].interval.toMonoMs, 1300);
      assert.equal(o.snapshot().report.feedMmMin, 999, 'live confidence is separate from hidden capture policy');
      p.advance(1000); o.update(facts()); c = o.chart(); assert.equal(c.segments.length, 2);
    }],
    ['reported IDs do not collide with generated gap IDs', async () => {
      const {p, o, identity, facts} = await setup(); o.update(facts()); o.chart();
      p.advance(3000); const gapId = o.chart().markers.find(m => m.kind === 'gap').id;
      p.advance(1000); const f = facts(); f.markers = [marker(identity, f.time, gapId)]; o.update(f);
      const c = o.chart(); assert(c.markers.some(m => m.kind === 'correction' && m.id === gapId));
      assert(c.markers.some(m => m.kind === 'gap' && m.id === gapId));
    }]
  ]);
  console.log('PASS v2 observation history: 60 s / 240 / 100, <=1 Hz, reported markers, gaps and hidden-view suspension.');
}
if (require.main === module) tests().catch(e => { console.error(e); process.exitCode = 1; });
