// PC — pilote CDP de la fenêtre de test de la Surface, par le tunnel 127.0.0.1:19230 (surface.sh tunnel open).
// Jamais le kiosque : seul le port 19230 (-> 9230 de la fenêtre de test) est accepté.
// Usage : node cdp.mjs eval '<expression>' | shot <fichier.png> | nav <url> | offline <secondes> | targets
//   offline : réseau coupé dans la fenêtre de test (Network.emulateNetworkConditions) pendant N s, puis rétabli.
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:19230';
const [, , cmd, ...rest] = process.argv;
const arg = rest.join(' ');

const list = await (await fetch(CDP + '/json', { signal: AbortSignal.timeout(5000) })).json();
if (cmd === 'targets') {
  list.filter((t) => t.type === 'page').forEach((t) => console.log(t.id, t.url));
  process.exit(0);
}
const page = list.find((t) => t.type === 'page' && /\/touch/.test(t.url)) || list.find((t) => t.type === 'page');
if (!page) {
  console.log('aucune page dans la fenêtre de test');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const call = (method, params = {}) => new Promise((ok) => {
  const n = ++id;
  ws.addEventListener('message', function h(e) {
    const m = JSON.parse(e.data);
    if (m.id === n) {
      ws.removeEventListener('message', h);
      ok(m.result || m.error);
    }
  });
  ws.send(JSON.stringify({ id: n, method, params }));
});
await new Promise((ok) => ws.addEventListener('open', ok));

if (cmd === 'nav') {
  console.log(JSON.stringify(await call('Page.navigate', { url: arg })));
} else if (cmd === 'shot') {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(arg, Buffer.from(r.data, 'base64'));
  console.log('capture', arg);
} else if (cmd === 'offline') {
  const seconds = Number(arg);
  if (!(seconds > 0)) {
    console.log('offline <secondes>');
    process.exit(2);
  }
  // The emulation lasts as long as this CDP session: the connection stays open meanwhile.
  await call('Network.enable');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log(new Date().toISOString(), 'réseau coupé', seconds, 's');
  await new Promise((ok) => setTimeout(ok, seconds * 1000));
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log(new Date().toISOString(), 'réseau rétabli');
} else if (cmd === 'eval') {
  const r = await call('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result && r.result.value !== undefined ? r.result.value : r, null, 1));
} else {
  console.log("usage : node cdp.mjs eval '<expr>' | shot <png> | nav <url> | offline <s> | targets");
  process.exit(2);
}
ws.close();
