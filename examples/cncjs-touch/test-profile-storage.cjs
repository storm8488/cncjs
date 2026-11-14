const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const store=require('./touch/profile-storage');
function memory(initial=null){let value=initial;return {getItem:()=>value,setItem:(_,next)=>{value=next;}};}
let storage=memory(),a=store.open(storage,'profiles'),b=store.open(storage,'profiles');
a.write({name:'First'});assert.equal(a.read(),'{"name":"First"}');
assert.throws(()=>b.write({name:'Stale'}),/autre onglet/);assert.equal(storage.getItem(),'{"name":"First"}');
a.write({name:'Updated'});assert.equal(storage.getItem(),'{"name":"Updated"}');
b=store.open(storage,'profiles');b.write({name:'Other page'});assert.throws(()=>a.write({name:'Overwrite'}),/autre onglet/);
storage.setItem('',null);assert.throws(()=>b.write({name:'Restore stale'}),/autre onglet/);
storage=memory('old');a=store.open(storage,'profiles');storage.setItem=()=>{};
assert.throws(()=>a.write({name:'Silent failure'}),/confirmée/);assert.equal(a.read(),'old');
storage.setItem=()=>{throw Error('QuotaExceededError');};assert.throws(()=>a.write({}),/Quota/);assert.equal(a.read(),'old');
assert.throws(()=>store.open({getItem(){throw Error('denied');}},'profiles'),/denied/);

// Exercise the actual UI write paths with malformed and valid persisted profiles.
const model=require('./touch/probe-model'),transfer=require('./touch/probe-transfer'),manager=require('./touch/probe-profiles');
function ui(initial){
 const dom=require('./dom-fixture.cjs').createDOM([]),events={},storage=memory(initial);
 dom.document.body.setAttribute('data-simulation','true');
 dom.node('probe-confirm').parentElement=dom.document.body;
 const window={CNCProbe:model,CNCProbeTransfer:transfer,CNCProbeProfiles:manager,CNCProfileStorage:store,addEventListener(n,f){events[n]=f;},dispatchEvent(e){if(events[e.type])events[e.type](e);}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/probe-ui.js','utf8'),{window,document:dom.document,localStorage:storage,Date,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},setInterval(){throw Error('No cycle allowed');}});
 return {...dom,storage,events};
}
const valid=JSON.stringify({version:1,profiles:[model.empty()],selected:0,diameter:null,removed:null});
let screen=ui(valid);screen.node('probe-profile').value='0';screen.node('probe-profile').handlers.change.call(screen.node('probe-profile'));
assert.equal(JSON.parse(screen.storage.getItem()).profiles[0].name,'Nouvelle sonde');
screen.storage.setItem('',valid.replace('Nouvelle sonde','Other tab'));
screen.node('probe-profiles').click();screen.node('probe-new').click();assert.equal(JSON.parse(screen.storage.getItem()).profiles.length,1);
assert.match(screen.node('probe-profile-status').textContent,/autre onglet/);
for(const invalid of ['{',JSON.stringify({version:2,profiles:[model.empty()]}),JSON.stringify({version:1,profiles:[{...model.empty(),thickness:-1}]})]){
 screen=ui(invalid);screen.node('probe-profiles').click();screen.node('probe-new').click();assert.equal(screen.storage.getItem(),invalid);
 assert.match(screen.node('probe-profile-status').textContent,/illisible/);
}
for(const name of ['index.html','simulation.html']){
 const html=fs.readFileSync(__dirname+'/touch/'+name,'utf8');assert(html.indexOf('profile-storage.js')>=0);assert(html.indexOf('profile-storage.js')<html.indexOf('probe-ui.js'));
}
console.log('PASS: stale-tab writes rejected, own writes advance baseline, readback/permission/quota failures, actual UI save guard and invalid storage preserved.');
// The probe measures take the shared numeric pad: the kiosk has no system keyboard.
{
 const dom=require('./dom-fixture.cjs').createDOM([]),bound=[];
 dom.document.body.setAttribute('data-simulation','true');dom.node('probe-confirm').parentElement=dom.document.body;
 // The fixture does not parse innerHTML: the profile editor's fields as probe-ui.js writes them (inputs and one select).
 const fieldNodes=[...Object.keys(model.fields).map((k)=>({tagName:'INPUT',value:'',k})),{tagName:'SELECT',value:'',k:'corner'}].map((n)=>Object.assign(n,{getAttribute:(a)=>(a==='data-probe-field'?n.k:null),parentElement:{textContent:'Champ '+n.k},addEventListener(){}}));
 const qsa=dom.document.querySelectorAll;dom.document.querySelectorAll=(sel)=>(sel==='[data-probe-field]'?fieldNodes:qsa.call(dom.document,sel));
 const window={CNCProbe:model,CNCProbeTransfer:transfer,CNCProbeProfiles:manager,CNCProfileStorage:store,CNCNumeric:{bind(el,rules){bound.push([el,rules]);}},addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/probe-ui.js','utf8'),{window,document:dom.document,localStorage:memory(valid),Date,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},setInterval(){throw Error('No cycle allowed');}});
 const fields=bound.map(([el])=>el.getAttribute('data-probe-field')||el.id);
 for(const k of Object.keys(model.fields))assert(fields.includes(k),'numeric pad on probe field '+k+' ('+fields+')');
 assert(fields.includes('probe-diameter'),'numeric pad on the tool diameter');
 assert(!fields.includes('corner'),'selects keep their list');
 const rules=Object.fromEntries(bound.map(([el,r])=>[el.getAttribute('data-probe-field')||el.id,r]));
 assert.equal(rules.thickness.min,0.001);assert.equal(rules.faceX.negative,true);assert.equal(rules.fast.unit,'mm/min');
 console.log('PASS: probe measures and tool diameter open the numeric pad, with their limits and units.');
}
