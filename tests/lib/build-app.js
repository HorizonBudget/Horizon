// Builds ONE self-contained HTML string from index.html + styles.css + js/*.js, in the order index.html lists them.
// jsdom-based suites load this, so they run the real files exactly as a browser would (all scripts share one global scope).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function buildApp(root) {
  root = root || ROOT;
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = /<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?">/;
  html = html.replace(css, (m, href) => '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '</style>');
  const tags = html.match(/<script src="[^"]+"(?: defer)?><\/script>/g) || [];
  const code = tags.map(t => {
    const src = t.match(/src="([^"?]+)/)[1];
    return fs.readFileSync(path.join(root, src), 'utf8');
  }).join('\n');
  tags.forEach(t => { html = html.replace(t + '\n', '').replace(t, ''); });
  return html.replace('</body>', () => '<script>\n' + code + '</script>\n</body>');
}

module.exports = { buildApp, ROOT };
if (require.main === module) {
  const out = process.argv[2];
  const html = buildApp();
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html); console.log('wrote', out, html.length, 'bytes'); }
  else process.stdout.write(html);
}
