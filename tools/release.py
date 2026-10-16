#!/usr/bin/env python3
"""Keep every place that names the app version in step.

  python3 tools/release.py 3.0.1     set the new version everywhere
  python3 tools/release.py           re-sync from js/config.js (e.g. after adding or removing a script file)
  python3 tools/release.py --check   change nothing; exit 1 if anything is out of step

It updates: APP_VERSION (js/config.js), the ?v= on styles.css and every script tag in index.html,
SW_VERSION and the APP_FILES list in sw.js. The ?v= is what makes browsers fetch fresh files after an update.
"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg, idx, sw = ROOT / 'js/config.js', ROOT / 'index.html', ROOT / 'sw.js'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
check = '--check' in sys.argv
ver_re = re.compile(r"(const APP_VERSION = ')([^']+)(')")
cur = ver_re.search(cfg.read_text()).group(2)
new = args[0] if args else cur
if not re.fullmatch(r'\d+\.\d+\.\d+', new):
    sys.exit('version must look like 3.0.1')

cfg_t = ver_re.sub(lambda m: m.group(1) + new + m.group(3), cfg.read_text())
html = idx.read_text()
asset = re.compile(r'(<link rel="stylesheet" href="styles\.css|<script src="js/[A-Za-z0-9_.-]+?\.js)(?:\?v=[^"]*)?(">)')
html_t = asset.sub(lambda m: m.group(1) + '?v=' + new + m.group(2), html)
files = ['styles.css'] + re.findall(r'<script src="(js/[^"?]+)', html_t)
sw_t = sw.read_text()
sw_t = re.sub(r"(const SW_VERSION = ')[^']*(')", lambda m: m.group(1) + new + m.group(2), sw_t)
block = '// APP_FILES:BEGIN (written by tools/release.py)\nconst APP_FILES = [\n' + ''.join("  '%s',\n" % f for f in files) + '];\n// APP_FILES:END'
sw_t = re.sub(r'// APP_FILES:BEGIN.*?// APP_FILES:END', lambda m: block, sw_t, flags=re.S)

changed = [n for n, a, b in (('js/config.js', cfg.read_text(), cfg_t), ('index.html', html, html_t), ('sw.js', sw.read_text(), sw_t)) if a != b]
if check:
    if changed: sys.exit('out of step: ' + ', '.join(changed) + '  (run: python3 tools/release.py)')
    print('versions in step at', new); sys.exit(0)
cfg.write_text(cfg_t); idx.write_text(html_t); sw.write_text(sw_t)
print('version', new, '| updated:', ', '.join(changed) or 'nothing (already in step)', '| files cached offline:', len(files))
