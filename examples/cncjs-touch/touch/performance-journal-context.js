/* CNCjs Touch Performance v2 — L3, read-only journal context for L6.
 *
 * Loaded by L0 only after its gate; uses no DOM, timer, storage or transport.
 *   var journal = window.cncV2.use('journal');
 *   journal.update({identity, interval, civilInterval, events, retained});
 *     Replaces the supplied context/page, never collects or fetches history.
 *     Input and snapshot use the exact L0 journal model (version:1). Missing
 *     values are null. Only a known loaded jobKey can associate an event.
 *     available means a known identity and time window; retained means at least
 *     one retained event matches that window. Both can differ legitimately.
 *   journal.snapshot() -> frozen L0 journal model.
 *   journal.contextFor(marker[, paddingMs=0]) -> NEW, empty L0 model, with the
 *     marker's identity and interval, widened by 0..60000 ms on each side.
 *     Does not select, navigate or mutate. civilInterval stays null: an arrival
 *     stamp cannot map a monotone interval into a civil/server time interval.
 *   journal.filter('all'|'command'|'state'|'connection') -> filtered snapshot;
 *     no mutation. params.category, when known, is authoritative; otherwise the
 *     prefixes command., state., connection. classify an event. Unknown codes
 *     remain in all only. Invalid filters return an empty result.
 *   journal.presentation([model][, language]) -> frozen read-only labels from
 *     the local FR/EN/ES catalogue below; emptyMessage is null when events exist.
 *   journal.cancel('program-changed') clears context; dispose() is terminal.
 *
 * L6 adapter obligations:
 * - Supply the loaded identity and Stamp CAPTURED AT THE EVENT. The old local
 *   journal has only a filename/civil date: do not attach today's fingerprint,
 *   generation, revision or performance.now() to those historical events.
 * - Local device/report/inferred events match interval using arrivalMonoMs
 *   recorded at observation. Server-history fetch arrival is never event time:
 *   source:'server' matches only time.server.value with exactly the same source
 *   as civilInterval.source. For local civil-only queries use source:'device'.
 * - Without a local interval, local civil dates may be selected explicitly;
 *   there is no estimated offset between clocks. A supplied monotone interval
 *   takes precedence for local events, even when their monotone time is absent.
 * - Pass retained:true only for an actually retained, bounded supplied page.
 *   At most 100 matching events are kept. Events within each clock are sorted;
 *   incomparable clock groups keep first-seen order, never false cross-clock
 *   chronology. The cap keeps later groups first, then the newest entries within
 *   each group; this is NOT recency across clocks. L6 should label/group sources
 *   separately, and paginate each source on demand instead of passing all history.
 * - Read server pages only on demand and cancel stale requests in L6's scope.
 *   Updates/filters do no rendering; L6 draws in its lifecycle.scope().frame().
 *   Call cncV2.notify('journal') if other presenters need the resulting model.
 * - No replay/send/action callback exists. Sent, confirmed, refused and uncertain
 *   stay distinct. Confirmation does not establish physical machine execution.
 */
(function () {
  'use strict';
  var api = window.cncV2;
  if (!api || !api.gate() || !api.identity || !api.use || !api.use('journal').stub) return;

  var LIMIT = 100;
  var CATALOG = {
    fr: {emptyMessage:'Aucun événement conservé', title:'Contexte du journal', readOnlyLabel:'Lecture seule',
      filters:{all:'Tous', command:'Commande', state:'État', connection:'Connexion'},
      states:{sent:'Envoyée', confirmed:'Confirmée', refused:'Refusée', uncertain:'Incertaine'}},
    en: {emptyMessage:'No retained events', title:'Journal context', readOnlyLabel:'Read only',
      filters:{all:'All', command:'Command', state:'State', connection:'Connection'},
      states:{sent:'Sent', confirmed:'Confirmed', refused:'Refused', uncertain:'Uncertain'}},
    es: {emptyMessage:'Ningún evento conservado', title:'Contexto del diario', readOnlyLabel:'Solo lectura',
      filters:{all:'Todos', command:'Orden', state:'Estado', connection:'Conexión'},
      states:{sent:'Enviada', confirmed:'Confirmada', refused:'Rechazada', uncertain:'Incierta'}}
  };
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function number(n) { return finite(n) ? n : null; }
  function text(s) { return typeof s === 'string' && s.length ? s : null; }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function identity(value) {
    return value && value.role === 'loaded' ? api.identity.create(value) : null;
  }
  function interval(value) {
    if (!value || !finite(value.fromMonoMs) || !finite(value.toMonoMs) ||
        value.fromMonoMs < 0 || value.toMonoMs < value.fromMonoMs) return null;
    return {fromMonoMs:value.fromMonoMs, toMonoMs:value.toMonoMs};
  }
  function civilInterval(value) {
    if (!value || !finite(value.fromMs) || !finite(value.toMs) ||
        value.toMs < value.fromMs || !text(value.source)) return null;
    return {fromMs:value.fromMs, toMs:value.toMs, source:value.source};
  }
  function stamp(value) {
    if (!value || typeof value !== 'object') return null;
    var server = value.server || {};
    return {arrivalMonoMs:finite(value.arrivalMonoMs) && value.arrivalMonoMs >= 0 ? value.arrivalMonoMs : null,
      civilMs:number(value.civilMs), server:{value:number(server.value), source:text(server.source)}};
  }
  // Params remain data only, bounded in depth/size; input is never frozen/mutated.
  function data(value, ancestors, depth) {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return number(value);
    if (typeof value === 'string') return value.slice(0, 512);
    if (!value || typeof value !== 'object' || depth > 4 || value.nodeType ||
        value.tagName || ancestors.indexOf(value) >= 0) return null;
    var next = ancestors.concat([value]);
    if (Array.isArray(value)) return value.slice(0, 32).map(function (item) { return data(item, next, depth + 1); });
    var result = {};
    Object.keys(value).slice(0, 32).forEach(function (key) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = data(value[key], next, depth + 1);
    });
    return result;
  }
  function model(id, mono, civil, events) {
    return freeze({version:1, available:!!(id && id.jobKey && (mono || civil)), identity:id,
      interval:mono, civilInterval:civil, events:events, retained:events.length > 0});
  }
  function empty() { return model(null, null, null, []); }
  var current = empty(), disposed = false;

  function event(value, job) {
    if (!value || !(text(value.id) || finite(value.id)) ||
        ['device','server','report','inferred'].indexOf(value.source) < 0 ||
        ['sent','confirmed','refused','uncertain'].indexOf(value.state) < 0) return null;
    var id = identity(value.identity), time = stamp(value.time);
    if (!id || !id.jobKey || id.jobKey !== job.jobKey || !time) return null;
    return {id:value.id, identity:id, time:time, source:value.source, state:value.state,
      code:text(value.code), params:data(value.params || {}, [], 0)};
  }
  function within(value, from, to) { return finite(value) && value >= from && value <= to; }
  function coordinate(entry, mono, civil) {
    var time = entry.time, server = time.server;
    if (entry.source === 'server') {
      if (civil && server.source === civil.source && within(server.value, civil.fromMs, civil.toMs)) {
        return {clock:'server:' + server.source, value:server.value};
      }
      return null;
    }
    if (mono) return within(time.arrivalMonoMs, mono.fromMonoMs, mono.toMonoMs) ?
      {clock:'monotone', value:time.arrivalMonoMs} : null;
    return civil && civil.source === 'device' && within(time.civilMs, civil.fromMs, civil.toMs) ?
      {clock:'device-civil', value:time.civilMs} : null;
  }
  function update(input) {
    if (disposed || !api.gate()) return current;
    var value = input || {}, id = identity(value.identity), mono = interval(value.interval), civil = civilInterval(value.civilInterval);
    var records = [], groups = [], seen = Object.create(null);
    if (id && id.jobKey && (mono || civil) && value.retained === true && Array.isArray(value.events)) {
      value.events.forEach(function (item, index) {
        var entry = event(item, id);
        if (!entry) return;
        var at = coordinate(entry, mono, civil);
        if (!at) return;
        // Event IDs may be local numeric counters or opaque strings. Do not
        // collapse distinct sources whose independently generated IDs coincide.
        var key = JSON.stringify([entry.source, typeof entry.id, entry.id]);
        if (seen[key]) return;
        seen[key] = true;
        var group = groups.indexOf(at.clock);
        if (group < 0) { group = groups.length; groups.push(at.clock); }
        records.push({entry:entry, group:group, at:at.value, index:index});
      });
    }
    records.sort(function (a, b) { return a.group - b.group || a.at - b.at || a.index - b.index; });
    current = model(id, mono, civil, records.slice(-LIMIT).map(function (record) { return record.entry; }));
    return current;
  }
  function category(entry) {
    var known = ['command','state','connection'];
    if (entry.params && known.indexOf(entry.params.category) >= 0) return entry.params.category;
    var prefix = entry.code && entry.code.split('.')[0];
    return known.indexOf(prefix) >= 0 ? prefix : null;
  }
  function filter(kind) {
    if (disposed || !api.gate()) return empty();
    var events = current.events.filter(function (entry) { return kind === 'all' ||
      (['command','state','connection'].indexOf(kind) >= 0 && category(entry) === kind); });
    return model(current.identity, current.interval, current.civilInterval, events);
  }
  function contextFor(marker, paddingMs) {
    if (disposed || !api.gate()) return empty();
    var value = marker || {}, id = identity(value.identity), mono = interval(value.interval);
    var padding = finite(paddingMs) && paddingMs >= 0 ? Math.min(60000, paddingMs) : 0;
    if (mono) mono = {fromMonoMs:Math.max(0, mono.fromMonoMs - padding), toMonoMs:mono.toMonoMs + padding};
    return model(id, mono, null, []);
  }
  function presentation(snapshot, language) {
    var value = snapshot || current, labels = Object.prototype.hasOwnProperty.call(CATALOG, language) ? CATALOG[language] : CATALOG.fr;
    return freeze({readOnly:true, title:labels.title, readOnlyLabel:labels.readOnlyLabel,
      emptyMessage:value && value.retained === true && Array.isArray(value.events) && value.events.length ? null : labels.emptyMessage,
      filters:labels.filters, states:labels.states});
  }
  var provider = {owner:'L3', snapshot:function () { return current; }, update:update,
    contextFor:contextFor, filter:filter, presentation:presentation,
    cancel:function (reason) { if (reason === 'program-changed') current = empty(); },
    dispose:function () { if (disposed) return; disposed = true; current = empty(); }};
  api.register('journal', provider);
})();
