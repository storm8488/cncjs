'use strict';
// Load each real bench up to its service boundary. No listener, board, browser or timer
// is started: the sentinel stops execution as soon as its controller/options are captured.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

(async () => {
  for (const file of ['preview-server.cjs', 'measure-refonte.cjs', 'test-essai-xy-reel.cjs']) {
    const full = path.join(__dirname, file), native = createRequire(full), sentinel = new Error('service captured');
    let captured = null, source = fs.readFileSync(full, 'utf8');
    if (file === 'measure-refonte.cjs') source = source.slice(0, source.lastIndexOf('main().catch(')) + 'module.exports = stepStream;';
    if (file === 'test-essai-xy-reel.cjs') source = source.slice(0, source.lastIndexOf('(async () => {')) + 'module.exports = bench;';
    const module = { exports: {} };
    const context = {
      module, __dirname, console, Buffer, URL,
      process: { argv: ['node', file], cwd: () => __dirname, env: {} },
      require(name) {
        if (name.includes('/touch/job-service.js')) return { createService(controllers, config, unused, options) { captured = { controllers: controllers.get(), options }; throw sentinel; } };
        if (name.includes('/touch/system-stats.js')) return { createSystemStats: () => ({ start() {} }) };
        if (name === './browser-run.cjs') return {};
        if (name === 'fs') return { ...fs, mkdirSync() {} };
        return native(name);
      },
      setInterval() { throw new Error('a bench timer started before service capture'); }
    };
    try {
      vm.runInNewContext(source, context, { filename: file });
      if (typeof module.exports === 'function') await module.exports();
    } catch (error) { assert.equal(error, sentinel, file + ' stopped at its service boundary'); }
    assert(captured, file + ' creates the real service');
    const controller = Object.values(captured.controllers)[0];
    assert.equal(typeof controller.writeln, 'function', file + ' direct settings reads are inert');
    assert.doesNotThrow(() => controller.writeln('$I'));
    assert.equal(typeof captured.options.workOffset, 'function', file + ' does not wait for a nonexistent board to prove D2');
    const offset = captured.options.workOffset();
    offset.invalidate(); offset.tick(); offset.cancel();
    assert.equal(offset.proven(), true); assert.equal(offset.snapshot().state, 'proven'); assert.equal(offset.refusal(), null);
  }
  console.log('PASS page benches: proven fixture offset and inert direct writes, before any server/browser/timer starts.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
