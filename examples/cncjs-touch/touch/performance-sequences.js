/* L2 sequences provider (L0 model v1). No program read, worker or machine API.
 * The single geometry worker feeds ME.createSequenceCollector; its owner publishes
 * update({identity,geometryKey,prepared}) at fresh Idle, after checking its lease.
 * A later-loaded provider borrows the same result from geometry.prepared().
 *
 * L1/L3/L4 attachment API, WITHOUT interpreting an acknowledgement as machining:
 * update({identity,geometryKey,anchor:{source:'reported-position',sourceLine,
 *   ambiguous:false},time:cncV2.time.stamp(...),reportAgeMs,units:'mm',wcs:'G54'}).
 * The caller must supply a unique attachment of the reported position, in original
 * sender numbering (nonempty lines, unchanged by resume). A visual selection or
 * acknowledgement is not such an attachment. Missing/ambiguous/stale -> current
 * and next null. label(null) returns "Séquence indéterminée" for L4.
 * Snapshots contain the exact L0 fields. upcoming() optionally exposes the next
 * known pause/tool change; lookups are O(log n), prepared metadata <=10000 items.
 * Every current Sequence is estimated, never described as physically machined.
 * Its small FR/EN/ES catalogue is registered only when this gated module installs.
 */
(function (root) {
  'use strict';
  var installed = null;
  var MESSAGES = [
    ['Séquence indéterminée','Indeterminate sequence','Secuencia indeterminada'],
    ['Séquence {n}','Sequence {n}','Secuencia {n}'],
    ['Rapide G0','G0 rapid','Rápido G0'],
    ['Pause M0','Pause M0','Pausa M0'],
    ['Pause optionnelle M1','Optional pause M1','Pausa opcional M1'],
    ['Changement d’outil','Tool change','Cambio de herramienta'],
    ['Changement d’outil T{n}','Tool change T{n}','Cambio de herramienta T{n}']
  ];
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function freeze(x) {
    if (!x || typeof x !== 'object' || Object.isFrozen(x)) return x;
    Object.keys(x).forEach(function (key) { freeze(x[key]); }); return Object.freeze(x);
  }
  function label(sequence) {
    var t = root.cncI18n && root.cncI18n.t || function (s) { return s; };
    if (!sequence) return t(MESSAGES[0][0]);
    if (sequence.provenance === 'declared' && sequence.kind === 'group') return sequence.label;
    if (sequence.kind === 'group') return t(MESSAGES[1][0]).replace('{n}', String(sequence.label || '').replace(/^Séquence /, ''));
    var tool = /^Changement d’outil T(\d+)$/.exec(sequence.label || '');
    return tool ? t(MESSAGES[6][0]).replace('{n}', tool[1]) : t(sequence.label || MESSAGES[0][0]);
  }
  function install() {
    var v = root.cncV2;
    if (!v || !v.gate() || !v.register || !v.identity) return null;
    if (installed) return installed;
    if (!v.use('sequences').stub) return v.use('sequences');
    if (root.cncI18n && root.cncI18n.registerCatalog) root.cncI18n.registerCatalog('performance-v2-sequences',MESSAGES);
    if (root.CNCPreviewInspect && root.CNCPreviewInspect.installV2) root.CNCPreviewInspect.installV2();
    var life = v.lifecycle.scope(null, 'sequences'), identity = null, key = null, items = [], events = [], uncertain = [];
    var wcs = null, anchor = null, disposed = false, locked = false, preparedRef = null, published = null;
    function programMatches(id) {
      if (!id || id.role !== 'loaded' || !id.key || !id.jobKey) return false;
      var canonical = v.identity.create(id);
      return canonical.key === id.key && canonical.jobKey === id.jobKey &&
        v.state().programKey === JSON.stringify([id.controller,id.generation,id.revision,id.file,id.fingerprint]);
    }
    function same(id, geometryKey) { return programMatches(id) && identity && identity.jobKey === id.jobKey && key === geometryKey; }
    function uncertainAt(line) {
      for (var a = 0; a < uncertain.length; a++) if (line >= uncertain[a].firstLine && line <= uncertain[a].lastLine) return true;
      return false;
    }
    function currentIndex() {
      if (disposed || locked || root.document.hidden || !v.gate() || !anchor || !same(anchor.identity, anchor.geometryKey) ||
          v.time.freshness(anchor.time, anchor.reportAgeMs) !== 'fresh') return -1;
      var line = anchor.line;
      if (uncertainAt(line)) return -1;
      var lo = 0, hi = items.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (items[mid].firstLine <= line) lo = mid + 1; else hi = mid; }
      var index = lo - 1; return index >= 0 && line <= items[index].lastLine ? index : -1;
    }
    function snapshot() {
      var index = currentIndex();
      return freeze({version:1,available:!!identity,identity:identity,geometryKey:key,
        current:index < 0 ? null : items[index],next:index < 0 || index + 1 >= items.length || uncertainAt(items[index + 1].firstLine) ? null : items[index + 1],items:items});
    }
    function clear() { identity = null; key = null; items = []; events = []; uncertain = []; wcs = null; anchor = null; preparedRef = null; published = null; }
    function publish() {
      var value = snapshot();
      // L0 validates the entire immutable snapshot when notifying. Avoid that walk
      // on ordinary reports whose sequence has not changed; lookups remain bounded.
      if (!disposed && v.gate() && (!published || published.items !== value.items || published.current !== value.current || published.next !== value.next)) {
        published = value; v.notify('sequences');
      }
      return value;
    }
    function prepare(input) {
      if (!life.token() || !programMatches(input.identity) || typeof input.geometryKey !== 'string' || !input.geometryKey) return false;
      var data = input.prepared;
      if (same(input.identity,input.geometryKey) && data === preparedRef) return false;
      if (!data || data.version !== 1 || !Array.isArray(data.items) || data.items.length > 10000 ||
          !Array.isArray(data.ambiguous) || data.ambiguous.length > 128) return false;
      var previous = 0, valid = true;
      data.items.forEach(function (s) {
        if (!s || !finite(s.id) || !finite(s.firstLine) || s.firstLine < 1 || s.firstLine < previous ||
            !finite(s.lastLine) || s.lastLine < s.firstLine || typeof s.label !== 'string' || s.label.length > 100 ||
            ['declared','inferred'].indexOf(s.provenance) < 0 || ['rapid','pause','tool','group'].indexOf(s.kind) < 0 || s.estimated !== true ||
            !(s.durationSeconds === null || finite(s.durationSeconds) && s.durationSeconds >= 0)) valid = false;
        previous = s && s.firstLine;
      });
      data.ambiguous.forEach(function (r) { if (!r || !finite(r.firstLine) || !finite(r.lastLine) || r.firstLine < 1 || r.lastLine < r.firstLine) valid = false; });
      if (!valid) return false;
      identity = v.identity.create(input.identity); key = input.geometryKey; anchor = null; preparedRef = data;
      items = freeze(data.items.map(function (s) { return {id:s.id,firstLine:s.firstLine,lastLine:s.lastLine,label:s.label,
        provenance:s.provenance,kind:s.kind,estimated:true,durationSeconds:s.durationSeconds}; }));
      uncertain = data.ambiguous.map(function (r) { return {firstLine:r.firstLine,lastLine:r.lastLine}; });
      events = items.filter(function (s) { return s.kind === 'pause' || s.kind === 'tool'; });
      var geometry = v.use('geometry').snapshot();
      wcs = data.wcs || (geometry.geometryKey === key && geometry.wcs) || null;
      return true;
    }
    function update(input) {
      if (disposed || !v.gate()) return snapshot(); input = input || {};
      if (input.prepared) { if (prepare(input)) return publish(); return snapshot(); }
      anchor = null;
      var a = input.anchor;
      if (same(input.identity,input.geometryKey) && !locked && !root.document.hidden && a && a.source === 'reported-position' &&
          a.ambiguous === false && finite(a.sourceLine) && a.sourceLine >= 1 && Math.floor(a.sourceLine) === a.sourceLine &&
          input.units === 'mm' && wcs && input.wcs === wcs && v.time.freshness(input.time,input.reportAgeMs) === 'fresh') {
        anchor = {identity:identity,geometryKey:key,line:a.sourceLine,time:input.time,reportAgeMs:input.reportAgeMs};
      }
      return publish();
    }
    function upcoming() {
      if (currentIndex() < 0) return null;
      var lo = 0, hi = events.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (events[mid].firstLine <= anchor.line) lo = mid + 1; else hi = mid; }
      return lo < events.length && !uncertainAt(events[lo].firstLine) ? events[lo] : null;
    }
    function cancel(reason) {
      anchor = null;
      if (reason === 'lock') locked = true;
      if (reason === 'program-changed' || reason === 'pagehide') clear();
    }
    function geometryChanged(e) {
      if (e && (!e.detail || e.detail.slot !== 'geometry')) return;
      var owner = v.use('geometry'); if (owner.prepared) { var data = owner.prepared(); if (data) update(data); }
    }
    function status() { if (identity && !programMatches(identity)) clear(); publish(); }
    function lock(e) { locked = !!e.detail; if (locked) anchor = null; publish(); }
    function dispose() {
      if (disposed) return; disposed = true; clear(); life.dispose(); installed = null;
      root.removeEventListener(v.events.data,geometryChanged); root.removeEventListener('cnc-job-status',status); root.removeEventListener('cnc-screen-lock',lock);
    }
    var provider = {snapshot:snapshot,update:update,cancel:cancel,dispose:dispose,upcoming:upcoming};
    v.register('sequences',provider); installed = provider;
    life.track('cache',clear);
    root.addEventListener(v.events.data,geometryChanged); root.addEventListener('cnc-job-status',status); root.addEventListener('cnc-screen-lock',lock);
    geometryChanged(); return provider;
  }
  var api = {install:install,label:label};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.CNCPerformanceSequences = api; install(); }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
