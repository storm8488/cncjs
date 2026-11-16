'use strict';
const assert=require('assert').strict,{load}=require('./job-controls-fixture.cjs');
(async()=>{
 for(const language of ['fr','en','es'])for(const [op,name,body,label] of [
  ['home','Prise d’origine ($H)',{},'Prise d’origine machine…'],
  ['unlock','Déverrouillage ($X)',{},'Déverrouiller'],
  ['spindle','Test broche M3 S500',{},'Démarrer la broche'],
  ['zeroZ','Zéro Z avec plaque de 5 mm (recherche 10 mm)',{thickness:5,search:10},'Zéro Z à la plaque'],
  ['blockProbe','Palpage XYZ au bloc, repère G54',{axes:'XYZ'},'Palper le bloc XYZ'],
  ['macro','Custom $H macro',{},'Custom $H macro'],
  ['start','My G54 file.nc',{},'My G54 file.nc']
 ]){
  const f=load({language,catalogs:['i18n-messages-origin.js','i18n-messages-profiles.js','i18n-messages-machine.js']});
  await f.connect(f.machine({canHome:true,canUnlock:true,canSpindleTest:true,canZeroZ:true,canBlockProbe:true,canMacro:true}));
  let opening;
  if(op==='macro')opening=f.controls().prepareMacro('custom');else if(op==='start')opening=f.controls().start();else opening=f.controls().prepareCommand(op,body);
  f.answer(f.posts().at(-1),{nonce:'ticket',name,expiresIn:15,blockProbe:op==='blockProbe'?{axes:'XYZ'}:undefined});
  await opening;
  const expected=op==='blockProbe'?f.window.cncI18n.t('Palper le bloc {axes}').replace('{axes}','XYZ'):f.window.cncI18n.t(label);
  assert.equal(f.el('job-dialog-file').textContent,expected,language+' '+op+' operation subtitle');
  assert(f.el('job-dialog-file').getAttribute('data-details').includes(name),'exact server name is kept in Details');
  assert(f.el('job-confirm').disabled,'the confirmation box stays required');
  f.controls().dispose();
 }
 console.log('PASS confirmation labels: actual server names translated by operation, raw details and user names preserved in FR/EN/ES.');
})().catch(e=>{console.error(e);process.exitCode=1;});
