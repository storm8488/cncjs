'use strict';
// The real page (index.html, served on the tablet) has no « check only » mode left: no dry-run arrows
// (dry-motion.js), no local coordinate preparation (coordinate-editor.js, coordinate-plan.js), no
// « VÉRIFICATION SEULE » badge, no « EXPÉRIMENTAL » entry; the Zéro buttons are real (data-origin) and
// the texts of the scripts it loads say what really happens. simulation.html keeps its own modes.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, 'touch');
const read = (n) => fs.readFileSync(path.join(dir, n), 'utf8');
const html = read('index.html');
for (const script of ['dry-motion.js', 'coordinate-editor.js', 'coordinate-plan.js']) assert(!html.includes(script), 'index.html does not load ' + script);
assert(!fs.existsSync(path.join(dir, 'dry-motion.js')), 'dry-motion.js removed');
assert(!/id="dry-tag"/.test(html), 'no « VÉRIFICATION SEULE » badge');
for (const words of ['VÉRIFICATION SEULE', 'à blanc', 'Vitesse du test', 'Origines non activées', 'Aucun déplacement réel', 'sans envoyer de commande', 'EXPÉRIMENTAL'])
  assert(!html.includes(words), 'index.html: no « ' + words + ' »');
// The Zéro buttons of Préparer are real controls driven by real-motion.js (one ticket per button).
const zeros = [...html.matchAll(/<button id="jog-zero-(x|y|z|xyz)"[^>]*\bdata-origin\b[^>]*data-axis="(x|y|z|xyz)"/g)].map((m) => m[1] + '=' + m[2]);
assert.deepEqual(zeros, ['x=x', 'y=y', 'z=z', 'xyz=xyz'], 'Zéro X / Y / Z / XYZ carry their axes');
assert(/data-step="hold" hidden>Continu</.test(html), '« Continu » among the steps, hidden until the server offers it');
assert(/<div class="steps" id="feeds"><\/div>/.test(html), 'the speeds come from the server limits (real-motion.js)');
assert(html.indexOf('real-motion.js') > html.indexOf('touch-shell.js'), 'real-motion.js after touch-shell.js (the actions row exists)');
// The texts the real page's scripts produce: no mode word of the old checks, outside simulation branches.
const MODE_WORDS = /vérification seule|expériment|à blanc|préparer sans mouvement|aucun mouvement envoyé|sans bouger|vitesse du test|préparation locale|palpage réel non activé/i;
const loaded = [...html.matchAll(/<script defer src="([a-z0-9-]+\.js)\?/g)].map((m) => m[1]).filter((n) => !/^i18n-messages/.test(n));
for (const n of ['real-motion.js', 'touch-shell.js', 'interface-guide.js', 'job-preparation.js', 'probe-ui.js', 'commissioning.js']) {
  assert(loaded.includes(n), 'index.html loads ' + n);
  const src = read(n), hits = [...src.matchAll(/\b(?:t|tv2|uiLocale\.t)\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]).filter((p) => MODE_WORDS.test(p));
  // A word of the old modes may only remain in a simulation-only phrase (probe-ui.js, its bench).
  const allowed = { 'probe-ui.js': /^Palpage réel non activé$/ };
  assert.deepEqual(hits.filter((p) => !(allowed[n] && allowed[n].test(p) && /simulation\?[^;]*'Palpage réel non activé'/.test(src))), [], n + ': no mode word of the old checks');
}
// Palpage of the real page (probe-ui.js): no fake launch; profiles and input diagnostic, and the only real probing
// (Z zero with a plate) reached in Suivi, offered only when the server allows it, never for a laser.
{
  const pu = read('probe-ui.js'), real = pu.slice(pu.indexOf("if(!simulation){\n    // Real page: the server's only real probing"));
  assert(pu.indexOf("if(!simulation){\n    // Real page: the server's only real probing") > 0, 'the real-page block of probe-ui.js');
  assert(real.includes("['probe-phase','probe-progress','probe-message','probe-start','probe-stop','probe-result','probe-preparation-open'].forEach(function(id){$(id).hidden=true;})"), 'the bench launch, its progress and results are hidden on the real page');
  assert(real.includes('var can=!!(m&&m.canZeroZ===true)') && real.includes("kind==='laser'") && real.includes("go('home')"), 'Zéro Z avec plaque → Suivi follows canZeroZ, hidden for a laser');
  assert(real.indexOf("uiLocale.t('Sonde : profils et diagnostic')") > 0);
}
// The English and Spanish rows of the texts the page shows (the HTML phrases of Préparer and Machine).
{
  const sandbox = { window: {} };
  ['i18n-messages.js'].concat(fs.readdirSync(dir).filter((n) => /^i18n-messages-[a-z]+\.js$/.test(n))).forEach((n) => vm.runInNewContext(read(n), sandbox));
  const key = (v) => v.trim().replace(/\s+/g, ' ');
  const rows = new Map(sandbox.window.CNCTouchMessages.map((r) => [key(r[0]), r]));
  const jog = html.slice(html.indexOf('<section id="screen-jog"'), html.indexOf('<section id="screen-files"'));
  const machine = html.slice(html.indexOf('<div id="ks-machine-explanation"'), html.indexOf('</section>', html.indexOf('<div id="ks-machine-explanation"')));
  for (const text of [...(jog + machine).matchAll(/>([^<>]*[a-zà-ÿ]{3}[^<>]*)</g)].map((m) => key(m[1])).filter(Boolean)) {
    const r = rows.get(text); assert(r && r[1] && r[2], 'EN / ES row for « ' + text + ' »');
  }
}
console.log('PASS real interface: index.html without dry-run, coordinate preparation, check-only badge or experimental entry; real Zéro buttons and Continu; mode words gone from the real scripts; EN/ES rows of the Préparer and Machine texts.');
