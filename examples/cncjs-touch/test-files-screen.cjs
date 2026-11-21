'use strict';
// Écrans, lot Fichiers: what the screen leaves behind once hidden, and the display fixes it received.
//   timers  the idle thumbnail callback, its 500 ms retry and the looks 2/5/9 s after an upload are all
//           cancelled when Fichiers is left (they used to keep waking the page); the upload looks
//           resume on return, a deadline passed while hidden gives one manual refresh (as before);
//   CSS     « Charger et ouvrir le Suivi » sticks only while active (a disabled one hid the alarm help),
//           the row name is a block (its ellipsis works before the badge), the v2 band labels wrap, the status under the preview
//           takes the card colours, the v2 badge wraps;
//   i18n    the search placeholder is short, the preparation progress lines go through cncI18n.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = __dirname + '/touch/';
(async () => {
  // ---- Timers (shared-library.js) ----
  let now = 1000000, nextId = 1;
  class FakeDate extends Date { static now() { return now; } }
  const timers = new Map(), idles = new Map(), cleared = [], cancelledIdle = [];
  const { document, node, activeScreens } = require('./dom-fixture.cjs').createDOM(['files']), handlers = {}, renders = [];
  const window = { addEventListener: (n, f) => handlers[n] = f, dispatchEvent() {},
    CNCLibraryPreview: { render: (text, canvas, cancelled) => new Promise(resolve => renders.push(() => resolve({ image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1] }))) } };
  // listed: what CNCjs's watch list answers (a written program appears in it); held: thumbnail reads left in flight.
  const requests = [], bodies = [], held = [], listed = [{ type: 'f', name: 'a.nc', size: 10, mtime: '2026-10-01' }, { type: 'f', name: 'a.nc.cnctouch.json', size: 5, mtime: '2026-10-01' }];
  let holdThumbs = false;
  // A detail read answers a valid sidecar without image (its version is then kept: a quiet refresh does not read it again).
  const detail = body => { const m = typeof body === 'string' && !body.includes('thumbnail') && /"file":"([^"]+).cnctouch.json"/.exec(body);
    return m ? { data: JSON.stringify({ version: 1, file: m[1], originalName: 'neuf.nc' }), preview: { stale: false } } : {}; };
  const ctx = { document, window, Blob, Date: FakeDate, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => { cleared.push(id); timers.delete(id); },
    requestIdleCallback: fn => { const id = nextId++; idles.set(id, fn); return id; },
    cancelIdleCallback: id => { cancelledIdle.push(id); idles.delete(id); },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'fake' } } }) },
    FileReader: function () { this.readAsText = () => { this.result = 'G0 X0\nG1 X1'; Promise.resolve().then(() => this.onload()); }; },
    XMLHttpRequest: function () { this.open = (m, u) => { this.method = m; this.url = u; }; this.setRequestHeader = () => {};
      this.abort = () => { this.aborted = true; Promise.resolve().then(() => this.onabort()); };
      this.send = body => { requests.push(this.method + ' ' + this.url); bodies.push(this.method + ' ' + this.url + ' ' + (typeof body === 'string' ? body : ''));
        const put = /file\?file=([^&]+)$/.exec(this.url), name = put && decodeURIComponent(put[1]);
        if (this.method === 'PUT' && name && !name.endsWith('.cnctouch.json')) listed.push({ type: 'f', name, size: 12, mtime: '2026-10-02' });
        this.status = 200; this.responseText = JSON.stringify(this.url.endsWith('/status') ? { configured: true } : this.url.endsWith('/files') ? { files: listed } : detail(body));
        if (holdThumbs && typeof body === 'string' && body.includes('thumbnail')) { held.push(this); return; }
        Promise.resolve().then(() => { if (!this.aborted) this.onload(); }); }; }
  };
  vm.runInNewContext(fs.readFileSync(dir + 'shared-library.js', 'utf8'), ctx);
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
  const go = name => { activeScreens.clear(); activeScreens.add(name); handlers['cnc-screen-change']({ detail: name }); };
  await flush();
  // Shown: one idle callback waits for thumbnails.
  assert.equal(idles.size, 1, 'thumbnails wait for an idle period while Fichiers is shown');
  const idle = [...idles.keys()][0];
  go('home');
  assert(cancelledIdle.includes(idle) && idles.size === 0, 'leaving Fichiers cancels the idle callback');
  // A short idle period arms the 500 ms retry: leaving cancels it too (it was kept, the id then overwritten).
  go('files'); await flush();
  const short = [...idles.entries()][0]; idles.delete(short[0]); short[1]({ timeRemaining: () => 10 });
  const retry = [...timers.entries()].find(([, t]) => t.at === now + 500);
  assert(retry, 'a short idle period retries 500 ms later');
  go('home');
  assert(cleared.includes(retry[0]) && !timers.has(retry[0]), 'leaving Fichiers cancels the 500 ms retry');
  assert.equal(idles.size, 0);
  // An upload: three looks (2, 5, 9 s) while Fichiers is shown.
  go('files'); await flush(); idles.clear();
  node('library-input').files = [{ name: 'neuf.nc', size: 12 }]; node('library-send').handlers.click(); await flush();
  renders.shift()(); await flush();
  const looks = () => [...timers.entries()].filter(([, t]) => [2000, 5000, 9000].includes(t.at - uploadAt));
  const uploadAt = now;
  assert.equal(looks().length, 3, 'three looks after the upload');
  // The first look runs (Fichiers shown), then Fichiers is left: the two others are cancelled, nothing wakes.
  now += 2000; const first = looks().find(([, t]) => t.at === uploadAt + 2000); timers.delete(first[0]); first[1].fn(); await flush();
  const left = looks().map(([id]) => id); assert.equal(left.length, 2);
  go('home');
  assert(left.every(id => cleared.includes(id) && !timers.has(id)), 'leaving Fichiers cancels the pending looks');
  // Back 4 s later: the 5 s look is past (one manual refresh: the detail is read again), the 9 s one is armed again.
  now += 4000; const before = requests.length, beforeBodies = bodies.length;
  go('files'); await flush();
  const rearmed = [...timers.values()].filter(t => t.at === uploadAt + 9000);
  assert.equal(rearmed.length, 1, 'the 9 s look is armed again on return');
  assert.equal([...timers.values()].filter(t => t.at === uploadAt + 5000).length, 0, 'a passed look is not armed again');
  assert(requests.slice(before).includes('POST /api/watch/files'), 'the list is read again on return (the passed look)');
  // The passed look is a manual refresh: the uploaded file, now listed, has its detail read again (a quiet refresh would not).
  assert(bodies.slice(beforeBodies).some(b => /^POST \S+\/watch\/file \{"file":"[^"]*neuf[^"]*\.cnctouch\.json"\}$/.test(b)), 'the passed look reads the uploaded file\'s detail again on return');
  // A thumbnail read in flight when Fichiers is left: its rejection must not arm a new idle callback.
  go('home'); go('files'); await flush(); holdThumbs = true;
  const pending = [...idles.entries()]; assert.equal(pending.length, 1, 'one idle callback on return');
  idles.delete(pending[0][0]); pending[0][1]({ timeRemaining: () => 50 }); await flush();
  assert.equal(held.length, 1, 'a thumbnail read is in flight');
  go('home'); await flush();
  assert(held[0].aborted, 'leaving Fichiers aborts the thumbnail read');
  assert.equal(idles.size, 0, 'an aborted thumbnail read arms no idle callback once Fichiers is hidden');
  assert(![...timers.values()].some(t => t.at === now + 500), 'nor a 500 ms retry');
  holdThumbs = false;

  // ---- CSS ----
  const responsive = fs.readFileSync(dir + 'responsive.css', 'utf8'), ui = fs.readFileSync(dir + 'ui-2027.css', 'utf8'), lib = fs.readFileSync(dir + 'shared-library.css', 'utf8');
  assert(!/\.library-execution>\.job-buttons\{[^}]*position:sticky/.test(responsive), 'the container no longer sticks (a disabled button covered the alarm help)');
  assert(/body\.ks-ui #screen-files \.library-execution>\.job-buttons\{display:contents\}/.test(responsive), 'the container lets the button stick in .library-execution');
  assert(/body\.ks-ui #screen-files \.library-execution #job-load:not\(:disabled\)\{position:sticky;bottom:0;z-index:2\}/.test(responsive), 'only an active load button sticks');
  assert(!/:has\(/.test(responsive.replace(/\/\*[\s\S]*?\*\//g, '')), 'no :has() (Chromium 106 contract)');
  assert(/\.ks-ui #screen-files \.library-file strong\{display:block;max-width:100%;[^}]*text-overflow:ellipsis/.test(ui), 'the row name is a block: its ellipsis applies before the badge');
  // v2 band: the row labels wrap (« Herramienta · material declarados » was cut), the values keep their ellipsis.
  assert(/body\.perf-v2 #screen-files \.lv2-compare tbody th\{[^}]*white-space:normal;overflow-wrap:break-word\}/.test(lib), 'the v2 band row labels wrap');
  assert(/\.pv3d-status\.pv3d-status--below\{[^}]*background:var\(--surface-2\);color:var\(--fg\)\}/.test(responsive), 'the status under the preview takes the card colours');
  // v2: a disabled load button flowed under the detail's fold (ES, large text, alarm help): it heads the execution block.
  assert(/body\.ks-ui\.perf-v2 #screen-files \.library-execution #job-load\{order:-1\}/.test(lib), 'v2: the load button heads the execution block');
  assert(/body\.ks-ui\.perf-v2 #screen-files \.library-file \.library-file-state\{white-space:normal;line-height:1\.3;max-width:100%\}/.test(lib), 'the v2 badge wraps inside the card');
  // ---- i18n ----
  const messages = { window: {} };
  for (const f of ['i18n-messages.js', 'i18n-messages-viz.js']) vm.runInNewContext(fs.readFileSync(dir + f, 'utf8'), messages);
  const row = k => messages.window.CNCTouchMessages.find(r => r[0].trim() === k.trim());
  const source = fs.readFileSync(dir + 'shared-library.js', 'utf8');
  assert(source.includes('placeholder="Rechercher…"'), 'short search placeholder');
  assert.deepEqual(row('Rechercher…'), ['Rechercher…', 'Search…', 'Buscar…']);
  assert(!row('Nom, matière, outil, notes…'), 'the long placeholder row is gone with its only use');
  const preview = fs.readFileSync(dir + 'library-preview.js', 'utf8');
  const lines = [...preview.matchAll(/report\(tr\((?:fallback \? )?'([^']+)'(?: : '([^']+)')?\)/g)].flatMap(m => [m[1], m[2]].filter(Boolean));
  for (const k of ['Encodage de l’image PNG…', 'Préparation du parcours hors interface…', 'Analyse du parcours : ', 'Analyse locale du parcours : ', 'Dessin du parcours : ', 'Dessin local du parcours : ']) {
    assert(lines.includes(k), 'progress line through cncI18n: ' + k);
    const r = row(k); assert(r && r[1] && r[2] && r[2] !== r[0], 'FR/EN/ES row: ' + k);
  }
  assert(!/report\('(?:Encodage de l’image|Préparation du parcours|Analyse du parcours)/.test(preview), 'no untranslated progress literal left');
  // tr() reads the page's cncI18n: a real local render (no Worker, synchronous PNG) reports only translated lines.
  const browser = { cncI18n: { t: s => '[' + s + ']' } }, page = { window: browser, document: { currentScript: { src: 'https://offline.invalid/touch/library-preview.js' } },
    Promise, Date, Uint16Array, Float64Array, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(page); vm.runInContext(preview, page);
  const draw = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }, progress = [];
  await browser.CNCLibraryPreview.render('G0 X2\nG1 X4 Y2\nG1 X0', { getContext: () => draw, toDataURL: () => 'data:image/png;base64,AAAA' }, () => false, m => progress.push(m));
  assert(progress.includes('[Worker indisponible][ — analyse locale découpée, réactivité non garantie.]'), 'the fallback reason and its sentence go through cncI18n');
  assert(progress.includes('[Encodage PNG local synchrone — réactivité non garantie…]'), 'the synchronous PNG line goes through cncI18n');
  assert(progress.some(m => /^\[Analyse locale du parcours : \]\d+ %$/.test(m)) && progress.some(m => /^\[Dessin local du parcours : \]\d+ %$/.test(m)), 'the local progress lines go through cncI18n');
  assert(progress.every(m => m.startsWith('[')), 'no progress line left untranslated: ' + progress.filter(m => !m.startsWith('[')).join(' | '));
  for (const k of ['Encodage PNG local synchrone — réactivité non garantie…', ' — lecture locale limitée à 256 Kio, réactivité non garantie.', ' — analyse locale découpée, réactivité non garantie.',
    'Worker indisponible', 'Worker inaccessible', 'Worker sans réponse', 'Version du Worker incompatible', 'Lecture du serveur indisponible dans le Worker']) {
    assert(preview.includes("tr('" + k + "')") || preview.includes("local('" + k + "')"), 'used: ' + k);
    const r = row(k); assert(r && r[1] && r[2] && r[2] !== r[0], 'FR/EN/ES row: ' + k);
  }
  for (const k of ['Arrêter reste disponible ; les autres commandes attendent un état récent.', 'Pause reste disponible ; les autres commandes attendent un état récent.', 'Fichier chargé : ouvrez le Suivi pour démarrer.']) {
    const r = row(k); assert(r && r[1] && r[2], 'FR/EN/ES row: ' + k);
  }
  assert.equal(row('Fichier chargé : ouvrez le Suivi pour démarrer.')[2], 'Archivo cargado: abra el Seguimiento para iniciar.');
  console.log('PASS files screen: idle thumbnail callback, its retry and the upload looks cancelled once Fichiers is hidden (resumed on return), load button sticky only when active, row name ellipsis, v2 band labels wrap, status and v2 badge styles, short placeholder, translated progress lines.');
})().catch(e => { console.error(e); process.exitCode = 1; });
