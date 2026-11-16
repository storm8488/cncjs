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
  // Coded reasons ({code, params, message}, ETOUCH_CHECK_*) in the interface language when the
  // server sends them; otherwise its French reasons, translated only when they are catalog phrases.
  function reasonsOf(check) {
    var blocking = Array.isArray(check.blocking) ? check.blocking.filter(function (r) { return r && typeof r.message === 'string' && r.message; }) : [];
    if (blocking.length) return blocking.map(function (r) { return uiLocale.format ? uiLocale.format(r.code, r.params, r.message) : msg(r.message); });
    var coded = Array.isArray(check.codedReasons) ? check.codedReasons.filter(function (r) { return r && typeof r === 'object' && typeof r.message === 'string' && r.message; }) : [];
    if (!coded.length || !uiLocale.format) return strings(check.reasons, 8);
    return coded.slice(0, 8).map(function (r) { return uiLocale.format(r.code, r.params, r.message.slice(0, 300)); });
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
    var reasons = reasonsOf(check), scope = typeof check.scope === 'string' ? msg(check.scope.slice(0, 300)) : '';
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
  // D1 uses usable-limit figures; snapshot and HTTP refusals share the code formatter.
  function refusal(machine, operation) {
    var r = machine && machine.refusals && machine.refusals[operation];
    var fallback = machine && machine[operation + 'Reason'] || '';
    var text = r && uiLocale.format ? uiLocale.format(r.code, r.params, fallback) : msg(fallback);
    if (r && r.code === 'ETOUCH_START_OUTSIDE') {
      var check = machine.programCheck;
      var reasons = reasonsOf({ blocking: check && check.blocking && check.blocking.length ? check.blocking : r.reasons });
      if (reasons.length) text += ' ' + reasons.join(' ');
    }
    return text;
  }
  function number(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v) { if(typeof v==='string'&&v.trim())v=Number(v);return number(v) ? String(Math.round(v * 10) / 10).replace('.', uiLocale.language === 'en' ? '.' : ',') : '—'; }
  function fill(s, values) { return t(s).replace(/\{(\w+)\}/g, function (_, k) { return values[k] === undefined ? '—' : values[k]; }); }
  function blocks(check, axis) {
    return (check && Array.isArray(check.blocking) ? check.blocking : []).filter(function (r) {
      return !axis || (r.axis || r.params && r.params.axis || (/TOO_(LOW|HIGH)$/.test(r.code) ? 'Z' : '')) === axis;
    });
  }
  function side(r) {
    var p = r.params || r, axis = r.axis || p.axis || 'Z', sign = r.sign || p.sign;
    return t(axis === 'X' ? sign === '+' ? 'à droite' : 'à gauche' : axis === 'Y' ? sign === '+' ? 'vers le fond' : 'vers l’avant' : r.code === 'ETOUCH_TRAVEL_TOO_HIGH' ? 'trop haut' : 'trop bas');
  }
  function overText(r, file) {
    var p = r.params || r, values = { n: fmt(p.over), cote: side(r) };
    return fill(r.code === 'ETOUCH_TRAVEL_TOO_LOW' ? file ? 'Descend {n} mm trop bas avec le zéro pièce actuel.' : 'descend {n} mm trop bas' : r.code === 'ETOUCH_TRAVEL_TOO_HIGH' ? file ? 'Monte {n} mm trop haut avec le zéro pièce actuel.' : 'monte {n} mm trop haut' : file ? 'Dépasse de {n} mm {cote} avec le zéro pièce actuel.' : 'dépasse de {n} mm {cote}', values);
  }
  function outside(check) { return !!(check && (check.verdict === 'outside' || AXES.some(function (a) { return check.axes && check.axes[a] && check.axes[a].verdict === 'outside'; }))); }
  function fileVerdict(check) {
    if (!check) return { text: t('Contrôle indisponible.'), remedy: 'retry' };
    if (outside(check)) return { text: blocks(check).length ? overText(blocks(check)[0], true) : t('Le fichier dépasse la course de la machine.'), remedy: '' };
    if (describe(check).verdict === 'validated') return { text: t('Tient dans la machine avec le zéro pièce actuel.'), remedy: '' };
    var codes = (check.codedReasons || []).map(function (r) { return r.code; });
    if (codes.indexOf('ETOUCH_CHECK_OFFSET_UNPROVEN') >= 0) return { text: t('Course pas encore vérifiée : la machine vérifie le zéro pièce.'), remedy: '' };
    if (codes.indexOf('ETOUCH_CHECK_NOT_HOMED') >= 0) return { text: t('Course non vérifiée : origine machine pas prise.'), remedy: 'prise-origine' };
    return { text: t('Course non vérifiable pour ce fichier.'), remedy: 'details' };
  }
  function axisLines(check) {
    return AXES.map(function (axis) {
      var a = check && check.axes && check.axes[axis], b = blocks(check, axis), word;
      if (a && a.verdict === 'outside') word = '! ' + (b.length ? b.map(function (r) { return overText(r, false); }).join(' · ') : t('dépasse'));
      else if (a && a.verdict === 'validated') {
        var margin = a.usable && number(a.machineMin) && number(a.machineMax) ? Math.floor(Math.min(a.machineMin - a.usable.low, a.usable.high - a.machineMax)) : null;
        word = '✓ ' + t('tient') + (margin === null ? '' : ' · ' + fill('marge {n} mm', { n: fmt(margin) }));
      } else {
        var why=a&&a.codedReasons&&a.codedReasons[0]||check&&check.codedReasons&&check.codedReasons[0],code=why&&why.code||'';
        word='? '+t('non vérifié')+' · '+t(/OFFSET_UNPROVEN/.test(code)?'Zéro pièce non vérifié':/NOT_HOMED|HOMING_DIRECTION/.test(code)?'Origine machine pas prise':/TRAVEL_UNKNOWN|REPORT_UNITS|HOMING_SETTING/.test(code)?'Relisez les réglages.':code?'Course non vérifiable pour ce fichier.':'Données manquantes.');
      }
      return { axis: axis, verdict: a && a.verdict || 'unknown', text: axis + ' ' + word };
    });
  }
  // SVG strings contain only finite numbers and escaped localised text. They never decide permission.
  function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function drawing(check, plane, coordinates) {
    var top = plane === 'top', axes = check && check.axes || {}, x = axes.X, y = axes.Y, z = axes.Z;
    function known(a) { return !!(a && a.usable && number(a.usable.low) && number(a.usable.high) && a.usable.high > a.usable.low && number(a.machineMin) && number(a.machineMax) && (a.verdict === 'validated' || a.verdict === 'outside')); }
    function label(px, py, s) { return '<text x="' + px + '" y="' + py + '">' + escape(s) + '</text>'; }
    function rect(px, py, w, h, cls) { return '<rect class="' + cls + '" x="' + px + '" y="' + py + '" width="' + Math.max(1, w) + '" height="' + Math.max(1, h) + '"/>'; }
    var ready = top ? known(x) && known(y) : known(z), b = blocks(check), out = '';
    if (!ready) {
      out = rect(45, 70, 310, 260, 'pc-unknown') + label(50, 110, t(check ? 'non vérifié' : 'Aucun fichier chargé.'));
      var a = top ? x : z;
      if (a && number(a.min) && number(a.max)) out += rect(90, 160, 160, 90, 'pc-program') + label(95, 205, fmt(a.max - a.min) + ' mm');
    } else if (top) {
      var xmin = Math.min(x.usable.low, x.machineMin), xmax = Math.max(x.usable.high, x.machineMax), ymin = Math.min(y.usable.low, y.machineMin), ymax = Math.max(y.usable.high, y.machineMax);
      var sx = 300 / Math.max(1, xmax - xmin), sy = 270 / Math.max(1, ymax - ymin), X = function (n) { return 50 + (n - xmin) * sx; }, Y = function (n) { return 340 - (n - ymin) * sy; };
      out = rect(X(x.usable.low), Y(y.usable.high), (x.usable.high - x.usable.low) * sx, (y.usable.high - y.usable.low) * sy, 'pc-travel');
      out += rect(X(x.machineMin), Y(y.machineMax), (x.machineMax - x.machineMin) * sx, (y.machineMax - y.machineMin) * sy, 'pc-program');
      // Hatch only the portions beyond the usable machine rectangle.
      if (x.machineMin < x.usable.low) out += rect(X(x.machineMin), Y(y.machineMax), (Math.min(x.machineMax, x.usable.low) - x.machineMin) * sx, (y.machineMax - y.machineMin) * sy, 'pc-over');
      if (x.machineMax > x.usable.high) out += rect(X(Math.max(x.machineMin, x.usable.high)), Y(y.machineMax), (x.machineMax - Math.max(x.machineMin, x.usable.high)) * sx, (y.machineMax - y.machineMin) * sy, 'pc-over');
      if (y.machineMin < y.usable.low) out += rect(X(x.machineMin), Y(Math.min(y.machineMax, y.usable.low)), (x.machineMax - x.machineMin) * sx, (Math.min(y.machineMax, y.usable.low) - y.machineMin) * sy, 'pc-over');
      if (y.machineMax > y.usable.high) out += rect(X(x.machineMin), Y(y.machineMax), (x.machineMax - x.machineMin) * sx, (y.machineMax - Math.max(y.machineMin, y.usable.high)) * sy, 'pc-over');
      out += label(50, 45, fmt(x.usable.high - x.usable.low) + ' × ' + fmt(y.usable.high - y.usable.low) + ' mm');
      out += label(50, 375, fmt(x.max - x.min) + ' × ' + fmt(y.max - y.min) + ' mm');
      if (number(x.min) && number(y.min)) out += label(X(x.machineMin - x.min), Y(y.machineMin - y.min), '● ' + t('zéro pièce'));
      var m = coordinates && coordinates.mpos,mx=m&&(typeof m.x==='string'&&m.x.trim()?Number(m.x):m.x),my=m&&(typeof m.y==='string'&&m.y.trim()?Number(m.y):m.y);
      if (m && number(mx) && number(my)) out += label(X(mx), Y(my), '+ ' + t('fraise'));
    } else {
      var zero = number(z.min) ? z.machineMin - z.min : null, low = Math.min(z.usable.low, z.machineMin, zero === null ? z.usable.low : zero), high = Math.max(z.usable.high, z.machineMax, zero === null ? z.usable.high : zero), scale = 270 / Math.max(1, high - low), Z = function (n) { return 340 - (n - low) * scale; };
      out = rect(65, Z(z.usable.high), 90, (z.usable.high - z.usable.low) * scale, 'pc-travel') + rect(85, Z(z.machineMax), 50, (z.machineMax - z.machineMin) * scale, 'pc-program');
      if (z.machineMin < z.usable.low) out += rect(85, Z(Math.min(z.machineMax, z.usable.low)), 50, (Math.min(z.machineMax, z.usable.low) - z.machineMin) * scale, 'pc-over');
      if (z.machineMax > z.usable.high) out += rect(85, Z(z.machineMax), 50, (z.machineMax - Math.max(z.machineMin, z.usable.high)) * scale, 'pc-over');
      out += label(170, Z(z.usable.high) + 5, t('haut de la course')) + label(170, Z(z.usable.low) + 5, t('plus bas possible'));
      if (zero !== null) out += '<path class="pc-zero" d="M45 ' + Z(zero) + 'H160"/>' + label(15, Z(zero) - 10, t('zéro Z'));
      out += label(50, 375, fmt(Math.max(0, -(number(z.min) ? z.min : 0))) + ' mm');
    }
    b.filter(function (r) { return top ? (r.axis || r.params && r.params.axis) !== 'Z' && !/TOO_(LOW|HIGH)$/.test(r.code) : /TOO_(LOW|HIGH)$/.test(r.code); }).slice(0, 2).forEach(function (r, i) { out += label(15, 410 + i * 25, overText(r, false)); });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 460" role="img" aria-label="' + escape(t(top ? 'Vue de dessus' : 'Vue de côté')) + '"><defs><pattern id="pc-hatch-' + plane + '" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 8L8 0M6 10L10 6"/></pattern></defs><g data-plane="' + plane + '" data-verified="' + ready + '">' + out + '</g></svg>';
  }
  var api = { describe: describe, show: show, refusal: refusal, blocks: blocks, overText: overText, outside: outside, fileVerdict: fileVerdict, axisLines: axisLines, drawing: drawing, fmt: fmt };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CNCProgramCheckView = api;
})(typeof window === 'object' ? window : this);
