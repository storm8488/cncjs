'use strict';
const assert=require('assert').strict,fs=require('fs');
const {fixture,machine}=require('./probe-page-fixture.cjs');
const model=require('./touch/zero-piece.js');
(async()=>{
 for(const language of ['fr','en','es']){
  const q=fixture({language,plate:{thickness:5,search:10}}),$=q.node,t=q.window.cncI18n.t;
  assert.equal(q.document.querySelectorAll('section[id^="screen-probe"]').length,0);
  for(const id of ['home-plate','home-plate-probe','probe-wcs','probe-message','probe-availability','probe-zero-z','probe-preparation-open'])assert.equal($(id),null,id+' removed');
  assert.equal($('probe-start').textContent,t('Palper au bloc {axes}…').replace('{axes}','XYZ'));
  q.document.querySelector('[data-probe-operation="Z"]').click();assert($('probe-diameter').disabled);assert($('probe-diameter-reason').textContent.includes(t('Le diamètre ne sert pas pour Z.')));
  q.window.cncShell.go('files');q.window.cncShell.go('jog');assert.equal(q.document.querySelector('[data-probe-operation="XYZ"]').getAttribute('aria-pressed'),'true');
  $('probe-start').click();assert($('probe-start').disabled);assert(!$('probe-phase').hidden);assert.equal($('probe-phase').textContent,t('Vérification…'));await q.flush();assert.equal(q.calls.at(-1).op,'blockProbe');assert.equal(q.calls.at(-1).body.axes,'XYZ');assert.equal(q.calls.at(-1).body.wcs,'G54');
  const error={code:'ETOUCH_PROBE_TRAVEL',params:{axis:'Y',min:-5.9,max:35.9,low:0,high:395},message:'technical travel'};
  q.answer({opened:false,error});$('probe-start').click();await q.flush();assert(!$('probe-start').disabled,'request-only refusal preserves server permission');assert($('probe-cause').textContent.includes('5'));assert($('probe-cause').textContent.includes('Y'));assert($('probe-cause').textContent.includes(t('Détails')));assert(!$('probe-cause').hidden);
  q.send();assert(!$('probe-cause').hidden,'same geometry retains refusal');
  q.send({coordinates:{mpos:{x:101,y:100,z:-20}}});assert($('probe-cause').hidden,'changed position clears refusal');
  q.answer({opened:false,error:{code:'ETOUCH_PROBE_WINDOW',params:{},message:'window'}});$('probe-start').click();await q.flush();assert(!$('probe-diagram-host').hidden);assert.equal($('probe-diagram-host').getAttribute('data-highlight'),'true');
  assert($('probe-diagram-host').textContent.includes(q.window.cncRefus.lire({code:'ETOUCH_PROBE_WINDOW'}).phrase));
  q.answer({opened:false,error:{code:'ETOUCH_PROBE_PARAM',params:{field:'fast'},message:'technical parameter'}});$('probe-start').click();await q.flush();assert($('probe-cause').textContent.includes(t('Vitesse d’approche')),'parameter named in workshop terms');
  q.send({canBlockProbe:false,canZeroZ:false,refusals:{blockProbe:{code:'ETOUCH_PROBE_CONTACT_STUCK'},zeroZ:{code:'ETOUCH_PROBE_CONTACT_STUCK'}},probeInput:{fresh:true,ageMs:0,state:'contact',code:'EXPLICIT',stuck:true,test:{stage:'contact',done:false}}});
  assert($('probe-start').disabled);assert($('probe-plate-start').disabled);assert(!$('probe-plate-start').hidden);assert.equal($('probe-signal').textContent,t('! Touche en permanence'));assert($('probe-cause').textContent.includes(t('Pourquoi ?')));
  q.send({}, {pilot:{state:'other',name:'PC'}});assert($('probe-start').disabled);assert($('probe-cause').textContent.includes(q.window.cncSeance.libelle('prendre-la-main')));
  q.send({canBlockProbe:false,refusals:{blockProbe:{code:'ETOUCH_OFFSET_CHECKING'}},workOffset:{state:'checking'}});assert($('probe-cause').textContent.includes(t('La machine vérifie le zéro pièce. Attendez quelques secondes.')));
  q.send({canStop:true,probing:true,blockProbe:{state:'running',step:{index:8,total:22,code:'X_FAST'},written:'no'}});
  assert($('probe-start').hidden);assert(!$('probe-stop').hidden);assert($('probe-plate-start').disabled);assert($('probe-phase').textContent.includes('8 / 22'));$('probe-stop').click();assert.equal(q.calls.at(-1).op,'stop');
  q.send({canStop:true,probing:true,blockProbe:{state:'stopping',written:'no',failure:{code:'ETOUCH_PROBE_STOPPED'}}});assert($('probe-phase').textContent.includes(t('Arrêt en cours…')));
  q.send({canBlockProbe:false,blockProbe:{state:'done',written:'yes',axes:'XYZ',work:{x:0,y:0,z:10},endedAt:200}});assert($('probe-outcome').textContent.includes('Z 10'));assert(!$('probe-outcome').hidden);assert.equal($('step-jog-context').textContent,t('bloc {axes}').replace('{axes}','XYZ'));
  $('screen-jog').click();assert($('probe-outcome').hidden,'next screen touch dismisses the outcome');
  q.send({zeroZ:{at:300,thickness:5}});assert($('probe-outcome').textContent.includes(t('Zéro Z posé à la plaque. X et Y n’ont pas changé.')));
  q.send({canZeroZ:false,zeroZReason:'busy',finished:true,refusals:{zeroZ:{code:'ETOUCH_PROBE_CONTACT_STUCK'}}});assert(!$('home-finish-plate').hidden);assert($('home-finish-plate-start').disabled);assert($('home-finish-plate').textContent.includes(t('Pourquoi ?')));
  q.send({operator:{wcs:'G58',reportUnits:'mm',spindle:'M5'}});q.answer({opened:true,error:null});$('probe-start').click();await q.flush();assert.equal(q.calls.at(-1).body.wcs,'G58','active frame only');
  q.send({machineProfile:{kind:'laser'}});assert($('probe-card').hidden);
  q.send({machineProfile:{kind:'cnc'}});assert(!$('probe-card').hidden);
 }
 const q=fixture({empty:true});q.node('probe-start').click();assert(!q.node('ks-probe-setup').hidden);assert.equal(q.calls.length,0,'missing measurements are navigation, no server request');
 for(const operation of ['blockProbe','zeroZ']){
  const retry=fixture({plate:{thickness:5,search:10}});let starts=0;
  retry.window.cncJobControls.start=()=>{starts++;return Promise.resolve({opened:true});};
  retry.window.cncSeance.lancer('demarrer');
  retry.answer({opened:false,error:{code:'ETOUCH_PROBE_WCS'}});
  const id=operation==='blockProbe'?'probe-start':'probe-plate-start';retry.node(id).click();await retry.flush();
  const before=JSON.stringify(retry.calls.at(-1));
  retry.node('probe-cause').querySelectorAll('button').find(b=>b.textContent===retry.window.cncI18n.t('Recommencer')).click();await retry.flush();
  assert.equal(starts,1,'retry never replays the previous Start command');
  assert.equal(JSON.stringify(retry.calls.at(-1)),before,'retry preserves the refused operation and parameters');
  assert.equal(retry.calls.filter(c=>c.op===operation).length,2,'a retry only prepares a new confirmation');
  if(operation==='blockProbe'){
   retry.node('probe-plate-start').click();await retry.flush();
   const plateRequest=JSON.stringify(retry.calls.at(-1));
   retry.node('probe-cause').querySelectorAll('button').find(b=>b.textContent===retry.window.cncI18n.t('Recommencer')).click();await retry.flush();
   assert.equal(JSON.stringify(retry.calls.at(-1)),plateRequest,'identical refusal code is rebound to the latest request');
  }
 }
 for(const [b,part,remedy] of [
  [{state:'failed',written:'no',failure:{code:'ETOUCH_PROBE_STOPPED'}},'Palpage arrêté. Le zéro pièce n’a pas changé.','relancer-palpage'],
  [{state:'failed',written:'no',failure:{code:'ETOUCH_PROBE_NO_CONTACT'}},'Le zéro pièce n’a pas changé.',null],
  [{state:'failed',written:'uncertain'},'Le zéro pièce est peut-être changé : refaites-le.','relancer-palpage'],
  [{state:'failed',written:'no',needsHoming:true,failure:{code:'ETOUCH_PROBE_PAUSED'}},'La machine a perdu sa position.','remise-en-route']]){
  const out=model.outcome(machine({blockProbe:b}));assert(out.text.includes(part));assert.equal(out.remedy,remedy);
 }
 const index=fs.readFileSync(__dirname+'/touch/index.html','utf8');assert(!index.includes('probe-ui.js'));assert(!index.includes('probe-preparation.js'));assert(index.includes('zero-piece.js'));
 const failedPlate=model.outcome(machine({homed:false,zeroZ:{at:20,failed:'lost'}}));assert.equal(failedPlate.remedy,'remise-en-route');assert(failedPlate.text.includes('La machine a perdu sa position.'));
 const detail=fixture();detail.send({blockProbe:{state:'done',written:'yes',axes:'XYZ',endedAt:200,contacts:{X:93,Y:92,Z:-119.565},origin:{X:105.9,Y:104.9,Z:-124.565},values:{X:0,Y:0,Z:10},command:'G10 L20 P1 X0 Y0 Z10',work:{x:0,y:0,z:10}}});
 detail.node('probe-outcome').querySelector('button').click();assert(!detail.node('ks-details').hidden);assert(detail.node('ks-details').textContent.includes('93.000'));assert(detail.node('ks-details').textContent.includes('G10 L20 P1 X0 Y0 Z10'));assert(detail.node('ks-details').textContent.includes('G54'));
 detail.window.cncShell.closeSheet();detail.window.cncZeroPiece.failure({written:'uncertain',needsHoming:true,failure:{code:'ETOUCH_PROBE_WRITE_UNCERTAIN'}},machine());assert(detail.node('probe-outcome').textContent.includes('La machine a perdu sa position.'));
 console.log('PASS zero piece: permanent card, XYZ arrival, server permissions and refusal remedies, geometry invalidation, plan/window, active WCS, progress/direct stop, all outcomes and plate entry points in FR/EN/ES.');
})().catch(e=>{console.error(e);process.exitCode=1;});
