// Checks the file layout itself: every file is wired in, versions are in step, and the real files boot together.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { buildApp, ROOT } = require('./lib/build-app');
let pass = 0, fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ver = /const APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8'))[1];
  const tags = [...idx.matchAll(/<script src="([^"]+)"(?: defer)?><\/script>/g)].map(m => m[1]);
  const allTags = idx.match(/<script\b[^>]*>/g) || [];
  const files = tags.map(t => t.split('?')[0]);
  ok(/^\d+\.\d+\.\d+$/.test(ver), 'APP_VERSION looks like X.Y.Z: ' + ver);
  ok(tags.length >= 10 && tags.every(t => /^js\/[a-z0-9-]+\.js\?v=/.test(t)), 'index.html loads ' + tags.length + ' script files from js/, each with ?v=');
  ok(tags.every(t => t.endsWith('?v=' + ver)), 'every script tag carries ?v=' + ver);
  ok(idx.includes('<link rel="stylesheet" href="styles.css?v=' + ver + '">'), 'styles.css is linked with ?v=' + ver);
  ok(!/<style>/.test(idx) && !/<script>/.test(idx), 'index.html has no inline <style> or <script> any more');
  ok(allTags.length === tags.length && allTags.every(t => / defer>$/.test(t)), 'every script tag is deferred (the page draws before the scripts run; order is kept)');
  ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(idx), 'no Google Fonts request (it held up the first paint)');
  ok(new Set(files).size === files.length, 'no script listed twice');
  ok(files.every(f => fs.existsSync(path.join(ROOT, f))), 'every listed file exists');
  const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).sort();
  ok(JSON.stringify(onDisk) === JSON.stringify([...files].sort()), 'js/ holds exactly the files index.html loads' + (JSON.stringify(onDisk) === JSON.stringify([...files].sort()) ? '' : ' (' + onDisk.filter(f => !files.includes(f)) + ')'));
  ok(files[0] === 'js/config.js' && files[1] === 'js/util.js' && files[files.length - 1] === 'js/main.js', 'config first, util second, main (the start-up lines) last');
  let syn = true; for (const f of files) { try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); } catch (e) { syn = false; console.log('  ' + f + ': ' + e.message); } }
  ok(syn, 'every file parses on its own');
  const r = spawnSync('python3', [path.join(ROOT, 'tools/release.py'), '--check'], { encoding: 'utf8' });
  ok(r.status === 0, 'tools/release.py --check: ' + (r.stdout + r.stderr).trim());
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = JSON.parse('[' + /const APP_FILES = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '') + ']');
  ok(JSON.stringify(listed) === JSON.stringify(['styles.css', ...files]), 'sw.js APP_FILES = styles.css + the script files, in order');
  ok(new RegExp("SW_VERSION = '" + ver.replace(/\./g, '\\.') + "'").test(sw), 'SW_VERSION equals APP_VERSION');
  const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  ok((idx.match(/spending-forecast-939d9/g) || []).length === 0 && (cfg.match(/spending-forecast-939d9/g) || []).length === 3, 'Firebase settings present in js/config.js (3 project references)');
  // no file may rely on ES-module syntax (they are classic scripts sharing one scope)
  ok(files.every(f => !/^\s*(import|export)\s/m.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), 'no import/export statements (classic scripts)');
  // boots with no errors, and signs in
  const errs = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push(String(e.message || e).slice(0, 160)));
  const dom = new JSDOM(buildApp(), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc, beforeParse(w) { w.URL.createObjectURL = () => 'blob:x'; w.__cloudAdapterFactory = () => ({ subscribe(c, cb) { setTimeout(() => cb(null, false), 5); return () => {}; }, push() { return Promise.resolve(); } }); } });
  const w = dom.window; await sleep(80);
  ok(errs.length === 0, 'combined app boots with no script errors' + (errs.length ? ': ' + errs[0] : ''));
  ok(w.eval('typeof enterApp') === 'function' && w.eval('typeof render') === 'function' && w.eval('typeof escapeHtml') === 'function' && w.eval('typeof lsGet') === 'function', 'functions from different files can all see each other');
  w.document.getElementById('householdCode').value = 'LAYOUT-TEST-1'; w.document.getElementById('yourName').value = 'Sam';
  await w.enterApp(); await sleep(60);
  ok(errs.length === 0 && w.document.getElementById('app').style.display === 'block', 'sign-in works across the files' + (errs.length ? ': ' + errs[0] : ''));
  // inline handlers in the markup must all resolve to a global function
  const names = new Set(); for (const m of idx.matchAll(/\bon(?:click|input|change|keydown|submit)="([^"]+)"/g)) for (const c of m[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(c[1]);
  const skip = new Set(['if', 'this', 'event', 'return', 'stopPropagation', 'preventDefault', 'click', 'focus', 'select', 'stop']);
  const missing = [...names].filter(n => !skip.has(n) && w.eval('typeof ' + n) !== 'function');
  ok(missing.length === 0, 'every onclick/oninput handler in index.html names a real function (' + names.size + ' checked)' + (missing.length ? ': missing ' + missing : ''));
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
