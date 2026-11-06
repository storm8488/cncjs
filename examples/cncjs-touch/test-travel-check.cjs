'use strict';
// Off-machine check before a start: program XY extent placed at the current work
// offset, against stock Grbl 1.1's machine space after homing ([-$13x, 0]). An X or Y
// axis homing the other way ($23 bit) is [0, $13x] only on builds with
// HOMING_FORCE_SET_ORIGIN: unknown. Unknown whenever it cannot be trusted.
const assert=require('assert').strict;
const {check}=require('./touch/travel-check');
const preview=(b)=>({projection:{version:1,units:'mm',wcs:'G54',bounds:b}});
const machine=(mx,my,extra={})=>({operator:{reportUnits:'mm'},settings:{$22:'1',$23:'0',$130:'400.000',$131:'300.000',...extra},
  coordinates:{mpos:{x:String(mx),y:String(my),z:'-5'},wpos:{x:'0.000',y:'0.000',z:'0'}}});
let r=check(preview([0,0,60,70]),machine(-350,-250));
assert.equal(r.state,'ok');assert.deepEqual(r.axes.map(a=>[a.axis,a.min,a.max,a.low,a.high]),[['X',-350,-290,-400,0],['Y',-250,-180,-300,0]]);
assert.match(r.message,/Z non vérifié/);
// Origin too close to the end of X: the program would run past 0.
r=check(preview([0,0,60,70]),machine(-30,-250));
assert.equal(r.state,'outside');assert.match(r.message,/^Hors course machine : X -30,0 → 30,0 mm \(course -400,0 → 0,0\)/);assert.doesNotMatch(r.message,/ Y /);
// Negative program coordinates past -travel.
assert.equal(check(preview([-80,0,10,10]),machine(-350,-250)).state,'outside');
// X or Y homing towards + ($23 bit 0 or 1): the machine space depends on the firmware build.
for(const mask of ['1','2','3']){r=check(preview([0,0,60,70]),machine(30,-250,{$23:mask}));assert.equal(r.state,'unknown',mask);assert.match(r.message,/\$23/);}
// Z bit only ($23=4): X and Y still checked.
assert.equal(check(preview([0,0,60,70]),machine(-350,-250,{$23:'4'})).state,'ok');
// A work offset with G92 or another WCS is just the difference mpos - wpos.
const m=machine(-350,-250);m.coordinates.wpos={x:'10',y:'20',z:'0'};
r=check(preview([0,0,60,70]),m);assert.deepEqual([r.axes[0].min,r.axes[1].min],[-360,-270]);
// A program starting with relative moves runs from the tool's place, not from the work origin.
r=check({projection:{version:1,units:'mm',wcs:'G54',bounds:[0,0,100,50],relativeStart:true}},machine(-50,-250));
assert.equal(r.state,'unknown');assert.match(r.message,/relatifs/);
// Cannot be trusted: no homing, inches, unknown travel or position, no preview.
for(const [p,c,why] of [[preview([0,0,1,1]),machine(-1,-1,{$22:'0'}),/\$22/],[preview([0,0,1,1]),{...machine(-1,-1),operator:{reportUnits:'in'}},/pouces/],
  [preview([0,0,1,1]),machine(-1,-1,{$131:undefined}),/\$131/],[preview([0,0,1,1]),{...machine(-1,-1),coordinates:{mpos:{},wpos:{}}},/position/],
  [null,machine(-1,-1),/aperçu/],[preview([0,0,NaN,1]),machine(-1,-1),/aperçu/],[{projection:{units:'in',bounds:[0,0,1,1]}},machine(-1,-1),/aperçu/]]){
  r=check(p,c);assert.equal(r.state,'unknown');assert.match(r.message,why);
}
// The dialog line: shown with the state as class, hidden for null.
const {show}=require('./touch/travel-check');const line={hidden:true,textContent:'',className:'job-travel'};
show(line,check(preview([0,0,60,70]),machine(-30,-250)));assert.equal(line.hidden,false);assert.equal(line.className,'job-travel outside');assert.match(line.textContent,/^Hors course/);
show(line,null);assert.equal(line.hidden,true);assert.equal(line.textContent,'');assert.equal(line.className,'job-travel');
// Both pages load the two helper modules before the job controls that use them.
for(const name of ['index.html','simulation.html']){
  const html=require('fs').readFileSync(__dirname+'/touch/'+name,'utf8'),at=f=>html.indexOf(f+'?v=');
  for(const f of ['grbl-help.js','travel-check.js'])assert(at(f)>0&&at(f)<at('job-controls.js')&&at(f)<at('job-dashboard.js'),f+' loaded early in '+name);
}
// A program that selects its work offset (audit 31) is placed only at that offset, when it is the active one.
{
 const own=(wcs,extra={})=>({projection:{version:1,units:'mm',wcs:wcs,programWcs:wcs,bounds:[0,0,60,70],...extra}});
 const at=(wcs)=>({...machine(-350,-250),operator:{reportUnits:'mm',wcs}});
 assert.equal(check(own('G55'),at('G55')).state,'ok');
 r=check(own('G55'),at('G54'));assert.equal(r.state,'unknown');assert.match(r.message,/repère/);
 assert.equal(check(own('G54'),machine(-350,-250)).state,'unknown','active offset unknown');
 assert.equal(check(own('G54'),at('G54')).state,'ok');
 // Older previews (no programWcs) keep their behaviour; G28/G30 returns are named as not checked.
 assert.equal(check(preview([0,0,60,70]),machine(-350,-250)).state,'ok');
 r=check(own(null,{wcs:'G54',returns:true}),machine(-350,-250));assert.equal(r.state,'ok');assert.match(r.message,/Retours G28\/G30 non vérifiés/);
 assert.equal(check(own('G56',{bounds:[0,0,500,70]}),at('G54')).state,'unknown','never outside in a wrong frame');
}
console.log('PASS travel check: XY extent at the work offset against both homing directions, outside detection, and every untrusted case reported unknown.');
