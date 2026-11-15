'use strict';
// Parse actual page markup. This adapter checks DOM structure and event routing, not layout.
const fs=require('fs'),vm=require('vm'),path=require('path');
const parser=require('htmlparser2'),select=require('css-select'),utils=require('domutils'),serialize=require('dom-serializer').default;
function page(language='fr',simulation=false){
  const stats={writes:0},listeners={},frames=[],timers=[],storage=new Map();
  storage.set('cncjs-touch-language-v1',language);
  const root=parser.parseDOM(fs.readFileSync(path.join(__dirname,'touch',simulation?'simulation.html':'index.html'),'utf8'));
  let document,window,now=100000;
  function decorate(n){
    if(n._dom)return n;n._dom=true;n.handlers={};const parserType=n.type;Object.defineProperty(n,'type',{get:()=>parserType,set:v=>{n._inputType=v;}});
    n.addEventListener=(name,fn)=>{(n.handlers[name]||(n.handlers[name]=[])).push(fn);};
    n.removeEventListener=(name,fn)=>{n.handlers[name]=(n.handlers[name]||[]).filter(f=>f!==fn);};
    n.querySelector=s=>select.selectOne(s,n.children||[]);n.querySelectorAll=s=>select.selectAll(s,n.children||[]);
    n.getAttribute=k=>n.attribs&&Object.prototype.hasOwnProperty.call(n.attribs,k)?n.attribs[k]:null;
    n.hasAttribute=k=>n.getAttribute(k)!==null;
    n.setAttribute=(k,v)=>{stats.writes++;(n.attribs||(n.attribs={}))[k]=String(v);};
    n.removeAttribute=k=>{stats.writes++;delete n.attribs[k];};
    n.contains=other=>other===n||(n.children||[]).some(c=>c.contains(other));
    n.appendChild=c=>n.insertBefore(c,null);
    n.insertBefore=(c,before)=>{if(!c)throw Error('Missing child');if(before)utils.prepend(before,c);else utils.appendChild(n,c);stats.writes++;return c;};
    n.removeChild=c=>{utils.removeElement(c);stats.writes++;return c;};
    n.insertAdjacentHTML=(where,html)=>{const nodes=parser.parseDOM(html).slice();nodes.forEach(walk);if(where==='afterend'){nodes.reverse().forEach(c=>utils.append(n,c));}else if(where==='beforebegin'){nodes.forEach(c=>utils.prepend(n,c));}else nodes.forEach(c=>utils.appendChild(n,c));};
    n.closest=s=>{for(let p=n;p;p=p.parent)if(p.type==='tag'&&select.is(p,s))return p;return null;};
    n.focus=()=>{document.activeElement=n;};n.getClientRects=()=>n.hidden?[]:[{}];n.getBoundingClientRect=()=>({left:0,right:1,top:0,bottom:1,width:1,height:1});
    n.click=()=>{if(n.disabled)return;document.activeElement=n;const e={target:n,isTrusted:false};for(let p=n;p;p=p.parent)(p.handlers&&p.handlers.click||[]).slice().forEach(fn=>fn.call(p,e));(listeners['doc:click']||[]).slice().forEach(fn=>fn(e));};
    n.value=n.attribs&&n.attribs.value||'';
    n.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};
    for(const [prop,attr] of [['id','id'],['className','class']])Object.defineProperty(n,prop,{get:()=>n.getAttribute(attr)||'',set:v=>{n.setAttribute(attr,v);}});
    Object.defineProperties(n,{
      tagName:{get:()=>String(n.name||'').toUpperCase()},nodeType:{get:()=>n.type==='text'?3:1},parentNode:{get:()=>n.parent},
      firstChild:{get:()=>n.children&&n.children[0]||null},lastChild:{get:()=>n.children&&n.children[n.children.length-1]||null},
      childNodes:{get:()=>n.children||[]},nodeValue:{get:()=>n.type==='text'?n.data:null,set:v=>{if(n.type==='text')n.data=String(v);}},
      nextSibling:{get:()=>n.next},previousSibling:{get:()=>n.prev},
      textContent:{get:()=>n.type==='text'?n.data:utils.getText(n),set:v=>{stats.writes++;if(n.type==='text'){n.data=String(v);return;}(n.children||[]).slice().forEach(utils.removeElement);const c=decorate(parser.parseDOM(String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'))[0]||{type:'text',data:'',parent:null,prev:null,next:null});utils.appendChild(n,c);}},
      innerHTML:{get:()=>serialize(n.children||[]),set:v=>{stats.writes++;(n.children||[]).slice().forEach(utils.removeElement);parser.parseDOM(v).slice().forEach(c=>{walk(c);utils.appendChild(n,c);});}}
    });
    for(const prop of ['hidden','disabled','checked','inert'])Object.defineProperty(n,prop,{get:()=>prop==='inert'?!!n._inert:n.getAttribute(prop)!==null,set:v=>{stats.writes++;if(prop==='inert')n._inert=!!v;else if(v)n.attribs[prop]='';else delete n.attribs[prop];}});
    n.classList={contains:k=>n.className.split(/\s+/).includes(k),add:k=>{if(!n.classList.contains(k))n.className=(n.className+' '+k).trim();},remove:k=>{if(n.classList.contains(k))n.className=n.className.split(/\s+/).filter(x=>x!==k).join(' ');},toggle:(k,on)=>{const want=on===undefined?!n.classList.contains(k):on;if(want)n.classList.add(k);else n.classList.remove(k);}};
    return n;
  }
  function walk(n){decorate(n);(n.children||[]).forEach(walk);}root.forEach(walk);
  document={hidden:false,title:'',querySelector:s=>select.selectOne(s,root),querySelectorAll:s=>select.selectAll(s,root),getElementById:id=>{let n=select.selectOne('#'+id,root);return n;},createElement:tag=>{const n=parser.parseDOM('<'+tag+'></'+tag+'>')[0];walk(n);return n;},addEventListener:(n,f)=>{(listeners['doc:'+n]||(listeners['doc:'+n]=[])).push(f);},removeEventListener(){}};
  document.body=document.querySelector('body');document.head=document.querySelector('head');document.createTextNode=value=>decorate({type:'text',data:String(value),parent:null,prev:null,next:null});document.documentElement=document.querySelector('html');document.activeElement=document.body;
  window={innerWidth:1366,innerHeight:simulation?768:911,cncI18n:null,requestAnimationFrame:f=>{frames.push(f);return frames.length;},cancelAnimationFrame(){},addEventListener:(n,f)=>{(listeners[n]||(listeners[n]=[])).push(f);},removeEventListener(){},dispatchEvent:e=>(listeners[e.type]||[]).slice().forEach(fn=>fn(e))};
  const context={window,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{origin:'http://127.0.0.1'},CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail;},Event:function(type){this.type=type;},Date:class extends Date{static now(){return now;}},setTimeout:f=>timers.push(f),clearTimeout(){},setInterval(){},clearInterval(){},console,Promise};
  vm.createContext(context);
  function run(file){vm.runInContext(fs.readFileSync(path.join(__dirname,'touch',file),'utf8'),context,{filename:file});}
  for(const f of ['i18n-messages.js','i18n-messages-refus.js','i18n.js','refus.js','seance.js'])run(f);
  // Owners create their real markup before the shell. Their XHRs never leave this process.
  context.XMLHttpRequest=function(){this.open=()=>{};this.setRequestHeader=()=>{};this.send=()=>{};};
  run('shared-library.js');run('job-controls.js');run('machine-limits.js');run('display-settings.js');window.cncProfile={version:/ADVANCED_VERSION='([^']+)'/.exec(fs.readFileSync(path.join(__dirname,'touch/tablet-profile.js'),'utf8'))[1]};
  return {window,document,stats,context,run,frames,listeners,advance:ms=>now+=ms,emit:(type,detail)=>window.dispatchEvent({type,detail}),node:id=>document.getElementById(id)};
}
module.exports={page};

