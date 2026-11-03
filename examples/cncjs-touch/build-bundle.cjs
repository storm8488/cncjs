#!/usr/bin/env node
'use strict';
// Builds a bundled copy of the touch pages: every deferred script of a page
// concatenated, in the page's order, into one file named by the hash of its
// content, the style sheets likewise, and the page rewritten to reference
// them. The separate files in touch/ stay the source of truth (tests, the
// fixture and development use them); the copy is what a deployment may serve
// instead. No dependency, deterministic (same sources, byte-identical output),
// and the output keeps every original file too: the workers
// (library-preview-worker.js, preview-3d-worker.js) load their scripts by
// name, and a deep link to a single file keeps working.
//
//   node examples/cncjs-touch/build-bundle.cjs [--out DIR]   (default output/touch-bundle)
//   node examples/cncjs-touch/build-bundle.cjs --check       (builds twice to a temporary directory, compares)
//
// Each script is an IIFE (startup.js, loaded without defer in <head>, is left
// as it is), so concatenation changes neither scope nor order. A script tag
// with an absolute URL (socket.io, served by CNCjs) is kept as a separate tag
// before the bundle: app.js uses `io` when it runs, and none of the scripts
// that preceded socket.io in the page depends on it.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SOURCE = path.join(__dirname, 'touch');
const PAGES = ['index.html', 'simulation.html'];
const ADVANCED = ['preview-gl.js'];

// A syntax error in one file would lose the whole bundle (every module, Pause / Arrêter too),
// where separate files lose only that one: every script must parse on its own, at the
// language level of the tablet's Chromium 106 (ES2017 is what the sources use; acorn when it
// is installed, otherwise Node's own parser), or nothing is written.
function compileCheck(file, text) {
  let acorn = null;
  try { acorn = require('acorn'); } catch (_) { /* Node's parser below */ }
  try {
    if (acorn) acorn.parse(text, { ecmaVersion: 2017, sourceType: 'script' });
    else new (require('vm').Script)(text, { filename: file });
  } catch (error) {
    // acorn gives `loc`; Node's SyntaxError only names `file:line` on the first line of its stack.
    const vmLine = !error.loc && /^[^\n]*:(\d+)\s*$/m.exec(String(error.stack || '').split('\n')[0]);
    const where = error.loc ? ' (line ' + error.loc.line + ', column ' + (error.loc.column + 1) + ')' : vmLine ? ' (line ' + vmLine[1] + ')' : '';
    throw new Error('bundle refused: ' + file + ' does not compile' + where + ': ' + error.message);
  }
}

const hash = (data) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
const isExternal = (ref) => /^(?:\/|[a-z]+:)/i.test(ref);

// The page's resource tags, in order: [{tag, kind, ref, file, attrs}]. Only
// deferred scripts with a relative src and relative style sheets are bundled.
function resources(html) {
  const out = [];
  const re = /<(script|link)\b([^>]*)>(?:\s*<\/script>)?/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2], tag = m[0];
    if (m[1].toLowerCase() === 'script') {
      const src = /\bsrc=["']([^"']+)["']/i.exec(attrs);
      if (!src) continue;
      out.push({ tag, kind: /\bdefer\b/i.test(attrs) ? 'script' : 'head-script', ref: src[1], file: src[1].split(/[?#]/)[0] });
    } else if (/rel=["']stylesheet["']/i.test(attrs)) {
      const href = /\bhref=["']([^"']+)["']/i.exec(attrs);
      if (href) out.push({ tag, kind: 'style', ref: href[1], file: href[1].split(/[?#]/)[0] });
    }
  }
  return out;
}

function buildPage(name, source, outDir, written) {
  let html = fs.readFileSync(path.join(source, name), 'utf8');
  const list = resources(html);
  const scripts = list.filter((r) => r.kind === 'script' && !isExternal(r.ref));
  const styles = list.filter((r) => r.kind === 'style' && !isExternal(r.ref));
  const base = name.replace(/\.html$/, '');
  const concat = (items, comment) => items.map((r) => {
    const text = fs.readFileSync(path.join(source, r.file), 'utf8').replace(/\r\n/g, '\n');
    const body = text + (text.endsWith('\n') ? '' : '\n');
    if (comment === cssComment) return comment(r.file) + '\n' + body;
    // Each file in its own try block: an exception while one module runs is reported
    // (window 'error', which startup.js turns into « Chargement incomplet ») and the
    // following modules still run, as with separate <script> tags; without it, one
    // failing module would leave Pause/Stop and every later module undefined. Safe
    // because every file is an expression statement (IIFE) without top-level
    // declarations or directives (checked by test-bundle.cjs).
    return comment(r.file) + '\ntry {\n' + body + ';\n} catch (error) { if (typeof reportError === \'function\') reportError(error); else setTimeout(function () { throw error; }, 0); }\n';
  }).join('\n');
  const jsComment = (f) => '/* ---- ' + f + ' ---- */';
  const cssComment = (f) => '/* ---- ' + f + ' ---- */';
  const js = concat(scripts, jsComment), css = concat(styles, cssComment);
  const jsName = 'touch-' + base + '.' + hash(js) + '.js', cssName = 'touch-' + base + '.' + hash(css) + '.css';
  fs.writeFileSync(path.join(outDir, jsName), js); fs.writeFileSync(path.join(outDir, cssName), css);
  written.push(jsName, cssName);
  // Style sheets: the first tag becomes the bundle, the others go.
  styles.forEach((r, i) => { html = html.replace(r.tag, i === 0 ? '<link rel="stylesheet" href="' + cssName + '">' : ''); });
  // Scripts: external tags stay where they are; the first bundled script's tag
  // is moved after the last external one so `io` exists when app.js runs.
  const externals = list.filter((r) => r.kind === 'script' && isExternal(r.ref));
  scripts.forEach((r) => { html = html.replace(r.tag, ''); });
  // The comment names the bundled files: a check that greps the page for a module
  // (touch-shell.js, the installed-package test) still finds it, and so does a reader.
  const bundleTag = '<!-- touch-bundle: ' + scripts.map((r) => r.file).join(' ') + ' -->' + '<script defer src="' + jsName + '"></script>';
  if (externals.length) html = html.replace(externals[externals.length - 1].tag, externals[externals.length - 1].tag + bundleTag);
  else html = html.replace('</body>', bundleTag + '</body>');
  fs.writeFileSync(path.join(outDir, name), html);
  return { page: name, scripts: scripts.map((r) => r.file), styles: styles.map((r) => r.file), externals: externals.map((r) => r.ref), js: jsName, css: cssName, jsBytes: Buffer.byteLength(js), cssBytes: Buffer.byteLength(css) };
}

function build(outDir, source) {
  source = source || SOURCE;
  // Every bundled script of every page is compiled first: nothing is written if one fails.
  PAGES.filter((p) => fs.existsSync(path.join(source, p))).forEach((p) => {
    resources(fs.readFileSync(path.join(source, p), 'utf8')).filter((r) => r.kind === 'script' && !isExternal(r.ref))
      .forEach((r) => compileCheck(r.file, fs.readFileSync(path.join(source, r.file), 'utf8')));
  });
  // Scripts that only cncProfile.loadAdvanced injects (Performance): copied as they are, checked like the others.
  ADVANCED.filter((f) => fs.existsSync(path.join(source, f))).forEach((f) => compileCheck(f, fs.readFileSync(path.join(source, f), 'utf8')));
  fs.mkdirSync(outDir, { recursive: true });
  // The whole directory first (workers, notices, VERSION.json, deep links), then the bundles over it.
  fs.readdirSync(source).forEach((f) => { if (fs.statSync(path.join(source, f)).isFile()) fs.copyFileSync(path.join(source, f), path.join(outDir, f)); });
  const written = [];
  const pages = PAGES.filter((p) => fs.existsSync(path.join(source, p))).map((p) => buildPage(p, source, outDir, written));
  const manifest = { version: 1, pages };
  fs.writeFileSync(path.join(outDir, 'touch-bundle.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}

function check() {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-a-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-bundle-b-'));
  try {
    const ma = build(a), mb = build(b);
    if (JSON.stringify(ma) !== JSON.stringify(mb)) throw new Error('two builds differ');
    ma.pages.forEach((p) => { ['js', 'css'].forEach((k) => { if (!fs.readFileSync(path.join(a, p[k])).equals(fs.readFileSync(path.join(b, p[k])))) throw new Error(p[k] + ' differs between two builds'); }); });
    return ma;
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
  if (args.includes('--check')) {
    const m = check();
    m.pages.forEach((p) => console.log(p.page + ': ' + p.scripts.length + ' scripts -> ' + p.js + ' (' + Math.round(p.jsBytes / 1024) + ' kB), ' + p.styles.length + ' style sheets -> ' + p.css + ' (' + Math.round(p.cssBytes / 1024) + ' kB), deterministic'));
  } else {
    const out = path.resolve(option('--out', path.join(__dirname, '..', '..', 'output', 'touch-bundle')));
    const m = build(out);
    m.pages.forEach((p) => console.log(p.page + ': ' + p.scripts.length + ' scripts -> ' + p.js + ' (' + Math.round(p.jsBytes / 1024) + ' kB), ' + p.styles.length + ' style sheets -> ' + p.css + ' (' + Math.round(p.cssBytes / 1024) + ' kB)'));
    console.log('written to ' + out);
  }
}
module.exports = { build, check, resources, compileCheck, SOURCE };
