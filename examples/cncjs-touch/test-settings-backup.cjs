'use strict';
// Plus → Réglages → Machine et performances → « Sauvegarde des réglages de la carte » (settings-backup.js, lot N8):
// the list is read on the Machine tab and when the board's settings have been read; « Sauvegarder maintenant »
// posts a save; « Comparer à la carte » lists what differs (old → current, with a plain label when known);
// « Exporter » hands the file to the page's download path; a drift since the last backup is told in the card and
// by one line on 1 · Machine; « Relire » is the existing guarded action. The card says there is no restoration,
// and no request ever goes anywhere but api/touch-settings-backups (never to api/touch-job).
const assert = require('assert').strict, fs = require('fs'), path = require('path'), vm = require('vm');
const read = (name) => fs.readFileSync(path.join(__dirname, 'touch', name), 'utf8');
const source = read('settings-backup.js');

function el(tag) {
  const n = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, hidden: false, disabled: false, type: '', className: '', id: '', attrs: {}, handlers: {}, _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; n.children.push(c); return c; },
    removeChild(c) { const i = n.children.indexOf(c); if (i < 0) throw Error('Child missing'); n.children.splice(i, 1); c.parentNode = null; return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener(t, f) { n.handlers[t] = f; }, click() { if (n.handlers.click) n.handlers.click({ target: n }); },
    get lastChild() { return n.children[n.children.length - 1] || null; },
    classList: { contains: (c) => c === 'active' } };
  return n;
}
function all(root, pred) { const out = []; const walk = (x) => x.children.forEach((c) => { if (pred(c)) out.push(c); walk(c); }); walk(root); return out; }
const byClass = (root, cls) => all(root, (c) => new RegExp('(^| )' + cls + '( |$)').test(c.className));
const visible = (n) => { for (let x = n; x; x = x.parentNode) if (x.hidden) return false; return true; };

const LUNYEE = { port: '/dev/ttyUSB0', generation: 'g1', startups: 1, firmware: 'Grbl 1.1f', settingsCount: 34, canReadSettings: true, workflow: 'idle', refusals: {} };
const NEW = { id: 'reglages-20261126T211530Z.json', at: '2026-11-26T21:15:30.000Z', port: '/dev/ttyUSB0', firmware: 'Grbl 1.1f', profile: { label: 'LUNYEE 4040', kind: 'cnc' }, count: 34, first: false };
const OLD = { id: 'reglages-20261113T090000Z.json', at: '2026-11-13T09:00:00.000Z', port: '/dev/ttyUSB0', firmware: 'Grbl 1.1f', profile: { label: '', kind: 'cnc' }, count: 34, first: true };

function setup({ language = 'fr', machine = LUNYEE, tab = 'machine', session = true } = {}) {
  const state = { machine }, requests = [], listeners = {}, saved = [], reads = [];
  const panel = el('section'); panel.id = 'screen-settings'; panel.attrs['data-settings-tab'] = tab;
  const machineList = el('ul'); machineList.id = 'machine-list'; machineList.appendChild(el('li'));
  const layout = el('div'); layout.id = 'machine-layout'; layout.attrs['data-incident'] = 'false';
  const ids = { 'screen-settings': panel, 'machine-list': machineList, 'machine-layout': layout };
  const document = { hidden: false, createElement: el, addEventListener(n, f) { listeners[n] = f; }, getElementById: (id) => ids[id] || null };
  const window = { addEventListener: (n, f) => { listeners[n] = f; }, cncState: { get: () => ({ apiBase: '/api', machine: state.machine }) },
    CNCDownload: { save: (blob, name) => saved.push({ blob, name }) },
    cncJobControls: { readSettings: () => { reads.push(1); return state.readRefusal ? Promise.reject(new Error(state.readRefusal)) : Promise.resolve({}); } } };
  const stored = new Map([['cncjs-touch-language-v1', language], ['cnc', JSON.stringify({ state: { session: { token: session ? 'tok' : '' } } })]]);
  const localStorage = { getItem: (k) => (stored.has(k) ? stored.get(k) : null), setItem() {} };
  function XMLHttpRequest() { this.headers = {}; }
  XMLHttpRequest.prototype.open = function (m, u) { this.method = m; this.url = u; };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XMLHttpRequest.prototype.send = function (body) { requests.push(this); this.body = body ? JSON.parse(body) : null; };
  function Blob(parts, options) { this.text = parts.join(''); this.type = options.type; }
  const context = { window, document, XMLHttpRequest, localStorage, JSON, Date, Blob, Array, Number, String, Math, encodeURIComponent };
  // The real catalogs and translator: every phrase of the card exists in the three languages.
  ['i18n-messages.js', 'i18n-messages-backup.js', 'i18n.js'].forEach((name) => vm.runInNewContext(read(name), Object.assign(context, { document: Object.assign(document, { documentElement: {}, title: '' }) })));
  vm.runInNewContext(source, context);
  const card = panel.children[0];
  const answer = (x, status, data) => { x.status = status; x.responseText = data === undefined ? 'Forbidden' : JSON.stringify(data); x.onload(); };
  const status = () => { if (listeners['cnc-job-status']) listeners['cnc-job-status'](); };
  return { state, requests, listeners, saved, reads, panel, card, machineList, layout, answer, status, window,
    text: () => all(card, visible).filter((c) => !c.children.length).map((c) => c.textContent).join('\n'),
    button: (cls, i = 0) => byClass(card, cls)[i] };
}
const LIST = { backups: [NEW, OLD], max: 20, drift: { id: NEW.id, at: NEW.at, changed: 0 } };

(async () => {
  // ---- The card: where it is, what it says, what it asks at load ----
  {
    const p = setup();
    assert.equal(p.card.id, 'ks-settings-backup');
    assert.match(p.card.textContent, /Sauvegarde des réglages de la carte/);
    assert.match(p.card.textContent, /La restauration se fait à la main, réglage par réglage\./);
    assert.match(p.card.textContent, /Rien n’est écrit dans la carte d’ici\./);
    assert.equal(byClass(p.card, 'ks-scope')[0].getAttribute('data-scope'), 'server', 'the files are the server’s');
    // Settings already read at load: one GET, with the session token and the port.
    assert.equal(p.requests.length >= 1, true);
    p.requests.forEach((x) => { assert.equal(x.method, 'GET'); assert.equal(x.url, '/api/touch-settings-backups?port=%2Fdev%2FttyUSB0'); assert.equal(x.headers.Authorization, 'Bearer tok'); assert.equal(x.body, null); });
    assert.equal(p.button('ks-backup-save').disabled, true, 'nothing can be saved before the list is known');
    while (p.requests.length) p.answer(p.requests.shift(), 200, LIST);
    assert.match(p.text(), /Dernière sauvegarde : 26\/11\/2026.* · 34 réglages · 2 sur 20 gardées/);
    assert.match(p.text(), /La carte a les mêmes réglages que la dernière sauvegarde\./);
    assert.match(p.text(), /Première sauvegarde, toujours gardée/);
    assert.match(p.text(), /LUNYEE 4040/);
    assert.equal(byClass(p.card, 'ks-backup-compare').length, 2);
    assert.equal(p.button('ks-backup-save').disabled, false);
    assert.equal(p.machineList.children.length, 1, 'no line on 1 · Machine while nothing changed');

    // ---- Sauvegarder maintenant: one POST {action:'save', port}, the list and the status follow ----
    p.button('ks-backup-save').click();
    assert.equal(p.requests.length, 1);
    let x = p.requests.shift();
    assert.equal(x.method, 'POST'); assert.equal(x.url, '/api/touch-settings-backups'); assert.deepEqual(x.body, { action: 'save', port: '/dev/ttyUSB0' });
    assert.equal(p.button('ks-backup-save').disabled, true, 'busy: no second save');
    p.button('ks-backup-save').click(); assert.equal(p.requests.length, 0);
    const fresh = { ...NEW, id: 'reglages-20261127T080000Z.json', at: '2026-11-27T08:00:00.000Z' };
    p.answer(x, 200, { saved: { id: fresh.id, at: fresh.at, count: 34 }, backups: [fresh, NEW, OLD], max: 20, drift: { id: fresh.id, at: fresh.at, changed: 0 } });
    assert.match(p.text(), /Sauvegarde enregistrée : 27\/11\/2026.* · 34 réglages/);
    assert.equal(byClass(p.card, 'ks-backup-compare').length, 3);
    assert.equal(p.button('ks-backup-save').disabled, false);

    // ---- Comparer à la carte: old → current, with the plain label when it is known ----
    p.button('ks-backup-compare', 2).click();
    x = p.requests.shift();
    assert.deepEqual(x.body, { action: 'compare', id: OLD.id, port: '/dev/ttyUSB0' });
    p.answer(x, 200, { id: OLD.id, at: OLD.at, changes: [
      { name: '$23', saved: '3', current: '0' }, { name: '$39', saved: null, current: '1' },
      { name: '$130', saved: '408.000', current: '400.000' }, { name: '$27', saved: '2.000', current: null }], same: 30 });
    const result = byClass(p.card, 'ks-backup-result')[0];
    assert.equal(result.hidden, false);
    assert.match(result.textContent, /Comparaison avec la sauvegarde du 13\/11\/2026/);
    assert.match(result.textContent, /4 réglages différents\./);
    const cells = all(result, (c) => c.tagName === 'TR').map((tr) => tr.children.map((c) => c.textContent));
    assert.deepEqual(cells, [
      ['Réglage', 'Sauvegarde', 'Carte maintenant'],
      ['$23 · Sens de la prise d’origine', '3', '0'],
      ['$39', 'absent', '1'],
      ['$130 · Course de l’axe · X', '408.000', '400.000'],
      ['$27 · Dégagement après la prise d’origine', '2.000', 'absent']
    ]);
    // Identical: said in one sentence, no empty table.
    p.button('ks-backup-compare', 0).click();
    p.answer(p.requests.shift(), 200, { id: fresh.id, at: fresh.at, changes: [], same: 34 });
    assert.match(result.textContent, /Aucune différence : la carte a les mêmes réglages que cette sauvegarde\./);
    assert.equal(all(result, (c) => c.tagName === 'TABLE').length, 0);

    // ---- Exporter: the file through the page's download path, named as on the server ----
    p.button('ks-backup-export', 1).click();
    x = p.requests.shift();
    assert.deepEqual(x.body, { action: 'read', id: NEW.id, port: '/dev/ttyUSB0' });
    p.answer(x, 200, { backup: { ...NEW, format: 'cncjs-touch-settings-backup', version: 1, settings: { $130: '408.000' } } });
    assert.equal(p.saved.length, 1);
    assert.equal(p.saved[0].name, NEW.id);
    assert.equal(p.saved[0].blob.type, 'application/json');
    assert.deepEqual(JSON.parse(p.saved[0].blob.text).settings, { $130: '408.000' });
    assert.match(p.text(), /Sauvegarde proposée au téléchargement\./);

    // ---- Refusals of the server, in the operator's words ----
    p.button('ks-backup-save').click();
    p.answer(p.requests.shift(), 409, { message: 'Lecture de la version et des réglages en cours : patientez quelques secondes.', code: 'ETOUCH_SETTINGS_READING' });
    assert.match(p.text(), /Lecture des réglages en cours : réessayez dans quelques secondes\./);
    p.button('ks-backup-compare', 0).click();
    p.answer(p.requests.shift(), 404, { message: 'Sauvegarde introuvable ou illisible.', code: 'EBACKUP_UNREADABLE' });
    assert.match(p.text(), /Cette sauvegarde est illisible\./);
    p.button('ks-backup-save').click();
    p.answer(p.requests.shift(), 404);
    assert.match(p.text(), /le serveur CNCjs de la tablette doit être mis à jour/);
    p.button('ks-backup-save').click();
    const lost = p.requests.shift(); lost.onerror();
    assert.match(p.text(), /Serveur CNCjs injoignable\./);
    assert.equal(p.button('ks-backup-save').disabled, false, 'a failure frees the buttons');

    // ---- Relire: the existing guarded action, never a request of this card ----
    p.button('ks-backup-reread').click();
    assert.equal(p.reads.length, 1); assert.equal(p.requests.length, 0);
    await Promise.resolve();
    p.state.readRefusal = 'Usinage en cours.';
    p.button('ks-backup-reread').click();
    await Promise.resolve(); await Promise.resolve();
    assert.match(p.text(), /Usinage en cours\./);
    p.state.machine = { ...LUNYEE, canReadSettings: false }; p.status();
    assert.equal(p.button('ks-backup-reread').disabled, true);
    p.button('ks-backup-reread').click(); assert.equal(p.reads.length, 2);

    // Nothing here ever talks to the machine's API.
    assert(!/touch-job|writeln|gcode/.test(source), 'no machine request in settings-backup.js');
  }

  // ---- The settings being read again: nothing is asked meanwhile, the list is asked once they are back ----
  {
    const p = setup();
    while (p.requests.length) p.answer(p.requests.shift(), 200, LIST);
    p.state.machine = { ...LUNYEE, refusals: { readSettings: { code: 'ETOUCH_SETTINGS_READING' } } }; p.status();
    assert.equal(p.requests.length, 0);
    assert.equal(p.button('ks-backup-save').disabled, true);
    assert.equal(p.button('ks-backup-compare').disabled, true);
    assert.match(p.text(), /Lecture des réglages…/);
    // A list asked while they are being read (the tab is opened) cannot say what changed: it is
    // asked again once they are read, after that answer and never over it.
    p.listeners['cnc-settings-tab']({ detail: 'machine' });
    assert.equal(p.requests.length, 1);
    p.state.machine = { ...LUNYEE }; p.status();
    assert.equal(p.requests.length, 1, 'one request at a time');
    p.answer(p.requests.shift(), 200, { ...LIST, drift: null });
    assert.equal(p.requests.length, 1, 'one list request once the settings are read');
    p.status(); p.status();
    assert.equal(p.requests.length, 1, 'the same state asks nothing more');
    // What changed is told in the card and on 1 · Machine.
    p.answer(p.requests.shift(), 200, { ...LIST, drift: { id: NEW.id, at: NEW.at, changed: 2 } });
    assert.match(p.text(), /2 réglages de la machine ont changé depuis la sauvegarde du 26\/11\/2026/);
    assert.equal(byClass(p.card, 'ks-backup-drift')[0].getAttribute('data-tone'), 'warn');
    assert.equal(p.machineList.children.length, 2);
    const line = p.machineList.children[1];
    assert.equal(line.getAttribute('data-line'), 'sauvegarde');
    assert.match(line.textContent, /2 réglages de la machine ont changé depuis la sauvegarde du 26\/11\/2026.*À voir dans Plus → Réglages\./);
    assert.equal(all(line, (c) => c.tagName === 'BUTTON').length, 0, 'a line, not a command');
    // An incident on 1 · Machine comes first: the line leaves, and comes back after it.
    p.layout.attrs['data-incident'] = 'true'; p.status();
    assert.equal(p.machineList.children.length, 1);
    p.layout.attrs['data-incident'] = 'false'; p.status();
    assert.equal(p.machineList.children.length, 2);
    // One setting: singular.
    p.state.machine = { ...LUNYEE, startups: 2 }; p.status();
    p.answer(p.requests.shift(), 200, { ...LIST, drift: { id: NEW.id, at: NEW.at, changed: 1 } });
    assert.match(p.machineList.children[1].textContent, /^○1 réglage de la machine a changé depuis la sauvegarde du/);
    // Machine disconnected: nothing is claimed about a board that is not there.
    p.state.machine = null; p.status();
    assert.equal(p.machineList.children.length, 1);
    assert.equal(p.button('ks-backup-save').disabled, true);
    assert.equal(p.button('ks-backup-compare').disabled, true);
    assert.equal(p.button('ks-backup-export').disabled, false, 'a saved file can still be exported');
    assert.match(p.text(), /Machine non connectée : la liste reste consultable, pas la comparaison\./);
    assert.equal(p.requests.length, 0);
  }

  // ---- No settings read, no backup, hidden tab, old server, no session ----
  {
    const p = setup({ machine: { ...LUNYEE, settingsCount: 0 } });
    // The Machine tab is shown: the list is read, but nothing can be saved or compared.
    assert.equal(p.requests.length, 1);
    p.answer(p.requests.shift(), 200, { backups: [], max: 20, drift: null });
    assert.match(p.text(), /Aucune sauvegarde pour l’instant\./);
    assert.match(p.text(), /Réglages pas encore lus : touchez « Relire », machine au repos\./);
    assert.equal(p.button('ks-backup-save').disabled, true);
    p.button('ks-backup-save').click(); assert.equal(p.requests.length, 0);
    assert.equal(p.machineList.children.length, 1);
  }
  {
    // Another tab: the card asks only when the settings have been read, and paints nothing hidden.
    const p = setup({ tab: 'display', machine: null });
    assert.equal(p.requests.length, 0);
    p.listeners['cnc-settings-tab']({ detail: 'system' });
    assert.equal(p.requests.length, 0);
    p.panel.attrs['data-settings-tab'] = 'machine';
    p.listeners['cnc-settings-tab']({ detail: 'machine' });
    assert.equal(p.requests.length, 1);
    p.answer(p.requests.shift(), 404);
    assert.match(p.text(), /Sauvegarde indisponible : le serveur CNCjs de la tablette doit être mis à jour\./);
    assert.equal(p.button('ks-backup-save').disabled, true);
  }
  {
    const p = setup({ session: false });
    assert.equal(p.requests.length, 0, 'no request without a session');
    assert.match(p.text(), /Session CNCjs requise/);
  }

  // ---- Many backups: five and the first one in sight, the others on demand ----
  {
    const p = setup();
    const many = []; for (let i = 0; i < 12; i++) many.push({ ...NEW, id: 'reglages-202611' + String(26 - i) + 'T211530Z.json', at: new Date(Date.UTC(2026, 10, 26 - i, 21, 15, 30)).toISOString(), first: i === 11 });
    while (p.requests.length) p.answer(p.requests.shift(), 200, { backups: many, max: 20, drift: null });
    assert.equal(byClass(p.card, 'ks-backup-compare').length, 6);
    assert.match(byClass(p.card, 'ks-backup-list')[0].children[5].textContent, /Première sauvegarde, toujours gardée/);
    const more = p.button('ks-backup-more');
    assert.equal(more.hidden, false); assert.equal(more.textContent, 'Afficher les 6 autres');
    more.click();
    assert.equal(byClass(p.card, 'ks-backup-compare').length, 12); assert.equal(more.textContent, 'Afficher moins');
    more.click();
    assert.equal(byClass(p.card, 'ks-backup-compare').length, 6);
    // A damaged file is shown as such, without buttons.
    p.listeners['cnc-settings-tab']({ detail: 'machine' });
    p.answer(p.requests.shift(), 200, { backups: [{ id: 'reglages-20261127T000000Z.json', damaged: true, first: false }, NEW], max: 20, drift: null });
    const rows = byClass(p.card, 'ks-backup-list')[0].children;
    assert.match(rows[0].textContent, /reglages-20261127T000000Z\.json · fichier illisible/);
    assert.equal(all(rows[0], (c) => c.tagName === 'BUTTON').length, 0);
    assert.equal(more.hidden, true);
  }

  // ---- English and Spanish: every phrase of the card is translated, the data stay as they are ----
  for (const [language, title, drift, label] of [
    ['en', 'Backup of the board settings', /2 machine settings have changed since the backup of 26\/11\/2026/, '$130 · Axis travel · X'],
    ['es', 'Copia de los ajustes de la placa', /2 ajustes de la máquina han cambiado desde la copia del 26\/11\/2026/, '$130 · Recorrido del eje · X']]) {
    const p = setup({ language });
    assert.match(p.card.textContent, new RegExp(title));
    while (p.requests.length) p.answer(p.requests.shift(), 200, { ...LIST, drift: { id: NEW.id, at: NEW.at, changed: 2 } });
    assert.match(p.text(), drift);
    assert.match(p.machineList.children[1].textContent, drift);
    p.button('ks-backup-compare', 0).click();
    p.answer(p.requests.shift(), 200, { id: NEW.id, at: NEW.at, changes: [{ name: '$130', saved: '408.000', current: '400.000' }], same: 33 });
    assert.equal(all(p.card, (c) => c.tagName === 'TR')[1].children[0].textContent, label);
    assert(!/[àéèêç]/.test(p.text().replace(/LUNYEE.*/g, '')), language + ': no French left in the card: ' + p.text());
  }

  // ---- The page loads the card and its catalog; the Machine tab shows it, the two others hide it ----
  const html = read('index.html'), css = read('touch-shell.css');
  assert(/<script defer src="settings-backup\.js\?v=/.test(html));
  assert(html.indexOf('i18n-messages-backup.js?') > 0 && html.indexOf('i18n-messages-backup.js?') < html.indexOf('i18n.js?'));
  assert(html.indexOf('settings-backup.js?') > html.indexOf('system-monitor.js?'), 'after the settings tabs exist');
  assert(/\[data-settings-tab=machine\]>[^{]*:not\(#ks-settings-backup\)\{display:none!important\}/.test(css));
  assert(/\[data-settings-tab=display\]>#ks-settings-backup\{display:none!important\}/.test(css));
  assert(/\[data-settings-tab=system\]>:not\(\.ks-panel-intro\):not\(\.ks-settings-tabs\):not\(#ks-system\)\{display:none!important\}/.test(css));
  console.log('PASS settings backup card: list, save, compare, export, drift line on Machine, refusals, no restoration, FR/EN/ES.');
})().catch((error) => { console.error(error); process.exit(1); });
