/* Performance v2, L3: read-only observation model (ES2017, no transport/DOM/timer).
 * Loaded by L0's guarded loader; window.cncV2.use('observation') is the provider.
 *
 * L4 integration:
 *   reset(loadedIdentity) binds the current full L0 jobKey, clears a DIFFERENT job
 *   and is idempotent for the same one. Call explicitly before feeding a new job.
 *   update(facts) consumes the L0 observation shape, not machine/transport objects.
 *   time is the ORIGINAL L0 arrival Stamp; report.ageMs is its report age at that
 *   arrival, not an age recomputed by a presenter. Never restamp a cached packet.
 *   Only matching loaded identity is accepted; old/duplicate stamps cannot revive
 *   reports. Missing numbers remain null. Position uses report.units and report.wcs;
 *   feed is already mm/min. L4 owns conversion from the existing machine snapshot.
 *   acknowledgement.line/total are ORIGINAL source lines (use the existing helper
 *   and resume.total), not sender indexes; accepted never means physically machined.
 *   estimate is supplied, never counted down or computed by reading the program.
 *   snapshot() has EXACTLY the L0 fields, frozen. presentation(language='fr') is a
 *   separate pure view with fresh/stale/estimated/acknowledged/unknown states and
 *   an embedded FR/EN/ES catalogue; it does not add fields to the L0 contract.
 *   No automatic notification: the caller may cncV2.notify('observation'), then
 *   queue its own lifecycle.scope('home','suivi').frame() for all rendering.
 *
 * Curve: chart() returns null while Suivi/document is hidden or locked. Otherwise
 * it returns a frozen {identity,fromMonoMs,toMonoMs,samples,markers,segments}, cached
 * for >=1000 ms; call from L4's RAF and draw only when its reference changes. No
 * timer/RAF is started here. snapshot().samples/markers are the last chart result,
 * not the current report. The current confidence is NEVER throttled with the chart.
 * Visible reports are sampled at most every 250 ms (no averaging); explicit gaps
 * bypass sampling. Raw/published buffers are bounded to 60 s / 240 points / 100
 * markers. segments contain only reported points and never cross a gap. Hiding
 * suspends capture too; return inserts a gap, never backfills hidden observations.
 *
 * L0's markers[] is the input for L4's reported override/pause transitions:
 * {id,kind:'correction'|'pause',identity,time:Stamp,interval:{fromMonoMs,toMonoMs},
 *  value:number|Boolean,source:'report',code,params:{channel,previous}}.
 * correction requires channel feed|rapid|spindle; pause true/false means reported
 * pause/resume. Requested clicks, guessed pauses, absent values are refused. IDs
 * must be stable and unique per source/job; render keys are [source,id].
 * L3 generates kind:'gap', source:'inferred',
 * value:null with its actual monotone interval; gap dates have civilMs:null (no
 * fabricated clock conversion). L6 can use journal.contextFor(marker).
 * Input samples[] is ignored: L3 owns sampling. Marker arrays are bounded on input
 * too (last 100); source data only, no commands or renderer callbacks retained.
 * cancel('program-changed') clears the binding; dispose() is terminal.
 */
(function () {
  'use strict';
  var api = window.cncV2;
  if (!api || !api.gate() || !api.identity || !api.use('observation').stub) return;
  var disposed = false, identity = null, time = null, reportAge = null, reportState = 'unknown';
  var latestArrival = null, available = false;
  var values, acknowledgement, estimate;
  var empty = Object.freeze([]);
  var samples = [], markers = [], cachedChart = null, chartAt = null, serial = 0;
  var lastFeedAt = null, feedValidUntil = null, lastSampleAt = null, openGap = null;
  var active = window.cncShell && window.cncShell.screen ? window.cncShell.screen() : null;
  var locked = !!(window.cncScreenLock && window.cncScreenLock.locked && window.cncScreenLock.locked());
  var suspendedAt = null, visibleSince = now();
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function number(n) { return finite(n) && n >= 0 ? n : null; }
  function integer(n) { return number(n) !== null && Math.floor(n) === n ? n : null; }
  function string(s) { return typeof s === 'string' && s.length ? s : null; }
  function freeze(x) {
    if (!x || typeof x !== 'object' || Object.isFrozen(x)) return x;
    Object.keys(x).forEach(function (k) { freeze(x[k]); });
    return Object.freeze(x);
  }
  function now() { return window.performance && window.performance.now ? number(window.performance.now()) : null; }
  function loaded(input) {
    if (!input || input.role !== 'loaded') return null;
    var id = api.identity.create(input);
    return id.jobKey ? id : null;
  }
  function stamp(input) {
    if (!input) return null;
    return freeze({arrivalMonoMs: number(input.arrivalMonoMs), civilMs: finite(input.civilMs) ? input.civilMs : null,
      server: {value: input.server && finite(input.server.value) ? input.server.value : null,
        source: string(input.server && input.server.source)}});
  }
  function clear() {
    time = null; reportAge = null; reportState = 'unknown'; latestArrival = null; available = false;
    values = freeze({wcs: null, units: null, position: null, feedMmMin: null, spindleS: null});
    acknowledgement = freeze({line: null, total: null, meaning: 'accepted-not-machined'});
    estimate = freeze({seconds: null, source: null, estimated: true, unknowns: []});
    samples = []; markers = []; cachedChart = null; chartAt = null; serial = 0;
    lastFeedAt = null; feedValidUntil = null; lastSampleAt = null; openGap = null;
    suspendedAt = null; visibleSince = now();
  }
  function reset(input) {
    if (disposed || !api.gate()) return snapshot();
    var next = loaded(input);
    if (!identity || !next || identity.jobKey !== next.jobKey) { clear(); identity = next; }
    return snapshot();
  }
  function freshness(at) {
    var computed = api.time.freshness(time, reportAge, at);
    if (computed === 'unknown' || reportState === 'unknown') return 'unknown';
    return reportState === 'stale' ? 'stale' : computed;
  }
  function snapshot() {
    var at = now(), elapsed = api.time.age(time, at);
    return freeze({version: 1, available: available && !disposed && api.gate(), identity: identity, time: time,
      report: Object.assign({freshness: freshness(at), ageMs: reportAge !== null && elapsed !== null ? reportAge + elapsed : null}, values),
      acknowledgement: acknowledgement, estimate: estimate,
      samples: cachedChart ? cachedChart.samples : empty, markers: cachedChart ? cachedChart.markers : empty});
  }
  function update(input) {
    if (disposed || !api.gate() || !input || !identity) return snapshot();
    var id = loaded(input.identity);
    if (!id || id.jobKey !== identity.jobKey) return snapshot();
    var nextTime = stamp(input.time), at = now(), arrival = nextTime && nextTime.arrivalMonoMs;
    var r = input.report || {};
    if (arrival !== null && arrival !== undefined && latestArrival !== null && arrival <= latestArrival) {
      // Repeated facts may revoke confidence, but must never restore it or create
      // a new sample. A delayed older report cannot displace a newer observation.
      if (input.available === false) { available = false; reportState = 'unknown'; }
      if (arrival === latestArrival) {
        if (r.freshness === 'unknown') reportState = 'unknown';
        else if (r.freshness === 'stale' && reportState !== 'unknown') reportState = 'stale';
        if (number(r.ageMs) !== null && reportAge !== null) reportAge = Math.max(reportAge, r.ageMs);
      }
      if (visible() && at !== null && freshness(at) !== 'fresh') { gap(lastFeedAt === null ? at : lastFeedAt, at); prune(at); }
      return snapshot();
    }
    // Future stamps are unknown, not a new high-water mark that could block recovery.
    if (arrival !== null && arrival !== undefined && at !== null && arrival <= at) latestArrival = arrival;
    time = nextTime;
    reportAge = number(r.ageMs);
    reportState = r.freshness === 'fresh' || r.freshness === 'stale' ? r.freshness : 'unknown';
    if (arrival === null || arrival === undefined || at === null || arrival > at) reportState = 'unknown';
    available = input.available === true;
    if (!available) reportState = 'unknown';
    if (freshness(at) === 'fresh') {
      var p = r.position, pos = p && finite(p.x) && finite(p.y) && finite(p.z) ? {x: p.x, y: p.y, z: p.z} : null;
      values = freeze({wcs: string(r.wcs), units: r.units === 'mm' || r.units === 'in' ? r.units : null,
        position: pos, feedMmMin: number(r.feedMmMin), spindleS: number(r.spindleS)});
      var a = input.acknowledgement || {}, total = integer(a.total), line = integer(a.line);
      if (total !== null && line !== null && line > total) line = null;
      acknowledgement = freeze({line: line, total: total, meaning: 'accepted-not-machined'});
    }
    var e = input.estimate || {};
    estimate = freeze({seconds: number(e.seconds), source: string(e.source), estimated: true,
      unknowns: Array.isArray(e.unknowns) ? e.unknowns.slice(0, 100).filter(function (s) { return !!string(s); }) : []});
    if (visible() && at !== null) capture(input, at);
    return snapshot();
  }
  function visible() { return !disposed && api.gate() && active === 'home' && !document.hidden && !locked; }
  function prune(at) {
    var cutoff = at - 60000;
    while (samples.length && (samples[0].atMonoMs < cutoff || samples.length > 240)) samples.shift();
    markers = markers.filter(function (m) { return m.interval.toMonoMs >= cutoff; }).slice(-100);
  }
  function point(at, feed, gap) {
    samples.push(freeze({atMonoMs: at, feedMmMin: feed, gap: gap}));
    if (samples.length > 240) samples.shift();
  }
  function gap(from, to) {
    if (!identity || from === null || to === null || to < from) return;
    if (!openGap) {
      openGap = {id: 'gap:' + (++serial), from: from};
      point(from, null, true);
    }
    var event = freeze({id: openGap.id, kind: 'gap', identity: identity,
      time: {arrivalMonoMs: openGap.from, civilMs: null, server: {value: null, source: null}},
      interval: {fromMonoMs: openGap.from, toMonoMs: to}, value: null, source: 'inferred', code: 'data-gap', params: {}});
    var found = markers.findIndex(function (m) { return m.id === event.id && m.kind === 'gap'; });
    if (found < 0) markers.push(event); else markers[found] = event;
    if (markers.length > 100) markers.shift();
  }
  function resumeGap(at) {
    if (suspendedAt === null) return;
    gap(lastFeedAt === null ? suspendedAt : lastFeedAt, at);
    suspendedAt = null;
  }
  function reportedMarkers(input, at) {
    if (!Array.isArray(input)) return;
    input.slice(-100).forEach(function (m) {
      if (!m || m.source !== 'report' || (m.kind !== 'correction' && m.kind !== 'pause')) return;
      var id = loaded(m.identity), t = stamp(m.time), span = m.interval, params = m.params || {};
      if (!string(m.id) || !id || id.jobKey !== identity.jobKey || !t || number(t.arrivalMonoMs) === null ||
          t.arrivalMonoMs < at - 60000 || t.arrivalMonoMs > at || (visibleSince !== null && t.arrivalMonoMs < visibleSince)) return;
      if (!span || number(span.fromMonoMs) === null || number(span.toMonoMs) === null || span.fromMonoMs > span.toMonoMs ||
          span.fromMonoMs > t.arrivalMonoMs || span.toMonoMs < t.arrivalMonoMs || span.toMonoMs > at) return;
      if (m.kind === 'correction' && (number(m.value) === null || ['feed', 'rapid', 'spindle'].indexOf(params.channel) < 0)) return;
      if (m.kind === 'pause' && typeof m.value !== 'boolean') return;
      if (markers.some(function (old) { return old.source === 'report' && old.id === m.id; })) return;
      markers.push(freeze({id: m.id, kind: m.kind, identity: id, time: t,
        interval: {fromMonoMs: span.fromMonoMs, toMonoMs: span.toMonoMs}, value: m.value, source: 'report',
        code: string(m.code), params: m.kind === 'correction' ? {channel: params.channel, previous: number(params.previous)} : {}}));
      if (markers.length > 100) markers.shift();
    });
  }
  function capture(input, at) {
    resumeGap(at);
    var arrival = time && time.arrivalMonoMs;
    if (arrival === null || arrival === undefined || arrival > at || (visibleSince !== null && arrival < visibleSince) ||
        freshness(at) !== 'fresh' || values.feedMmMin === null) {
      gap(lastFeedAt === null ? at : lastFeedAt, at);
    } else {
      if (feedValidUntil !== null && arrival > feedValidUntil) gap(lastFeedAt, arrival);
      var afterGap = !!openGap;
      if (openGap) { gap(openGap.from, arrival); openGap = null; }
      if (afterGap || lastSampleAt === null || arrival - lastSampleAt >= 250) {
        point(arrival, values.feedMmMin, false); lastSampleAt = arrival;
      }
      lastFeedAt = arrival; feedValidUntil = arrival + 2500 - reportAge;
    }
    reportedMarkers(input.markers, at);
    prune(at);
  }
  function chart() {
    if (!visible()) return null;
    var at = now();
    if (at === null) return null;
    if (chartAt !== null && at - chartAt < 1000) return cachedChart;
    resumeGap(at);
    if (feedValidUntil !== null && at > feedValidUntil) gap(lastFeedAt, at);
    if (openGap) gap(openGap.from, at);
    prune(at);
    var segments = [], current = null;
    samples.forEach(function (sample) {
      if (sample.gap || sample.feedMmMin === null) { current = null; return; }
      if (!current) { current = []; segments.push(current); }
      current.push(sample);
    });
    cachedChart = freeze({identity: identity, fromMonoMs: Math.max(0, at - 60000), toMonoMs: at,
      samples: samples.slice(), markers: markers.slice(), segments: segments});
    chartAt = at;
    return cachedChart;
  }
  function visibilityChanged() {
    if (!visible()) { if (suspendedAt === null) suspendedAt = now(); }
    else visibleSince = now();
  }
  function screen(e) { active = e.detail; visibilityChanged(); }
  function lock(e) { locked = !!e.detail; visibilityChanged(); }
  var messages = freeze([
    ['Rapport frais', 'Fresh report', 'Informe reciente'],
    ['Rapport périmé', 'Stale report', 'Informe caducado'],
    ['Inconnu', 'Unknown', 'Desconocido'],
    ['S rapporté', 'Reported S', 'S informado'],
    ['Acquitté par Grbl', 'Acknowledged by Grbl', 'Confirmado por Grbl'],
    ['Accepté, pas nécessairement usiné', 'Accepted, not necessarily machined', 'Aceptado, no necesariamente mecanizado'],
    ['Temps estimé', 'Estimated time', 'Tiempo estimado'],
    ['Source inconnue', 'Unknown source', 'Origen desconocido']
  ]);
  function presentation(language) {
    var s = snapshot(), index = language === 'en' ? 1 : language === 'es' ? 2 : 0;
    function label(n) { return messages[n][index]; }
    function observed(value) { return {state: value === null ? 'unknown' : s.report.freshness, value: value}; }
    var spindle = observed(s.report.spindleS); spindle.label = label(3);
    return freeze({freshness: {state: s.report.freshness, ageMs: s.report.ageMs,
      label: label(s.report.freshness === 'fresh' ? 0 : s.report.freshness === 'stale' ? 1 : 2)},
      position: observed(s.report.position), feed: observed(s.report.feedMmMin), spindle: spindle,
      acknowledgement: {state: s.acknowledgement.line === null ? 'unknown' : 'acknowledged', line: s.acknowledgement.line,
        total: s.acknowledgement.total, label: label(4), meaning: 'accepted-not-machined', note: label(5)},
      estimate: {state: s.estimate.seconds === null ? 'unknown' : 'estimated', seconds: s.estimate.seconds,
        source: s.estimate.source || label(7), unknowns: s.estimate.unknowns, label: label(6)}});
  }
  function cancel(reason) { if (reason === 'program-changed') { clear(); identity = null; } }
  function dispose() {
    if (disposed) return;
    disposed = true; clear(); identity = null;
    window.removeEventListener('cnc-screen-change', screen);
    window.removeEventListener('cnc-screen-lock', lock);
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
  clear();
  window.addEventListener('cnc-screen-change', screen);
  window.addEventListener('cnc-screen-lock', lock);
  document.addEventListener('visibilitychange', visibilityChanged);
  api.register('observation', {snapshot: snapshot, update: update, reset: reset, presentation: presentation,
    chart: chart, messages: messages, cancel: cancel, dispose: dispose});
})();
