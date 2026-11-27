// Offline P5 benchmark. Each sample runs in a fresh process; no controller is opened.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const context = {
  settings: { $110: 4000, $111: 4000, $112: 800 },
  wpos: { x: 0, y: 0, z: 0 },
  reportUnits: 'mm',
  offsetProven: true,
  wcs: 'G54',
  feedMode: 'G94',
  tlo: 0,
  overrides: { feed: 100, rapid: 100 }
};

if (process.argv[2] === '--sample') {
  const { analyzeProgram } = require('../../src/server/services/touch/program-check.js');
  const { durationOf } = require('../../src/server/services/touch/program-time.js');
  const text = fs.readFileSync(process.argv[3], 'utf8');
  global.gc();
  const before = process.memoryUsage();
  const start = performance.now();
  const analysis = analyzeProgram(text, context);
  const analyzed = performance.now();
  const duration = durationOf(analysis, context);
  const end = performance.now();
  const allocated = process.memoryUsage();
  global.gc();
  const retained = process.memoryUsage();
  console.log(JSON.stringify({
    analysisMs: analyzed - start,
    durationMs: end - analyzed,
    heapBeforeMiB: before.heapUsed / 1048576,
    heapBeforeGcMiB: allocated.heapUsed / 1048576,
    heapRetainedDeltaMiB: (retained.heapUsed - before.heapUsed) / 1048576,
    rssBeforeMiB: before.rss / 1048576,
    rssAfterMiB: allocated.rss / 1048576,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    timingJsonBytes: Buffer.byteLength(JSON.stringify(analysis.timing)),
    timingBlocks: analysis.timing.blocks ? analysis.timing.blocks.length : 0,
    timingSupported: analysis.timing.supported,
    durationSeconds: duration
  }));
} else {
  const directory = path.resolve(__dirname, '../../output/P5');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, '500000-3d.gcode');
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, 'G21 G90 G94 F600\n');
  for (let start = 0; start < 500000; start += 1000) {
    let chunk = '';
    for (let i = start; i < start + 1000; i++) {
      chunk += 'G1 X' + (i % 401) + ' Y' + ((i * 7) % 71) + ' Z' + (-(i % 200) / 10) + '\n';
    }
    fs.writeSync(fd, chunk);
  }
  fs.closeSync(fd);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const child = spawnSync(process.execPath, ['--expose-gc', '--no-warnings', __filename, '--sample', file], { encoding: 'utf8' });
    if (child.status !== 0) {
      throw new Error(child.stderr || child.error || 'Benchmark failed');
    }
    samples.push(JSON.parse(child.stdout));
  }
  const report = {
    node: process.version,
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    inputBytes: fs.statSync(file).size,
    g1Lines: 500000,
    samples
  };
  const label = process.argv[2] || 'measurement';
  if (!/^[a-z-]+$/.test(label)) {
    throw new Error('Use a simple measurement label');
  }
  fs.writeFileSync(path.join(directory, label + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
