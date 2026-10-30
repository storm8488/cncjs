/* Numeric entry shared by the touch pages (audit 31, U6): one parser and one
 * key pad for the coordinate editor (inline), the touch-plate fields and the
 * resume line (as a modal pad bound to their input). The parser keeps empty,
 * zero and unreadable apart, accepts a comma or a point, and never turns an
 * unreadable text into a number; the pad shows the unit and the limits next
 * to the value, keeps the draft on an error, and only writes the input when
 * the value is accepted ("Valider"). The server still validates every value. */
(function (root) {
  'use strict';
  var uiLocale = (typeof window !== 'undefined' && window.cncI18n) || { t: function (s) { return s; } };
  var t = function (s) { return uiLocale.t(s); };
  var KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.', 'Effacer', '⌫'];
  var NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
  function fmt(v) { return String(v).replace('.', ','); }
  // Text of the limits shown near the field: "de 0,01 à 50 mm".
  function limits(rules) {
    rules = rules || {};
    var unit = rules.unit ? ' ' + rules.unit : '', lo = typeof rules.min === 'number', hi = typeof rules.max === 'number';
    if (lo && hi) return t('de ') + fmt(rules.min) + t(' à ') + fmt(rules.max) + unit;
    if (lo) return t('au moins ') + fmt(rules.min) + unit;
    if (hi) return t('au plus ') + fmt(rules.max) + unit;
    return '';
  }
  // parse(text, {min, max, integer, negative:false, unit}) -> {state, value, message}
  // state: 'empty' | 'invalid' | 'negative' | 'integer' | 'range' | 'ok'. Only 'ok' carries a usable value.
  function parse(text, rules) {
    rules = rules || {};
    var s = (text === null || text === undefined ? '' : String(text)).trim();
    if (!s) return { state: 'empty', value: null, message: t('Aucune valeur saisie.') };
    if (!NUMBER.test(s)) return { state: 'invalid', value: null, message: t('Valeur illisible : chiffres, virgule ou point seulement.') };
    var n = Number(s.replace(',', '.'));
    if (!isFinite(n)) return { state: 'invalid', value: null, message: t('Valeur illisible : chiffres, virgule ou point seulement.') };
    if (n < 0 && rules.negative === false) return { state: 'negative', value: n, message: t('Valeur négative refusée ici.') };
    if (rules.integer && Math.floor(n) !== n) return { state: 'integer', value: n, message: t('Nombre entier attendu.') };
    if ((typeof rules.min === 'number' && n < rules.min) || (typeof rules.max === 'number' && n > rules.max)) return { state: 'range', value: n, message: t('Hors limites : ') + limits(rules) + '.' };
    return { state: 'ok', value: n, message: '' };
  }
  // One key press applied to a draft text (the coordinate editor's rules).
  function press(key, text, rules) {
    rules = rules || {};
    var v = text || '';
    if (key === 'Effacer') return '';
    if (key === '⌫') return v.slice(0, -1);
    if (key === '±') return rules.negative === false ? v : (v.charAt(0) === '-' ? v.slice(1) : '-' + v);
    if (key === '.') return rules.integer || /[.,]/.test(v) || v.length >= 18 ? v : v + '.';
    return /^\d$/.test(key) && v.length < 18 ? v + key : v;
  }
  var api = { parse: parse, press: press, limits: limits, KEYS: KEYS };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  // Builds the fourteen keys into a container; get()/set(text) hold the draft.
  // `rules` may be a function (the modal pad's rules change with the bound field).
  function keys(container, get, set, rules, attribute) {
    KEYS.forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute(attribute || 'data-numpad-key', k); b.textContent = t(k);
      b.addEventListener('click', function () { set(press(k, get(), typeof rules === 'function' ? rules() : rules)); });
      container.appendChild(b);
    });
  }
  // Modal pad for an input: opened by a tap on the field (a physical keyboard still types in it).
  var modal = null, display = null, error = null, title = null, bounds = null, unit = null, ok = null, cancel = null, close = null;
  var draft = '', bound = null, returnTo = null, background = null;
  // Makes everything but the overlay inert, except the strip's Pause / Arrêter when the guard
  // is loaded (strip-guard.js); returns the function that restores the previous values.
  function isolate(overlay) {
    if (root.CNCStripGuard) return root.CNCStripGuard.isolate(overlay);
    var entries = Array.prototype.filter.call(document.body.children, function (n) { return n !== overlay && !/^(SCRIPT|LINK|STYLE)$/.test(n.tagName); }).map(function (n) { var e = { node: n, inert: n.inert }; n.inert = true; return e; });
    return function () { entries.forEach(function (e) { e.node.inert = e.inert; }); };
  }
  function build() {
    modal = document.createElement('div'); modal.id = 't-numpad'; modal.className = 't-numpad'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 't-numpad-title');
    var card = document.createElement('div'); card.className = 't-numpad-card'; modal.appendChild(card);
    var header = document.createElement('header'); title = document.createElement('h2'); title.id = 't-numpad-title'; header.appendChild(title);
    close = document.createElement('button'); close.type = 'button'; close.textContent = t('Fermer ×'); close.setAttribute('aria-label', t('Fermer')); header.appendChild(close); card.appendChild(header);
    bounds = document.createElement('p'); bounds.className = 't-numpad-bounds'; card.appendChild(bounds);
    var value = document.createElement('div'); value.className = 't-numpad-value';
    display = document.createElement('output'); display.id = 't-numpad-display'; display.setAttribute('aria-live', 'polite'); value.appendChild(display);
    unit = document.createElement('span'); unit.className = 't-numpad-unit'; value.appendChild(unit); card.appendChild(value);
    var pad = document.createElement('div'); pad.className = 't-numpad-keys coordinate-keypad'; pad.setAttribute('aria-label', t('Pavé numérique'));
    keys(pad, function () { return draft; }, function (text) { draft = text; paint(); }, function () { return bound ? bound.rules : {}; }, 'data-numpad-key'); card.appendChild(pad);
    error = document.createElement('p'); error.id = 't-numpad-error'; error.className = 't-numpad-error'; error.setAttribute('role', 'status'); card.appendChild(error);
    var actions = document.createElement('div'); actions.className = 't-numpad-actions';
    cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 't-btn t-btn--ghost'; cancel.textContent = t('Annuler');
    ok = document.createElement('button'); ok.type = 'button'; ok.className = 't-btn t-btn--primary'; ok.textContent = t('Valider');
    actions.appendChild(cancel); actions.appendChild(ok); card.appendChild(actions);
    document.body.appendChild(modal);
    close.addEventListener('click', hide); cancel.addEventListener('click', hide);
    ok.addEventListener('click', apply);
    document.addEventListener('keydown', function (e) {
      if (!bound || modal.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
      // Enter on the strip's Pause / Arrêter activates them (native button), never Valider (V2).
      if (e.key === 'Enter' && root.CNCStripGuard && root.CNCStripGuard.stops().indexOf(document.activeElement) >= 0) return;
      if (e.key === 'Enter') { e.preventDefault(); apply(); return; }
      if (e.key === 'Tab') {
        var focusable = Array.prototype.filter.call(modal.querySelectorAll('button'), function (el) { return !el.disabled; });
        // The strip's Pause / Arrêter belong to the cycle (strip-guard.js).
        if (root.CNCStripGuard) { root.CNCStripGuard.tab(e, modal, focusable); return; }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function paint() {
    var r = bound ? bound.rules : {};
    // The pad shows the draft as typed; a comma is accepted and shown as such.
    display.textContent = draft || ' ';
    var p = draft ? parse(draft, r) : null;
    error.textContent = p && p.state !== 'ok' ? p.message : '';
    if (error.getAttribute('data-tone') !== (p && p.state !== 'ok' ? 'danger' : '')) error.setAttribute('data-tone', p && p.state !== 'ok' ? 'danger' : '');
    // Valider stays enabled: pressing it with an unusable draft shows why (never a silent zero).
  }
  function apply() {
    if (!bound) return;
    var p = parse(draft, bound.rules);
    if (p.state !== 'ok') { error.textContent = p.message; error.setAttribute('data-tone', 'danger'); return; }
    // The accepted number is written with a point (what the server reads); the draft is not lost on error.
    var input = bound.input, text = String(p.value);
    if (input.value !== text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    hide();
  }
  function hide() {
    if (!modal || modal.hidden) return;
    modal.hidden = true; bound = null;
    var restore = background; background = null; if (typeof restore === 'function') restore();
    var target = returnTo; returnTo = null;
    if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }
  function open(input, rules) {
    if (!modal) build();
    if (input.disabled) return;
    bound = { input: input, rules: rules || {} }; draft = input.value || ''; returnTo = input;
    title.textContent = rules.label || input.getAttribute('aria-label') || '';
    bounds.textContent = limits(rules) ? t('Valeur attendue : ') + limits(rules) + (rules.integer ? t(' (entier)') : '') : (rules.integer ? t('Nombre entier') : '');
    unit.textContent = rules.unit || '';
    // Pause / Arrêter of the strip stay usable over the pad (strip-guard.js, U5); the rest is inert.
    if (typeof background === 'function') background();
    background = isolate(modal);
    modal.hidden = false; paint(); close.focus();
  }
  // bind(input, rules): a tap (click) on the field opens the pad; typing stays possible.
  function bind(input, rules) {
    if (!input) return;
    input.setAttribute('inputmode', 'none'); // no virtual keyboard over the field: the pad replaces it
    if (!input.getAttribute('aria-label') && rules && rules.label) input.setAttribute('aria-label', rules.label);
    input.addEventListener('click', function () { open(input, rules || {}); });
  }
  window.addEventListener('cnc-screen-change', hide);
  document.addEventListener('visibilitychange', function () { if (document.hidden) hide(); });
  api.keys = keys; api.bind = bind; api.open = open; api.close = hide; api.opened = function () { return !!(modal && !modal.hidden); };
  root.CNCNumeric = api;
})(typeof window === 'object' ? window : this);
