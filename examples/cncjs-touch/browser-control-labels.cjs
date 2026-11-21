'use strict';
// Rendered text/plot checks, shared with the offline negative controls.
function measure() {
 const box = r => ({ left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height });
 const labels = [], plots = [], shapes = [], rail = [];
 for (const host of document.querySelectorAll('#check-top, #check-side')) {
  const diagram = host.querySelector('.pc-diagram'), svg = host.querySelector('svg');
  if (!svg) continue;
  plots.push({ owner:host.id, box:box(svg.getBoundingClientRect()), svgText:svg.querySelectorAll('text').length });
  for (const shape of svg.querySelectorAll('g rect, g path, g circle')) shapes.push({ owner:host.id, box:box(shape.getBoundingClientRect()) });
  for (const label of host.querySelectorAll('.pc-label')) {
   const range = document.createRange(); range.selectNodeContents(label);
   const style = getComputedStyle(label);
   labels.push({ owner:host.id, text:label.textContent, box:box(label.getBoundingClientRect()), frame:box(diagram.getBoundingClientRect()),
    lines:Array.from(range.getClientRects(), box), stroke:style.webkitTextStrokeWidth, font:parseFloat(style.fontSize) });
  }
 }
 // A tall overrun legend may scroll with its card. Prove that every caption
 // can be revealed in full; never excuse a clipped paragraph merely because
 // some ancestor declares overflow:auto. Restore the page before returning.
 const saved = new Map();
 for (const label of document.querySelectorAll('#check-top .pc-label, #check-side .pc-label')) {
  for (let p = label.parentNode; p && p.nodeType === 1; p = p.parentNode) if (!saved.has(p)) saved.set(p, [p.scrollLeft,p.scrollTop]);
 }
 const originScroll = [window.scrollX,window.scrollY];
 let index = 0;
 for (const label of document.querySelectorAll('#check-top .pc-label, #check-side .pc-label')) {
  label.scrollIntoView({block:'nearest',inline:'nearest'});
  const r = label.getBoundingClientRect();
  let visible = r.left >= -.5 && r.right <= window.innerWidth + .5 && r.top >= -.5 && r.bottom <= window.innerHeight + .5;
  for (let p = label.parentNode; p && p.nodeType === 1; p = p.parentNode) {
   const style = getComputedStyle(p), q = p.getBoundingClientRect();
   if (/auto|scroll|hidden|clip/.test(style.overflowY) && (r.top < q.top - .5 || r.bottom > q.bottom + .5)) visible = false;
   if (/auto|scroll|hidden|clip/.test(style.overflowX) && (r.left < q.left - .5 || r.right > q.right + .5)) visible = false;
  }
  labels[index++].reachable = visible;
 }
 for (const [element, position] of saved) { element.scrollLeft = position[0]; element.scrollTop = position[1]; }
 window.scrollTo(originScroll[0],originScroll[1]);
 for (const label of document.querySelectorAll('#tabbar .ks-nav-name')) {
  const range = document.createRange(), broken = [], node = label.firstChild;
  if (node && node.nodeType === 3) {
   const words = /\S+/g; let word;
   while ((word = words.exec(node.textContent))) {
    range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
    const tops = Array.from(range.getClientRects()).filter(r => r.width).map(r => Math.round(r.top));
    if (new Set(tops).size > 1) broken.push(word[0]);
   }
  }
  range.selectNodeContents(label);
  rail.push({ text:label.textContent, broken, box:box(label.parentNode.getBoundingClientRect()), lines:Array.from(range.getClientRects(), box),
   hyphens:getComputedStyle(label).hyphens, font:parseFloat(getComputedStyle(label).fontSize) });
 }
 return { labels, plots, shapes, rail, large:document.body.classList.contains('display-large') };
}
function checks(data) {
 const errors = [], overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
 const inside = (a,b) => a.left >= b.left - .5 && a.right <= b.right + .5 && a.top >= b.top - .5 && a.bottom <= b.bottom + .5;
 if (data.plots.length !== 2 || data.labels.length < 2) errors.push('missing control drawings or captions');
 for (const plot of data.plots) if (plot.svgText) errors.push(plot.owner + ': text still drawn inside SVG');
 data.labels.forEach((label,i) => {
  if (!label.text || !label.lines.length || label.font < (data.large ? 18 : 16) || parseFloat(label.stroke)) errors.push('unreadable caption: ' + label.text);
  if (!label.reachable || !inside(label.box,label.frame) || label.lines.some(line => !inside(line,label.box))) errors.push('clipped caption: ' + label.text);
  if (data.plots.some(p => overlap(label.box,p.box)) || data.shapes.some(p => overlap(label.box,p.box))) errors.push('caption overlaps plot: ' + label.text);
  if (data.labels.slice(i+1).some(other => overlap(label.box,other.box))) errors.push('captions overlap: ' + label.text);
 });
 if (data.rail.length !== 6) errors.push('missing rail labels');
 for (const label of data.rail) {
  if (/\u00ad|&shy;/.test(label.text) || label.broken.length || label.hyphens !== 'none') errors.push('hyphenated rail word: ' + label.text);
  if (label.font < (data.large ? 18 : 16) || label.box.width < 64 || label.box.height < 64 || label.lines.some(line => !inside(line,label.box))) errors.push('clipped or undersized rail label: ' + label.text);
 }
 return errors;
}
function cases() {
 const {check} = require('./check-page-fixture.cjs');
 const fits = check();
 fits.axes.X.max = fits.axes.X.machineMax = 399; fits.axes.X.min = fits.axes.X.machineMin = 0;
 fits.axes.Y.max = fits.axes.Y.machineMax = 387; fits.axes.Y.min = fits.axes.Y.machineMin = 0;
 const result = [{ name:'fits-coincident-zero', check:fits, coordinates:{mpos:{x:0,y:0}} }];
 for (const [axis,sign] of [['X','-'],['X','+'],['Y','-'],['Y','+'],['Z','-'],['Z','+']]) {
  const c = check('outside'), a = c.axes[axis]; a.verdict = 'outside';
  if (sign === '-') { a.machineMin = a.usable.low - 15.7; a.min = a.machineMin; }
  else { a.machineMax = a.usable.high + 15.7; a.max = a.machineMax; }
  c.blocking = [{ axis, sign, code:axis === 'Z' ? sign === '-' ? 'ETOUCH_TRAVEL_TOO_LOW' : 'ETOUCH_TRAVEL_TOO_HIGH' : 'ETOUCH_TRAVEL_BEYOND', params:{axis,sign,over:'15.7'} }];
  result.push({ name:axis+sign, check:c, coordinates:{mpos:{x:-1000,y:1000}} });
 }
 const all = check('outside');
 for (const axis of ['X','Y','Z']) { all.axes[axis].verdict = 'outside'; all.axes[axis].machineMin = all.axes[axis].usable.low - 20; all.axes[axis].machineMax = all.axes[axis].usable.high + 20; }
 all.blocking = result.slice(1).map(c => c.check.blocking[0]);
 result.push({ name:'all-six-sides', check:all, coordinates:{mpos:{x:'0',y:'0'}} });
 const unknown = check('unknown'); unknown.axes.X.usable = null; unknown.axes.Z.usable = null;
 result.push({ name:'unknown', check:unknown }); result.push({ name:'no-file', check:null });
 return result;
}
module.exports = { measure:String(measure), checks, cases };
