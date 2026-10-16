#!/usr/bin/env python3
"""Real-browser check of the split files (needs Playwright + Chromium; not run by run-all.js).
Serves the repo over http://localhost, signs in on this device only, and checks:
every file loads (200) with its ?v=, no page errors, the service worker caches the app, and a reload works OFFLINE.
Usage: python3 tests/browser-smoke.py"""
import re, sys, threading, http.server, socketserver, functools, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = socketserver.TCPServer(('127.0.0.1', 0), handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://localhost:{port}/'
ver = re.search(r"APP_VERSION = '([^']+)'", (ROOT / 'js/config.js').read_text()).group(1)
bad = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: bad.append(m)
chrome = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=chrome if os.path.exists(chrome) else None)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    # keep it local: blank the Firebase key so nothing talks to the network
    ctx.route(re.compile(r'/js/config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript',
        body=re.sub(r'apiKey: "[^"]*"', 'apiKey: ""', (ROOT / 'js/config.js').read_text())))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'), lambda r: r.abort())
    pg = ctx.new_page(); errs = []; statuses = {}
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('response', lambda r: statuses.__setitem__(r.url.replace(BASE, ''), r.status) if r.url.startswith(BASE) else None)
    pg.goto(BASE); pg.wait_for_timeout(800)
    tags = re.findall(r'(?:href|src)="((?:styles\.css[^"]*|js/[^"]+))"', (ROOT / 'index.html').read_text())
    ok(len(tags) > 20 and all(statuses.get(t) == 200 for t in tags), f'all {len(tags)} app files loaded with status 200')
    ok(all(t.endswith('?v=' + ver) for t in tags), f'every file requested as ?v={ver}')
    ok(not errs, 'no page errors on load' + (': ' + errs[0] if errs else ''))
    pg.fill('#householdCode', 'SMOKE-TEST-1234'); pg.fill('#yourName', 'Sam'); pg.click('#gateBtn'); pg.wait_for_timeout(600)
    ok(pg.is_visible('#app') and not errs, 'signs in and shows the board' + (': ' + errs[0] if errs else ''))
    pg.evaluate("openItemModal()"); pg.wait_for_timeout(150)
    ok(pg.is_visible('#itemOverlay'), 'Add item opens')
    pg.evaluate("document.getElementById('itemOverlay').style.display='none'")
    ok(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'no sideways scroll')
    # service worker: wait for it, then check the cache holds every app file
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null || true")
    pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); pg.wait_for_timeout(1500)
    cached = pg.evaluate("""async()=>{const ks=await caches.keys(); const out={}; for(const k of ks){const c=await caches.open(k); out[k]=(await c.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search);} return out;}""")
    names = list(cached.keys())
    ok(names == ['horizon-v' + ver], 'one cache, named for this version: ' + ', '.join(names))
    have = set(cached.get('horizon-v' + ver, []))
    missing = [t for t in tags if '/' + t not in have]
    ok(not missing, 'service worker precached all app files' + (' (missing ' + ', '.join(missing[:3]) + ')' if missing else ''))
    # offline reload: take control first (reload once so the worker controls the page), then go offline
    pg.reload(); pg.wait_for_timeout(800)
    ctx.set_offline(True)
    errs.clear(); pg.reload(); pg.wait_for_timeout(1000)
    ok(pg.evaluate("typeof enterApp === 'function' && typeof render === 'function'"), 'OFFLINE reload: app code still loads')
    ok(pg.is_visible('#app') or pg.is_visible('#gate'), 'OFFLINE reload: screen shows')
    ok(not errs, 'OFFLINE reload: no page errors' + (': ' + errs[0] if errs else ''))
    b.close()
srv.shutdown()
print('\n%s' % ('ALL OK' if not bad else f'{len(bad)} FAILED'))
sys.exit(1 if bad else 0)
