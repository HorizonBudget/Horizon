#!/usr/bin/env python3
"""Edge-case looks audit (needs Playwright + Chromium; not run by run-all.js).
Fills the board with awkward data (very long words with no spaces, right-to-left and emoji-heavy text, a billion-dollar
item, 12 people, 100 categories, 12 saved themes with long names) and checks, at the narrowest phones, landscape,
desktop zoom 200% and with the self-hosted fonts failing to load, that nothing scrolls sideways, every field stays
16px, there are no page errors, and the headline text stays readable (AA) on unreadable custom color picks.
Usage: python3 tests/edge-looks-audit.py"""
import re, sys, threading, http.server, socketserver, functools, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://localhost:%d/' % srv.server_address[1]

LONG = 'Supercalifragilisticexpialidociousandthensomemorelettersnospaces'
SEED = r'''
(async()=>{
 const LONG='%s';
 document.getElementById('householdCode').value='MAPLE-HARBOR-1234';
 document.getElementById('yourName').value='Maximilianjohannesbartholomew-Von-Habsburg';
 const names=['Maximilianjohannesbartholomew-Von-Habsburg','\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645','\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}\u{1F389}\u{1F389}','Jo','Al','Bea','Cy','Di','Ed','Flo','Gus','Hal'];
 people=names.map((n,i)=>({id:'p'+i,name:n,photo:null}));
 await enterApp();
 householdName='TheVeryLongHouseholdNameWithNoSpacesAtAllForTesting'; updateHouseholdTitle();
 for(let i=0;i<100;i++) CATEGORIES.push('Category'+i+(i%%10===0?LONG:''));
 const M0=FUTURE_MONTHS[0], M1=FUTURE_MONTHS[1];
 let id=100;
 const add=o=>items.push(Object.assign({id:id++,category:'Home',subcategory:'',cost:100,month:M0,saved:0,owner:'',link:'',note:'',completed:false},o));
 add({name:LONG+LONG, cost:1000000000, owner:names[0], category:'Category0'+LONG, subcategory:LONG});
 add({name:'\u0645\u0627\u0634\u064a\u0646\u0629 \u063a\u0633\u064a\u0644 \u062c\u062f\u064a\u062f\u0629 \u0644\u0644\u0628\u064a\u062a \u0645\u0639 \u0627\u0644\u062a\u0631\u0643\u064a\u0628', cost:999999999.99, owner:names[1]});
 add({name:'\u{1F389}\u{1F389}\u{1F389}\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}\u{1F1FA}\u{1F1F8}\u{1F44D}\u{1F3FD}\u{1F389}\u{1F389}\u{1F389}\u{1F389}\u{1F389}\u{1F389}\u{1F389}\u{1F389}', cost:999999999.99, owner:names[2]});
 for(let i=0;i<12;i++) add({name:'Item '+i, owner:names[i], month:M1, cost:123456789.12, category:CATEGORIES[11+i]});
 add({name:'Done '+LONG, completed:true, actualCost:1000000000, owner:names[0]});
 add({kind:'todo', name:LONG+LONG, completed:false, owner:names[0], due:todoDateStr(2), notes:LONG, createdAt:1});
 add({kind:'todo', name:'\u0627\u062a\u0635\u0644 \u0628\u0634\u0631\u0643\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646', completed:false, owner:names[1], createdAt:2});
 savedThemes=[]; for(let i=0;i<12;i++) savedThemes.push({id:'s'+i, name:('W'+i+LONG).slice(0,24), dark:i%%2===1, paper:i%%2?'#131719':'#EEF1ED', accent:'#3F6D64'});
 saveSettings();
 render();
})()
''' % LONG

FUN = r'''
(()=>{
 const vw=window.innerWidth, de=document.documentElement, els=[];
 const all=document.querySelectorAll('body *');
 for(const el of all){
   const cs=getComputedStyle(el);
   if(cs.display==='none'||cs.visibility==='hidden') continue;
   const r=el.getBoundingClientRect();
   if(r.width===0&&r.height===0) continue;
   if(r.right<=vw+0.5 && r.left>=-0.5) continue;
   let clipped=false, p=el.parentElement;
   while(p&&p!==document.body){ const pc=getComputedStyle(p); if(pc.overflowX!=='visible'){ const pr=p.getBoundingClientRect(); if(pr.right<=vw+0.5&&pr.left>=-0.5){clipped=true;break;} } p=p.parentElement; }
   if(!clipped) els.push((el.id?'#'+el.id:el.tagName.toLowerCase())+'.'+String(el.className).split(' ').join('.')+' left='+Math.round(r.left)+' right='+Math.round(r.right));
 }
 for(const el of [de,document.body,...all]){
   const cs=getComputedStyle(el); if(cs.display==='none') continue;
   if((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+1 && el.clientWidth>0)
     els.push('SCROLLX '+(el.id?'#'+el.id:el.tagName.toLowerCase())+'.'+String(el.className).split(' ').join('.'));
 }
 for(const el of document.querySelectorAll('input,select,textarea')){
   const cs=getComputedStyle(el); if(cs.display==='none'||['hidden','file','range','checkbox','radio','color'].includes(el.type)) continue;
   if(!el.getBoundingClientRect().width) continue;
   if(parseFloat(cs.fontSize)<16) els.push('SMALLFONT '+(el.id||el.tagName)+' '+cs.fontSize);
 }
 return {doc:de.scrollWidth, vw, els:els.slice(0,12)};
})()
'''
# readable-ink check: the board heading and an item name against the page, in real computed colors
INK = r'''
(()=>{
 const parse=c=>{const m=c.match(/[\d.]+/g).map(Number);return m;};
 const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
 const lum=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
 const cs=getComputedStyle(document.documentElement);
 const ink=parse(getComputedStyle(document.body).color), paper=parse(cs.getPropertyValue('--paper').trim().replace(/^#(..)(..)(..)$/,(m,a,b,c)=>`rgb(${parseInt(a,16)},${parseInt(b,16)},${parseInt(c,16)})`));
 return ratio(ink,paper);
})()
'''
bad = []
cases = 0
def rec(name, pg):
    global cases
    cases += 1
    r = pg.evaluate(FUN)
    flag = r['doc'] > r['vw'] or r['els']
    print(('FAIL ' if flag else 'ok   ') + name, f"doc={r['doc']} vw={r['vw']}", '' if not r['els'] else '\n     ' + '\n     '.join(r['els']))
    if flag: bad.append(name)

STATES = [
 ('main', None),
 ('filters', "toggleFilters()"),
 ('edit-long', "openItemModal(items.find(i=>i.id===100))"),
 ('settings-general', "openSettingsModal('general')"),
 ('settings-themes', "openSettingsModal('themes')"),
 ('settings-themes-emoji', "openSettingsModal('themes');setPatternType('emoji');const f=document.getElementById('pat_emoji');f.value='\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466\U0001F1FA\U0001F1F8\U0001F44D\U0001F3FD';onCustomEmojiInput()"),
 ('profile', "openProfileModal()"),
 ('admin', "openAdminModal()"),
 ('activity', "setActivityOpen(true)"),
 ('style-guide', "openStyleGuide()"),
 ('todo-main', "setSide('todo')"),
 ('compact', "setSide('budget');window.scrollTo(0,900);document.documentElement.classList.add('page-collapsed')"),
]
CLOSE = "document.querySelectorAll('.overlay').forEach(o=>{o.style.display='none'}); try{closeSearch()}catch(e){}; try{setActivityOpen(false)}catch(e){}; if(filtersOpen) toggleFilters(); window.scrollTo(0,0); document.documentElement.classList.remove('page-collapsed')"
CONFIG_JS = re.sub(r'apiKey: "[^"]*"', 'apiKey: ""', (ROOT / 'js/config.js').read_text())
RUNS = [
 # (label, viewport, theme setup, block fonts, mobile)
 ('320 light', (320, 568), "setTheme('light')", False, True),
 ('320 midnight', (320, 568), "setTheme('midnight')", False, True),
 ('320 christmas', (320, 568), "setTheme('christmas')", False, True),
 ('320 halloween+grid', (320, 568), "setTheme('halloween');setPatternType('grid');setPatternStrength('bold')", False, True),
 ('568 landscape', (568, 320), "setTheme('light')", False, True),
 ('390 no-fonts', (390, 844), "setTheme('summer')", True, True),
 ('320 no-fonts', (320, 568), "setTheme('light')", True, True),
 ('640 desktop-zoom200', (640, 400), "setTheme('ocean')", False, False),
 ('320 custom-black-on-black', (320, 568), "customTheme={dark:false,paper:'#000000',accent:'#3F6D64'};theme='custom';commitTheme()", False, True),
 ('320 custom-white-dark', (320, 568), "customTheme={dark:true,paper:'#FFFFFF',accent:'#FFFFFF'};theme='custom';commitTheme()", False, True),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    for label, (vw, vh), setup, nofonts, mobile in RUNS:
        ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=2, has_touch=mobile, is_mobile=mobile)
        ctx.route(re.compile(r'/js/config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG_JS))
        if nofonts: ctx.route(re.compile(r'\.woff2'), lambda r: r.abort())
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('lastBackupAt','1')}catch(e){}")
        pg.goto(URL)
        pg.evaluate(SEED); pg.wait_for_timeout(400)
        pg.evaluate(setup); pg.wait_for_timeout(150)
        cases += 1
        ink = pg.evaluate(INK)
        if ink < 4.5: print(f'FAIL {label} page text contrast {ink:.2f}'); bad.append(label + ' contrast')
        else: print(f'ok   {label} page text contrast {ink:.2f}')
        for name, js in STATES:
            if js:
                try: pg.evaluate(js)
                except Exception as e: print('  js err', name, str(e)[:100]); bad.append(f'{label} {name} js')
                pg.wait_for_timeout(200)
            rec(f'{label} {name}', pg)
            pg.evaluate(CLOSE)
        if errs: print('PAGE ERRORS', errs[:3]); bad.append(label + ' page errors')
        ctx.close()
    # bad saved settings must never stop the app from opening
    for raw in ['null', '[]', '"x"', '5', '{bad json', '{"theme":"custom"}', '{"theme":"custom","custom":{"paper":"red","accent":"#12"}}',
                '{"savedThemes":[null,5,{"name":"<b>x</b>\\" onclick=\\"x","paper":"#ffffff","accent":"#000000","pattern":{"type":"emoji","emoji":"<svg>"}}],"pattern":{"type":"emoji","emoji":"\'\\"><"}}',
                '{"pattern":"stripes","savedThemes":{"a":1},"theme":{"x":1}}']:
        cases += 1
        ctx = b.new_context(viewport={'width': 320, 'height': 568}, is_mobile=True, has_touch=True)
        ctx.route(re.compile(r'/js/config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG_JS))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('lastBackupAt','1');localStorage.setItem('ledgerSettings'," + repr(raw) + ")}catch(e){}")
        pg.goto(URL); pg.wait_for_timeout(300)
        okk = pg.evaluate("!!document.getElementById('householdCode') && getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()!=='' && typeof theme==='string'")
        pg.evaluate("openSettingsModal('themes')"); pg.wait_for_timeout(100)
        injected = pg.evaluate("!!document.querySelector('#savedThemes [onclick=\"x\"], #savedThemes b')")
        if errs or not okk or injected: print('FAIL bad-settings', raw, errs[:2], okk, injected); bad.append('bad-settings ' + raw)
        else: print('ok   bad-settings', raw)
        ctx.close()
    print(f'\n{cases} cases checked\nBAD COUNT', len(bad)); print('\n'.join(bad))
    srv.shutdown(); sys.exit(1 if bad else 0)
