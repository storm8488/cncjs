'use strict';
// Read rendered text ranges, including plain (non-button) file comparison text.
// Kept separate so the offline page test also checks the measurement's failures.
function snapshot() {
  const root = document.getElementById('perf-v2-files');
  if (!root || root.hidden || !root.getClientRects().length) return { shown: false };
  const detail = root.closest('.library-detail'), rect = root.getBoundingClientRect();
  const columns = Array.from(root.querySelectorAll('.lv2-col')).map(n => {
    const r = n.getBoundingClientRect();return { width: r.width, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
  const split = [], clipped = [], scrollers = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node, words = 0;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || !parent.getClientRects().length || !node.data.trim()) continue;
    // Hyphens, dots and underscores in file names are natural separators. A letter
    // sequence (accents included) must stay on one line; check digits as well.
    const re = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;
    let word;
    while ((word = re.exec(node.data))) {
      const range = document.createRange();range.setStart(node, word.index);range.setEnd(node, word.index + word[0].length);
      const boxes = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      const lines = [];
      boxes.forEach(r => { if (!lines.some(top => Math.abs(top - r.top) < 1)) lines.push(r.top); });
      words++;
      if (lines.length > 1) split.push(word[0]);
      if (!boxes.length || boxes.some(r => r.left < rect.left - 1 || r.right > rect.right + 1)) clipped.push(word[0]);
    }
  }
  // This tiny summary must grow in the scrolling card, never create a scroll box.
  [root].concat(Array.from(root.querySelectorAll('*'))).forEach(n => {
    if (!n.getClientRects().length) return;
    const s = getComputedStyle(n);
    if ((/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) ||
        (/auto|scroll/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1)) scrollers.push(n.id || n.className || n.tagName);
    if (/hidden|clip/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) clipped.push(n.id || n.className);
  });
  const d = detail && detail.getBoundingClientRect(), style = detail && getComputedStyle(detail);
  const available = d ? d.width - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0) -
    parseFloat(style.borderLeftWidth || 0) - parseFloat(style.borderRightWidth || 0) : null;
  return { shown: true, width: rect.width, available, columns, words, split, clipped, scrollers };
}
function checks(data, expected = true) {
  if (!expected) return data.shown ? ['v2 summary shown in Eco'] : [];
  if (!data.shown) return ['file comparison missing'];
  const errors = [];
  if (data.columns.length !== 2 || data.columns.some(c => c.width <= 0)) errors.push('two readable file columns required');
  if (data.columns.length === 2) {
    const [a,b] = data.columns;
    if (Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1) errors.push('file columns overlap');
  }
  if (!(data.words > 0)) errors.push('no comparison text measured');
  if (data.available === null || data.width < data.available - 3) errors.push('comparison squeezed into a side column');
  if (data.split.length) errors.push('words split across lines: ' + data.split.join(', '));
  if (data.clipped.length) errors.push('comparison text clipped: ' + data.clipped.join(', '));
  if (data.scrollers.length) errors.push('internal comparison scroll: ' + data.scrollers.join(', '));
  return errors;
}
// Only called by --only screens. Text injection is a geometry fixture: no command,
// permission or identity verdict is modified. The lifecycle transitions are real.
async function measure(cdp, fx, h) {
  const out = [], filename = 'surfacage-400x80-24mm-2passes.nc';
  const variants = [[1920,1080,true],[1728,1152,true],[1366,911,true],[1366,768,false],[1024,600,true],[720,1080,true],[540,960,true]];
  for (const [width, height, v2] of variants) for (const lang of ['fr','en','es']) for (const large of [false,true]) {
    const id = [width,height,v2?'v2':'v1',lang,large?'large':'standard'].join('-');
    const compact = v2 && (width < 1300 || height < 880);
    fx.setPhase('idle');
    await h.setViewport(cdp,compact?1366:width,compact?911:height,1);
    await h.v2Storage(cdp,fx.base,{profile:v2?'performance':'eco',v2:{version:1,enabled:v2},kind:null});
    await h.settingsStorage(cdp,{lang,size:large?'large':'standard',theme:large?'light':'dark'});
    await h.v2Open(cdp,fx.base+'index.html?library='+id,v2);
    await h.goScreen(cdp,'files');
    if (v2) await cdp.waitFor('!!document.getElementById("lv2-load-name")',10000,'file comparison built');
    const unfollow = async () => {
      fx.setPhase('running');
      await cdp.waitFor('(window.cncState.get().machine||{}).workflow==="running"',10000,'library running');
      await cdp.evaluate('window.cncProfile.setPerformance("eco");true');
      if (compact) await h.setViewport(cdp,width,height,1);
      await cdp.waitFor('document.getElementById("lv2-sel-name").textContent===window.cncI18n.t("non suivi")',10000,'library not followed');
    };
    if (compact) await unfollow();
    const readings = [];
    for (const state of v2 ? compact?['unfollowed','names','unknown']:['names','unknown','unfollowed'] : ['eco']) {
      let data;
      if (state === 'names' || state === 'unknown') data = await cdp.evaluate('(function(){(' + function (name, unknown) {
        document.getElementById('lv2-sel-name').textContent = name;
        document.getElementById('lv2-load-name').textContent = unknown ? window.cncI18n.t('État machine indisponible') : name;
        document.getElementById('lv2-load-state').textContent = unknown ? '' : window.cncI18n.t('! Alarme · chargé');
      } + ')(' + JSON.stringify(filename) + ',' + (state==='unknown') + ');return (' + snapshot + ')();})()');
      if (state === 'unfollowed' && !compact) await unfollow();
      if (!data) data = await cdp.evaluate('(' + snapshot + ')()');
      checks(data,v2).forEach(error=>h.failures.push('library '+id+' '+state+': '+error));
      readings.push({state,data});
      await h.capture(cdp,'library-'+id+'-'+state);
    }
    out.push({id,readings});
  }
  fx.setPhase('idle');
  return out;
}
module.exports = { snapshot, checks, measure };
