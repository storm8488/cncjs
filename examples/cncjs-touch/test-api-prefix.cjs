'use strict';
// CNCjs installed under a route prefix (settings.route, e.g. /cnc/): every API URL the
// touch pages open derives from cncState.apiBase (cnc-state.js), never from a literal
// "/api/". Exercised on the real XMLHttpRequest calls of Fichiers (list, detail, thumbnail,
// upload, regeneration) and Suivi (preview), under /touch/ and /cnc/touch/.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const flush = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(setImmediate); };
const FP = 'sha256:' + '1'.repeat(64);

function page(pathname) {
  const { document, node } = require('./dom-fixture.cjs').createDOM(['files', 'home']);
  const opened = [], pending = [], handlers = {};
  const window = { location: { pathname, origin: 'http://tablet' }, addEventListener: (n, f) => handlers[n] = f, dispatchEvent() {},
    CNCLibraryPreview: { render: () => Promise.resolve({ image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1], segments: 1 }),
      renderResponse: () => Promise.resolve({ image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1], segments: 1 }) } };
  const ctx = { window, document, Blob, Date, CustomEvent: function (type, o) { this.type = type; this.detail = o && o.detail; }, setTimeout: () => 0,
    FileReader: function () { this.readAsText = () => { this.result = 'G0 X0'; Promise.resolve().then(() => this.onload()); }; },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 't' } } }) },
    XMLHttpRequest: function () {
      this.open = (method, url) => { this.method = method; this.url = url; opened.push(method + ' ' + url); };
      this.setRequestHeader = () => {}; this.getResponseHeader = k => ({ 'X-Program-Fingerprint': FP, 'X-Program-Size': '5' })[k] || null;
      this.send = body => { this.body = body; pending.push(this); }; this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
    } };
  // Same order as index.html: cnc-state.js before the pages.
  for (const name of ['cnc-state.js', 'shared-library.js', 'job-dashboard.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8'), ctx);
  function reply(value) {
    const xhr = pending.shift(); assert(xhr, 'a request is pending'); xhr.status = 200;
    if (xhr.responseType === 'blob') xhr.response = new Blob([JSON.stringify(value)]); else xhr.responseText = JSON.stringify(value);
    xhr.onload(); return xhr;
  }
  return { window, node, opened, pending, handlers, reply };
}

(async () => {
  for (const [pathname, base] of [['/touch/', '/api'], ['/touch/index.html', '/api'], ['/cnc/touch/', '/cnc/api'], ['/cnc/touch/simulation.html', '/cnc/api']]) {
    const p = page(pathname);
    assert.equal(p.window.cncState.get().apiBase, base, pathname);
    const sidecar = { data: JSON.stringify({ version: 1, file: 'a.nc', originalName: 'a.nc', fingerprint: FP, size: 5, preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1] } }), preview: { stale: false, reason: '', fingerprint: FP, size: 5 } };
    // Fichiers: status, list, detail.
    p.reply({ configured: true }); await flush();
    p.reply({ files: [{ type: 'f', name: 'a.nc', size: 5, mtime: '2026-10-20' }, { type: 'f', name: 'a.nc.cnctouch.json', size: 5, mtime: '2026-10-20' }] }); await flush();
    p.reply(sidecar); await flush(); p.node('library-image').onload();
    // Suivi: the selected file's preview.
    p.handlers['cnc-library-select']({ detail: { file: 'a.nc', name: 'a.nc' } });
    p.reply(sidecar); p.node('home-job-image').onload();
    // Upload (program then sidecar) and regeneration (sidecar, program as a Blob, list, sidecar).
    p.node('library-input').files = [{ name: 'part.nc', size: 5 }]; p.node('library-send').handlers.click(); await flush(6);
    const stored = decodeURIComponent(/[?&]file=([^&]*)/.exec(p.pending[0].url)[1]); p.reply({ file: stored, fingerprint: FP, size: 5 }); await flush();
    p.reply({ file: stored + '.cnctouch.json' }); await flush(6);
    while (p.pending.length) p.reply(p.pending[0].url.endsWith('/status') ? { configured: true } : { files: [] });
    p.handlers['cnc-screen-change']({ detail: 'files' }); await flush();
    while (p.pending.length) p.reply(p.pending[0].url.endsWith('/status') ? { configured: true } : { files: [{ type: 'f', name: 'a.nc', size: 5, mtime: '2026-10-20' }] });
    await flush();
    p.node('library-list').children.find(r => r.getAttribute && r.getAttribute('data-file') === 'a.nc').handlers.click(); await flush();
    if (p.pending.length) { p.reply(sidecar); await flush(); p.node('library-image').onload(); }
    p.node('library-regenerate').handlers.click(); p.reply(sidecar); await flush();
    const blobRead = p.reply({ file: 'a.nc', data: 'G0 X0' }); assert.equal(blobRead.responseType, 'blob'); await flush(6);
    p.reply({ files: [{ type: 'f', name: 'a.nc', size: 5, mtime: '2026-10-20' }] }); await flush();
    assert(p.pending.length && p.pending[0].method === 'PUT', 'the regenerated sidecar is written');
    const expected = [base + '/watch/status', base + '/watch/files', base + '/watch/file'];
    // A raw upload names its file in the query string.
    const opened = p.opened.map(line => line.split('?')[0]);
    const wrong = opened.filter(line => !expected.some(url => line.endsWith(' ' + url)));
    assert.deepEqual(wrong, [], pathname + ': every request under ' + base);
    for (const method of ['GET ' + base + '/watch/status', 'POST ' + base + '/watch/files', 'POST ' + base + '/watch/file', 'PUT ' + base + '/watch/file']) assert(opened.includes(method), pathname + ': ' + method + ' opened');
    assert(p.opened.length >= 12, pathname + ': list, detail, upload, regeneration and Suivi preview all went through (' + p.opened.length + ')');
  }
  // No page script carries an absolute "/api/" literal: all of them derive from cncState.apiBase.
  const literal = fs.readdirSync(path.join(__dirname, 'touch')).filter(n => n.endsWith('.js'))
    .filter(n => /['"`]\/api\//.test(fs.readFileSync(path.join(__dirname, 'touch', n), 'utf8')));
  assert.deepEqual(literal, [], 'scripts with a hard-coded /api/ URL');
  console.log('PASS api prefix: cncState.apiBase under /touch/ and /cnc/touch/, every Fichiers and Suivi request (list, detail, thumbnail, upload, regeneration, preview) follows it, no "/api/" literal.');
})().catch(e => { console.error(e); process.exitCode = 1; });
