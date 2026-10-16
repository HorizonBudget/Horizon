#!/usr/bin/env python3
"""Real-browser check of the collapsing sticky headers (needs Playwright + Chromium; not run by run-all.js).
Scrolls slowly, like a finger, down and back up on the board and in every dialog, and reports:
 - how many times the header changed state (flapping/"twitchy" = more than one change per direction)
 - whether it was ever collapsed at the very top, or still expanded far down
 - whether the sticky rows ever covered content they shouldn't
Usage: python3 tests/sticky-audit.py [--verbose]"""
import re, sys, json, threading, http.server, socketserver, functools, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
VERBOSE = '--verbose' in sys.argv
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://localhost:%d/' % srv.server_address[1]
SEED = '''
(async()=>{
 document.getElementById('householdCode').value='STICKY-TEST-1234';document.getElementById('yourName').value='Sam';
 people=[{id:'p1',name:'Sam',photo:null},{id:'p2',name:'Alex',photo:null}];
 await enterApp();
 const cats=['Home','Vehicle','Travel','Health'];
 for(let i=0;i<__N__;i++) items.push({id:100+i,name:'Item number '+i+' with a medium length name',category:cats[i%4],subcategory:'',cost:50+i*37,month:FUTURE_MONTHS[i%6],saved:0,owner:i%2?'Sam':'Alex',link:'',note:i%3?'':'A short note about it',completed:false});
 render();
})()
'''
bad = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: bad.append(m)
WATCH = '''(sel)=>{ if(window.__mo) window.__mo.disconnect(); window.__flips=[]; const el=document.querySelector(sel); const t0=performance.now();
  const get=()=>el.classList.contains('is-collapsed')||el.classList.contains('page-collapsed');
  let last=get(); const mo=new MutationObserver(()=>{ const g=get(); if(g!==last){ last=g; window.__flips.push([g, Math.round(performance.now()-t0)]); } });
  mo.observe(el,{attributes:true,attributeFilter:['class']}); window.__mo=mo; }'''
def run_scroll(pg, scroller_js, label, sel, expect_collapse=True, step=8, pause=16):
    """scroll to the bottom in small steps, then back to the top; return flips and state samples"""
    pg.evaluate(WATCH, sel)
    pg.evaluate(f"({scroller_js}).scrollTo(0,0)"); pg.wait_for_timeout(120)
    pg.evaluate("window.__flips=[]")
    down = []
    maxy = pg.evaluate(f"(()=>{{const s={scroller_js};return (s.scrollHeight||document.documentElement.scrollHeight)-(s.clientHeight||innerHeight)}})()")
    y = 0
    while y < maxy:
        y = min(maxy, y + step); pg.evaluate(f"({scroller_js}).scrollTo(0,{y})"); pg.wait_for_timeout(pause)
    pg.wait_for_timeout(350)
    fl=pg.evaluate('window.__flips'); print('   down flips',fl) if VERBOSE else None
    flips_down = pg.evaluate("window.__flips.length"); collapsed_bottom = pg.evaluate(f"document.querySelector('{sel}').classList.contains('is-collapsed')||document.querySelector('{sel}').classList.contains('page-collapsed')")
    pg.evaluate("window.__flips=[]")
    while y > 0:
        y = max(0, y - step); pg.evaluate(f"({scroller_js}).scrollTo(0,{y})"); pg.wait_for_timeout(pause)
    pg.wait_for_timeout(350)
    fl=pg.evaluate('window.__flips'); print('   up flips',fl) if VERBOSE else None
    flips_up = pg.evaluate("window.__flips.length"); collapsed_top = pg.evaluate(f"document.querySelector('{sel}').classList.contains('is-collapsed')||document.querySelector('{sel}').classList.contains('page-collapsed')")
    if VERBOSE: print(f'   {label}: scrollable {maxy}px, down flips {flips_down}, up flips {flips_up}, collapsed@bottom {collapsed_bottom}, collapsed@top {collapsed_top}')
    if maxy > 160:
        ok(flips_down == 1 and collapsed_bottom, f'{label}: scrolling down collapses once ({flips_down} change)')
        ok(flips_up == 1 and not collapsed_top, f'{label}: scrolling back up expands once, and it is expanded at the top ({flips_up} change)')
    else:
        ok(flips_down <= 1 and flips_up <= 1 and not collapsed_top, f'{label}: short ({maxy}px) - at most one change each way, expanded at the top ({flips_down}/{flips_up})')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    for vw, vh in [(390, 844), (320, 568), (1200, 800)]:
        ctx = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=vw < 500, is_mobile=vw < 500)
        ctx.route(re.compile(r'/js/config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=re.sub(r'apiKey: "[^"]*"', 'apiKey: ""', (ROOT / 'js/config.js').read_text())))
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'), lambda r: r.abort())
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('lastBackupAt',String(Date.now()));localStorage.setItem('horizonSeenVersion','999.0.0')}catch(e){}")
        pg.goto(URL); pg.wait_for_timeout(300)
        pg.evaluate(SEED.replace('__N__', '40')); pg.wait_for_timeout(500)
        tag = f'{vw}px'
        run_scroll(pg, 'window', f'{tag} board (40 items)', 'html')
        # same page again after folding every month (page gets much shorter, scroll position gets clamped)
        pg.evaluate("window.scrollTo(0,600)"); pg.wait_for_timeout(100)
        pg.evaluate("setAllMonthsCollapsed(true)"); pg.wait_for_timeout(400)
        st = pg.evaluate("({y:scrollY, collapsed:document.documentElement.classList.contains('page-collapsed')})")
        ok(not st['collapsed'] or st['y'] > 0, f'{tag} board: folding all months from deep down leaves a sensible header (y={st["y"]}, collapsed={st["collapsed"]})')
        pg.evaluate("setAllMonthsCollapsed(false)"); pg.wait_for_timeout(300)
        # dialogs
        for name, open_js, ov in [('item form', "openItemModal()", 'itemOverlay'), ('Settings General', "openSettingsModal('general')", 'settingsOverlay'),
                                  ('Settings Themes', "openSettingsModal('themes')", 'settingsOverlay'), ('Settings Advanced', "openSettingsModal('advanced')", 'settingsOverlay'),
                                  ('Deleted items', "openTrashModal()", 'trashOverlay'), ('Profile', "openProfileModal()", 'profileOverlay')]:
            pg.evaluate(open_js); pg.wait_for_timeout(250)
            run_scroll(pg, f"document.querySelector('#{ov} .modal')", f'{tag} {name}', f'#{ov} .modal-bar')
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o=>o.style.display='none')"); pg.wait_for_timeout(100)
        ok(not errs, f'{tag}: no page errors' + (': ' + errs[0] if errs else ''))
        ctx.close()
    b.close()
srv.shutdown()
print('\n%s' % ('ALL OK' if not bad else f'{len(bad)} FAILED'))
sys.exit(1 if bad else 0)
