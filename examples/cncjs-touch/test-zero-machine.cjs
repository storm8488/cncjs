'use strict';
const assert=require('assert').strict;
const {fixture,machine}=require('./test-real-motion.cjs');
const {page}=require('./session-dom-fixture.cjs');
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
const state=patch=>machine({firmware:'Grbl',settingsCount:34,machineProfile:{kind:'cnc'},workOffset:{state:'proven',canVerify:true},...patch});
(async()=>{
 // Real job-controls transport: the new selector only adds at, the nonce path is unchanged.
 for(const axis of ['X','Y','Z']){
  const f=fixture({locale:'fr'});await f.connect(state());f.el('zero-more-open').click();f.el('zero-at-machine-'+axis.toLowerCase()).click();await f.flush();
  const prep=f.posts().at(-1);assert.equal(prep.body.action,'prepare');assert.equal(prep.body.operation,'set-origin');assert.equal(prep.body.at,'machine');assert.deepEqual(prep.body.axes,[axis]);assert.equal(prep.body.transportId,'stream-one');
  assert.equal(f.posts().filter(r=>r.body.action==='set-origin').length,0);
  f.answer(prep,{nonce:'machine-'+axis,name:'G10 L2 P1 '+axis+'0',expiresIn:15,generation:'gen-1'});await f.flush();
  assert.equal(f.el('real-motion-ticket-title').textContent,'Zéro '+axis+' à l’origine machine');assert.equal(f.el('real-motion-origin-confirm').textContent,'Mettre le zéro '+axis+' à l’origine machine');assert(f.el('real-motion-ticket-name').hidden);
  assert(f.el('real-motion-ticket-plan').textContent.includes('Aucun axe ne bouge.'));assert(!f.el('real-motion-ticket-plan').textContent.includes('G10'));
  f.el('real-motion-origin-confirm').click();await f.flush();const set=f.posts().at(-1);assert.equal(set.body.action,'set-origin');assert.equal(set.body.nonce,'machine-'+axis);assert.equal(set.body.at,undefined,'confirmation uses only the bound nonce');
  f.answer(set,{});await f.flush();f.controls().dispose();f.fireWindow('pagehide');
 }
 // Actual page markup, common refusal component, shared session bar and sheet.
 for(const language of ['fr','en','es']){
  const q=page(language);q.run('i18n-messages-origin.js');q.run('i18n.js');q.run('touch-shell.js');
  const calls=[];let reject=null;
  q.window.cncJobControls.origin=body=>{calls.push(body);return reject?Promise.reject(reject):Promise.resolve({nonce:'n',expiresIn:15,generation:'gen-1'});};
  q.run('real-motion.js');const send=patch=>q.emit('cnc-job-status',{machine:state(patch),transportConnected:true,pilot:{state:'free'},simulation:false});
  send();q.window.cncShell.go('jog');
  assert([...q.document.querySelectorAll('#screen-jog .jog')].every(b=>!b.disabled),'cross active without another tap');
  for(const id of ['jog-read-settings','jog-msg','jog-controller','ks-origin-info','pv2-jog-open','pv2-tool-zero'])assert.equal(q.node(id),null,id+' removed');
  q.node('jog-zero-x').click();await flush();const here=q.node('real-motion-origin-confirm').textContent;assert.notEqual(here,q.window.cncI18n.t('Mettre le zéro {axes} à l’origine machine').replace('{axes}','X'));q.node('real-motion-origin-cancel').click();
  q.node('zero-more-open').click();assert.equal(q.node('ks-zero-more').hidden,false);
  for(const [patch,code,remedy] of [[{homed:false},'ETOUCH_ORIGIN_NOT_HOMED','prise-origine'],[{workOffset:{state:'failed',code:'ETOUCH_OFFSET_UNCONFIRMED'}},'ETOUCH_OFFSET_UNCONFIRMED','verifier-zero'],[{workOffset:null},'ETOUCH_OFFSET_UNCONFIRMED','verifier-zero']]){
   send(patch);assert(q.node('zero-at-machine-x').disabled);const cause=q.node('zero-more-cause');assert(cause.textContent.includes(q.window.cncRefus.lire({code}).phrase),language+" "+code+" actual: "+cause.textContent);assert(cause.textContent.includes(q.window.cncSeance.libelle(remedy)));
  }
  send();reject={code:'ETOUCH_ORIGIN_OFFSETS',params:{},message:'technical G92/TLO'};q.node('zero-at-machine-x').click();await flush();
  assert(q.node('zero-at-machine-x').disabled,'server refusal stripes its own axis');assert(!q.node('zero-at-machine-y').disabled,'other axes retain their own guard');
  assert(q.node('zero-more-cause').textContent.includes(q.window.cncRefus.lire(reject).phrase));assert(q.node('zero-more-cause').textContent.includes(q.window.cncI18n.t('Détails')));
  reject=null;send({coordinates:{mpos:{x:-99,y:-50,z:-2},wpos:{x:13.5,y:3,z:1}}});assert(!q.node('zero-at-machine-x').disabled,'changed inputs clear the refusal');
  reject={code:'ETOUCH_MOTION_POSITION_UNKNOWN',params:{axis:'X'},message:'unknown position'};q.node('zero-at-machine-x').click();await flush();assert(!q.node('zero-at-machine-x').disabled,'a request-only refusal does not invent a persistent permission');assert(q.node('zero-more-cause').textContent.includes(q.window.cncRefus.lire(reject).phrase));
  reject=null;q.node('zero-at-machine-x').click();await flush();assert(!q.node('real-motion-ticket').hidden,'retry uses a fresh ticket');q.node('real-motion-origin-cancel').click();
  q.window.cncShell.closeSheet();q.node('zero-machine-open').click();assert(q.node('ks-details').textContent.includes('-99')||q.node('ks-details').textContent.includes('−99'));
  q.window.cncShell.closeSheet();send({homed:false,capabilities:{...state().capabilities,jog:{...state().capabilities.jog,steps:[0.1,1]},jogContinuous:{enabled:false}}});
  for(const step of q.document.querySelectorAll('#steps .step')){assert(!step.hidden);if(!['0.1','1'].includes(step.getAttribute('data-step')))assert(step.disabled);}
  assert(q.node('step-jog-cause').textContent.includes(q.window.cncSeance.state().globale.texte),language+' bar: '+q.node('step-jog-cause').textContent+' / '+q.window.cncSeance.state().globale.texte);assert.equal(q.node('step-jog-remedy').getAttribute('data-action'),'prise-origine');
  q.advance(3100);q.emit('cnc-screen-change','jog');assert(q.node('step-jog-cause').textContent.includes(q.window.cncRefus.lire({code:'ETOUCH_MACHINE_STALE'}).phrase),'elapsed freshness precedes the homing remedy');
  send({workOffset:{state:'checking'}});assert.equal(q.node('step-jog-state').textContent,q.window.cncI18n.t('À vérifier'));assert(!q.node('step-jog-main').disabled,'Control is always a navigation');
  send({motion:{...state().motion,lastJog:{at:3,result:'refused',reason:'error:15',message:'Grbl a refusé le jog (error:15)',axis:'X'}}});
  assert(q.node('step-jog-cause').textContent.includes(q.window.cncI18n.t('La machine a refusé le déplacement (erreur {n}).').replace('{n}','15')),'late Grbl refusal stays visible in the stage bar');
  send({activeState:'Alarm',fresh:false,motion:{...state().motion,cancelUnconfirmed:true}});
  assert(q.node('step-jog-cause').textContent.includes(q.window.cncI18n.t('ANNULATION NON CONFIRMÉE : utilisez l’arrêt physique si la machine bouge encore')),'physical stop warning wins over all other causes');
  send();q.window.cncProfile.kind=()=> 'laser';q.run('laser-z.js');q.window.cncLaserZ.choose(false);q.emit('cnc-profile-change');
  assert.equal(q.node('jog-zero-xyz').getAttribute('data-axis'),'xy');assert(q.node('jog-zero-xyz').textContent.includes(q.window.cncI18n.t('Zéro XY ici')));q.window.cncLaserZ.choose(true);assert.equal(q.node('jog-zero-xyz').getAttribute('data-axis'),'xyz');
  q.emit('pagehide');assert(calls.length>=2);
 }
 for(const [lang,setWord,context] of [['fr','Posé à','bloc XYZ'],['en','Set at','block XYZ'],['es','Fijado a las','bloque XYZ']]){
  const evaluate=require('./session-fixture.cjs').pure(lang).evaluate;
  const m=state({motion:{...state().motion,lastOrigin:{at:1000,axes:['X']}},blockProbe:{state:'done',written:'yes',endedAt:2000,operation:'XYZ'},zeroZ:{at:3000,failed:'failed'}});
  const result=evaluate({machine:m,transportConnected:true,pilot:{state:'free'}});assert(result.etapes.jog.mot.startsWith(setWord));assert.equal(result.etapes.jog.contexte,context);assert.equal(result.barres.jog.action.id,'suite:check');
  assert.notEqual(evaluate({machine:{...m,homed:false},transportConnected:true}).etapes.jog.etat,'fait','a contradictory proven field cannot preserve a mark after reference loss');
  assert.equal(evaluate({machine:{...m,workOffset:undefined},transportConnected:true}).etapes.jog.mot,require('./session-fixture.cjs').pure(lang).window.cncI18n.t('À vérifier'));
 }
 console.log('PASS machine zero: real transport at/axis/nonce, distinct dialogs in FR/EN/ES, conservative homing/D2/offset refusals with remedies, permanent cross/steps and Details.');
})().catch(e=>{console.error(e);process.exitCode=1;});
