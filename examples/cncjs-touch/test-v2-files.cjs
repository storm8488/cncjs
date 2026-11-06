'use strict';
// Performance v2 · Fichiers (L5, REFLEXION.md proposition 7, §5 « Fichiers »): shared-library.js
// separates « Sélection » and « Chargé dans la machine » in a dedicated band, with a short comparison
// (name/version, dimensions, declared tool and material, fingerprint valid/unknown) and the match
// verdict (same / different / unknown, never guessed from a name). Selecting never loads; nothing is
// started; rows keep static thumbnails; DOM writes happen in animation frames. Outside perf-v2 nothing
// changes. shared-library.js on the synthetic DOM, mocked server.
const fs = require('fs'), vm = require('vm'), assert = require('assert').strict;
const FP = 'sha256:' + 'a'.repeat(64), FP2 = 'sha256:' + 'b'.repeat(64);
function libraryPage(options = {}) {
  const { document, node, element, activeScreens } = require('./dom-fixture.cjs').createDOM(['files']);
  const handlers = {}, frames = [], requests = [], catalogues = [], created = [];
  const createElement = document.createElement; document.createElement = tag => { created.push(tag); return createElement(tag); };
  const listed = [{ name: 'a.nc', type: 'f', size: 1000, mtime: '2026-11-05T10:20:00Z' }, { name: 'b.nc', type: 'f', size: 2000, mtime: '2026-11-04T09:00:00Z' },
    { name: 'a.nc.cnctouch.json', type: 'f', size: 10, mtime: '2026-11-05T10:20:01Z' }];
  const sidecar = { 'a.nc': { version: 1, file: 'a.nc', originalName: 'Pièce A.nc', fingerprint: FP, preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 228, 148], zBounds: [-18, 5], projection: { units: 'mm', bounds: [0, 0, 228, 148] } } },
    'b.nc': { version: 1, file: 'b.nc', originalName: 'B.nc', preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 10, 20] } } };
  const content = element('div', 'perf-v2-files'); content.hidden = true;
  const v2 = { layout: options.v2 !== false };
  const window = { addEventListener: (n, f) => { handlers[n] = handlers[n] || []; handlers[n].push(f); }, dispatchEvent() {},
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
    cncI18n: { t: s => s, html: s => s, locale: 'fr-FR', language: 'fr', registerCatalog: (name, rows) => { catalogues.push([name, rows]); return true; } } };
  if (options.contract !== false) window.cncV2 = { gate: () => v2.layout, state: () => ({ layout: v2.layout, safeIdle: true }),
    mounts: { get: name => v2.layout && name === 'files' ? { screen: 'files', root: node('screen-files'), content, origin: null } : null } };
  const ctx = { document, window, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'test' } } }) }, setInterval() {}, setTimeout() {},
    XMLHttpRequest: function () {
      this.open = (m, url) => { this.method = m; this.url = url; }; this.setRequestHeader = () => {};
      this.send = body => { requests.push({ method: this.method, url: this.url, body }); this.status = 200; let result;
        if (this.url.endsWith('status')) result = { configured: true };
        else if (this.url.endsWith('files')) result = { files: listed.slice() };
        else { const file = JSON.parse(body).file.replace(/\.cnctouch\.json$/, ''); result = { data: JSON.stringify(sidecar[file]), preview: { stale: false } }; }
        this.responseText = JSON.stringify(result); Promise.resolve().then(() => this.onload()); };
    } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/shared-library.js', 'utf8'), ctx);
  const emit = (n, detail) => (handlers[n] || []).slice().forEach(f => f({ detail }));
  const frame = () => frames.splice(0).forEach(f => f(0));
  const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(setImmediate); frame(); } };
  const find = id => content.querySelectorAll('*').find(e => e.id === id);
  return { window, document, node, content, v2, emit, frame, flush, find, frames, requests, catalogues, created, activeScreens, sidecar,
    status: machine => emit('cnc-job-status', { machine, simulation: false }) };
}
(async () => {
  // ---- Outside perf-v2 (no contract, or no v2 layout): no frame, no DOM, no catalogue. ----
  for (const options of [{ contract: false }, { v2: false }]) {
    const p = libraryPage(options); await p.flush();
    p.status({ name: 'a.nc', fresh: true, workflow: 'idle', activeState: 'Idle', fingerprint: FP }); p.emit('cnc-v2-change', {});
    assert.equal(p.frames.length, 0, 'no animation frame requested outside perf-v2');
    assert.equal(p.content.children.length, 0); assert(p.content.hidden); assert.equal(p.catalogues.length, 0);
    assert.equal(p.window.cncLibrarySelection.file, 'a.nc', 'the library itself behaves as before');
  }
  // ---- v2: the band, built in a frame. ----
  const p = libraryPage(); await p.flush();
  p.window.CNCProjects = { label: () => '', matches: () => false, isFavorite: () => false, revision: () => 0, declared: file => file === 'a.nc' ? { file, fingerprint: FP, version: 'current', material: 'MDF', tool: 'Fraise 6 mm', stock: null } : null };
  p.emit('cnc-v2-change', {}); await p.flush();
  assert(!p.content.hidden, 'band shown in the files mount');
  assert.deepEqual(p.catalogues.map(c => c[0]), ['performance-v2-files']);
  assert.equal(p.find('lv2-sel-name').textContent, 'Pièce A.nc');
  assert.equal(p.find('lv2-load-name').textContent, 'État machine indisponible', 'no report: the loaded program is unknown, not « nothing »');
  const cell = (row, col) => p.find('lv2-' + row + '-' + col).textContent;
  assert.equal(cell('dims', 'sel'), '228 × 148 × 23 mm');
  assert.equal(cell('tool', 'sel'), 'Fraise 6 mm · MDF');
  assert.equal(cell('print', 'sel'), 'valide');
  // A report: the loaded program is another file; DOM written only in the next frame.
  p.status({ name: 'b.nc', originalName: 'B.nc', revision: 4, fresh: true, workflow: 'idle', activeState: 'Idle', fingerprint: FP2 });
  assert.equal(p.find('lv2-load-name').textContent, 'État machine indisponible', 'no DOM write in the status handler');
  p.frame();
  assert.equal(p.find('lv2-load-name').textContent, 'B.nc'); assert.equal(p.find('lv2-load-state').textContent, '● Chargé');
  assert.equal(cell('version', 'load'), 'révision 4'); assert.equal(cell('dims', 'load'), '—'); assert.equal(cell('tool', 'load'), 'inconnus');
  assert.equal(cell('print', 'load'), 'connue');
  assert.equal(p.find('lv2-match').getAttribute('data-tone'), 'warn'); assert.match(p.find('lv2-match').textContent, /n’est pas le programme chargé/);
  // Same name and same fingerprint: the same program; its values are those of the selection.
  p.status({ name: 'a.nc', originalName: 'Pièce A.nc', revision: 5, fresh: true, workflow: 'running', activeState: 'Run', fingerprint: FP }); p.frame();
  assert.equal(p.find('lv2-match').getAttribute('data-tone'), 'ok'); assert.match(p.find('lv2-match').textContent, /même empreinte/);
  assert.equal(p.find('lv2-load-state').textContent, '▶ En cours'); assert.equal(cell('dims', 'load'), '228 × 148 × 23 mm');
  // Review (Codex): a sheet answered « current » for other bytes (file replaced, fingerprint B) while the
  // preview and the machine still describe A: its tool and material belong to no program shown here.
  const declared = p.window.CNCProjects.declared;
  p.window.CNCProjects.declared = file => file === 'a.nc' ? { file, fingerprint: FP2, version: 'current', material: 'ACIER version B', tool: 'Fraise B', stock: null } : null;
  p.emit('cnc-projects-updated', {}); p.frame();
  assert.equal(cell('tool', 'sel'), 'fiche d’une autre version', 'sheet of other bytes never shown for the selection');
  assert.equal(cell('tool', 'load'), 'fiche d’une autre version', 'nor for the loaded program');
  assert.doesNotMatch(p.content.querySelectorAll('*').map(e => e.textContent).join(' '), /ACIER|Fraise B/);
  p.window.CNCProjects.declared = file => file === 'a.nc' ? { file, fingerprint: null, version: 'current', material: 'MDF', tool: 'Fraise 6 mm', stock: null } : null;
  p.emit('cnc-projects-updated', {}); p.frame();
  assert.equal(cell('tool', 'sel'), 'inconnus', 'a sheet without fingerprint is not bound to the program shown');
  p.window.CNCProjects.declared = declared; p.emit('cnc-projects-updated', {}); p.frame();
  assert.equal(cell('tool', 'load'), 'Fraise 6 mm · MDF');
  // Same name, another fingerprint: a different program, never assumed to match.
  p.status({ name: 'a.nc', revision: 6, fresh: true, workflow: 'idle', activeState: 'Idle', fingerprint: FP2 }); p.frame();
  assert.equal(p.find('lv2-match').getAttribute('data-tone'), 'warn'); assert.equal(cell('dims', 'load'), '—');
  // Same name, fingerprint unknown: unknown, not « same ».
  p.status({ name: 'a.nc', revision: 6, fresh: true, workflow: 'idle', activeState: 'Idle' }); p.frame();
  assert.equal(p.find('lv2-match').getAttribute('data-tone'), 'neutral'); assert.match(p.find('lv2-match').textContent, /inconnue/); assert.equal(cell('print', 'load'), 'inconnue');
  // Nothing loaded.
  p.status({ name: '', fresh: true, workflow: 'idle', activeState: 'Idle' }); p.frame();
  assert.equal(p.find('lv2-load-name').textContent, 'Aucun programme chargé');
  // Another selection without fingerprint nor sheet: unknown fingerprint, no declared values.
  const rowB = p.node('library-list').children.find(c => c.getAttribute && c.getAttribute('data-file') === 'b.nc');
  const before = p.requests.length; rowB.handlers.click(); await p.flush();
  assert.equal(p.find('lv2-sel-name').textContent, 'B.nc'); assert.equal(cell('print', 'sel'), 'inconnue'); assert.equal(cell('tool', 'sel'), 'aucune fiche');
  assert.equal(cell('dims', 'sel'), '10 × 20 mm');
  // Selecting never loads: only the sidecar read, nothing towards the job service.
  assert.deepEqual(p.requests.slice(before).map(r => r.method + ' ' + r.url), ['POST /api/watch/file']);
  assert(!p.requests.some(r => /touch-job|touch-motion|command/.test(r.url)), 'no load, no start');
  assert.equal(p.window.cncLibrarySelection.file, 'b.nc');
  // Rows keep static thumbnails: images only, no canvas (no GL context per row).
  assert(!p.created.includes('canvas'), 'no canvas created for rows or the band');
  assert(p.node('library-list').children.filter(c => c.className === 'library-file').every(r => r._img && r._img.tagName === 'IMG'));
  // The layout goes back (known Idle after loss of eligibility): the band hides at the next frame.
  p.v2.layout = false; p.emit('cnc-v2-change', {}); p.frame(); assert(p.content.hidden);
  // Catalogue: no conflict with the static and v2 catalogues, three languages.
  const rows = p.window.cncLibraryView.v2Messages;
  for (const language of ['fr', 'en', 'es']) {
    const context = { window: {}, document: { documentElement: {}, title: '', body: null }, localStorage: { getItem: k => k === 'cncjs-touch-language-v1' ? language : null, setItem() {} } };
    context.window.localStorage = context.localStorage; context.window.document = context.document; vm.createContext(context);
    for (const f of fs.readdirSync(__dirname + '/touch').filter(f => /^i18n-messages(-[a-z]+)?\.js$/.test(f) && f !== 'i18n-messages-v2.js')) vm.runInContext(fs.readFileSync(__dirname + '/touch/' + f, 'utf8'), context);
    vm.runInContext(fs.readFileSync(__dirname + '/touch/i18n.js', 'utf8'), context);
    const i = context.window.cncI18n;
    assert.equal(i.registerCatalog('performance-v2', JSON.parse(fs.readFileSync(__dirname + '/touch/i18n-messages-v2.js', 'utf8'))), true);
    assert.equal(i.registerCatalog('performance-v2-files', rows), true, 'no conflicting row');
    assert.equal(i.t('Chargé dans la machine'), { fr: 'Chargé dans la machine', en: 'Loaded in the machine', es: 'Cargado en la máquina' }[language]);
  }
  // Every t('…') of the band is in its catalogue or an existing one.
  const source = fs.readFileSync(__dirname + '/touch/shared-library.js', 'utf8'), block = source.slice(source.indexOf('// ---- Performance v2 · Fichiers'));
  const keys = new Set(rows.map(r => r[0]));
  const statics = { window: {} }; ['i18n-messages.js', 'i18n-messages-profiles.js'].forEach(n => vm.runInNewContext(fs.readFileSync(__dirname + '/touch/' + n, 'utf8'), statics));
  statics.window.CNCTouchMessages.forEach(r => keys.add(r[0]));
  const literals = [...block.matchAll(/\b(?:t|tv2)\('((?:[^'\\]|\\.)*)'\)/g)].map(m => m[1]);
  assert(literals.length > 20, 'the band is translated through tv2()');
  for (const l of literals) assert(keys.has(l), 'missing translation: ' + l);
  // Style: every v2 rule is scoped under body.perf-v2 (nothing changes outside it).
  const css = fs.readFileSync(__dirname + '/touch/shared-library.css', 'utf8'), v2css = css.slice(css.indexOf('/* Performance v2'));
  const rules = v2css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.split('{')[0].trim()).filter(Boolean);
  assert(rules.length > 10);
  for (const r of rules) for (const sel of r.split(',')) assert(/^body(\.[a-z0-9-]+)*\.perf-v2\b/.test(sel.trim()), 'unscoped v2 rule: ' + sel);
  assert(!/perf-v2/.test(css.slice(0, css.indexOf('/* Performance v2'))), 'v1 rules untouched');
  // D3 (L7, round 2): the band pushed « Charger et ouvrir le Suivi » (1728 × 1152) and « Agrandir »
  // (simulation, 1366 × 911) below the frame. The band is one compact table (its header row is the
  // band), the selection state and size/date lines it repeats are hidden, and the detail's preview row
  // shrinks to 64 px (Agrandir) instead of the perf-wide 420 px.
  assert.equal(p.content.children.length, 1); const box = p.content.children[0];
  assert.deepEqual(box.children.map(c => c.tagName), ['TABLE', 'P'], 'one table and the match line');
  const table = box.children[0]; assert.deepEqual(table.children.map(c => c.tagName), ['THEAD', 'TBODY']);
  assert.equal(table.children[1].children.length, 4, 'four comparison rows');
  const rule = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); assert(m, 'rule ' + sel); return m[1]; };
  assert.match(rule('body.ks-ui.perf-wide.perf-v2 #screen-files .library-detail'), /grid-template-rows:auto auto minmax\(64px,1fr\) auto auto auto/);
  assert.match(rule('body.ks-ui.perf-v2 #screen-files #library-selection-state,body.ks-ui.perf-v2 #screen-files #library-meta'), /display:none/);
  // Budget (normal text; estimates from the tokens, measured by the browser harness).
  const tokens = fs.readFileSync(__dirname + '/touch/design-tokens.css', 'utf8'), tk = n => Number(tokens.match(new RegExp('--' + n + ':(\\d+)px'))[1]);
  const lh = (f, k = 1.3) => Math.ceil(f * k);
  const band = 2 * tk('sp-2') + 2 + (lh(tk('fs-16'), 1.2) + lh(tk('fs-18'), 1.2) + 4) + 4 * (lh(tk('fs-16')) + 2 * tk('sp-1')) + tk('sp-2') + 2 * lh(tk('fs-16')) + 2 * tk('sp-1');
  const detail = 2 * tk('sp-3') + 2 + lh(tk('fs-16'), 1) + lh(tk('fs-24'), 1.2) + 111 /* project sheet: head 48 + 3 lines */ + tk('tap') /* file tools */ +
    (lh(tk('fs-16')) + tk('tap-primary') + 2 * lh(tk('fs-18')) + lh(tk('fs-16')) + 3 * tk('sp-2')) /* execution: loaded, load, reason (2 lines), feedback */ + 5 * tk('sp-2');
  for (const height of [911, 1152]) {
    const column = height - tk('statusbar-h') - 32, preview = column - band - tk('sp-4') - detail;
    assert(preview >= 64, `${height}: the preview keeps 64 px (Agrandir) and the load button stays in the frame (${preview} px)`);
  }
  console.log('PASS v2 files: Sélection / Chargé dans la machine band, short comparison, fingerprint-based match (never by name), frames only, selecting never loads, static thumbnails; unchanged outside perf-v2.');
})().catch(e => { console.error(e); process.exitCode = 1; });
