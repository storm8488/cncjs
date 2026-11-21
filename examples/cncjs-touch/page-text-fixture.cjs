'use strict';
// Static text inventory: parse markup rather than treating IDs, protocol values
// or script bodies as visible text. Dynamic state is exercised by the page tests.
const fs=require('fs'),path=require('path'),acorn=require('acorn'),parse5=require('parse5');
const dir=path.join(__dirname,'touch');
function markup(source){
 const out=[];
 function visit(n){
  if(['script','style'].includes(n.tagName))return;
  if(n.nodeName==='#text')out.push(n.value);
  for(const a of n.attrs||[])if(['aria-label','title','alt','placeholder'].includes(a.name))out.push(a.value);
  (n.childNodes||[]).forEach(visit);
 }
 visit(parse5.parseFragment(source));return out.filter(s=>/[a-zà-ÿ]{2}/i.test(s));
}
function literals(file){
 const source=fs.readFileSync(path.join(dir,file),'utf8'),out=[];
 function visit(n,ancestors){
  if(!n||typeof n!=='object')return;
  if(n.type==='Literal'&&typeof n.value==='string')out.push({value:n.value,line:n.loc.start.line,ancestors});
  for(const k of Object.keys(n))if(k!=='loc'){
   const v=n[k];if(Array.isArray(v))v.forEach(x=>visit(x,ancestors.concat(n)));else if(v&&typeof v==='object')visit(v,ancestors.concat(n));
  }
 }
 visit(acorn.parse(source,{ecmaVersion:2017,locations:true}),[]);return out;
}
function authoredMarkup(){
 const out=markup(fs.readFileSync(path.join(dir,'index.html'),'utf8')).map(value=>({file:'index.html',value}));
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&!/^i18n/.test(f))){
  for(const r of literals(file)){
   const parent=r.ancestors[r.ancestors.length-1];
   if(parent&&parent.type==='CallExpression'&&parent.callee.type==='MemberExpression'&&parent.callee.property.name==='html'){
    for(const value of markup(r.value))out.push({file,value});
   }
  }
 }
 return out.filter(r=>!/[<>]|="/.test(r.value));
}
module.exports={markup,literals,authoredMarkup};
