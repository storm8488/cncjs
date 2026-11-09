'use strict';
// Lot jog (design/PROMPT-ECRANS-MULTIAGENT.md, screen-jog): display defects of Préparer and its probe screens, checked
// from the stylesheets and the design tokens. Appearance only: no rule here changes what a button sends or when it
// is enabled (the :disabled rules keep their colours).
const assert = require('assert').strict, fs = require('fs'), path = require('path');
const read = (n) => fs.readFileSync(path.join(__dirname, 'touch', n), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('design-tokens.css'), ui = read('ui-2027.css'), origin = read('origin-preview.css'), probe = read('probe.css');

// ---- Tokens of both themes. ----
function theme(selector) {
  const block = tokens.slice(tokens.indexOf(selector)), body = block.slice(block.indexOf('{') + 1, block.indexOf('}')), out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}
const dark = theme(':root{'), light = Object.assign({}, dark, theme(':root[data-theme="light"]'));
function lum(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
for (const [name, t] of [['dark', dark], ['light', light]]) {
  // Control outlines (WCAG 1.4.11, 3:1): --faint on every background these controls sit on or fill.
  for (const bg of ['bg', 'surface', 'surface-2']) assert(ratio(t.faint, t[bg]) >= 3, name + ': --faint on --' + bg + ' ' + ratio(t.faint, t[bg]).toFixed(2));
  // The old outline failed (dark 1.99–2.63, light 2.68–2.94 on --bg / --surface-2): the reason for the change.
  assert(ratio(t['line-strong'], t['surface-2']) < 3, name + ': --line-strong was under 3:1 on --surface-2');
  // Stop / delete of the probe screens: white on red, not --fg (2.42:1 in the light theme).
  assert(ratio(t['on-danger'], t.danger) >= 4.5, name + ': --on-danger on --danger');
}
assert(ratio(light.fg, light.danger) < 4.5, 'light: --fg on --danger was the defect');

// ---- Rules. ----
function rule(css, selector, alone) {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) { const list = m[1].split(',').map((s) => s.trim()); if (alone ? list.length === 1 && list[0] === selector : list.includes(selector)) return m[2]; }
  throw new Error('no rule for ' + selector);
}
// Outlines of the enabled controls (M2): --faint, the :disabled and aria-pressed rules unchanged.
for (const [css, sel] of [[ui, '.ks-ui #screen-jog .jog'], [ui, '.ks-ui #screen-jog .steps'], [ui, '.ks-ui #screen-jog .ks-secondary'], [ui, '.ks-ui .ks-coordinate-table button'],
  [ui, '.ks-preparation-actions .ks-secondary'], [origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-bar button'], [origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-jog-open'],
  [origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-tools button'], [probe, '.probe-operations button'], [probe, '.probe-tabs button']]) {
  assert.match(rule(css, sel), /border:1px solid var\(--faint\)/, sel);
}
assert.match(rule(ui, '.ks-ui #screen-jog .pad-mid'), /border:1px dashed var\(--faint\)/);
assert.doesNotMatch(rule(ui, '.ks-ui #screen-jog .jog:disabled'), /--faint/, 'disabled cross: its own rule');
// Comparison bar (O1): one row in its fixed 48 px track, the title shrinks, « Cotes » stays reachable.
assert.match(rule(origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-bar'), /flex-wrap:nowrap/);
const title = rule(origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-bar-title');
assert.match(title, /flex:1 1 0;min-width:0/); assert.doesNotMatch(title, /margin-right:auto/);
assert.match(rule(origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-bar button', true), /flex:none;white-space:nowrap/);
assert.match(origin, /grid-template-rows:auto 48px minmax\(0,1fr\) auto 104px/, 'the bar row stays 48 px');
// « Poser X Y ici… » greyed out (A3): its own colours, not app.css's opacity 0.4 on top (1.65:1).
assert.match(rule(origin, 'body.perf-origin #screen-jog[data-pv2] .pv2-set-xy:disabled'), /color:var\(--disabled-fg\);background:var\(--disabled-bg\);border-color:var\(--line\);opacity:1/);
// Dry-run line (O3 / O11): two lines kept in v1 and the cross mode (the cross no longer jumps between states), hidden
// beside the comparison where it described a cross that is not shown.
assert.match(rule(ui, '.ks-ui #screen-jog #jog-msg', true), /line-height:1\.3;min-height:2\.6em/);
assert.match(rule(origin, 'body.perf-origin #screen-jog[data-pv2="compare"] #jog-msg'), /display:none/);
// Step segments (O12): 12 px between targets.
assert.match(rule(ui, '.ks-ui #screen-jog .steps'), /gap:var\(--tap-gap\)/);
// Préparer header (M11 captures, « Déplacement réel » enabled in ES): the actions wrap under the title instead of
// squeezing it to ~150 px; without that fourth action nothing wraps (20em title + three actions fit at 1366 px).
assert.match(rule(ui, '.ks-ui #screen-jog .ks-panel-intro', true), /display:flex;flex-wrap:wrap;/);
assert.match(rule(ui, '.ks-ui #screen-jog .ks-panel-intro>div:first-child', true), /flex:1 1 20em;min-width:0/);
// Probe screens (M3, A6): white on the red stop, and no text under 16 px (the large-text mode follows the tokens).
assert.match(rule(probe, '.probe-actions .probe-stop'), /background:var\(--danger\);color:var\(--on-danger\)/);
const small = [...probe.matchAll(/font(?:-size)?:\s*(?:[0-9]+ )?([0-9.]+)px/g)].map((m) => Number(m[1])).filter((v) => v < 16);
assert.deepEqual(small, [], 'probe.css: font sizes under 16 px');
assert.doesNotMatch(probe, /!important[^}]*font-size|font-size:[^;}]*!important/, 'no forced small size');
// ---- Lot jog, review fixes. ----
// Selected probe operation / tab (Fable 4, Astra 4): the aria-pressed outline was --line-strong (< 3:1, asserted
// above); --info reaches 3:1 on the button (--surface-2) and on the card (--surface) in both themes.
assert.match(rule(probe, '.probe-operations [aria-pressed=true]'), /border-color:var\(--info\)/);
assert.match(rule(probe, '.probe-tabs [aria-pressed=true]'), /border-color:var\(--info\)/);
for (const [name, t] of [['dark', dark], ['light', light]]) for (const bg of ['surface', 'surface-2']) assert(ratio(t.info, t[bg]) >= 3, name + ': --info on --' + bg);
// Greyed probe buttons (Astra 11): app.css « button:disabled{opacity:.4} » left white on a faded red at ~2.1:1; their
// own opaque colours instead (the disabled property itself is untouched).
assert.match(rule(probe, '.ks-ui .probe-actions button:disabled'), /opacity:1;color:var\(--disabled-fg\);background:var\(--disabled-bg\)/);
for (const [name, t] of [['dark', dark], ['light', light]]) assert(ratio(t['disabled-fg'], t['disabled-bg']) >= 4.5, name + ': --disabled-fg on --disabled-bg');
// « Preparación del sondeo » in ES large text at 768 px scrolled (Fable 1, Astra 2): rows tightened, 16 px+ text kept.
assert.match(rule(probe, '#probe-preparation-list li'), /padding:6px 0/);
assert.match(rule(probe, '#probe-preparation-list'), /min-height:200px/);
assert.match(rule(probe, '.ks-ui #probe-preparation-values p'), /margin:0;padding:6px 0;.*font-size:var\(--fs-16\)/);
// Dead declarations of the fallback (Fable 3): the note size is the paragraph's (.ks-ui .probe-screen p wins).
assert.doesNotMatch(rule(probe, '.probe-screen .probe-note'), /font-size/);
// Préparer header with « Déplacement réel » in large text (harness lot-jog-fix): v1, the dry-run line stays under the
// title (the cross rose by 50 px during a job); v2 comparison, the title column narrows instead of wrapping the
// actions (the tools left the side column).
assert.match(rule(ui, 'body.ks-ui.display-large:not(.perf-origin) #screen-jog #jog-msg'), /flex-basis:100%/);
assert.match(rule(origin, 'body.perf-origin #screen-jog[data-pv2="compare"] .ks-panel-intro>div:first-child'), /flex-basis:0;min-width:auto/);
// Rail of a sub-screen (Astra 3): « Retour » + 7 entries scrolled at 768 px (8 × 76 + 7 × 12 > 680), which narrowed
// the rail and cut « Preparar », « Máquina »…; after « Retour » the entries are 72 px and the eight fit.
{
  const px = (n) => Number((tokens.match(new RegExp('--' + n + ':(\\d+)px')) || [])[1]);
  const room = 768 - px('statusbar-h') - 2 * px('sp-2'), gaps = 7 * px('tap-gap');
  assert(8 * 76 + gaps > room, 'the defect: eight 76 px entries do not fit ' + room + ' px');
  assert.match(rule(ui, '.ks-ui .ks-nav[data-ks-screen=back]:not([hidden])~.ks-nav'), /min-height:72px/);
  // « Segui-miento » takes two lines in ES large text (83.2 px measured): still within the room.
  assert(76 + 6 * 72 + 84 + gaps <= room, 'eight entries fit after « Retour »');
}
console.log('PASS préparer style: --faint outlines ≥ 3:1 in both themes, comparison bar on one row, greyed « Poser X Y ici… » without extra opacity, dry-run line on two lines, 12 px step gap, probe stop white on red, no probe text under 16 px.');
