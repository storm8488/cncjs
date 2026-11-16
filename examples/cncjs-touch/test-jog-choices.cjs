'use strict';
// Actual markup and owners; no browser, network or machine. Geometry is checked by screens/strip.
const assert = require('assert').strict;
const fs = require('fs');
const { page } = require('./session-dom-fixture.cjs');
const { machine } = require('./test-real-motion.cjs');
const state = patch => machine({ workOffset: { state: 'proven' }, machineProfile: { kind: 'cnc' }, ...patch });
for (const language of ['fr', 'en', 'es']) {
 const q = page(language), calls = [];
 q.run('touch-shell.js');
 q.window.cncJobControls.motion = body => { calls.push(body); return Promise.resolve({}); };
 q.run('real-motion.js');
 const send = patch => q.emit('cnc-job-status', { machine: state(patch), simulation: false, transportConnected: true, pilot: { state: 'free' } });
 send(); q.window.cncShell.go('jog');
 for (const id of ['ks-jog-settings', 'ks-jog-settings-content', 'ks-jog-settings-sheet']) assert(!q.node(id), 'obsolete speed sheet removed: ' + id);
 const t = q.window.cncI18n.t;
 assert.equal(q.node('jog-step-title').textContent, t('Pas'));
 assert.equal(q.node('jog-feed-title').textContent, t('Vitesse mm/min'));
 assert.equal(q.node('jog-feed-title').textContent, { fr: 'Vitesse mm/min', en: 'Speed mm/min', es: 'Velocidad mm/min' }[language]);
 const steps = [...q.document.querySelectorAll('#steps [data-step]')];
 assert.deepEqual(steps.map(b => b.getAttribute('data-step')), ['0.1', '1', '10', '25', '50', '100', 'hold']);
 const feeds = () => [...q.document.querySelectorAll('#feeds [data-feed]')];
 assert.deepEqual(feeds().map(b => b.getAttribute('data-feed')), ['100', '250', '500']);
 assert(q.node('screen-jog').contains(q.node('feeds')), 'speeds stay on the work-zero screen');
 assert(!q.node('feeds').closest('[hidden],.ks-sheet'), 'no sheet or hidden ancestor');
 for (const feed of feeds()) {
  feed.click();
  assert.equal(feed.getAttribute('aria-pressed'), 'true'); assert(feed.classList.contains('active'));
  assert.equal(feeds().filter(b => b.getAttribute('aria-pressed') === 'true').length, 1);
  assert.equal(calls.length, 0, 'selection sends no machine command');
 }
 for (const step of steps) {
  step.click(); assert.equal(step.getAttribute('aria-pressed'), 'true'); assert(step.classList.contains('active'));
  assert.equal(steps.filter(b => b.getAttribute('aria-pressed') === 'true').length, 1);
 }
 assert.equal(calls.length, 0);
 let navigations = 0;
 q.window.addEventListener('cnc-screen-change', () => { navigations++; });
 q.window.cncSeance.lancer('vitesse');
 assert.equal(q.window.cncShell.screen(), 'jog');
 assert.equal(navigations, 0, 'focusing an on-screen speed choice does not trigger a screen-change stop');
 assert(feeds().includes(q.document.activeElement), 'speed remedy focuses a direct choice');
 q.window.cncShell.go('machine'); q.window.cncSeance.lancer('vitesse');
 assert.equal(q.window.cncShell.screen(), 'jog');
 assert(feeds().includes(q.document.activeElement), 'speed remedy also works from another screen');
 const hold = steps.find(b => b.getAttribute('data-step') === 'hold'), reason = q.node('jog-hold-reason');
 send({ homed: false });
 assert(hold.disabled); assert(!reason.hidden); assert.equal(reason.textContent, t('Continu : {raison}').replace('{raison}', t('Origine machine pas prise : 1 mm au plus, sans continu.')));
 assert.equal(hold.getAttribute('aria-describedby'), reason.id);
 hold.click(); assert.equal(calls.length, 0);
 send({ capabilities: { ...state().capabilities, jogContinuous: { enabled: false } } });
 assert(hold.disabled); assert(!reason.hidden); assert.equal(reason.textContent, t('Continu : {raison}').replace('{raison}', hold.getAttribute('title')));
 send(); assert(!hold.disabled); assert(reason.hidden); assert.equal(reason.textContent, '');
 // Keep every existing speed, including the choices offered by faster axis limits.
 const maxFeed = { X: { max: 4000 }, Y: { max: 4000 }, Z: { max: 2000 } };
 send({ motion: { ...state().motion, maxFeed } });
 assert.deepEqual(feeds().map(b => b.getAttribute('data-feed')), ['100', '250', '500', '1000', '2000']);
 q.node('step-jog-details').click();
 assert(q.node('ks-details').textContent.includes('4000 / 4000 / 2000 mm/min'), 'maximum feeds retained in Details');
 q.window.cncShell.closeSheet();
 send({ motion: { ...state().motion, maxFeed: { X: { max: 50 }, Y: { max: 50 }, Z: { max: 50 } } } });
 assert.deepEqual(feeds().map(b => b.getAttribute('data-feed')), ['50'], 'slow-axis fallback preserved');
 q.emit('pagehide');
}
const css = fs.readFileSync(__dirname + '/touch/responsive.css', 'utf8');
assert.match(css, /\.ks-jog-choices\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*gap:12px/);
assert.match(css, /#steps,body\.ks-real\.ks-ui #screen-jog #feeds\{[^}]*repeat\(3,minmax\(0,1fr\)\)[^}]*gap:12px/);
assert.match(css, /#feeds \.step\{[^}]*min-width:48px[^}]*min-height:48px/);
assert.match(css, /#steps \.step\[data-step="hold"\]\{grid-column:1 \/ -1/);
assert.match(css, /\.ks-jog-choice-title\{[^}]*font:600 var\(--fs-16\)/);
// Browser assertions themselves must reject smaller targets, missing speed rows and clipped controls.
const { jogChoiceChecks } = require('./browser-run.cjs');
const geometry = () => ({ sheet: false, groups: ['steps', 'feeds'].map(id => ({ id, inside: true, gapX: 12, gapY: 12,
 buttons: (id === 'steps' ? ['0.1', '1', '10', '25', '50', '100', 'hold'] : ['100', '250', '500']).map((value, i) => ({
  value, w: value === 'hold' ? 204 : 60, h: 48, font: 18, active: i === 1, pressed: i === 1, hit: true, cut: false
 })) })) });
assert.deepEqual(jogChoiceChecks(geometry()), []);
for (const mutate of [d => { d.sheet = true; }, d => { d.groups.pop(); }, d => { d.groups[1].inside = false; },
 d => { d.groups[1].gapX = 8; }, d => { d.groups[1].buttons[0].h = 44; }, d => { d.groups[1].buttons[0].font = 14; },
 d => { d.groups[1].buttons[0].cut = true; }, d => { d.groups[1].buttons[0].hit = false; }, d => { d.groups[1].buttons[0].w = 80; },
 d => { d.groups[1].buttons[1].pressed = false; }]) {
 const data = geometry(); mutate(data); assert(jogChoiceChecks(data).length, 'browser check rejects its negative control');
}
console.log('PASS jog choices: direct speed/step selection, exclusive active states, no motion on selection, unchanged feeds, visible continuous refusal and Details in FR/EN/ES.');
