'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'touch',f),'utf8');
function pure(language='fr'){
 const window={},context={window,document:{documentElement:{},title:'',body:null},localStorage:{getItem:()=>language}};
 for(const f of ['i18n-messages.js','i18n-messages-refus.js','i18n.js','refus.js','seance.js'])vm.runInNewContext(read(f),context,{filename:f});
 return {window,evaluate:input=>window.CNCSeance.evaluate(input),read};
}
function machine(patch={}){return Object.assign({port:'SIM',activeState:'Idle',workflow:'idle',fresh:true,homed:true,referenceLost:null,lastAlarm:null,settingsCount:34,firmware:'Grbl',canHome:true,canReadSettings:true,canLoad:true,canStart:true,canPause:false,canStop:false,canResume:false,name:'part.nc',workOffset:{state:'proven',canVerify:true},motion:{canJog:true,canSetOrigin:true,lastOrigin:{at:1,axes:['X']}},programCheck:{verdict:'validated',axes:{}},refusals:{},coordinates:{machine:{x:1,y:1,z:-5}}},patch);}
module.exports={pure,machine,read};
