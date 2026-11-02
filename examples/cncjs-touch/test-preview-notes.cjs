'use strict';
// Audit 31 (fix 6, validation D7, fix 5): texts the interface showed in French in EN / ES, or
// worded for one device.
//   D-T2  the preview's note and refusals (stored in French in the sidecar) are shown in the
//         interface language (library-preview.js localize(), shared-library.js);
//   D-T3  « Simulation · » / « Machine · » of the preview viewer go through the catalog;
//   D7    the upload message names no device (« Disponible sur la tablette »), translated;
//   rail  « Seguimiento » may break at a soft hyphen (16 px kept, ui-2027.css).
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('./touch/library-preview.js');
const dir = path.join(__dirname, 'touch'), read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const FRENCH = /[éèêàùçô]|\b(ligne|aperçu|repère|déplacement|position inconnue|tracé|départ|Projection|Arcs interpolés|Puissance|secours|Vues 3D)\b/;

(async () => {
  // The note of a program in G55 with a G28 return and an O word, as render() writes it.
  const code = 'O1000\nG21 G90 G55\nG0 X0 Y0 Z5\nG1 Z-1 F300\nG1 X10 Y0 F500\nG28 G91 Z0\nG90\nG0 X0 Y0 Z5\nG1 X5 Y5\n';
  const result = await P.scan(code);
  assert(result.notes.length >= 2, 'notes produced: ' + JSON.stringify(result.notes));
  const notes = ['Tracé en coordonnées de travail ' + result.wcs + ', le repère choisi par le programme.'].concat(result.notes, ['Vues 3D non produites hors du repère G54.']);
  const variants = [
    'Projection XY indicative — G1/G2/G3 bleu, G0 gris. Arcs interpolés à 0,02 mm. Départ supposé X0 Y0 Z0, mm, absolu et centres I/J relatifs. Puissance laser non simulée.',
    'Projection XY indicative — G1/G2/G3 cyan au-dessus de Z0, du violet (peu profond) au rouge (le plus profond) sous Z0, G0 gris. Arcs interpolés à 0,02 mm. Départ supposé X0 Y0, Z relatif au point de départ, mm, absolu et centres I/J relatifs. Puissance laser non simulée.'
  ].map((base) => base + ' ' + notes.join(' ') + ' Calcul local de secours : réactivité à vérifier sur cet appareil. Encodage PNG synchrone de secours.');
  // The note as render() builds it in the source (guards the patterns against a rewording).
  const src = read('library-preview.js');
  ['Projection XY indicative — G1/G2/G3 ', 'cyan au-dessus de Z0, du violet (peu profond) au rouge (le plus profond) sous Z0', ', G0 gris. Arcs interpolés à 0,02 mm. Départ supposé X0 Y0', ', Z relatif au point de départ', ', mm, absolu et centres I/J relatifs. Puissance laser non simulée.',
    'Tracé en coordonnées de travail ', ', le repère choisi par le programme.', 'Vues 3D non produites hors du repère G54.', ' Calcul local de secours : réactivité à vérifier sur cet appareil.', ' Encodage PNG synchrone de secours.',
    ' : position inconnue de l’aperçu, tracé coupé jusqu’à ce que X, Y et Z soient redonnés en absolu.', ') ignoré par l’aperçu ; Grbl 1.1 ne le prend pas en charge (erreur 20 attendue).'].forEach((part) => assert(src.includes(part), 'note part still in the source: ' + part));
  for (const note of variants) {
    assert.equal(P.localize(note, 'fr'), note, 'French unchanged');
    for (const lang of ['en', 'es']) {
      const out = P.localize(note, lang);
      assert.doesNotMatch(out, FRENCH, lang + ': nothing left in French: ' + out);
      assert.match(out, /G55/); assert.match(out, /G28/);
    }
  }
  assert.match(P.localize(variants[0], 'en'), /^Indicative XY projection — G1\/G2\/G3 blue, G0 grey\. Arcs interpolated at 0\.02 mm\./);
  assert.match(P.localize(variants[0], 'es'), /Retorno G28 \(línea 6\)/);
  // Refusals added with the G28/G30 and work offset support (800a9ae3), as stored: « Ligne n : reason ».
  const refusals = [];
  for (const bad of ['G21 G90\nG0 X1 Y1\nG28\nG91 G1 X1 F100\n', 'G21 G90 G54\nG0 X1 Y1\nG55\nG0 X2\n', 'G21 G90\nG0 X1 Y1\nG28\nG2 X1 Y1 I1 J0 F100\n']) {
    try { await P.scan(bad); assert.fail('refused: ' + bad); } catch (e) { refusals.push(e.message); }
  }
  assert.deepEqual(refusals.map((m) => /^Ligne \d+ : /.test(m)), [true, true, true], JSON.stringify(refusals));
  for (const m of refusals) for (const lang of ['en', 'es']) assert.doesNotMatch(P.localize(m, lang), FRENCH, lang + ': ' + P.localize(m, lang));
  assert.equal(P.localize('Ligne 4 : déplacement relatif depuis une position inconnue après G28/G30', 'en'), 'Line 4: relative move from an unknown position after G28/G30');
  // An unknown text stays as written (never emptied).
  assert.equal(P.localize('Réponse inattendue', 'en'), 'Réponse inattendue');
  // Shown through localize() where the note and the refusal are displayed.
  const library = read('shared-library.js');
  assert.match(library, /\$\('library-preview-note'\)\.textContent = previewText\(String\(meta\.preview\.note/);
  assert.equal((library.match(/previewText\(String\(meta\.previewError\)\)/g) || []).length, 3);

  // D-T3: the viewer's state line through the catalog.
  const viewer = read('preview-viewer.js');
  assert.match(viewer, /uiLocale\.t\('Simulation'\):uiLocale\.t\('Machine'\)\)\+' · '/);
  assert.doesNotMatch(viewer, /'Simulation · '|'Machine · '/);
  // D7: no device name in the upload message; the neutral phrase is translated.
  assert.doesNotMatch(library, /Surface/, 'the library messages name no device (the guide still describes the reference tablet)');
  const ctx = { window: {} }; vm.runInNewContext(read('i18n-messages.js'), ctx);
  const rows = new Map(ctx.window.CNCTouchMessages.map((r) => [r[0].trim(), r]));
  assert.deepEqual(Array.from(rows.get('enregistré. Disponible sur la tablette.')), ['enregistré. Disponible sur la tablette.', 'saved. Available on the tablet.', 'guardado. Disponible en la tableta.']);
  for (const p of ['Simulation', 'Machine', 'segments.']) assert(rows.get(p) && rows.get(p)[1] && rows.get(p)[2], 'row for ' + p);
  // Rail: « Seguimiento » carries a soft hyphen; the rail label may wrap there, never shrinks.
  assert.equal(rows.get('Suivi')[2], 'Segui­miento');
  assert.match(read('ui-2027.css'), /\.ks-ui \.ks-nav span\{font-size:var\(--fs-16\);font-weight:500;max-width:100%;text-align:center;line-height:1\.1;hyphens:manual;overflow-wrap:normal\}/);
  console.log('PASS preview notes: notes and refusals of the preview shown in EN / ES, viewer state line translated, neutral upload message, rail label with a soft hyphen.');
})().catch((e) => { console.error(e); process.exit(1); });
