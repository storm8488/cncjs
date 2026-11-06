'use strict';
// A-3 (bug hunt 2026-11-06). Suivi's Pause becomes Reprendre… in place once the job is held: a
// double tap on Pause reached « Reprendre… » (its confirmation opened). As on the status strip
// (status-strip.js), a tap on Pause or Reprendre freezes both for 600 ms; Arrêter never waits.
// A wall clock set back after a tap does not keep them frozen.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
(async () => {
  const nodes = {}, listeners = {}; let now = 1e12;
  const el = (id) => nodes[id] || (nodes[id] = { id, disabled: false, textContent: '', value: '', classList: { contains: () => true }, handlers: {}, parentNode: { insertAdjacentHTML() {} }, insertAdjacentHTML() {}, removeAttribute() {}, addEventListener(n, f) { this.handlers[n] = f; }, click() { if (!this.disabled && this.handlers.click) this.handlers.click.call(this); }, appendChild() {}, insertBefore() {}, setAttribute() {}, focus() {} });
  const emit = (type, detail) => (listeners[type] || []).forEach((f) => f({ type, detail }));
  class FakeDate extends Date { static now() { return now; } }
  const ctx = { window: { addEventListener(n, f) { (listeners[n] || (listeners[n] = [])).push(f); }, dispatchEvent: (e) => emit(e.type, e.detail) }, document: { body: { getAttribute: () => 'true', appendChild() {} }, querySelector: () => el('panel'), querySelectorAll: () => [], getElementById: el, createElement: () => el('option'), addEventListener() {}, hidden: false }, localStorage: { getItem: () => '{}' }, Promise, Date: FakeDate, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; }, setInterval() {}, XMLHttpRequest: function () { throw Error('Network forbidden'); } };
  vm.createContext(ctx);
  // The relay is checked on its own: job-controls' buttons are counted, not run.
  vm.runInContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), ctx);
  const sent = [];
  ['pause', 'resume', 'stop', 'start', 'load'].forEach((a) => { el('job-' + a).disabled = false; el('job-' + a).click = () => sent.push(a); });
  ['pause', 'resume', 'stop'].forEach((a) => { el('home-job-' + a).disabled = false; });
  // Double tap: Pause, then 150 ms later the same spot, now Reprendre….
  el('home-job-pause').click(); now += 150; el('home-job-resume').click();
  assert.deepEqual(sent, ['pause'], 'A-3: the second tap of a double tap does not reach Reprendre…');
  // Arrêter is never delayed.
  el('home-job-stop').click();
  assert.deepEqual(sent, ['pause', 'stop']);
  // After 600 ms, Reprendre… answers.
  now += 500; el('home-job-resume').click();
  assert.deepEqual(sent, ['pause', 'stop', 'resume']);
  // And the other way round: Reprendre then Pause.
  now += 100; el('home-job-pause').click();
  assert.deepEqual(sent, ['pause', 'stop', 'resume']);
  // A clock set back right after a tap does not freeze Pause for the step back.
  now += 1000; el('home-job-pause').click(); now -= 3600 * 1000; now += 1000;
  el('home-job-pause').click();
  assert.deepEqual(sent, ['pause', 'stop', 'resume', 'pause', 'pause'], 'Pause answers again after a clock step back');
  // Charger / Démarrer are not guarded.
  el('home-job-load').disabled = false; el('home-job-start').disabled = false;
  el('home-job-load').click(); el('home-job-start').click();
  assert.deepEqual(sent.slice(-2), ['load', 'start']);
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
