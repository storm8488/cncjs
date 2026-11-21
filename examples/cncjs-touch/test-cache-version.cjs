'use strict';
const assert=require('assert').strict,fs=require('fs'),path=require('path');const dir=path.join(__dirname,'touch');const version=fs.readFileSync(path.join(dir,'tablet-profile.js'),'utf8').match(/ADVANCED_VERSION='([^']+)'/)[1];let n=0;
for(const f of fs.readdirSync(dir).filter(f=>/\.(js|html|css)$/.test(f)))for(const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/\?v=([a-zA-Z0-9_-]+)/g)){assert.equal(m[1],version,f);n++;}assert(n>120);console.log('PASS one cache version: '+n+' references agree with ADVANCED_VERSION.');
