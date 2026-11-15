'use strict';
const assert=require('assert').strict,fs=require('fs'),path=require('path'),{pure}=require('./session-fixture.cjs');const {window}=pure();
const data=window.CNCTouchRefus,remedies=new Set('connecter prendre-la-main remise-en-route prise-origine relire verifier-zero arreter-broche arreter-usinage voir-usinage refaire-zero-z refaire-zero choisir-fichier recharger-fichier reessayer-controle ma-sonde plaque tester-sonde pourquoi-sonde dessin-depart relancer-palpage changer-ligne reprendre-debut recommencer voir-controle vitesse type-machine recharger-page details aucun'.split(' '));
const root=path.join(__dirname,'../../src/server/services/touch');const files=fs.readdirSync(root).filter(f=>f.endsWith('.js')).map(f=>path.join(root,f)).concat(path.join(root,'../../api/api.touch.js'));
const codes=new Set(['ECONTROL',...window.CNCTouchCodes.map(r=>r[0])]);for(const f of files)for(const m of fs.readFileSync(f,'utf8').matchAll(/\bETOUCH_[A-Z0-9_]*[A-Z0-9]\b/g))codes.add(m[0]);
const families=new Map(data.familles.map(r=>[r[0],r]));for(const c of codes){assert(data.codes[c],c+' has an explicit family');const row=families.get(data.codes[c]);assert(row,c);assert(!/^\d+$/.test(row[0]));for(const s of row.slice(1,4))assert.equal(typeof s,'string');for(const r of row.slice(4))assert(remedies.has(r),c+' remedy '+r);}
assert.equal(data.codes.ETOUCH_START_OVERRIDE_UNSAFE,'derogation-impossible');assert.equal(data.codes.ETOUCH_OFFSET_SETTINGS,'reglages-non-lus');
// L6: exercise the presenter for every code, not only its family assignment.
// Different codes may intentionally share the family's operator phrase (§9.2).
const technical=/\$\d|\b[GM]\d+\b|\b(?:Idle|Run|Hold|Jog|Home|Door)\b/;
for(const language of ['fr','en','es']){
 const p=pure(language).window;
 for(const code of codes){
  const r=p.cncRefus.lire({code,params:{axis:'Z',over:15.2,line:42,owner:'PC',n:2,field:'Z',search:10,max:8,s:18000,file:'part.nc'}});
  assert(r.phrase.trim(),code+' operator phrase '+language);
  assert(!/[{}]|ETOUCH_/.test(r.phrase),code+' has no template or code leak');
  assert(!technical.test(r.phrase),code+' technical phrase: '+r.phrase);
  if(language==='fr')assert(r.phrase.length<=90,code+' exceeds 90 characters: '+r.phrase);
  else assert.notEqual(r.phrase,pure('fr').window.cncRefus.lire({code,params:{axis:'Z',over:15.2,line:42,owner:'PC',n:2,field:'Z',search:10,max:8,s:18000,file:'part.nc'}}).phrase,code+' translated '+language);
  for(const remedy of r.remedes)assert(remedies.has(remedy),code+' presenter remedy');
 }
}
console.log('PASS refusal coverage: '+codes.size+'/'+codes.size+' server/catalog codes, named families, FR/EN/ES and closed remedy list.');
