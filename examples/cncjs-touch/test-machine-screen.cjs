'use strict';
// Machine screen (lot écrans 4): why $X / $H are greyed out, said in one status line under them (a title
// is not shown on touch), or the answer to a request sent from this screen; the buttons' handlers, guards
// and disabled state stay those of commissioning.js. The simulated state pill in the interface's words.
// The help sheet describes the real commands. FR / EN / ES.
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict;
const {createDOM}=require('./dom-fixture.cjs');
const read=f=>fs.readFileSync(__dirname+'/touch/'+f,'utf8');
// Translator over the real catalogue (i18n.js keeps the spaces around a known phrase).
function locale(language){
  const sb={window:{}};vm.runInNewContext(read('i18n-messages.js'),sb);
  const col=language==='en'?1:language==='es'?2:0,map=new Map(sb.window.CNCTouchMessages.map(r=>[r[0].trim().replace(/\s+/g,' '),r[col]]));
  const t=s=>{const k=String(s).trim().replace(/\s+/g,' ');if(!col||!map.has(k))return s;const lead=/^\s*/.exec(s)[0],tail=/\s*$/.exec(s)[0];return lead+map.get(k)+tail;};
  return {t,message:t,html:s=>s,language,locale:language==='es'?'es-ES':language==='en'?'en-GB':'fr-FR'};
}
// status-strip.js describe(), alone (the word the strip, the menu and the Machine card show).
function describeWith(uiLocale){
  const src=read('status-strip.js'),a=src.indexOf('function describe(m,connected){'),b=src.indexOf("var tone='',lastDetail=null;");
  assert(a>0&&b>a,'describe() found in status-strip.js');
  return vm.runInNewContext('(function(uiLocale){function finite(v){return typeof v==="number"&&isFinite(v);}'+src.slice(a,b)+'return describe;})',{isFinite,String})(uiLocale);
}
const ENGLISH=/\b(Idle|Run|Hold|Jog|Alarm|Door|Check|Home|Sleep)\b/;

function machinePage(language){
  const dom=createDOM(['machine']),handlers={},calls=[],uiLocale=locale(language);
  dom.document.body.getAttribute=()=>null;
  // job-controls.js prepare() → command(): « Demande envoyée… » is published synchronously, inside the click.
  const controls={prepareCommand:op=>{calls.push(['prepare',op]);if(page.onPrepare)page.onPrepare(op);},
    readSettings:()=>{calls.push(['readSettings']);return page.onRead?page.onRead():Promise.resolve({});}};
  // job-controls.js (loaded first) binds the dialog's Confirmer before commissioning.js: the confirmed command is sent.
  dom.node('job-confirm').addEventListener('click',()=>{if(page.onConfirm)page.onConfirm();});
  const window={addEventListener:(n,f)=>handlers[n]=f,cncJobControls:controls,cncI18n:uiLocale,cncShell:{go(){}}};
  vm.runInNewContext(read('commissioning.js'),{window,document:dom.document,localStorage:{getItem:()=>null,setItem(){}},JSON,Object,Math,Date,String,Number,Promise});
  const panel=dom.node('panel'),buttons=panel.children.find(c=>/ks-machine-commands/.test(c.className)).children;
  const reason=panel.children.find(c=>c.id==='ks-machine-command-reason');
  handlers['cnc-screen-change']({detail:'machine'}); // on Machine: the assistant does not open by itself
  const page={dom,handlers,calls,panel,unlock:buttons[0],home:buttons[1],reason,confirm:dom.node('job-confirm'),onPrepare:null,onConfirm:null,onRead:null,
    status(machine,extra){handlers['cnc-job-status']({detail:Object.assign({machine,simulation:false,transportConnected:true,feedback:'',feedbackState:''},extra||{})});},
    screen(name){handlers['cnc-screen-change']({detail:name});}};
  return page;
}
const base={port:'/dev/replay',fresh:true,workflow:'idle',activeState:'Idle',canUnlock:false,unlockReason:'Le déverrouillage ($X) ne sert qu’en alarme.',canHome:true,homeReason:''};
// The states of the screens fixture (browser-run.cjs) and of the server (job-service.js unlockReady / homeReady).
const STATES={
  repos:base,
  homing:{...base,activeState:'Home',homing:true,canHome:false,homeReason:'La prise d’origine exige une machine au repos ou en alarme.'},
  palpage:{...base,activeState:'Run',probing:true,unlockReason:'Palpage en cours.',canHome:false,homeReason:'Palpage en cours.'},
  travail:{...base,workflow:'running',activeState:'Run',unlockReason:'Travail en cours.',canHome:false,homeReason:'Travail en cours.'},
  pause:{...base,workflow:'paused',activeState:'Hold:0',unlockReason:'Travail en cours.',canHome:false,homeReason:'Travail en cours.'},
  'alarme-travail':{...base,workflow:'running',activeState:'Alarm',alarmCode:1,unlockReason:'Impossible pendant un travail ou avec des commandes en attente.',canHome:false,homeReason:'Impossible pendant un travail ou avec des commandes en attente.'},
  'alarme-repos':{...base,activeState:'Alarm',alarmCode:1,canUnlock:true,unlockReason:'',canHome:true},
  'sans-22':{...base,canHome:false,homeReason:'Réglage $22 inconnu : relisez les réglages de la carte.'},
  // Piloted by another device (the fixture's « pilote-pris »): the server's can* do not read the pilot.
  'pilote-pris':{...base,control:{owner:{kind:'touch',id:'browser-run-other',label:'Tablette atelier',present:true},lastChange:null}},
  'alarme-pilote-pris':{...base,activeState:'Alarm',alarmCode:1,canUnlock:true,unlockReason:'',control:{owner:{kind:'touch',id:'browser-run-other',label:'Tablette atelier',present:true},lastChange:null}},
  // Stale data (« périmé »): available() refuses both.
  perime:{...base,fresh:false,unlockReason:'État machine trop ancien : attendre un rapport récent.',canHome:false,homeReason:'État machine trop ancien : attendre un rapport récent.'},
  // A reason with a value (spindleStill).
  broche:{...base,canHome:false,homeReason:'La broche tourne encore (12000 tr/min) : arrêtez-la d’abord (M5).'}
};
{
  // (h) disabled of $X / $H for every state: exactly !machine || !canUnlock / !canHome, as before this lot,
  // and the guards / handlers lines are those of before (text only was added around them).
  const src=read('commissioning.js');
  for(const line of ["machineUnlock=button(t('Déverrouiller ($X)…'),'ks-secondary',function(){command(function(c){c.prepareCommand('unlock');});});",
    "machineHome=button(t('Prise d’origine ($H)…'),'ks-secondary',function(){command(function(c){c.prepareCommand('home');});});",
    "if(machineUnlock){prop(machineUnlock,'disabled',!machine||!machine.canUnlock);prop(machineUnlock,'title',t(machine&&machine.unlockReason||''));}",
    "if(machineHome){prop(machineHome,'disabled',!machine||!machine.canHome);prop(machineHome,'title',t(machine&&machine.homeReason||''));}"])
    assert(src.includes(line),'unchanged: '+line.slice(0,60));
  const p=machinePage('fr'),seen={};
  p.status(null);assert.equal(p.unlock.disabled,true);assert.equal(p.home.disabled,true);assert.equal(p.reason.hidden,true,'offline: the state word says it, no reason line');
  for(const [name,m] of Object.entries(STATES)){
    p.status(m);seen[name]=[p.unlock.disabled,p.home.disabled];
    assert.deepEqual(seen[name],[!m.canUnlock,!m.canHome],name+': disabled unchanged');
    assert.equal(p.reason.hidden,m.canUnlock&&m.canHome,name+': a line exactly when a button is greyed out');
  }
  assert.deepEqual(seen,{repos:[true,false],homing:[true,true],palpage:[true,true],travail:[true,true],pause:[true,true],'alarme-travail':[true,true],'alarme-repos':[false,false],'sans-22':[true,true],
    'pilote-pris':[true,false],'alarme-pilote-pris':[false,false],perime:[true,true],broche:[true,true]});
  // The line, in the server's words, prefixed with the command it is about.
  p.status(STATES.repos);assert.equal(p.reason.textContent,'Le déverrouillage ($X) ne sert qu’en alarme.');
  p.status(STATES.travail);assert.equal(p.reason.textContent,'$X et $H indisponibles : Travail en cours.');
  p.status(STATES.palpage);assert.equal(p.reason.textContent,'$X et $H indisponibles : Palpage en cours.');
  // $22 forgotten by CNCjs (board restart): the reading of $$ is offered there, in one button, only then.
  const reread=p.panel.children.find(c=>/ks-machine-commands/.test(c.className)).children.find(b=>b.id==='ks-machine-reread');
  assert(reread&&reread.hidden,'« Relire les réglages » hidden at rest');
  p.status(STATES['sans-22']);assert.equal(p.reason.textContent,'$X indisponible : Le déverrouillage ($X) ne sert qu’en alarme. · $H indisponible : Réglage $22 inconnu : relisez les réglages de la carte. Touchez Relire les réglages ($$).');
  assert.equal(reread.hidden,false);assert.equal(reread.textContent,'Relire les réglages ($$)');assert.equal(reread.disabled,false);
  // Contre-revue m2: the answer of « Relire » shows on this line (here a refusal: another device pilots).
  let refuse=null;p.onRead=()=>({then:(ok,ko)=>{refuse=()=>ko(Object.assign(new Error('Machine pilotée par Tablette B.'),{code:'ECONTROL'}));}});
  reread.click();assert.equal(p.reason.textContent,'Relecture des réglages de la carte ($$)…');
  refuse();
  assert.equal(p.reason.textContent,'Machine pilotée par Tablette B.');assert.equal(p.reason.getAttribute('data-feedback'),'failed');
  p.status(STATES['sans-22']);assert.equal(p.reason.textContent,'Machine pilotée par Tablette B.','kept while the reasons stay the same');
  // A new $X / $H request ends it: its own answer shows.
  p.unlock.disabled=false;p.unlock.click();p.status(STATES['sans-22'],{feedback:'Refusé : pilotage attribué à « Tablette B ».',feedbackState:'failed'});
  assert.notEqual(p.reason.textContent,'Machine pilotée par Tablette B.','« Relire » answer gone after a new request');
  p.onRead=null;
  // Contre-revue P2-2: in alarm the reading (at rest only) needs $X first, said on the line and on the greyed button.
  p.status({...STATES['sans-22'],activeState:'Alarm',alarmCode:1,canUnlock:true,unlockReason:''});
  assert.equal(p.reason.textContent,'$H indisponible : Réglage $22 inconnu : relisez les réglages de la carte. Touchez Déverrouiller ($X), puis Relire les réglages ($$), puis $H.');
  assert.equal(reread.hidden,false);assert.equal(reread.disabled,true);assert.equal(reread.title,'Touchez Déverrouiller ($X), puis Relire les réglages ($$), puis $H.');
  // Any case: « réglage $22 inconnu » lower-case too.
  p.status({...STATES['sans-22'],homeReason:'réglage $22 inconnu'});assert.equal(reread.hidden,false);
  // Hold without a job (a stopped job left Hold:0 for hours): the server's words, then what to do (Arrêter, then $H).
  p.status({...base,activeState:'Hold:0',canHome:false,homeReason:'La prise d’origine exige une machine au repos ou en alarme.'});
  assert.equal(p.reason.textContent,'$X indisponible : Le déverrouillage ($X) ne sert qu’en alarme. · $H indisponible : La prise d’origine exige une machine au repos ou en alarme. Touchez Arrêter, puis $H.');
  assert.equal(reread.hidden,true);
  p.status(STATES.repos);assert(!/Touchez Arrêter, puis \$H/.test(p.reason.textContent),'not at rest');
  p.status(STATES.homing);assert.equal(p.reason.textContent,'$X indisponible : Le déverrouillage ($X) ne sert qu’en alarme. · $H indisponible : La prise d’origine exige une machine au repos ou en alarme.');
  // Alarm during a job (lot D, point 3): the server's words kept, then the missing step (Arrêter, then $X).
  p.status(STATES['alarme-travail']);assert.equal(p.reason.textContent,'$X et $H indisponibles : Impossible pendant un travail ou avec des commandes en attente. Touchez Arrêter, puis $X.');
  p.status({...STATES['alarme-travail'],unlockReason:'Travail en cours.',homeReason:'Travail en cours.'});assert.equal(p.reason.textContent,'$X et $H indisponibles : Travail en cours. Touchez Arrêter, puis $X.');
  p.status({...STATES['alarme-travail'],workflow:'idle',unlockReason:'Impossible pendant un travail ou avec des commandes en attente.'});assert.equal(p.reason.textContent,'$X et $H indisponibles : Impossible pendant un travail ou avec des commandes en attente.','idle (commands pending): no Arrêter step');
  // aria: both buttons point at the line.
  assert.equal(p.unlock.getAttribute('aria-describedby'),'ks-machine-command-reason');assert.equal(p.home.getAttribute('aria-describedby'),'ks-machine-command-reason');
  assert.equal(p.reason.getAttribute('role'),'status');
  // Unchanged writes: the same report twice writes nothing.
  p.status(STATES.travail);const w=p.dom.stats.writes;p.status(STATES.travail);assert.equal(p.dom.stats.writes,w,'no unchanged DOM writes');
}
{
  // (b) An alarm during a job (the RT capture: $X / $H striped while the notice says to use them): the reason shows, ES.
  const p=machinePage('es');p.status(STATES['alarme-travail']);
  assert.equal(p.reason.hidden,false);
  assert.equal(p.reason.textContent,'$X y $H no disponibles: No es posible durante un trabajo o con comandos en espera. Toque Detener y luego $X.');
  p.status(STATES['alarme-repos']);assert.equal(p.reason.hidden,true,'both available: no line');
  const en=machinePage('en');en.status({...STATES['alarme-travail'],unlockReason:'Travail en cours.',homeReason:'Travail en cours.'});
  assert.equal(en.reason.textContent,'$X and $H unavailable: Job running. Touch Stop, then $X.');
  p.status(STATES.repos);assert.equal(p.reason.textContent,'El desbloqueo ($X) solo sirve en alarma.');
}
{
  // (i) A refused $H asked from Machine (job-controls.js: no live stream → « Suivi continu interrompu »): the
  // answer replaces the permanent $X reason on the same line, tinted; a request from elsewhere is not shown here.
  // The real order: « Demande envoyée… » is published inside the click (prepareCommand → command()).
  const refusal='Suivi continu interrompu. Nouvelle confirmation requise.',sent={feedback:'Demande envoyée…',feedbackState:'sent'},failed={feedback:refusal,feedbackState:'failed'};
  const REASON='Le déverrouillage ($X) ne sert qu’en alarme.';
  const p=machinePage('fr');p.onPrepare=()=>p.status(STATES.repos,sent);
  p.status(STATES.repos,failed);
  assert.equal(p.reason.textContent,REASON,'not asked from here: the reason');
  p.home.click();assert.deepEqual(p.calls.at(-1),['prepare','home'],'the click still goes through cncJobControls.prepareCommand');
  assert.equal(p.reason.textContent,'Demande envoyée…','the first « sent », published inside the click, is ours');assert.equal(p.reason.getAttribute('data-feedback'),'sent');
  p.status(STATES.repos,failed);
  assert.equal(p.reason.textContent,refusal);assert.equal(p.reason.hidden,false);assert.equal(p.reason.getAttribute('data-feedback'),'failed');
  p.status(STATES.repos,failed);assert.equal(p.reason.textContent,refusal,'the same answer stays');
  // Another request after it (Pause from the strip): « sent » then its failure are not shown under $X / $H.
  p.status(STATES.repos,sent);assert.equal(p.reason.textContent,REASON,'another request: the reason again');
  p.status(STATES.repos,{feedback:'Pause refusée.',feedbackState:'failed'});assert.equal(p.reason.textContent,REASON);assert.equal(p.reason.getAttribute('data-feedback'),null);
  // A refusal, then the machine's context changes (a job started elsewhere): the current reasons, not the old answer.
  p.home.click();p.status(STATES.repos,failed);assert.equal(p.reason.textContent,refusal);
  p.status(STATES.travail,failed);assert.equal(p.reason.textContent,'$X et $H indisponibles : Travail en cours.','new reasons replace an old refusal');
  // Confirmed (the dialog opened): the reason; the answer of its confirmation is ours, another request is not.
  p.status(STATES.repos);p.home.click();p.status(STATES.repos,{feedback:'Confirmation prête.',feedbackState:'confirmed'});
  assert.equal(p.reason.textContent,REASON);assert.equal(p.reason.getAttribute('data-feedback'),null);
  p.onConfirm=()=>p.status(STATES.repos,sent);
  p.confirm.click();assert.equal(p.reason.textContent,'Demande envoyée…','confirmed in its dialog: still ours');
  p.status(STATES.repos,failed);assert.equal(p.reason.textContent,refusal);
  p.status(STATES.repos,{feedback:'Machine déverrouillée.',feedbackState:'confirmed'});assert.equal(p.reason.textContent,REASON,'accepted: the request is over');
  p.status(STATES.repos,failed);assert.equal(p.reason.textContent,REASON);
  // The dialog dismissed, then another request (Pause from the strip): never shown here.
  p.home.click();p.status(STATES.repos,{feedback:'Confirmation prête.',feedbackState:'confirmed'});
  p.status(STATES.repos,sent);p.status(STATES.repos,failed);assert.equal(p.reason.textContent,REASON,'a request after the dismissed dialog is not ours');
  // A click that sends nothing (busy: prepare() returns early) asks nothing: a later request is not ours.
  p.onPrepare=null;p.home.click();p.status(STATES.repos,sent);assert.equal(p.reason.textContent,REASON);
  // Leaving Machine forgets the request.
  p.onPrepare=()=>p.status(STATES.repos,sent);p.home.click();p.status(STATES.repos,failed);assert.equal(p.reason.textContent,refusal);
  p.screen('home');assert.equal(p.reason.textContent,REASON,'left Machine: the reason again');
  p.status(STATES.repos,failed);assert.equal(p.reason.textContent,REASON);
  // Disabled buttons cannot ask: a click on a greyed $X sends nothing and marks nothing.
  const q=machinePage('fr');q.status(STATES.travail);const before=q.calls.length;q.unlock.click();assert.equal(q.calls.length,before);
  q.status(STATES.travail,failed);assert.equal(q.reason.textContent,'$X et $H indisponibles : Travail en cours.');
}
{
  // Counter-review: every reason the server gives for $X / $H (job-service.js unlockReady, homeReady and what they
  // call) is shown translated in ES / EN; the three with a value keep it. The fixed ones are read in the server.
  const server=fs.readFileSync(__dirname+'/../../src/server/services/touch/job-service.js','utf8');
  const FIXED=['Service indisponible.','Contrôleur Grbl non connecté.','Connexion machine indisponible.','État machine trop ancien : attendre un rapport récent.','Palpage en cours.',
    'Déplacement en cours : attendez le retour au repos (Idle).','Impossible pendant un travail ou avec des commandes en attente.','Chargement en cours.','Le déverrouillage ($X) ne sert qu’en alarme.',
    'La prise d’origine exige une machine au repos ou en alarme.','Réglage $22 inconnu : relisez les réglages de la carte.','Prise d’origine désactivée sur la carte ($22=0).',
    'Des automatismes CNCjs sont configurés. Leur compatibilité doit être vérifiée avant utilisation.'];
  for(const s of FIXED)assert(server.includes("conflict('"+s+"')"),'server reason still: '+s);
  for(const s of ["'La broche tourne encore (' + speed + ' tr/min) : arrêtez-la d’abord (M5).'","'La broche est commandée (' + spindle + ') : arrêtez-la d’abord (M5).'","'Commande système en cours (' + systemCommands.current().title + ') : attendez sa fin.'"])
    assert(server.includes(s),'server reason with a value still: '+s);
  const FRENCH=/’| :|\b(arrêtez|attendez|broche|commande|réglages?)\b|en cours/i;
  for(const language of ['es','en']){
    const p=machinePage(language);
    for(const s of FIXED){p.status({...base,canHome:false,homeReason:s,canUnlock:true});assert(!FRENCH.test(p.reason.textContent),language+': '+p.reason.textContent);}
    p.status({...base,canHome:false,homeReason:'La broche tourne encore (12000 tr/min) : arrêtez-la d’abord (M5).',canUnlock:true});
    assert.equal(p.reason.textContent,language==='es'?'$H no disponible: El husillo sigue girando (12000 rpm): deténgalo primero (M5).':'$H unavailable: The spindle is still turning (12000 rpm): stop it first (M5).');
    p.status({...base,canHome:false,homeReason:'La broche est commandée (M3) : arrêtez-la d’abord (M5).',canUnlock:true});assert(/\(M3\)/.test(p.reason.textContent)&&!FRENCH.test(p.reason.textContent),p.reason.textContent);
    p.status({...base,canHome:false,homeReason:'Commande système en cours (Redémarrage) : attendez sa fin.',unlockReason:'Commande système en cours (Redémarrage) : attendez sa fin.'});
    assert(/\(Redémarrage\)/.test(p.reason.textContent)&&!FRENCH.test(p.reason.textContent.replace('Redémarrage','R')),p.reason.textContent);
    // A value is inserted as received, never read as a replacement pattern.
    p.status({...base,canHome:false,homeReason:'La broche est commandée ($&) : arrêtez-la d’abord (M5).',canUnlock:true});assert(p.reason.textContent.includes('($&)'),p.reason.textContent);
  }
}
{
  // (c) Simulation: the pill says the state in the interface's words, « déduite » included (FR / ES); class and
  // disabled of the two alarm buttons keep reading activeState.
  for(const [language,word] of [['fr','État fictif : Alarme 3 déduite'],['es','Estado simulado: Alarma 3 deducida']]){
    const nodes={},events={},uiLocale=locale(language);
    const doc={hidden:false,getElementById:id=>nodes[id]||(nodes[id]={id,textContent:'',className:'',disabled:false,addEventListener(){}}),addEventListener(){}};
    const window={cncI18n:uiLocale,addEventListener:(n,f)=>events[n]=f};
    vm.runInNewContext(read('simulation-machine.js'),{window,document:doc});
    window.cncStatusStrip={describe:describeWith(uiLocale)};
    events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Alarm',alarmCode:3,alarmCodeInferred:true,workflow:'paused',fresh:true}}});
    assert.equal(nodes['sim-machine-state'].textContent,word);assert(!ENGLISH.test(nodes['sim-machine-state'].textContent));
    assert.equal(nodes['sim-machine-state'].className,'badge err');assert.equal(nodes['sim-trigger-alarm'].disabled,true);assert.equal(nodes['sim-clear-alarm'].disabled,false);
    events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Idle',workflow:'idle',fresh:true}}});
    assert(!ENGLISH.test(nodes['sim-machine-state'].textContent),nodes['sim-machine-state'].textContent);assert.equal(nodes['sim-machine-state'].className,'badge ok');
    assert.equal(nodes['sim-trigger-alarm'].disabled,false);assert.equal(nodes['sim-clear-alarm'].disabled,true);
  }
  // Before status-strip.js is loaded (it comes after this file), Grbl's word rather than nothing.
  const nodes={},doc={hidden:false,getElementById:id=>nodes[id]||(nodes[id]={id,textContent:'',addEventListener(){}}),addEventListener(){}},events={};
  vm.runInNewContext(read('simulation-machine.js'),{window:{addEventListener:(n,f)=>events[n]=f},document:doc});
  events['cnc-job-status']({detail:{simulation:true,machine:{activeState:'Idle',workflow:'idle'}}});assert.equal(nodes['sim-machine-state'].textContent,'État fictif : Idle');
}
{
  // (g) Help sheet and subtitle: the $X / $H commands of this screen are real (no « read only », no « origins
  // disabled »), each phrase with its FR / EN / ES row; the labels are those of the buttons and of Préparer.
  const html=read('index.html'),start=html.indexOf('<section id="screen-machine"'),machine=html.slice(start,html.indexOf('</section>',start));
  assert(!/lecture seule<\/p>/.test(machine)&&!/commandes désactivées/.test(machine),'no read-only claim above $X / $H');
  const texts=[...machine.matchAll(/<p>([^<]+)<\/p>/g)].map(m=>m[1]).filter(s=>/[a-z]/.test(s));
  assert(texts.includes('Connexion, coordonnées et commandes $X/$H'));
  assert(texts.some(s=>/^Commandes réelles/.test(s)&&s.includes('Déverrouiller ($X)')&&s.includes('Prise d’origine ($H)')&&s.includes('Préparer')&&s.includes('Suivi')&&!/Déplacement réel|Origine ici|quand ils sont activés/.test(s)));
  for(const language of ['en','es']){const L=locale(language);for(const s of texts)assert.notEqual(L.t(s),s,language+' row for: '+s);}
  for(const label of ['Déverrouiller ($X)…','Prise d’origine ($H)…','Préparer']){
    const es=locale('es').t(label).replace(/…$/,''),en=locale('en').t(label).replace(/…$/,'');
    assert(locale('es').t(texts.find(s=>/^Commandes réelles/.test(s))).includes(es),'ES sheet names '+es);
    assert(locale('en').t(texts.find(s=>/^Commandes réelles/.test(s))).toLowerCase().includes(en.toLowerCase()),'EN sheet names '+en);
  }
  for(const s of ['$X et $H indisponibles : ','$X indisponible : ','$H indisponible : ','Code non reconnu : consulter CNCjs.'])
    for(const language of ['en','es'])assert.notEqual(locale(language).t(s),s,language+': '+s);
}
console.log('PASS machine screen: $X / $H reason line in the server words (FR/ES), refusal from this screen only, disabled and handlers unchanged for every state, simulated state in the interface words, help sheet naming the real commands with FR/EN/ES rows.');
