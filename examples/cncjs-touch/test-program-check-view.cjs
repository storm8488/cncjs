'use strict';
// Server travel pre-check (F2) on the client: per-axis validated / outside / unknown with the
// server's reasons, labelled "not a collision simulation", in the start confirmation and in
// the guided preparation. Unknown (and anything malformed) is never shown green; the
// server's check replaces the client's XY estimate when it is there.
const assert = require('assert').strict;
const view = require('./touch/program-check-view.js');
const prep = require('./touch/job-preparation.js');
const { load } = require('./job-controls-fixture.cjs');
const axis = (verdict, reasons) => ({ verdict, min: 0, max: 1, reasons: reasons || [] });
const SCOPE = 'Course machine X/Y/Z et profondeur Z du programme, dans le repère de travail : ni brides, ni outil, ni matière.';
const unknown = { verdict: 'unknown', axes: { X: axis('unknown', ['Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué).']), Y: axis('unknown'), Z: axis('unknown') },
  reasons: ['Référencement non constaté depuis le dernier redémarrage de la carte ($22=1 signifie activé, pas effectué).'], scope: SCOPE };
const validated = { verdict: 'validated', axes: { X: axis('validated'), Y: axis('validated'), Z: axis('validated', ['Axe Z non sollicité par le programme.']) }, reasons: ['Axe Z non sollicité par le programme.'], scope: SCOPE };
const outside = { verdict: 'outside', axes: { X: axis('outside', ['Hors course X : -400 → -10 mm (course -300 → 0).']), Y: axis('validated'), Z: axis('unknown', ['Correction d’outil G43.1 : Z non suivi.']) },
  reasons: ['Hors course X : -400 → -10 mm (course -300 → 0).', 'Correction d’outil G43.1 : Z non suivi.'], scope: SCOPE };

// 1. The formatter.
let d = view.describe(unknown);
assert.equal(d.verdict, 'unknown'); assert.equal(d.title, 'Contrôle des courses (pas une simulation de collisions) : non vérifié');
assert.deepEqual(d.axes.map((a) => a.axis + ' ' + a.word), ['X inconnu', 'Y inconnu', 'Z inconnu']);
assert.match(d.summary, /Référencement non constaté/); assert.equal(d.scope, SCOPE);
d = view.describe(validated); assert.equal(d.verdict, 'validated'); assert.match(d.title, /: dans la course$/);
d = view.describe(outside); assert.equal(d.verdict, 'outside'); assert.match(d.title, /HORS COURSE/);
assert.deepEqual(d.axes.map((a) => a.verdict), ['outside', 'validated', 'unknown']);
// A global "validated" with an axis that is not, missing axes, unknown words: never validated.
assert.equal(view.describe({ verdict: 'validated', axes: { X: axis('validated'), Y: axis('validated'), Z: axis('unknown') } }).verdict, 'unknown');
assert.equal(view.describe({ verdict: 'validated', axes: { X: axis('validated') } }).verdict, 'unknown');
assert.equal(view.describe({ verdict: 'validated' }).verdict, 'unknown');
assert.equal(view.describe({ verdict: 'green', axes: { X: axis('ok'), Y: axis('ok'), Z: axis('ok') } }).verdict, 'unknown');
assert.equal(view.describe({ verdict: 'unknown', axes: { X: axis('outside'), Y: axis('validated'), Z: axis('validated') } }).verdict, 'outside', 'an axis outside makes the whole check outside');
assert.equal(view.describe(null), null); assert.equal(view.describe('validated'), null);
// Reasons: strings only, bounded.
d = view.describe({ verdict: 'unknown', axes: {}, reasons: ['a'.repeat(400), 42, null, 'b'] });
assert.deepEqual(d.reasons.map((r) => r.length), [300, 1]);

// 2. The guided preparation: the checks step is green only for a validated check.
const machine = (pc) => ({ fresh: true, name: 'part.nc', originalName: 'Part.nc', workflow: 'idle', activeState: 'Idle', canStart: true, settings: { $22: '1' }, programCheck: pc });
const checks = (pc) => prep.assess({ machine: machine(pc), selection: { file: 'part.nc', name: 'part.nc' }, ticks: { tool: true, origin: true } }).steps.find((s) => s.id === 'checks');
let step = checks(unknown);
assert.equal(step.state, 'warn', 'unknown is never green'); assert.match(step.detail, /Contrôle des courses \(pas une simulation de collisions\) : non vérifié — X inconnu · Y inconnu · Z inconnu\./);
assert.match(step.detail, /Référencement non constaté/);
step = checks(validated); assert.equal(step.state, 'ok'); assert.match(step.detail, /dans la course — X validé · Y validé · Z validé/);
step = checks(outside); assert.equal(step.state, 'warn'); assert.match(step.detail, /HORS COURSE — X hors course · Y validé · Z inconnu\. Hors course X/);
step = checks({ verdict: 'validated' }); assert.equal(step.state, 'warn', 'a malformed check is not green');
// Without the server's check (older server), the client's estimate stays as before.
step = prep.assess({ machine: machine(null), selection: null, travel: { state: 'ok', message: 'Dans la course machine en X et Y' }, ticks: {} }).steps.find((s) => s.id === 'checks');
assert.match(step.detail, /Dans la course machine en X et Y/);

// 3. The start confirmation shows the ticket's check (else the snapshot's), and hides the client's
// XY estimate then; unknown is drawn neutral (data-verdict="unknown"), never "validated".
(async () => {
  const f = load(); f.window.CNCTravelCheck = require('./touch/travel-check.js');
  await f.connect(f.machine({ programCheck: validated }));
  async function confirm(ticket) {
    f.el('job-start').click(); const prepare = f.posts().at(-1); assert.equal(prepare.body.operation, 'start');
    f.answer(prepare, Object.assign({ nonce: 'n', name: 'Part.nc', expiresIn: 15 }, ticket)); await f.flush();
    assert.equal(f.el('job-dialog').hidden, false);
    const node = f.el('job-program-check'), out = { hidden: node.hidden, verdict: node.getAttribute('data-verdict'), texts: node.children.map((c) => c.textContent), chips: node.children[1] ? node.children[1].children.map((c) => c.getAttribute('data-verdict')) : [], travel: f.el('job-travel').hidden };
    f.el('job-dismiss').click(); return out;
  }
  let r = await confirm({ programCheck: unknown });
  assert.equal(r.hidden, false); assert.equal(r.verdict, 'unknown'); assert.notEqual(r.verdict, 'validated');
  assert.equal(r.texts[0], 'Contrôle des courses (pas une simulation de collisions) : non vérifié');
  assert.deepEqual(r.chips, ['unknown', 'unknown', 'unknown']); assert.match(r.texts[2], /Référencement non constaté.*ni brides, ni outil, ni matière/);
  assert.equal(r.travel, true, 'the client XY estimate is not shown beside the server check');
  r = await confirm({ programCheck: outside }); assert.equal(r.verdict, 'outside'); assert.deepEqual(r.chips, ['outside', 'validated', 'unknown']);
  r = await confirm({ programCheck: null }); assert.equal(r.verdict, 'validated', 'no ticket check: the snapshot check');
  f.push([f.machine({ programCheck: null })]);
  r = await confirm({}); assert.equal(r.hidden, true, 'no check at all: no block'); assert.equal(r.travel, false, 'the client estimate is back (older server)');
  f.controls().dispose();
  console.log('PASS program check view (F2): per-axis verdicts with reasons, unknown and malformed never green, start confirmation and guided preparation, client estimate only without the server check.');
})().catch((e) => { console.error(e); process.exit(1); });
