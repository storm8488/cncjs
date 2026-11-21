'use strict';
// Read-only page probe. Old values are chained within each observer delivery:
// looking only at getAttribute() would miss a removal restored in the same frame.
function observeLayout(durationMs) {
  return new Promise(function (resolve) {
    var screen = document.querySelector('main .screen.active'), started = Date.now(), packets = 0;
    var initialMachine = window.cncState && window.cncState.get().machine;
    var mutations = [], protectedChanges = [], serial = 0, ids = new WeakMap(), truncated = false;
    function identity(node) {
      if (!ids.has(node)) ids.set(node, ++serial);
      return ids.get(node) + ':' + (node.id || node.tagName || 'node');
    }
    function shown(node) {
      var owner = node.closest && node.closest('main .screen');
      if (owner && owner !== screen) return false;
      if (!node.getClientRects || !node.getClientRects().length) return false;
      for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
        var css = getComputedStyle(n);
        if (n.hidden || css.display === 'none' || css.visibility === 'hidden' || css.contentVisibility === 'hidden') return false;
      }
      return true;
    }
    function declarations(value) {
      var style = document.createElement('span').style, result = {};
      style.cssText = value || '';
      for (var i = 0; i < style.length; i++) result[style[i]] = style.getPropertyValue(style[i]);
      return result;
    }
    function save(node, name, from, to, visible) {
      if (from === to) return;
      var change = { target: identity(node), name: name, from: from, to: to, at: Date.now() - started };
      if (node === screen && (name === 'data-fit-overflow' || name === 'style.transform')) protectedChanges.push(change);
      if (visible) { if (mutations.length < 10000) mutations.push(change); else truncated = true; }
    }
    function record(records) {
      records.forEach(function (r, index) {
        var node = r.target, name = r.attributeName, after = node.getAttribute(name);
        for (var i = index + 1; i < records.length; i++) {
          if (records[i].target === node && records[i].attributeName === name) { after = records[i].oldValue; break; }
        }
        var visible = shown(node);
        if (name === 'style') {
          var beforeStyle = declarations(r.oldValue), afterStyle = declarations(after), names = Object.keys(beforeStyle);
          Object.keys(afterStyle).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); });
          names.forEach(function (k) { save(node, 'style.' + k, beforeStyle[k] || '', afterStyle[k] || '', visible); });
        } else save(node, name, r.oldValue, after, visible);
      });
    }
    var observer = new MutationObserver(record);
    observer.observe(document.documentElement, { attributes: true, attributeOldValue: true, subtree: true });
    function packet() { packets++; }
    window.addEventListener('cnc-job-status', packet);
    setTimeout(function () {
      record(observer.takeRecords()); observer.disconnect(); window.removeEventListener('cnc-job-status', packet);
      var pending = {}, cycles = {};
      mutations.forEach(function (m) {
        var key = m.target + '/' + m.name, p = pending[key];
        if (p && m.to === p.value && m.at - p.at <= 1000) {
          if (!cycles[key]) cycles[key] = { target: m.target, name: m.name, count: 0, value: p.value };
          cycles[key].count++; delete pending[key];
        } else if (m.to === null || m.to === '') pending[key] = { value: m.from, at: m.at };
        else delete pending[key];
      });
      var machine = window.cncState && window.cncState.get().machine;
      resolve({ screen: screen && screen.id, durationMs: Date.now() - started, packets: packets,
        workflowStart: initialMachine && initialMachine.workflow, workflowEnd: machine && machine.workflow,
        activeChanged: document.querySelector('main .screen.active') !== screen, truncated: truncated,
        protectedChanges: protectedChanges, periodicResets: Object.keys(cycles).map(function (k) { return cycles[k]; }).filter(function (c) { return c.count >= 2; }),
        mutations: mutations });
    }, durationMs);
  });
}
function checks(sample, phase, durationMs) {
  if (!sample) return ['layout stability sample missing'];
  const out = [];
  if (!sample.screen || sample.activeChanged) out.push('active screen changed during sample');
  if (sample.durationMs < durationMs) out.push('layout sample ended early');
  if (!(sample.packets >= 2)) out.push('no live machine updates during sample');
  if (sample.workflowStart !== phase || sample.workflowEnd !== phase) out.push('wrong workflow during sample');
  if (sample.truncated) out.push('attribute audit truncated');
  if (sample.protectedChanges.length) out.push('active screen overflow/transform changed: ' + JSON.stringify(sample.protectedChanges));
  if (sample.periodicResets.length) out.push('visible attributes/styles repeatedly cleared and restored: ' + JSON.stringify(sample.periodicResets));
  return out;
}
async function measure(cdp, durationMs) {
  return cdp.evaluate('(' + observeLayout + ')(' + durationMs + ')');
}
module.exports = { observeLayout, checks, measure };
