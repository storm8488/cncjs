/* Server travel pre-check of the loaded program (F2, `programCheck` of the
 * snapshot and of the start ticket), as the operator reads it: one verdict per
 * axis (validated / outside the travel / unknown) and the server's reasons.
 * It checks the machine travel only: not a collision simulation. Anything
 * missing or malformed reads as unknown, and unknown is never shown green. */
(function (root) {
  'use strict';
  var uiLocale = (typeof window !== 'undefined' && window.cncI18n) || { t: function (s) { return s; } };
  function t(s) { return uiLocale.t(s); }
  function msg(s) { return (uiLocale.message || uiLocale.t)(s); }
  var KNOWN = { validated: true, outside: true, unknown: true };
  var AXES = ['X', 'Y', 'Z'];
  function strings(list, max) {
    return (Array.isArray(list) ? list : []).filter(function (s) { return typeof s === 'string' && s; }).slice(0, max).map(function (s) { return msg(s.slice(0, 300)); });
  }
  // check → {verdict, title, axes: [{axis, verdict, word}], reasons, scope, summary} or null.
  function describe(check) {
    if (!check || typeof check !== 'object') return null;
    var axes = AXES.map(function (axis) {
      var entry = check.axes && check.axes[axis], verdict = entry && KNOWN[entry.verdict] ? entry.verdict : 'unknown';
      return { axis: axis, verdict: verdict, word: verdict === 'validated' ? t('validé') : verdict === 'outside' ? t('hors course') : t('inconnu') };
    });
    // The global verdict never says more than its axes do.
    var verdict = axes.some(function (a) { return a.verdict === 'outside'; }) || check.verdict === 'outside' ? 'outside'
      : check.verdict === 'validated' && axes.every(function (a) { return a.verdict === 'validated'; }) ? 'validated' : 'unknown';
    var title = t('Contrôle des courses (pas une simulation de collisions)') + ' : ' +
      (verdict === 'validated' ? t('dans la course') : verdict === 'outside' ? t('HORS COURSE') : t('non vérifié'));
    var reasons = strings(check.reasons, 8), scope = typeof check.scope === 'string' ? msg(check.scope.slice(0, 300)) : '';
    var line = axes.map(function (a) { return a.axis + ' ' + a.word; }).join(' · ');
    return { verdict: verdict, title: title, axes: axes, reasons: reasons, scope: scope,
      summary: title + ' — ' + line + '.' + (reasons.length ? ' ' + reasons.join(' ') : '') };
  }
  // Writes the check into `node` (heading, one chip per axis, reasons); null hides it.
  function show(node, check, doc) {
    if (!node) return null;
    var d = describe(check);
    if (node.hidden !== !d) node.hidden = !d;
    node.textContent = '';
    if (!d) return null;
    doc = doc || document;
    if (node.getAttribute && node.getAttribute('data-verdict') !== d.verdict) node.setAttribute('data-verdict', d.verdict);
    var head = doc.createElement('p'); head.className = 't-pcheck-title'; head.textContent = d.title; node.appendChild(head);
    var row = doc.createElement('p'); row.className = 't-pcheck-axes';
    d.axes.forEach(function (a) { var chip = doc.createElement('span'); chip.className = 't-pcheck-axis'; chip.setAttribute('data-verdict', a.verdict); chip.textContent = a.axis + ' ' + a.word; row.appendChild(chip); });
    node.appendChild(row);
    var why = doc.createElement('p'); why.className = 't-pcheck-reasons'; why.textContent = d.reasons.join(' ') + (d.scope ? (d.reasons.length ? ' ' : '') + d.scope : '');
    if (why.textContent) node.appendChild(why);
    return d;
  }
  var api = { describe: describe, show: show };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CNCProgramCheckView = api;
})(typeof window === 'object' ? window : this);
