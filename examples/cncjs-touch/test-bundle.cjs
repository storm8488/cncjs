'use strict';
// build-bundle.cjs: every deferred script and style sheet of each page, in the
// page's order, lands in one file named by its content; external scripts
// (socket.io) stay before the bundle; the output is deterministic, keeps the
// original files (workers load them by name) and still satisfies startup.js's
// expectations (one blocking startup.js, deferred bundle, startup-ready last).
const assert = require('assert').strict, fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { build, resources, SOURCE } = require('./build-bundle.cjs');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-test-'));
try {
  const manifest = build(out);
  assert.equal(manifest.pages.length, 2);
  for (const page of manifest.pages) {
    const sourceHtml = fs.readFileSync(path.join(SOURCE, page.page), 'utf8'), html = fs.readFileSync(path.join(out, page.page), 'utf8');
    const expected = resources(sourceHtml);
    const deferred = expected.filter((r) => r.kind === 'script' && !/^(?:\/|[a-z]+:)/i.test(r.ref)).map((r) => r.file);
    assert.deepEqual(page.scripts, deferred, page.page + ': every deferred script, in order');
    assert.deepEqual(page.styles, expected.filter((r) => r.kind === 'style').map((r) => r.file), page.page + ': every style sheet, in order');
    assert.equal(page.scripts[page.scripts.length - 1], 'startup-ready.js');
    // The bundle holds each file once, in order, separated so a missing final newline or semicolon cannot join two files.
    const js = fs.readFileSync(path.join(out, page.js), 'utf8');
    let at = -1;
    page.scripts.forEach((file) => { const i = js.indexOf('/* ---- ' + file + ' ---- */'); assert(i > at, page.page + ': ' + file + ' present and in order'); at = i; const source = fs.readFileSync(path.join(SOURCE, file), 'utf8').replace(/\r\n/g, '\n'); assert(js.includes(source), file + ' copied verbatim'); });
    assert.doesNotThrow(() => new vm.Script(js), page.js + ' parses');
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(out, page.css), 'utf8').length ? ';' : ''), 'css present');
    // The page: blocking startup.js first, external script(s) before the bundle, no other deferred tag, bundle name carries the content hash.
    const tags = Array.from(html.matchAll(/<script\b([^>]*)>/g)).map((m) => m[1]);
    assert(tags[0].includes('startup.js') && !/\bdefer\b/.test(tags[0]), 'startup.js stays blocking in <head>');
    const deferTags = tags.slice(1);
    deferTags.forEach((t) => assert(/\bdefer\b/.test(t), 'every other script is deferred'));
    const srcs = deferTags.map((t) => /src="([^"]+)"/.exec(t)[1]);
    assert.deepEqual(srcs, page.externals.concat([page.js]), page.page + ': externals then the bundle');
    assert.match(page.js, /^touch-[a-z]+\.[0-9a-f]{12}\.js$/);
    assert.equal((html.match(/<link rel="stylesheet"/g) || []).length, 1);
    assert(html.includes('href="' + page.css + '"'));
    assert(html.includes('<!-- touch-bundle: ' + page.scripts.join(' ') + ' -->'), 'the page names the bundled files');
    // The static markup is otherwise untouched, and the original files are beside the bundle.
    assert(html.includes('id="cnc-boot"') && html.indexOf('id="cnc-boot"') < html.indexOf('<main>'));
    page.scripts.concat(page.styles, ['library-preview-worker.js', 'preview-3d-worker.js']).forEach((f) => assert(fs.existsSync(path.join(out, f)), f + ' kept beside the bundle'));
  }
  assert.notEqual(manifest.pages[0].js, manifest.pages[1].js, 'the two pages have their own bundles');
  // A changed source gives a new name (an old cache cannot serve it) and the same sources give the same bytes.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-src-'));
  fs.readdirSync(SOURCE).forEach((f) => { if (fs.statSync(path.join(SOURCE, f)).isFile()) fs.copyFileSync(path.join(SOURCE, f), path.join(copy, f)); });
  const again = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-again-'));
  try {
    const same = build(again, copy);
    assert.deepEqual(same.pages.map((p) => [p.js, p.css]), manifest.pages.map((p) => [p.js, p.css]), 'same sources, same names');
    assert(fs.readFileSync(path.join(again, manifest.pages[0].js)).equals(fs.readFileSync(path.join(out, manifest.pages[0].js))), 'same bytes');
    fs.appendFileSync(path.join(copy, 'touch-shell.js'), '\n// changed\n');
    const changed = build(again, copy);
    assert.notEqual(changed.pages[0].js, manifest.pages[0].js, 'a changed script renames the bundle');
    assert.equal(changed.pages[0].css, manifest.pages[0].css, 'an unchanged sheet keeps its name');
  } finally { fs.rmSync(copy, { recursive: true, force: true }); fs.rmSync(again, { recursive: true, force: true }); }
  // Every bundled file is an expression statement: no top-level let/const/class/function
  // or directive, which the try block of the bundle would scope differently.
  let acorn = null; try { acorn = require('acorn'); } catch (_) { /* fall back to a textual check */ }
  manifest.pages.forEach((page) => page.scripts.forEach((file) => {
    const source = fs.readFileSync(path.join(SOURCE, file), 'utf8');
    if (acorn) {
      acorn.parse(source, { ecmaVersion: 2017 }).body.forEach((node) => {
        assert(node.type === 'ExpressionStatement' || node.type === 'IfStatement' || node.type === 'EmptyStatement', file + ': top-level ' + node.type + ' cannot be bundled in a try block');
        assert(!node.directive, file + ': top-level directive');
      });
    } else {
      assert.doesNotMatch(source, /^(?:let|const|class|function)\b/m, file + ': top-level declaration');
      assert.doesNotMatch(source.replace(/^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*/, ''), /^\s*['"]use strict['"]/, file + ': top-level directive');
    }
  }));
  // A module that throws while it runs is reported and the following modules still run,
  // as with separate script tags (startup.js then shows « Chargement incomplet »).
  const tiny = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-isolation-'));
  const tinyOut = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-isolation-out-'));
  try {
    fs.writeFileSync(path.join(tiny, 'index.html'), '<html><head><script src="startup.js"></script></head><body><main></main><script defer src="a.js?v=1"></script><script defer src="b.js?v=1"></script><script defer src="c.js?v=1"></script></body></html>');
    fs.writeFileSync(path.join(tiny, 'startup.js'), '');
    fs.writeFileSync(path.join(tiny, 'a.js'), '(function () { window.order.push("a"); })();');
    fs.writeFileSync(path.join(tiny, 'b.js'), '(function () { window.order.push("b"); throw new Error("boom"); })()'); // no final newline or semicolon
    fs.writeFileSync(path.join(tiny, 'c.js'), '// last line is a comment\n(function () { window.order.push("c"); })();\n// end');
    const tm = build(tinyOut, tiny);
    const reported = [], sandbox = { window: { order: [] }, reportError: (e) => reported.push(e.message) };
    vm.runInNewContext(fs.readFileSync(path.join(tinyOut, tm.pages[0].js), 'utf8'), sandbox);
    assert.deepEqual(sandbox.window.order, ['a', 'b', 'c'], 'the modules after a failing one still run');
    assert.deepEqual(reported, ['boom'], 'the failure is reported to the page (window error event)');
  } finally { fs.rmSync(tiny, { recursive: true, force: true }); fs.rmSync(tinyOut, { recursive: true, force: true }); }
} finally { fs.rmSync(out, { recursive: true, force: true }); }
console.log('PASS bundle: every deferred script and sheet concatenated in page order, verbatim and parseable, each module isolated (a failing one is reported, the next ones run); externals before the bundle; startup.js blocking, startup-ready last; content-hashed names, deterministic, renamed on change; original files kept for the workers.');
