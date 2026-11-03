/* Réglages → « Axe Z du laser » (laser profile only): many lasers have no Z axis. Masqué hides
 * the Z coordinates and the Z controls on this tablet (body.laser-no-z, elements tagged
 * data-laser-z); it sends nothing to the machine and changes no setting. Kept in this browser
 * (cncjs-touch-laser-z-v1 = {"version":1,"z":true|false}); Z is shown by default and always in CNC. */
(function () {
  'use strict';
  var uiLocale = window.cncI18n || { t: function (s) { return s; }, html: function (s) { return s; } }, t = uiLocale.t;
  var KEY = 'cncjs-touch-laser-z-v1', showZ = true;
  try { var saved = JSON.parse(window.localStorage.getItem(KEY)); if (saved && saved.version === 1 && saved.z === false) showZ = false; } catch (_) { showZ = true; }
  function laser() { return !!(window.cncProfile && window.cncProfile.kind() === 'laser'); }
  function text(e) { return String(e && e.textContent || '').replace(/\s+/g, ' ').trim(); }
  function tag(e) { if (e && e.setAttribute && !e.hasAttribute('data-laser-z')) e.setAttribute('data-laser-z', ''); }
  // Marks every Z element present now: coordinate cells, table rows, Z buttons, the Z jog row.
  function mark() {
    var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
    each('.t-coords > .t-axis', function (a) { if (text(a) === 'Z') { tag(a); tag(a.nextElementSibling); if (a.nextElementSibling) tag(a.nextElementSibling.nextElementSibling); } });
    each('tr', function (r) { var h = r.querySelector('th'); if (h && text(h) === 'Z') tag(r); });
    each('button', function (b) { if (/^(Zéro Z|Z\+|Z−|Z-)$/.test(text(b))) tag(b); });
    each('[data-axis="Z"],[data-axis="z"],.zrow,option[value="z"],option[value="Z"]', tag);
    each('h2', function (h) { if (text(h) === t('Axe Z') || text(h) === 'Axe Z') tag(h); });
  }
  function apply() {
    var hide = laser() && !showZ;
    if (hide) mark();
    if (document.body) document.body.classList.toggle('laser-no-z', hide);
    var card = document.getElementById('ks-laser-z-card');
    if (card) {
      card.hidden = !laser();
      Array.prototype.forEach.call(card.querySelectorAll('[data-laser-z-choice]'), function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-laser-z-choice') === 'on') === showZ)); });
    }
  }
  function choose(on) {
    showZ = on;
    var status = document.getElementById('laser-z-status'), stored = false;
    try { var v = JSON.stringify({ version: 1, z: on }); window.localStorage.setItem(KEY, v); stored = window.localStorage.getItem(KEY) === v; } catch (_) { stored = false; }
    if (status) status.textContent = stored ? t('Enregistré dans ce navigateur uniquement.') : t('Appliqué à cette page ; mémorisation indisponible dans ce navigateur.');
    apply();
  }
  var machineCard = document.getElementById('ks-machine-kind-card');
  if (machineCard && machineCard.insertAdjacentHTML) {
    machineCard.insertAdjacentHTML('afterend', uiLocale.html('<div class="card ks-display-card" id="ks-laser-z-card" hidden><h2>Axe Z du laser <span class="ks-scope" data-scope="tablet">Cette tablette</span></h2><p>Masqué : les coordonnées et commandes Z disparaissent de l’interface, pour un laser sans axe Z. Rien n’est envoyé à la machine.</p><div class="ks-display-choices" role="group" aria-label="Axe Z du laser"><button type="button" data-laser-z-choice="on" aria-pressed="true">Affiché</button><button type="button" data-laser-z-choice="off" aria-pressed="false">Masqué</button></div><p id="laser-z-status" class="ks-help" role="status"></p></div>'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-laser-z-choice]'), function (b) {
      b.addEventListener('click', function () { choose(b.getAttribute('data-laser-z-choice') === 'on'); });
    });
  }
  window.addEventListener('cnc-profile-change', apply);
  // Panels built later (jog, coordinate editor, Suivi values) are marked when a screen opens or a tap may have built one.
  window.addEventListener('cnc-screen-change', apply);
  document.addEventListener('click', function () { if (laser() && !showZ) setTimeout(mark, 300); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  window.cncLaserZ = { shown: function () { return showZ; }, choose: choose, mark: mark };
})();
