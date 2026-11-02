const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{
 let listed=[],offset=0;
 class FakeDate extends Date { static now(){ return Date.now()+offset; } }
 const {document,node,activeScreens}=require('./dom-fixture.cjs').createDOM(['files']),handlers={},renders=[],puts=[],emitted=[],reads=[];
 const window={addEventListener:(n,f)=>handlers[n]=f,dispatchEvent:e=>emitted.push(e),
  CNCLibraryPreview:{render:(text,canvas,cancelled)=>new Promise(resolve=>renders.push({text,cancelled,resolve:()=>resolve({image:'data:image/png;base64,AA==',bounds:[0,0,1,1]})}))},
  // Never used any more: an upload that still went through the JSON encoder would fail here.
  CNCLibraryPayload:{encodeFile(){throw new Error('JSON encoding of the program');}}
 };
 const ctx={document,window,Blob,Date:FakeDate,setTimeout:()=>0,CustomEvent:function(type,o){this.type=type;this.detail=o.detail;},localStorage:{getItem:()=>JSON.stringify({state:{session:{token:'fake'}}})},
  // A file flagged latin1 holds Windows-1252 bytes: read as UTF-8, its accents become U+FFFD.
  FileReader:function(){this.readAsText=(file,encoding)=>{reads.push(encoding||'utf-8');this.result=file.latin1?(encoding==='windows-1252'?'G0 X0 (pièce)':'G0 X0 (pi�ce)'):file.genuine?(encoding==='windows-1252'?'G0 X0 (ï¿½)':'G0 X0 (�)'):'G0 X0\nG1 X1';Promise.resolve().then(()=>this.onload());};},
  XMLHttpRequest:function(){this.open=(method,url)=>{this.method=method;this.url=url;};this.headers={};this.setRequestHeader=(k,v)=>{this.headers[k]=v;};this.send=body=>{if(this.method==='PUT')puts.push({url:this.url,body,type:this.headers['Content-Type']});this.status=200;this.responseText=JSON.stringify(this.url.endsWith('/status')?{configured:true}:this.url.endsWith('/files')?{files:listed}:{});Promise.resolve().then(()=>this.onload());};}
 };
 vm.runInNewContext(fs.readFileSync(__dirname+'/touch/shared-library.js','utf8'),ctx);
 const flush=()=>new Promise(setImmediate);await flush();
 node('library-input').files=[{name:'pièce.nc',size:14}];node('library-send').handlers.click();await flush();
 assert.equal(renders.length,1);assert.equal(node('library-cancel').hidden,false);assert.equal(puts.length,0);
 const cancelled=renders.shift();node('library-cancel').handlers.click();assert(cancelled.cancelled());cancelled.resolve();await flush();await flush();assert.equal(puts.length,0,'cancelled before the write: nothing sent');
 node('library-send').handlers.click();await flush();const prepared=renders.shift();assert.equal(prepared.text,'G0 X0\nG1 X1');
 activeScreens.clear();activeScreens.add('home');handlers['cnc-screen-change']({detail:'home'});
 prepared.resolve();for(let i=0;i<5;i++)await flush();
 assert.equal(puts.length,2);
 // The program goes out as its own bytes (the name in the query), the sidecar likewise: no JSON body to build or parse.
 const name=u=>decodeURIComponent(/[?&]file=([^&]*)/.exec(u)[1]);prepared.file=name(puts[0].url);
 assert(puts[0].body instanceof Blob);assert.equal(puts[0].type,'application/octet-stream');assert.equal(await puts[0].body.text(),prepared.text);
 assert.equal(name(puts[1].url),prepared.file+'.cnctouch.json');assert.equal(puts[1].type,'application/octet-stream');assert.equal(JSON.parse(await puts[1].body.text()).file,prepared.file);
 assert.equal(node('library-cancel').hidden,true);assert.equal(window.cncLibrarySelection.file,prepared.file);assert.equal(window.cncLibrarySelection.name,'pièce.nc');
 // The card names the uploaded file at once (it is what "Charger" loads), before CNCjs lists it.
 assert.equal(node('library-name').textContent,'pièce.nc');assert.equal(node('library-image').hidden,false);
 assert(emitted.some(e=>e.type==='cnc-library-preview-updated'&&e.detail.file===prepared.file));
 // CNCjs lists the new file a few seconds later: an older file must not take the selection meanwhile.
 listed=[{name:'ancien.nc',type:'f',size:10,mtime:'2026-10-01T00:00:00Z'}];
 activeScreens.clear();activeScreens.add('files');handlers['cnc-screen-change']({detail:'files'});await flush();await flush();
 assert.equal(window.cncLibrarySelection.file,prepared.file,'the uploaded file stays selected until it is listed');
 listed=[{name:prepared.file,type:'f',size:14,mtime:'2026-10-17T00:00:00Z'},listed[0]];
 node('library-refresh').handlers.click();await flush();await flush();
 assert.equal(window.cncLibrarySelection.file,prepared.file);
 // A Latin-1 (Windows-1252) file is read again in that encoding instead of losing its accents.
 reads.length=0;node('library-input').files=[{name:'latin.nc',size:14,latin1:true}];node('library-send').handlers.click();await flush();await flush();
 const latin=renders.shift();assert.equal(latin.text,'G0 X0 (pièce)','accents kept');assert.deepEqual(reads,['utf-8','windows-1252']);
 puts.length=0;latin.resolve();for(let i=0;i<5;i++)await flush();
 // The decoded text goes out (as UTF-8): the accents survive the conversion.
 assert.equal(await puts[0].body.text(),'G0 X0 (pièce)');
 assert.match(node('library-upload-status').textContent,/Windows-1252/,'the operator is told the file was converted');
 // A UTF-8 file is read once.
 reads.length=0;node('library-input').files=[{name:'utf8.nc',size:14}];node('library-send').handlers.click();await flush();assert.deepEqual(reads,['utf-8']);
 renders.shift().resolve();for(let i=0;i<5;i++)await flush();
 // A valid UTF-8 file that really contains U+FFFD keeps its UTF-8 text.
 node('library-input').files=[{name:'vrai.nc',size:14,genuine:true}];node('library-send').handlers.click();await flush();await flush();
 const genuine=renders.shift();assert.equal(genuine.text,'G0 X0 (�)');
 genuine.resolve();for(let i=0;i<5;i++)await flush();
 assert.doesNotMatch(node('library-upload-status').textContent,/Windows-1252/);
 // An upload CNCjs still does not list 15 s later is never replaced by another file.
 node('library-input').files=[{name:'lent.nc',size:14}];node('library-send').handlers.click();await flush();
 const slow=renders.shift();slow.resolve();for(let i=0;i<5;i++)await flush();
 assert.equal(window.cncLibrarySelection.name,'lent.nc');
 listed=[{name:'ancien.nc',type:'f',size:10,mtime:'2026-10-01T00:00:00Z'}];offset+=16000;
 node('library-refresh').handlers.click();await flush();await flush();
 assert.notEqual(window.cncLibrarySelection&&window.cncLibrarySelection.file,'ancien.nc','no other file selected in its place');
 // A selected file that disappears from the list (deleted or renamed) is not replaced by the newest one.
 listed=[{name:'b.nc',type:'f',size:10,mtime:'2026-10-02T00:00:00Z'},{name:'ancien.nc',type:'f',size:10,mtime:'2026-10-01T00:00:00Z'}];
 node('library-refresh').handlers.click();await flush();await flush();
 const row=node('library-list').children.find(r=>r.getAttribute&&r.getAttribute('data-file')==='ancien.nc');row.handlers.click();await flush();
 assert.equal(window.cncLibrarySelection.file,'ancien.nc');
 listed=[{name:'b.nc',type:'f',size:10,mtime:'2026-10-02T00:00:00Z'}];
 node('library-refresh').handlers.click();await flush();await flush();
 assert.equal(window.cncLibrarySelection,null,'the selection is cleared, never moved to another file');
 console.log('PASS: cancellable until the write, program and sidecar sent as raw bytes (no JSON body), preserved Unicode/global selection while hidden, kept until CNCjs lists the upload, and preview invalidation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
