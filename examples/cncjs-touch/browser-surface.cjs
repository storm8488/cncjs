'use strict';

// Serialized into the browser measurers. The modal owns the foreground; the
// strip stops remain part of that surface even when the background is inert.
function surface() {
  var layers = Array.prototype.filter.call(document.querySelectorAll('[role="dialog"],#preview-viewer'), function (n) {
    if (n.closest('[hidden],[inert]') || !n.getClientRects().length) return false;
    var s = getComputedStyle(n);
    return s.display !== 'none' && s.visibility !== 'hidden';
  });
  var top = layers[layers.length - 1];
  var includes = function (n) { return !top || top.contains(n) || /^(t-pause|t-stop)$/.test(n.id) || !!n.closest('#t-pause,#t-stop'); };
  includes.root = top;
  return includes;
}

// Disabled buttons deliberately have pointer-events:none. Probe their painted
// box without enabling them, then restore the exact inline declaration.
function centreHit(el) {
  var value = el.style.getPropertyValue('pointer-events'), priority = el.style.getPropertyPriority('pointer-events');
  var disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
  try {
    if (disabled) el.style.setProperty('pointer-events', 'auto', 'important');
    var r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  } finally {
    if (disabled) { if (value) el.style.setProperty('pointer-events', value, priority); else el.style.removeProperty('pointer-events'); }
  }
}

// An internal scroll is allowed only after actually reaching the target. A
// clipped/covered command does not pass merely because its screen can scroll.
function scrollReachable(el, hitTest) {
  var saved = [], scrolls = false;
  for (var n = el.parentElement; n; n = n.parentElement) {
    saved.push([n, n.scrollTop, n.scrollLeft]);
    var s = getComputedStyle(n);
    if (/^(auto|scroll)$/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) scrolls = true;
  }
  if (!scrolls) return false;
  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    var hit = hitTest(el), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight && !!hit && (hit === el || el.contains(hit));
  } finally { saved.forEach(function (s) { s[0].scrollTop = s[1]; s[0].scrollLeft = s[2]; }); }
}

function inject(source) {
  return source.replace('/* BROWSER_SURFACE */', 'var inSurface=(' + surface + ')(), centreHit=' + centreHit + ', scrollReachable=' + scrollReachable + ';');
}
module.exports = { surface, centreHit, scrollReachable, inject };
