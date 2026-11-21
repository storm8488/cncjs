'use strict';
const assert = require('assert').strict, fs = require('fs');
const {page} = require('./session-dom-fixture.cjs');
const {parseDOM, select, value} = require('./test-vert-layout.cjs');
const {measure, checks, cases} = require('./browser-control-labels.cjs');
const postcss = require('postcss');
const read = f => fs.readFileSync(__dirname+'/'+f,'utf8');
const css = postcss.parse(read('touch/files-touch.css'));
function decl(selector, property) {
 let result;
 css.walkRules(rule => { if (rule.selectors.includes(selector)) rule.walkDecls(property, d => { result = d.value; }); });
 return result;
}
assert.equal(decl('.pc-diagram','display'),'flex');
assert.equal(decl('.pc-diagram','flex-direction'),'column');
assert(parseFloat(decl('.pc-diagram','gap')) >= 12);
assert.equal(decl('.pc-labels','flex-direction'),'column');
assert(parseFloat(decl('.pc-labels','gap')) >= 8);
assert.equal(decl('.ks-ui #screen-check .pc-label','white-space'),'normal');
assert.equal(decl('.ks-ui #screen-check .pc-label','background'),'var(--surface)');
assert.equal(decl('.ks-ui #screen-check .pc-label','font-weight'),'400');
assert.equal(decl('.ks-ui.display-large #screen-check .pc-label','font-size'),'18px');
assert.equal(decl('.check-drawing .pc-plot','flex'),'none');
assert(!measure.includes('getBBox'), 'use rendered CSS boxes and text ranges, including transformations');
for (const language of ['fr','en','es']) {
 const p = page(language); p.run('program-check-view.js'); p.run('touch-shell.js');
 for (const kind of ['cnc','laser']) {
  p.emit('cnc-job-status',{machine:{machineProfile:{kind}},simulation:false,transportConnected:true});
  const words = p.document.querySelectorAll('#tabbar .ks-nav-name').map(n => n.textContent);
  assert.equal(words.length,6);
  assert(words.every(w => !/[\u00ad-]/.test(w)), language+': rail words must never include discretionary hyphens');
  assert.equal(words[4],p.window.cncI18n.t(kind === 'laser' ? 'Gravure' : 'Usinage'));
 }
 for (const example of cases()) for (const plane of ['top','side']) {
  const html = p.window.CNCProgramCheckView.drawing(example.check,plane,example.coordinates), tree = parseDOM(html);
  const svg = select.selectOne('svg',tree), diagram = select.selectOne('.pc-diagram',tree), labels = select.selectAll('.pc-label',tree);
  assert(svg && diagram && labels.length, 'drawing has a plot and flow captions');
  assert.equal(select.selectAll('svg text',tree).length,0, 'no label can inherit the SVG stroke or share a plotted edge');
  assert(labels.every(n => n.parent === diagram || n.parent.attribs.class === 'pc-labels'), 'each caption stays outside the plot');
  assert(!/NaN|undefined|Infinity/.test(html));
  for (const marker of select.selectAll('svg .pc-origin, svg .pc-tool, svg .pc-zero',tree)) {
   const a = marker.attribs;
   if (a.class === 'pc-origin') assert(+a.cx >= 4 && +a.cx <= 426 && +a.cy >= 4 && +a.cy <= 366,'work zero remains inside the plot');
   if (a.class === 'pc-zero') { const y = +/^M45 (\S+)H160$/.exec(a.d)[1]; assert(y >= 2 && y <= 368,'side zero line remains inside the plot'); }
   if (a.class === 'pc-tool') {
    const m = /^M(\S+) (\S+)h14M(\S+) (\S+)v14$/.exec(a.d); assert(m);
    assert(+m[1] >= 2 && +m[1]+14 <= 428 && +m[2] >= 2 && +m[2] <= 368 && +m[3] >= 2 && +m[3] <= 428 && +m[4] >= 2 && +m[4]+14 <= 368,'distant tool remains inside the plot');
   }
  }
  if (example.name === 'all-six-sides') assert.equal(labels.length,plane === 'top' ? 8 : 6,'keep every side of a multi-axis overrun');
  if (example.name === 'fits-coincident-zero' && plane === 'top') {
   assert.equal(select.selectAll('.pc-origin',tree).length,1); assert.equal(select.selectAll('.pc-tool',tree).length,1);
   assert.equal((html.match(/399/g)||[]).length,1,'footprint is written once');
  }
 }
 p.emit('pagehide');
}
for (const h of [768,911]) for (const large of [false,true]) {
 const tree = parseDOM('<body class="ks-ui'+(large?' display-large':'')+'"><nav id="tabbar"><button class="ks-nav"><span class="ks-nav-name"></span></button></nav></body>');
 const body = select.selectOne('body',tree), label = select.selectOne('span',tree), button = select.selectOne('button',tree);
 assert.equal(value(body,'--rail-w',1366,h),'128px','whole words have sufficient rail width');
 assert.equal(value(body,'--ks-rail',1366,h),'var(--rail-w)','content begins after the widened rail');
 assert.equal(value(label,'hyphens',1366,h),'none'); assert.equal(value(label,'overflow-wrap',1366,h),'normal');
 assert.equal(value(label,'word-break',1366,h),'normal'); assert.equal(value(label,'letter-spacing',1366,h),'0');
 assert.equal(value(label,'font-size',1366,h),large?'18px':'16px');
 assert(parseFloat(value(button,'min-height',1366,h)) >= 64);
}
const box = (x,y,w=60,h=20) => ({left:x,top:y,right:x+w,bottom:y+h,width:w,height:h});
function geometry() {
 return { large:false, plots:[{owner:'top',box:box(0,30,100,100),svgText:0},{owner:'side',box:box(150,30,100,100),svgText:0}], shapes:[{box:box(0,30,100,100)}],
  labels:[{text:'top',box:box(0,0),frame:box(0,0,100,200),lines:[box(0,0)],font:16,stroke:'0px',reachable:true}, {text:'side',box:box(150,0),frame:box(150,0,100,200),lines:[box(150,0)],font:16,stroke:'0px',reachable:true}],
  rail:Array.from({length:6},()=>({text:'Machine',broken:[],hyphens:'none',font:16,box:box(300,0,100,88),lines:[box(300,0)]})) };
}
assert.deepEqual(checks(geometry()),[]);
for (const mutate of [d=>{d.labels[0].box=box(0,25);},d=>{d.labels[1].box=box(0,0);},d=>{d.labels[0].lines=[box(-5,0)];},d=>{d.labels[0].frame=box(0,0,40,200);},d=>{d.labels[0].stroke='1.4px';},d=>{d.plots[0].svgText=1;},d=>{d.labels[0].reachable=false;},d=>{d.rail[0].broken=['Machine'];},d=>{d.rail[0].text='Ma\u00adchine';},d=>{d.rail[0].hyphens='manual';},d=>{d.rail[0].lines=[box(350,0)];},d=>{d.large=true;}]) {
 const data=geometry(); mutate(data); assert(checks(data).length,'negative geometry control must fail');
}
const harness=read('browser-run.cjs');
assert(harness.includes('await controlLabelsMeasure(cdp, fx, summary);'),'screens executes the rendered matrix');
assert(harness.includes("for (const lang of ['fr', 'en', 'es'])"));
console.log('PASS CTRL: whole rail words, flow captions outside plots, ten cases in FR/EN/ES and twelve negative geometry controls.');
