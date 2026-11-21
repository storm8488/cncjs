'use strict';
const assert=require('assert').strict;
const {pure,machine}=require('./session-fixture.cjs');
const {page}=require('./session-dom-fixture.cjs');
const base={machine:machine(),transportConnected:true,pilot:{state:'free'}};
const model=(patch={})=>pure().evaluate({...base,...patch});
const cases=[
 ['offline',{machine:null,transportConnected:false},'Hors ligne','connecter','raye'],
 ['closed',{machine:null},'Non connectée','connecter','plein'],
 ['settings',{machine:machine({firmware:'',settingsCount:0,homed:false})},'Réglages à lire','relire','plein'],
 ['restart in alarm',{machine:machine({firmware:'',settingsCount:0,homed:false,activeState:'Alarm',referenceLost:'restart',canReadSettings:true})},'Réglages à lire','relire','plein'],
 ['reading',{machine:machine({refusals:{readSettings:{code:'ETOUCH_SETTINGS_READING'}},canReadSettings:false})},'Réglages à lire','relire','raye'],
 ['alarm idle',{machine:machine({activeState:'Alarm',homed:false,lastAlarm:{code:2}})},'Alarme 2','prise-origine','plein'],
 ['alarm job',{machine:machine({activeState:'Alarm',workflow:'running',homed:false,canStop:true,canHome:false})},'Alarme','arreter-usinage','plein'],
 ['unhomed',{machine:machine({homed:false})},'Origine à prendre','prise-origine','plein'],
 ['homing',{machine:machine({activeState:'Home',homing:true,homed:false,canHome:false})},'Prise d’origine…','prise-origine','raye'],
 ['other',{pilot:{state:'other',name:'PC atelier'}},'Main ailleurs','prendre-la-main','plein'],
 ['offset',{machine:machine({workOffset:{state:'failed',code:'ETOUCH_OFFSET_UNCONFIRMED',canVerify:true}})},'Zéro pièce à vérifier','suite:jog','plein'],
 ['ready',{machine:machine({name:''})},'Prête','suite:files','plein'],
 ['running',{machine:machine({workflow:'running',activeState:'Run',canHome:false,canReadSettings:false})},'Usinage en cours','suite:home','plein'],
 ['paused',{machine:machine({workflow:'paused',activeState:'Hold',canHome:false,canReadSettings:false})},'Usinage en cours','suite:home','plein']
];
for(const [name,patch,word,action,style] of cases){const r=model(patch);assert.equal(r.etapes.machine.mot,word,name);assert.equal(r.barres.machine.action.id,action,name);assert.equal(r.barres.machine.action.style,style,name);assert(r.lignes.length<=7,name);for(const row of r.lignes)assert(!row.texte.includes('$'),name+' operator text');assert(!r.barres.machine.action.libelle.includes('$'),name);assert(r.lignes.some(x=>x.id==='connexion'));assert(r.lignes.some(x=>x.id==='main'));assert(r.lignes.some(x=>x.id==='reglages'));assert(r.lignes.some(x=>x.id==='origine'));}
for(const patch of [{homeReason:'Réglage $22 inconnu : relisez les réglages de la carte.'},{homeReason:'réglage $22 inconnu'},{capabilities:{jog:{reason:'Version Grbl inconnue : attendez la bannière de démarrage ou lisez les réglages ($I).'}}}]){
 const r=model({machine:machine({...patch,canHome:false})});assert.equal(r.barres.machine.action.id,'relire','uncoded server refusal still offers settings');assert.equal(r.barres.machine.action.style,'plein');assert.equal(r.lignes.find(x=>x.id==='reglages').etat,'suite');
}
const stopped={jobStopped:true,stoppedAtLine:1234,stoppedFile:'part.nc',lastAlarm:{code:2,restarted:true},referenceLost:'restart',homed:false};
let r=model({machine:machine(stopped),commissioning:'none'});
assert.equal(r.lignes.map(x=>x.id).join(','),'connexion,main,reglages,arret,origine,zero,reprise');
assert.equal(r.barres.machine.action.id,'prise-origine');assert(!r.lignes.some(x=>x.id==='service'));
assert.equal(model({commissioning:'none'}).lignes.slice(-1)[0].id,'service');
assert.equal(model({machine:machine({...stopped,stoppedAtLine:0})}).machine.incident,true,'a stop before the first line is still an incident');
assert(!model({machine:machine({...stopped,stoppedAtLine:0})}).lignes.some(x=>x.id==='reprise'),'no invalid line-zero resume');
assert(model({pilot:{state:'other',name:'$&'}}).lignes.find(x=>x.id==='main').texte.includes('« $& »'),'owner labels are literal values');
assert(!model({machine:machine({...stopped,stoppedFile:'other.nc'})}).lignes.some(x=>x.id==='reprise'),'resume must belong to the loaded file');
assert.equal(model({machine:machine({...stopped,homed:true,referenceLost:null,lastAlarm:null})}).barres.machine.action.id,'changer-ligne');
const proposed=model({machine:machine({...stopped,homed:true,referenceLost:null,lastAlarm:null}),resumeLine:1219});assert.equal(proposed.lignes.find(x=>x.id==='reprise').texte,'Reprendre l’usinage à la ligne 1219');assert.equal(proposed.barres.machine.action.libelle,'Reprendre à la ligne 1219…');
assert.equal(model({machine:machine({...stopped,homed:true,referenceLost:null,lastAlarm:null,canLoad:false})}).barres.machine.action.style,'raye');
assert.equal(model({machine:null,connectionBusy:true}).barres.machine.action.style,'raye');
assert.equal(model({machine:null,connectionBusy:true}).barres.machine.cause.texte,'Répondez dans la carte ci-dessus.');
const zeros=[
 [undefined,'non vérifié',['details']],
 [{state:'unknown'},'la machine le vérifie…',[]],
 [{state:'checking'},'la machine le vérifie…',[]],
 [{state:'proven'},'celui enregistré dans la machine. Vérifiez-le avant l’usinage : « Cadrer à vide… » sur 4 · Contrôle.',[]],
 [{state:'failed',code:'ETOUCH_OFFSET_UNCONFIRMED',canVerify:true},'la machine ne l’a pas confirmé',['verifier-zero']],
 [{state:'failed',code:'ETOUCH_OFFSET_MISMATCH',canVerify:true},'à refaire',['refaire-zero','verifier-zero']],
 [{state:'failed',code:'ETOUCH_OFFSET_SETTINGS'},'réglages à relire d’abord',['relire']]
];
for(const [offset,text,buttons] of zeros){const q=model({machine:machine({...stopped,homed:true,referenceLost:null,workOffset:offset})});const line=q.lignes.find(x=>x.id==='zero');assert.equal(line.texte,'Zéro pièce : '+text);assert.equal(line.boutons.map(b=>b.id).join(','),buttons.join(','));if(!offset||offset.state!=='proven')assert(!q.machine.zero.includes('gardé'));const unhomed=model({machine:machine({...stopped,workOffset:offset})});assert.equal(unhomed.machine.zero,'Zéro pièce : enregistré dans la machine, il revient après la prise d’origine.');assert.equal(model({machine:machine({homed:false,workOffset:offset})}).machine.zero,'Zéro pièce : à vérifier après la prise d’origine','never homed, no incident: unchanged');assert.equal(unhomed.lignes.find(x=>x.id==='zero').boutons.length,0);}
assert.equal(model({machine:machine({workOffset:{state:'failed',code:'ETOUCH_OFFSET_UNCONFIRMED',canVerify:false}})}).lignes.find(x=>x.id==='zero').boutons[0].actif,false);
assert.equal(model({machine:machine({fresh:false}),pilot:{state:'other'}}).lignes.find(x=>x.id==='reglages').boutons[0].actif,false);
// Actual page: received facts reconstruct the incident after a reload, without local marks.
for(const lang of ['fr','en','es']){
 const p=page(lang);p.run('grbl-help.js');p.run('touch-shell.js');
 const status={...base,machine:machine({...stopped,activeState:'Alarm',canUnlock:true})};
 p.emit('cnc-job-status',status);p.window.cncShell.go('machine');
 assert.equal(p.node('machine-incident').hidden,false);assert(p.node('machine-incident-lines').textContent.includes('2'));
 assert.equal(p.node('machine-list').querySelectorAll('li').length,7);assert.equal(p.node('ks-machine-reread').hidden,false);assert.equal(p.node('ks-machine-reread').disabled,false);
 assert.equal(p.node('screen-limits'),null);assert.equal(p.node('ks-machine-command-reason'),null);
 const incident=p.node('machine-incident-lines').textContent,again=page(lang);again.run('grbl-help.js');again.run('touch-shell.js');again.emit('cnc-job-status',status);again.window.cncShell.go('machine');assert.equal(again.node('machine-incident-lines').textContent,incident);
 if(lang!=='fr')assert(!/réglages|origine|gardé|passé|position de la machine/i.test(p.node('machine-list').textContent+' '+incident));
 const writes=p.stats.writes;p.emit('cnc-job-status',status);assert.equal(p.stats.writes,writes,'duplicate report writes nothing');
 p.window.cncShell.go('files');const before=p.node('machine-list').textContent;p.emit('cnc-job-status',base);assert.equal(p.node('machine-list').textContent,before,'inactive list does no work');
 p.window.cncJobControls.dispose();again.window.cncJobControls.dispose();
}
// The retry is the owner action, not an invented request or a page navigation.
const p=page();p.run('touch-shell.js');const calls=[];p.window.cncJobControls.verifyOffset=()=>{calls.push('verifyOffset');return Promise.resolve({});};p.emit('cnc-job-status',{...base,machine:machine({workOffset:{state:'failed',code:'ETOUCH_OFFSET_UNCONFIRMED',canVerify:true}})});p.window.cncShell.go('machine');p.node('machine-list').querySelector('[data-action="verifier-zero"]').click();assert.deepEqual(calls,['verifyOffset']);p.window.cncJobControls.dispose();
// Stop is immediate even when the primary action has just changed after an alarm.
const stopPage=page();stopPage.run('touch-shell.js');let stops=0;stopPage.window.cncJobControls.stop=()=>{stops++;};stopPage.emit('cnc-job-status',{...base,machine:machine({activeState:'Alarm',workflow:'running',canStop:true,canHome:false})});stopPage.window.cncShell.go('machine');stopPage.node('step-machine-main').click();assert.equal(stops,1,'no 600 ms delay for Stop');stopPage.window.cncJobControls.dispose();
const resumePage=page();resumePage.run('job-resume.js');resumePage.run('touch-shell.js');resumePage.emit('cnc-job-status',{...base,machine:machine({...stopped,homed:true,referenceLost:null,lastAlarm:null})});resumePage.window.cncShell.go('machine');assert.equal(resumePage.node('step-machine-main').textContent,'Reprendre à la ligne 1219…','the label uses the existing resume owner, including its planner margin');resumePage.window.cncJobControls.dispose();
console.log('PASS recovery: machine states, ordered lines, D2 proofs and remedies, restart in alarm, persistent incident, read guard and no hidden/duplicate mutations (FR/EN/ES).');
