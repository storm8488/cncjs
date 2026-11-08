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
 assert.deepEqual(dispatched.map(e=>e.type+':'+e.detail),['cnc-library-page-size:5','cnc-history-page-size:6']);
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
// Work coordinates one axis per row at 24 px (a -600.000 value fits beside its unit), nowrap.
assert(has('.ks-ui.t-compact .t-coords-card .t-val','font-size:var(--fs-24)')&&has('.ks-ui.t-compact .t-coords-card .t-val','white-space:nowrap'),'compact coordinates at 24 px, never wrapped');
assert(has('.ks-ui.t-compact .t-coords-card .t-coords','grid-template-columns:auto minmax(0,1fr) auto;'),'compact work coordinates: one axis per row');
// The preview note lies over the bottom of the image instead of a 44 px column beside it.
assert(has('.ks-ui.t-compact .job-art #home-image-status:not(:only-child)','position:absolute'),'compact preview note over the image');
// 12 px between Charger la sélection and Démarrer / Pause (6 px column gap + 6 px).
assert(has('.ks-ui .job-metrics>.home-load','margin-bottom:6px'),'12 px under Charger la sélection');
assert(has('.ks-ui.t-compact #screen-jog.active','grid-template-columns:minmax(0,1fr) auto')&&has('.ks-ui.t-compact #screen-jog.kept','grid-template-columns:minmax(0,1fr) auto'),'Préparer: the cross card takes its own width');
assert(has('.ks-ui.t-compact .ks-coordinate-table tbody tr','height:48px'),'48 px table rows in compact');
assert(has('.ks-ui.t-compact #screen-machine .ks-machine-commands','grid-template-columns:repeat(3,minmax(0,1fr))'),'Machine commands on one row');
assert(has('.ks-ui.t-compact #screen-files.active','grid-template-columns:minmax(0,1fr) 400px'),'Fichiers detail column 400 px');
// Layout audit 31: no command lies under another at 1024 x 600. Préparer and Machine give the
// full height to their main card (the intro moves to the right column); the Fichiers detail never
// shrinks a part under its content (only the preview, down to 64 px, and the load reason); the
// project sheet is one row; the favourites filter sits beside the search field; the legacy 23 px
// card heading of app.css does not inflate the coordinate labels in large text.
assert(css.includes('grid-template-areas:"coords title" "coords actions" "coords arrows"')&&has('.ks-ui.t-compact #screen-jog .ks-panel-intro','display:contents'),'Préparer compact: coordinates full height, title and actions over the cross');
assert(has('.ks-ui.t-compact #screen-jog .ks-preparation-actions','min-width:100%')&&has('.ks-ui.t-compact #screen-jog .ks-panel-intro>div:first-child','min-width:100%'),'Préparer compact: the long texts wrap inside the cross column');
assert(has('.ks-ui.t-compact #screen-machine .ks-machine-overview','grid-row:1/span 2'),'Machine compact: state, alarm and commands full height');
assert(has('.ks-ui #screen-files .library-detail>*','min-height:auto')&&has('.ks-ui #screen-files .library-detail','overflow-y:auto'),'Fichiers detail: no part shrinks under its content (overlap)');
assert(has('.ks-ui.t-compact #screen-files .library-detail','grid-template-rows:auto auto minmax(64px,1fr) auto auto minmax(0,auto)'),'Fichiers compact detail rows: the preview and the reason give room');
assert(has('.ks-ui.t-compact #library-project .library-project-head','display:contents')&&has('.ks-ui.t-compact #library-project #project-summary','grid-row:1'),'project sheet on one row in compact');
assert(css.includes('"search fav"')&&has('.ks-ui #screen-files #library-favorites','grid-area:fav'),'favourites filter beside the search field in compact');
assert(has('.ks-ui.display-large .t-coords-card>h2','font-size:var(--fs-16)'),'coordinate labels keep their token in large text');
assert(/requestAnimationFrame\(fitPage\)/.test(read('shared-library.js')),'library pages hold only the rows that fit');
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
// The notice and the system line live in the strip's message cell (columns 2-3, over the age and
// the live values): every strip child has its own column, nothing lies over a screen.
assert(has('.t-messages','grid-column:2/4')&&has('.t-messages','grid-row:1'),'message cell over columns 2-3 of the strip');
for(const [cls,col] of [['t-state',1],['t-fresh',2],['t-vitals',3],['t-strip-actions',4],['t-strip-right',5]])assert(has('.ks-ui #real-banner>.'+cls,'grid-column:'+col+';')&&has('.ks-ui #simulation-banner>.'+cls,'grid-column:'+col+';'),cls+' pinned to column '+col);
assert(has('.ks-ui .t-messages>#notice','position:static')&&has('.ks-ui .t-messages>#notice','font:var(--fs-16)/1.2'),'notice in the cell, 16 px');
assert(!find('.ks-ui #notice').some(r=>r.body.includes('position:fixed')),'the notice no longer lies over the screen');
assert(has('.t-messages[data-count="2"]>#notice','-webkit-line-clamp:2')&&has('.t-messages[data-count="2"]>.t-system-command','-webkit-line-clamp:1'),'both messages share the cell');
assert(has('.t-messages-more','position:fixed')&&has('.t-messages-more','top:var(--statusbar-h)'),'full text below the strip');
assert(!find('.t-messages-more').some(r=>/max-height:none/.test(r.body)),'full text height bounded');
assert(!/\['status-bar','simulation-banner','real-banner','notice'\]/.test(fit)&&/\['status-bar','simulation-banner','real-banner'\]/.test(fit),'viewport-fit ignores the notice');
// The system command line and the action feedback states exist in the sheet.
assert(has('.t-system-command','position:fixed'),'system command status line (fallback without the strip)');
assert(has('.ks-ui .t-messages>.t-system-command','border-left-color:var(--info)'),'system command line in the strip cell');
// Dark-theme failure marks drawn with the readable text red (the --danger fill is 1.86:1 on --surface-2).
assert(has('.t-sent[data-state="failed"]::before','background:var(--danger-text)')&&has('.ks-prep-step[data-state="blocking"] .ks-prep-mark','background:var(--danger-text)'),'failure marks in --danger-text');
for(const s of ['sent','confirmed','failed','uncertain'])assert(find('.t-sent[data-state="'+s+'"]').length,'feedback state '+s);
// The freshness details live with the coordinates on the real page.
assert(read('index.html').includes('class="card ks-machine-coordinates"'),'coordinates card marked');
assert(read('connection-status.js').includes("querySelector('#screen-machine .ks-machine-coordinates')"),'freshness panel moves to the coordinates card');
console.log('PASS compact layout: body.t-compact from the window, 3-row pages, compact heights for the six kept screens, targets kept at 48/64/96 px, 48 px segments, 16 px strip labels, large-text tokens without scale, notice and system line in the strip cell, feedback states.');
