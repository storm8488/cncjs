'use strict';
// Shared text keyboard (text-keyboard.js, finitions chantier 3): the kiosk has no system keyboard.
// keys(): AZERTY rows, Maj, ?123 / ABC, ⌫ and Espace (the Wi-Fi form keeps them inline); bind(): a tap
// on a text field opens a modal pad named after the field, Valider writes the draft and sends input /
// change, Annuler / Échap / screen change / lock / hidden page leave the field as it was, maxLength is
// kept, a disabled field never opens it, the rest of the page is isolated (Pause / Arrêter kept).
// Every text field of the real page is bound. Synthetic DOM, no network.
const assert = require('assert').strict, fs = require('fs'), vm = require('vm');
const read = (f) => fs.readFileSync(__dirname + '/touch/' + f, 'utf8');
const { createDOM } = require('./dom-fixture.cjs');

function setup(guard) {
  const { document } = createDOM(['home']);
  const listeners = {}, window = { cncI18n: { t: (s) => s }, addEventListener: (n, f) => { listeners[n] = f; } };
  const realCreate = document.createElement;
  document.createElement = (tag) => { const e = realCreate(tag); e.isConnected = true; e.dispatchEvent = (ev) => { (e._listeners && e._listeners[ev.type] || []).forEach((f) => f.call(e, ev)); }; return e; };
  const isolated = [];
  if (guard) window.CNCStripGuard = { isolate: (o) => { isolated.push(o); return () => isolated.pop(); }, tab: (e) => { guard.tabs.push(e.key); }, stops: () => [] };
  vm.runInNewContext(read('text-keyboard.js'), { window, document, Event: function (type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); } });
  const field = (value, maxLength) => { const f = document.createElement('input'); f.value = value; if (maxLength) f.maxLength = maxLength; return f; };
  const modal = () => document.body.children.find((c) => c.id === 't-textpad');
  const all = () => modal().querySelectorAll('*');
  const press = (text) => { const b = all().find((e) => e.tagName === 'BUTTON' && e.textContent === text); assert(b, 'key ' + text); b.click(); };
  const shown = () => all().find((e) => e.id === 't-textpad-display').textContent;
  return { document, window, listeners, field, modal, all, press, shown, isolated, K: window.CNCTextKeyboard };
}

// keys(): the AZERTY rows, Maj, ?123 and back, ⌫, Espace (the Wi-Fi keys, moved here).
{
  const p = setup(), box = p.document.createElement('div');
  let text = '', after = 0;
  const k = p.K.keys(box, { type: (c) => { text += c; }, backspace: () => { text = text.slice(0, -1); }, after: () => { after++; } });
  const rows = () => box.children.map((r) => r.children.map((b) => b.textContent).join(' '));
  assert.deepEqual(rows(), ['a z e r t y u i o p', 'q s d f g h j k l m', 'Maj w x c v b n ⌫', '?123 Espace']);
  assert.equal(after, 1, 'after() once per drawing (Wi-Fi greys its keys there)');
  const key = (t) => box.querySelectorAll('button').find((b) => b.textContent === t);
  key('a').click(); key('Maj').click(); assert.deepEqual({ ...k.state() }, { layer: 'letters', upper: true });
  assert.equal(box.querySelectorAll('button').find((b) => b.textContent === 'Maj').getAttribute('aria-pressed'), 'true');
  key('Z').click(); key('Espace').click(); key('⌫').click(); key('?123').click();
  assert.deepEqual(rows(), ['1 2 3 4 5 6 7 8 9 0', '@ # $ % & * - _ + =', '! ? . , ; : \' " / \\', '( ) [ ] { } < > ~ | ^ `', 'ABC Espace ⌫']);
  key('4').click(); key('2').click(); assert.equal(text, 'aZ42');
  k.reset(); assert.deepEqual({ ...k.state() }, { layer: 'letters', upper: false }); assert.equal(rows()[0], 'a z e r t y u i o p');
}
// bind(): a tap opens the pad named after the field; Valider writes and sends input / change.
{
  const guard = { tabs: [] }, p = setup(guard), f = p.field('Plaque', 8), events = [];
  f.addEventListener('input', () => events.push('input')); f.addEventListener('change', () => events.push('change'));
  p.K.bind(f, { label: 'Nom du profil' });
  assert.equal(f.getAttribute('inputmode'), 'none', 'no system keyboard over the field');
  assert.equal(f.getAttribute('aria-label'), 'Nom du profil');
  assert.equal(p.modal(), undefined, 'built on first use');
  f.handlers.click();
  assert(p.modal() && !p.modal().hidden, 'opened by a tap'); assert.equal(p.K.opened(), true);
  assert.equal(p.modal().getAttribute('role'), 'dialog'); assert.equal(p.modal().getAttribute('aria-modal'), 'true');
  assert.equal(p.all().find((e) => e.id === 't-textpad-title').textContent, 'Nom du profil');
  assert.equal(p.shown(), 'Plaque', 'the field value is the draft');
  assert.deepEqual(p.isolated, [p.modal()], 'the rest of the page isolated through the strip guard');
  p.press('Maj'); p.press('Z'); p.press('Espace'); p.press('?123'); p.press('2');
  assert.equal(p.shown(), 'PlaqueZ ', 'maxLength 8: the ninth character is not typed');
  p.press('⌫'); p.press('2'); assert.equal(p.shown(), 'PlaqueZ2');
  assert.equal(f.value, 'Plaque', 'nothing written before Valider'); assert.deepEqual(events, []);
  p.press('Valider');
  assert(p.modal().hidden); assert.equal(f.value, 'PlaqueZ2'); assert.deepEqual(events, ['input', 'change']);
  assert.deepEqual(p.isolated, [], 'the page restored'); assert.equal(p.document.activeElement, f, 'focus back on the field');
  // Reopened: letters, lower case.
  f.handlers.click(); assert.deepEqual({ ...p.K.state().keys }, { layer: 'letters', upper: false });
  // Valider without a change sends nothing.
  p.press('Valider'); assert.deepEqual(events, ['input', 'change']);
  // Annuler, Fermer, Échap, a screen change, the lock and a hidden page leave the field as it was.
  for (const close of [() => p.press('Annuler'), () => p.press('Fermer ×'), () => p.document.handlers.keydown({ key: 'Escape', preventDefault() {} }),
    () => p.listeners['cnc-screen-change']({ detail: 'menu' }), () => p.listeners['cnc-screen-lock']({ detail: true }),
    () => { p.document.hidden = true; p.document.handlers.visibilitychange(); p.document.hidden = false; }]) {
    f.handlers.click(); assert(!p.modal().hidden); p.press('a');
    close(); assert(p.modal().hidden); assert.equal(f.value, 'PlaqueZ2'); assert.deepEqual(events, ['input', 'change']);
  }
  // Unlocking does not close; Tab goes through the strip guard; Enter is the focused button's (Annuler, Fermer stay
  // themselves), never Valider behind it.
  f.handlers.click(); p.listeners['cnc-screen-lock']({ detail: false }); assert(!p.modal().hidden);
  p.press('⌫'); p.document.handlers.keydown({ key: 'Tab', preventDefault() {} }); assert.deepEqual(guard.tabs, ['Tab']);
  let prevented = false; p.document.handlers.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert(!p.modal().hidden && !prevented); assert.equal(f.value, 'PlaqueZ2');
  p.press('Valider'); assert.equal(f.value, 'PlaqueZ');
  // No « ↵ » key for a one-line field.
  f.handlers.click(); assert(!p.all().some((e) => e.textContent === '↵')); p.press('Annuler');
  // A disabled field never opens it.
  f.disabled = true; f.handlers.click(); assert(p.modal().hidden);
  // A label already on the field is kept; without options the field's own label names the pad.
  const g = p.field(''); g.setAttribute('aria-label', 'Notes'); p.K.bind(g); g.handlers.click();
  assert.equal(p.all().find((e) => e.id === 't-textpad-title').textContent, 'Notes'); assert.equal(p.shown(), ' ');
  p.press('Annuler');
  // A text area (project notes): a « ↵ » key types a new line, in both layers; existing lines are kept.
  const notes = p.document.createElement('textarea'); notes.value = 'ligne 1'; p.K.bind(notes, { label: 'Notes' }); notes.handlers.click();
  p.press('↵'); p.press('b'); p.press('?123'); p.press('↵'); p.press('2'); p.press('Valider');
  assert.equal(notes.value, 'ligne 1\nb\n2');
}
// Every phrase is in the FR / EN / ES catalogue.
{
  const phrases = [...read('text-keyboard.js').matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, '\''));
  const catalog = { window: {} }; ['i18n-messages.js', 'i18n-messages-profiles.js'].forEach((f) => vm.runInNewContext(read(f), catalog));
  const rows = new Map(catalog.window.CNCTouchMessages.map((r) => [r[0].trim().replace(/\s+/g, ' '), r]));
  for (const s of new Set(phrases)) if (/[a-zà-ÿ]{2}/i.test(s)) { const r = rows.get(s); assert(r && r[1] && r[2], 'missing translation: ' + s); }
  // The pad's title is the field's label, translated (« Outil » had no row).
  for (const s of ['Nom du profil', 'Matière', 'Outil', 'Notes', 'Rechercher un fichier', 'Motif de la prise de pilotage (3 caractères au moins, enregistré et montré à l’autre appareil)']) { const r = rows.get(s); assert(r && r[1] && r[2], 'missing translation: ' + s); }
}
// The real page: the module loaded after the strip guard and before every module that uses it, and every
// text field without a keyboard is bound (Nom du profil, motif du pilotage, recherche, fiche projet).
for (const name of ['index.html', 'simulation.html']) {
  const html = read(name), at = (f) => html.indexOf('src="' + f);
  assert(at('text-keyboard.js') > at('strip-guard.js') && at('strip-guard.js') > 0, name + ': after strip-guard.js');
  for (const f of ['wifi-settings.js', 'probe-ui.js', 'job-controls.js', 'projects.js', 'shared-library.js']) if (at(f) >= 0) assert(at('text-keyboard.js') < at(f), name + ': before ' + f);
}
const BOUND = {
  'probe-ui.js': ["$('probe-profile-name')"],
  'job-controls.js': ["$('pilot-reason')"],
  'shared-library.js': ["$('library-search')"],
  'projects.js': ["'project-material'", "'project-tool'", "'project-notes'", "'project-comp-tool'"]
};
for (const [file, ids] of Object.entries(BOUND)) {
  const src = read(file), at = src.indexOf('CNCTextKeyboard.bind');
  assert(at > 0, file + ' binds the text keyboard');
  for (const id of ids) assert(src.indexOf(id, at - 400) > 0 && new RegExp('CNCTextKeyboard[\\s\\S]{0,400}' + id.replace(/[$()]/g, '\\$&')).test(src), file + ': ' + id + ' bound');
}
// Layering (revue P1-2): the pad opens from fields inside the pilot dialog (.job-dialog) and the sheets:
// it must lie above them (an inert dialog over it would swallow the taps), below the .ks-why toast.
{
  const css = read('ui-2027.css') + read('touch-shell.css');
  // The z-index of the rule `sel{…}` (the first such rule that sets one, at the start of a line or after `}`).
  const z = (sel) => {
    for (let at = css.indexOf(sel + '{'); at >= 0; at = css.indexOf(sel + '{', at + 1)) {
      if (at > 0 && !/[\n}]/.test(css[at - 1])) continue;
      const m = /z-index:(\d+)/.exec(css.slice(at, css.indexOf('}', at)));
      if (m) return Number(m[1]);
    }
    assert.fail('z-index of ' + sel);
  };
  const pad = z('.t-textpad');
  for (const sel of ['.ks-ui .job-dialog', '.t-scrim', '.ks-sheet', '.t-numpad']) assert(pad > z(sel), '.t-textpad (' + pad + ') above ' + sel + ' (' + z(sel) + ')');
  assert(pad < z('.ks-why'), '.t-textpad below the .ks-why toast');
}
// A long note: the end of the draft stays in view.
{
  const p = setup(), f = p.field('');
  p.K.open(f, { label: 'Notes' });
  const display = p.all().find((e) => e.id === 't-textpad-display');
  display.scrollHeight = 480;
  p.press('a');
  assert.equal(display.scrollTop, 480, 'display scrolled to the end of the draft');
  p.K.close();
}
// Wi-Fi draws its keys with the shared module (no private key list left).
assert(read('wifi-settings.js').includes('window.CNCTextKeyboard.keys(keyboard'), 'Wi-Fi uses the shared keys');
assert(!/azertyuiop/.test(read('wifi-settings.js')), 'no private AZERTY rows left in wifi-settings.js');
console.log('PASS text keyboard: AZERTY rows, Maj, ?123, ⌫, Espace; modal pad named after the field, Valider writes and sends input/change, Annuler / Échap / screen change / lock / hidden page leave it, maxLength, disabled field, strip guard; every text field of the real page bound; Wi-Fi on the shared keys.');
