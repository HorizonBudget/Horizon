#!/usr/bin/env python3
"""Real-browser check of the collapsing sticky headers (needs Playwright + Chromium; not run by run-all.js).
Scrolls slowly, like a finger, down and back up on the board and in every dialog, and reports:
 - how many times the header changed state (flapping/"twitchy" = more than one change per direction)
 - whether it was ever collapsed at the very top, or still expanded far down
 - whether the sticky rows ever covered content they shouldn't
Then runs the "iPhone user" scenarios: closing dialogs while the header is collapsed, Active <-> Completed, search / activity /
filters, fold all months, a page that shrinks below the screen, rotating the phone, the keyboard and the URL bar changing the
viewport height, Settings tab switches, very short dialogs, a frantic wiggle (the cooldown), and the no-scroll-behind-dialogs
lock (wheel and touch, over the backdrop, over short dialogs and at the end of long ones, in every dialog).
Usage: python3 tests/sticky-audit.py [--verbose] [--scenarios]"""
import re, sys, json, threading, http.server, socketserver, functools, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
VERBOSE = '--verbose' in sys.argv
ONLY_DIALOG = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--dialog=')), '')   # e.g. --dialog=profiles: only dialogs whose name contains it
ONLY_SCENARIOS = '--scenarios' in sys.argv or bool(ONLY_DIALOG)   # skip the long slow-scroll matrix (handy while working on the scenarios)
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

# ------------------------------------------------------------------ scenario helpers
STATE = """(()=>{
 const r=document.documentElement,h=document.getElementById('appHeader'),c=document.getElementById('topCompact'),b=document.getElementById('boardSticky'),mn=document.querySelector('#app main');
 const sv=b.style.cssText; b.style.transition='none'; b.style.position='relative'; b.style.top='auto';
 const nat=b.getBoundingClientRect().top; b.style.cssText=sv;
 const br=b.getBoundingClientRect(), mr=mn.getBoundingClientRect(), hr=h.getBoundingClientRect(), cr=c.getBoundingClientRect();
 return {y:scrollY, max:r.scrollHeight-innerHeight, col:r.classList.contains('page-collapsed'), bar:parseFloat(r.style.getPropertyValue('--page-bar-h')),
   hh:h.offsetHeight, ch:c.offsetHeight, hTop:hr.top, cTop:cr.top, bsTop:br.top, bsH:br.height, nat:nat, mainBottom:mr.bottom, ih:innerHeight, cls:r.className};
})()"""
FLIPS = """(sel)=>{ if(window.__mo) window.__mo.disconnect(); window.__flips=[]; const el=document.querySelector(sel); const t0=performance.now();
  const get=()=>el.classList.contains('is-collapsed')||el.classList.contains('page-collapsed');
  let last=get(); const mo=new MutationObserver(()=>{ const g=get(); if(g!==last){ last=g; window.__flips.push([g, Math.round(performance.now()-t0)]); } });
  mo.observe(el,{attributes:true,attributeFilter:['class']}); window.__mo=mo; }"""
OVERLAYS = [
    ('item form', 'itemOverlay', "openItemModal()", "closeItemModal()"),
    ('Settings General', 'settingsOverlay', "openSettingsModal('general')", "closeSettingsModal()"),
    ('Settings Themes', 'settingsOverlay', "openSettingsModal('themes')", "closeSettingsModal()"),
    ('Settings Advanced', 'settingsOverlay', "openSettingsModal('advanced')", "closeSettingsModal()"),
    ('Deleted items', 'trashOverlay', "openTrashModal()", "closeTrashModal(); closeSettingsModal()"),
    ('Profile', 'profileOverlay', "openProfileModal()", "closeProfileModal()"),
    ('Manage profiles', 'peopleOverlay', "adminUnlockedFlag=true; openAdminModal()", "closeAdminModal()"),
    ('Style guide', 'guideOverlay', "openStyleGuide()", "closeStyleGuide(); closeSettingsModal()"),
    ('Photo crop', 'cropOverlay', "openCropEditor({naturalWidth:300,naturalHeight:200,width:300,height:200,src:'data:image/gif;base64,R0lGODlhAQABAAAAACw='},()=>{},()=>{})", "closeCropEditor(true)"),
    ('Question', 'confirmOverlay', "(()=>{ window.__cp=askConfirm({title:'Mark complete',message:'Are you sure?'}); })()", "document.getElementById('confirmCancel').click()"),
    ('Profile chooser', 'chooseOverlay', "(()=>{ window.__ch=chooseProfile('x'); })()", "chooseDone(null)"),
]
def stable(pg, step=150, limit=5000):
    """wait until the page has stopped scrolling (momentum finished)"""
    last, t = None, 0
    while t < limit:
        y = pg.evaluate('scrollY')
        if y == last: return y
        last = y; pg.wait_for_timeout(step); t += step
    return last
def settle(pg, ms=800):
    stable(pg); pg.wait_for_timeout(ms)
def board_ok(pg, label):
    """the header, the compact bar, --page-bar-h and the Active/Completed row agree with each other and with the scroll position"""
    s = pg.evaluate(STATE); prob = []
    covered = s['ch'] if s['col'] else s['hh']
    if s['y'] <= 4 and s['col']: prob.append('collapsed at the very top')
    if abs(s['bar'] - covered) > 0.5: prob.append('--page-bar-h is %spx but the bar covering the top is %spx' % (s['bar'], covered))
    if s['col']:
        if s['cTop'] < -1: prob.append('collapsed but the compact bar is not showing (top %s)' % round(s['cTop']))
        if s['hTop'] > -s['hh'] + 1: prob.append('collapsed but the full header is still showing')
    else:
        if s['y'] > 0 and abs(s['hTop']) > 1: prob.append('expanded but the full header is not at the top (top %s)' % round(s['hTop']))
        if s['cTop'] > -s['ch'] + 1: prob.append('expanded but the compact bar is showing')
    if s['mainBottom'] > covered + s['bsH'] + 60:
        want = max(s['nat'], covered)
        if abs(s['bsTop'] - want) > 1: prob.append('Active/Completed row at %s, should be at %s (gap or covered)' % (round(s['bsTop']), round(want)))
    ok(not prob, '%s: header and sticky row consistent (y=%d, %s)%s' % (label, s['y'], 'compact' if s['col'] else 'full', (' - ' + '; '.join(prob)) if prob else ''))
    return s
def flips(pg): return pg.evaluate('window.__flips')
def new_page(b, vw, vh, n=40, touch=None, scrollbars=False):
    touch = (vw < 500) if touch is None else touch
    ctx = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=touch, is_mobile=touch)
    ctx.route(re.compile(r'/js/config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=re.sub(r'apiKey: "[^"]*"', 'apiKey: ""', (ROOT / 'js/config.js').read_text())))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'), lambda r: r.abort())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("try{localStorage.setItem('lastBackupAt',String(Date.now()));localStorage.setItem('horizonSeenVersion','999.0.0')}catch(e){}")
    pg.goto(URL); pg.wait_for_timeout(300)
    pg.evaluate(SEED.replace('__N__', str(n))); pg.wait_for_timeout(500)
    return ctx, pg, errs
def drag(cdp, pg, dy, x, y0, steps=10, dt=16, tail=700):
    """one finger drag: dy>0 = finger moves up = content scrolls further down. Real touch events through the browser's input pipeline."""
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y0}]})
    for i in range(1, steps + 1):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y0 - dy * i / steps}]}); pg.wait_for_timeout(dt)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    pg.wait_for_timeout(tail)
def slow(pg, y0, y1, step=6, pause=16):
    """scroll from y0 to y1 in small steps, like a finger"""
    y = y0; d = 1 if y1 > y0 else -1
    while (y1 - y) * d > 0:
        y += d * min(step, abs(y1 - y)); pg.evaluate(f"scrollTo(0,{y})"); pg.wait_for_timeout(pause)
    pg.wait_for_timeout(450)
def go_deep(pg, y=1200):
    pg.evaluate("scrollTo(0,0)"); settle(pg, 400)
    pg.evaluate(f"scrollTo(0,{y})"); settle(pg)

def scenarios_phone(b, vw, vh):
    tag = f'{vw}px'
    ctx, pg, errs = new_page(b, vw, vh)
    cdp = ctx.new_cdp_session(pg)
    cx = vw // 2
    # --- real finger swipes, not scrollTo
    pg.evaluate(FLIPS, 'html')
    for i in range(6): drag(cdp, pg, 220, cx, vh - 150, tail=120)
    settle(pg); fl = flips(pg)
    ok(len(fl) == 1 and fl[0][0] is True, f'{tag} finger swipes down: collapses once ({len(fl)} change)')
    board_ok(pg, f'{tag} after finger swipes down')
    pg.evaluate("window.__flips=[]")
    drag(cdp, pg, -140, cx, 200, tail=120); settle(pg); fl = flips(pg)
    ok(len(fl) == 1 and fl[0][0] is False, f'{tag} finger swipe back up: expands once ({len(fl)} change)')
    board_ok(pg, f'{tag} after finger swipe up')

    # --- cooldown: a frantic wiggle may not make it flap, and a held-back change is never forgotten
    pg.evaluate("scrollTo(0,0)"); settle(pg); pg.evaluate(FLIPS, 'html')
    for i in range(70): pg.evaluate("scrollTo(0,%d)" % (300 if i % 2 else 345)); pg.wait_for_timeout(40)
    pg.wait_for_timeout(800); fl = flips(pg)
    gaps = [fl[i + 1][1] - fl[i][1] for i in range(len(fl) - 1)]
    ok(len(fl) <= 11 and all(g >= 280 for g in gaps), f'{tag} wiggling 45px every 40ms for 2.8s: {len(fl)} changes, never closer than {min(gaps) if gaps else "-"}ms apart (cooldown)')
    pg.evaluate("scrollTo(0,0)"); settle(pg); pg.evaluate(FLIPS, 'html')
    pg.evaluate("scrollTo(0,300)"); pg.wait_for_timeout(120)
    pg.evaluate("scrollTo(0,240)"); pg.wait_for_timeout(1000)
    s = pg.evaluate(STATE)
    ok(not s['col'], f'{tag} scroll up 60px right after collapsing: the held-back expand is applied once the cooldown ends (not left stale), collapsed={s["col"]}')
    pg.evaluate("scrollTo(0,0)"); settle(pg)
    pg.evaluate("scrollTo(0,400)"); pg.wait_for_timeout(120)
    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(120)
    s = pg.evaluate(STATE)
    ok(not s['col'], f'{tag} reaching the very top expands at once, even inside the cooldown (collapsed={s["col"]})')

    # --- dialogs closed while the header is collapsed
    go_deep(pg, 1200); board_ok(pg, f'{tag} deep, before any dialog')
    for name, ov, op, cl in OVERLAYS:
        pg.evaluate(FLIPS, 'html'); y0 = pg.evaluate('scrollY')
        pg.evaluate(op); pg.wait_for_timeout(350)
        opened = pg.evaluate(f"document.getElementById('{ov}').style.display === 'flex'")
        pg.evaluate(cl); settle(pg, 500)
        s = pg.evaluate(STATE)
        ok(opened and abs(s['y'] - y0) <= 1 and s['col'] and not flips(pg), f'{tag} open and close "{name}" with the header collapsed: opened={opened}, position kept ({y0}->{s["y"]}), still compact, {len(flips(pg))} header flips')
    board_ok(pg, f'{tag} after closing all the dialogs')

    # --- Active <-> Completed (page height changes)
    pg.evaluate("items.forEach((it,i)=>{ if(i<3) it.completed=true; }); render()"); go_deep(pg, 1500)
    pg.evaluate("switchTab('completed')"); settle(pg); board_ok(pg, f'{tag} Completed (3 items, page now shorter than the screen) from deep down')
    pg.evaluate("switchTab('active')"); settle(pg); board_ok(pg, f'{tag} back on Active')
    pg.evaluate("items.forEach((it,i)=>{ if(i<22) it.completed=true; }); render()"); go_deep(pg, 1500)
    pg.evaluate("switchTab('completed')"); settle(pg); s = board_ok(pg, f'{tag} Completed (22 items, still scrolls)')
    ok(s['col'] or s['y'] <= 96, f'{tag} switching tab while deep down: the browser nudging the position to keep the page steady is not mistaken for scrolling up (y={s["y"]}, compact={s["col"]})')
    slow(pg, int(s['y']), min(int(s['y']) + 200, int(s['max'])) if s['max'] > s['y'] else int(s['y']))
    board_ok(pg, f'{tag} Completed after scrolling a little further')
    pg.evaluate("switchTab('active')"); settle(pg); s = board_ok(pg, f'{tag} back on Active after the long Completed list')
    ok(s['col'] or s['y'] <= 96, f'{tag} ... and the way back does not pop the header open or shut by itself (y={s["y"]}, compact={s["col"]})')
    pg.evaluate("items.forEach(it=>it.completed=false); render()"); settle(pg)
    go_deep(pg, 1500); s = pg.evaluate(STATE)
    ok(s['col'], f'{tag} after the tab switches the header still collapses when scrolling again (y={s["y"]}, scrollable {round(s["max"])}, {s["cls"]})')
    # --- search, recent activity, filters
    for name, js in [('open search', "toggleSearch()"), ('type a search with results', "(()=>{const i=document.getElementById('searchInput');i.value='number 1';onSearchInput();})()"),
                     ('search with no results', "(()=>{const i=document.getElementById('searchInput');i.value='zzzzz';onSearchInput();})()"), ('close search', "closeSearch()"),
                     ('open Recent activity', "toggleActivity()"), ('close Recent activity', "toggleActivity()"), ('open Filters', "toggleFilters()"), ('close Filters', "toggleFilters()")]:
        go_deep(pg, 1500); pg.evaluate(js); settle(pg); board_ok(pg, f'{tag} deep down, {name}')
    go_deep(pg, 1500)
    # --- fold / unfold every month while far down
    pg.evaluate("setAllMonthsCollapsed(true)"); settle(pg); board_ok(pg, f'{tag} Collapse all months from deep down')
    pg.evaluate("setAllMonthsCollapsed(false)"); settle(pg); board_ok(pg, f'{tag} Expand all months')
    go_deep(pg, 1500); s = pg.evaluate(STATE)
    ok(s['col'], f'{tag} after fold/unfold the header still collapses when scrolling again (y={s["y"]}, scrollable {round(s["max"])}, {s["cls"]})')
    # --- items deleted / completed until the page is shorter than the screen
    saved_items = pg.evaluate("JSON.stringify(items)")
    pg.evaluate("items.splice(2); render()"); settle(pg); s = board_ok(pg, f'{tag} only 2 items left (page shorter than the screen)')
    ok(not (s['col'] and s['max'] <= 96), f'{tag} short page: no compact header and blank gap left behind when there is hardly anything to scroll (y={s["y"]}, scrollable {round(s["max"])}px, compact={s["col"]})')
    pg.evaluate("items.length=0; render()"); settle(pg); board_ok(pg, f'{tag} empty board')
    pg.evaluate(f"items.length=0; JSON.parse({json.dumps(saved_items)}).forEach(i=>items.push(i)); render()"); settle(pg)

    # --- the URL bar / on-screen keyboard changing the viewport height at the bottom of the page
    pg.evaluate("scrollTo(0,1500)"); settle(pg)
    pg.evaluate("scrollTo(0, document.documentElement.scrollHeight)"); settle(pg)
    s = pg.evaluate(STATE); ok(s['col'] and s['y'] >= s['max'] - 1, f'{tag} at the very bottom, compact header (y={s["y"]}, scrollable {round(s["max"])}, {s["cls"]})')
    pg.evaluate(FLIPS, 'html')
    pg.set_viewport_size({'width': vw, 'height': vh + 80}); settle(pg)
    ok(pg.evaluate('document.documentElement.classList.contains("page-collapsed")') and not flips(pg), f'{tag} URL bar slides away at the bottom (viewport +80px, browser nudges the position up): header stays compact, {len(flips(pg))} flips')
    board_ok(pg, f'{tag} viewport +80px at the bottom')
    pg.set_viewport_size({'width': vw, 'height': vh}); settle(pg)
    ok(pg.evaluate('document.documentElement.classList.contains("page-collapsed")') and not flips(pg), f'{tag} URL bar comes back (viewport -80px): header stays compact, {len(flips(pg))} flips')
    pg.set_viewport_size({'width': vw, 'height': int(vh * 0.55)}); settle(pg)
    ok(pg.evaluate('document.documentElement.classList.contains("page-collapsed")') and not flips(pg), f'{tag} keyboard-sized viewport ({int(vh*0.55)}px): header stays compact')
    pg.set_viewport_size({'width': vw, 'height': vh}); settle(pg)
    ok(pg.evaluate('document.documentElement.classList.contains("page-collapsed")') and not flips(pg), f'{tag} keyboard goes away again: header stays compact')
    board_ok(pg, f'{tag} viewport restored')
    # a real scroll up still brings the header back afterwards
    s = pg.evaluate(STATE); slow(pg, int(s['y']), int(s['y']) - 60); s = pg.evaluate(STATE)
    ok(not s['col'], f'{tag} ... and a real scroll up of 60px still expands it')

    # --- search field focused with a keyboard-sized viewport, then the keyboard closes
    go_deep(pg, 1500); pg.evaluate("toggleSearch()"); settle(pg, 300)
    pg.evaluate("document.getElementById('searchInput').focus()")
    pg.set_viewport_size({'width': vw, 'height': int(vh * 0.55)}); settle(pg)
    board_ok(pg, f'{tag} search focused, keyboard up')
    pg.set_viewport_size({'width': vw, 'height': vh}); pg.evaluate("document.activeElement.blur(); closeSearch()"); settle(pg)
    board_ok(pg, f'{tag} keyboard down, search closed')

    # --- rotate the phone (and back) while collapsed
    go_deep(pg, 1500)
    pg.set_viewport_size({'width': vh, 'height': vw}); settle(pg); board_ok(pg, f'{tag} rotated to landscape while collapsed')
    pg.evaluate("scrollTo(0,2500)"); settle(pg); board_ok(pg, f'{tag} landscape, scrolled further')
    pg.set_viewport_size({'width': vw, 'height': vh}); settle(pg); board_ok(pg, f'{tag} rotated back to portrait')
    pg.evaluate("scrollTo(0,0)"); settle(pg); board_ok(pg, f'{tag} back at the top')

    # --- dialog header: Settings tabs, very short dialogs
    pg.evaluate("openSettingsModal('general')"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#settingsOverlay .modal').style.paddingBottom='2500px'")
    pg.evaluate("document.querySelector('#settingsOverlay .modal').scrollTop=600"); settle(pg, 700)
    c1 = pg.evaluate("document.querySelector('#settingsOverlay .modal-bar').classList.contains('is-collapsed')")
    ok(c1, f'{tag} Settings scrolled down: dialog header collapsed')
    pg.evaluate("showSettingsTab('themes')"); settle(pg, 700)
    st = pg.evaluate("({c:document.querySelector('#settingsOverlay .modal-bar').classList.contains('is-collapsed'), t:document.querySelector('#settingsOverlay .modal').scrollTop})")
    ok(not st['c'] and st['t'] == 0, f'{tag} Settings tab switch resets to the top with the full header (collapsed={st["c"]}, scrollTop={st["t"]})')
    pg.evaluate("document.querySelector('#settingsOverlay .modal').scrollTop=1e6"); settle(pg, 700)
    mx = pg.evaluate("(()=>{const m=document.querySelector('#settingsOverlay .modal');return m.scrollHeight-m.clientHeight})()")
    pg.evaluate(FLIPS, '#settingsOverlay .modal-bar')
    pg.set_viewport_size({'width': vw, 'height': vh + 80}); settle(pg, 700)
    ok(pg.evaluate("document.querySelector('#settingsOverlay .modal-bar').classList.contains('is-collapsed')") and not flips(pg), f'{tag} dialog scrolled to its end, viewport grows 80px (position nudged up): dialog header stays compact')
    pg.set_viewport_size({'width': vw, 'height': vh}); settle(pg, 500)
    pg.evaluate("closeSettingsModal()")
    # very short dialog: nothing to scroll, so the header never collapses and everything is reachable
    pg.evaluate("(()=>{ window.__cp=askConfirm({title:'Mark complete',message:'Are you sure?'}); })()"); pg.wait_for_timeout(300)
    pg.mouse.move(cx, vh // 2); pg.mouse.wheel(0, 400); drag(cdp, pg, 200, cx, vh - 60, tail=300)
    r = pg.evaluate("(()=>{const m=document.querySelector('#confirmOverlay .modal'),b=m.querySelector('.modal-bar'),o=document.getElementById('confirmOk').getBoundingClientRect();return {c:b.classList.contains('is-collapsed'),st:m.scrollTop,ok:o.bottom<=innerHeight&&o.top>=0,can:m.scrollHeight>m.clientHeight+1}})()")
    ok(not r['c'] and r['st'] == 0 and r['ok'], f'{tag} very short dialog: header never collapses, buttons on screen ({r})')
    pg.evaluate("document.getElementById('confirmCancel').click()")
    ok(not errs, f'{tag} scenarios: no page errors' + (': ' + errs[0] if errs else ''))
    ctx.close()

def scenarios_short_screen(b):
    """a phone on its side: a 320px-high viewport, so dialogs are tiny and scroll a lot"""
    ctx, pg, errs = new_page(b, 568, 320, touch=True)
    for name, ov, op, cl in [('item form', 'itemOverlay', "openItemModal()", "closeItemModal()"), ('Settings General', 'settingsOverlay', "openSettingsModal('general')", "closeSettingsModal()")]:
        pg.evaluate(op); pg.wait_for_timeout(300)
        sel = f'#{ov} .modal'
        pg.evaluate(f"document.querySelector('{sel}').scrollTop=1e6"); settle(pg, 700)
        r = pg.evaluate(f"""(()=>{{const m=document.querySelector('{sel}'),b=m.querySelector('.modal-bar'),br=b.querySelector('.modal-bar-row').getBoundingClientRect(),mr=m.getBoundingClientRect();
          const els=[...m.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),select,textarea,button')].filter(e=>e.offsetParent&&!b.contains(e));
          const last=els[els.length-1]; last.focus(); const lr=last.getBoundingClientRect();
          return {{col:b.classList.contains('is-collapsed'),max:m.scrollHeight-m.clientHeight,lastBottom:lr.bottom,mb:mr.bottom,barBottom:br.bottom,top:lr.top}}}})()""")
        ok(r['max'] > 40 and r['col'], f'568x320 {name}: long dialog scrolls and its header collapses (scrollable {round(r["max"])}px)')
        ok(r['lastBottom'] <= r['mb'] + 1, f'568x320 {name}: last control reachable at the end of the dialog')
        pg.evaluate(cl)
    ok(not errs, '568x320 scenarios: no page errors' + (': ' + errs[0] if errs else ''))
    ctx.close()

def scroll_lock_checks(b, vw, vh, touch, scrollbars=False, only=None):
    tag = f'{vw}px' + (' (classic scrollbars)' if scrollbars else '')
    ctx, pg, errs = new_page(b, vw, vh, touch=touch)
    cdp = ctx.new_cdp_session(pg) if touch else None
    dev = 'touch + wheel' if touch else 'wheel'
    # controls: with no dialog open the same gestures DO scroll the page (so a pass below means something)
    pg.evaluate("scrollTo(0,0)"); settle(pg)
    pg.mouse.move(vw // 2, vh // 2); pg.mouse.wheel(0, 300); settle(pg, 200)
    ok(pg.evaluate('scrollY') > 100, f'{tag} control: wheel scrolls the page when no dialog is open')
    if touch:
        y1 = pg.evaluate('scrollY'); drag(cdp, pg, 250, vw // 2, vh - 100, tail=300); settle(pg, 200)
        ok(pg.evaluate('scrollY') > y1 + 100, f'{tag} control: a finger drag scrolls the page when no dialog is open')
    if scrollbars:
        sbw = pg.evaluate("innerWidth-document.documentElement.clientWidth")
        ok(sbw > 0, f'{tag} the page has a classic scrollbar ({sbw}px), so the gutter check below means something')
    for name, ov, op, cl in OVERLAYS:
        if ONLY_DIALOG and ONLY_DIALOG.lower() not in name.lower(): continue
        if only and name not in only: continue
        y0 = 1200
        pg.evaluate(f"scrollTo(0,{y0})"); settle(pg)
        y0 = int(pg.evaluate('scrollY'))
        before = pg.evaluate("({w:document.querySelector('#app main').getBoundingClientRect().width, l:document.querySelector('#app main').getBoundingClientRect().left, cw:document.documentElement.clientWidth})")
        pg.evaluate("window.__dev=[]; window.addEventListener('scroll',()=>{ if(Math.abs(scrollY-%d)>1) window.__dev.push(scrollY); },true)" % y0)
        pg.evaluate(FLIPS, 'html')
        pg.evaluate(op); pg.wait_for_timeout(350)
        lockd = pg.evaluate("document.documentElement.classList.contains('dialog-open')")
        if not pg.evaluate(f"document.getElementById('{ov}').style.display === 'flex'"): res_open = 'the dialog did not open'
        else: res_open = ''
        mr = pg.evaluate(f"(()=>{{const r=document.querySelector('#{ov} .modal').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]}})()")
        after = pg.evaluate("({w:document.querySelector('#app main').getBoundingClientRect().width, l:document.querySelector('#app main').getBoundingClientRect().left, cw:document.documentElement.clientWidth})")
        res = [res_open] if res_open else []
        def page_y(): return pg.evaluate('scrollY')
        # wheel over the dark backdrop (top-left corner), over the dialog's own corner, down and up
        for (x, y, lbl) in [(4, 4, 'backdrop'), (mr[0] + 6, mr[3] - 6, 'dialog corner')]:
            pg.mouse.move(x, y)
            for d in (500, 500, -500, 1500, -1500): pg.mouse.wheel(0, d); pg.wait_for_timeout(60)
            pg.wait_for_timeout(250)
            if page_y() != y0: res.append(f'wheel over {lbl} moved the page to {page_y()}')
        if touch:
            for (x, y, dy, lbl) in [(8, 8, 250, 'backdrop, finger up'), (8, 8, -250, 'backdrop, finger down'), (mr[0] + 6, mr[3] - 6, 250, 'dialog corner, finger up'), (mr[0] + 6, mr[3] - 6, -250, 'dialog corner, finger down')]:
                drag(cdp, pg, dy, x, y, tail=350)
                if page_y() != y0: res.append(f'touch over {lbl} moved the page to {page_y()}')
        # a long dialog: its own scrolling must work, and at either end it must not hand the scroll to the page
        pg.evaluate(f"document.querySelector('#{ov} .modal').style.paddingBottom='2200px'"); pg.wait_for_timeout(100)
        mt = lambda: pg.evaluate(f"document.querySelector('#{ov} .modal').scrollTop")
        cxm, cym = int((mr[0] + mr[2]) / 2), int(mr[1] + 30)
        pg.mouse.move(cxm, cym)
        pg.mouse.wheel(0, 300); pg.wait_for_timeout(250)
        if mt() <= 0 and name not in ('Photo crop',): res.append('wheel could not scroll a long dialog')
        for d in (3000, 3000, 3000): pg.mouse.wheel(0, d); pg.wait_for_timeout(120)
        pg.wait_for_timeout(300)
        if page_y() != y0: res.append(f'wheel at the end of a long dialog moved the page to {page_y()}')
        for d in (-3000, -3000, -3000): pg.mouse.wheel(0, d); pg.wait_for_timeout(120)
        pg.wait_for_timeout(300)
        if page_y() != y0: res.append(f'wheel at the top of a long dialog moved the page to {page_y()}')
        if touch:
            tx = mr[0] + 6; ty0 = int(min(mr[3] - 8, vh - 10))
            ok_scroll = False
            for k in range(3):
                before_t = mt(); drag(cdp, pg, 400, tx, ty0, tail=350)
                if mt() > before_t: ok_scroll = True
                if page_y() != y0: res.append(f'touch scrolling a long dialog down moved the page to {page_y()}')
            if not ok_scroll: res.append('finger could not scroll a long dialog')
            for k in range(2):
                drag(cdp, pg, -500, tx, int(mr[1] + 60), tail=350)
                if page_y() != y0: res.append(f'touch scrolling a long dialog back up moved the page to {page_y()}')
        dev_events = pg.evaluate('window.__dev.length')
        if dev_events: res.append(f'{dev_events} scroll event(s) saw the page off its position')
        pg.evaluate(f"document.querySelector('#{ov} .modal').style.paddingBottom=''")
        pg.evaluate(cl); settle(pg, 500)
        s = pg.evaluate(STATE)
        if abs(s['y'] - y0) > 1: res.append(f'after closing the page is at {s["y"]}, was {y0}')
        if pg.evaluate("document.documentElement.classList.contains('dialog-open')"): res.append('page still locked after closing')
        if not s['col'] or flips(pg): res.append(f'header state changed during the dialog ({len(flips(pg))} flips, collapsed={s["col"]})')
        if not lockd: res.append('html.dialog-open was not set while open')
        if abs(after['w'] - before['w']) > 0.5 or abs(after['l'] - before['l']) > 0.5:
            res.append(f'page jumped sideways when locking: {before} -> {after}')
        ok(not res, f'{tag} [{dev}] "{name}": page behind stays at {y0} and the dialog scrolls itself' + (' - ' + '; '.join(res) if res else ''))
        pg.evaluate("window.__dev=[]")
    # every dialog closed again: the page scrolls as before
    pg.mouse.move(vw // 2, vh // 2); pg.mouse.wheel(0, 300); settle(pg, 200)
    ok(pg.evaluate('scrollY') > 1200 + 100, f'{tag} wheel scrolls the page again once every dialog is closed')
    # the guard on its own (overflow lock taken away): a wheel turn or drag over the backdrop must still be cancelled
    pg.evaluate("scrollTo(0,1200)"); settle(pg)
    pg.evaluate("openSettingsModal('general')"); pg.wait_for_timeout(300)
    pg.evaluate("document.documentElement.classList.remove('dialog-open')")
    pg.evaluate("window.__dev=[]; window.addEventListener('scroll',()=>{ if(Math.abs(scrollY-1200)>1) window.__dev.push(scrollY); },true)")
    pg.mouse.move(4, 4); pg.mouse.wheel(0, 600); pg.wait_for_timeout(300)
    if touch: drag(cdp, pg, 250, 8, 8, tail=500)
    ok(pg.evaluate('window.__dev.length') == 0, f'{tag} the wheel/touch guard alone (without overflow:hidden) already keeps the page still')
    pg.evaluate("closeSettingsModal()"); settle(pg, 300)
    ok(not errs, f'{tag} scroll lock: no page errors' + (': ' + errs[0] if errs else ''))
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    for vw, vh in ([] if ONLY_SCENARIOS else [(390, 844), (320, 568), (1200, 800)]):
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
    if not ONLY_DIALOG:
        for vw, vh in [(390, 844), (320, 568)]:
            scenarios_phone(b, vw, vh)
        scenarios_short_screen(b)
    scroll_lock_checks(b, 390, 844, True)
    if not ONLY_DIALOG:
        scroll_lock_checks(b, 320, 568, True, only=('item form', 'Settings General', 'Deleted items', 'Question'))
    scroll_lock_checks(b, 1200, 800, False)
    b.close()
    # desktop with real (classic) scrollbars: Playwright hides them by default
    b2 = p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None, ignore_default_args=['--hide-scrollbars'])
    if not ONLY_DIALOG: scroll_lock_checks(b2, 1200, 800, False, scrollbars=True)
    b2.close()
srv.shutdown()
print('\n%s' % ('ALL OK' if not bad else f'{len(bad)} FAILED'))
sys.exit(1 if bad else 0)
