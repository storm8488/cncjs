const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const {createDOM}=require('./dom-fixture.cjs');
function setup(language='fr',fail=false){
 const dom=createDOM(['settings']),saved=new Map([['cncjs-touch-language-v1',language]]),events={},state={blocked:false},calls={reload:0},dialogs=[];
 dom.document.documentElement={lang:''};dom.document.querySelectorAll=()=>dialogs;
 const window={addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n],dispatchEvent:e=>{if(events[e.type])events[e.type](e);},location:{reload:()=>calls.reload++},cncScreenSaver:{status:()=>state}};
 const context={window,document:dom.document,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('storage disabled');saved.set(k,v);}},Event:class{constructor(type){this.type=type;}}};
 ['i18n-messages.js','i18n-messages-profiles.js','i18n.js','language-settings.js'].forEach(name=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'touch',name),'utf8'),context));
 return {...dom,window,events,state,calls,saved,dialogs};
}
for(const language of ['en','es']){
 const s=setup(language),i=s.window.cncI18n;
 assert.equal(s.document.documentElement.lang,language);
 assert.equal(i.t('Fichiers'),language==='en'?'Files':'Archivos');
 assert.equal(i.t('Réponse de suivi invalide.'),language==='en'?'Invalid monitoring response.':'Respuesta de seguimiento no válida.');
 assert.equal(i.t('  Fichiers  '),language==='en'?'  Files  ':'  Archivos  ');
 // Rows written with outer spaces are found too, and the caller's spaces are kept.
 assert.equal(i.t(' tr/min'),' rpm');assert.equal(i.t('Avance réelle '),language==='en'?'Actual feed ':'Avance real ');
 assert.equal(i.t(' · Broche '),language==='en'?' · Spindle ':' · Husillo ');
 // Rows matched exactly keep their translation as written (French « » need spaces, “ ” do not).
 assert.equal(i.t('Macro fictive « '),language==='en'?'Simulated macro “':'Macro simulada «');assert.equal(i.t(' » exécutée.'),language==='en'?'” executed.':'» ejecutada.');
 assert.equal(i.t('Macro fictive « ')+'M'+i.t(' » exécutée.'),language==='en'?'Simulated macro “M” executed.':'Macro simulada «M» ejecutada.');
 assert.equal(i.t('Menu.gcode'),'Menu.gcode');assert.equal(i.t('G54 G0 X1'),'G54 G0 X1');
 assert.equal(i.t('Unknown controller message'),'Unknown controller message');
 assert.equal(i.html('<button id="Fichiers" data-route="files" title="Fichiers">Fichiers</button>'),language==='en'?'<button id="Fichiers" data-route="files" title="Files">Files</button>':'<button id="Fichiers" data-route="files" title="Archivos">Archivos</button>');
 assert.equal(i.html('<option value="simulation">SIMULATION</option>'),language==='en'?'<option value="simulation">SIMULATION</option>':'<option value="simulation">SIMULACIÓN</option>');
 assert.equal(i.html('<h2>Fichiers'),language==='en'?'<h2>Files':'<h2>Archivos');
 // Réglages, three tabs: new labels, note, intro and restart message exist in both languages.
 const en=language==='en';
 assert.equal(i.t('Affichage'),en?'Display':'Pantalla');assert.equal(i.t('Machine et performances'),en?'Machine & performance':'Máquina y rendimiento');assert.equal(i.t('Système'),en?'System':'Sistema');
 assert.equal(i.t('Actions système'),en?'System actions':'Acciones del sistema');
 assert.equal(i.t('Machine au repos uniquement · confirmation par un second appui'),en?'Machine idle only · confirm with a second tap':'Solo con la máquina en reposo · confirmar con un segundo toque');
 assert.equal(i.t('La portée est indiquée sur chaque réglage : Cette tablette ou Serveur CNCjs.'),en?'Each setting shows its scope: This tablet or CNCjs server.':'Cada ajuste indica su alcance: Esta tableta o Servidor CNCjs.');
 assert.equal(i.t('Redémarrage nécessaire pour finir la mise à jour : utilisez la commande de redémarrage du bloc Tablette, hors travail.'),en?'Restart needed to finish the update: use the restart command of the Tablet block, outside a job.':'Reinicio necesario para terminar la actualización: use el comando de reinicio del bloque Tableta, fuera de un trabajo.');
 assert.equal(i.t(' »'),en?'”':'»');
 assert.equal(i.t('Affichage · machine · système'),en?'Display · machine · system':'Pantalla · máquina · sistema');
 assert.equal(i.t('Luminosité pendant la veille'),en?'Brightness during screen sleep':'Brillo durante la suspensión');
 const keys=new Set();s.window.CNCTouchMessages.forEach(row=>{const key=row[0].trim().replace(/\s+/g,' ');assert(!keys.has(key),'duplicate: '+row[0]);keys.add(key);assert.equal(row.length,3);row.forEach(value=>assert(typeof value==='string'&&value.length>0));});
 // A translated browser must retain the exact protocol and calculation contracts.
 const runtime={window:s.window};
 ['probe-model.js','coordinate-plan.js'].forEach(name=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'touch',name),'utf8'),runtime));
 const P=s.window.CNCProbe,e=P.create('simulation');
 e.resetContact();e.contact('free');e.contact('contact');e.contact('free');
 assert.equal(e.snapshot().probe,'free');assert.equal(e.snapshot().contactVerified,true);
 e.start({profile:P.demo(),operation:'XYZ',diameter:6,wcs:'G54',scenario:'success',confirmed:true,idle:true});
 let ticks=0;while(e.snapshot().running){e.advance();assert(++ticks<40);}
 assert.equal(e.snapshot().phase,'done');assert.equal(e.report().mode,'simulation-palpage');
 assert.equal(e.report().parameters.wcs,'G54');assert.equal(P.empty().name,'Nouvelle sonde');
 assert.throws(()=>P.create('disabled').start({}));
 const C=s.window.CNCCoordinates,result=C.plan({wcs:'G55',workPosition:{x:10},machinePosition:{x:110}},{axis:'x',operation:'shift',unit:'mm',value:'1,5',feed:100});
 assert.equal(result.wcs,'G55');assert.equal(result.targetMachineMm,111.5);assert.equal(result.offsetMm,100);
}
// The language confirmation sits in the intro (shown on every tab), not at the end of the panel.
{const s=setup();assert(s.node('panel').children.some(c=>c.className==='wide language-confirm'),'confirmation in the intro');assert(!s.node('screen-settings').children.length,'nothing appended to the panel');}
let s=setup('invalid');assert.equal(s.window.cncI18n.language,'fr');assert.equal(s.window.cncI18n.t('Fichiers'),'Fichiers');assert(!s.window.cncI18n.save('de'));assert.equal(s.saved.get('cncjs-touch-language-v1'),'invalid');
function choose(s,language){s.node('display-language').value=language;s.node('display-language').handlers.change();}
s=setup();choose(s,'en');assert(!s.node('language-apply').disabled);s.node('language-apply').click();assert.equal(s.saved.get('cncjs-touch-language-v1'),'en');assert.equal(s.calls.reload,1);
s=setup();choose(s,'es');s.state.blocked=true;s.node('language-apply').handlers.click();assert.equal(s.calls.reload,0);assert.equal(s.saved.get('cncjs-touch-language-v1'),'fr');assert(s.node('language-status').textContent.includes('retour au repos'));s.state.blocked=false;s.events['cnc-screen-saver-status']();s.node('language-apply').click();assert.equal(s.calls.reload,1);
s=setup();choose(s,'en');s.events['cnc-job-status']({detail:{busy:true}});assert(s.node('language-apply').disabled);s.node('language-apply').handlers.click();assert.equal(s.calls.reload,0);
s=setup();choose(s,'en');s.dialogs.push({hidden:false,getClientRects:()=>[{}]});s.node('language-apply').handlers.click();assert.equal(s.calls.reload,0);assert(s.node('language-status').textContent.includes('confirmation'));
s=setup();choose(s,'en');s.document.hidden=true;s.node('language-apply').handlers.click();assert.equal(s.calls.reload,0);
s=setup('fr',true);choose(s,'es');s.node('language-apply').click();assert.equal(s.calls.reload,0);assert(s.node('language-status').textContent.includes('Impossible'));
s=setup();choose(s,'es');s.events.pagehide({persisted:true});assert(s.events['cnc-job-status']);s.events.pagehide({persisted:false});assert(!s.events['cnc-job-status']);assert(!s.node('language-apply').handlers.click);
for(const name of ['index.html','simulation.html']){const html=fs.readFileSync(path.join(__dirname,'touch',name),'utf8');assert(html.indexOf('i18n-messages.js')<html.indexOf('i18n.js'));assert(html.indexOf('i18n.js')<html.indexOf('cnc-state.js'));assert(html.indexOf('language-settings.js')>html.indexOf('touch-shell.js'));}
// Every literal passed to t() in the page scripts has a catalog row (a missing row stays French in EN/ES).
{
 // Origin's held v2 card can show a deferred line after the gate closes. Only
 // calls inside a positive s.v2 branch may use this catalogue; v1/RT calls keep
 // requiring a static row. Parse the guard rather than excluding the module.
 function v2Branches(src){
  const ranges=[],ast=require('acorn').parse(src,{ecmaVersion:2017});
  function positive(n){return n.type==='MemberExpression'&&!n.computed&&n.object.type==='Identifier'&&n.object.name==='s'&&n.property.name==='v2'||n.type==='LogicalExpression'&&n.operator==='&&'&&(positive(n.left)||positive(n.right));}
  function visit(n){if(!n||typeof n!=='object')return;if(n.type==='IfStatement'&&positive(n.test))ranges.push([n.consequent.start,n.consequent.end]);Object.keys(n).forEach(k=>{const v=n[k];if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);});}
  visit(ast);return ranges;
 }
 assert.deepEqual(v2Branches("if (!s.v2) t('v1'); if (s.v2 || fallback) t('v1');"),[],'v1 paths cannot borrow deferred translations');
 const guarded="if (s.v2 && closed) { t('v2'); } else { t('v1'); }",ranges=v2Branches(guarded);
 assert(ranges.some(([a,b])=>guarded.indexOf("t('v2')")>=a&&guarded.indexOf("t('v2')")<b));
 assert(!ranges.some(([a,b])=>guarded.indexOf("t('v1')")>=a&&guarded.indexOf("t('v1')")<b),'alternate remains static');
 const deferred=new Set(JSON.parse(fs.readFileSync(path.join(__dirname,'touch','i18n-messages-v2.js'),'utf8')).map(row=>row[0].trim().replace(/\s+/g,' ')));
 // Every catalog: i18n-messages.js and the per-lot i18n-messages-*.js loaded after it, no key twice across them.
 // i18n-messages.js first: it assigns the array the others push into.
 const catalogs=['i18n-messages.js'].concat(fs.readdirSync(path.join(__dirname,'touch')).filter(n=>/^i18n-messages-[a-z]+\.js$/.test(n)));
 const sandbox={window:{}};catalogs.forEach(n=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'touch',n),'utf8'),sandbox));
 const known=new Set();
 sandbox.window.CNCTouchMessages.forEach(row=>{const key=row[0].trim().replace(/\s+/g,' ');assert(!known.has(key),'duplicate across catalogs: '+row[0]);assert.equal(row.length,3);known.add(key);});
 for(const name of ['index.html','simulation.html']){const html=fs.readFileSync(path.join(__dirname,'touch',name),'utf8');catalogs.forEach(n=>{assert(html.indexOf(n+'?')>0,name+' loads '+n);assert(html.indexOf(n+'?')<html.indexOf('i18n.js?'),name+': '+n+' before i18n.js');});}
 const missing=[];
 for(const file of fs.readdirSync(path.join(__dirname,'touch')).filter(n=>n.endsWith('.js')&&!/^(i18n|i18n-messages(-[a-z]+)?|startup)\.js$/.test(n))){
  const src=fs.readFileSync(path.join(__dirname,'touch',file),'utf8');
  const v2=file==='origin-preview.js'?v2Branches(src):[];
  for(const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)){const v=m[1].replace(/\\n/g," ").replace(/\\'/g,"'").trim().replace(/\s+/g,' ');const lazy=deferred.has(v)&&v2.some(([a,b])=>m.index>=a&&m.index<b);if(v&&/[a-zà-ÿ]{2}/i.test(v)&&!known.has(v)&&!lazy&&v!=='Idle ✓')missing.push(file+': '+v);}
 }
 assert.deepEqual(missing,[],'phrases without a catalog row');
}
console.log('PASS languages: catalogs, whitespace, HTML attributes, protocol/data preservation, persistence, idle-only reload, pending actions, dialogs, storage failures and lifecycle.');
