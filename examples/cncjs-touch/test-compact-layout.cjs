'use strict';
// Compact layout and rendered targets (audit 31, U1/U2/U5): the shell marks the body
// `t-compact` under 1100 x 650 and resizes the lists; the stylesheet lays the kept screens
// out shorter under that class instead of relying on viewport-fit's scale; the notice lies
// over the screen (no layout shift when it appears); segmented controls, strip labels and
// large text follow the token goals. Static checks on the sources plus the shell's resize
// logic run in a synthetic window: nothing rendered here, the browser harness measures.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const dir=__dirname+'/touch/';
const read=f=>fs.readFileSync(dir+f,'utf8');
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const css=strip(read('ui-2027.css')),shell=read('touch-shell.js'),fit=read('viewport-fit.js');
// --- Shell: body.t-compact and page sizes from the window only.
{
 const events={},dispatched=[];
 const classes=new Set(),body={classList:{contains:c=>classes.has(c),toggle:(c,on)=>{if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);return on;},add:c=>classes.add(c)},getAttribute:()=>null,appendChild(){}};
 // Only the resize logic is exercised: the module is cut at its first DOM-building statement.
 const start=shell.indexOf('function fitLibrary'),end=shell.indexOf('fitLibrary();',start)+'fitLibrary();'.length;
 const src='(function(){'+shell.slice(start,end)+'})();';
 const win={innerWidth:1366,innerHeight:768,addEventListener:(n,f)=>events[n]=f,dispatchEvent:e=>dispatched.push(e)};
 const ctx={window:win,document:{body},CustomEvent:function(type,o){this.type=type;this.detail=o.detail;}};
 vm.runInNewContext(src,ctx);
 assert(!classes.has('t-compact'),'1366 x 768 is not compact');
 assert.deepEqual(dispatched.map(e=>e.type+':'+e.detail),['cnc-library-page-size:5','cnc-history-page-size:8']);
 win.innerWidth=1024;win.innerHeight=600;events.resize();
 assert(classes.has('t-compact'),'1024 x 600 is compact');assert.deepEqual(dispatched.slice(-2).map(e=>e.detail),[3,4]);
 win.innerWidth=1366;win.innerHeight=640;events.resize();assert(classes.has('t-compact'),'a short window is compact');
 win.innerWidth=1000;win.innerHeight=768;events.resize();assert(classes.has('t-compact'),'a narrow window is compact');
 win.innerWidth=1366;win.innerHeight=768;events.resize();assert(!classes.has('t-compact'));assert.equal(dispatched.at(-2).detail,5);
}
// The library accepts the compact page size.
assert(/size!==2&&size!==3&&size!==4&&size!==5/.test(read('shared-library.js')),'shared-library accepts 3 rows per page');
// --- Stylesheet contract.
const rules=[];{const re=/([^{}]+)\{([^}]*)\}/g;let m;while((m=re.exec(css)))rules.push({sel:m[1].trim(),body:m[2]});}
const find=(sel)=>rules.filter(r=>r.sel.split(/,(?![^(]*\))/).map(s=>s.trim()).includes(sel));
const has=(sel,prop)=>find(sel).some(r=>r.body.includes(prop));
// Compact screens: shorter main padding and screen heights, the kept screens positioned accordingly.
assert(has('.ks-ui.t-compact main','padding:8px 16px!important'),'compact main padding');
for(const s of ['menu','jog','files','home','machine','history']){
 assert(has('.ks-ui.t-compact main>#screen-'+s,'top:8px'),s+' kept screen at 8 px');
 assert(has('.ks-ui.t-compact #screen-'+s+'.active','height:calc(var(--view-height) - 16px)')&&has('.ks-ui.t-compact #screen-'+s+'.kept','height:calc(var(--view-height) - 16px)'),s+' compact height (active and kept)');
}
assert(has('.ks-ui.t-compact .job-dashboard','grid-template-columns:minmax(0,1fr) 440px'),'Suivi right column 440 px in compact');
assert(has('.ks-ui.t-compact .home-live-tiles','display:none')&&has('.ks-ui.display-large .home-live-tiles','display:none'),'duplicated live tiles hidden (the strip shows them)');
assert(has('.ks-ui.t-compact .t-coords-card .t-val','font-size:var(--fs-36)'),'coordinates on one row at 36 px in compact');
assert(has('.ks-ui.t-compact #screen-jog.active','grid-template-columns:minmax(0,1fr) auto')&&has('.ks-ui.t-compact #screen-jog.kept','grid-template-columns:minmax(0,1fr) auto'),'Préparer: the cross card takes its own width');
assert(has('.ks-ui.t-compact .ks-coordinate-table tbody tr','height:48px'),'48 px table rows in compact');
assert(has('.ks-ui.t-compact #screen-machine .ks-machine-commands','grid-template-columns:repeat(3,minmax(0,1fr))'),'Machine commands on one row');
assert(has('.ks-ui.t-compact #screen-files.active','grid-template-columns:minmax(0,1fr) 400px'),'Fichiers detail column 400 px');
// Targets keep their rendered size in compact: no rule sets a target under the goals.
for(const r of rules.filter(r=>r.sel.includes('.t-compact'))){
 for(const m of r.body.matchAll(/min-height:(\d+)px/g))assert(Number(m[1])>=48,r.sel+' sets a target under 48 px');
 assert(!/font-size:(1[0-5]|[0-9])px/.test(r.body),r.sel+' sets text under 16 px');
}
// Segments render the full secondary target; strip labels at 16 px; strip actions 64 px.
assert(has('.t-seg button','min-height:var(--tap)'),'segmented buttons 48 px');
assert(has('.t-vital span','font-size:var(--fs-16)'),'strip labels 16 px');
assert(has('.t-strip-actions .t-btn','min-height:var(--tap-primary)'),'strip Pause/Stop 64 px');
assert(/\.ks-ui \.pv3d-views button\{[^}]*min-height:var\(--tap\)/.test(strip(read('preview-3d.css'))),'view selector 48 px');
// Large text: the type tokens grow inside main, sheets and dialogs; nothing is shrunk to compensate.
const large=find('.ks-ui.display-large main')[0];assert(large&&/--fs-16:18px;--fs-18:20px;--fs-20:22px;--fs-24:27px;--fs-28:31px/.test(large.body),'large text redefines the tokens');
assert(large.sel.includes('.ks-ui.display-large .ks-sheet')&&large.sel.includes('.ks-ui.display-large .job-dialog')&&large.sel.includes('.ks-ui.display-large .t-numpad'),'sheets, dialogs and the pad grow too');
assert(!/display-large[^{]*\{[^}]*transform:scale/.test(css),'no compensating scale for large text');
// The notice overlays the screen and lets taps through; viewport-fit no longer measures it as a top band.
assert(has('.ks-ui #notice','position:fixed')&&has('.ks-ui #notice','pointer-events:none'),'notice overlay');
assert(!/\['status-bar','simulation-banner','real-banner','notice'\]/.test(fit)&&/\['status-bar','simulation-banner','real-banner'\]/.test(fit),'viewport-fit ignores the notice');
// The system command line and the action feedback states exist in the sheet.
assert(has('.t-system-command','position:fixed'),'system command status line');
for(const s of ['sent','confirmed','failed','uncertain'])assert(find('.t-sent[data-state="'+s+'"]').length,'feedback state '+s);
// The freshness details live with the coordinates on the real page.
assert(read('index.html').includes('class="card ks-machine-coordinates"'),'coordinates card marked');
assert(read('connection-status.js').includes("querySelector('#screen-machine .ks-machine-coordinates')"),'freshness panel moves to the coordinates card');
console.log('PASS compact layout: body.t-compact from the window, 3-row pages, compact heights for the six kept screens, targets kept at 48/64/96 px, 48 px segments, 16 px strip labels, large-text tokens without scale, notice overlay, feedback states.');
