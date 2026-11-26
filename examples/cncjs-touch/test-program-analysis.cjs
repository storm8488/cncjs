'use strict';
// Lot N1, file analysis before the start (touch/program-analysis.js): the depth of the file against
// the stock thickness the operator types, the tools the file names, the time the spindle has to
// spin up. Three display-only warnings from the server's `programCheck`: they never disable the
// start, never send anything, and a figure the server did not compute is never shown as correct.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const { fixture, check } = require('./check-page-fixture.cjs');
const source = fs.readFileSync(path.join(__dirname, 'touch/program-analysis.js'), 'utf8');
// Values built in the page's own context: compared by content.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

// The pure part, in the three languages (the catalogue of the page, the module as the page loads it).
function pure(language) {
  const window = {}, context = { window, localStorage: { getItem: () => language, setItem() {} }, document: { documentElement: {}, title: '' } };
  for (const file of ['i18n-messages.js', 'i18n.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', file), 'utf8'), context);
  const module = { exports: {} };
  vm.runInNewContext(source, { window, module });
  return module.exports;
}
const fr = pure('fr');
const computed = (seconds, patch) => ({ spinUp: Object.assign({ state: 'computed', seconds, dwell: 0, atLeast: false, startLine: 7, entryLine: 9 }, patch) });

// 1. Depth against the stock (work zero on top of the stock unless said otherwise).
same(fr.stock({ zMin: -19.5 }, { thickness: 18, ref: 'top' }), { state: 'warn', depth: 'Le fichier descend à 19,5 mm sous le zéro Z.',
  result: 'La fraise descend 1,5 mm sous le brut : elle touchera le martyr.', note: 'Calcul valable si le zéro Z est posé sur le dessus du brut.' });
assert.equal(fr.stock({ zMin: -18 }, { thickness: 18, ref: 'top' }).result, 'La fraise arrive juste au fond du brut.');
assert.equal(fr.stock({ zMin: -18.04 }, { thickness: 18, ref: 'top' }).state, 'ok', 'below a tenth of a millimetre is not an overrun');
same([fr.stock({ zMin: -3 }, { thickness: 18, ref: 'top' }).state, fr.stock({ zMin: -3 }, { thickness: 18, ref: 'top' }).result], ['ok', 'Il reste 15 mm de matière sous la fraise.']);
// No thickness typed: an invitation, never a warning, never an invented thickness.
for (const entry of [null, undefined, { thickness: null, ref: 'top' }, { thickness: 0, ref: 'top' }, { thickness: -5, ref: 'top' }, { thickness: '18', ref: 'top' }, { thickness: NaN, ref: 'top' }]) {
  const s = fr.stock({ zMin: -50 }, entry);
  assert.equal(s.state, 'ask'); assert.equal(s.result, 'Saisissez l’épaisseur du brut pour la comparer.'); assert.equal(s.depth, 'Le fichier descend à 50 mm sous le zéro Z.');
}
assert.equal(fr.stock({ zMin: 2 }, null).depth, 'Le fichier ne descend pas sous le zéro Z.');
// Work zero on the spoilboard: what is below the zero is in the spoilboard, whatever the thickness.
same(fr.stock({ zMin: -1.5 }, { thickness: null, ref: 'bed' }), { state: 'warn', depth: 'Le fichier descend à 1,5 mm sous le zéro Z.',
  result: 'La fraise descend 1,5 mm dans le martyr.', note: 'Calcul valable si le zéro Z est posé sur le martyr.' });
assert.equal(fr.stock({ zMin: 0 }, { thickness: 18, ref: 'bed' }).result, 'La fraise arrive juste sur le martyr.');
same([fr.stock({ zMin: 0.5 }, { thickness: 18, ref: 'bed' }).state, fr.stock({ zMin: 0.5 }, { thickness: 18, ref: 'bed' }).result], ['ok', 'Il reste 0,5 mm de matière sous la fraise.']);
// The depth the server could not follow is not computed, and nothing is compared.
for (const c of [null, {}, { zMin: null }, { zMin: '-3' }, { zMin: NaN }]) same(fr.stock(c, { thickness: 18, ref: 'top' }), { state: 'unknown', depth: 'Profondeur non calculée pour ce fichier.', result: '', note: '' });

// 2. Tools named by the file.
let named = fr.tools({ tools: { list: [{ number: 1, text: 'D=3.175 - flat end mill', line: 11, noteLine: 6 }, { number: null, text: 'End Mill 6 mm', line: null, noteLine: 2 }, { number: 4, text: '', line: 30, noteLine: null }], truncated: false, changes: 2, changeLine: 11 } });
same(named, { known: true, rows: ['T1 · D=3.175 - flat end mill · ligne 11', 'End Mill 6 mm · annoncée ligne 2', 'T4 · ligne 30'], notes: ['Changements de fraise demandés : 2.'] });
same(fr.tools({ tools: { list: [], truncated: false, changes: 0, changeLine: null } }), { known: true, rows: [], notes: ['Le fichier n’indique pas sa fraise.'] });
// Bounded again on the page: number of rows, length of a description, shape of an entry.
named = fr.tools({ tools: { list: Array.from({ length: 30 }, (_, i) => ({ number: i, text: 'x'.repeat(500), line: i + 1 })).concat([null, 'T1', 7]), truncated: true, changes: 0 } });
assert.equal(named.rows.length, 8); assert(named.rows.every((row) => row.length <= 80)); same(named.notes, ['Liste abrégée : le fichier en nomme davantage.']);
// A server older than this lot sends no list: nothing is said about the tools.
for (const c of [null, {}, { tools: null }, { tools: { list: 'T1' } }]) same(fr.tools(c), { known: false, rows: [], notes: [] });

// 3. Spindle spin-up against the wanted time (3 s unless set).
same(fr.spinUp(computed(0.449), 3), { state: 'warn', text: 'La broche n’a que 0,4 s pour monter en vitesse.',
  note: 'Ajoutez une temporisation après le démarrage de la broche, dans le post-processeur. Broche démarrée ligne 7, première descente ligne 9.' });
assert.equal(fr.spinUp(computed(2.99), 3).state, 'warn', 'never rounded up to the wanted time');
assert.equal(fr.spinUp(computed(2.99), 3).text, 'La broche n’a que 2,9 s pour monter en vitesse.');
same(fr.spinUp(computed(4.125, { dwell: 3 }), 3), { state: 'ok', text: '4,1 s entre le démarrage de la broche et la première descente.', note: 'Broche démarrée ligne 7, première descente ligne 9. Dont 3 s de temporisation.' });
assert.equal(fr.spinUp(computed(4.125), 5).state, 'warn'); assert.equal(fr.spinUp(computed(1), 0.5).state, 'ok');
// An unusable wanted time falls back to 3 s.
for (const wanted of [undefined, null, NaN, 0, -1, 31, '5']) { assert.equal(fr.threshold(wanted), 3); assert.equal(fr.spinUp(computed(2.5), wanted).state, 'warn'); assert.equal(fr.spinUp(computed(3), wanted).state, 'ok'); }
// A lower bound: enough is enough, too little proves nothing (not computed, never a warning, never correct).
assert.equal(fr.spinUp(computed(5, { atLeast: true }), 3).text, 'Au moins 5 s entre le démarrage de la broche et la première descente.');
same(fr.spinUp(computed(0.75, { atLeast: true }), 3), { state: 'unknown', text: 'Au moins 0,7 s, plus le trajet d’approche : non calculé.',
  note: 'Ce trajet dépend de la position de la fraise au départ. Broche démarrée ligne 7, première descente ligne 9.' });
// What the duration model refused is « non calculé », never « correct ».
for (const s of [{ state: 'unknown', startLine: 7, entryLine: 9 }, { state: 'computed' }, { state: 'computed', seconds: '4' }, { state: 'computed', seconds: -1 }, { state: 'computed', seconds: Infinity }, { state: 'ok', seconds: 9 }, {}]) {
  const r = fr.spinUp({ spinUp: s }, 3); assert.equal(r.state, 'unknown'); assert.equal(r.text, 'Temps de montée en vitesse non calculé pour ce fichier.');
}
same(fr.spinUp({ spinUp: { state: 'noStart', startLine: null, entryLine: 4 } }, 3), { state: 'warn', text: 'Le fichier ne démarre pas la broche avant de descendre (ligne 4).', note: 'Démarrez la broche vous-même avant l’usinage, ou corrigez le fichier.' });
same(fr.spinUp({ spinUp: { state: 'noEntry', startLine: 2, entryLine: null } }, 3), { state: 'none', text: 'Aucune descente dans la matière trouvée dans ce fichier.', note: '' });
// A laser (the server sends null) and an older server (nothing): no spindle section at all.
for (const c of [null, {}, { spinUp: null }, { spinUp: 'ok' }]) assert.equal(fr.spinUp(c, 3).state, 'hidden');

// The warnings, in the order of the sheet.
same(fr.warnings(Object.assign({ zMin: -19.5 }, computed(0.4)), { thickness: 18, ref: 'top' }, 3), ['La fraise descend 1,5 mm sous le brut : elle touchera le martyr.', 'La broche n’a que 0,4 s pour monter en vitesse.']);
same(fr.warnings(Object.assign({ zMin: -19.5 }, computed(4)), null, 3), [], 'no thickness, enough time: nothing alarming');
same(fr.warnings(null, { thickness: 1, ref: 'top' }, 3), []);

// The thickness is kept per file, bounded, and an unreadable store is nothing typed.
{
  const data = new Map(), storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) }, s = fr.store(storage, 'k');
  assert.equal(s.get('a.nc'), null); assert.equal(s.set('', { thickness: 5, ref: 'top' }), false);
  assert.equal(s.set('a.nc', { thickness: 18, ref: 'top' }), true); assert.equal(s.set('b.nc', { thickness: null, ref: 'bed' }), true);
  same(s.get('a.nc'), { thickness: 18, ref: 'top' }); same(s.get('b.nc'), { thickness: null, ref: 'bed' }); assert.equal(s.get('c.nc'), null);
  for (let i = 0; i < 100; i++) s.set('f' + i + '.nc', { thickness: i + 1, ref: 'top' });
  assert(Object.keys(JSON.parse(data.get('k')).files).length <= 40, 'bounded number of files');
  same(s.get('f99.nc'), { thickness: 100, ref: 'top' });
  data.set('k', '{"files":{"a.nc":{"thickness":"18","ref":"side"},"b.nc":{"thickness":9999,"ref":"bed"},"c.nc":7}}');
  same(s.get('a.nc'), { thickness: null, ref: 'top' }); same(s.get('b.nc'), { thickness: null, ref: 'bed' }); assert.equal(s.get('c.nc'), null);
  for (const bad of ['not json', '[]', 'null', '{"files":7}']) { data.set('k', bad); assert.equal(s.get('a.nc'), null); assert.equal(s.set('a.nc', { thickness: 3, ref: 'top' }), true); same(s.get('a.nc'), { thickness: 3, ref: 'top' }); }
  const refused = fr.store({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } }, 'k');
  assert.equal(refused.get('a.nc'), null); assert.equal(refused.set('a.nc', { thickness: 3, ref: 'top' }), false);
}

// Every sentence exists in English and in Spanish (none is left as the French one); figures use the point in English.
const sentences = (a) => {
  const texts = [];
  const push = (r) => Object.keys(r).filter((k) => k !== 'state').forEach((k) => { if (typeof r[k] === 'string') texts.push(r[k]); else if (Array.isArray(r[k])) r[k].forEach((s) => texts.push(s)); });
  [[{ zMin: -19.5 }, { thickness: 18, ref: 'top' }], [{ zMin: -18 }, { thickness: 18, ref: 'top' }], [{ zMin: -3 }, { thickness: 18, ref: 'top' }], [{ zMin: -3 }, null], [{ zMin: 3 }, null], [{}, null],
    [{ zMin: -1 }, { ref: 'bed' }], [{ zMin: 0 }, { ref: 'bed' }], [{ zMin: 1 }, { ref: 'bed' }]].forEach(([c, e]) => push(a.stock(c, e)));
  push(a.tools({ tools: { list: [], truncated: true, changes: 1 } })); push(a.tools({ tools: { list: [{ number: null, text: '', line: 3 }, { number: null, text: '', noteLine: 3 }] } }));
  [computed(0.4), computed(0.4, { atLeast: true }), computed(9), computed(9, { atLeast: true, dwell: 2 }), { spinUp: { state: 'unknown', startLine: 1, entryLine: 2 } }, { spinUp: { state: 'noStart', entryLine: 2 } }, { spinUp: { state: 'noEntry' } }].forEach((c) => push(a.spinUp(c, 3)));
  return texts;
};
for (const language of ['en', 'es']) {
  const a = pure(language), texts = sentences(a), french = sentences(fr);
  assert.equal(texts.length, french.length); assert(texts.length > 40);
  texts.forEach((s, i) => { if (/[a-zà-ÿ]{3}/i.test(french[i])) assert.notEqual(s, french[i], language + ' untranslated: ' + s); });
  assert.equal(a.stock({ zMin: -19.5 }, { thickness: 18, ref: 'top' }).result.includes(language === 'en' ? '1.5 mm' : '1,5 mm'), true);
}

// ---- The page: 4 · Contrôle and 2 · Fichier, the sheet, the typed thickness. ----
const fire = (node, type) => (node.handlers[type] || []).slice().forEach((fn) => fn.call(node, { type, target: node }));
const mount = (language) => { const q = fixture(language); q.run('numeric-pad.js'); q.run('program-analysis.js'); return q; };
const N1 = { tools: { list: [{ number: 1, text: '<img src=x onerror=alert(1)> & "6 mm"', line: 11, noteLine: 6 }], truncated: false, changes: 0, changeLine: null }, spinUp: computed(1.125).spinUp };
(async () => {
  const q = mount(), node = q.node, button = node('check-analysis-open');
  assert(button && node('files-analysis-open') && node('ks-program-analysis'), 'buttons and sheet are mounted');
  assert(button.closest('.check-result-card'), 'the analysis button lives in the verdict card of Contrôle'); assert.equal(button.parentNode, node('check-details-open').parentNode, 'on the line of « Détails du contrôle »: no height added to the card'); assert(node('files-analysis-open').closest('.files-verdict'));
  // An older server (no N1 data), nothing typed: the button, no warning.
  q.send();
  assert(!button.hidden); assert.equal(button.textContent, 'Analyse du fichier…'); assert.equal(button.getAttribute('aria-label'), null); assert(node('pa-tools-block').hidden); assert(node('pa-spin-block').hidden);
  // The spindle has 1.1 s: one warning on Contrôle, and the start stays what the server says.
  q.send({ programCheck: check('validated', N1) });
  assert.equal(button.textContent, '! 1 avertissement'); assert.equal(button.getAttribute('data-tone'), 'warn');
  assert.equal(button.getAttribute('aria-label'), 'La broche n’a que 1,1 s pour monter en vitesse.');
  assert(!node('step-check-main').disabled, 'a warning never disables the start'); assert(node('step-check-cause').textContent.includes('Tout est prêt'));
  // The sheet: depth, invitation without a thickness, the file's own words as text, the spindle and its remedy.
  button.click();
  assert(!node('ks-program-analysis').hidden); assert.equal(node('pa-file').textContent, 'Loaded.nc');
  assert.equal(node('pa-depth').textContent, 'Le fichier descend à 20 mm sous le zéro Z.'); assert.equal(node('pa-stock').textContent, 'Saisissez l’épaisseur du brut pour la comparer.');
  assert.equal(node('pa-stock').getAttribute('data-tone'), 'ask'); assert.equal(node('pa-thickness').value, ''); assert.equal(node('pa-ref-top').getAttribute('aria-pressed'), 'true');
  assert.equal(node('pa-tools').textContent, 'T1 · <img src=x onerror=alert(1)> & "6 mm" · ligne 11'); assert(!node('pa-tools').querySelector('img'), 'the file text never becomes markup'); assert(node('pa-tools').innerHTML.includes('&lt;img'));
  assert.equal(node('pa-spin').textContent, '! La broche n’a que 1,1 s pour monter en vitesse.'); assert(node('pa-spin-note').textContent.includes('post-processeur')); assert.equal(node('pa-spin-min').value, '3');
  // The operator types 18 mm: the file goes 2 mm below the stock. A second warning, kept for this file.
  const thickness = node('pa-thickness'); thickness.value = '18'; fire(thickness, 'change');
  assert.equal(node('pa-stock').textContent, '! La fraise descend 2 mm sous le brut : elle touchera le martyr.'); assert.equal(node('pa-stock').getAttribute('data-tone'), 'warn');
  assert.equal(node('pa-stock-note').textContent, 'Calcul valable si le zéro Z est posé sur le dessus du brut.');
  assert.equal(button.textContent, '! 2 avertissements'); assert.equal(button.getAttribute('aria-label'), 'La fraise descend 2 mm sous le brut : elle touchera le martyr. La broche n’a que 1,1 s pour monter en vitesse.');
  same(JSON.parse(q.context.localStorage.getItem('cncjs-touch-stock-v1')).files['loaded.nc'].thickness, 18);
  assert(!node('step-check-main').disabled, 'two warnings never disable the start');
  // Work zero on the spoilboard: the same file cuts 20 mm into it.
  node('pa-ref-bed').click();
  assert.equal(node('pa-ref-bed').getAttribute('aria-pressed'), 'true'); assert.equal(node('pa-ref-top').getAttribute('aria-pressed'), 'false');
  assert.equal(node('pa-stock').textContent, '! La fraise descend 20 mm dans le martyr.'); assert.equal(node('pa-stock-note').textContent, 'Calcul valable si le zéro Z est posé sur le martyr.');
  node('pa-ref-top').click(); assert(node('pa-stock').textContent.includes('2 mm sous le brut'));
  // An unreadable or out-of-range entry is never a thickness: the last one stays; emptied, the invitation returns.
  for (const bad of ['abc', '-4', '0', '5000', '1e3']) { thickness.value = bad; fire(thickness, 'change'); assert.equal(thickness.value, '18', bad); assert(node('pa-stock').textContent.includes('2 mm sous le brut')); }
  thickness.value = '25,5'; fire(thickness, 'change'); assert.equal(node('pa-stock').textContent, '✓ Il reste 5,5 mm de matière sous la fraise.'); assert.equal(node('pa-stock').getAttribute('data-tone'), 'ok'); assert.equal(button.textContent, '! 1 avertissement');
  thickness.value = ''; fire(thickness, 'change'); assert.equal(node('pa-stock').textContent, 'Saisissez l’épaisseur du brut pour la comparer.');
  // The wanted spin-up time is a setting of this tablet: 1 s wanted, 1.1 s is enough.
  const wanted = node('pa-spin-min'); wanted.value = '1'; fire(wanted, 'change');
  assert.equal(node('pa-spin').textContent, '✓ 1,1 s entre le démarrage de la broche et la première descente.'); assert.equal(button.textContent, 'Analyse du fichier…'); assert.equal(button.getAttribute('data-tone'), '');
  assert.equal(q.context.localStorage.getItem('cncjs-touch-spinup-v1'), '1');
  for (const bad of ['0', '99', 'x']) { wanted.value = bad; fire(wanted, 'change'); assert.equal(wanted.value, '1', bad); }
  wanted.value = ''; fire(wanted, 'change'); assert.equal(wanted.value, '3'); assert.equal(node('pa-spin').getAttribute('data-tone'), 'warn');
  // What the server did not compute is « non calculé », and counts for no warning.
  q.send({ programCheck: check('validated', { tools: N1.tools, spinUp: { state: 'unknown', startLine: 7, entryLine: 9 }, zMin: null }) });
  assert.equal(node('pa-spin').textContent, 'Temps de montée en vitesse non calculé pour ce fichier.'); assert.equal(node('pa-depth').textContent, 'Profondeur non calculée pour ce fichier.'); assert.equal(button.textContent, 'Analyse du fichier…');
  // No file loaded, or a laser: no analysis button on Contrôle.
  q.send({ name: '', programCheck: null }); assert(button.hidden);
  q.send({ machineProfile: { kind: 'laser' }, programCheck: check('validated', { tools: N1.tools, spinUp: null }) }); assert(button.hidden); assert(node('files-analysis-open').hidden);

  // 2 · Fichier: the check of the chosen file, before any loading; a late answer of another file is not shown.
  const files = node('files-analysis-open');
  q.send(); q.window.cncShell.go('files'); assert(files.hidden, 'nothing chosen');
  q.select('a.nc'); assert(files.hidden, 'no check yet'); q.select('b.nc');
  q.requests.find((r) => r.file === 'a.nc').resolve({ programCheck: check('validated', { tools: N1.tools, spinUp: computed(0.2).spinUp }) }); await q.flush(); assert(files.hidden, 'the answer of a file no longer chosen');
  q.requests.filter((r) => r.file === 'b.nc').pop().resolve({ programCheck: check('validated', { zMin: -12, tools: { list: [], truncated: false, changes: 0, changeLine: null }, spinUp: computed(8).spinUp }) }); await q.flush();
  assert(!files.hidden); assert.equal(files.textContent, 'Analyse du fichier…');
  files.click(); assert.equal(node('pa-file').textContent, 'b.nc'); assert.equal(node('pa-depth').textContent, 'Le fichier descend à 12 mm sous le zéro Z.'); assert.equal(node('pa-tools').textContent, 'Le fichier n’indique pas sa fraise.');
  assert.equal(node('pa-spin').textContent, '✓ 8 s entre le démarrage de la broche et la première descente.'); assert.equal(thickness.value, '', 'the thickness of another file is not reused');
  thickness.value = '10'; fire(thickness, 'change'); assert.equal(files.textContent, '! 1 avertissement'); assert.equal(node('pa-stock').textContent, '! La fraise descend 2 mm sous le brut : elle touchera le martyr.');
  assert.equal(button.textContent, 'Analyse du fichier…', 'the loaded file keeps its own answer');
  // Another choice: its own thickness (none), then back: the 10 mm of b.nc are still there.
  q.select('c.nc'); assert(files.hidden); q.requests.filter((r) => r.file === 'c.nc').pop().resolve({ programCheck: check('validated', { zMin: -12 }) }); await q.flush(); assert.equal(files.textContent, 'Analyse du fichier…');
  q.select('b.nc'); q.requests.filter((r) => r.file === 'b.nc').pop().resolve({ programCheck: check('validated', { zMin: -12 }) }); await q.flush(); assert.equal(files.textContent, '! 1 avertissement');
  // A check that carries none of the analysis data (simulation, older server) still opens the sheet: depth not computed.
  q.select('d.nc'); assert(files.hidden); q.requests.filter((r) => r.file === 'd.nc').pop().resolve({ programCheck: { verdict: 'unknown', axes: {} } }); await q.flush();
  assert(!files.hidden); assert.equal(files.textContent, 'Analyse du fichier…'); files.click(); assert.equal(node('pa-depth').textContent, 'Profondeur non calculée pour ce fichier.'); assert(node('pa-tools-block').hidden); assert(node('pa-spin-block').hidden);
  // Nothing was sent to the machine by any of this: no start, no load, no override.
  same(q.calls, []);

  // The numeric pad of the page opens on the field (touch entry), with its limits.
  node('pa-thickness').click(); assert(q.window.CNCNumeric.opened(), 'the pad opens on a tap'); assert.equal(node('t-numpad-title').textContent, 'Épaisseur du brut'); q.window.CNCNumeric.close();

  // A page reloaded finds the thickness and the wanted time again (same storage).
  for (const language of ['en', 'es']) {
    const p = fixture(language); p.context.localStorage.setItem('cncjs-touch-stock-v1', JSON.stringify({ files: { 'loaded.nc': { thickness: 18, ref: 'top', at: 1 } } })); p.context.localStorage.setItem('cncjs-touch-spinup-v1', '5');
    p.run('numeric-pad.js'); p.run('program-analysis.js'); p.send({ programCheck: check('validated', { tools: { list: [], truncated: false, changes: 0, changeLine: null }, spinUp: computed(4).spinUp }) });
    const en = language === 'en';
    assert.equal(p.node('check-analysis-open').textContent, en ? '! 2 warnings' : '! 2 avisos');
    assert.equal(p.node('check-analysis-open').getAttribute('aria-label'), en ? 'The bit goes 2 mm below the stock: it will cut into the spoilboard. The spindle has only 4 s to reach its speed.' : 'La fresa baja 2 mm por debajo del material: tocará la mesa de sacrificio. El husillo solo tiene 4 s para alcanzar su velocidad.');
    assert.equal(p.node('ks-program-analysis-title').textContent, en ? 'File analysis' : 'Análisis del archivo');
    assert.equal(p.node('pa-ref-top').textContent, en ? 'Z zero on top of the stock' : 'Cero Z sobre el material');
    assert.equal(p.node('pa-tools').textContent, en ? 'The file does not name its bit.' : 'El archivo no indica su fresa.');
    assert(!/Profondeur|Fraises|Montée|Épaisseur|Temps voulu|avertissements/.test(p.node('ks-program-analysis').textContent), language + ': the sheet is translated');
  }
  // The real page loads the module after the screen it extends; operator texts carry no setting or G-code name.
  assert(fs.readFileSync(path.join(__dirname, 'touch/index.html'), 'utf8').includes('<script defer src="check-screen.js?v=v2v"></script><script defer src="program-analysis.js?v=v2v"></script>'));
  assert(!fs.readFileSync(path.join(__dirname, 'touch/simulation.html'), 'utf8').includes('program-analysis.js'), 'the simulator page, which has no style sheet for these screens, is left as it is');
  const literals = source.match(/'(?:[^'\\]|\\.)*'/g) || [];
  for (const s of literals) assert(!/\$\d|\b[GM]\d+\b/.test(s), 'technical operator text: ' + s);
  console.log('PASS file analysis (N1): stock depth, tools named by the file, spindle spin-up; warnings only, FR/EN/ES.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
