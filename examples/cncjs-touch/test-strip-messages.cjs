'use strict';
// Strip messages (audit 31 cross-check, §1): the notice (what to do next) and the
// system-command line are moved into one cell of the status strip instead of lying over
// the screen; the cell counts the messages shown, the banner hides its age and live values
// meanwhile, a tap drops the whole text below the strip and the next tap anywhere closes
// it. Synthetic DOM (dom-fixture.cjs); the rendered geometry is measured by
// measure-overlay.cjs (--only overlay,real).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {document,node,element}=require('./dom-fixture.cjs').createDOM(['home']);
document.body.getAttribute=()=>null;
const banner=node('real-banner'),notice=node('notice'),line=node('t-system-command');
notice.hidden=true;line.hidden=true;line.className='t-system-command';
const listeners={};
const window={cncI18n:{t:s=>s,html:s=>s,locale:'fr-FR'},addEventListener(n,f){listeners[n]=f;},removeEventListener(n){delete listeners[n];}};
document.createElement=tag=>{const e=element(tag);Object.defineProperty(e,'innerHTML',{set(){e._path={setAttribute(){}};},get(){return '';}});e.querySelector=()=>e._path;return e;};
vm.runInNewContext(fs.readFileSync(__dirname+'/touch/status-strip.js','utf8'),{document,window,Date});
const cell=banner.children.find(c=>c.id==='t-messages'),more=document.body.children.find(c=>c.id==='t-messages-more');
assert(cell&&more,'message cell in the strip, full-text panel in the body');
assert.deepEqual(banner.children.map(c=>c.className),['t-state','t-fresh','t-vitals','t-strip-actions','t-messages']);
assert.equal(banner.children.indexOf(cell),4,'the cell follows the state, the age, the values and the actions (reading order)');
// Both messages are adopted, the notice first.
assert.equal(notice.parentNode,cell);assert.equal(line.parentNode,cell);assert.deepEqual(cell.children.map(c=>c.id),['notice','t-system-command']);
assert.equal(cell.hidden,true);assert.equal(cell.getAttribute('data-count'),'0');assert.equal(banner.getAttribute('data-message'),'false');
assert.equal(more.getAttribute('aria-hidden'),'true','the panel duplicates the text: hidden from screen readers');
const sync=()=>window.cncStatusStrip.syncMessages();
// A notice: one message, the cell shows, the banner hides its age and values (CSS on data-message).
notice.textContent='Rapport machine périmé.';notice.hidden=false;sync();
assert.equal(cell.hidden,false);assert.equal(cell.getAttribute('data-count'),'1');assert.equal(banner.getAttribute('data-message'),'true');
// Plus a system command: two messages share the cell.
line.textContent='Commande système en cours : Mise à jour';line.hidden=false;sync();
assert.equal(cell.getAttribute('data-count'),'2');
// A tap opens the whole text (both messages, the notice first), the next tap anywhere closes it.
cell.handlers.click();
assert.equal(more.hidden,false);assert.equal(cell.getAttribute('aria-expanded'),'true');
assert.deepEqual(more.children.map(p=>p.textContent),['Rapport machine périmé.','Commande système en cours : Mise à jour']);
assert.deepEqual(more.children.map(p=>p.className),['t-messages-notice','t-messages-system']);
// A text change while open is followed.
notice.textContent='Connexion au serveur perdue.';sync();assert.equal(more.children[0].textContent,'Connexion au serveur perdue.');
// A tap inside the panel or the cell is not "outside"; a tap elsewhere closes and goes on.
document.handlers.pointerdown({target:more.children[0]});assert.equal(more.hidden,false,'a tap in the panel is handled by its own click');
document.handlers.pointerdown({target:node('home-job-stop')});assert.equal(more.hidden,true,'a tap elsewhere closes the panel');
assert.equal(cell.getAttribute('aria-expanded'),'false');assert(!document.handlers.pointerdown,'outside listener removed once closed');
// Tap on the cell twice: opens then closes; a tap on the panel closes it.
cell.handlers.click();cell.handlers.click();assert.equal(more.hidden,true);
cell.handlers.click();more.handlers.click();assert.equal(more.hidden,true);
// The system line alone; then nothing: the cell hides and an open panel closes.
notice.hidden=true;notice.textContent='';sync();assert.equal(cell.getAttribute('data-count'),'1');
cell.handlers.click();assert.equal(more.hidden,false);
line.hidden=true;sync();
assert.equal(cell.hidden,true);assert.equal(more.hidden,true);assert.equal(banner.getAttribute('data-message'),'false');
// A hidden message with text, or a shown one without text, does not count.
line.textContent='x';line.hidden=true;notice.hidden=false;notice.textContent='';sync();assert.equal(cell.getAttribute('data-count'),'0');
// A message element created after the strip (by id) is adopted on the next sync.
cell.children.splice(cell.children.indexOf(line),1);line.parentNode=document.body;sync();assert.equal(line.parentNode,cell);
// Leaving the page removes the listeners.
cell.handlers.click();notice.textContent='a';sync();cell.handlers.click();assert.equal(more.hidden,false);
listeners.pagehide({persisted:false});assert.equal(more.hidden,true);assert(!listeners['cnc-job-status']);
console.log('PASS strip messages: notice and system line adopted in the strip cell, count and banner flag, whole text on tap closed by the next tap, cleanup.');
