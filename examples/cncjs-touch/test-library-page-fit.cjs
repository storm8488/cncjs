'use strict';
// Library pages hold only the rows that fit (audit 31, layout): the shell gives the upper bound
// (5 rows, 3 in compact) and shared-library.js lowers it, in the frame after a render, to the rows
// whose full height fits in the list (the selected row, taller, counted apart), so no row lies
// half under the pages. shared-library.js on the synthetic DOM with a fake layout.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
(async () => {
  const { document, node } = require('./dom-fixture.cjs').createDOM(['files']);
  const handlers = {}, frames = [];
  const listed = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((n, i) => ({ name: n + '.nc', type: 'f', size: 100 + i, mtime: '2026-10-0' + (i + 1) + 'T00:00:00Z' }));
  const window = {
    addEventListener: (n, f) => { handlers[n] = f; }, dispatchEvent() {},
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    getComputedStyle: () => ({ rowGap: '12px', paddingTop: '2px', paddingBottom: '2px' })
  };
  const ctx = { document, window, CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 'test' } } }) }, setInterval() {},
    XMLHttpRequest: function () { this.open = (m, url) => { this.url = url; }; this.setRequestHeader = () => {}; this.send = (body) => { this.status = 200; let result;
      if (this.url.endsWith('status')) result = { configured: true };
      else if (this.url.endsWith('files')) result = { files: listed.slice() };
      else { const file = JSON.parse(body).file.replace(/\.cnctouch\.json$/, ''); result = { file: file + '.cnctouch.json', data: JSON.stringify({ version: 1, file, originalName: file, preview: { image: 'data:image/png;base64,AA==', bounds: [0, 0, 1, 1] } }), preview: { stale: false } }; }
      this.responseText = JSON.stringify(result); Promise.resolve().then(() => this.onload()); }; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/shared-library.js', 'utf8'), ctx);
  const list = node('library-list');
  // Fake layout: 78 px rows, 85 px for the selected one (its state chip wraps the meta line).
  const layout = () => list.children.forEach((r) => { r.offsetHeight = r.getAttribute('aria-pressed') === 'true' ? 85 : 78; });
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(setImmediate); layout(); frames.splice(0).forEach((f) => f()); } };
  const rows = () => list.children.filter((c) => c.className === 'library-file').length;
  list.clientHeight = 282; // 1024 x 600: 85 + 12 + 78 + 12 + 78 = 265 <= 278
  handlers['cnc-library-page-size']({ detail: 3 }); await settle();
  assert.equal(rows(), 3, 'three rows fit in 278 px');
  assert.equal(node('library-page').textContent, 'Page 1 / 3');
  list.clientHeight = 266; // the list lost 16 px: the third row would lie under the pages
  handlers['cnc-library-page-size']({ detail: 3 }); await settle();
  assert.equal(rows(), 2, 'only the rows that fit: 85 + 12 + 78 + 12 + 78 > 262');
  assert.equal(node('library-page').textContent, 'Page 1 / 4');
  list.clientHeight = 2000; // a tall list never exceeds the shell's bound
  handlers['cnc-library-page-size']({ detail: 5 }); await settle();
  assert.equal(rows(), 5, 'the shell bound (5) is kept when more would fit');
  list.clientHeight = 40; // a list too short for two rows still lists two (it scrolls)
  handlers['cnc-library-page-size']({ detail: 3 }); await settle();
  assert.equal(rows(), 2, 'never fewer than two rows per page');
  console.log('PASS library page fit: the page holds only the rows that fit (selected row counted apart), within the shell bound, never fewer than two.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
