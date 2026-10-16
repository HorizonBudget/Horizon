// Runs every *-test.js in this folder (several at once) and prints one line per suite.
// Exit code is 1 if any suite fails. Usage: cd tests && npm install && node run-all.js [name-filter]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter(f => /-test\.js$/.test(f) && f.includes(filter)).sort();
const LIMIT = 6;
let next = 0, running = 0, failed = 0;
const results = [];
function launch() {
  while (running < LIMIT && next < files.length) {
    const f = files[next++]; running++;
    const t0 = Date.now(); let out = '';
    const p = spawn(process.execPath, [path.join(__dirname, f)], { cwd: __dirname, env: process.env });
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    const timer = setTimeout(() => p.kill(), 300000);
    p.on('close', code => {
      clearTimeout(timer); running--;
      const lines = out.trim().split('\n');
      const fails = lines.filter(l => /^FAIL /.test(l));
      const last = lines[lines.length - 1] || '';
      const good = code === 0 && fails.length === 0;
      if (!good) failed++;
      results.push({ f, good, last, fails, secs: ((Date.now() - t0) / 1000).toFixed(1) });
      console.log((good ? 'ok   ' : 'FAIL ') + f.padEnd(26) + last.slice(0, 70) + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
      fails.forEach(l => console.log('       ' + l));
      if (next >= files.length && running === 0) {
        console.log('\n' + (files.length - failed) + ' of ' + files.length + ' suites passed');
        process.exit(failed ? 1 : 0);
      }
      launch();
    });
  }
}
if (!files.length) { console.log('no suites match'); process.exit(1); }
launch();
