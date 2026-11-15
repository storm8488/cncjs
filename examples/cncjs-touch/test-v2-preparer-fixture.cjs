'use strict';
// Control placement uses the actual shared page and an explicitly opened dialog.
const {fixture,machine}=require('./check-page-fixture.cjs');
const tick=()=>new Promise(setImmediate),idle=machine;
function preparerPage(options={}){
 const p=fixture(),pending=[],calls={mount:[],unmount:0,loads:[],reads:0,updates:[],catalogues:[],sheets:[]};
 const v2={gate:true,layout:options.v2!==false,safeIdle:options.safeIdle!==false};
 p.window.cncV2={gate:()=>v2.gate,state:()=>({...v2,holdLayout:v2.layout&&!v2.safeIdle})};
 p.window.cncProfile.performance=()=>options.performance||'performance';
 p.window.cncProfile.loadAdvanced=files=>{calls.loads.push(files);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
 const card=p.document.createElement('section');card.id='op-card';
 p.window.CNCOriginPreview={mount:host=>{calls.mount.push(host);host.appendChild(card);},unmount:()=>{calls.unmount++;if(card.parentNode)card.parentNode.removeChild(card);}};
 const emit=p.emit,show=screen=>p.window.cncShell.go(screen),status=m=>{p.emit('cnc-job-status',{machine:m,transportConnected:true,simulation:false,pilot:{state:'mine'}});};
 show(options.screen||'check');p.emit('cnc-v2-change');
 const open=()=>{const n=p.node('check-placement-open');if(n&&!n.hidden)n.click();};
 // Existing lifecycle consumers opt into this helper's explicit user opening.
 if(!options.manual&&(options.screen||'check')==='check')open();
 const content=p.node('ks-check-placement').querySelector('.ks-sheet-content');
 return {...p,calls,pending,v2,card,content,show,status,emit,open,frame:()=>0,find:id=>p.node(id),resolveLoads:()=>pending.splice(0).forEach(p=>p.resolve()),rejectLoads:message=>pending.splice(0).forEach(p=>p.reject(new Error(message)))};
}
module.exports={preparerPage,idle,tick};
