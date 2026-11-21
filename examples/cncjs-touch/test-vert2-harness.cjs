'use strict';
// Execute browser expressions against the shipped session page, rather than
// accepting source markers as proof of a valid harness scenario.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const H = require('./browser-run.cjs');
const { fixture } = require('./check-page-fixture.cjs');
const run = fs.readFileSync(__dirname + '/browser-run.cjs', 'utf8');
for (const language of ['fr','en','es']) {
 const q = fixture(language), { document, window } = q;
 assert.equal(window.cncI18n.language, language);
 window.cncShell.go('jog');
 q.send({ fresh: false, statusAgeMs: 5000, canJog: false, canSetOrigin: false });
 const context = { document, window };
 const state = vm.runInNewContext(H.SCREENS_REAL_STATE, context);
 assert.deepEqual(H.staleStatusChecks(state), [], language + ': the actual translated prefix and stale cause match');
 for (const patch of [{ arrows: 1 }, { zeros: 1 }, { msg: '' }, { msg: 'Action refused' }, { stale: null }, { stale: { ...state.stale, id: 'occupee' } }]) {
  assert(H.staleStatusChecks({ ...state, ...patch }).length, 'a stale-status negative control must fail');
 }
 window.cncShell.go('home');
 const before = vm.runInNewContext(H.SUIVI_SHAPE, context);
 const optional = document.createElement('div');optional.id = 'home-gauge-curve';
 q.node('home-left').appendChild(optional);
 assert.equal(vm.runInNewContext(H.SUIVI_SHAPE, context), before, 'a read-only instrument never changes command owners/order');
 const stop = q.node('home-job-stop'), owner = stop.parentNode;
 q.node('home-left').appendChild(stop);
 assert.notEqual(vm.runInNewContext(H.SUIVI_SHAPE, context), before, 'moving Stop fails the structural comparison');
 owner.appendChild(stop);
 assert.equal(vm.runInNewContext(H.SUIVI_SHAPE, context), before);
 owner.removeChild(stop);
 assert.throws(() => vm.runInNewContext(H.SUIVI_SHAPE, context), /thirteen override/);
 q.emit('pagehide');
}
const ids = ['jog-zero-x','jog-zero-y','jog-zero-z','jog-zero-xyz','zero-more-open'];
const targets = [{ kind: 'jog', y: 142 }].concat(ids.map(id => ({ id, reachable: true })));
assert.deepEqual(H.jogControlsChecks(H.jogReadings({ targets })), []);
for (const id of ids) {
 assert(H.jogControlsChecks(H.jogReadings({ targets: targets.filter(t => t.id !== id) })).length, 'missing ' + id + ' fails');
 assert(H.jogControlsChecks(H.jogReadings({ targets: targets.map(t => ({ ...t, reachable: t.id === id ? false : t.reachable })) })).length, 'covered ' + id + ' fails');
}
assert(H.jogControlsChecks(H.jogReadings({ targets: targets.slice(1) })).length, 'missing cross fails');
const responsive = run.slice(run.indexOf('async function responsiveMeasure'), run.indexOf('// Rotation and resizing'));
const start = responsive.indexOf("['job-check', 'job-dismiss']"), checked = responsive.indexOf('await checkJobConsent(cdp);', start), measured = responsive.indexOf("['job-confirm']", start);
assert(start >= 0 && checked > start && measured > checked, 'responsive hit test uses the guarded consent path before measuring enabled Confirm');
assert(responsive.indexOf('await clearJobConsent(cdp);', measured) > measured, 'the geometry probe releases its consent through the page event before confirmation');
assert(run.includes('staleStatusChecks(state).forEach'), 'screens actually enforces the atomic stale-state capture');
assert(run.includes('jogControlsChecks(jogResult.jog).forEach'), 'screens actually enforces the current zero targets');
async function consent() {
 let opened = Date.now(), checked = false, changes = 0;
 const confirm = { get disabled() { return !checked || Date.now() - opened < 600; } };
 confirm.click = () => { throw new Error('The geometry probe must never execute confirmation'); };
 const nodes = { 'job-dialog': { hidden: false }, 'job-confirm': confirm, 'job-check': { set checked(value) { checked = value; }, dispatchEvent() { changes++; } } };
 const cdp = { evaluate: async code => vm.runInNewContext(code, { document: { getElementById: id => nodes[id] }, Event: function () {} }),
  async waitFor(code) { assert(await this.evaluate(code), code); } };
 await H.checkJobConsent(cdp);
 assert(checked && !confirm.disabled, 'confirmation becomes available only after fresh consent and the guard');
 // A checked or hidden dialog must fail, without borrowing prior consent.
 opened = Date.now() - 700;
 await assert.rejects(() => H.checkJobConsent(cdp), /before checking/);
 const beforeReset = changes;
 await H.clearJobConsent(cdp);
 assert.equal(changes, beforeReset + 1, 'clearing consent must notify the production change handler synchronously');
 assert(!checked && confirm.disabled);
 nodes['job-dialog'].hidden = true;
 await assert.rejects(() => H.checkJobConsent(cdp));
}
consent().then(() => console.log('PASS VERT2 harness: atomic localized stale status, current zero targets, immutable command owners and guarded responsive consent.')).catch(e => { console.error(e);process.exitCode = 1; });
