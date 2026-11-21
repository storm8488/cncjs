'use strict';
// Project sheets (F3) and Autolevel provenance (F6) in Fichiers: the pure model (search,
// work offset, incompatibilities, provenance text) and the view over shared-library.js in
// the DOM fixture (extended search, favourites, a sheet for another version kept only on
// request, editing, provenance and its warnings). No server, no machine: no request ever
// reaches the job service.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const M = require('./touch/projects.js');
const FP_A = 'sha256:' + 'a'.repeat(64), FP_OLD = 'sha256:' + '0'.repeat(64), FP_AL = 'sha256:' + 'c'.repeat(64);
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise(setImmediate); };

// ---- Model ----
const fresh = (wcs, offset, units = 'mm') => ({ fresh: true, operator: { wcs, reportUnits: units },
  coordinates: { mpos: { x: offset.x + 10, y: offset.y + 20, z: offset.z + 5 }, wpos: { x: 10, y: 20, z: 5 } } });
const comp = (extra) => ({ compensation: Object.assign({ original: 'part.nc', originalVersion: 'current',
  grid: { name: 'part.probe', points: 6, columns: 3, rows: 2, regular: true, xMin: 0, xMax: 20, yMin: 0, yMax: 15, stepX: 10, stepY: 15, units: 'mm' },
  probedAt: '2026-10-30T08:00:00.000Z', capture: { wcs: 'G54', reportUnits: 'mm', offset: { x: -150, y: -100, z: -40.5 } }, tool: 'V 30°', probeProfile: null }, extra) });
const texts = (list) => list.map(w => w.text).join(' | ');
{
  assert(M.matches({ material: 'Chêne massif', tool: 'Fraise 6' }, 'CHÊNE'));
  assert(M.matches({ notes: 'brides à gauche', related: ['couvercle.nc'] }, 'couvercle'));
  assert(M.matches(comp(), 'part.probe'), 'the grid name is searchable');
  assert(!M.matches({ material: 'MDF' }, ''), 'an empty query matches through the name search only');
  assert(!M.matches(null, 'x'));
  assert.deepEqual(M.offsetOf(fresh('G54', { x: -150, y: -100, z: -40.5 })), { x: -150, y: -100, z: -40.5 });
  assert.equal(M.offsetOf({ coordinates: { mpos: { x: 1 }, wpos: { x: 1 } } }), null);
  assert.equal(M.captureNow({ fresh: false }).capture, null);
  assert.equal(M.captureNow(fresh(null, { x: 0, y: 0, z: 0 })).capture, null, 'an unknown WCS is never recorded');
  assert.deepEqual(M.captureNow(fresh('G55', { x: 1, y: 2, z: 3 })).capture, { wcs: 'G55', reportUnits: 'mm', offset: { x: 1, y: 2, z: 3 } });
  // Same frame and origin: nothing to report.
  assert.deepEqual(M.warnings(comp(), fresh('G54', { x: -150.02, y: -100, z: -40.5 }), []), []);
  assert.deepEqual(M.warnings({ material: 'x' }, null, []), [], 'a sheet without provenance has no warning');
  let w = M.warnings(comp({ originalVersion: 'other' }), fresh('G55', { x: -149, y: -100, z: -41 }), []);
  assert.match(texts(w), /L’original a changé/); assert.match(texts(w), /Repère actuel G55 différent du repère du palpage G54/);
  assert.match(texts(w), /Origine déplacée depuis le palpage \(X \+1, Z -0[.,]5 mm\)/);
  assert.equal(w[0].level, 'danger');
  assert.match(texts(M.warnings(comp({ originalVersion: 'missing' }), fresh('G54', { x: -150, y: -100, z: -40.5 }), [])), /Original absent/);
  assert.match(texts(M.warnings(comp(), fresh('G54', { x: -150, y: -100, z: -40.5 }, 'in'), [])), /Unités de rapport différentes/);
  assert.doesNotMatch(texts(M.warnings(comp(), fresh('G54', { x: 0, y: 0, z: 0 }, 'in'), [])), /Origine déplacée/, 'offsets in other units are not compared');
  assert.match(texts(M.warnings(comp(), { fresh: false }, [])), /État machine indisponible/);
  assert.match(texts(M.warnings(comp({ capture: null }), fresh('G54', { x: 0, y: 0, z: 0 }), [])), /non enregistrés/);
  const profile = { name: 'Plaque', thickness: 10, fast: 100 };
  const rev = M.profileRevision(profile);
  assert.equal(rev, M.profileRevision({ fast: 100, thickness: 10, name: 'Plaque' }), 'key order does not matter');
  assert.notEqual(rev, M.profileRevision({ name: 'Plaque', thickness: 10.5, fast: 100 }));
  const withProfile = comp({ probeProfile: { name: 'Plaque', revision: rev } }), ok = fresh('G54', { x: -150, y: -100, z: -40.5 });
  assert.deepEqual(M.warnings(withProfile, ok, [profile]), []);
  assert.match(texts(M.warnings(withProfile, ok, [{ name: 'Plaque', thickness: 9, fast: 100 }])), /Profil de palpage « Plaque » modifié depuis la grille/);
  assert.match(texts(M.warnings(withProfile, ok, [])), /absent de cette tablette/);
  const p = M.provenance(comp(), n => n.toUpperCase());
  assert.match(p, /^Compensé depuis PART\.NC · grille 3 × 2 points, pas 10 × 15 mm, X 0 à 20, Y 0 à 15 mm · palpée le /);
  assert.match(p, /G54 · outil V 30°$/);
  assert.equal(M.stockValue(''), null); assert.equal(M.stockValue('12,5'), 12.5); assert(Number.isNaN(M.stockValue('-3')));
}

// ---- View over shared-library.js ----
function XHR(pending) {
  return function () {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.headers = {}; this.setRequestHeader = (k, v) => { this.headers[k] = v; };
    this.getResponseHeader = () => null;
    this.send = body => { this.body = body; pending.push(this); };
    this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
  };
}
function reply(xhr, value, status = 200) { xhr.status = status; xhr.responseText = JSON.stringify(value); xhr.onload(); }

async function page(options = {}) {
  const { document, node } = require('./dom-fixture.cjs').createDOM(['files']);
  const pending = [], listeners = {}, numeric = [];
  const store = new Map([['cnc', JSON.stringify({ state: { session: { token: 't' } } })],
    ['cnc-touch-probes-v1-real', JSON.stringify({ version: 1, selected: 0, profiles: [{ name: 'Plaque', thickness: 10, fast: 100 }] })]]);
  let machine = options.machine || null; const subscribers = [];
  const window = {
    addEventListener: (n, f) => (listeners[n] || (listeners[n] = [])).push(f),
    dispatchEvent: e => (listeners[e.type] || []).slice().forEach(f => f(e)),
    location: { pathname: '/touch/index.html' },
    cncState: { get: () => ({ apiBase: '/api', machine }), subscribe: f => { subscribers.push(f); f({}); } },
    CNCNumeric: { bind: (input, rules) => numeric.push([input, rules]) }
  };
  const ctx = {
    window, document, Blob, setTimeout: () => 0, Promise, JSON,
    CustomEvent: function (type, o) { this.type = type; this.detail = o && o.detail; },
    FileReader: function () { this.readAsText = (file) => { this.result = file._text; Promise.resolve().then(() => this.onload()); }; },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    XMLHttpRequest: XHR(pending)
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  for (const name of ['shared-library.js', 'projects.js']) vm.runInContext('(function(window){with(window){' + fs.readFileSync(__dirname + '/touch/' + name, 'utf8') + '\n}}).call(window, window)', ctx);
  const take = (method, endpoint, file) => {
    const i = pending.findIndex(x => x.method === method && x.url.split('?')[0].endsWith(endpoint) && (file === undefined || JSON.parse(x.body || '{}').file === file));
    assert(i >= 0, 'expected ' + method + ' ' + endpoint + ' ' + (file || '') + ' among ' + pending.map(x => x.method + ' ' + x.url).join(', '));
    return pending.splice(i, 1)[0];
  };
  const files = [{ type: 'f', name: 'a.nc', size: 100, mtime: '2026-10-21' }, { type: 'f', name: 'b.nc', size: 100, mtime: '2026-10-20' },
    { type: 'f', name: 'AL_a.nc', size: 100, mtime: '2026-10-19' }, { type: 'f', name: '.cnctouch-projects.json', size: 10, mtime: '2026-10-22' }];
  // Startup: the sheets index, then the library list.
  reply(take('GET', '/touch-projects'), { entries: options.entries || [] }); await flush();
  reply(take('GET', '/watch/status'), { configured: true }); await flush();
  reply(take('POST', '/watch/files'), { files }); await flush();
  return { node, pending, take, window, numeric, subscribers, setMachine: m => { machine = m; subscribers.forEach(f => f({})); },
    rows: () => node('library-list').children.filter(c => c.getAttribute && c.getAttribute('data-file')).map(c => c.getAttribute('data-file')),
    jobRequests: () => pending.filter(x => /touch-job|touch-motion/.test(x.url)) };
}
const read = (file, version, entry, fp = FP_A) => ({ file, fingerprint: fp, size: 100, version, entry });

(async () => {
  // Search and favourites: the name search is unchanged; sheets extend it.
  let v = await page({ entries: [{ file: 'b.nc', favorite: true, material: 'Chêne', notes: 'brides', version: 'current' },
    { file: 'AL_a.nc', compensation: { original: 'a.nc', grid: { name: 'a.probe' } }, version: 'other' }] });
  assert.deepEqual(v.rows(), ['a.nc', 'b.nc', 'AL_a.nc'], 'the store file is never listed');
  v.node('library-search').value = 'b.n'; v.node('library-search').handlers.input();
  assert.deepEqual(v.rows(), ['b.nc'], 'name search as before');
  v.node('library-search').value = 'chêne'; v.node('library-search').handlers.input();
  assert.deepEqual(v.rows(), ['b.nc'], 'material found');
  v.node('library-search').value = 'a.probe'; v.node('library-search').handlers.input();
  assert.deepEqual(v.rows(), ['AL_a.nc'], 'grid name found');
  v.node('library-search').value = ''; v.node('library-search').handlers.input();
  v.node('library-favorites').handlers.click();
  assert.equal(v.node('library-favorites').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(v.rows(), ['b.nc'], 'favourites only');
  v.node('library-favorites').handlers.click();
  assert.equal(v.rows().length, 3);
  const labelOf = name => v.node('library-list').children.find(c => c.getAttribute && c.getAttribute('data-file') === name)._state.textContent;
  assert.match(labelOf('b.nc'), /★ Favori/);
  assert.match(labelOf('AL_a.nc'), /≈ Compensé · ⚠ Fiche d’une autre version/);

  // The selected file (a.nc, newest) opens its sheet: written for another version.
  v.take('POST', '/watch/file');
  reply(v.take('POST', '/touch-projects/read', 'a.nc'), read('a.nc', 'other', { file: 'a.nc', fingerprint: FP_OLD, material: 'MDF', favorite: false, related: [] })); await flush();
  assert.equal(v.node('project-version').hidden, false);
  assert.match(v.node('project-version').textContent, /autre version de ce fichier/);
  assert.equal(v.node('project-save').disabled, true, 'not editable before it is kept');
  assert.equal(v.node('project-favorite').disabled, true);
  assert.match(v.node('project-summary').textContent, /Matière : MDF/);
  // Declared values for the v2 comparisons (Fichiers, Préparer): a sheet of another version gives none.
  assert.equal(JSON.stringify(v.window.CNCProjects.declared('a.nc')), JSON.stringify({ file: 'a.nc', fingerprint: FP_A, version: 'other', material: null, tool: null, stock: null }));
  assert.equal(v.window.CNCProjects.declared('b.nc'), null, 'only the selected file’s sheet is known');
  v.node('project-adopt').handlers.click(); await flush();
  let put = v.take('PUT', '/touch-projects', 'a.nc');
  assert.deepEqual(JSON.parse(put.body), { adopt: true, file: 'a.nc', fingerprint: FP_A });
  reply(put, read('a.nc', 'current', { file: 'a.nc', fingerprint: FP_A, material: 'MDF', favorite: false, related: [] })); await flush();
  assert.equal(v.node('project-version').hidden, true); assert.equal(v.node('project-save').disabled, false);
  assert.match(v.node('project-status').textContent, /gardée pour cette version/);

  // Editing in the dialog: text fields, stock through the numeric pad, an associated file.
  assert.equal(v.node('project-dialog').hidden, true);
  v.node('project-edit').handlers.click();
  assert.equal(v.node('project-dialog').hidden, false); assert.equal(v.node('project-editor').hidden, false); assert.equal(v.node('project-compensation').hidden, true);
  assert.equal(v.node('project-material').value, 'MDF', 'the dialog opens on the stored sheet');
  assert.deepEqual(v.numeric.map(([input, rules]) => [input.id, rules.unit, rules.negative]), [['project-stock-x', 'mm', false], ['project-stock-y', 'mm', false], ['project-stock-z', 'mm', false]]);
  v.node('project-material').value = 'Chêne'; v.node('project-tool').value = 'Fraise 3 mm';
  v.node('project-stock-x').value = '200'; v.node('project-stock-y').value = '100,5'; v.node('project-stock-z').value = '';
  v.node('project-notes').value = 'Z0 dessus';
  assert.deepEqual(v.node('project-related-choice').children.map(o => o.value), ['', 'b.nc', 'AL_a.nc']);
  v.node('project-related-choice').value = 'b.nc'; v.node('project-related-add').handlers.click();
  v.node('project-save').handlers.click(); await flush();
  put = v.take('PUT', '/touch-projects', 'a.nc');
  assert.deepEqual(JSON.parse(put.body).meta, { material: 'Chêne', tool: 'Fraise 3 mm', stock: { x: 200, y: 100.5, z: null }, notes: 'Z0 dessus', related: ['b.nc'] });
  reply(put, read('a.nc', 'current', { file: 'a.nc', fingerprint: FP_A, material: 'Chêne', tool: 'Fraise 3 mm', stock: { x: 200, y: 100.5, z: null }, notes: 'Z0 dessus', favorite: false, related: ['b.nc', 'gone.nc'] })); await flush();
  assert.equal(v.node('project-dialog').hidden, true, 'closed once saved');
  assert.match(v.node('project-summary').textContent, /Matière : Chêne · Outil : Fraise 3 mm · Brut : 200 × 100[.,]5 × \? mm · Notes : Z0 dessus/);
  assert.equal(JSON.stringify(v.window.CNCProjects.declared('a.nc')), JSON.stringify({ file: 'a.nc', fingerprint: FP_A, version: 'current', material: 'Chêne', tool: 'Fraise 3 mm', stock: { x: 200, y: 100.5, z: null } }));
  const links = v.node('project-related-links').children;
  assert.deepEqual(links.map(b => [b.textContent, b.disabled]), [['↗ b.nc', false], ['↗ gone.nc (absent)', true]]);
  // An invalid stock never leaves the page; the dialog stays open with the reason.
  v.node('project-edit').handlers.click(); v.node('project-stock-z').value = '-2'; v.node('project-save').handlers.click(); await flush();
  assert.match(v.node('project-status').textContent, /Brut Z : nombre de 0 à 10000 mm attendu/);
  assert(!v.pending.some(x => x.method === 'PUT'));
  assert.equal(v.node('project-dialog').hidden, false); assert.match(v.node('project-dialog-status').textContent, /Brut Z/);
  v.node('project-dialog-close').handlers.click(); assert.equal(v.node('project-dialog').hidden, true);
  // A changed file since the sheet was opened: the sheet is read again.
  v.node('project-stock-z').value = ''; v.node('project-favorite').handlers.click(); await flush();
  put = v.take('PUT', '/touch-projects', 'a.nc'); assert.deepEqual(JSON.parse(put.body).meta, { favorite: true });
  reply(put, { message: 'Le fichier a changé depuis l’ouverture de la fiche : rouvrez-la.', code: 'ECHANGED' }, 409); await flush();
  reply(v.take('POST', '/touch-projects/read', 'a.nc'), read('a.nc', 'other', { file: 'a.nc', fingerprint: FP_A, material: 'Chêne', related: [] }, FP_OLD)); await flush();
  assert.match(v.node('project-status').textContent, /a changé/); assert.equal(v.node('project-version').hidden, false);
  // The library sees the selected file replaced under its name: the sheet and the index are read again.
  v.window.dispatchEvent({ type: 'cnc-library-preview-updated', detail: { file: 'a.nc' } }); await flush();
  reply(v.take('POST', '/touch-projects/read', 'a.nc'), read('a.nc', 'other', { file: 'a.nc', fingerprint: FP_A, material: 'Chêne', related: [] }, FP_OLD));
  reply(v.take('GET', '/touch-projects'), { entries: [{ file: 'a.nc', material: 'Chêne', version: 'other' }] }); await flush();
  assert.match(v.node('library-list').children.find(c => c.getAttribute && c.getAttribute('data-file') === 'a.nc')._state.textContent, /⚠ Fiche d’une autre version/);
  // An associated file opens in the card.
  links[0].handlers.click(); await flush();
  v.take('POST', '/watch/file', 'b.nc.cnctouch.json');
  reply(v.take('POST', '/touch-projects/read', 'b.nc'), read('b.nc', 'none', null)); await flush();
  assert.equal(v.node('project-summary').textContent, 'Aucune fiche pour ce fichier.');

  // A compensated file: provenance, link to the original, incompatibilities with the machine now.
  v.setMachine(fresh('G55', { x: -150, y: -100, z: -40.5 }));
  v.window.cncLibraryView.selectName('AL_a.nc'); await flush();
  v.take('POST', '/watch/file', 'AL_a.nc.cnctouch.json');
  const rev = M.profileRevision({ name: 'Plaque', thickness: 10, fast: 100 });
  reply(v.take('POST', '/touch-projects/read', 'AL_a.nc'), read('AL_a.nc', 'current', Object.assign({ file: 'AL_a.nc', fingerprint: FP_AL, related: [] },
    comp({ original: 'a.nc', originalVersion: 'other', probeProfile: { name: 'Plaque', revision: rev } })), FP_AL)); await flush();
  assert.match(v.node('project-provenance').textContent, /^Compensé depuis a\.nc · grille 3 × 2 points/);
  assert.equal(v.node('project-open-original').hidden, false);
  const warns = v.node('project-warnings').children.map(li => li.textContent).join(' | ');
  assert.match(warns, /L’original a changé/); assert.match(warns, /Repère actuel G55 différent du repère du palpage G54/);
  assert.doesNotMatch(warns, /Profil/, 'same profile revision');
  assert.equal(v.node('project-warnings').hidden, false);
  // The card keeps one line: the most serious warning and how many more.
  assert.match(v.node('project-alert').textContent, /^⚠ L’original a changé .* \(\+1\)$/);
  assert.equal(v.node('project-alert').getAttribute('data-tone'), 'danger');
  v.node('project-open').handlers.click();
  assert.equal(v.node('project-dialog').hidden, false); assert.equal(v.node('project-details').hidden, false); assert.equal(v.node('project-editor').hidden, true);
  v.node('project-dialog-close').handlers.click();
  // The machine back on G54: that warning goes, the original's stays.
  v.setMachine(fresh('G54', { x: -150, y: -100, z: -40.5 }));
  assert.doesNotMatch(v.node('project-warnings').children.map(li => li.textContent).join(' | '), /Repère actuel/);
  assert.doesNotMatch(v.node('project-alert').textContent, /\(\+/);
  // Declaring the provenance again: original guessed from AL_, grid file read on the tablet, frame captured.
  v.node('project-compensate').handlers.click();
  assert.equal(v.node('project-compensation').hidden, false); assert.equal(v.node('project-editor').hidden, true);
  assert.equal(v.node('project-original').value, 'a.nc');
  assert.equal(v.node('project-capture').disabled, false);
  assert.match(v.node('project-capture-now').textContent, /^Maintenant : G54 · X -150 Y -100 Z -40[.,]5 mm$/);
  v.node('project-capture').checked = true; v.node('project-profile').value = 'Plaque'; v.node('project-probed-at').value = '2026-10-29';
  v.node('project-probe').files = [{ name: 'a.probe', size: 40, lastModified: Date.parse('2026-10-28T10:00:00Z'), _text: '0 0 0\n10 0 0\n0 10 0\n' }];
  v.node('project-compensation-save').handlers.click(); await flush();
  put = v.take('PUT', '/touch-projects', 'AL_a.nc');
  const c = JSON.parse(put.body).meta.compensation;
  assert.deepEqual(c, { original: 'a.nc', probe: { name: 'a.probe', text: '0 0 0\n10 0 0\n0 10 0\n', probedAt: new Date('2026-10-29T12:00:00').toISOString() },
    capture: { wcs: 'G54', reportUnits: 'mm', offset: { x: -150, y: -100, z: -40.5 } }, tool: 'V 30°', probeProfile: { name: 'Plaque', revision: rev } });
  reply(put, { message: 'Original introuvable dans la bibliothèque : envoyez-le d’abord.', code: 'ENOORIGINAL' }, 409); await flush();
  assert.match(v.node('project-status').textContent, /Original introuvable/);
  assert.equal(v.node('project-dialog').hidden, false, 'a refusal keeps the dialog open');
  assert.match(v.node('project-dialog-status').textContent, /Original introuvable/);
  // The original opens from the provenance (the dialog closes with the selection).
  v.node('project-dialog-close').handlers.click();
  v.node('project-open-original').handlers.click(); await flush();
  v.take('POST', '/watch/file', 'a.nc.cnctouch.json');
  assert.equal(v.window.cncLibrarySelection.file, 'a.nc');
  // Nothing in all of this addressed the job service, a feed, a spindle or a setting.
  assert.deepEqual(v.jobRequests(), []);

  // A server without the route (older CNCjs, the local preview fixture): the sheet says so.
  v = await page({});
  v.take('POST', '/watch/file');
  reply(v.take('POST', '/touch-projects/read', 'a.nc'), { message: 'Not found' }, 404); await flush();
  assert.equal(v.node('project-summary').textContent, 'Fiches projets indisponibles sur ce serveur.');
  assert.equal(v.node('project-save').disabled, true); assert.equal(v.node('project-edit').disabled, true);

  // Both pages load projects.js after shared-library.js.
  for (const name of ['index.html', 'simulation.html']) {
    const html = fs.readFileSync(__dirname + '/touch/' + name, 'utf8');
    assert(html.indexOf('projects.js?v=') > html.indexOf('shared-library.js?v='), name);
  }
  console.log('PASS projects: sheets bound to the file version, extended search, favourites, Autolevel provenance and warnings');
})().catch(error => { console.error(error); process.exit(1); });
