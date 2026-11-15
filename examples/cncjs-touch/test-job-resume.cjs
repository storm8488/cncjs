'use strict';
// Resume from a line and program pauses in Suivi: texts, suggested line after a
// stop, the panel flow (check, then load), the M5 button during a tool change,
// the dialog note, and every phrase translated. Synthetic DOM, no network.
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const R=require('./touch/job-resume');
// Texts.
const m6={kind:'M6',message:'T2 M6',tool:2,restartSpindle:{mode:'M3',speed:12000}};
assert.match(R.pauseText(m6),/^Changement d’outil T2 : .*M5.*zéro Z.*La broche sera relancée \(M3 S12000, 3 s\)/);
assert.match(R.pauseText({kind:'M0',message:'M0 (brides)',tool:null}),/^Pause demandée par le programme \(M0\) : M0 \(brides\)\./);
assert.match(R.pauseText({kind:'error',message:'error:24'}),/reprenez à une ligne/);
assert.equal(R.pauseText(null),'');assert.equal(R.pauseText({kind:'other'}),'');
assert.match(R.dialogNote('resume',{programPause:m6}),/^Outil T2 en place et zéro Z vérifié \?/);
assert.match(R.dialogNote('start',{resume:{from:120,total:900,line:'G1 X5',tool:3}}),/^Reprise à la ligne 120 \/ 900 : G1 X5 — outil attendu T3\./);
assert.equal(R.dialogNote('start',{resume:null}),'');assert.equal(R.dialogNote('resume',{programPause:{kind:'M0'}}),'');
assert.equal(R.suggestedLine({stoppedAtLine:200,stoppedFile:'a.nc'},'a.nc'),185);
assert.equal(R.suggestedLine({stoppedAtLine:10,stoppedFile:'a.nc'},'a.nc'),2);
assert.equal(R.suggestedLine({stoppedAtLine:200,stoppedFile:'b.nc'},'a.nc'),null);
const plan={from:12,total:16,line:'G2 X50 Y40 I10 J0',safeZ:5,position:{X:40,Y:30,Z:-1.5},spindle:{mode:'M3',speed:12000},coolant:'M8',tool:2};
assert.equal(R.planText(plan),'Ligne 12 / 16 : G2 X50 Y40 I10 J0. Départ : Z 5, puis X 40 Y 30, plongée à Z -1.5. Broche M3 S12000 relancée 3 s avant la plongée. Arrosage M8. Outil attendu : T2 (vérifiez qu’il est en place et que le zéro Z lui correspond).');
// Server notes (A1: units, work frame, clearance) are appended to the plan and to the start note, as written.
assert.match(R.planText(Object.assign({},plan,{notes:['Note A.','Note B.']})),/correspond\)\. Note A\. Note B\.$/);
assert.match(R.dialogNote('start',{resume:{from:1,total:2,line:'G0',tool:null,notes:['Unités converties.']}}),/plonge\. Unités converties\.$/);
assert.equal(R.planText(plan),R.planText(Object.assign({},plan,{notes:[]})),'no notes, no change');
// Every phrase used by the module is in the FR/EN/ES catalog.
const source=fs.readFileSync(__dirname+'/touch/job-resume.js','utf8');
const phrases=[...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map(m=>m[1]).concat([...source.matchAll(/el\('[a-z]+','[^']*','[^']*','((?:[^'\\]|\\.)*)'\)/g)].map(m=>m[1]));
const catalog={window:{}};['i18n-messages.js'].concat(fs.readdirSync(__dirname+'/touch').filter(n=>/^i18n-messages-[a-z]+\.js$/.test(n))).forEach(n=>vm.runInNewContext(fs.readFileSync(__dirname+'/touch/'+n,'utf8'),catalog));
const keys=new Set(catalog.window.CNCTouchMessages.map(r=>r[0].trim().replace(/\s+/g,' ')));
for(const p of new Set(phrases))assert(keys.has(p.trim().replace(/\s+/g,' ')),'missing translation: '+p);
// Plate probe texts.
assert.equal(R.plateNote({thickness:10.5,search:15}),'Plaque de 10.5 mm posée sous l’outil et sonde branchée ? Descente de 15 mm au plus ; le dessus de la plaque deviendra Z = épaisseur, puis l’outil remontera jusqu’à 5 mm au-dessus, sans dépasser sa hauteur de départ.');
R.setPendingPlate({thickness:10.5,search:15});assert.match(R.dialogNote('zeroZ',null),/^Plaque de 10\.5 mm/);R.setPendingPlate(null);assert.equal(R.dialogNote('zeroZ',{}),'');
assert.equal(R.lastZeroText({thickness:10,wcs:'G54',machineZ:-35.3}),'Dernier zéro Z : plaque 10 mm, repère G54, contact à Z machine -35.3.');
assert.match(R.lastZeroText({failed:'Alarme pendant le palpage (ALARM:5)'}),/^Dernier palpage échoué : Alarme/);assert.equal(R.lastZeroText(null),'');
console.log('PASS resume texts, planner margin, confirmation notes and translations; sheet flow in test-reprise-volet.');
