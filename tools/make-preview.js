#!/usr/bin/env node
// Builds a SAFE private preview of Horizon as one HTML file you can open in any browser.
//
//   node tools/make-preview.js                 writes preview/horizon-preview.html
//   node tools/make-preview.js out.html        writes somewhere else
//   node tools/make-preview.js --fragment out  no <html>/<head>/<body> tags (for a claude.ai Artifact)
//
// Safety: the Firebase apiKey is blanked, so the preview runs in local-only mode and can never
// read or change anyone's real household. It signs in as "Preview" with demo items and adds a
// small bar at the bottom with quick theme/pattern buttons. The preview/ folder is git-ignored.
// Things that do not work in a preview: Export backup download (in some viewers), install, offline.
const fs = require('fs');
const path = require('path');
const { buildApp, ROOT } = require('../tests/lib/build-app.js');

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = path.resolve(args.filter(a => !a.startsWith('--'))[0] || path.join(ROOT, 'preview', 'horizon-preview.html'));

let html = buildApp();

// 1. Blank the Firebase key (must happen, or we stop).
const before = html;
html = html.replace(/apiKey:\s*"[^"]*"/, () => 'apiKey: ""');
if (html === before || /apiKey:\s*"AIza/.test(html)) { console.error('Could not blank the Firebase apiKey; refusing to build a preview.'); process.exit(1); }

// 2. Demo data + quick bar.
const seed = `
<div id="pvBar" style="position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:6px;background:rgba(0,0,0,.78);font:13px system-ui,sans-serif">
  <span style="color:#fff;align-self:center">Preview (not real data)</span>
  <button onclick="setTheme('light');setPatternType('none')">Sage</button>
  <button onclick="setTheme('light');setPatternType('dots')">Dots</button>
  <button onclick="setTheme('christmas')">Christmas</button>
  <button onclick="setTheme('halloween')">Halloween</button>
  <button onclick="document.getElementById('pvBar').style.display='none'">Hide</button>
</div>
<script>
window.addEventListener('load', async () => {
  try {
    try { localStorage.clear(); } catch(e) {}
    document.getElementById('householdCode').value = 'PREVIEW-DEMO-1';
    document.getElementById('yourName').value = 'Preview';
    await enterApp();
    const M = i => FUTURE_MONTHS[Math.min(i, FUTURE_MONTHS.length - 1)];
    const demo = [
      ['Car registration', 'Vehicle', 145, 0], ['New tires', 'Vehicle', 720, 1],
      ['School pictures', 'Kids', 45, 0], ['Soccer fees', 'Kids', 180, 1],
      ['Christmas gifts', 'Holidays & Gifts', 600, 2], ['Furnace service', 'Home', 160, 2],
      ['Dentist cleaning', 'Health', 120, 3], ['Vacation deposit', 'Travel', 500, 4]
    ];
    demo.forEach((d, i) => items.push({ id: Date.now() + i, name: d[0], category: d[1], subcategory: '', cost: d[2], month: M(d[3]), owner: '' }));
    items.push({ id: Date.now() + 99, name: 'Birthday party', category: 'Kids', cost: 90, month: M(0), owner: '', completed: true });
    // demo to-dos (To-do side): one per group, a few owners, a note, two linked to budget items, one done
    ['Alex', 'Jo'].forEach(n => { if(!people.some(p => p.name === n)) people.push({ id: 'demo-' + n, name: n, photo: null }); });
    const itemId = name => (items.find(i => i.name === name) || {}).id;
    const T = (name, days, extra) => Object.assign({ id: Date.now() + Math.random(), kind: 'todo', name, completed: false, owner: '', createdAt: Date.now() - 1000 * (100 - items.length) }, days === null ? {} : { due: todoDateStr(days) }, extra || {});
    items.push(
      T('Renew the car registration online', -2, { owner: 'Preview', linkId: itemId('Car registration') }),
      T('Call about soccer sign-ups', 0, { owner: 'Jo' }),
      T('Send in the school picture form', 0),
      T('Book the furnace service', 3, { linkId: itemId('Furnace service'), notes: 'Ask for the fall tune-up special. Number is on the fridge.' }),
      T('Compare tire prices', 5, { owner: 'Alex', url: 'https://www.discounttire.com/' }),
      T('Make the Christmas gift list', 24, { owner: 'Preview' }),
      T('Return the library books', null),
      T('Buy birthday candles', null, { completed: true, completedAt: Date.now() - 3600000 })
    );
    render();
  } catch (e) { console.error('preview seed failed', e); }
});
</script>
`;
html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, () => seed + '</body>');

if (fragment) {
  // Use the LAST <body> (comments can contain the text "<body>").
  const headStyles = (html.match(/<head[\s\S]*?<\/head>/) || [''])[0].match(/<style[\s\S]*?<\/style>/g) || [];
  const bodyStart = html.lastIndexOf('<body');
  const inner = html.slice(html.indexOf('>', bodyStart) + 1, html.lastIndexOf('</body>'));
  html = headStyles.join('\n') + '\n' + inner;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Preview written:', out);
