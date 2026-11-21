'use strict';
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const {literals,markup}=require('./page-text-fixture.cjs');
const technical=/\$\d|\b[GM]\d+\b|\b(?:Idle|Run|Hold|Jog|Home|Door)\b/;
const forbidden=/Bornes de saisie du logiciel|Aucune valeur réelle inventée|Sans champ Pn|Acquitté = accepté|Position machine incohérente avec la course \(\$/i;
// These exact sources feed the named Details sheets. Protocol constants and
// SVG geometry are not authored operator strings and are not translation calls.
const detailScopes={'job-dashboard.js':['motionText','unknownsText'],'job-resume.js':['planText']};
const detailPhrases=new Set([
 'Chargement et démarrage bloqués : le contrôleur est en ALARM. Consultez le message d’alarme dans CNCjs et résolvez sa cause. Quand la machine sera prête (Idle), chargez le fichier puis touchez Démarrer.',
 '<p>Trajets rapides G0 inclus. Départ supposé X0 Y0 Z0. Projection approximative : ce ne sont pas les dimensions de la pièce. Z minimum = passe la plus profonde, sous Z0 si négatif.</p></div>'
]);
const files=['seance.js','job-controls.js','job-dashboard.js','job-resume.js','connect-cnc.js','zero-piece.js','real-motion.js','shared-library.js','check-screen.js','program-check-view.js','probe-real.js','refus.js'];
for(const file of files)for(const r of literals(file)){
 const parent=r.ancestors[r.ancestors.length-1];
 const call=parent&&parent.type==='CallExpression'&&parent.callee;
 const name=call&&(call.type==='Identifier'?call.name:call.type==='MemberExpression'&&call.property.name);
 if(!['t','html'].includes(name))continue;
 if(detailPhrases.has(r.value)||r.ancestors.some(n=>n.type==='FunctionDeclaration'&&(detailScopes[file]||[]).includes(n.id.name)))continue;
 for(const value of name==='html'?markup(r.value):[r.value]){
  assert(!technical.test(value),file+':'+r.line+' technical operator text: '+value);
  assert(!forbidden.test(value),file+':'+r.line+' prohibited operator text');
 }
}
for(const value of markup(fs.readFileSync(path.join(__dirname,'touch/index.html'),'utf8')))assert(!technical.test(value)&&!forbidden.test(value),'static operator markup: '+value);
// Dynamic protocol fields must not leak into the confirmation. Full preambles
// and the exact source line remain available in the resume Details sheet.
for(const language of ['fr','en','es']){
 const p=require('./session-fixture.cjs').pure(language),vm=require('vm');
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'touch/job-resume.js'),'utf8'),{window:p.window,document:{body:{getAttribute:()=>null},getElementById:()=>null}});
 const a=p.window.CNCJobResume;
 for(const kind of ['M0','M1','M6']){
  const c={programPause:{kind,tool:2,restartSpindle:{mode:'M3',speed:12000}},resume:{from:42,total:100,line:'G1 X10',tool:2,notes:['G54']}};
  assert(!technical.test(a.pauseText(c.programPause,c)),language+' pause text');
  assert(!technical.test(a.dialogNote('resume',c)),language+' resume confirmation');
  assert(!technical.test(a.dialogNote('start',c)),language+' restart confirmation');
 }
}
console.log('PASS operator texts: stage/dialog/refusal literals, explicit Details exceptions, no technical dynamic confirmation fields, FR/EN/ES.');
