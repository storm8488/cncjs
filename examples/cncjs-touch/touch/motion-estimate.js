/* Motion-based time estimate and a tolerant G-code interpreter shared by the
 * visualisation modules (laser view, segment inspection, resume preview).
 * Pure computation: no controller, network or DOM access. Usable in a page,
 * in a Web Worker (importScripts) and under Node (module.exports).
 *
 * The estimate is a model, not a measurement: straight lengths and arc lengths
 * divided by the programmed feed, no acceleration (a lower bound on short moves),
 * rapids from $110-$112 when known (else marked unknown), G4 dwells counted,
 * M0/M1 pauses, M6 tool changes, G28/G30 returns, probing and frame changes listed
 * as unknowns with their line; nothing is invented for them.
 * Lines are numbered like the CNCjs sender: non-empty lines (the Suivi numbering). */
(function (root) {
  'use strict';
  var MAX_UNKNOWNS = 100, MAX_SAMPLES = 500;

  // Interpreter. onMove(mode, ax, ay, az, bx, by, bz, info): mode 0 rapid, 1 feed, 2/3 arc.
  // info (reused object): line, feed (mm/min or null), inverse (G93), s, spindle ('M3'|'M4'|'M5'|null),
  // lost (start position unknown), arc {cx, cy, sweep, radius, plane} for modes 2/3.
  // onEvent(kind, line, value): 'dwell' (seconds), 'pause' (M0/M1), 'toolchange', 'tool' (T number),
  // 'operation' (name from a comment), 'home' (G28/G30), 'probe', 'machine' (G53), 'frame' (G10/G92),
  // 'code' (unsupported word), 'end' (M2/M30), 'spindle' (M3/M4/M5), 'arc-error'.
  // options.unknownStart: the start position is unknown (a resume preamble runs from wherever the tool is).
  function createInterpreter(onMove, onEvent, options) {
    var x = 0, y = 0, z = 0, absolute = true, unit = 1, motion = null, feed = null, inverse = false, s = null, spindle = null;
    var plane = 17, arcAbsolute = false, comment = false, ended = false, sender = 0, fileLine = 0;
    var lostX = !!(options && options.unknownStart), lostY = lostX, lostZ = lostX;
    var info = { line: 0, feed: null, inverse: false, s: null, spindle: null, lost: false, arc: { cx: 0, cy: 0, sweep: 0, radius: 0, plane: 17 } };
    var w = {}; // words of the current line
    function event(kind, value) { if (onEvent) onEvent(kind, sender, value); }
    function reset() {
      w.g = []; w.m = []; w.X = w.Y = w.Z = w.I = w.J = w.K = w.R = w.P = w.F = w.S = w.T = w.L = null; w.other = null;
    }
    function word(letter, v) {
      if (!isFinite(v)) return;
      switch (letter) {
        case 'G': w.g.push(v); break;
        case 'M': w.m.push(v); break;
        case 'X': case 'Y': case 'Z': case 'I': case 'J': case 'K': case 'R': case 'P': case 'F': case 'S': case 'T': case 'L': w[letter] = v; break;
        case 'N': case 'O': break;
        default: if (w.other === null) w.other = letter;
      }
    }
    function tokenize(clean) {
      var i = 0, n = clean.length, c, letter, start, digits;
      while (i < n) {
        c = clean.charCodeAt(i);
        if (c === 32 || c === 9) { i++; continue; }
        if (c >= 97 && c <= 122) c -= 32;
        if (c < 65 || c > 90) return false;
        letter = String.fromCharCode(c); i++;
        while (i < n && ((c = clean.charCodeAt(i)) === 32 || c === 9)) i++;
        start = i; c = clean.charCodeAt(i);
        if (c === 43 || c === 45) { i++; c = clean.charCodeAt(i); }
        digits = 0;
        while (c >= 48 && c <= 57) { i++; digits++; c = clean.charCodeAt(i); }
        if (c === 46) { i++; c = clean.charCodeAt(i); while (c >= 48 && c <= 57) { i++; digits++; c = clean.charCodeAt(i); } }
        if (!digits) return false;
        word(letter, Number(clean.slice(start, i)));
      }
      return true;
    }
    var OPERATION = /^\s*(?:begin\s+operation|operation|op[ée]ration|op)\s*[:=]\s*(.+?)\s*$/i;
    function commentText(text) {
      var m = OPERATION.exec(text); if (m) event('operation', m[1].slice(0, 60));
      // Explicit CAM declaration, never a guess from a diameter or an arbitrary comment.
      var tool = /^\s*(?:tool|outil|herramienta)\s*[:=]\s*T?\s*(\d+)\s*$/i.exec(text);
      if (tool) event('tool-comment', Number(tool[1]));
    }
    function has(list, v) { for (var i = 0; i < list.length; i++) if (Math.abs(list[i] - v) < 1e-6) return true; return false; }
    function emit(mode, bx, by, bz, arc) {
      info.line = sender; info.feed = feed; info.inverse = inverse; info.s = s; info.spindle = spindle;
      info.lost = lostX || lostY || lostZ;
      if (arc) { info.arc.cx = arc[0]; info.arc.cy = arc[1]; info.arc.sweep = arc[2]; info.arc.radius = arc[3]; info.arc.plane = plane; }
      if (onMove) onMove(mode, x, y, z, bx, by, bz, info);
    }
    // Arc in the active plane: centre and signed sweep (Grbl's mc_arc decision).
    function arcOf(tx, ty, tz) {
      // a/b: the plane's first and second axes; the third is linear.
      var a0, b0, a1, b1, ia, ib;
      if (plane === 17) { a0 = x; b0 = y; a1 = tx; b1 = ty; ia = w.I; ib = w.J; }
      else if (plane === 18) { a0 = z; b0 = x; a1 = tz; b1 = tx; ia = w.K; ib = w.I; }
      else { a0 = y; b0 = z; a1 = ty; b1 = tz; ia = w.J; ib = w.K; }
      var clockwise = motion === 2, ca, cb, radius;
      if (w.R !== null) {
        radius = Math.abs(w.R * unit);
        var da = a1 - a0, db = b1 - b0, chord = Math.sqrt(da * da + db * db);
        if (!chord || !radius || chord > 2 * radius + 1e-6) return null;
        var h = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4)), side = (clockwise ? -1 : 1) * (w.R < 0 ? -1 : 1);
        ca = (a0 + a1) / 2 - side * db * h / chord; cb = (b0 + b1) / 2 + side * da * h / chord;
      } else {
        if (ia === null && ib === null) return null;
        ca = (ia || 0) * unit + (arcAbsolute ? 0 : a0); cb = (ib || 0) * unit + (arcAbsolute ? 0 : b0);
        radius = Math.sqrt((a0 - ca) * (a0 - ca) + (b0 - cb) * (b0 - cb));
        if (!radius) return null;
      }
      var r0 = a0 - ca, r1 = b0 - cb, t0 = a1 - ca, t1 = b1 - cb, sweep = Math.atan2(r0 * t1 - r1 * t0, r0 * t0 + r1 * t1);
      if (clockwise) { if (sweep >= -5e-7) sweep -= 2 * Math.PI; } else if (sweep <= 5e-7) sweep += 2 * Math.PI;
      return [ca, cb, sweep, radius];
    }
    function target(v, axis) {
      if (v === null) return axis;
      return v * unit + (absolute ? 0 : axis);
    }
    function process() {
      var g = w.g, m = w.m, i, home = has(g, 28) || has(g, 30), dwell = has(g, 4);
      if (w.other) event('code', w.other);
      for (i = 0; i < g.length; i++) {
        var v = g[i];
        if (v === 0 || v === 1 || v === 2 || v === 3) motion = v;
        else if (v === 80) motion = null;
        else if (v === 90) { absolute = true; event('distance', 'G90'); } else if (v === 91) { absolute = false; event('distance', 'G91'); }
        else if (Math.abs(v - 91.1) < 1e-6) arcAbsolute = false; else if (Math.abs(v - 90.1) < 1e-6) arcAbsolute = true;
        else if (v === 20) unit = 25.4; else if (v === 21) unit = 1;
        else if (v === 17 || v === 18 || v === 19) plane = v;
        else if (v === 93) inverse = true; else if (v === 94) inverse = false;
        else if (v === 10 || v === 92 || Math.abs(v - 92.1) < 1e-6) event('frame', v);
        else if (v >= 38 && v < 39) event('probe', v);
        else if (v >= 54 && v <= 59 && v === Math.floor(v)) event('wcs', 'G' + v);
        else if (v === 49 || v === 43.1) event('length-offset', 'G' + v);
        else if (v === 4 || v === 28 || v === 30 || v === 53 || v === 40 || v === 61) { /* handled below or no motion */ }
        else event('code', 'G' + v);
      }
      if (w.F !== null) feed = w.F > 0 ? w.F * (inverse ? 1 : unit) : null;
      if (w.S !== null) s = w.S;
      if (w.T !== null) event('tool', w.T);
      for (i = 0; i < m.length; i++) {
        var mv = m[i];
        if (mv === 3 || mv === 4 || mv === 5) { spindle = 'M' + mv; event('spindle', spindle); }
        else if (mv === 0 || mv === 1) event('pause', 'M' + mv);
        else if (mv === 6) event('toolchange', w.T);
        else if (mv === 2 || mv === 30) { ended = true; event('end', 'M' + mv); }
        else if (mv !== 7 && mv !== 8 && mv !== 9) event('mcode', 'M' + mv);
      }
      if (dwell) { event('dwell', w.P !== null && w.P >= 0 ? w.P : null); return; }
      var axisWords = w.X !== null || w.Y !== null || w.Z !== null;
      if (has(g, 10) || has(g, 92)) return; // offsets: no motion, but the frame changed
      if (has(g, 53)) {
        // Machine coordinates: the work position afterwards is unknown to the preview.
        if (axisWords) { event('machine', 53); lostX = lostX || w.X !== null; lostY = lostY || w.Y !== null; lostZ = lostZ || w.Z !== null; }
        return;
      }
      if (home) {
        if (axisWords) { var ix = target(w.X, x), iy = target(w.Y, y), iz = target(w.Z, z); emit(0, ix, iy, iz); x = ix; y = iy; z = iz; }
        event('home', has(g, 28) ? 28 : 30);
        lostX = lostX || !axisWords || w.X !== null; lostY = lostY || !axisWords || w.Y !== null; lostZ = lostZ || !axisWords || w.Z !== null;
        return;
      }
      var probe = false;
      for (i = 0; i < g.length; i++) if (g[i] >= 38 && g[i] < 39) probe = true;
      if (probe) { lostX = lostX || w.X !== null; lostY = lostY || w.Y !== null; lostZ = lostZ || w.Z !== null; return; }
      if (!axisWords && w.I === null && w.J === null && w.K === null && w.R === null) return;
      if (motion === null) { event('code', 'motion'); return; }
      var tx = target(w.X, x), ty = target(w.Y, y), tz = target(w.Z, z);
      if (motion === 2 || motion === 3) {
        var arc = lostX || lostY || lostZ ? null : arcOf(tx, ty, tz);
        if (!arc) { event('arc-error', motion); emit(1, tx, ty, tz); }
        else emit(motion, tx, ty, tz, arc);
      } else emit(motion, tx, ty, tz);
      // An axis given in absolute is known again; a relative move keeps it unknown.
      if (absolute) { if (w.X !== null) lostX = false; if (w.Y !== null) lostY = false; if (w.Z !== null) lostZ = false; }
      x = tx; y = ty; z = tz;
    }
    function line(raw) {
      fileLine++;
      if (raw.trim().length) sender++;
      var clean = '', text = '', i, c;
      if (!comment && raw.indexOf('(') < 0 && raw.indexOf(';') < 0) clean = raw;
      else {
        for (i = 0; i < raw.length; i++) {
          c = raw.charAt(i);
          if (comment) { if (c === ')') { comment = false; commentText(text); text = ''; } else text += c; }
          else if (c === ';') { commentText(raw.slice(i + 1)); break; }
          else if (c === '(') comment = true;
          else clean += c;
        }
        // Grbl ends a comment with the line.
        if (comment) { comment = false; commentText(text); }
      }
      clean = clean.trim();
      if (!clean || clean.charAt(0) === '%') return;
      reset();
      if (!tokenize(clean)) {
        event('syntax', null);
        reset();
        clean.replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi, function (_, letter, n) { word(letter.toUpperCase(), Number(n)); return ''; });
      }
      process();
    }
    return {
      line: line,
      // Feeds a whole text (or a part of it) line by line; CR, LF and CRLF ends.
      text: function (text, from, until) {
        var offset = from || 0, end = until === undefined ? text.length : until;
        while (offset < end) {
          var lf = text.indexOf('\n', offset); if (lf < 0 || lf > end) lf = end;
          var raw = text.slice(offset, lf);
          if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
          line(raw); offset = lf + 1;
        }
        return offset;
      },
      state: function () {
        return { x: x, y: y, z: z, absolute: absolute, unit: unit, motion: motion, feed: feed, inverse: inverse, s: s, spindle: spindle,
          plane: plane, lost: lostX || lostY || lostZ, lostAxes: (lostX ? 'X' : '') + (lostY ? 'Y' : '') + (lostZ ? 'Z' : ''), ended: ended, line: sender, fileLine: fileLine };
      },
      // Restores a state taken with snapshot() (checkpoints of the inspection index).
      snapshot: function () { return [x, y, z, absolute, unit, motion, feed, inverse, s, spindle, plane, arcAbsolute, lostX, lostY, lostZ, ended, sender, fileLine]; },
      restore: function (v) { x = v[0]; y = v[1]; z = v[2]; absolute = v[3]; unit = v[4]; motion = v[5]; feed = v[6]; inverse = v[7]; s = v[8]; spindle = v[9]; plane = v[10]; arcAbsolute = v[11]; lostX = v[12]; lostY = v[13]; lostZ = v[14]; ended = v[15]; sender = v[16]; fileLine = v[17]; }
    };
  }

  // Length of a move (arc: helix length).
  function moveLength(mode, ax, ay, az, bx, by, bz, info) {
    if (mode === 2 || mode === 3) {
      var a = info.arc, planar = Math.abs(a.sweep) * a.radius, lin = a.plane === 17 ? bz - az : a.plane === 18 ? by - ay : bx - ax;
      return Math.sqrt(planar * planar + lin * lin);
    }
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  // Polyline points of an arc (target sagitta in mm, at most 5 degrees and 4096 steps).
  // Calls point(x, y, z); returns the effective sagitta when the step cap limits precision.
  function arcPoints(mode, ax, ay, az, bx, by, bz, info, tolerance, point) {
    var a = info.arc, r = a.radius, tol = tolerance > 0 ? tolerance : 0.02;
    var step = Math.min(Math.PI / 36, 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r))));
    var parts = Math.min(4096, Math.max(1, Math.ceil(Math.abs(a.sweep) / step)));
    var a0, b0, l0, l1;
    if (a.plane === 17) { a0 = ax; b0 = ay; l0 = az; l1 = bz; } else if (a.plane === 18) { a0 = az; b0 = ax; l0 = ay; l1 = by; } else { a0 = ay; b0 = az; l0 = ax; l1 = bx; }
    var start = Math.atan2(b0 - a.cy, a0 - a.cx);
    for (var n = 1; n <= parts; n++) {
      if (n === parts) { point(bx, by, bz); break; }
      var ang = start + a.sweep * n / parts, pa = a.cx + r * Math.cos(ang), pb = a.cy + r * Math.sin(ang), pl = l0 + (l1 - l0) * n / parts;
      if (a.plane === 17) point(pa, pb, pl); else if (a.plane === 18) point(pb, pl, pa); else point(pl, pa, pb);
    }
    // 1 - cos(angle/2) written without cancellation for very small angles.
    var halfChord = Math.sin(Math.abs(a.sweep) / (4 * parts));
    return 2 * r * halfChord * halfChord;
  }

  function round(v, d) { var k = Math.pow(10, d === undefined ? 3 : d); return Math.round(v * k) / k; }

  // V2 metadata collector, attached to the geometry interpreter IN THE IDLE WORKER.
  // No text retained, no second parse, no claim that a sender line has been machined.
  // Original sender numbering (nonempty lines) is also kept after a resume.
  // At most 10000 records; an unsupported construct makes the following attachment
  // indeterminate rather than fabricating an operation or an execution position.
  function createSequenceCollector() {
    var items = [], current = null, operation = null, operationLine = 0, tool = null, declaredTool = null, wcs = null, initialWcs = null;
    var groups = 0, endLine = null, uncertainFrom = null, complete = true, last = 0, absolute = true, seenMove = false;
    function uncertain(line) { uncertainFrom = uncertainFrom === null ? line : Math.min(uncertainFrom, line); }
    function add(kind, line, label, provenance) {
      current = null;
      if (items.length >= 10000) { complete = false; uncertain(line); return null; }
      var previous = items[items.length - 1];
      if (previous && previous.lastLine >= line) uncertain(line);
      current = { id: items.length + 1, firstLine: line, lastLine: line, label: label,
        provenance: provenance, kind: kind, estimated: true, durationSeconds: null };
      items.push(current); return current;
    }
    function move(mode, ax, ay, az, bx, by, bz, info) {
      if (endLine !== null && info.line > endLine) return;
      var line = info.line, kind = mode === 0 ? 'rapid' : 'group'; last = line;
      if (!seenMove && !absolute) uncertain(line); seenMove = true;
      if (info.lost) uncertain(line);
      if (ax === bx && ay === by && az === bz && mode < 2) { if (mode === 0) current = null; return; }
      if (!current || current.kind !== kind) {
        if (kind === 'group') groups++;
        add(kind, line, kind === 'rapid' ? 'Rapide G0' : operation || 'Séquence ' + groups,
          kind === 'group' && operation ? 'declared' : 'inferred');
      } else current.lastLine = line;
    }
    function event(kind, line, value) {
      if (endLine !== null && line > endLine) return; last = line;
      if (kind === 'operation') {
        if (operationLine === line && operation !== value) uncertain(line);
        operation = value; operationLine = line; current = null;
      } else if (kind === 'tool' || kind === 'tool-comment') {
        var number = typeof value === 'number' && isFinite(value) && value >= 0 && value === Math.floor(value) ? value : null;
        if (kind === 'tool') tool = number; else declaredTool = number;
      } else if (kind === 'toolchange') {
        if (tool !== null && declaredTool !== null && tool !== declaredTool) uncertain(line);
        var selectedTool = tool === null ? declaredTool : tool;
        add('tool', line, selectedTool === null ? 'Changement d’outil' : 'Changement d’outil T' + selectedTool, 'declared');
        current = null; declaredTool = null;
      } else if (kind === 'pause') {
        add('pause', line, value === 'M1' ? 'Pause optionnelle M1' : 'Pause M0', 'declared'); current = null;
      } else if (kind === 'wcs') {
        if (wcs && wcs !== value) uncertain(line); wcs = value; if (!initialWcs) initialWcs = value;
      } else if (kind === 'distance') { absolute = value === 'G90';
      } else if (kind === 'end') { endLine = line; }
      else if (['code', 'arc-error', 'home', 'probe', 'machine', 'frame', 'length-offset', 'syntax', 'mcode'].indexOf(kind) >= 0) uncertain(line);
    }
    return { move: move, event: event, finish: function (totalLines) {
      var end = typeof totalLines === 'number' ? totalLines : last;
      return { version: 1, items: items, complete: complete, wcs: initialWcs,
        ambiguous: uncertainFrom === null ? [] : [{ firstLine: uncertainFrom, lastLine: end }] };
    } };
  }
  function createSequences() {
    var collector = createSequenceCollector(), interpreter = createInterpreter(collector.move, collector.event);
    return { line: interpreter.line, text: interpreter.text, finish: function () { return collector.finish(interpreter.state().line); } };
  }
  function sequences(text) { var s = createSequences(); s.text(String(text || '')); return s.finish(); }
  // rates: {x, y, z} in mm/min ($110-$112) or null.
  function createEstimator(options) {
    options = options || {};
    var rates = validRates(options.rates);
    var feedSec = 0, dwellSec = 0, rapidExact = 0, sx = 0, sy = 0, sz = 0, rapidCount = 0, rapidLength = 0, workLength = 0;
    var unknowns = [], unknownCount = 0, seen = {}, lastLine = 0;
    var samples = [], step = 1, nextSample = 1, tools = [], operations = [];
    // Laser summary in the same pass (contract §6): emitting = feed move with M3/M4 on and S > 0.
    var laser = options.laser ? { sMax: 0, hasM4: false, emittingLength: 0, travelLength: 0 } : null, laserSeen = false;
    function unknown(kind, line, once) {
      if (once) { if (seen[kind]) return; seen[kind] = true; }
      unknownCount++;
      if (unknowns.length < MAX_UNKNOWNS) unknowns.push({ kind: kind, line: line });
    }
    function sample(line) {
      if (line < nextSample) return;
      samples.push(line, round(feedSec + dwellSec, 3), round(sx, 3), round(sy, 3), round(sz, 3));
      nextSample = line + step;
      if (samples.length / 5 > MAX_SAMPLES) {
        var kept = [];
        for (var i = 0; i < samples.length; i += 10) kept.push(samples[i], samples[i + 1], samples[i + 2], samples[i + 3], samples[i + 4]);
        samples = kept; step *= 2; nextSample = line + step;
      }
    }
    var interpreter = createInterpreter(function (mode, ax, ay, az, bx, by, bz, info) {
      var length = moveLength(mode, ax, ay, az, bx, by, bz, info);
      if (info.lost) { unknown('position', info.line, false); return; }
      if (laser) { if (mode !== 0 && (info.spindle === 'M3' || info.spindle === 'M4') && info.s > 0) { laser.emittingLength += length; if (info.s > laser.sMax) laser.sMax = info.s; } else laser.travelLength += length; }
      if (!(length > 0)) return;
      if (mode === 0) {
        var dx = Math.abs(bx - ax), dy = Math.abs(by - ay), dz = Math.abs(bz - az);
        sx += dx; sy += dy; sz += dz; rapidCount++; rapidLength += length;
        if (rates) rapidExact += Math.max(dx / rates.x, dy / rates.y, dz / rates.z) * 60;
        return;
      }
      workLength += length;
      if (info.feed === null) { unknown('feed', info.line, true); return; }
      feedSec += info.inverse ? 60 / info.feed : length / info.feed * 60;
    }, function (kind, line, value) {
      lastLine = line;
      if (kind === 'dwell') { if (value === null) unknown('dwell', line); else dwellSec += value; }
      else if (kind === 'pause') unknown(value === 'M1' ? 'optional-pause' : 'pause', line);
      else if (kind === 'toolchange') unknown('toolchange', line);
      else if (kind === 'home' || kind === 'probe' || kind === 'machine' || kind === 'frame') unknown(kind, line);
      else if (kind === 'code' || kind === 'arc-error') unknown(kind === 'code' ? 'code' : 'arc', line, kind === 'code');
      else if (kind === 'tool') { if (!tools.length || tools[tools.length - 1].tool !== value) tools.push({ tool: value, line: line }); }
      else if (kind === 'operation') operations.push({ name: value, line: line });
      else if (kind === 'spindle' && laser && value !== 'M5') { laserSeen = true; if (value === 'M4') laser.hasM4 = true; }
    });
    function line(raw) { interpreter.line(raw); var n = interpreter.state().line; lastLine = n; sample(n); }
    function finish() {
      var st = interpreter.state();
      if (!samples.length || samples[samples.length - 5] !== st.line) samples.push(st.line, round(feedSec + dwellSec, 3), round(sx, 3), round(sy, 3), round(sz, 3));
      if (rapidCount && !rates) unknown('rapid', 0, true);
      var rapidSeconds = rapidCount ? (rates ? round(rapidExact, 1) : null) : 0;
      return { version: 1, model: 'feed-no-acceleration', seconds: round(feedSec + dwellSec + (rapidSeconds || 0), 1), known: unknownCount === 0,
        feedSeconds: round(feedSec, 1), dwellSeconds: round(dwellSec, 1), workLength: round(workLength, 1),
        rapid: { count: rapidCount, length: round(rapidLength, 1), sum: [round(sx, 1), round(sy, 1), round(sz, 1)], seconds: rapidSeconds, rates: rates },
        unknowns: unknowns, unknownCount: unknownCount, lines: st.line, timeline: { step: step, data: samples },
        tools: tools.slice(0, 50), operations: operations.slice(0, 100),
        laser: laser && laserSeen ? { sMax: laser.sMax, hasM4: laser.hasM4, emittingLength: round(laser.emittingLength, 1), travelLength: round(laser.travelLength, 1) } : null };
    }
    return { line: line, text: function (text) { var offset = 0; while (offset < text.length) { var lf = text.indexOf('\n', offset); if (lf < 0) lf = text.length; var raw = text.slice(offset, lf); if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1); line(raw); offset = lf + 1; } }, finish: finish };
  }
  function estimate(text, options) { var e = createEstimator(options); e.text(String(text || '')); return e.finish(); }

  function validRates(r) {
    if (!r) return null;
    var x = Number(r.x), y = Number(r.y), z = Number(r.z);
    return x > 0 && y > 0 && z > 0 && isFinite(x) && isFinite(y) && isFinite(z) ? { x: x, y: y, z: z } : null;
  }
  // $110-$112 from a controller snapshot's settings, or null (then the rapid time stays unknown).
  function ratesFrom(settings) {
    if (!settings || typeof settings !== 'object') return null;
    function n(k) { var v = settings[k]; v = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof v === 'number' && isFinite(v) && v > 0 ? v : null; }
    return validRates({ x: n('$110'), y: n('$111'), z: n('$112') });
  }
  // Rapid duration bounds from the per-axis sums: each rapid lasts max_i(d_i / v_i), so the sum
  // lies between max_i(S_i / v_i) and sum_i(S_i / v_i). Exact when computed with the rates.
  function rapidBounds(sum, rates) {
    if (!rates || !sum) return null;
    var a = sum[0] / rates.x * 60, b = sum[1] / rates.y * 60, c = sum[2] / rates.z * 60;
    return { low: Math.max(a, b, c), high: a + b + c };
  }
  // Total as {low, high, known, unknowns} with the rates known now (or null).
  function total(est, rates) {
    if (!est || est.version !== 1) return null;
    rates = validRates(rates);
    var base = (est.feedSeconds || 0) + (est.dwellSeconds || 0), r = est.rapid || { count: 0 };
    var unknowns = (est.unknowns || []).filter(function (u) { return u.kind !== 'rapid'; });
    var extra = (est.unknownCount || 0) - (est.unknowns || []).length;
    if (!r.count) return { low: base, high: base, rapidKnown: true, known: !unknowns.length && extra <= 0, unknowns: unknowns };
    if (typeof r.seconds === 'number') return { low: base + r.seconds, high: base + r.seconds, rapidKnown: true, known: !unknowns.length && extra <= 0, unknowns: unknowns };
    var b = rapidBounds(r.sum, rates);
    return b ? { low: base + b.low, high: base + b.high, rapidKnown: true, known: !unknowns.length && extra <= 0, unknowns: unknowns }
      : { low: base, high: null, rapidKnown: false, known: false, unknowns: unknowns };
  }
  // Model state at a sender line from the timeline: [knownSeconds, sx, sy, sz] (linear between samples).
  function at(est, line) {
    var d = est && est.timeline && est.timeline.data;
    if (!Array.isArray(d) || d.length < 5) return null;
    var n = d.length / 5, lo = 0, hi = n - 1;
    if (line <= d[0]) return [d[1] * line / Math.max(1, d[0]), d[2] * line / Math.max(1, d[0]), d[3] * line / Math.max(1, d[0]), d[4] * line / Math.max(1, d[0])];
    if (line >= d[(n - 1) * 5]) return [d[(n - 1) * 5 + 1], d[(n - 1) * 5 + 2], d[(n - 1) * 5 + 3], d[(n - 1) * 5 + 4]];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (d[mid * 5] <= line) lo = mid; else hi = mid; }
    var a = lo * 5, b = hi * 5, f = (line - d[a]) / Math.max(1e-9, d[b] - d[a]), out = [];
    for (var k = 1; k < 5; k++) out.push(d[a + k] + (d[b + k] - d[a + k]) * f);
    return out;
  }
  function modelSeconds(state, rates) {
    var b = rapidBounds([state[1], state[2], state[3]], rates);
    return state[0] + (b ? (b.low + b.high) / 2 : 0);
  }
  // Remaining time at an acknowledged sender line, corrected by the observed progress:
  // observed = {activeSeconds, fromLine} (running time since fromLine was acknowledged).
  // The factor (observed / model) is used once 20 s and 5 model seconds were seen, and bounded 0.3-5.
  function remaining(est, rates, line, observed) {
    var t = total(est, rates); if (!t) return null;
    var now = at(est, line), end = at(est, est.lines);
    if (!now || !end) return null;
    rates = validRates(rates);
    var left = Math.max(0, modelSeconds(end, rates) - modelSeconds(now, rates)), factor = 1, corrected = false;
    if (observed && observed.activeSeconds >= 20 && typeof observed.fromLine === 'number') {
      var start = at(est, observed.fromLine), done = start ? modelSeconds(now, rates) - modelSeconds(start, rates) : 0;
      if (done >= 5) { factor = Math.max(0.3, Math.min(5, observed.activeSeconds / done)); corrected = true; }
    }
    return { seconds: left * factor, factor: factor, corrected: corrected, rapidKnown: t.rapidKnown || !(est.rapid && est.rapid.count), known: t.known,
      unknownsAhead: (t.unknowns || []).filter(function (u) { return u.line > line; }) };
  }
  // A sidecar estimate is kept only with the expected shape (older sidecars have none).
  function valid(est) {
    return !!(est && typeof est === 'object' && est.version === 1 && typeof est.seconds === 'number' && isFinite(est.seconds) && typeof est.known === 'boolean' && Array.isArray(est.unknowns));
  }

  var api = { createInterpreter: createInterpreter, createEstimator: createEstimator, estimate: estimate, moveLength: moveLength, arcPoints: arcPoints,
    createSequenceCollector: createSequenceCollector, createSequences: createSequences, sequences: sequences,
    ratesFrom: ratesFrom, rapidBounds: rapidBounds, total: total, at: at, remaining: remaining, valid: valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNCMotionEstimate = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
