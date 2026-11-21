/* On-screen text keyboard shared by the touch pages: the kiosk has no system keyboard.
 * keys(container, {type, backspace, after}) draws the AZERTY keys (letters, then digits and symbols)
 * into a container: the Wi-Fi form keeps them inline (wifi-settings.js). bind(input, {label}) gives a
 * text field a modal pad, like the numeric pad (numeric-pad.js): a tap on the field opens it, the draft
 * is written to the field only on « Valider » (then `input` and `change` are sent); « Annuler », Échap,
 * a screen change, the lock or a hidden page leave the field as it was. A text area gets a « ↵ » key.
 * While the pad is open only its keys type (the kiosk has no physical keyboard). */
(function (root) {
  'use strict';
  function t(s) { var l = root.cncI18n; return l && typeof l.t === 'function' ? l.t(s) : s; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  // ---- The keys: AZERTY letters, then digits and symbols ----
  var LETTERS = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'], SYMBOLS = ['1234567890', '@#$%&*-_+=', '!?.,;:\'"/\\', '()[]{}<>~|^`'];
  function keys(container, o) {
    var layer = 'letters', upper = false;
    function key(text, action, cls, name) {
      var b = el('button', 'ks-wifi-key' + (cls ? ' ' + cls : ''), text); b.type = 'button';
      if (name) b.setAttribute('aria-label', name);
      b.addEventListener('click', function () { if (!b.disabled) action(); });
      return b;
    }
    function draw() {
      container.textContent = '';
      var letters = layer === 'letters';
      (letters ? LETTERS : SYMBOLS).forEach(function (chars, i) {
        var r = el('div', 'ks-wifi-keyrow');
        if (letters && i === 2) { var shift = key(t('Maj'), function () { upper = !upper; draw(); }, 'ks-wifi-key--wide', t('Majuscules')); shift.setAttribute('aria-pressed', String(upper)); r.appendChild(shift); }
        chars.split('').forEach(function (c) { var ch = letters && upper ? c.toUpperCase() : c; r.appendChild(key(ch, function () { o.type(ch); })); });
        if (letters && i === 2) r.appendChild(key('⌫', o.backspace, 'ks-wifi-key--wide', t('Effacer le dernier caractère')));
        container.appendChild(r);
      });
      var last = el('div', 'ks-wifi-keyrow');
      last.appendChild(key(letters ? '?123' : 'ABC', function () { layer = letters ? 'symbols' : 'letters'; draw(); }, 'ks-wifi-key--wide', letters ? t('Chiffres et symboles') : t('Lettres')));
      last.appendChild(key(t('Espace'), function () { o.type(' '); }, 'ks-wifi-key--space'));
      if (!letters) last.appendChild(key('⌫', o.backspace, 'ks-wifi-key--wide', t('Effacer le dernier caractère')));
      if (o.newline && o.newline()) last.appendChild(key('↵', function () { o.type('\n'); }, 'ks-wifi-key--wide', t('Retour à la ligne')));
      container.appendChild(last);
      if (o.after) o.after();
    }
    draw();
    return { reset: function () { layer = 'letters'; upper = false; draw(); }, state: function () { return { layer: layer, upper: upper }; } };
  }

  // ---- Modal pad bound to a text field ----
  var modal = null, title = null, display = null, close = null, board = null, draft = '', bound = null, returnTo = null, background = null;
  // Everything but the pad inert, except the strip's Pause / Arrêter (strip-guard.js).
  function isolate(overlay) {
    if (root.CNCStripGuard) return root.CNCStripGuard.isolate(overlay);
    var entries = Array.prototype.filter.call(document.body.children, function (n) { return n !== overlay && !/^(SCRIPT|LINK|STYLE)$/.test(n.tagName); }).map(function (n) { var e = { node: n, inert: n.inert }; n.inert = true; return e; });
    return function () { entries.forEach(function (e) { e.node.inert = e.inert; }); };
  }
  // The end of the draft (where the keys type) stays in view in a long note.
  function paint() { display.textContent = draft || ' '; display.scrollTop = display.scrollHeight; }
  function build() {
    modal = el('div', 't-textpad'); modal.id = 't-textpad'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 't-textpad-title');
    var card = el('div', 't-textpad-card'); modal.appendChild(card);
    var header = el('header'); title = el('h2'); title.id = 't-textpad-title'; header.appendChild(title);
    close = el('button', '', t('Fermer ×')); close.type = 'button'; close.setAttribute('aria-label', t('Fermer')); header.appendChild(close); card.appendChild(header);
    display = el('output', 't-textpad-value'); display.id = 't-textpad-display'; display.setAttribute('aria-live', 'polite'); card.appendChild(display);
    var pad = el('div', 't-textpad-keys'); pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', t('Clavier à l’écran')); card.appendChild(pad);
    board = keys(pad, {
      type: function (ch) { if (!(bound && bound.maxLength > 0 && draft.length >= bound.maxLength)) { draft += ch; paint(); } },
      backspace: function () { draft = draft.slice(0, -1); paint(); },
      newline: function () { return !!bound && bound.tagName === 'TEXTAREA'; }
    });
    var actions = el('div', 't-textpad-actions');
    var cancel = el('button', 't-btn t-btn--ghost', t('Annuler')); cancel.type = 'button';
    var ok = el('button', 't-btn t-btn--primary', t('Valider')); ok.type = 'button';
    actions.appendChild(cancel); actions.appendChild(ok); card.appendChild(actions);
    document.body.appendChild(modal);
    close.addEventListener('click', hide); cancel.addEventListener('click', hide); ok.addEventListener('click', apply);
    // Leaving the screen, the lock or a hidden page close it (the field unchanged).
    root.addEventListener('cnc-screen-change', hide);
    root.addEventListener('cnc-screen-lock', function (e) { if (e && e.detail) hide(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) hide(); });
    document.addEventListener('keydown', function (e) {
      if (!bound || modal.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
      // Enter activates the focused key or button (native), Pause / Arrêter of the strip included: never Valider.
      if (e.key === 'Tab') {
        var focusable = Array.prototype.filter.call(modal.querySelectorAll('button'), function (b) { return !b.disabled; });
        if (root.CNCStripGuard) { root.CNCStripGuard.tab(e, modal, focusable); return; }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function apply() {
    if (!bound) return;
    var input = bound;
    if (input.value !== draft) { input.value = draft; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    hide();
  }
  function hide() {
    if (!modal || modal.hidden) return;
    modal.hidden = true; bound = null;
    var restore = background; background = null; if (typeof restore === 'function') restore();
    var target = returnTo; returnTo = null;
    if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }
  function open(input, options) {
    if (!input || input.disabled) return;
    if (!modal) build();
    bound = input; returnTo = input;
    draft = input.maxLength > 0 ? String(input.value || '').slice(0, input.maxLength) : String(input.value || '');
    title.textContent = options && options.label || input.getAttribute('aria-label') || '';
    board.reset();
    if (typeof background === 'function') background();
    background = isolate(modal);
    modal.hidden = false; paint(); close.focus();
  }
  // bind(input, {label}): a tap (click) on the field opens the pad; typing stays possible.
  function bind(input, options) {
    if (!input) return;
    input.setAttribute('inputmode', 'none'); // no system keyboard over the field: the pad replaces it
    if (!input.getAttribute('aria-label') && options && options.label) input.setAttribute('aria-label', options.label);
    input.addEventListener('click', function () { open(input, options || {}); });
  }
  root.CNCTextKeyboard = { keys: keys, bind: bind, open: open, close: hide, opened: function () { return !!(modal && !modal.hidden); }, state: function () { return { open: !!(modal && !modal.hidden), draft: draft, keys: board ? board.state() : null }; } };
})(window);
