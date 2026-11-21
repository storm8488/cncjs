'use strict';
// Resolve actual selector specificity, importance and media conditions. This
// catches cascade regressions; rendered rectangles still require browser-run.
const assert = require('assert').strict, fs = require('fs');
const postcss = require('postcss'), selectorParser = require('postcss-selector-parser');
const { parseDOM } = require('htmlparser2'), select = require('css-select');
const sheets = ['app.css','viewport-fit.css','touch-shell.css','ui-2027.css','responsive.css','performance-v2.css'].map(f => postcss.parse(fs.readFileSync(__dirname + '/touch/' + f, 'utf8')));
function compare(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];return 0; }
function specificity(selector) {
  function score(nodes) {
    const out = [0, 0, 0];
    nodes.forEach(n => {
      if (n.type === 'id') out[0]++;
      else if (n.type === 'class' || n.type === 'attribute') out[1]++;
      else if (n.type === 'tag') out[2]++;
      else if (n.type === 'pseudo') {
        if (n.value === ':where') return;
        if ([':is', ':not', ':has'].includes(n.value)) {
          const max = n.nodes.map(s => score(s.nodes)).sort(compare).pop();max.forEach((v, i) => { out[i] += v; });
        } else if (n.value.startsWith('::')) out[2]++;
        else out[1]++;
      }
    });return out;
  }
  return score(selectorParser().astSync(selector).nodes[0].nodes);
}
function media(query, w, h) {
  return query.split(',').some(part => {
    const conditions = Array.from(part.matchAll(/\(([^)]+)\)/g), m => m[1]);
    return conditions.every(c => {
      let m = /^(min|max)-(width|height):\s*(\d+)px$/.exec(c.trim());
      if (m) return m[1] === 'min' ? (m[2] === 'width' ? w : h) >= +m[3] : (m[2] === 'width' ? w : h) <= +m[3];
      m = /^orientation:\s*(portrait|landscape)$/.exec(c.trim());return !!m && (m[1] === 'portrait' ? h >= w : w > h);
    });
  });
}
function value(node, property, w, h) {
  let winner = null, order = 0;
  function expanded(d) {
    if (d.prop === property) return d.value;
    const side = /^padding-(top|right|bottom|left)$/.exec(property);
    if (d.prop === 'padding' && side) {
      const parts = d.value.split(/\s+/), index = ['top','right','bottom','left'].indexOf(side[1]);
      return [parts[0],parts[1] || parts[0],parts[2] || parts[0],parts[3] || parts[1] || parts[0]][index];
    }
    return null;
  }
  sheets.forEach(sheet => sheet.walkRules(rule => {
    if (!rule.nodes.some(n => n.type === 'decl' && expanded(n) !== null)) return;
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && !media(p.params, w, h)) return;
    rule.selectors.forEach(selector => {
      if (/::|:(before|after)\b/.test(selector) || !select.is(node, selector, { pseudos: { 'focus-visible': () => false, 'focus-within': () => false } })) return;
      rule.walkDecls(declaration => {
        const result = expanded(declaration);if (result === null) return;
        const rank = [+!!declaration.important].concat(specificity(selector), [++order]);
        if (!winner || compare(rank, winner.rank) >= 0) winner = { rank, value: result };
      });
    });
  }));return winner && winner.value;
}
for (const [w, h] of [[540,960],[683,384],[720,1080],[1024,600],[1366,448]]) {
  for (const state of ['active','kept']) for (const id of ['machine','files','jog','check','home']) {
    const dom = parseDOM('<body class="ks-ui ks-real"><main><section id="screen-' + id + '" class="screen ks-step-screen ' + state + '"></section></main></body>');
    const screen = select.selectOne('section', dom);
    assert.equal(value(screen, 'height', w, h), 'calc(var(--view-height) - 16px)', id + ' ' + state + ' at ' + w + 'x' + h + ': flex content needs a definite height');
  }
}
for (const classes of ['ks-ui','ks-ui perf-wide perf-v2','ks-ui perf-wide perf-v2 display-large']) {
  const dom = parseDOM('<body class="' + classes + '"><main><section id="screen-home"><div class="job-dashboard" data-zones="2" data-v2="suivi"><div class="home-left"><div class="home-stop"></div></div></div></section></main></body>');
  const left = select.selectOne('.home-left', dom), stop = select.selectOne('.home-stop', dom);
  for (const [w, h] of [[1366,911],[1728,1152]]) {
    assert.equal(value(left, 'position', w, h), 'relative');
    assert.equal(value(left, 'padding-bottom', w, h), '110px', 'preview reserves the complete stop slot plus its gap');
    assert.equal(value(stop, 'position', w, h), 'absolute');assert.equal(value(stop, 'bottom', w, h), '0');
    assert.equal(value(stop, 'height', w, h), '98px');
  }
  assert.notEqual(value(stop, 'position', 1024, 600), 'absolute', 'compact controls remain in their scrolling content flow');
}
console.log('PASS VERT cascade: definite compact session height and reserved Stop slot in both renderers.');
module.exports = { value, parseDOM, select };
