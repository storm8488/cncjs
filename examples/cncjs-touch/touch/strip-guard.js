/*
 * Pause and Arrêter of the status strip stay usable over every overlay (U5 rule, generalised
 * from the confirmation dialog of job-controls.js): a sheet, a dialog, the numeric pad, the
 * coordinate editor or the preview viewer makes the rest of the page inert, but never the
 * strip's Pause / Arrêter, starts below the strip (class t-below-strip, ui-2027.css) and
 * puts them first in its Tab cycle. No confirmation is added in front of them: a tap sends
 * at once (status-strip.js relays to #job-pause / #job-stop).
 *
 *   var restore = CNCStripGuard.isolate(overlay);  // on open
 *   restore();                                     // on close (previous inert values back)
 *   CNCStripGuard.tab(event, overlay);             // in the overlay's keydown handler
 */
(function (root) {
  'use strict';
  var STOPS = ['t-pause', 't-stop'], STRIP = '#real-banner,#simulation-banner';
  function doc() { return root.document; }
  function inStrip(node) { return !!(node && typeof node.closest === 'function' && node.closest(STRIP)); }
  // The strip's Pause / Arrêter, shown or not (they may appear while the overlay is open).
  function kept() { var d = doc(); return STOPS.map(function (id) { return d.getElementById(id); }).filter(inStrip); }
  function usable(n) { return !!n && !n.hidden && !n.disabled && (typeof n.getClientRects !== 'function' || n.getClientRects().length > 0); }
  function stops() { return kept().filter(usable); }
  function contains(a, b) { return !!(a && b && typeof a.contains === 'function' && a.contains(b)); }
  // Everything outside the overlay becomes inert except the kept strip commands: their
  // ancestors (and the overlay's) stay active, every other branch under them is made inert.
  function isolate(overlay) {
    var keep = kept(), entries = [];
    (function walk(children) {
      Array.prototype.forEach.call(children || [], function (node) {
        if (node === overlay || keep.indexOf(node) >= 0 || /^(SCRIPT|LINK|STYLE)$/.test(node.tagName)) return;
        if (contains(node, overlay) || keep.some(function (k) { return contains(node, k); })) { walk(node.children); return; }
        entries.push({ node: node, inert: node.inert }); node.inert = true;
      });
    })(doc().body.children);
    // An overlay opened over another one (the pad over a sheet) was made inert by the first:
    // it and its ancestors are made usable again until it closes.
    for (var n = overlay; n && n !== doc().body; n = n.parentNode) if (n.inert) { entries.push({ node: n, inert: n.inert }); n.inert = false; }
    // Below the strip only when the strip offers its commands (built by status-strip.js).
    if (overlay && overlay.classList) overlay.classList.toggle('t-below-strip', keep.length > 0);
    var done = false;
    return function restore() {
      if (done) return; done = true;
      for (var i = entries.length - 1; i >= 0; i--) entries[i].node.inert = entries[i].inert;
    };
  }
  function focusables(container) {
    return Array.prototype.filter.call(container.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]'), function (n) {
      return !n.disabled && !n.hidden && (typeof n.getClientRects !== 'function' || n.getClientRects().length > 0) && !(typeof n.closest === 'function' && n.closest('[inert]'));
    });
  }
  // One Tab cycle: the strip's Pause / Arrêter when offered, then the overlay's controls.
  function tab(e, container, list) {
    if (!e || e.key !== 'Tab') return false;
    var order = stops().concat(list || focusables(container));
    if (!order.length) return false;
    var at = order.indexOf(doc().activeElement);
    var next = order[at < 0 ? (e.shiftKey ? order.length - 1 : 0) : (at + (e.shiftKey ? order.length - 1 : 1)) % order.length];
    e.preventDefault(); next.focus();
    return true;
  }
  root.CNCStripGuard = { isolate: isolate, tab: tab, stops: stops, kept: kept, focusables: focusables };
})(typeof window === 'object' ? window : this);
