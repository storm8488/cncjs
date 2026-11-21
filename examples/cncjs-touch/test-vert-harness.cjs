'use strict';
// Exercise the served XHR proxy, the actual zero page and both fixture owners.
// No request leaves loopback; confirmation execution is deliberately refused.
const assert = require('assert').strict, fs = require('fs'), http = require('http'), vm = require('vm'), path = require('path');
const H = require('./browser-run.cjs'), page = require('./test-real-motion.cjs');
function request(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } }, res => {
      let text = '';res.setEncoding('utf8');res.on('data', d => { text += d; });res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);req.setTimeout(3000, () => req.destroy(new Error('local fixture timeout')));req.end(body && JSON.stringify(body));
  });
}
async function throughProxy(source, base, body, allowReal) {
  let forwarded = 0;
  function NativeXHR() {
    this.open = (method, url) => { this.url = url;this.method = method; };this.setRequestHeader = () => {};
    this.send = data => { forwarded++;request(new URL(this.url, base), data && JSON.parse(data)).then(r => { this.status = r.status;this.responseText = r.text;this.onload(); }); };
  }
  const window = { XMLHttpRequest: NativeXHR, __brRealMoves: allowReal };
  const context = vm.createContext({ window, localStorage: { setItem() {} } });
  vm.runInContext(source, context);
  // Falling through the native proxy is the original timeout, made synchronous.
  context.visualPreview = () => { throw new Error('origin request fell through the native proxy'); };
  const response = await new Promise((resolve, reject) => {
    const xhr = new window.XMLHttpRequest();xhr.open('POST', '/api/touch-job');
    xhr.onload = () => resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) });
    try { xhr.send(JSON.stringify(body)); } catch (e) { reject(e); }
  });
  assert.equal(forwarded, 1);return response;
}
async function main() {
  const fx = await H.startV2Fixture();
  try {
    fx.real = true;fx.setPhase('idle');
    const source = (await request(fx.base + 'visual-fixture.js')).text;
    for (const locale of ['fr', 'en', 'es']) {
      const f = page.fixture({ locale });await f.connect(page.machine());
      try {
        f.zeros[0].click();await f.flush();
        const prepare = f.posts().find(r => r.body.operation === 'set-origin');
        assert(prepare);assert.deepEqual(Array.from(prepare.body.axes), ['X']);assert.equal(prepare.body.action, 'prepare');
        const ticket = await throughProxy(source, fx.base, prepare.body, true);
        assert.equal(ticket.status, 200);assert.equal(ticket.data.generation, prepare.body.generation);
        f.answer(prepare, ticket.data);await f.flush();
        assert.equal(f.el('real-motion-ticket').hidden, false, locale + ': actual zero driver opens its confirmation');
        assert.equal(f.posts().length, 1, 'opening a confirmation never executes a zero');
        f.el('real-motion-origin-confirm').click();await f.flush();
        const confirm = f.posts().at(-1);assert.equal(confirm.body.action, 'set-origin');assert.equal(confirm.body.nonce, ticket.data.nonce);
        const refused = await throughProxy(source, fx.base, confirm.body, true);
        assert.equal(refused.status, 403, 'the visual fixture must never execute a zero');
        f.answer(confirm, refused.data, refused.status);await f.flush();
      } finally { f.controls().dispose();f.fireWindow('pagehide'); }
    }
    await assert.rejects(throughProxy(source, fx.base, { action: 'prepare', operation: 'set-origin', axes: ['X'] }, false), /fell through/, 'real requests remain opt-in');
  } finally { fx.close(); }
  const other = await H.startFixture(['--replay', '--other-pilot']);
  try {
    assert.equal(require('./measure-replay-fixture.cjs').create({ otherPilot: true }).packet().controllers[0].control.owner.id, 'strip-other', 'other-pilot replay option supplies the owner before publication');
    const snapshot = JSON.parse((await request(other.base + 'api/touch-job')).text);
    const f = page.fixture();await f.connect(page.machine({ control: snapshot.controllers[0].control }));
    try { assert.equal(f.controls().pilot().state, 'other', 'pilot is computed from the input snapshot'); }
    finally { f.controls().dispose();f.fireWindow('pagehide'); }
    assert.equal(require('./measure-replay-fixture.cjs').create().packet().controllers[0].control.owner, null, 'ordinary replay keeps its free pilot');
  } finally { other.child.kill(); }
  const run = fs.readFileSync(__dirname + '/browser-run.cjs', 'utf8');
  const responsive = run.slice(run.indexOf('async function responsiveMeasure'), run.indexOf('// Rotation and resizing'));
  assert(!responsive.includes('getElementById("zero-more-open")'), 'simulation never opens a real-only sheet');
  const sim = fs.readFileSync(__dirname + '/touch/simulation.html', 'utf8');
  assert(responsive.includes('getElementById("ks-origin-info").click()') && sim.includes('id="ks-origin-info"'), 'responsive exercises the actual simulation sheet');
  const strip = fs.readFileSync(__dirname + '/browser-strip.cjs', 'utf8');
  assert(strip.includes('openReal(cdp, H, pilotBase, w, h, lang, large)'), 'custom reason alone uses the other-owner fixture');
  assert(strip.includes('stackAndLock(cdp, H, replay.base, w, h, lang, large, fail, log, otherPilot.base)'), 'origin and lock scenarios keep their original free-owner fixture');
  const rail = { clientWidth: 88, scrollWidth: 89, clientHeight: 768, scrollHeight: 768, overflowX: 'hidden', overflowY: 'hidden', buttons: [] };
  const summary = { e2e: [], measurements: [{ variant: 'rail regression', strict: true, results: [{ screen: 'home', label: 'Home', railScroll: rail }] }] };
  const result = H.strictCheck(summary, []);assert(result.violations.some(v => v.detail.includes('horizontal overflow')));
  const dir = fs.mkdtempSync(path.join(__dirname, 'output', 'vert-summary-'));
  try {
    H.writeSummary(summary, dir);
    assert.match(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8'), /Rail - rail regression/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'))).strict.violations.length, result.violations.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('PASS VERT: served origin proxy opens FR/EN/ES page confirmations, fixture refuses execution, snapshot pilot, simulation sheet and rail report.');
}
main().catch(e => { console.error(e);process.exitCode = 1; });
