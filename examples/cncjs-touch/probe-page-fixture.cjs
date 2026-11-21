'use strict';
const {page}=require('./session-dom-fixture.cjs');
const profile={name:'Workshop block',corner:'--',directionX:1,directionY:1,thickness:5,faceX:-9.9,faceY:-9.9,fast:100,slow:25,search:10,retract:1,clearance:5};
function machine(patch={}){return Object.assign({port:'COM3',generation:'gen-1',fresh:true,activeState:'Idle',workflow:'idle',spindleSpeed:0,homed:true,firmware:'Grbl',settingsCount:34,operator:{wcs:'G54',reportUnits:'mm',spindle:'M5'},machineProfile:{kind:'cnc'},workOffset:{state:'proven'},canBlockProbe:true,canZeroZ:true,canStop:false,canSpindleStop:true,canLoad:true,blockProbe:null,zeroZ:null,probing:false,coordinates:{mpos:{x:100,y:100,z:-20}},probeInput:{fresh:true,ageMs:0,state:'free',code:'EXPLICIT',stuck:false,lastContactAgeMs:null,test:{stage:'free',done:true}}},patch);}
function fixture(options={}){
 const q=page(options.language||'fr'),calls=[],pads=[];let answer={opened:true,error:null};
 q.window.cncJobControls.dispose();
 // The session fixture starts the real owner with no transport. Ignore its pending bootstrap rejection; this fixture injects snapshots explicitly.
 const dispatch=q.window.dispatchEvent;q.window.dispatchEvent=e=>{if(e.type==='cnc-job-status'&&!e.detail.machine)return;return dispatch(e);};
 if(!options.empty)q.context.localStorage.setItem('cnc-touch-probes-v1-real',JSON.stringify({version:1,profiles:[options.profile||profile],selected:0,removed:null,diameter:options.diameter===undefined?6:options.diameter}));
 if(options.rawStorage!==undefined)q.context.localStorage.setItem('cnc-touch-probes-v1-real',options.rawStorage);
 const ready=q.document.createElement('p');ready.id='home-job-ready';q.node('screen-home').appendChild(ready);
 if(options.plate)q.context.localStorage.setItem('cncjs-touch-plate-v1',JSON.stringify(options.plate));
 for(const f of ['i18n-messages-machine.js','i18n-messages-profiles.js','i18n.js','numeric-pad.js','job-resume.js','probe-model.js','probe-transfer.js','probe-profiles.js','profile-storage.js','probe-real.js','probe-diagram.js','touch-shell.js'])q.run(f);
 const bind=q.window.CNCNumeric.bind;q.window.CNCNumeric.bind=(input,rules)=>{pads.push({input,rules});bind(input,rules);};
 q.window.cncJobControls.prepareCommand=(op,body)=>{calls.push({op,body:JSON.parse(JSON.stringify(body))});return Promise.resolve(typeof answer==='function'?answer():answer);};
 q.window.cncJobControls.stop=()=>{calls.push({op:'stop'});return Promise.resolve({});};
 q.window.cncJobControls.spindleStop=()=>{calls.push({op:'spindleStop'});return Promise.resolve({});};
 q.run('zero-piece.js');
 const send=(patch={},extra={})=>q.emit('cnc-job-status',Object.assign({machine:machine(patch),simulation:false,transportConnected:true,pilot:{state:'mine'},busy:false},extra));
 const input=(id,value)=>{const n=q.node(id);n.value=String(value);(n.handlers.change||[]).forEach(f=>f.call(n));};
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
 send();q.window.cncShell.go('jog');return Object.assign(q,{calls,pads,send,input,flush,answer:a=>answer=a});
}
module.exports={fixture,machine,profile};
