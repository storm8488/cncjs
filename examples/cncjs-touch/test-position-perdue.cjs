'use strict';
// P4 (lightened): after a board restart or an alarm (server referenceLost), one clear cause at the
// head of the session, the same phrase and remedy for every « not homed » refusal, an error:15 jog
// on an unreferenced machine explained, and an honest work zero line. Page only, FR/EN/ES.
const assert=require('assert').strict;
const {pure,machine}=require('./session-fixture.cjs');
const {page}=require('./session-dom-fixture.cjs');
const base={machine:machine(),transportConnected:true,pilot:{state:'free'}};
const RESTART='La machine a redémarré : sa position est perdue. Faites la prise d’origine.';
const ALARM='Après une alarme, la position de la machine est perdue. Faites la prise d’origine.';
const JOG15='Position perdue : la machine croit être ailleurs. Faites la prise d’origine.';
const restarted=patch=>machine({homed:false,referenceLost:'restart',lastAlarm:null,...patch});
for(const lang of ['fr','en','es']){
 const f=pure(lang),t=s=>f.window.cncI18n.t(s),lire=f.window.cncRefus.lire,evaluate=f.evaluate;
 if(lang!=='fr')for(const s of [RESTART,ALARM,JOG15])assert.notEqual(t(s),s,lang+' translated: '+s);
 // 1. One session cause, at the head, with the homing remedy.
 for(const [lost,state,rank,text] of [['restart','Idle',10,RESTART],['restart','Alarm',8,RESTART],['alarm','Idle',10,ALARM],['alarm','Alarm',8,ALARM]]){
  const r=evaluate({...base,machine:restarted({referenceLost:lost,activeState:state})}),name=lang+' '+lost+' '+state;
  assert.equal(r.globale.id,'position-perdue',name);assert.equal(r.rang,rank,name);assert.equal(r.globale.texte,t(text),name);assert.deepEqual(Array.from(r.globale.remedes),[state==='Alarm'?'remise-en-route':'prise-origine'],name+' (in alarm the recovery panel: an ALARM:1/2 needs its reset first)');
  assert.equal(r.barres.machine.cause.texte,t(text),name+' machine bar');assert.equal(r.barres.machine.action.id,'prise-origine',name);
  assert.equal(r.barres.jog.cause.texte,t(text),name+' jog bar');assert.equal(r.barres.jog.remedes[0].id,'prise-origine',name);
  // 1b. The « not homed » refusals keep their code but name the same cause and remedy.
  for(const code of ['ETOUCH_START_NOT_HOMED','ETOUCH_ORIGIN_NOT_HOMED','ETOUCH_CNC_FRAME_NOT_HOMED']){
   const q=lire({code,message:'Machine non référencée'},restarted({referenceLost:lost,activeState:state}));
   assert.equal(q.phrase,r.globale.texte,name+' '+code);assert.deepEqual(Array.from(q.remedes),['prise-origine'],name+' '+code);assert.equal(q.details.lignes[0].valeur,code,'code kept in Details');
  }
 }
 // Never homed, no incident: the existing causes and phrases are unchanged.
 assert.equal(evaluate({...base,machine:machine({homed:false})}).globale.id,'origine-a-prendre');
 assert.equal(evaluate({...base,machine:machine({homed:false,activeState:'Alarm'})}).globale.id,'alarme');
 assert.equal(lire({code:'ETOUCH_START_NOT_HOMED'},machine({homed:false})).phrase,t('Origine machine pas prise : la machine ne sait pas où elle est.'));
 // Settings still to read come first: the homing waits for them.
 assert.equal(evaluate({...base,machine:restarted({activeState:'Alarm',firmware:'',settingsCount:0})}).globale.id,'alarme');
 // Homed again: the cause is gone.
 assert.equal(evaluate({...base,machine:machine({jobStopped:true,stoppedAtLine:12,stoppedFile:'part.nc'})}).globale,null);
 // 2. error:15 on an unreferenced machine: position lost, not a bare error number.
 const jog='Déplacement arrêté : Grbl a refusé le jog (error:15).';
 for(const m of [machine({homed:false}),restarted()]){const q=lire({message:jog},m);assert.equal(q.phrase,t(JOG15));assert.deepEqual(Array.from(q.remedes),['prise-origine']);assert.equal(q.famille,'position-perdue');}
 assert.equal(lire({message:jog},machine()).phrase,t('La machine a refusé le déplacement (erreur {n}).').replace('{n}','15'),'homed: the error stays a refusal');
 assert.equal(lire({message:'Grbl a refusé le jog (error:9)'},machine({homed:false})).phrase,t('La machine a refusé le déplacement (erreur {n}).').replace('{n}','9'),'another error keeps its number');
 // 3. The work zero after an incident: stored in the machine, to be checked; never « kept, checked ».
 const stopped={jobStopped:true,stoppedAtLine:1234,stoppedFile:'part.nc'};
 const cnc=evaluate({...base,machine:machine(stopped)}).machine.zero,laser=evaluate({...base,machine:machine({...stopped,machineProfile:{kind:'laser'}})}).machine.zero;
 assert.equal(cnc,t('Zéro pièce : celui enregistré dans la machine. Vérifiez-le avant l’usinage : « Cadrer à vide… » sur 4 · Contrôle.'));
 assert.equal(laser,t('Zéro pièce : celui enregistré dans la machine. Vérifiez-le avant la gravure : « Cadrer… » sur 4 · Contrôle.'));
 // The button's own label (i18n-messages-profiles.js), in each language.
 assert(cnc.includes({fr:'Cadrer à vide…',en:'Frame in the air…',es:'Encuadrar en vacío…'}[lang]),lang+' names the framing button');
 assert.equal(evaluate({...base,machine:restarted(stopped)}).machine.zero,t('Zéro pièce : enregistré dans la machine, il revient après la prise d’origine.'));
 assert.equal(evaluate({...base,machine:machine()}).machine.zero,t('Zéro pièce : vérifié'),'no incident: unchanged');
}
// Actual page: the head cause on every stage bar, a refusal clicked on Control, a refused jog on Zero.
(async()=>{
 const motionMachine=require('./test-real-motion.cjs').machine;
 for(const lang of ['fr','en','es']){
  const p=page(lang);p.run('i18n-messages-origin.js');p.run('i18n.js');p.run('touch-shell.js');p.run('check-screen.js');p.run('real-motion.js');
  const t=s=>p.window.cncI18n.t(s);
  const state=patch=>motionMachine({firmware:'Grbl',settingsCount:34,machineProfile:{kind:'cnc'},workOffset:{state:'proven',canVerify:true},canHome:true,...patch});
  const send=patch=>p.emit('cnc-job-status',{machine:state(patch),transportConnected:true,pilot:{state:'free'},simulation:false});
  const lost={homed:false,referenceLost:'restart'};
  send(lost);
  for(const screen of ['machine','jog','check']){p.window.cncShell.go(screen);assert(p.node('step-'+screen+'-cause').textContent.includes(t(RESTART)),lang+' '+screen+': '+p.node('step-'+screen+'-cause').textContent);}
  p.window.cncShell.go('jog');assert.equal(p.node('step-jog-remedy').getAttribute('data-action'),'prise-origine');
  p.window.cncShell.go('check');p.window.cncSeance.refuser({code:'ETOUCH_START_NOT_HOMED',message:'Machine non référencée : faites la prise d’origine avant de démarrer.'});
  assert(p.node('step-check-cause').textContent.includes(t(RESTART)),lang+' clicked refusal: '+p.node('step-check-cause').textContent);assert.equal(p.node('step-check-remedy').getAttribute('data-action'),'prise-origine');
  // The jog refused by error:15 while not homed: its own explanation on the Zero bar.
  p.window.cncShell.go('jog');send({homed:false});
  send({homed:false,motion:{...state().motion,lastJog:{at:7,result:'refused',reason:'error:15',message:'Grbl a refusé le jog (error:15)',axis:'Z'}}});
  assert(p.node('step-jog-cause').textContent.includes(t(JOG15)),lang+' jog: '+p.node('step-jog-cause').textContent);assert(!p.node('step-jog-cause').textContent.includes('error:15'));
  assert.equal(p.node('step-jog-remedy').getAttribute('data-action'),'prise-origine');
  p.emit('pagehide');p.window.cncJobControls.dispose();
 }
 console.log('PASS position lost: one head cause after restart/alarm, « not homed » refusals redirected, error:15 jog explained, stored work zero line (FR/EN/ES).');
})().catch(e=>{console.error(e);process.exitCode=1;});
