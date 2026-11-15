'use strict';
const {page}=require('./session-dom-fixture.cjs');
function check(verdict='validated',patch={}){
 const axes={};for(const [axis,min,max,low,high] of [['X',10,100,0,407.5],['Y',10,80,0,395.5],['Z',-20,0,-129.5,0]])axes[axis]={axis,verdict:'validated',min,max,machineMin:min,machineMax:max,usable:{low,high}};
 return Object.assign({verdict,axes,zMin:-20,blocking:[],codedReasons:[],info:[],overridable:false},patch);
}
function machine(patch={}){return Object.assign({port:'COM3',generation:'g1',revision:'r1',name:'loaded.nc',originalName:'Loaded.nc',fresh:true,firmware:'Grbl',settingsCount:34,homed:true,referenceLost:null,activeState:'Idle',workflow:'idle',spindleSpeed:0,workOffset:{state:'proven',canVerify:true},canStart:true,canLoad:true,canHome:true,canReadSettings:true,canRapidOverride:true,overrides:{rapid:50},machineProfile:{kind:'cnc'},programCheck:check()},patch);}
function fixture(language='fr'){
 const q=page(language),requests=[],calls=[];q.window.cncJobControls.dispose();
 const dispatch=q.window.dispatchEvent;q.window.dispatchEvent=e=>{if(e.type==='cnc-job-status'&&!e.detail.machine)return;return dispatch(e);};
 q.window.cncProfile.kind=()=> 'cnc';q.window.cncProfile.performance=()=> 'eco';
 q.run('program-check-view.js');q.run('job-dashboard.js');q.run('touch-shell.js');
 const controls=q.window.cncJobControls;
 controls.checkFile=file=>new Promise((resolve,reject)=>requests.push({file,resolve,reject}));
 controls.start=()=>{calls.push({op:'start'});return Promise.resolve({opened:true});};
 controls.startOverride=()=>{calls.push({op:'override'});return Promise.resolve({opened:true});};
 controls.load=file=>{calls.push({op:'load',file});return Promise.resolve();};
 controls.loadFrom=(file,line)=>{calls.push({op:'loadFrom',file,line});return Promise.resolve();};
 controls.override=(kind,value)=>{calls.push({op:'rapid',kind,value});return Promise.resolve();};
 controls.prepareFrame=()=>calls.push({op:'frame'});
 q.run('check-screen.js');
 const send=(patch={},extra={})=>q.emit('cnc-job-status',Object.assign({machine:machine(patch),simulation:false,transportConnected:true,pilot:{state:'mine'},busy:false},extra));
 const select=file=>{q.window.cncLibrarySelection={file,name:file};q.emit('cnc-library-select',q.window.cncLibrarySelection);};
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
 send();q.window.cncShell.go('check');return Object.assign(q,{requests,calls,send,select,flush});
}
module.exports={fixture,machine,check};
