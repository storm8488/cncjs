'use strict';
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const H = require('./browser-run.cjs');
// Run the serialized click expressions against a dialog whose guard is real
// time: removing the harness wait fails before any execution is accepted.
(async () => {
  let opened = Date.now(), checked = false, sent = false, hidden = false;
  const confirm = { get disabled() { return !checked || Date.now() - opened < 600; }, click() { assert(!this.disabled); sent = true; hidden = true; } };
  const box = { set checked(v) { checked = v; }, dispatchEvent() {} };
  const nodes = { 'job-dialog': { get hidden() { return hidden; } }, 'job-confirm': confirm, 'job-check': box };
  const cdp = { evaluate: async code => vm.runInNewContext(code, { document: { getElementById: id => nodes[id] }, Event: function () {} }),
    async waitFor(code) { assert(await this.evaluate(code), code); } };
  await H.confirmJob(cdp);assert(sent);assert(hidden);
  // An already checked dialog must fail, never silently reuse consent.
  opened = Date.now() - 700;checked = true;hidden = false;
  await assert.rejects(() => H.confirmJob(cdp), /before checking/);
  const run = fs.readFileSync(__dirname + '/browser-run.cjs', 'utf8'), strip = fs.readFileSync(__dirname + '/browser-strip.cjs', 'utf8');
  assert(!/getElementById\("(?:job-load|home-job-start)"\)/.test(strip), 'strip uses File and Control session actions');
  assert(strip.includes('H.confirmJob(cdp)'));
  assert(strip.includes('pilot-other') && strip.includes('state==="other"'), 'keyboard test opens the real custom-reason flow');
  assert(run.includes('stoppedSnapshot(cdp)') && run.includes('home-notice-details'));
  assert(run.includes('placementFixture.setPhase(\'idle\')'), 'placement has its actual gate preconditions');
  const preview = fs.readFileSync(__dirname + '/preview-server.cjs', 'utf8');
  assert(preview.includes("xhr.method==='POST'&&JSON.parse(body||'{}').action==='check'"), 'read-only file check reaches the local fixture');
  console.log('PASS HARN flows: guarded confirmation, new session targets, custom pilot reason, stopped details and idle placement fixture.');
})().catch(e => { console.error(e); process.exitCode = 1; });
