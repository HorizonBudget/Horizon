#!/usr/bin/env python3
"""Sideways-scroll audit (needs Playwright + Chromium; not run by run-all.js).
Opens every screen at phone sizes (portrait and landscape, light and midnight) and fails if anything is wider than
the screen, if a scrollable box scrolls sideways, or if a field is under 16px (iPhone zooms in on those).
Usage: python3 tests/overflow-audit.py"""
import re, sys, json, threading, http.server, socketserver, functools, pathlib, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://localhost:%d/' % srv.server_address[1]
AV = 'null'
SEED='''
(async()=>{
 document.getElementById('householdCode').value='MAPLE-HARBOR-1234';document.getElementById('yourName').value='Samantha';
 people=[{id:'p1',name:'Alexander',photo:null},{id:'p2',name:'Jo',photo:null},{id:'p3',name:'Christopher-Montgomery-Wellington',photo:null}];
 await enterApp();
 const M0=FUTURE_MONTHS[0], M1=FUTURE_MONTHS[1], M2=FUTURE_MONTHS[2];
 items.push(
  {id:11,name:'Washing machine and dryer set with a very long name that keeps going',category:'Home',subcategory:'Appliances',cost:1240000.55,month:M0,saved:500,owner:'Samantha',link:'https://www.averyveryveryverylongdomainnamefortestingpurposes.example.com/path/to/product?x=1',note:'Supercalifragilisticexpialidocious_unbreakable_word_in_a_note_that_is_long',completed:false,repeat:{every:2,unit:'week'}},
  {id:13,name:'Winter tires',category:'Vehicle',subcategory:'',cost:900,month:M0,saved:0,owner:'Christopher-Montgomery-Wellington',link:'',note:'',completed:false},
  {id:14,name:'Vacation to Tahiti',category:'Travel',subcategory:'',cost:9900,month:M1,saved:100,owner:'Alexander',link:'',note:'',completed:false},
  {id:15,name:'Old thing',category:'Home',subcategory:'',cost:50,month:M2,saved:0,owner:'Jo',link:'',note:'',completed:true,actualCost:61.25},
  {id:16,name:'Deleted one',category:'Home',subcategory:'',cost:50,month:M2,saved:0,owner:'Jo',link:'',note:'',completed:false,deletedAt:Date.now()-86400000},
  {id:21,kind:'todo',name:'Call the insurance company about the very long renewal letter that keeps going on and on',completed:false,owner:'Christopher-Montgomery-Wellington',due:todoDateStr(-3),linkId:11,notes:'Supercalifragilisticexpialidocious_unbreakable_word_in_a_todo_note',createdAt:1},
  {id:22,kind:'todo',name:'Pick up dry cleaning',completed:false,owner:'Samantha',due:todoDateStr(0),createdAt:2},
  {id:23,kind:'todo',name:'Book_the_annual_service_appointment_unbreakable',completed:false,owner:'',due:todoDateStr(4),linkId:13,createdAt:3},
  {id:24,kind:'todo',name:'Plan the trip',completed:false,owner:'Jo',due:todoDateStr(40),createdAt:4},
  {id:25,kind:'todo',name:'Return books',completed:false,owner:'',createdAt:5},
  {id:26,kind:'todo',name:'Done thing',completed:true,completedAt:Date.now(),owner:'',createdAt:6});
 render();
})()
'''
FUN=r'''
(()=>{
 const vw=window.innerWidth, out=[];
 const de=document.documentElement;
 const res={docScroll:de.scrollWidth, bodyScroll:document.body.scrollWidth, vw:vw, vvw:(window.visualViewport||{}).width, els:[]};
 const all=document.querySelectorAll('body *');
 for(const el of all){
   const cs=getComputedStyle(el);
   if(cs.display==='none'||cs.visibility==='hidden') continue;
   const r=el.getBoundingClientRect();
   if(r.width===0&&r.height===0) continue;
   if(r.right<=vw+0.5) continue;
   // clipped by an ancestor with overflow-x not visible?
   let clipped=false, p=el.parentElement;
   while(p&&p!==document.body){ const pc=getComputedStyle(p); if(pc.overflowX!=='visible'){ const pr=p.getBoundingClientRect(); if(pr.right<=vw+0.5){clipped=true;break;} } if(pc.display==='none'){clipped=true;break;} p=p.parentElement; }
   if(clipped) continue;
   // inside a display:none ancestor? handled by rect 0. skip off-screen overlays
   res.els.push((el.id?('#'+el.id):el.tagName.toLowerCase())+'.'+String(el.className).split(' ').join('.')+' right='+Math.round(r.right)+' w='+Math.round(r.width)+' pos='+cs.position);
 }
 for(const el of [de,document.body,...all]){
   const cs=getComputedStyle(el);
   if(cs.display==='none') continue;
   if((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+1 && el.clientWidth>0){
     res.els.push('SCROLLX '+(el.id?('#'+el.id):el.tagName.toLowerCase())+'.'+String(el.className).split(' ').join('.')+' scrollW='+el.scrollWidth+' clientW='+el.clientWidth);
   }
 }
 // small-font form controls (iOS focus zoom if <16px)
 for(const el of document.querySelectorAll('input,select,textarea')){
   const cs=getComputedStyle(el); if(cs.display==='none'||el.type==='hidden'||el.type==='file'||el.type==='range'||el.type==='checkbox'||el.type==='radio'||el.type==='color') continue;
   const r=el.getBoundingClientRect(); if(!r.width) continue;
   if(parseFloat(cs.fontSize)<16) res.els.push('SMALLFONT '+(el.id||el.tagName)+' '+cs.fontSize);
 }
 res.els=res.els.slice(0,14);
 return res;
})()
'''
bad=[]
def rec(name,pg):
    r=pg.evaluate(FUN)
    over = r['docScroll']>r['vw']
    flag = over or r['els']
    print(('FAIL ' if flag else 'ok   ')+name, f"doc={r['docScroll']} body={r['bodyScroll']} vw={r['vw']}", ('' if not r['els'] else '\n     '+'\n     '.join(r['els'])))
    if flag: bad.append(name)
STATES=[
 ('main',None),
 ('collapse-all',"document.querySelectorAll('.month-group').forEach(g=>{});void 0"),
 ('add','openItemModal()'),
 ('add-repeat',"openItemModal(); (document.getElementById('i_repeat')||{}).value='custom'; (document.getElementById('i_repeat')||{}).dispatchEvent&&document.getElementById('i_repeat').dispatchEvent(new Event('change'))"),
 ('edit-long',"openItemModal(items.find(i=>i.id===11))"),
 ('settings-general',"openSettingsModal('general')"),
 ('settings-themes',"openSettingsModal('themes')"),
 ('settings-advanced',"openSettingsModal('advanced')"),
 ('trash',"openTrashModal()"),
 ('profile',"openProfileModal()"),
 ('admin',"openAdminModal()"),
 ('search',"openSearch()"),
 ('activity',"setActivityOpen(true)"),
 ('todo-main',"setSide('todo')"),
 ('todo-done-open',"setSide('todo');toggleTodoDone(true)"),
 ('todo-edit',"setSide('todo');openTodoModal(21)"),
 ('todo-new',"setSide('todo');openTodoModal()"),
 ('todo-search',"setSide('todo');openSearch()"),
 ('todo-compact',"setSide('todo');window.scrollTo(0,600);document.documentElement.classList.add('page-collapsed')"),
 ('back-to-budget',"window.scrollTo(0,0);document.documentElement.classList.remove('page-collapsed');setSide('budget')"),
]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    for vw,vh in [(320,568),(375,667),(390,844),(430,932),(667,375),(844,390),(932,430)]:
      for theme in ['light','midnight']:
        ctx=b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2,has_touch=True,is_mobile=True)
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort()); ctx.route(re.compile(r'/js/config\.js'),lambda r:r.fulfill(status=200,content_type='application/javascript',body=re.sub(r'apiKey: "[^"]*"','apiKey: ""',(ROOT/'js/config.js').read_text()))); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('lastBackupAt','1')}catch(e){}")
        pg.goto(URL)
        rec(f'{vw} signin',pg)
        pg.evaluate(SEED); pg.wait_for_timeout(400)
        pg.evaluate(f"setTheme('{theme}')"); pg.wait_for_timeout(150)
        for name,js in STATES:
            if js:
                try: pg.evaluate(js)
                except Exception as e: print('  js err',name,str(e)[:80])
                pg.wait_for_timeout(200)
            rec(f'{vw} {theme} {name}',pg)
            # close everything
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o=>{o.style.display='none'}); try{closeSearch()}catch(e){}; try{setActivityOpen(false)}catch(e){}; document.body.classList.remove('modal-open');document.body.style.overflow=''")
        # toast + backup banner + install hint
        pg.evaluate("try{showUndoToast&&showUndoToast('Deleted Washing machine and dryer set with a very long name',()=>{})}catch(e){}"); pg.wait_for_timeout(200); rec(f'{vw} {theme} toast',pg)
        pg.evaluate("localStorage.removeItem('horizonInstallHintShown'); window.dispatchEvent(Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt(){return Promise.resolve()},userChoice:Promise.resolve({})}))"); pg.wait_for_timeout(200); rec(f'{vw} {theme} install-hint',pg)
        pg.evaluate("void askConfirm({title:'Remove this item permanently?',message:'Washing machine and dryer set with a very long name that keeps going will be removed.',okLabel:'Remove'})"); pg.wait_for_timeout(200); rec(f'{vw} {theme} confirm',pg)
        if errs: print('PAGE ERRORS',errs[:3])
        ctx.close()
    # ---- seasonal themes and background patterns (added with the themes feature) at the narrowest phones ----
    SEASONAL=['halloween','autumn','christmas','winter','valentine','spring','summer','july4']
    PATTERNS=[('stripes',"setPatternType('stripes');setPatternSize('large');setPatternStrength('bold')"),
              ('diagonal',"setPatternType('diagonal');setPatternSize('small')"),
              ('dots',"setPatternType('dots');setPatternSize('medium')"),
              ('grid',"setPatternType('grid');setPatternSize('large')"),
              ('emoji-multi',"setPatternEmoji('\U0001F383\U0001F384\u2744\uFE0F');setPatternSize('large');setPatternStrength('bold')")]
    THEME_STATES=[s for s in STATES if s[0] in ('main','add','settings-themes','settings-general','activity','todo-main','todo-edit','back-to-budget')]
    for vw,vh in [(320,568),(390,844)]:
      for label,setup,pre in [(t,f"setTheme('{t}')",None) for t in SEASONAL]+[('pat-'+n,"setTheme('light');"+js,None) for n,js in PATTERNS]+[('pat-dark-'+n,"setTheme('midnight');"+js,None) for n,js in PATTERNS[:2]]:
        ctx=b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2,has_touch=True,is_mobile=True)
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort()); ctx.route(re.compile(r'/js/config\.js'),lambda r:r.fulfill(status=200,content_type='application/javascript',body=re.sub(r'apiKey: "[^"]*"','apiKey: ""',(ROOT/'js/config.js').read_text()))); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('lastBackupAt','1')}catch(e){}")
        pg.goto(URL)
        pg.evaluate(setup); pg.wait_for_timeout(120)
        rec(f'{vw} {label} signin',pg)
        pg.evaluate(SEED); pg.wait_for_timeout(300)
        pg.evaluate(setup); pg.wait_for_timeout(150)
        for name,js in THEME_STATES:
            if js:
                try: pg.evaluate(js)
                except Exception as e: print('  js err',name,str(e)[:80])
                pg.wait_for_timeout(150)
            rec(f'{vw} {label} {name}',pg)
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o=>{o.style.display='none'}); try{setActivityOpen(false)}catch(e){}; document.body.classList.remove('modal-open');document.body.style.overflow=''")
        # the pattern layer must never take taps: the Add button is what you hit at its own centre
        hit=pg.evaluate("(()=>{const b=document.querySelector('header.top .btn-add'); const r=b.getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return !!e&&(e===b||b.contains(e))})()")
        if not hit: print('FAIL',vw,label,'a tap on the Add button does not land on it'); bad.append(f'{vw} {label} tap-through')
        # sideways scrolling for real: try to push the page sideways
        pg.evaluate("window.scrollTo(200,0)"); sx=pg.evaluate("window.scrollX")
        if sx>0: print('FAIL',vw,label,'page scrolls sideways, scrollX=',sx); bad.append(f'{vw} {label} scrollX')
        if errs: print('PAGE ERRORS',errs[:3])
        ctx.close()
    print('\nBAD COUNT',len(bad)); print('\n'.join(sorted(set(re.sub(r'^\d+ (light|midnight) ','',x) for x in bad))))
    srv.shutdown(); sys.exit(1 if bad else 0)
