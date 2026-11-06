'use strict';
const assert = require('assert').strict;
const {page} = require('./test-v2-gate.cjs');
const ME = require('./touch/motion-estimate.js');
const plain = x => JSON.parse(JSON.stringify(x));
async function fixture(options) {
  const p = page(options);
  if (options && options.language) { p.values.set('cncjs-touch-language-v1',options.language); p.run('i18n.js'); }
  p.status(); p.frame(); await p.complete(); p.run('performance-sequences.js');
  const identity = p.api.identity && p.api.identity.create({role:'loaded',file:'piece.nc',fingerprint:'sha256:a',controller:'A',generation:'g1',revision:1});
  return {p, identity, provider:p.api.use ? p.api.use('sequences') : null};
}
(async () => {
  const {p, identity, provider} = await fixture();
  const requests = p.requests.length;
  assert(!provider.stub, 'real provider replaces the L0 stub');
  const prepared = ME.sequences('(operation: Poche)\nG54\nG1 X1 F100\nG1 X2\nM0\nG0 Z2\nG1 X3\nT2\nM6');
  provider.update({identity,geometryKey:'geo:1',prepared});
  assert.equal(provider.snapshot().available,true); assert(Object.isFrozen(provider.snapshot().items));
  assert.equal(provider.snapshot().current,null, 'a prepared file is not an observed machining position');
  assert.equal(p.window.CNCPerformanceSequences.label(null),'Séquence indéterminée');
  const anchor = (line, extra = {}) => Object.assign({identity,geometryKey:'geo:1',anchor:{source:'reported-position',sourceLine:line,ambiguous:false},
    time:p.api.time.stamp(),reportAgeMs:0,units:'mm',wcs:'G54'},extra);
  provider.update(anchor(3));
  assert.equal(provider.snapshot().current.label,'Poche'); assert.equal(provider.snapshot().current.estimated,true);
  assert.equal(provider.snapshot().next.label,'Pause M0'); assert.equal(provider.upcoming().label,'Pause M0');
  assert.equal(provider.snapshot().current.lastLine,4);
  const notifications = p.events.filter(e => e.type === 'cnc-v2-data' && e.detail.slot === 'sequences').length;
  provider.update(anchor(4)); provider.update(anchor(4));
  assert.equal(p.events.filter(e => e.type === 'cnc-v2-data' && e.detail.slot === 'sequences').length,notifications,'unchanged attachment does not rescan/publish all metadata per report');
  assert.deepEqual(Object.keys(plain(provider.snapshot())).sort(), ['version','available','identity','geometryKey','current','next','items'].sort());
  provider.update({identity,geometryKey:'geo:1',line:7,acknowledgement:{line:7,meaning:'accepted-not-machined'}});
  assert.equal(provider.snapshot().current,null,'acknowledgement alone never selects a current sequence');
  provider.update(anchor(7)); assert.equal(provider.snapshot().current.firstLine,7, 'resume uses original source numbering');
  assert.equal(provider.snapshot().next.kind,'tool');
  const frozen = plain(provider.snapshot().items); p.status({workflow:'running',activeState:'Run'});
  provider.update(anchor(3)); assert.equal(provider.snapshot().current.label,'Poche','already prepared metadata can be attached during work');
  provider.update({identity,geometryKey:'geo:2',prepared:ME.sequences('G1 X100 F1')});
  assert.deepEqual(plain(provider.snapshot().items),frozen,'no preparation or replacement during work');
  assert.equal(provider.snapshot().geometryKey,'geo:1');
  p.advance(2501); assert.equal(provider.snapshot().current,null,'monotone expiry works without another packet'); assert.equal(provider.snapshot().next,null);
  for (const extra of [{anchor:{source:'acknowledgement',sourceLine:3,ambiguous:false}},
    {anchor:{source:'reported-position',sourceLine:3,ambiguous:true}}, {reportAgeMs:null}, {units:'in'}, {wcs:null},
    {geometryKey:'wrong'}, {identity:p.api.identity.create({role:'selection',file:'piece.nc',fingerprint:'sha256:a'})}]) {
    provider.update(anchor(3,extra)); assert.equal(provider.snapshot().current,null,JSON.stringify(extra));
  }
  p.status(); provider.update({identity,geometryKey:'geo:ambiguous',prepared:ME.sequences('G54\nG1 X1 F100\nG55\nG1 X2')});
  provider.update(anchor(4,{geometryKey:'geo:ambiguous',wcs:'G55'})); assert.equal(provider.snapshot().current,null,'unsupported frame attachment remains ambiguous');
  provider.update({identity,geometryKey:'geo:future',prepared:ME.sequences('G54\nG1 X1 F100\nG55\nM0')});
  provider.update(anchor(2,{geometryKey:'geo:future'})); assert.equal(provider.snapshot().current.firstLine,2);
  assert.equal(provider.snapshot().next,null,'an uncertain future event is not promised');
  assert.equal(provider.upcoming(),null,'upcoming does not skip across unsupported control flow');
  p.status({fingerprint:'changed',revision:2}); assert.equal(provider.snapshot().available,false); assert.equal(provider.snapshot().items.length,0);
  provider.update({identity,geometryKey:'old',prepared}); assert.equal(provider.snapshot().available,false,'late result from another revision cannot publish');
  assert.equal(p.requests.length,requests,'provider issues no requests after bootstrap');
  for (const [event, detail] of [['cnc-screen-lock',true],['doc:visibilitychange',null],['pagehide',{}]]) {
    const f = await fixture(); f.provider.update({identity:f.identity,geometryKey:'g',prepared});
    if(event === 'doc:visibilitychange') { f.p.document.hidden=true; f.provider.cancel('document-hidden'); }
    else f.p.emit(event,detail);
    assert.equal(f.provider.snapshot().current,null);
    if(event === 'pagehide') assert.equal(f.provider.snapshot().items.length,0);
  }
  const eco = await fixture(); eco.p.window.cncProfile.setPerformance('eco'); assert(eco.p.api.use('sequences').stub);
  const off = await fixture({profile:'eco'}); assert(!off.p.api.use || off.provider.stub, 'ineligible profiles never install a provider');
  const late = page(); late.status(); late.frame(); await late.step(); await late.step();
  const loadedId = late.api.identity.create({role:'loaded',file:'piece.nc',fingerprint:'sha256:a',controller:'A',generation:'g1',revision:1});
  const borrowed = {identity:loadedId,geometryKey:'borrowed',prepared};
  late.api.register('geometry',{snapshot:()=>({version:1,available:true,geometryKey:'borrowed',wcs:'G54'}),prepared:()=>borrowed,update(){},cancel(){},dispose(){}});
  assert(late.api.use('sequences').stub, 'geometry exists before the sequences provider loads');
  await late.complete();
  assert.equal(late.api.use('sequences').snapshot().geometryKey,'borrowed','late-loaded provider adopts existing idle worker metadata');
  const borrowedItems = late.api.use('sequences').snapshot().items;
  late.api.notify('geometry'); assert.equal(late.api.use('sequences').snapshot().items,borrowedItems,'same geometry is not cloned again after its data notification');
  for (const [language,unknown,group,tool,pause] of [
    ['fr','Séquence indéterminée','Séquence 2','Changement d’outil T7','Pause optionnelle M1'],
    ['en','Indeterminate sequence','Sequence 2','Tool change T7','Optional pause M1'],
    ['es','Secuencia indeterminada','Secuencia 2','Cambio de herramienta T7','Pausa opcional M1']]) {
    const f=await fixture({language}), labels=f.p.window.CNCPerformanceSequences;
    assert.equal(labels.label(null),unknown,'runtime unknown translation '+language);
    assert.equal(labels.label({kind:'group',provenance:'inferred',label:'Séquence 2'}),group);
    assert.equal(labels.label({kind:'tool',provenance:'declared',label:'Changement d’outil T7'}),tool);
    assert.equal(labels.label({kind:'pause',provenance:'declared',label:'Pause optionnelle M1'}),pause);
    assert.equal(labels.label({kind:'group',provenance:'declared',label:'Poche'}),'Poche','CAM names remain literal');
  }
  const ecoLanguage=await fixture({profile:'eco',language:'en'});
  assert.equal(ecoLanguage.p.window.cncI18n.t('Séquence indéterminée'),'Séquence indéterminée','Eco registers no v2 sequence catalogue');
  console.log('PASS v2 sequences provider: exact L0 model, identity/revision, unique reported attachment, monotone expiry, no acknowledgement inference, no reads and lifecycle release.');
})().catch(error => {console.error(error);process.exitCode=1;});
