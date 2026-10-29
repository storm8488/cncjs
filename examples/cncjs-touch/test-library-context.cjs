'use strict';
// Navigation keeps the library context (audit 31, U9): the search text, the page and the
// selected file survive a trip to another screen and a quiet refresh; a replaced selected
// file stays selected (its preview is invalidated); a deleted one clears the selection
// without picking another file. shared-library.js on the synthetic DOM, mocked server.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{
 const {document,node,activeScreens}=require('./dom-fixture.cjs').createDOM(['files']);
 const handlers={},emitted=[];let time=10000;
 let listed=['part_1','part_2','part_3','part_4','part_5','part_6','part_7'].map((n,i)=>({name:n+'.nc',type:'f',size:100+i,mtime:'2026-10-0'+(i+1)+'T00:00:00Z'}));
 const ctx={document,window:{addEventListener:(n,f)=>handlers[n]=f,dispatchEvent:e=>emitted.push(e)},CustomEvent:function(type,o){this.type=type;this.detail=o.detail;},
  localStorage:{getItem:()=>JSON.stringify({state:{session:{token:'test'}}})},Date:class extends Date{static now(){return time;}},setInterval(){},
  XMLHttpRequest:function(){this.open=(m,url)=>{this.url=url;};this.setRequestHeader=()=>{};this.send=body=>{this.status=200;let result;
   if(this.url.endsWith('status'))result={configured:true};
   else if(this.url.endsWith('files'))result={files:listed.slice()};
   else{const file=JSON.parse(body).file.replace(/\.cnctouch\.json$/,'');result={file:file+'.cnctouch.json',data:JSON.stringify({version:1,file,originalName:file,preview:{image:'data:image/png;base64,AA==',bounds:[0,0,1,1]}}),preview:{stale:false}};}
   this.responseText=JSON.stringify(result);Promise.resolve().then(()=>this.onload());};}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/shared-library.js','utf8'),ctx);
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};await flush();
 const navigate=name=>{activeScreens.clear();activeScreens.add(name);handlers['cnc-screen-change']({detail:name});};
 const rows=()=>node('library-list').children.filter(c=>c.className==='library-file').map(c=>c.getAttribute('data-file'));
 handlers['cnc-library-page-size']({detail:4});await flush();
 assert.equal(node('library-page').textContent,'Page 1 / 2');assert.deepEqual(rows(),['part_7.nc','part_6.nc','part_5.nc','part_4.nc'],'newest first');
 assert.equal(ctx.window.cncLibrarySelection.file,'part_7.nc','an empty selection defaults to the newest file');
 // Search narrows, page resets; then the page is turned and a file picked.
 node('library-search').value='part_';node('library-search').handlers.input();await flush();
 node('library-more').handlers.click();await flush();assert.equal(node('library-page').textContent,'Page 2 / 2');assert.deepEqual(rows(),['part_3.nc','part_2.nc','part_1.nc']);
 node('library-list').children[1].handlers.click();await flush();assert.equal(ctx.window.cncLibrarySelection.file,'part_2.nc');
 // Away and back: the search, the page and the selection are the same; the rows are the same nodes.
 const row=node('library-list').children[1];
 navigate('home');time+=5000;navigate('jog');navigate('files');await flush();
 assert.equal(node('library-search').value,'part_');assert.equal(node('library-page').textContent,'Page 2 / 2');assert.strictEqual(node('library-list').children[1],row);
 assert.equal(ctx.window.cncLibrarySelection.file,'part_2.nc');
 // The loaded program and the selected file are told apart on the rows.
 handlers['cnc-job-status']({detail:{machine:{name:'part_3.nc',fresh:true,workflow:'idle',activeState:'Idle'},simulation:false}});await flush();
 const state=name=>node('library-list').children.find(c=>c.getAttribute('data-file')===name)._state.textContent;
 assert.equal(state('part_2.nc'),'✓ Sélectionné');assert.equal(state('part_3.nc'),'● Chargé');
 // The selected file replaced on the server (new mtime): still selected, preview invalidated.
 listed=listed.map(f=>f.name==='part_2.nc'?Object.assign({},f,{mtime:'2026-10-20T00:00:00Z'}):f);
 node('library-refresh').handlers.click();await flush();
 assert.equal(ctx.window.cncLibrarySelection.file,'part_2.nc');assert(emitted.some(e=>e.type==='cnc-library-preview-updated'&&e.detail.file==='part_2.nc'),'preview invalidated');
 // The selected file deleted on the server: the selection is cleared, no other file is picked.
 listed=listed.filter(f=>f.name!=='part_2.nc');
 node('library-refresh').handlers.click();await flush();
 assert.equal(ctx.window.cncLibrarySelection,null,'nothing selected in its place');assert.equal(node('library-name').textContent,'Sélectionnez un fichier');
 assert.equal(node('library-search').value,'part_','the search survives the refresh');
 console.log('PASS library context: search, page and selection kept across screens and quiet refreshes, selected versus loaded rows, replaced file stays selected, deleted file clears the selection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
