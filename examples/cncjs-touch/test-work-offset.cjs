'use strict';
// The four D2 refusals travel through the existing page code formatter on every surface.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { load } = require('./job-controls-fixture.cjs');
const { createDOM } = require('./dom-fixture.cjs');
const { fixture, machine } = require('./test-real-motion.cjs');
const cases = [
  { code: 'ETOUCH_OFFSET_CHECKING', params: {} },
  { code: 'ETOUCH_OFFSET_UNCONFIRMED', params: { detail: 'no-report' } },
  { code: 'ETOUCH_OFFSET_MISMATCH', params: { wcs: 'G54', axis: 'Z', stored: '-115', reported: '0' } },
  { code: 'ETOUCH_OFFSET_SETTINGS', params: {} }
];

(async () => {
  for (const language of ['fr', 'en', 'es']) {
    const f = load({ language, catalogs: ['i18n-messages-machine.js'] }); await f.connect();
    const i = f.window.cncI18n, listeners = {}, dom = createDOM(['home']);
    const context = { window: { cncI18n: i, CNCProgramCheckView: f.window.CNCProgramCheckView, addEventListener(n, fn) { listeners[n] = fn; } }, document: dom.document, Date, localStorage: { getItem: () => null } };
    vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), context);
    vm.runInNewContext(fs.readFileSync(__dirname + '/touch/probe-real.js', 'utf8'), context);
    const motion = fixture({ locale: language }); await motion.connect(machine());
    for (const r of cases) {
      const expected = i.format(r.code, r.params, '');
      assert(expected);
      const fallback = language === 'fr' ? expected : 'old server wording';
      // A deliberately stale free-text fallback proves that code + params are used.
      const m = f.machine({ canStart: false, startReason: fallback, refusals: { start: r } });
      f.push([m]);
      for (const id of ['file', 'job-reason']) assert(f.el(id).textContent.includes(expected), id + ' ' + language + ' ' + r.code);
      listeners['cnc-job-status']({ detail: { machine: m, simulation: false } });
      assert(dom.node('home-job-ready').textContent.includes(expected), 'Follow ' + language + ' ' + r.code);
      const loadingRefused = { ...m, canLoad: false, loadReason: fallback, refusals: { start: r, load: r } };
      listeners['cnc-job-status']({ detail: { machine: loadingRefused, simulation: false } });
      assert(dom.node('home-job-ready').textContent.includes(expected), 'Follow load refusal ' + language + ' ' + r.code);
      const probe = context.window.CNCProbeReal.launchState({ machine: { ...m, operator: { wcs: 'G54' }, canBlockProbe: false, blockProbeReason: fallback, refusals: { blockProbe: r } }, wcs: 'G54', connected: true, validate: () => [] });
      assert.equal(probe.ready, false); assert.equal(probe.reason, expected, 'Probe ' + language + ' ' + r.code);
      const next = machine({ refusals: { setOrigin: r, jog: r } });
      next.motion.canSetOrigin = false; next.motion.setOriginReason = fallback;
      next.motion.canJog = false; next.motion.jogReason = fallback;
      motion.push([next]); await motion.flush();
      assert.equal(motion.el('jog-zero-x').disabled, true);
      assert.equal(motion.el('jog-zero-x').title, expected, 'Prepare origin ' + language + ' ' + r.code);
      assert.equal(motion.el('jog-msg').textContent, expected, 'Prepare movement ' + language + ' ' + r.code);
      // A coded HTTP refusal also uses the same template.
      f.push([f.machine()]); f.el('job-start').click(); f.answer(f.posts().at(-1), { ...r, message: fallback }, 409); await f.flush();
      assert.equal(f.el('job-feedback').textContent, expected);
    }
    const reading = { code: 'ETOUCH_SETTINGS_READING', params: {} };
    const readReason = i.format(reading.code, reading.params, '');
    motion.push([machine({ canReadSettings: false, homeReason: 'Réglage $22 inconnu : relisez les réglages de la carte.', readSettingsReason: readReason, refusals: { readSettings: reading } })]);
    await motion.flush();
    const read = motion.el('jog-read-settings'), before = motion.posts().length;
    assert.equal(read.hidden, false); assert.equal(read.disabled, true); assert.equal(read.title, readReason);
    read.click(); assert.equal(motion.posts().length, before, 'refused read sends nothing');
    motion.push([machine({ activeState: 'Alarm', canReadSettings: true, homeReason: 'Réglage $22 inconnu : relisez les réglages de la carte.' })]);
    await motion.flush(); assert.equal(read.disabled, false); assert.equal(read.title, '');
    read.click(); assert.equal(motion.posts().at(-1).body.action, 'readSettings');
    f.controls().dispose(); motion.controls().dispose(); motion.fireWindow('pagehide');
  }
  console.log('PASS D2: four codes, FR/EN/ES, Files/Follow/Probe/Prepare and HTTP refusals, no machine or network.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
