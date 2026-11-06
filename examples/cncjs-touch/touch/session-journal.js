(function (root) {
  'use strict';
  var uiLocale=(typeof window!=='undefined'&&window.cncI18n)||{t:function(s){return s;},html:function(s){return s;}};
  // Store only a small, explicit subset. Never retain a controller response or ticket.
  function clean(value, limit) { return typeof value === 'string' ? value.slice(0, limit) : ''; }
  function monotonic() { var p = root.performance; var n = p && typeof p.now === 'function' ? p.now() : null; return typeof n === 'number' && isFinite(n) && n >= 0 ? n : null; }
  function create(clock) {
    var events = [], sequence = 0, previous, connection, identity, job = null;
    clock = clock || Date.now;
    // Internal only, never in report() (Performance v2, L6): the monotone arrival time and the
    // loaded program known AT the event, captured then; `extra` marks a command state or a loss.
    function add(kind, message, state, extra) {
      var event = { id: ++sequence, time: new Date(clock()).toISOString(), kind: kind, message: message, mono: monotonic(), job: job, extra: extra || null };
      if (state) { event.port = state.port; event.file = state.file; }
      events.unshift(event); if (events.length > 100) events.pop();
    }
    add('session', uiLocale.t('Journal ouvert sur cet appareil.'));
    return {
      connection: function (connected) {
        if (connection === connected) return false;
        connection = connected;
        add('connection', connected ? uiLocale.t('Connexion au serveur CNCjs établie.') : uiLocale.t('Connexion au serveur CNCjs indisponible.'), null, connected ? null : { lost: true });
        return true;
      },
      observe: function (machine) {
        var before = sequence;
        if (!machine || !machine.fresh) {
          if (previous !== null) add('availability', uiLocale.t('État du travail indisponible ou périmé.'), null, { lost: true });
          previous = null;
          return sequence !== before;
        }
        var next = {
          port: clean(machine.port, 96), file: clean(machine.originalName || machine.name, 256),
          name: clean(machine.name, 256), revision: clean(machine.revision, 96),
          state: clean(machine.activeState, 32), workflow: clean(machine.workflow, 32), loading: !!machine.loading
        };
        // Keep only the last fresh identity across observation gaps. A generation
        // change identifies a new CNCjs instance, not necessarily new hardware.
        var generation = clean(machine.generation, 128);
        var changed = identity && identity.port === next.port && identity.generation && generation && identity.generation !== generation;
        // The loaded program of this fresh report (opaque server fingerprint, never inferred
        // from the name); the events below and later losses refer to it.
        var fingerprint = clean(machine.fingerprint, 256), revision = machine.revision;
        job = next.name && fingerprint ? { file: next.name, fingerprint: fingerprint, controller: next.port, generation: generation || null,
          revision: typeof revision === 'string' ? revision.slice(0, 96) : typeof revision === 'number' && isFinite(revision) ? revision : null } : null;
        if (!previous || previous.port !== next.port || changed) {
          add('availability', changed ? uiLocale.t('Nouvelle instance du contrôleur observée sur le même port.') : uiLocale.t('Suivi du contrôleur disponible.'), next); previous = {};
        }
        identity = { port: next.port, generation: generation };
        if (previous.state !== next.state) add('state', uiLocale.t('État du contrôleur : ') + (next.state || uiLocale.t('non précisé')) + '.', next);
        if (next.loading && !previous.loading) add('file', uiLocale.t('Chargement du fichier en cours.'), next);
        if (!next.loading && (previous.loading || previous.name !== next.name || previous.revision !== next.revision)) {
          add('file', next.name ? uiLocale.t('Fichier chargé dans CNCjs.') : uiLocale.t('Aucun fichier chargé dans CNCjs.'), next);
        }
        if (previous.workflow !== next.workflow) {
          var label = { running: uiLocale.t('en cours'), paused: uiLocale.t('en pause'), idle: uiLocale.t('au repos') }[next.workflow] || next.workflow || uiLocale.t('non précisé');
          add('workflow', uiLocale.t('Travail : ') + label + ' (CNCjs).', next);
        }
        previous = next;
        return sequence !== before;
      },
      // Performance v2 only (real-history.js adds it under body.perf-v2): the action feedback
      // already shown by job-controls, kept as sent / confirmed / refused / uncertain.
      command: function (state, message) {
        if (['sent', 'confirmed', 'refused', 'uncertain'].indexOf(state) < 0) return false;
        add('command', clean(message, 300), null, { command: state });
        return true;
      },
      // Newest first, with the internal fields for the v2 journal adapter (copies).
      entries: function () {
        return events.map(function (e) {
          var copy = { id: e.id, time: e.time, kind: e.kind, message: e.message, mono: e.mono, port: e.port || null, file: e.file || null,
            job: e.job ? { file: e.job.file, fingerprint: e.job.fingerprint, controller: e.job.controller, generation: e.job.generation, revision: e.job.revision } : null,
            command: e.extra && e.extra.command || null, lost: !!(e.extra && e.extra.lost) };
          return copy;
        });
      },
      report: function () {
        return { version: 1, mode: 'interface-reelle', language: uiLocale.language || 'fr', exportedAt: new Date(clock()).toISOString(),
          note: uiLocale.t('Événements observés sur cet appareil, 100 maximum. Le rechargement de la page efface le journal. Un retour au repos ne certifie pas la fin des mouvements.'),
          events: events.map(function (event) {
            var copy = { id: event.id, time: event.time, kind: event.kind, message: event.message };
            if (event.port) copy.port = event.port;
            if (event.file) copy.file = event.file;
            return copy;
          }) };
      }
    };
  }
  function text(report) {
    return uiLocale.t('CNC TOUCH — Journal de l’interface réelle') + '\n' + uiLocale.t('Export : ') + report.exportedAt + '\n' + report.note + '\n\n' +
      report.events.map(function (e) { return e.time + ' — ' + e.message + (e.port ? uiLocale.t('\nContrôleur : ') + e.port : '') + (e.file ? uiLocale.t('\nFichier : ') + e.file : ''); }).join('\n\n');
  }
  root.cncSessionJournal = { create: create, text: text };
})(typeof window === 'undefined' ? globalThis : window);
