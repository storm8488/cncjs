'use strict';
// Actual page owners + actual stylesheet order/specificity. This catches the
// nested-mount regression offline; Range geometry is received by --only screens.
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const postcss = require('postcss'), selectorParser = require('postcss-selector-parser'), select = require('css-select');
const { fixture } = require('./check-page-fixture.cjs'), browser = require('./browser-library.cjs');
const html = fs.readFileSync(path.join(__dirname,'touch/index.html'),'utf8');
const files = [...html.matchAll(/<link[^>]+href="([^"?]+\.css)/g)].map(m=>m[1]).concat('performance-v2.css');
const sheets = files.map(file=>postcss.parse(fs.readFileSync(path.join(__dirname,'touch',file),'utf8')));
function compare(a,b) { for (let i=0;i<a.length;i++) if(a[i]!==b[i])return a[i]-b[i];return 0; }
function specificity(selector) {
  function score(nodes) {
    const out=[0,0,0];
    nodes.forEach(n=>{
      if(n.type==='id')out[0]++;
      else if(n.type==='class'||n.type==='attribute')out[1]++;
      else if(n.type==='tag')out[2]++;
      else if(n.type==='pseudo'){
        if(n.value===':where')return;
        if([':not',':is'].includes(n.value))n.nodes.map(s=>score(s.nodes)).sort(compare).pop().forEach((v,i)=>out[i]+=v);
        else out[1]++;
      }
    });return out;
  }
  return score(selectorParser().astSync(selector).nodes[0].nodes);
}
function media(query,w,h) {
  return query.split(',').some(part=>[...part.matchAll(/\(([^)]+)\)/g)].every(([,c])=>{
    const m=/^(min|max)-(width|height):\s*(\d+)px$/.exec(c.trim());
    if(m)return m[1]==='min'?(m[2]==='width'?w:h)>=+m[3]:(m[2]==='width'?w:h)<=+m[3];
    return c.trim()==='orientation:portrait'?h>=w:c.trim()==='orientation:landscape'&&w>h;
  }));
}
function value(node,property,w,h) {
  let winner=null,order=0;
  sheets.forEach(sheet=>sheet.walkRules(rule=>{
    if(!rule.nodes.some(d=>d.type==='decl'&&(d.prop===property||(d.prop==='overflow'&&/^overflow-[xy]$/.test(property)))))return;
    for(let p=rule.parent;p;p=p.parent)if(p.type==='atrule'&&p.name==='media'&&!media(p.params,w,h))return;
    for(const selector of rule.selectors){
      if(/::|:(before|after|focus-visible|focus-within)\b/.test(selector)||!select.is(node,selector))continue;
      rule.walkDecls(d=>{
        if(d.prop!==property && !(d.prop==='overflow'&&/^overflow-[xy]$/.test(property)))return;
        const rank=[+!!d.important].concat(specificity(selector),[++order]);
        if(!winner||compare(rank,winner.rank)>=0)winner={rank,value:d.value};
      });
    }
  }));return winner&&winner.value;
}
function assertLayout(q,w,h) {
  const root=q.node('perf-v2-files'),body=q.document.body;
  for(const state of ['active','kept'])for(const large of [false,true]){
    body.className='ks-ui ks-real perf-v2 perf-wide'+(large?' display-large':'');
    q.node('screen-files').className='screen ks-step-screen '+state;
    const tag=w+'x'+h+' '+state+' '+large;
    assert.equal(value(root,'grid-column',w,h),'1/-1',tag+': comparison spans the whole detail card');
    assert.equal(value(root,'grid-row',w,h),'3',tag+': comparison follows the preview');
    assert.equal(value(root,'overflow',w,h),'visible',tag+': no nested scroll');
    assert.equal(value(root,'height',w,h),'auto');assert.equal(value(root,'max-height',w,h),'none');
    assert.equal(value(root.querySelector('thead tr'),'display',w,h),'flex');
    assert.equal(value(root.querySelector('thead tr'),'flex-wrap',w,h),'wrap',tag+': columns stack when needed');
    assert.equal(value(root.querySelector('thead td'),'display',w,h),'none','no empty label column');
    for(const node of root.querySelectorAll('.lv2-col,.lv2-eyebrow,.lv2-name,.lv2-state')){
      for(const property of ['overflow-wrap','word-break'])assert.equal(value(node,property,w,h),'normal',tag+': no word split in '+node.className);
      assert.equal(value(node,'hyphens',w,h),'none');assert.equal(value(node,'white-space',w,h),'normal');
      assert.equal(value(node,'overflow',w,h),'visible',tag+': all summary text remains readable');
    }
    assert.notEqual(value(q.node('screen-files'),'grid-template-rows',w,h),'auto minmax(0,1fr)','obsolete outer-band grid removed');
    assert.equal(value(root.closest('.library-detail'),'grid-row',w,h),w<1100||h<650?'2':'1','detail keeps the shared L4 row');
  }
}
(async()=>{
  for(const lang of ['fr','en','es']){
    const q=fixture(lang),shell=q.window.cncShell;let open=true;
    q.window.cncV2={state:()=>({layout:true,safeIdle:true}),gate:()=>open,reportAge:m=>({known:true,fresh:!!m.fresh}),mounts:{get:name=>shell.v2Mounts(true)[name]}};
    shell.go('files');q.emit('cnc-v2-change');q.frames.splice(0).forEach(fn=>fn());q.send({originalName:'surfacage-400x80-24mm-2passes.nc'});q.frames.splice(0).forEach(fn=>fn());
    const root=q.node('perf-v2-files');
    assert(root&&!root.hidden);assert(root.closest('.library-detail'),'real owner moves the mount into the card');
    assert.equal(root.querySelectorAll('.lv2-col').length,2);
    assert.equal(root.querySelectorAll('tbody').length,0,'technical comparison stays in Details');
    assert(q.node('lv2-dims-sel').closest('#ks-file-info'));assert(q.node('lv2-match').closest('#ks-file-info'));
    assert.equal(q.node('lv2-load-name').textContent,'surfacage-400x80-24mm-2passes.nc','operator file name preserved');
    q.send({fresh:false});q.frames.splice(0).forEach(fn=>fn());
    assert.equal(q.node('lv2-load-name').textContent,q.window.cncI18n.t('État machine indisponible'));
    open=false;q.emit('cnc-v2-change');q.frames.splice(0).forEach(fn=>fn());
    for(const id of ['lv2-sel-name','lv2-load-name'])assert.equal(q.node(id).textContent,q.window.cncI18n.t('non suivi'));
    for(const [w,h] of [[1920,1080],[1728,1152],[1366,911],[1366,768],[1024,600],[720,1080],[540,960]])assertLayout(q,w,h);
  }
  // The rendered-word check must reject the reported SÉL / ECT / ION even
  // though the text belongs to spans rather than actionable tap targets.
  const rect={left:0,right:600,top:0,bottom:70,width:600,height:70};
  const root={hidden:false,getClientRects:()=>[rect],getBoundingClientRect:()=>rect,closest:()=>root,querySelectorAll:()=>[],scrollHeight:70,clientHeight:70,scrollWidth:600,clientWidth:600};
  const word={data:'SÉLECTION',parentElement:root};let split=false;
  const context={document:{getElementById:()=>root,createTreeWalker:()=>{let read=false;return {nextNode:()=>read?null:(read=true,word)};},createRange:()=>({setStart(){},setEnd(){},getClientRects:()=>split?[rect,Object.assign({},rect,{top:25})]:[rect]})},NodeFilter:{SHOW_TEXT:4},getComputedStyle:()=>({overflowX:'visible',overflowY:'visible'})};
  const measure=()=>vm.runInNewContext('('+browser.snapshot+')()',context);
  assert.equal(measure().split.length,0);split=true;assert.equal(measure().split[0],'SÉLECTION');
  const good={shown:true,width:600,available:600,columns:[{width:290,left:0,right:290,top:0,bottom:50},{width:290,left:310,right:600,top:0,bottom:50}],words:4,split:[],clipped:[],scrollers:[]};
  assert.deepEqual(browser.checks(good),[]);
  for(const patch of [{width:120},{split:['SÉLECTION']},{clipped:['machine']},{scrollers:['perf-v2-files']},{columns:[]},{words:0}])assert(browser.checks(Object.assign({},good,patch)).length,'rendered defect must fail');
  assert.deepEqual(browser.checks({shown:false},false),[]);assert(browser.checks(good,false).length);
  const harness=fs.readFileSync(path.join(__dirname,'browser-run.cjs'),'utf8');
  assert(harness.includes("require('./browser-library.cjs').measure"),'screens executes the rendered case');
  console.log('PASS library comparison: actual nested mount, FR/EN/ES freshness and unfollowed states, full card span, natural word wrapping and stacking, no internal scroll, rendered split-word failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
