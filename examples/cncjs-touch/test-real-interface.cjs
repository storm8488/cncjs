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
assert.deepEqual([...html.matchAll(/data-step="([0-9.]+)"/g)].map((m) => m[1]), ['0.1', '1', '10', '25', '50', '100'], 'steps 0.1 / 1 / 10 / 25 / 50 / 100 mm (the server accepts the same list)');
assert(/data-step="hold"[^>]*>Continu</.test(html), '« Continu » among the steps, always visible, disabled by server permission');
assert(/<div class="steps" id="feeds"[^>]*><\/div>/.test(html), 'the speeds come from the server limits (real-motion.js)');
assert(html.indexOf('real-motion.js') > html.indexOf('touch-shell.js'), 'real-motion.js after touch-shell.js (the actions row exists)');
// The texts the real page's scripts produce: no mode word of the old checks, outside simulation branches.
const MODE_WORDS = /vérification seule|expériment|à blanc|préparer sans mouvement|aucun mouvement envoyé|sans bouger|vitesse du test|préparation locale|palpage réel non activé/i;
const loaded = [...html.matchAll(/<script defer src="([a-z0-9-]+\.js)\?/g)].map((m) => m[1]).filter((n) => !/^i18n-messages/.test(n));
for (const n of ['real-motion.js', 'touch-shell.js', 'interface-guide.js', 'check-screen.js', 'zero-piece.js', 'commissioning.js']) {
  assert(loaded.includes(n), 'index.html loads ' + n);
  const src = read(n), hits = [...src.matchAll(/\b(?:t|tv2|uiLocale\.t)\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]).filter((p) => MODE_WORDS.test(p));
  assert.deepEqual(hits, [], n + ': no mode word of the old checks');
}
// The real page loads only the work-zero owner; the virtual bench is simulation-only.
{
 const pu=read('probe-ui.js'),real=read('zero-piece.js');
 assert(pu.includes('if(!model||!simulation)return;'));
 assert(!pu.includes('function realLaunch'));
 assert(!html.includes('probe-ui.js')&&!html.includes('probe-preparation.js'));
 assert(/prepare\('blockProbe',real.request/.test(real));
 assert(real.includes("prepare('zeroZ',plate)"));
 assert(!real.includes('engine.start'));
 assert(!real.includes('screen-probe'));
 assert(html.indexOf('probe-real.js?v=')>0&&html.indexOf('probe-real.js?v=')<html.indexOf('zero-piece.js?v='));
 const model=require('./touch/probe-model.js'),bench=model.create('disabled');
 assert.throws(()=>bench.start({profile:model.demo(),operation:'Z',diameter:6,wcs:'G54',scenario:'success',confirmed:true,idle:true}),/Palpage réel non raccordé/);
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
console.log('PASS real interface: index.html without dry-run, coordinate preparation, check-only badge or experimental entry; real Zéro buttons and Continu; mode words gone from the real scripts; real block probing launch, bench locked outside the simulation; EN/ES rows of the Préparer and Machine texts.');
