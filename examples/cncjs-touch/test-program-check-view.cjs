'use strict';
// Server travel pre-check (F2) on the client: per-axis validated / outside / unknown with the
// server's reasons, labelled "not a collision simulation", in the start confirmation and in
// the guided preparation. Unknown (and anything malformed) is never shown green; the
// server's check replaces the client's XY estimate when it is there.
const assert = require('assert').strict;
const view = require('./touch/program-check-view.js');
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

// Control owns the rendered server verdict; the confirmation carries no client estimate.
const fs=require('fs');const source=fs.readFileSync(__dirname+'/touch/job-controls.js','utf8');
assert(!source.includes('id="job-program-check"'));assert(!source.includes('CNCTravelCheck.check'));
console.log('PASS program check view: per-axis server verdicts, malformed checks never green, client estimate retired.');
