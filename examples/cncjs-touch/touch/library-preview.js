/* Preview only: this module never communicates with a controller. */
(function (root) {
  'use strict';
  var source = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
  var workerURL = source ? source.split(/[?#]/)[0].replace(/[^/]*$/, 'library-preview-worker.js?v=v2q') : 'library-preview-worker.js?v=v2q';
  var generation = 0;
  // Progress lines shown while a file is prepared (cncI18n in the page; unchanged in Node tests).
  function tr(s) { var i = root.cncI18n; return i && typeof i.t === 'function' ? i.t(s) : s; }
  // Floats per drawn segment: x, y, xx, yy, mode, deepest Z of the segment.
  var STRIDE = 6;
  // The 3D path from the worker is kept only if it has the expected shape and a bounded size.
  function validPath(p) {
    return p && typeof p === 'object' && p.version === 1 && typeof p.data === 'string' && p.data.length <= 4 * 1048576 &&
      typeof p.count === 'number' && p.count >= 1 && Array.isArray(p.bounds) && p.bounds.length === 6 ? p : null;
  }
  // segment(x, y, xx, yy, mode, z, zz): each XY segment (the 2D drawing).
  // move(x, y, z, xx, yy, zz, mode, sentLine): each move, Z-only plunges included (the 3D path).
  function scan(text, segment, cancelled, progress, yieldAfterLine, move) {
    return new Promise(function (resolve, reject) {
      var offset = 0, line = 0, x = 0, y = 0, z = 0, absolute = true;
      // A relative (G91) move on an axis whose absolute position was never given starts
      // from wherever the tool is: the drawing still starts at 0, but its placement is unknown.
      var knownX = false, knownY = false, knownZ = false, relativeStart = false, relativeZ = false;
      var unit = 1, motion = null, comment = false, ended = false, count = 0, arcAbsolute = false;
      var bounds = [Infinity, Infinity, -Infinity, -Infinity], zmin = Infinity, zmax = -Infinity;
      // After a G28/G30 return, the position of the axes it moves is unknown to the
      // preview (lost): nothing is drawn until X, Y
      // and Z are all given again in absolute; a relative move on a lost axis is refused.
      // (cutX, cutY, cutZ): the last known point, where the 3D path rejoins the program.
      var lostX = false, lostY = false, lostZ = false, cutX = 0, cutY = 0, cutZ = 0, moved = false;
      // wcs: the work offset the program selects before moving (null: the active one).
      var wcs = null, notes = [], returnNoted = false, wordONoted = false;
      // Progress trail: about a thousand samples of [sent line count, x, y],
      // taken every text.length/1000 characters, with the Z of each sample in
      // trailZ. The line count follows the CNCjs sender (non-empty lines), so a
      // job's acknowledged line count maps onto the trail at run time.
      var trail = [], trailZ = [], sentLines = 0, nextSample = 0, sampleStep = Math.max(1, Math.floor(text.length / 1000));
      function sample() { trail.push(sentLines, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000); trailZ.push(Math.round(z * 1000) / 1000); }
      sample(); // the trail starts at the assumed origin, before any line
      function add(ax, ay, az, bx, by, bz, mode) {
        if (ax === bx && ay === by) {
          if (az === bz) return;
        } else {
          count++;
          bounds[0] = Math.min(bounds[0], ax, bx); bounds[1] = Math.min(bounds[1], ay, by);
          bounds[2] = Math.max(bounds[2], ax, bx); bounds[3] = Math.max(bounds[3], ay, by);
          if (segment) segment(ax, ay, bx, by, mode, az, bz);
        }
        zmin = Math.min(zmin, az, bz); zmax = Math.max(zmax, az, bz);
        if (move) move(ax, ay, az, bx, by, bz, mode, sentLines + 1);
      }
      function arc(xx, yy, zz, hasI, iWord, hasJ, jWord, radiusWord) {
        var clockwise = motion === 2, cx, cy, radius;
        if (radiusWord !== null) {
          if (hasI || hasJ) throw new Error('arc avec R et I/J simultanés');
          radius = Math.abs(radiusWord * unit);
          var dx = xx - x, dy = yy - y, chord = Math.sqrt(dx * dx + dy * dy);
          if (!chord || !radius || chord > 2 * radius + 0.000001) throw new Error('rayon R incompatible avec les extrémités');
          var height = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
          var side = (clockwise ? -1 : 1) * (radiusWord < 0 ? -1 : 1);
          cx = (x + xx) / 2 - side * dy * height / chord;
          cy = (y + yy) / 2 + side * dx * height / chord;
        } else {
          if (!hasI && !hasJ) throw new Error('arc sans centre I/J ni rayon R');
          if (arcAbsolute && (!hasI || !hasJ)) throw new Error('centre absolu : I et J requis');
          cx = (hasI ? iWord : 0) * unit + (arcAbsolute ? 0 : x);
          cy = (hasJ ? jWord : 0) * unit + (arcAbsolute ? 0 : y);
          radius = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          var endRadius = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
          if (!radius || Math.abs(radius - endRadius) > Math.min(0.5, Math.max(0.005, radius * 0.001))) throw new Error('centre I/J incompatible avec les extrémités');
        }
        // Same decision as Grbl's mc_arc: the travel in (-pi, pi], then a full
        // turn added within 5e-7 rad, so an arc ending a hair short is a circle.
        var start = Math.atan2(y - cy, x - cx), tau = 2 * Math.PI;
        var r0 = x - cx, r1 = y - cy, t0 = xx - cx, t1 = yy - cy;
        var angle = Math.atan2(r0 * t1 - r1 * t0, r0 * t0 + r1 * t1);
        if (clockwise) { if (angle >= -5e-7) angle -= tau; }
        else if (angle <= 5e-7) angle += tau;
        // Sagitta <= 0.02 mm and angular step <= 5 degrees.
        var step = Math.min(Math.PI / 36, 2 * Math.acos(Math.max(-1, Math.min(1, 1 - 0.02 / radius))));
        var parts = Math.ceil(Math.abs(angle) / step);
        if (!isFinite(parts) || parts > 8192) throw new Error('arc trop étendu pour cet aperçu');
        // A helix: Z moves linearly with the angle, as in Grbl's mc_arc.
        var px = x, py = y, pz = z;
        for (var n = 1; n <= parts; n++) {
          var a = start + angle * n / parts;
          var qx = n === parts ? xx : cx + radius * Math.cos(a);
          var qy = n === parts ? yy : cy + radius * Math.sin(a);
          var qz = n === parts ? zz : z + (zz - z) * n / parts;
          add(px, py, pz, qx, qy, qz, motion); px = qx; py = qy; pz = qz;
        }
      }
      // Per-line word state, reset by resetLine(). Kept outside read() so the
      // fast tokenizer and the regex fallback share one word() implementation.
      var nx, ny, nz, axis, seenX, seenY, seenZ, seenI, seenJ, seenR, hasI, hasJ, iWord, jWord, radiusWord, finish, dwell, seenP;
      var groupMotion, groupDistance, groupArc, groupUnits, groupWcs, nextWcs, home, seenO;
      function resetLine() {
        nx = null; ny = null; nz = null; axis = false; finish = false; radiusWord = null; dwell = false; seenP = false;
        seenX = seenY = seenZ = seenI = seenJ = seenR = hasI = hasJ = false; iWord = jWord = 0;
        groupMotion = groupDistance = groupArc = groupUnits = groupWcs = false; nextWcs = null; home = null; seenO = false;
      }
      function lose(onX, onY, onZ) {
        if (!lostX && !lostY && !lostZ) { cutX = x; cutY = y; cutZ = z; }
        lostX = lostX || onX; lostY = lostY || onY; lostZ = lostZ || onZ;
      }
      function note(text) { if (notes.length < 6) notes.push(text); }
      function word(letter, v) {
        if (!isFinite(v)) throw new Error('valeur non finie');
        if (letter === 'G') {
          if (v === 0 || v === 1 || v === 2 || v === 3) { if (groupMotion) throw new Error('modes G contradictoires'); groupMotion = true; motion = v; }
          else if (v === 90 || v === 91) { if (groupDistance) throw new Error('modes G contradictoires'); groupDistance = true; absolute = v === 90; }
          // Grbl 1.1 accepts G91.1 only (G90.1 is refused with an error).
          else if (v === 91.1) { if (groupArc) throw new Error('modes G contradictoires'); groupArc = true; arcAbsolute = false; }
          else if (v === 20 || v === 21) { if (groupUnits) throw new Error('modes G contradictoires'); groupUnits = true; unit = v === 20 ? 25.4 : 1; }
          // G4 P… dwell (e.g. spindle spin-up after M3): no motion, the modal state is unchanged.
          else if (v === 4) { if (home !== null) throw new Error('modes G contradictoires'); dwell = true; }
          // G80 cancels the motion mode (no canned cycle in Grbl): axis words then need G0/G1 again.
          else if (v === 80) { if (groupMotion) throw new Error('modes G contradictoires'); groupMotion = true; motion = null; }
          // G28/G30: through the intermediate point of the axis words, then to a stored machine position.
          else if (v === 28 || v === 30) { if (home !== null || dwell) throw new Error('modes G contradictoires'); home = v; }
          else if (v === 54 || v === 55 || v === 56 || v === 57 || v === 58 || v === 59) { if (groupWcs) throw new Error('modes G contradictoires'); groupWcs = true; nextWcs = 'G' + v; }
          else if (v !== 17 && v !== 40 && v !== 49 && v !== 94) throw new Error('G' + v + ' non pris en charge par cet aperçu');
        } else if (letter === 'X') { if (seenX) throw new Error('axe répété'); seenX = true; axis = true; nx = v; }
        else if (letter === 'Y') { if (seenY) throw new Error('axe répété'); seenY = true; axis = true; ny = v; }
        else if (letter === 'Z') { if (seenZ) throw new Error('axe répété'); seenZ = true; axis = true; nz = v; }
        else if (letter === 'I') { if (seenI) throw new Error('paramètre d’arc répété'); seenI = true; hasI = true; iWord = v; }
        else if (letter === 'J') { if (seenJ) throw new Error('paramètre d’arc répété'); seenJ = true; hasJ = true; jWord = v; }
        else if (letter === 'R') { if (seenR) throw new Error('paramètre d’arc répété'); seenR = true; radiusWord = v; }
        else if (letter === 'M') {
          if (v !== 0 && v !== 1 && v !== 2 && v !== 3 && v !== 4 && v !== 5 && v !== 6 && v !== 7 && v !== 8 && v !== 9 && v !== 30) throw new Error('M' + v + ' non pris en charge par cet aperçu');
          if (v === 2 || v === 30) finish = true;
        } else if (letter === 'P') { if (seenP) throw new Error('paramètre P répété'); seenP = true; }
        // A program number (O1000, generic posts): no motion; noted, since Grbl 1.1 has no O word.
        else if (letter === 'O') seenO = true;
        else if (letter !== 'N' && letter !== 'F' && letter !== 'S' && letter !== 'T') throw new Error('mot ' + letter + ' non pris en charge');
      }
      // Hand-written tokenizer for the common case: ASCII letters, each followed
      // by an optional space/tab run and a plain decimal number. Anything else
      // returns false, and the line is re-read by the regex path, which decides
      // exactly as before (modal words are idempotent, so no state leaks).
      function tokenize(clean) {
        var i = 0, n = clean.length, c, letter, start, digits, fraction;
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
          if (c === 46) {
            i++; c = clean.charCodeAt(i); fraction = 0;
            while (c >= 48 && c <= 57) { i++; fraction++; c = clean.charCodeAt(i); }
            if (!digits && !fraction) return false;
          } else if (!digits) return false;
          word(letter, Number(clean.slice(start, i)));
        }
        return true;
      }
      function read(raw) {
        var clean;
        // CNCjs '%' directives (%wait, %X=..., even '% (note)') are refused by the
        // server's load: refuse them here too, rather than after the upload.
        if (!comment && /^[ \t]*%[ \t]*[^ \t\r\n]/.test(raw)) throw new Error('directive CNCjs % non acceptée par la bibliothèque');
        if (!comment && raw.indexOf('(') < 0 && raw.indexOf(';') < 0) clean = raw;
        else {
          clean = '';
          for (var i = 0; i < raw.length; i++) {
            var c = raw.charAt(i);
            if (comment) { if (c === ')') comment = false; else if (c === '(') throw new Error('commentaire imbriqué : CNCjs et l’aperçu ne liraient pas la même ligne'); }
            else if (c === ';') break;
            else if (c === '(') comment = true;
            else clean += c;
          }
        }
        // A comment left open at the end of the line would hide the next lines
        // from the preview while Grbl ends it there: refuse the file instead.
        if (comment) throw new Error('commentaire non fermé');
        clean = clean.trim();
        if (!clean || clean === '%') return;
        // The CNCjs sender sends every line, and Grbl keeps executing after M2/M30.
        if (ended) throw new Error('instructions après M2/M30 : Grbl les exécuterait, l’aperçu ne les montrerait pas');
        resetLine();
        if (!tokenize(clean)) {
          resetLine();
          var residue = clean.replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi, function (_, letter, n) {
            word(letter.toUpperCase(), Number(n));
            return '';
          });
          if (residue.trim()) throw new Error('syntaxe non prise en charge');
        }
        var hasArc = hasI || hasJ || radiusWord !== null;
        if (seenP && !dwell) throw new Error('mot P hors G4 non pris en charge');
        if (dwell && (!seenP || axis || hasArc)) throw new Error('G4 attend seulement P');
        if (hasArc && motion !== 2 && motion !== 3) throw new Error('paramètre d’arc hors mode G2/G3');
        if ((motion === 2 || motion === 3) && home === null && (axis || hasArc) && !seenX && !seenY) throw new Error('arc sans X ni Y (refusé par Grbl, erreur 26)');
        if (seenO && !wordONoted) { wordONoted = true; note('Mot O (ligne ' + line + ') ignoré par l’aperçu ; Grbl 1.1 ne le prend pas en charge (erreur 20 attendue).'); }
        // The work offset first, as Grbl orders a block: this line's move is already in the new one.
        if (nextWcs) {
          if (wcs === null && !moved) wcs = nextWcs;
          // One drawing, one work offset: a change after moving would mix two frames.
          else if (nextWcs !== wcs) throw new Error('changement de repère (' + nextWcs + ') après des déplacements : l’aperçu trace un seul repère');
        }
        if (home !== null) {
          if (hasArc) throw new Error('paramètre d’arc avec G' + home);
          // The intermediate point is a rapid in the current mode (G28 G91 Z0: none), then the named
          // axes (all of them without axis words) go to a machine position the preview does not know.
          if (axis) go(0);
          lose(!axis || nx !== null, !axis || ny !== null, !axis || nz !== null); moved = true;
          if (!returnNoted) { returnNoted = true; note('Retour G' + home + ' (ligne ' + line + ') : position inconnue de l’aperçu, tracé coupé jusqu’à ce que X, Y et Z soient redonnés en absolu.'); }
        } else if (axis || hasArc) {
          if (motion === null) throw new Error('mode G0/G1 non défini');
          go(motion);
        }
        if (finish) ended = true;
      }
      function go(mode) {
        var xx = nx === null ? x : nx * unit + (absolute ? 0 : x);
        var yy = ny === null ? y : ny * unit + (absolute ? 0 : y);
        var zz = nz === null ? z : nz * unit + (absolute ? 0 : z);
        if (nx !== null) { if (absolute) knownX = true; else if (!knownX) relativeStart = true; }
        if (ny !== null) { if (absolute) knownY = true; else if (!knownY) relativeStart = true; }
        // Depths of a program that moves Z relatively before any absolute Z are relative to its start.
        if (nz !== null) { if (absolute) knownZ = true; else if (!knownZ) relativeZ = true; }
        if (!isFinite(xx) || !isFinite(yy) || !isFinite(zz) || Math.abs(xx) > 1e9 || Math.abs(yy) > 1e9 || Math.abs(zz) > 1e9) throw new Error('coordonnées hors plage');
        var lost = lostX || lostY || lostZ;
        if (lost) {
          if (!absolute && (lostX && nx || lostY && ny || lostZ && nz)) throw new Error('déplacement relatif depuis une position inconnue après G28/G30');
          if (mode === 2 || mode === 3) throw new Error('arc depuis une position inconnue après G28/G30');
          if (absolute) { if (nx !== null) lostX = false; if (ny !== null) lostY = false; if (nz !== null) lostZ = false; }
          // Known again: the 3D path rejoins from the last known point with a rapid (the real
          // path through the stored position is unknown); the XY drawing stays cut.
          if (!lostX && !lostY && !lostZ && move && zmin <= zmax) move(cutX, cutY, cutZ, xx, yy, zz, 0, sentLines + 1);
        } else if (mode === 2 || mode === 3) arc(xx, yy, zz, hasI, iWord, hasJ, jWord, radiusWord);
        else add(x, y, z, xx, yy, zz, mode);
        x = xx; y = yy; z = zz; moved = true;
      }
      // Line ends are located with indexOf; each separator position is cached
      // so a file without one of them is not rescanned on every line.
      var nextLf = -1, nextCr = -1;
      function batch() {
        if (cancelled && cancelled()) { reject(new Error('Annulé')); return; }
        var deadline = Date.now() + 8;
        try {
          while (offset < text.length && Date.now() < deadline) {
            var start = offset;
            if (nextLf < start) { nextLf = text.indexOf('\n', start); if (nextLf < 0) nextLf = text.length; }
            if (nextCr < start) { nextCr = text.indexOf('\r', start); if (nextCr < 0) nextCr = text.length; }
            offset = nextLf < nextCr ? nextLf : nextCr;
            if (offset - start > 10001) throw new Error('ligne trop longue');
            var raw = text.slice(start, offset);
            line++; read(raw);
            if (raw.trim().length) sentLines++;
            if (offset >= nextSample) { sample(); nextSample += sampleStep; }
            // A lone CR ends a line for Grbl but not for the CNCjs sender (it splits on LF).
            if (text[offset] === '\r' && text[offset + 1] !== '\n') throw new Error('fin de ligne CR seule : CNCjs et Grbl ne compteraient pas les mêmes lignes');
            if (text[offset++] === '\r' && text[offset] === '\n') offset++;
            // A worker waits for the renderer after a full block. At most one
            // line (8192 arc segments) can be produced before this boundary.
            var waiting = yieldAfterLine && yieldAfterLine();
            if (waiting) {
              if (progress) progress(Math.min(1, offset / (text.length || 1)));
              waiting.then(function () { setTimeout(batch, 0); }, reject);
              return;
            }
          }
          if (progress) progress(Math.min(1, offset / (text.length || 1)));
          if (offset < text.length) { setTimeout(batch, 0); return; }
          if (comment) throw new Error('commentaire non fermé');
          sample();
          resolve({ count: count, bounds: bounds, trail: trail, trailZ: trailZ, lines: sentLines, relativeStart: relativeStart,
            zBounds: zmin <= zmax ? [zmin, zmax] : null, relativeZ: relativeZ, wcs: wcs, returns: returnNoted, notes: notes });
        } catch (error) { reject(new Error('Ligne ' + line + ' : ' + error.message)); }
      }
      setTimeout(batch, 0);
    });
  }
  function toolpath3d() { return root.CNCToolpath3D || null; }
  function validEstimate(e) {
    return e && typeof e === 'object' && e.version === 1 && typeof e.seconds === 'number' && isFinite(e.seconds) && typeof e.known === 'boolean' && Array.isArray(e.unknowns) && e.unknowns.length <= 100 ? e : null;
  }
  function validLaser(l) {
    return l && typeof l === 'object' && typeof l.sMax === 'number' && isFinite(l.sMax) && typeof l.hasM4 === 'boolean' && typeof l.emittingLength === 'number' && typeof l.travelLength === 'number' ? l : null;
  }
  // Reading a stored preview of any version (1: image and trail; 2: depth and path3d; 3: estimate
  // and laser summary). Nothing is assumed for a missing field: `issues` names what the stored
  // data cannot tell (no fingerprint, G28/G30 returns with unknown axes, a relative start,
  // another work offset, decimated geometry), for the views to say so.
  function normalize(meta) {
    var p = meta && meta.preview, out = { version: 0, image: false, trail: false, depth: false, path3d: false, estimate: null, laser: null, issues: [] };
    if (!p || typeof p !== 'object') { out.issues.push('no-preview'); return out; }
    out.image = typeof p.image === 'string' && /^data:image\/png;base64,/.test(p.image);
    out.trail = Array.isArray(p.trail) && p.trail.length >= 6 && p.trail.length % 3 === 0;
    out.depth = Array.isArray(p.zBounds) && p.zBounds.length === 2;
    out.path3d = !!validPath(p.path3d);
    out.estimate = validEstimate(p.estimate);
    out.laser = validLaser(p.laser);
    out.version = typeof p.version === 'number' ? p.version : out.depth || out.path3d ? 2 : 1;
    if (out.version > 3) out.issues.push('newer-version');
    if (!meta.fingerprint) out.issues.push('no-fingerprint');
    var proj = p.projection;
    if (!proj || proj.version !== 1) out.issues.push('no-projection');
    else {
      if (proj.returns) out.issues.push('unknown-frame');
      if (proj.relativeStart) out.issues.push('relative-start');
      if (proj.wcs && proj.wcs !== 'G54') out.issues.push('other-wcs');
    }
    if (out.path3d && p.path3d.decimated) out.issues.push('decimated');
    if (!out.path3d) out.issues.push('no-path3d');
    if (out.version >= 3 && !out.estimate) out.issues.push('no-estimate');
    return out;
  }
  // ---- Export and import of a preview between two servers (file download / upload) ----
  // Only the preview of one program travels, bound to its fingerprint: never machine settings,
  // controller state or a command. Light data only (advanced data is recomputed on demand).
  var EXPORT_FORMAT = 'cncjs-touch-preview', PREVIEW_FIELDS = ['version', 'image', 'thumbnail', 'segments', 'bounds', 'projection', 'trail', 'lines', 'note', 'zBounds', 'trailZ', 'path3d', 'estimate', 'laser'];
  function pick(p) {
    var out = {};
    PREVIEW_FIELDS.forEach(function (k) { if (p && p[k] !== undefined) out[k] = p[k]; });
    return out;
  }
  function exportPreview(meta) {
    if (!meta || !meta.preview || typeof meta.fingerprint !== 'string' || !meta.fingerprint) throw new Error('Aperçu sans empreinte : export impossible.');
    return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), fingerprint: meta.fingerprint,
      originalName: typeof meta.originalName === 'string' ? meta.originalName : '', size: typeof meta.size === 'number' ? meta.size : null, preview: pick(meta.preview) };
  }
  function fp(v) { return String(v || '').toLowerCase().replace(/^sha256:/, ''); }
  // Checks an exported file against the program on this server (its fingerprint, from the server).
  function importPreview(text, fingerprint) {
    if (typeof text !== 'string' || text.length > 8 * 1048576) throw new Error('Fichier d’aperçu trop volumineux.');
    var v; try { v = JSON.parse(text); } catch (_) { throw new Error('Fichier d’aperçu illisible.'); }
    if (!v || v.format !== EXPORT_FORMAT) throw new Error('Ce fichier n’est pas un aperçu CNCjs Touch exporté.');
    if (v.version !== 1) throw new Error('Version d’export non prise en charge.');
    if (!fingerprint || fp(v.fingerprint) !== fp(fingerprint)) throw new Error('Aperçu d’un autre fichier (empreinte différente) : non importé.');
    var p = pick(v.preview);
    if (typeof p.image !== 'string' || p.image.length > 2500000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image)) throw new Error('Image de l’aperçu invalide.');
    if (p.thumbnail !== undefined && (typeof p.thumbnail !== 'string' || p.thumbnail.length > 120000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p.thumbnail))) delete p.thumbnail;
    if (p.path3d !== undefined && !validPath(p.path3d)) delete p.path3d;
    if (p.estimate !== undefined && !validEstimate(p.estimate)) delete p.estimate;
    if (p.laser !== undefined && !validLaser(p.laser)) delete p.laser;
    if (!p.projection || p.projection.version !== 1) throw new Error('Projection de l’aperçu absente : non importé.');
    return p;
  }
  function painter(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    canvas.width = 960; canvas.height = 540;
    var b, scale, ox, oy, zb = null, zmin = 0, depth = null;
    return {
      setup: function (result) {
        if (!result.count) throw new Error('Aucun déplacement XY');
        b = result.bounds; var sx = b[2] - b[0], sy = b[3] - b[1];
        scale = Math.min(880 / (sx || 1), 440 / (sy || 1));
        ox = (960 - sx * scale) / 2; oy = (540 - sy * scale) / 2;
        // Work below Z0 takes the colour of its depth (the deepest end of the segment).
        zb = Array.isArray(result.zBounds) ? result.zBounds : null; zmin = zb ? zb[0] : 0;
        depth = zmin < 0 && toolpath3d() ? toolpath3d().depthColor : null;
        ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, 960, 540); ctx.lineWidth = 1;
      },
      segment: function (x, y, xx, yy, motion, z) {
        ctx.strokeStyle = motion === 0 ? '#657c8f' : depth ? depth(z, zmin) : '#55d6ed';
        ctx.beginPath(); ctx.moveTo(ox + (x - b[0]) * scale, 540 - oy - (y - b[1]) * scale);
        ctx.lineTo(ox + (xx - b[0]) * scale, 540 - oy - (yy - b[1]) * scale); ctx.stroke();
      },
      // Depth legend in the bottom margin (only for a program that goes under Z0).
      finish: function () {
        if (depth && zb) toolpath3d().legend(ctx, 16, 504, zb[0], zb[1], root.cncI18n && root.cncI18n.locale);
      }
    };
  }
  function pathBounds(result) {
    var z = result.zBounds || [0, 0], b = result.bounds;
    return [b[0], b[1], z[0], b[2], b[3], z[1]];
  }
  function render(text, canvas, cancelled, progress, responseBlob) {
    progress = progress || function () {};
    return new Promise(function (resolve, reject) {
      var id = ++generation, worker = null, timer = null, startup = null, drawing = null, reader = null;
      var finished = false, ready = false, fallback = false, output, result, input = 0, sequence = 0, drawn = 0, queue = [], localResume = null, path3d = null;
      var estimate = null, laser = null;
      var lastProgress = '';
      function report(message) { if (!finished && message !== lastProgress) { lastProgress = message; progress(message); } }
      function stopped() { return finished || !!(cancelled && cancelled()); }
      function cleanup() {
        clearInterval(timer); clearTimeout(startup); clearTimeout(drawing);
        if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); worker = null; }
        if (reader && reader.readyState === 1) reader.abort();
        reader = null; queue = [];
        if (localResume) { var resume = localResume; localResume = null; resume(); }
      }
      function finish(error, value) {
        if (finished) return; finished = true; cleanup();
        if (error) reject(error); else resolve(value);
      }
      function check() { if (stopped()) { finish(new Error('Annulé')); return false; } return true; }
      function encoded(image, synchronous) {
        if (!check()) return;
        var value = { image: image, segments: result.count, bounds: result.bounds,
          // wcs: the work offset of the drawing ('G54' when the program selects none, as before);
          // programWcs: the one the program selects (null: the active one), for the travel check.
          projection: {version:1,width:960,height:540,bounds:result.bounds,units:'mm',wcs:result.wcs||'G54',
            programWcs:result.wcs||null,returns:!!result.returns,relativeStart:!!result.relativeStart},
          trail: result.trail, lines: result.lines };
        // The 3D views place the tool in G54 (toolpath-3d.js): none for another work offset.
        var frameG54 = !result.wcs || result.wcs === 'G54', notes = Array.isArray(result.notes) ? result.notes.slice() : [];
        if (!frameG54) notes.unshift('Tracé en coordonnées de travail ' + result.wcs + ', le repère choisi par le programme.');
        if (path3d && !frameG54) { path3d = null; notes.push('Vues 3D non produites hors du repère G54.'); }
        // Depth (version 2 of the preview): Z extent, the Z of each trail sample and the
        // simplified 3D path. Older readers ignore these fields.
        if (Array.isArray(result.zBounds)) value.zBounds = result.zBounds;
        if (Array.isArray(result.trailZ) && result.trailZ.length * 3 === result.trail.length) value.trailZ = result.trailZ;
        if (path3d) value.path3d = path3d;
        // Version 3: motion-based estimate and laser summary (contract §6), both optional.
        value.version = 3;
        if (estimate) value.estimate = estimate;
        if (laser) value.laser = laser;
        var deep = !!(value.zBounds && value.zBounds[0] < 0);
        value.note = 'Projection XY indicative — G1/G2/G3 ' + (deep ? 'cyan au-dessus de Z0, du violet (peu profond) au rouge (le plus profond) sous Z0' : 'bleu') + ', G0 gris. Arcs interpolés à 0,02 mm. Départ supposé X0 Y0' + (result.relativeZ ? ', Z relatif au point de départ' : ' Z0') + ', mm, absolu et centres I/J relatifs. Puissance laser non simulée.' + (notes.length ? ' ' + notes.join(' ') : '') +
            (fallback ? ' Calcul local de secours : réactivité à vérifier sur cet appareil.' : '') +
            (synchronous ? ' Encodage PNG synchrone de secours.' : '');
        finish(null, value);
      }
      function encode() {
        if (!check()) return;
        report(tr('Encodage de l’image PNG…'));
        try {
          output.finish();
          if (typeof canvas.toBlob === 'function' && typeof root.FileReader === 'function') {
            canvas.toBlob(function (blob) {
              if (!check()) return;
              if (!blob) { finish(new Error('Encodage PNG impossible')); return; }
              try {
                reader = new root.FileReader();
                reader.onload = function () { if (check()) encoded(String(reader.result || ''), false); };
                reader.onerror = function () { finish(new Error('Lecture de l’image PNG impossible')); };
                reader.readAsDataURL(blob);
              } catch (error) { finish(error); }
            }, 'image/png');
          } else {
            report(tr('Encodage PNG local synchrone — réactivité non garantie…'));
            drawing = setTimeout(function () {
              drawing = null; if (!check()) return;
              try { encoded(canvas.toDataURL('image/png'), true); } catch (error) { finish(error); }
            }, 0);
          }
        } catch (error) { finish(error); }
      }
      function local(reason) {
        if (!check()) return;
        if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); worker = null; }
        clearTimeout(startup); fallback = true;
        if (responseBlob) {
          // Never parse a large watch/file JSON response on the UI thread.
          // Small responses retain the compatible, explicitly limited fallback.
          if (responseBlob.size > 262144) { finish(new Error('Worker requis pour régénérer cet aperçu volumineux. Utilisez un navigateur compatible sur le PC.')); return; }
          if (typeof root.FileReader !== 'function') { finish(new Error('Lecture du fichier impossible sur ce navigateur')); return; }
          report(tr(reason) + tr(' — lecture locale limitée à 256 Kio, réactivité non garantie.'));
          var blob = responseBlob; responseBlob = null;
          try {
            reader = new root.FileReader();
            reader.onload = function () {
              var raw = reader.result; reader = null;
              if (!check()) return;
              try {
                var value = JSON.parse(raw);
                if (!value || typeof value.data !== 'string') throw new Error('G-code absent');
                text = value.data;
              } catch (_) { finish(new Error('Réponse du serveur illisible.')); return; }
              local(reason);
            };
            reader.onerror = function () { finish(new Error('Lecture de la réponse du serveur impossible')); };
            reader.readAsText(blob, 'UTF-8');
          } catch (error) { finish(error); }
          return;
        }
        report(tr(reason) + tr(' — analyse locale découpée, réactivité non garantie.'));
        scan(text, null, stopped, function (p) { report(tr('Analyse locale du parcours : ') + Math.floor(p * 100) + ' %'); }).then(function (value) {
          if (!check()) return;
          result = value; output.setup(result);
          var data = new Float64Array(2048 * STRIDE), used = 0, T3 = toolpath3d(), builder = T3 ? T3.createBuilder({ bounds: pathBounds(result) }) : null;
          function flush() {
            if (!used) return;
            queue.push({ data: data.subarray(0, used), offset: 0 });
            data = new Float64Array(2048 * STRIDE); used = 0;
            if (drawing === null) drawing = setTimeout(draw, 0);
          }
          function pressure() { return queue.length ? new Promise(function (resolve) { localResume = resolve; }) : null; }
          return scan(text, function (x, y, xx, yy, mode, z, zz) {
            data[used++] = x; data[used++] = y; data[used++] = xx; data[used++] = yy; data[used++] = mode; data[used++] = Math.min(z, zz);
            if (used === data.length) flush();
          }, stopped, null, pressure, builder && builder.move).then(function () {
            if (builder) path3d = builder.finish(result.lines);
            // In the page only for a small text: the estimate is one synchronous pass.
            var ME = root.CNCMotionEstimate;
            if (ME && text.length <= 2 * 1048576) { try { estimate = ME.estimate(text, { laser: true }); laser = estimate.laser; delete estimate.laser; } catch (_) { estimate = laser = null; } }
            flush(); return pressure();
          }).then(encode);
        }).catch(function (error) { finish(error); });
      }
      function sendInput() {
        if (!check()) return;
        if (input === text.length) { worker.postMessage({ type: 'end', id: id }); return; }
        var end = Math.min(text.length, input + 32768), data = new Uint16Array(end - input);
        for (var i = 0; i < data.length; i++) data[i] = text.charCodeAt(input + i);
        var offset = input; input = end;
        worker.postMessage({ type: 'text', id: id, offset: offset, data: data.buffer }, [data.buffer]);
      }
      function draw() {
        drawing = null; if (!check()) return;
        try {
          var start = Date.now(), count = 0;
          while (queue.length && count < 1024 && Date.now() - start < 4) {
            var block = queue[0], a = block.data, j = block.offset;
            output.segment(a[j], a[j + 1], a[j + 2], a[j + 3], a[j + 4], a[j + 5]);
            block.offset += STRIDE; count++; drawn++;
            if (block.offset === a.length) {
              queue.shift();
              if (worker) worker.postMessage({ type: 'ack', id: id, sequence: block.sequence });
            }
          }
          report(tr(fallback ? 'Dessin local du parcours : ' : 'Dessin du parcours : ') + Math.floor(drawn / result.count * 100) + ' %');
          if (queue.length) drawing = setTimeout(draw, 0);
          else if (localResume) { var resume = localResume; localResume = null; resume(); }
        } catch (error) { finish(error); }
      }
      try {
        output = painter(canvas);
        if (responseBlob) {
          if (typeof root.Blob !== 'function' || !(responseBlob instanceof root.Blob) || responseBlob.size > 6 * 20 * 1048576 + 65536) throw new Error('Réponse du serveur invalide ou trop volumineuse');
        } else if (typeof text !== 'string' || text.length > 20 * 1048576) throw new Error('G-code texte : 20 Mo maximum');
        if (!check()) return;
        timer = setInterval(check, 50);
        if (typeof root.Worker !== 'function') { local('Worker indisponible'); return; }
        try { worker = new root.Worker(workerURL); } catch (_) { local('Worker inaccessible'); return; }
        startup = setTimeout(function () { if (!ready) local('Worker sans réponse'); }, 5000);
        worker.onerror = function (event) {
          if (event && event.preventDefault) event.preventDefault();
          if (!ready) local('Worker inaccessible'); else finish(new Error('Calcul de l’aperçu interrompu dans le Worker'));
        };
        worker.onmessageerror = function () { finish(new Error('Réponse du Worker illisible')); };
        worker.onmessage = function (event) {
          if (!check()) return;
          var message = event.data || {};
          try {
            if (message.type === 'ready' && !ready) {
              if (message.version !== 2) { local('Version du Worker incompatible'); return; }
              if (responseBlob && !message.response) { local('Lecture du serveur indisponible dans le Worker'); return; }
              ready = true; clearTimeout(startup);
              report(tr('Préparation du parcours hors interface…'));
              if (responseBlob) {
                // Clone immutable Blob bytes without materializing either the
                // JSON envelope or the G-code string on the UI thread.
                worker.postMessage({ type: 'response', id: id, blob: responseBlob }); responseBlob = null; return;
              }
              worker.postMessage({ type: 'begin', id: id, length: text.length }); return;
            }
            if (!ready || message.id !== id) return;
            if (message.type === 'input') { if (message.offset !== input) throw new Error('Transfert du G-code désynchronisé'); sendInput(); }
            else if (message.type === 'progress') report(tr('Analyse du parcours : ') + Math.floor(message.value * 100) + ' %');
            else if (message.type === 'bounds') { result = message.result; output.setup(result); }
            else if (message.type === 'segments') {
              if (!result || message.sequence !== sequence + 1 || !message.data || message.data.byteLength > 2048 * STRIDE * 8 || !message.data.byteLength || message.data.byteLength % (STRIDE * 8) || queue.length >= 4) throw new Error('Bloc de parcours invalide');
              sequence = message.sequence; queue.push({ sequence: sequence, data: new Float64Array(message.data), offset: 0 });
              if (drawing === null) drawing = setTimeout(draw, 0);
            } else if (message.type === 'done') {
              if (!result || queue.length || drawn !== result.count) throw new Error('Parcours incomplet');
              path3d = validPath(message.path3d);
              estimate = validEstimate(message.estimate); laser = validLaser(message.laser);
              worker.terminate(); worker = null; encode();
            } else if (message.type === 'error') finish(new Error(message.message || 'Aperçu indisponible'));
          } catch (error) { finish(error); }
        };
      } catch (error) { finish(error); }
    });
  }
  // The note and the refusals are composed in French and kept in the sidecar (written once,
  // read on every device): they are translated where they are shown, sentence by sentence,
  // by the patterns below (anything not matched stays as written). Plain text, for textContent.
  var NOTE_TEXT = [
    [/Projection XY indicative — G1\/G2\/G3 cyan au-dessus de Z0, du violet \(peu profond\) au rouge \(le plus profond\) sous Z0, G0 gris\./g,
      'Indicative XY projection — G1/G2/G3 cyan above Z0, from purple (shallow) to red (deepest) below Z0, G0 grey.',
      'Proyección XY indicativa — G1/G2/G3 cian por encima de Z0, del violeta (poco profundo) al rojo (más profundo) bajo Z0, G0 gris.'],
    [/Projection XY indicative — G1\/G2\/G3 bleu, G0 gris\./g, 'Indicative XY projection — G1/G2/G3 blue, G0 grey.', 'Proyección XY indicativa — G1/G2/G3 azul, G0 gris.'],
    [/Arcs interpolés à 0,02 mm\./g, 'Arcs interpolated at 0.02 mm.', 'Arcos interpolados a 0,02 mm.'],
    [/Départ supposé X0 Y0, Z relatif au point de départ, mm, absolu et centres I\/J relatifs\./g,
      'Start assumed at X0 Y0, Z relative to the starting point, mm, absolute, relative I/J centres.',
      'Inicio supuesto en X0 Y0, Z relativo al punto de partida, mm, absoluto y centros I/J relativos.'],
    [/Départ supposé X0 Y0 Z0, mm, absolu et centres I\/J relatifs\./g,
      'Start assumed at X0 Y0 Z0, mm, absolute, relative I/J centres.', 'Inicio supuesto en X0 Y0 Z0, mm, absoluto y centros I/J relativos.'],
    [/Puissance laser non simulée\./g, 'Laser power not simulated.', 'Potencia láser no simulada.'],
    [/Mot O \(ligne (\d+)\) ignoré par l’aperçu ; Grbl 1\.1 ne le prend pas en charge \(erreur 20 attendue\)\./g,
      'O word (line $1) ignored by the preview; Grbl 1.1 does not support it (error 20 expected).',
      'Palabra O (línea $1) ignorada por la vista previa; Grbl 1.1 no la admite (error 20 esperado).'],
    [/Retour G(\d+) \(ligne (\d+)\) : position inconnue de l’aperçu, tracé coupé jusqu’à ce que X, Y et Z soient redonnés en absolu\./g,
      'G$1 return (line $2): position unknown to the preview, drawing cut until X, Y and Z are given again in absolute.',
      'Retorno G$1 (línea $2): posición desconocida para la vista previa, trazado cortado hasta que X, Y y Z se vuelvan a dar en absoluto.'],
    [/Tracé en coordonnées de travail (G5[4-9](?:\.\d)?), le repère choisi par le programme\./g,
      'Drawn in work coordinates $1, the offset chosen by the program.', 'Trazado en coordenadas de trabajo $1, el sistema elegido por el programa.'],
    [/Vues 3D non produites hors du repère G54\./g, '3D views not produced outside the G54 offset.', 'Vistas 3D no generadas fuera del sistema G54.'],
    [/Calcul local de secours : réactivité à vérifier sur cet appareil\./g, 'Local fallback computation: check responsiveness on this device.', 'Cálculo local de respaldo: compruebe la fluidez en este dispositivo.'],
    [/Encodage PNG synchrone de secours\./g, 'Fallback synchronous PNG encoding.', 'Codificación PNG síncrona de respaldo.'],
    [/(\d[\d\s  .,]*) segments\./g, '$1 segments.', '$1 segmentos.'],
    // Refusals (« Ligne n : reason »), among them those added with the G28/G30 and work offset support.
    [/^Ligne (\d+) : /, 'Line $1: ', 'Línea $1: '],
    [/changement de repère \((G5[4-9](?:\.\d)?)\) après des déplacements : l’aperçu trace un seul repère/g,
      'work offset change ($1) after moves: the preview draws a single offset', 'cambio de sistema de coordenadas ($1) tras desplazamientos: la vista previa traza un solo sistema'],
    [/déplacement relatif depuis une position inconnue après G28\/G30/g, 'relative move from an unknown position after G28/G30', 'desplazamiento relativo desde una posición desconocida tras G28/G30'],
    [/arc depuis une position inconnue après G28\/G30/g, 'arc from an unknown position after G28/G30', 'arco desde una posición desconocida tras G28/G30'],
    [/paramètre d’arc avec G(\d+)/g, 'arc parameter with G$1', 'parámetro de arco con G$1'],
    [/arc sans X ni Y \(refusé par Grbl, erreur 26\)/g, 'arc without X or Y (refused by Grbl, error 26)', 'arco sin X ni Y (rechazado por Grbl, error 26)'],
    [/^G(\d+(?:\.\d+)?) non pris en charge par cet aperçu/, 'G$1 not supported by this preview', 'G$1 no admitido por esta vista previa'],
    [/^M(\d+(?:\.\d+)?) non pris en charge par cet aperçu/, 'M$1 not supported by this preview', 'M$1 no admitido por esta vista previa'],
    [/^mot ([A-Z]) non pris en charge/, 'word $1 not supported', 'palabra $1 no admitida'],
    [/^modes G contradictoires$/, 'contradictory G modes', 'modos G contradictorios'],
    [/^axe répété$/, 'repeated axis', 'eje repetido'],
    [/^coordonnées hors plage$/, 'coordinates out of range', 'coordenadas fuera de rango'],
    [/^mode G0\/G1 non défini$/, 'G0/G1 mode not set', 'modo G0/G1 no definido'],
    [/^Aucun déplacement XY$/, 'No XY move', 'Ningún desplazamiento XY']
  ];
  function localize(text, language) {
    var s = String(text == null ? '' : text), col = language === 'en' ? 1 : language === 'es' ? 2 : 0;
    if (!col) return s;
    // A refusal: « Ligne n : » then its reason, matched on its own (patterns anchored on it).
    var line = /^(Ligne \d+ : )([\s\S]*)$/.exec(s);
    if (line) return apply(line[1], col) + apply(line[2], col);
    return apply(s, col);
  }
  function apply(s, col) { NOTE_TEXT.forEach(function (row) { s = s.replace(row[0], row[col]); }); return s; }
  var api = { scan: scan, render: render, localize: localize, normalize: normalize, exportPreview: exportPreview, importPreview: importPreview, validEstimate: validEstimate, validLaser: validLaser,
    renderResponse: function (blob, canvas, cancelled, progress) { return render(null, canvas, cancelled, progress, blob); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNCLibraryPreview = api;
})(typeof window !== 'undefined' ? window : this);
