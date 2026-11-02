'use strict';
// Audit 31 (fixes 1-3): Pause and Arrêter of the status strip stay usable over every overlay
// (strip-guard.js, the U5 rule of the confirmation generalised) and over the degraded start-up
// screen. Offline: the guard on a small DOM tree, every overlay module wired to it, the pages'
// script order and the start-up styles. The real browser check is browser-strip.cjs
// (browser-run.cjs --strict, step « strip »).
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'touch'), read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

// A minimal DOM: nodes with children, closest() on #ids, contains(), inert, classList.
function node(id, tag, children) {
  const n = { id: id || '', tagName: tag || 'DIV', children: [], parentNode: null, inert: false, hidden: false, disabled: false, classes: new Set(),
    classList: { toggle(c, on) { if (on) n.classes.add(c); else n.classes.delete(c); }, contains: (c) => n.classes.has(c) },
    getClientRects() { return n.hidden ? [] : [{}]; }, focus() { doc.activeElement = n; },
    contains(t) { for (let x = t; x; x = x.parentNode) if (x === n) return true; return false; },
    closest(sel) { const ids = sel.split(',').map((s) => s.trim().replace(/^#/, '')); for (let x = n; x; x = x.parentNode) if (ids.includes(x.id)) return x; return null; },
    querySelectorAll() { const out = []; (function walk(c) { c.forEach((k) => { if (/^(BUTTON|INPUT|SELECT)$/.test(k.tagName)) out.push(k); walk(k.children); }); })(n.children); return out; } };
  (children || []).forEach((c) => { c.parentNode = n; n.children.push(c); });
  return n;
}
let doc;
function page() {
  const pause = node('t-pause', 'BUTTON'), stop = node('t-stop', 'BUTTON'), pilot = node('t-pilot', 'BUTTON'), lock = node('t-lock', 'BUTTON');
  const actions = node('', 'DIV', [pilot, pause, stop]), right = node('', 'DIV', [lock]);
  const banner = node('real-banner', 'HEADER', [node('t-state'), actions, right]);
  const main = node('main', 'MAIN', [node('job-pause', 'BUTTON'), node('job-stop', 'BUTTON')]), nav = node('tabbar', 'NAV');
  const close = node('sheet-close', 'BUTTON'), field = node('sheet-field', 'INPUT');
  const sheet = node('sheet', 'DIV', [node('', 'DIV', [close, field])]);
  const script = node('', 'SCRIPT');
  const body = node('body', 'BODY', [banner, main, nav, sheet, script]);
  const all = {}; (function index(n) { if (n.id) all[n.id] = n; n.children.forEach(index); })(body);
  doc = { body, activeElement: null, getElementById: (id) => all[id] || null };
  const ctx = { window: {}, document: doc }; ctx.window.document = doc;
  vm.createContext(ctx); vm.runInContext(read('strip-guard.js'), ctx);
  return { guard: ctx.window.CNCStripGuard, all, banner, actions, right, main, nav, sheet, pause, stop, pilot, lock, close, field, script };
}

// isolate(): everything inert but the overlay and the strip's Pause / Arrêter.
{
  const p = page();
  p.main.inert = false; p.nav.inert = true; // a value set before is restored as it was
  const restore = p.guard.isolate(p.sheet);
  assert.equal(p.sheet.inert, false); assert.equal(p.sheet.classList.contains('t-below-strip'), true, 'the overlay starts below the strip');
  assert.equal(p.main.inert, true); assert.equal(p.nav.inert, true); assert.equal(p.script.inert, false, 'scripts untouched');
  assert.equal(p.banner.inert, false, 'the strip itself is not inert'); assert.equal(p.actions.inert, false);
  assert.equal(p.pause.inert, false); assert.equal(p.stop.inert, false);
  assert.equal(p.pause.closest('[inert]'), null);
  assert.equal(p.pilot.inert, true, 'other strip commands are inert'); assert.equal(p.right.inert, true); assert.equal(p.banner.children[0].inert, true);
  restore();
  assert.equal(p.main.inert, false); assert.equal(p.nav.inert, true, 'previous value restored'); assert.equal(p.pilot.inert, false); assert.equal(p.right.inert, false);
  restore(); assert.equal(p.nav.inert, true, 'a second restore changes nothing');
}
// Nested overlays (a pad over a sheet), closed in order: every value back.
{
  const p = page();
  const pad = node('pad', 'DIV', [node('pad-ok', 'BUTTON')]); pad.parentNode = p.all.body; p.all.body.children.push(pad);
  const r1 = p.guard.isolate(p.sheet), r2 = p.guard.isolate(pad);
  assert.equal(p.sheet.inert, true, 'the sheet under the pad is inert'); assert.equal(pad.inert, false); assert.equal(p.stop.inert, false);
  r2(); assert.equal(p.sheet.inert, false); assert.equal(p.main.inert, true);
  r1(); assert.equal(p.main.inert, false); assert.equal(pad.inert, false);
}
// V1: closed out of order (the sheet first, the pad still open): nothing is given back until the
// pad closes, then everything is (a stack); covered() tells a layer under another one.
{
  const p = page();
  const pad = node('pad', 'DIV', [node('pad-ok', 'BUTTON')]); pad.parentNode = p.all.body; p.all.body.children.push(pad);
  const r1 = p.guard.isolate(p.sheet), r2 = p.guard.isolate(pad);
  assert.equal(p.guard.covered(p.sheet), true, 'the sheet is covered by the pad'); assert.equal(p.guard.covered(pad), false);
  r1();
  assert.equal(p.main.inert, true, 'the pad still open: the page stays inert');
  r2();
  assert.equal(p.main.inert, false, 'both closed: the page is live'); assert.equal(p.nav.inert, false); assert.equal(p.sheet.inert, false);
  assert.equal(p.pilot.inert, false); assert.equal(p.right.inert, false); assert.equal(pad.inert, false);
}
// X1: the screen saver is a layer of the stack (cover: no « below the strip » class); a lock taken
// while it sleeps sits above it: waking first gives nothing back, unlocking gives back all.
{
  const p = page();
  const saver = node('saver', 'BUTTON'); saver.parentNode = p.all.body; p.all.body.children.push(saver);
  const shield = node('shield', 'DIV'); shield.parentNode = p.all.body; p.all.body.children.push(shield);
  const rSaver = p.guard.isolate(saver, [], { cover: true });
  assert.equal(p.right.inert, true, 'the padlock (its group) is inert under the sleeping saver');
  assert.equal(saver.classList.contains('t-below-strip'), false, 'the saver covers the whole window');
  const rLock = p.guard.isolate(shield, [p.lock, saver]);
  assert.equal(p.lock.inert, false, 'the lock taken meanwhile makes its padlock usable again'); assert.equal(p.right.inert, false);
  assert.equal(saver.inert, false, 'the sleeping saver stays usable to wake the screen');
  rSaver();
  assert.equal(p.main.inert, true, 'woken while locked: the content stays out of reach');
  assert.equal(p.lock.inert, false); assert.equal(p.stop.inert, false);
  rLock();
  assert.equal(p.main.inert, false, 'unlocked: the page is live'); assert.equal(p.nav.inert, false); assert.equal(p.pilot.inert, false);
}
// Extra kept nodes (the padlock under the screen lock).
{
  const p = page();
  const restore = p.guard.isolate(p.sheet, [p.lock]);
  assert.equal(p.lock.inert, false); assert.equal(p.right.inert, false, 'the parent of the padlock stays live');
  assert.equal(p.pilot.inert, true); assert.equal(p.main.inert, true);
  restore(); assert.equal(p.pilot.inert, false);
}
// No strip commands built (status-strip.js failed): the overlay covers the page, nothing kept.
{
  const p = page();
  p.actions.children = []; p.pause.parentNode = null; p.stop.parentNode = null;
  p.guard.isolate(p.sheet);
  assert.equal(p.sheet.classList.contains('t-below-strip'), false); assert.equal(p.banner.inert, true);
}
// tab(): Pause / Arrêter first in the cycle, both ways, hidden or disabled ones skipped.
{
  const p = page();
  const keys = (shift) => { let prevented = false; const e = { key: 'Tab', shiftKey: !!shift, preventDefault() { prevented = true; } }; p.guard.tab(e, p.sheet); return prevented; };
  p.close.focus();
  const order = []; for (let i = 0; i < 4; i++) { assert(keys()); order.push(doc.activeElement.id); }
  assert.deepEqual(order, ['sheet-field', 't-pause', 't-stop', 'sheet-close']);
  keys(true); assert.equal(doc.activeElement.id, 't-stop', 'Shift+Tab goes back to Arrêter');
  p.pause.hidden = true; p.close.focus(); keys(); keys(); assert.equal(doc.activeElement.id, 't-stop', 'a hidden Pause is skipped');
  p.stop.disabled = true; p.field.focus(); keys(); assert.equal(doc.activeElement.id, 'sheet-close', 'a disabled Arrêter is skipped');
  assert.equal(p.guard.tab({ key: 'Enter' }, p.sheet), false);
}

// Every overlay module uses the guard (no own whole-page inertia when it is loaded).
const wired = {
  'touch-shell.js': /CNCStripGuard\.isolate\(overlay\)[\s\S]*CNCStripGuard\.tab\(e,openedSheet/,
  'numeric-pad.js': /CNCStripGuard\.isolate\(overlay\)[\s\S]*CNCStripGuard\.tab\(e, modal/,
  'coordinate-editor.js': /CNCStripGuard\.isolate\(modal\)[\s\S]*CNCStripGuard\.tab\(e,modal/,
  'preview-viewer.js': /CNCStripGuard\.isolate\(overlay\)[\s\S]*CNCStripGuard\.tab\(e,overlay/,
  'projects.js': /CNCStripGuard\.isolate\(\$\('project-dialog'\)\)[\s\S]*CNCStripGuard\.tab\(e, \$\('project-dialog'\)\)/,
  'job-controls.js': /CNCStripGuard\.isolate\(\$\('pilot-dialog'\)\)[\s\S]*order=stripStops\(\)\.concat\(order\)/,
};
for (const [file, re] of Object.entries(wired)) assert.match(read(file), re, file + ' uses strip-guard.js');
// V1 / V1b: a layer covered by another one leaves the keys to it.
for (const [file, re] of Object.entries({
  'touch-shell.js': /if\(!openedSheet\|\|\(window\.CNCStripGuard&&window\.CNCStripGuard\.covered\(openedSheet\)\)\)return;/,
  'projects.js': /root\.CNCStripGuard\.covered\(\$\('project-dialog'\)\)/,
  'coordinate-editor.js': /CNCStripGuard\.covered\(modal\)/,
  'preview-viewer.js': /CNCStripGuard\.covered\(overlay\)/,
  'job-controls.js': /CNCStripGuard\.covered\(\$\('pilot-dialog'\)\)/,
})) assert.match(read(file), re, file + ' ignores keys when covered');
// V2: Enter on the strip's Pause / Arrêter under the pad is theirs.
assert.match(read('numeric-pad.js'), /if \(e\.key === 'Enter' && root\.CNCStripGuard && root\.CNCStripGuard\.stops\(\)\.indexOf\(document\.activeElement\) >= 0\) return;/);
// V3-V5: the lock isolates (Pause, Arrêter, padlock), closes the real move panel and refuses the pilot dialog.
assert.match(read('screen-lock.js'), /restoreLock=window\.CNCStripGuard\.isolate\(shield,keep\)/);
assert.match(read('screen-saver.js'), /background = window\.CNCStripGuard\.isolate\(overlay, \[\], \{ cover: true \}\)/, 'the screen saver is a layer of the stack (X1)');
assert.match(read('real-motion.js'), /addEventListener\('cnc-screen-lock',function\(e\)\{if\(e&&e\.detail\)\{stopHold\(t\('écran verrouillé'\)\);closePanel\(false\);\}\}\)/);
assert.match(read('job-controls.js'), /window\.cncScreenLock\.locked\(\)\)return false;/);
assert.doesNotMatch(read('touch-shell.js'), /open:function\(\)\{[^}]*banner\.inert=true/, 'a sheet no longer makes the strip inert');
assert.doesNotMatch(read('preview-viewer.js'), /background=Array\.prototype\.map\.call\(document\.querySelectorAll\('main,#tabbar,#real-banner/, 'the viewer does not make the strip inert when the guard is there');
// Below the strip: the class of the guard, the project sheet and the cards' heights.
const css = read('ui-2027.css');
assert.match(css, /\.t-below-strip\{top:var\(--statusbar-h,72px\)!important\}/);
assert.match(css, /\.ks-ui #project-dialog\{top:var\(--statusbar-h\)\}/);
assert.match(css, /\.t-below-strip \.t-numpad-card\{max-height:calc\(100vh - var\(--statusbar-h\)/);
// Both pages load the guard after the catalog and before every overlay module.
for (const pageFile of ['index.html', 'simulation.html']) {
  const html = read(pageFile), at = (f) => html.indexOf('src="' + f);
  assert(at('strip-guard.js') > at('i18n.js') && at('i18n.js') > 0, pageFile + ': strip-guard.js after i18n.js');
  ['numeric-pad.js', 'touch-shell.js', 'coordinate-editor.js', 'preview-viewer.js', 'job-controls.js'].forEach((f) => { if (at(f) >= 0) assert(at('strip-guard.js') < at(f), pageFile + ': strip-guard.js before ' + f); });
  // Degraded start-up (D-B1): the strip stays shown and usable above « Chargement incomplet ».
  assert.match(html, /html\.cnc-degraded body>#real-banner,html\.cnc-degraded body>#simulation-banner\{visibility:visible!important;pointer-events:auto!important;position:fixed!important;left:0;right:0;top:0;z-index:2147483647\}/, pageFile);
  assert.match(html, /html\.cnc-degraded #cnc-boot\{top:var\(--statusbar-h,72px\)\}/, pageFile);
}
// startup.js marks the page degraded on a failure, never before.
{
  const classes = new Set(), listeners = {};
  const ctx = { window: { addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener() {} }, setTimeout: () => 1, clearTimeout() {},
    document: { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } }, getElementById: () => ({ textContent: '' }) } };
  vm.createContext(ctx); vm.runInContext(read('startup.js'), ctx);
  assert(!classes.has('cnc-degraded'));
  listeners.error({ target: { tagName: 'SCRIPT' } });
  assert(classes.has('cnc-degraded'), 'a failed module marks the page degraded (the strip stays usable)');
}
console.log('PASS strip guard: Pause / Arrêter kept active over sheets, project sheet, pad, coordinate editor, viewer and pilot dialog; overlays below the strip; Tab through Pause / Arrêter; previous inert values restored; degraded start-up keeps the strip.');
