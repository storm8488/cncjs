// Loading of a program for the touch job service: the file read from the
// watch directory (through the monitor in production) with its fingerprint
// (A5), the resume plan from a line, the travel check of a library file (F2)
// and the load into CNCjs's sender. See job-service.js.
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
// Explicit extensions: examples/cncjs-touch/preview-server.cjs loads this
// module with Node's native ES module loader, outside of Babel.
// eslint-disable-next-line import/extensions
import { buildResume, modalsBeforeFirstMove, programLines } from './resume.js';
// eslint-disable-next-line import/extensions
import { analyzeProgram, checkProgram, codeOf } from './program-check.js';
// eslint-disable-next-line import/extensions
import { fingerprint as fingerprintOfText, sameProgram } from './program-identity.js';

const MAX_FILE_SIZE = 20 * 1048576;

// Words that select or change the work offset; comments are ignored the way
// CNCjs's sender strips them (nested parentheses included, see codeOf). An
// expression may select an offset too (G[54+1]): treated as a change.
export const changesOffset = (gcode) => {
  const code = String(gcode).split('\n').map(codeOf).join('\n');
  return /[[\]]/.test(code) || /(?<![A-Z])G\s*0*(?:5[4-9](?:\.\d)?|10|92(?:\.\d)?)(?![\d.])/i.test(code);
};

// Reads a program from the watch directory without the monitor service (the
// offline preview server loads this module natively, outside of Babel): the
// same guarantees as before, plus the fingerprint of the bytes read.
// Production injects the monitor (`options.files`), see touch/index.js.
export const localFiles = (config) => {
  const fileError = (code, message) => {
    const err = new Error(message);
    err.code = code;
    return err;
  };
  const locate = async (name) => {
    const root = await fs.realpath(config.get('watchDirectory'));
    const file = await fs.realpath(path.join(root, name));
    if (path.dirname(file) !== root) {
      throw fileError('EOUTSIDE', 'File is outside of the watch directory');
    }
    const stats = await fs.stat(file);
    if (!stats.isFile()) {
      throw fileError('ENOTFILE', 'Not a file');
    }
    if (stats.size > MAX_FILE_SIZE) {
      throw fileError('ETOOLARGE', 'File too large');
    }
    return { file, stats };
  };
  const readProgram = async (name) => {
    const { file, stats } = await locate(name);
    if (stats.size === 0) {
      throw fileError('EEMPTY', 'Empty file');
    }
    const buffer = await fs.readFile(file);
    const after = await fs.stat(file);
    if (stats.mtimeMs !== after.mtimeMs || stats.ino !== after.ino || buffer.length !== stats.size) {
      throw fileError('ECHANGED', 'File changed while it was read');
    }
    if (buffer.includes(0)) {
      throw fileError('EBINARY', 'Binary file');
    }
    return { text: buffer.toString('utf8'), fingerprint: fingerprintOfText(buffer), size: stats.size, mtimeMs: stats.mtimeMs };
  };
  const fingerprintOf = async (name) => {
    const { file, stats } = await locate(name);
    const buffer = await fs.readFile(file);
    return { fingerprint: fingerprintOfText(buffer), size: stats.size, mtimeMs: stats.mtimeMs };
  };
  return { readProgram, fingerprintOf };
};

// French message for a file access failure (codes of monitor/index.js).
const FILE_MESSAGES = {
  ENOTCONFIGURED: 'Bibliothèque non configurée (répertoire surveillé absent).',
  EINVALIDNAME: 'Nom de fichier invalide.',
  EOUTSIDE: 'Fichier hors de la bibliothèque.',
  ENOENT: 'Fichier introuvable dans la bibliothèque.',
  ENOTFILE: 'Ce nom ne désigne pas un fichier ordinaire (lien ou dossier refusé).',
  ETOOLARGE: 'Fichier supérieur à 20 Mo.',
  EEMPTY: 'Fichier vide.',
  EBINARY: 'Fichier binaire : format invalide.',
  ECHANGED: 'Fichier modifié pendant la lecture : réessayez.'
};

// deps (from job-service.js):
//   files                   { readProgram(name), fingerprintOf(name) }: the monitor, or localFiles(config)
//   config                  CNCjs configuration (automations)
//   conflict(message)       a 409 error
//   available(c)            connection, fresh report, no host command, or throws
//   idle(c)                 available, at rest, nothing queued, no probe, or throws
//   hasAutomations(config)  CNCjs event automations are enabled
//   record(c)               the service's record of a controller
//   changed()               notifies the stream listeners
//   log(event)              durable job history (F4)
//   jobInfo(job), controllerInfo(c, r)  what the history keeps of a job, a controller
//   machineForCheck(c, r)   what the travel check (F2) needs from the machine now
//   resumeMode(c)           'cnc' or 'laser' from the machine profile, or throws a coded refusal
//                           (laser profile without $32=1, $32=1 without a laser profile)
// Returns { sameFileAsLoaded(job), resumePlan(c, body), checkFile(c, body), load(c, r, body, actor) }.
export const createLoader = (deps) => {
  const {
    files, config, conflict, available, idle, hasAutomations, record, changed, log, jobInfo, controllerInfo, machineForCheck
  } = deps;
  const resumeMode = deps.resumeMode || (() => 'cnc');

  const fileConflict = (err) => {
    const message = err && FILE_MESSAGES[err.code];
    return message ? conflict(message) : err;
  };

  // Reads a program from the watch directory and hands it to the controller.
  // The file must sit directly in the watch directory and must not change
  // while it is read.
  const validName = (file) => {
    if (typeof file !== 'string' || file !== path.basename(file) ||
        /[\\/\0]/.test(file) || !/\.(nc|gcode|ngc|tap|cnc|txt)$/i.test(file)) {
      throw conflict('Nom de fichier invalide.');
    }
  };

  // The exact program and its fingerprint (A5), through the monitor in
  // production (plain file really inside the directory, unchanged while read).
  const readProgram = async (name) => {
    let read;
    try {
      read = await files.readProgram(name);
    } catch (err) {
      throw fileConflict(err);
    }
    // CNCjs % directives execute expressions; this library accepts plain G-code only.
    if (/^[ \t]*%[ \t]*[^\r\n \t]/m.test(read.text)) {
      throw conflict('Les directives CNCjs % ne sont pas acceptées par cette bibliothèque.');
    }
    return read;
  };

  // The file on disk must still be the one that was loaded (A5): a program
  // replaced under the same name since the load is refused at start/resume.
  const sameFileAsLoaded = async (j) => {
    let current;
    try {
      current = await files.fingerprintOf(j.name);
    } catch (err) {
      throw fileConflict(err);
    }
    if (!sameProgram(j.fingerprint, current.fingerprint)) {
      throw conflict('Fichier modifié depuis le chargement : rechargez-le.');
    }
  };

  // What a resume from a line would send, without loading anything. The
  // preview is exactly the preamble the load sends before line `fromLine` of
  // the same file (fingerprint): the tablet draws it, it never recomputes it.
  const resumePlan = async (c, body) => {
    available(c);
    validName(body.file);
    const mode = resumeMode(c);
    const { text: gcode, fingerprint } = await readProgram(body.file);
    const plan = buildResume(gcode, Number(body.line), { name: body.file.replace(/--touch-\d{14}-[a-f0-9]{16}(?=\.[^.]+$)/, ''), mode });
    const summary = { ...plan };
    delete summary.program;
    summary.preview = { version: 1, fingerprint, fromLine: plan.from, preamble: plan.preamble.slice(), kind: plan.mode };
    // The plan the operator saw: "Charger la reprise" of the same file and line
    // must rebuild it from the same program (E9).
    record(c).resumeChecked = { file: body.file, line: Number(body.line), fingerprint };
    return summary;
  };

  // Travel pre-check of any library file against this controller (F2); the
  // loaded job's check is in every snapshot as `programCheck`.
  const checkFile = async (c, body) => {
    validName(body.file);
    const { text, fingerprint } = await readProgram(body.file);
    const r = record(c);
    return { file: body.file, fingerprint, programCheck: checkProgram(analyzeProgram(text), machineForCheck(c, r)) };
  };

  const load = async (c, r, body, actor) => {
    idle(c);
    if (r.loading) {
      throw conflict('Un chargement est déjà en cours.');
    }
    validName(body.file);

    r.loading = true;
    r.ticket = null;
    try {
      const { text: gcode, fingerprint } = await readProgram(body.file);

      // Recheck after asynchronous disk access, before replacing the loaded job.
      idle(c);
      if (hasAutomations(config)) {
        throw conflict('Automatismes CNCjs à vérifier avant chargement.');
      }

      const originalName = body.file.replace(/--touch-\d{14}-[a-f0-9]{16}(?=\.[^.]+$)/, '');
      let program = gcode;
      let resume = null;
      if (body.fromLine !== undefined && body.fromLine !== null) {
        const checked = r.resumeChecked;
        if (checked && checked.file === body.file && checked.line === Number(body.fromLine) && !sameProgram(checked.fingerprint, fingerprint)) {
          throw conflict('Fichier modifié depuis « Vérifier » : vérifiez à nouveau la reprise.');
        }
        const plan = buildResume(gcode, Number(body.fromLine), { name: originalName, mode: resumeMode(c) });
        program = plan.program;
        resume = {
          from: plan.from,
total: plan.total,
line: plan.line,
tool: plan.tool,
toolChanged: plan.toolChanged,
          spindle: plan.spindle,
coolant: plan.coolant,
preambleLength: plan.preamble.length,
notes: plan.notes,
mode: plan.mode
        };
      }
      const revision = crypto.randomBytes(20).toString('hex');
      await new Promise((resolve, reject) => {
        c.command('gcode:load', body.file, program, { touchJob: revision }, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      r.job = {
        revision,
        // Short id for the history (the revision itself is credential-shaped and masked there).
        id: revision.slice(0, 12),
        name: body.file,
        originalName,
        // SHA-256 of the file as loaded (A5): checked again at start/resume.
        fingerprint,
        started: false,
        // G54-G59.x select, G10 L2/L20 and G92 change the work offset.
        changesOffset: changesOffset(resume ? programLines(gcode).slice(resume.from - 1).join('\n') : gcode),
        sets: modalsBeforeFirstMove(program),
        // Travel pre-check (F2) of the program as sent (the rebuilt one for a resume).
        analysis: analyzeProgram(program),
        wcsAtStart: null,
        startActor: null,
        resume
      };
      log({ event: 'load', ...jobInfo(r.job), controller: controllerInfo(c, r), actor: actor || null });
      return { message: resume ? 'Reprise à la ligne ' + resume.from + ' chargée dans CNCjs. Aucun démarrage envoyé.' : 'Fichier chargé dans CNCjs. Aucun démarrage envoyé.' };
    } finally {
      r.loading = false;
      changed();
    }
  };

  return { sameFileAsLoaded, resumePlan, checkFile, load };
};
