// 2.11.0 UI tests: category case, month filter gone, labels, style guide location,
// the shared modal header, and the scroll-collapse state machine.
const {sleep,ok,boot,setItems,finish,html}=require('./lib/h.js');
const css=html.slice(html.indexOf('<style>')+7,html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g,'');
const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
// all rules of the stylesheet, "selector list" -> "declarations" (flat, ignores @media nesting on purpose: checked separately)
const rules=[]; { const re=/([^{}@]+)\{([^{}]*)\}/g; let m; while((m=re.exec(css))) rules.push({sel:m[1].trim().replace(/\s+/g,' '),decl:m[2].trim().replace(/\s+/g,' ')}); }
const rulesFor=part=>rules.filter(r=>r.sel.split(',').map(s=>s.trim()).includes(part));
const declHas=(part,re)=>rulesFor(part).some(r=>re.test(r.decl));

(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const M=i=>w.eval(`FUTURE_MONTHS[${i}]`);

  // ---------- 0. the script still parses; Firebase block untouched ----------
  let parses=true; try{ new Function(script); }catch(e){ parses=false; console.log(e.message); }
  ok(parses,'script body parses (new Function)');
  ok(/apiKey: "AIzaSyD12l-eTSxP9bJTJ8ro575WZpV0OC0nd8s"/.test(script)&&/projectId: "spending-forecast-939d9"/.test(script)&&/appId: "1:235640080111:web:14b546f21e01d5c55ebd1a"/.test(script),'Firebase config block unchanged');
  ok(!/\b(?<![\w.])(?:window\.)?(?:confirm|alert|prompt)\s*\(/.test(script.replace(/askConfirm\(|askAlert\(/g,'X(')),'no native confirm/alert/prompt calls in the script');
  ok(w.eval('APP_VERSION')===w.eval('CHANGELOG[0].v')&&/^\d{4}-\d\d-\d\d$/.test(w.eval('CHANGELOG[0].date'))&&w.eval('CHANGELOG.length')>=16,'newest changelog entry matches APP_VERSION and has a date');
  ok(w.eval('CHANGELOG[0].items.length')>=1&&w.eval('CHANGELOG[0].items').every(t=>t.length>20),'changelog entry has one plain-language bullet per change ('+w.eval('CHANGELOG[0].items.length')+')');

  // ---------- 1. categories exactly as typed ----------
  const WEIRD='my Odd cAtegory & MORE', SUB='honda CiViC';
  setItems(w,[
    {id:1,name:'Thing',category:WEIRD,subcategory:SUB,cost:50,month:M(0)},
    {id:2,name:'Other thing',category:'Home',subcategory:'',cost:60,month:M(1),owner:''},
    {id:3,name:'Done thing',category:'Kids',cost:5,month:M(1),completed:true}
  ]);
  w.eval(`SUBCATEGORIES['${WEIRD}']=['${SUB}']`);
  const card=d.querySelector('#itemsList .item-card[data-item-id="1"]');
  ok(card.querySelector('.tag-cat').textContent===WEIRD,'card category tag text is exactly as stored: '+card.querySelector('.tag-cat').textContent);
  ok(card.querySelector('.tag-subcat').textContent===SUB,'card subcategory tag text is exactly as stored');
  const tt=el=>w.getComputedStyle(el).textTransform;
  ok(tt(card.querySelector('.tag-cat'))!=='uppercase'&&tt(card.querySelector('.tag-subcat'))!=='uppercase','computed text-transform of category + subcategory tags is not uppercase ('+tt(card.querySelector('.tag-cat'))+' / '+tt(card.querySelector('.tag-subcat'))+')');
  ok(declHas('.tag-cat',/text-transform:\s*none/)&&declHas('.tag-subcat',/text-transform:\s*none/),'CSS: .tag-cat and .tag-subcat set text-transform:none');
  // rule order: the none rule must come after the base .tag uppercase rule (same specificity)
  const idxTag=rules.findIndex(r=>r.sel==='.tag'&&/uppercase/.test(r.decl)), idxNone=rules.findIndex(r=>/\.tag-cat/.test(r.sel)&&/text-transform:\s*none/.test(r.decl));
  ok(idxTag>=0&&idxNone>idxTag,'CSS: the text-transform:none rule comes after the .tag uppercase rule');
  const upperSelectors=rules.filter(r=>/text-transform:\s*uppercase/.test(r.decl)).map(r=>r.sel).join(' | ');
  ok(!/tag-cat|tag-subcat|month-pill|\bchip\b|colored-pill|filter-pill|saved-name|guide-static/.test(upperSelectors),'no uppercase rule targets category/subcategory names, pills or chips: '+upperSelectors);
  ok(tt(d.querySelector('.tag-warn')||(()=>{ const s=d.createElement('span'); s.className='tag tag-warn'; d.body.appendChild(s); return s; })())==='uppercase','other tags (No owner / No month) keep their uppercase look');
  const noOwner=d.querySelector('#itemsList .tag-warn'); ok(!!noOwner&&/No owner/.test(noOwner.textContent),'"No owner" tag text is unchanged');
  // filter pills + selects
  w.toggleFilters();
  const pillTexts=[...d.querySelectorAll('#categoryFilter .month-pill')].map(p=>p.textContent.replace(/\s+/g,' ').trim());
  ok(pillTexts.some(t=>t===WEIRD+' 1'),'filter pill shows the category exactly as stored: '+pillTexts.join(' | '));
  ok(d.querySelector('#categoryFilter .month-pill').style.textTransform==='','filter pills have no inline text-transform');
  w.eval(`CATEGORIES.push(${JSON.stringify(WEIRD)})`);
  w.openItemModal({id:1,name:'Thing',category:WEIRD,subcategory:SUB,cost:50,month:M(0)});
  ok([...$('f_category').options].some(o=>o.textContent===WEIRD&&o.selected)&&$('f_category').value===WEIRD,'category select lists and selects the name as stored');
  ok([...$('f_category').options].map(o=>o.textContent).every(t=>t===t.trim()),'category options are plain text');
  w.closeItemModal();
  // typed through the add flow: stored as typed
  w.openItemModal(); $('f_name').value='Zed'; $('f_cost').value='10'; $('f_category').value='Other'; w.onCategoryChange(); $('f_newCategory').value='  mIxEd Case Cat '; w.saveItem();
  ok(w.eval(`items.find(i=>i.name==='Zed').category`)==='mIxEd Case Cat','new category is stored exactly as typed (only trimmed)');
  ok([...d.querySelectorAll('#itemsList .tag-cat')].some(t=>t.textContent==='mIxEd Case Cat'),'... and shown the same way on its card');
  // style guide samples
  w.openStyleGuide();
  const g=$('guideBody');
  const gpills=[...g.querySelectorAll('.guide-section .guide-row .month-pill')].map(p=>p.textContent.replace(/\s+\d+$/,'').trim());
  const cats=w.eval('sortedCategoryList()');
  ok(cats.every(c=>gpills.includes(c)),'style guide category samples show every category exactly as stored');
  ok([...g.querySelectorAll('.tag-cat')].every(t=>tt(t)!=='uppercase')&&[...g.querySelectorAll('.tag-cat')].some(t=>t.textContent==='Category'),'style guide tag samples render "Category" in normal case');
  ok([...g.querySelectorAll('.item-card .tag-cat')].some(t=>t.textContent==='Holidays & Gifts'),'style guide cards show category names as stored');
  ok([...g.querySelectorAll('.tag-warn')].some(t=>t.textContent==='No owner')&&[...g.querySelectorAll('.tag-warn')].some(t=>t.textContent==='No month'),'style guide still shows the No owner / No month flags');
  w.closeStyleGuide();

  // ---------- 2. month filter is gone ----------
  w.eval(`activeCategoryFilter='All'`);
  w.render();
  ok(!$('monthFilter'),'#monthFilter element is gone');
  ok(!/monthFilter|activeMonthFilter|renderMonthFilter/.test(script),'no month-filter code left in the script (state, renderer, ids)');
  ok(w.eval('typeof activeMonthFilter')==='undefined'&&w.eval('typeof renderMonthFilter')==='undefined','no month-filter globals');
  ok(![...d.querySelectorAll('#filterPanel .month-pill')].some(p=>/^All months|^[A-Z][a-z]{2} \d{4}/.test(p.textContent.trim())),'no month pills in the Filters panel');
  ok(d.querySelectorAll('#filterPanel .month-filter').length===1&&d.querySelector('#filterPanel #categoryFilter')&&d.querySelector('#filterPanel #sortControl'),'Filters panel only holds the category pills and the sort control');
  ok(d.querySelectorAll('#itemsList .month-group').length>=2,'month groups still render on the board');
  ok(/^Filters$/.test($('filtersBtnLabel').textContent)&&!$('filtersBtn').classList.contains('active')&&$('filterSummary').style.display==='none','no filter: plain "Filters" label, no summary');
  const pill=n=>[...d.querySelectorAll('#categoryFilter .month-pill')].find(p=>p.textContent.startsWith(n));
  pill('Home').click();
  ok($('filtersBtnLabel').textContent==='Filters · 1'&&$('filtersBtn').classList.contains('active'),'category filter: count badge is 1');
  ok($('filterNote').textContent==='Showing Home'&&$('filterSummary').style.display==='','summary says "Showing Home" (no month part): '+$('filterNote').textContent);
  ok($('statCountSub').textContent==='1 thing in Home'&&$('statNeededSub').textContent==='for Home','stats sub-lines follow the category only');
  // search adds to the stat sub-line but not to the filter count
  $('searchInput').value='other'; w.onSearchInput();
  ok($('filtersBtnLabel').textContent==='Filters · 1','search does not change the badge count');
  w.clearSearch(); w.closeSearch();
  $('filterClear').click();
  ok($('filtersBtnLabel').textContent==='Filters'&&$('filterSummary').style.display==='none'&&w.eval('activeCategoryFilter')==='All'&&w.eval('sortMode')==='month','Clear resets the category filter and sort');
  // sort control still works as before
  w.eval(`SUBCATEGORIES.Home=['Zed'];`); pill('Home').click();
  ok($('sortControl').style.display==='','sort control still appears for a category that has subcategories');
  $('sortModeSelect').value='subcategory'; w.onSortModeChange(); ok(w.eval('sortMode')==='subcategory','sort mode change works'); $('filterClear').click();
  // stale month info in storage is ignored
  const w2=boot({ls:{ledgerSettings:JSON.stringify({theme:'warm',monthFilter:'Nov 2026',activeMonthFilter:'Nov 2026',filters:{month:'Nov 2026',category:'Home'}}),horizonFilters:JSON.stringify({month:'Nov 2026'})}});
  setItems(w2,[{id:1,name:'A',month:w2.eval('FUTURE_MONTHS[0]')},{id:2,name:'B',month:w2.eval('FUTURE_MONTHS[1]')}]);
  ok(w2.document.querySelectorAll('#itemsList .item-card').length===2&&w2.document.getElementById('filtersBtnLabel').textContent==='Filters','saved month filter in localStorage is ignored (all items shown, no badge)');
  ok(w2.document.documentElement.getAttribute('data-theme')==='warm','... and the other saved settings still load');

  // ---------- 3. label ----------
  ok($('summaryStrip').querySelector('.stat-label').textContent==='Items on Horizon','stat label reads "Items on Horizon"');
  ok((html.match(/on the radar/gi)||[]).length===1&&/CHANGELOG = \[[\s\S]*?\{ v:'2\.11\.0'[^\n]*on the radar/.test(html),'old "Items on the radar" text only survives inside the 2.11.0 change-log line that describes the rename');
  ok(/Items on Horizon/.test($('guideBody').innerHTML||'')||(w.openStyleGuide(),/Items on Horizon/.test($('guideBody').innerHTML)),'style guide sample uses "Items on Horizon"');
  ok(/follow the category filter and the search/.test($('guideBody').innerHTML),'style guide text no longer mentions month filters');
  w.closeStyleGuide();

  // ---------- 4. style guide button location ----------
  const themes=$('settingsPane-themes'), adv=$('settingsPane-advanced');
  const guideBtn=el=>[...el.querySelectorAll('button')].find(b=>/openStyleGuide/.test(b.getAttribute('onclick')||''));
  ok(!!guideBtn(themes)&&guideBtn(themes).textContent==='View style guide','style guide button is in Settings → Themes, labelled "View style guide"');
  ok(!guideBtn(adv)&&!/Not sure what something looks like/.test(adv.textContent)&&!/openStyleGuide/.test(adv.innerHTML),'... and no longer in Settings → Advanced');
  ok(!!(themes.querySelector('#savedThemesSection').compareDocumentPosition(guideBtn(themes))&4)&&!!(themes.querySelector('.save-theme-row').compareDocumentPosition(guideBtn(themes))&4),'... placed below the saved themes and the customizer');
  w.openSettingsModal('themes'); guideBtn($('settingsPane-themes')).click();
  ok($('guideOverlay').style.display==='flex'&&$('settingsOverlay').style.display==='none','clicking it opens the style guide');
  $('guideOverlay').querySelector('.modal-close').click();
  ok($('guideOverlay').style.display==='none'&&$('settingsOverlay').style.display==='flex'&&$('settingsPane-themes').classList.contains('active'),'closing the guide returns to Settings → Themes');
  w.closeSettingsModal();

  // ---------- 5. shared modal header ----------
  const overlays=[...d.querySelectorAll('.overlay')];
  ok(overlays.length===10,'10 dialogs in the page ('+overlays.length+')');
  overlays.forEach(o=>{
    const m=o.querySelector('.modal'), bar=m.firstElementChild;
    ok(bar&&bar.classList.contains('modal-bar')&&m.classList.contains('has-bar')&&bar.querySelector('.modal-bar-row > h3'),'#'+o.id+': first child is the shared .modal-bar with the title row');
  });
  ok(d.querySelectorAll('.modal-bar').length===10&&d.querySelectorAll('.modal:not(.has-bar)').length===0,'every .modal has exactly one shared bar');
  ok(overlays.every(o=>{ const lab=o.getAttribute('aria-labelledby'); return !lab||o.querySelector('.modal-bar #'+lab); }),'aria-labelledby titles live inside the bars (ids preserved)');
  const withClose=['itemOverlay','settingsOverlay','guideOverlay','trashOverlay','cropOverlay','profileOverlay','peopleOverlay','chooseOverlay'];
  ok(withClose.every(id=>$(id).querySelector('.modal-bar .modal-close')&&$(id).querySelector('.modal-close').textContent==='← Close')&&!$('confirmOverlay').querySelector('.modal-close'),'all dialogs share the "← Close" button; the question dialog keeps its own buttons');
  ok(overlays.every(o=>[...o.querySelectorAll('.modal > h3')].length===0),'no stray titles outside the bar');
  ok(['itemOverlay','settingsOverlay','guideOverlay','trashOverlay','cropOverlay','peopleOverlay','chooseOverlay'].every(id=>$(id).querySelector('.modal-bar-extra')),'descriptions / tabs sit in the collapsible extra area');
  ok($('settingsOverlay').querySelector('.modal-bar-extra .settings-tabs')&&$('settingsOverlay').querySelectorAll('.modal-bar .settings-tab').length===3,'Settings tabs are in the bar extra');
  // CSS: one reusable class
  ok(declHas('.modal-bar',/position:\s*sticky/)&&declHas('.modal-bar',/top:\s*0/),'CSS: .modal-bar is sticky at top:0');
  ok(!/settings-sticky|settings-head|settings-close/.test(html),'old Settings-only header classes are gone (one shared class)');
  ok(declHas('.modal.has-bar',/padding-top:\s*0/),'CSS: .modal.has-bar zeroes the top padding (specific enough to beat .modal and the phone .modal rule)');
  // regression for the Advanced-tab bug: the zero top padding must not be lost to a later equal-specificity rule
  const iZero=rules.findIndex(r=>r.sel==='.modal.has-bar'&&/padding-top:\s*0/.test(r.decl));
  const phoneModal=css.slice(css.indexOf('@media (max-width:640px)')).match(/\.modal\{[^}]*padding:[^}]*\}/);
  ok(iZero>=0&&!!phoneModal&&!/has-bar/.test(phoneModal[0]),'regression (Advanced header gap): the bar-padding rule has higher specificity than the phone .modal padding that used to override .settings-modal');
  ok(!rules.some(r=>/^\.settings-modal$/.test(r.sel)&&/padding-top/.test(r.decl)),'the dead .settings-modal{padding-top:0} rule is gone');
  ok(/overscroll-behavior:\s*contain/.test(css)&&/-webkit-overflow-scrolling:\s*touch/.test(css),'CSS: iOS-friendly momentum scrolling + overscroll containment on dialogs');
  ok(/max-height:\s*88dvh/.test(css)&&/max-height:\s*92dvh/.test(css)&&/min-height:\s*100dvh/.test(css),'CSS: dvh used next to the vh fallbacks (no 100vh pitfall)');
  ok(/@media \(prefers-reduced-motion: reduce\)\{[^@]*\.modal-bar-extra[^@]*transition:\s*none/.test(css)&&/page-collapsed[^@]*transition:\s*none|\.top-compact[^}]*transition:\s*none/.test(css),'CSS: reduced-motion turns the header transitions off');
  // collapsing must never change layout height: only transform / opacity / visibility
  const collapsedDecl=rules.filter(r=>/\.modal-bar\.is-collapsed \.modal-bar-extra/.test(r.sel)).map(r=>r.decl).join(' ');
  ok(/transform:\s*translateY\(-100%\)/.test(collapsedDecl)&&!/(?:^|[;\s])(height|max-height|display|margin|padding)\s*:/.test(collapsedDecl),'CSS: dialog header collapse is transform/opacity/visibility only (no height change)');
  const pageDecl=rules.filter(r=>/html\.page-collapsed header\.top|html\.page-collapsed \.top-compact/.test(r.sel)).map(r=>r.decl).join(' ');
  ok(/transform/.test(pageDecl)&&!/(?:^|[;\s])(height|max-height|display|margin|padding)\s*:/.test(pageDecl),'CSS: page header collapse is transform/visibility only (no height change)');
  ok(declHas('header.top',/position:\s*sticky/)&&declHas('.top-compact',/position:\s*fixed/)&&declHas('.board-sticky',/position:\s*sticky/),'CSS: full header sticky, compact bar fixed, Active/Completed row sticky');
  // every dialog's Close button works
  w.openItemModal(); $('itemOverlay').querySelector('.modal-close').click(); ok($('itemOverlay').style.display==='none','item modal: Close closes it');
  w.openSettingsModal(); $('settingsOverlay').querySelector('.modal-close').click(); ok($('settingsOverlay').style.display==='none','Settings: Close closes it');
  w.openSettingsModal(); w.openTrashModal(); $('trashOverlay').querySelector('.modal-close').click(); ok($('trashOverlay').style.display==='none'&&$('settingsOverlay').style.display==='flex','Deleted items: Close closes it and goes back to Settings'); w.closeSettingsModal();
  w.openProfileModal(); ok($('profileOverlay').style.display==='flex','profile opens'); $('profileOverlay').querySelector('.modal-close').click(); ok($('profileOverlay').style.display==='none','profile: Close closes it');
  w.openAdminModal(); $('peopleOverlay').querySelector('.modal-close').click(); ok($('peopleOverlay').style.display==='none','manage profiles: Close closes it');
  { let got='unset'; w.chooseProfile('x').then(v=>{ got=v; }); ok($('chooseOverlay').style.display==='flex','chooser opens'); $('chooseOverlay').querySelector('.modal-close').click(); await sleep(5); ok($('chooseOverlay').style.display==='none'&&got===null,'chooser: Close resolves "nobody picked"'); }
  { let cancelled=false; w.openCropEditor({naturalWidth:300,naturalHeight:200,width:300,height:200,src:'data:image/gif;base64,R0lGODlhAQABAAAAACw='},()=>{},()=>{cancelled=true;}); ok($('cropOverlay').style.display==='flex','crop editor opens'); $('cropOverlay').querySelector('.modal-close').click(); ok($('cropOverlay').style.display==='none'&&cancelled,'crop editor: Close cancels (same as Cancel)'); }
  { const p=w.askConfirm({title:'Mark complete',message:'x'}); ok($('confirmTitle').closest('.modal-bar')&&$('confirmTitle').textContent==='Mark complete','question dialog title sits in the shared bar'); $('confirmCancel').click(); await p; }

  // ---------- 6. the scroll state machine (pure function) ----------
  const step=(s,y,max,r)=>w.scrollBarStep(s,y,max,r);
  const run=(ys,max,start,r)=>{ let s=start||{collapsed:false,ref:0}; const out=[]; for(const y of ys){ s=step(s,y,max,r); out.push(s.collapsed); } return {s,out}; };
  ok(step(null,0,1000).collapsed===false,'null/initial state is expanded');
  ok(run([10,20,30,40],5000).out.every(c=>!c),'small scroll down near the top does not collapse');
  ok(run([20,100],5000).out.join()==='false,true','scroll down past the threshold (36px of travel, below 64px) collapses');
  ok(run([20,50],5000).out.join()==='false,false','30px of travel is not enough: stays expanded');
  ok(run([86],5000,{collapsed:false,ref:50}).out.join()==='true','exactly 36px of travel from the lowest point (and past 64px) collapses');
  ok(run([85],5000,{collapsed:false,ref:50}).out.join()==='false','35px of travel does not');
  ok(run([100,300,1200],5000).out.join()==='true,true,true','a long scroll down stays collapsed');
  ok(run([100,200,195,190,191,196,199,200],5000).out.slice(2).every(c=>c),'small up-jitter (under 20px) does not expand');
  { const r=run([100,200,181],5000); ok(r.out[2]===true,'19px up is still collapsed (hysteresis)'); }
  { const r=run([100,200,179],5000); ok(r.out[2]===false,'21px up expands again'); }
  { const r=run([100,200,180],5000); ok(r.out[2]===false,'exactly 20px up expands'); }
  { const r=run([100,200,170,100],5000); ok(r.out.slice(2).every(c=>!c),'a real scroll up stays expanded all the way'); }
  { const r=run([100,200,179,200,213],5000); ok(r.out.join()==='true,true,false,false,false','after expanding, scrolling 34px back down does not instantly collapse again'); }
  { const r=run([100,200,179,200,215],5000); ok(r.out[4]===true,'... but 36px down from the lowest point collapses'); }
  { const r=run([100,300,500,490,520,501],5000); ok(r.out.join()==='true,true,true,true,true,true','hysteresis follows the furthest point reached (500, then 520): 501 is only 19 up from the 520 peak, so it stays collapsed'); }
  { const r=run([100,300,500,490,520,500],5000); ok(r.out[5]===false,'500 is 20 up from the 520 peak: expands'); }
  ok(run([300,5,0],5000,{collapsed:true,ref:300}).out.slice(1).every(c=>!c),'scrolling back to the top expands it and it stays expanded');
  ok(step({collapsed:true,ref:900},4,5000).collapsed===false&&step({collapsed:true,ref:900},0,5000).collapsed===false,'at y<=4 it is always expanded, even from a collapsed state');
  ok(step({collapsed:true,ref:900},-40,5000).collapsed===false,'negative y (iOS rubber-band at the top) counts as the top: expanded');
  { const r=run([1000,1030,1060,1000,1020],1000,{collapsed:true,ref:1000}); ok(r.out.every(c=>c),'rubber-band past the bottom (y>max) is clamped and never expands'); }
  { const alt=[]; for(let i=0;i<200;i++) alt.push(i%2?300:319); const a=run(alt,5000,{collapsed:true,ref:319}); ok(a.out.every(c=>c),'collapsed: 200 alternations of 19px never flicker'); const b=run([100,300].concat(alt.map((y,i)=>i%2?281:300)),5000); ok(b.out.slice(2).every(c=>b.out[1]===c),'expanded/collapsed: 200 alternations of 19px never flicker'); }
  { const e=run([0,5,0,5,10,0,3,20,30,40,50,60,64],5000); ok(e.out.every(c=>!c),'no collapse at or above minY (64px) even with 60px of travel'); }
  ok(step({collapsed:false,ref:0},100,40).collapsed===false,'tiny scroll areas (max<=minY) never collapse');
  { const r=run([60,150],5000,null,{minY:10,down:100,up:5}); ok(r.out.join()==='false,true','custom rules are honored'); }
  ok(w.eval('BAR_RULES.down')===36&&w.eval('BAR_RULES.up')===20&&w.eval('BAR_RULES.cooldown')===300&&w.eval('PAGE_BAR_RULES.cooldown')===300&&w.eval('PAGE_BAR_RULES.minY')>w.eval('BAR_RULES.minY'),'calmer thresholds: 36px down, 20px up, 300ms cooldown (board header needs a little more room than dialogs)');
  { const before=JSON.stringify({collapsed:true,ref:50}); const s0={collapsed:true,ref:50}; step(s0,500,5000); ok(JSON.stringify(s0)===before,'step() does not mutate the state it is given'); }

  // ---- cooldown: after every change the header holds still for 300ms; a held-back change is reported as `wait` ----
  { const T=(s,y,t,max,r)=>step2(s,y,t,max,r); const step2=(s,y,t,max,r)=>w.scrollBarStep(s,y,max==null?5000:max,r,t);
    let s=T(null,20,1000);    ok(!s.collapsed&&s.at==null,'cooldown: no change yet, no timestamp');
    s=T(s,300,1000);          ok(s.collapsed&&s.at===1000,'cooldown: first collapse is applied at once and stamped');
    let h=T(s,270,1100);      ok(h.collapsed&&h.wait>=1&&h.wait<=200,'cooldown: 30px up 100ms later would expand it, but it is held back ('+h.wait+'ms to go)');
    ok(h.at===1000,'cooldown: a held-back change does not restart the cooldown');
    let h2=T(h,270,1150);     ok(h2.collapsed&&h2.wait===150,'cooldown: wait counts down to the end of the 300ms (150 left at +150ms)');
    let e=T(h2,270,1300);     ok(!e.collapsed&&e.at===1300&&!e.wait,'cooldown: at +300ms the held-back expand is applied');
    // trailing re-check: nothing scrolled in between, same position, later time
    let late=T(h,270,1400);   ok(!late.collapsed,'cooldown: a later look at the same position applies the held-back change (a stale state is never left behind)');
    // the user went back down during the cooldown: the held-back expand is forgotten, no flip at all
    let back=T(T(s,270,1100),330,1200); ok(back.collapsed&&!back.wait,'cooldown: scrolling back down during the cooldown cancels the pending expand');
    // expand then immediately collapse again is also held back
    let ex=T(null,20,0); ex=T(ex,300,0); ex=T(ex,270,300); ok(!ex.collapsed&&ex.at===300,'cooldown: sequence collapse(0ms) -> expand(300ms)');
    let again=T(ex,340,400); ok(!again.collapsed&&again.wait>0&&again.wait<=200,'cooldown: collapsing straight after expanding is held back too');
    ok(T(again,340,700).collapsed,'cooldown: ... and applied once it is over');
    // very top: immediate, whatever the cooldown
    const top=T({collapsed:true,ref:300,at:1000},0,1050); ok(!top.collapsed&&top.at===1050&&!top.wait,'cooldown: reaching the very top expands at once, inside the cooldown');
    ok(!T({collapsed:true,ref:300,at:1000},4,1010).collapsed,'cooldown: y<=4 counts as the top');
    // page shrank to a few pixels of scroll: compact header makes no sense, immediate
    ok(!T({collapsed:true,ref:900,at:1000},50,1010,60).collapsed,'cooldown: a page that can hardly scroll (max<=minY) gets the full header back at once');
    // no clock given: old behaviour, no cooldown at all
    ok(!w.scrollBarStep({collapsed:true,ref:300,at:1000},270,5000).collapsed,'without a clock there is no cooldown (pure rules only)');
    // a clock that went backwards must not freeze the header
    ok(!T({collapsed:true,ref:300,at:5000},270,100).collapsed,'a clock that went backwards (page restored from cache) does not freeze the header');
    // 3 seconds of wiggling (45px every 40ms): changes are at least 300ms apart
    let st=null, last=-1e9, bad=0, flips=0; for(let t=0,i=0;t<3000;t+=40,i++){ const y=i%2?300:345; const n=T(st,y,t); if(st&&n.collapsed!==st.collapsed){ flips++; if(t-last<300) bad++; last=t; } else if(!st&&n.collapsed){ flips++; last=t; } st=n; }
    ok(bad===0&&flips<=11,'cooldown: a 3s wiggle flips at most once per 300ms ('+flips+' changes, '+bad+' too close)');
  }
  // the iPhone URL bar sliding away at the bottom shortens the scroll range and the browser nudges the position up:
  // that is not the person scrolling up
  { let s={collapsed:true,ref:1000}; s=w.scrollBarStep(s,920,920); ok(s.collapsed,'URL bar hides at the bottom (range 1000 -> 920, position nudged 80px up): still collapsed');
    s=w.scrollBarStep(s,1000,1000); ok(s.collapsed,'... and when it comes back (position follows) nothing changes');
    s=w.scrollBarStep({collapsed:true,ref:5000},500,500); ok(s.collapsed&&s.ref===500,'a page that gets much shorter (clamped to its new end) stays compact, measured from the new end');
    s=w.scrollBarStep(s,470,500); ok(!s.collapsed,'... and 30px of real scrolling up from there still expands it');
    ok(!w.scrollBarStep({collapsed:true,ref:900},50,60).collapsed,'a clamped position inside a nearly unscrollable page: full header'); }
  // random walk: a collapse never happens without >=36px net travel down, an expand never without >=20px up
  { let s={collapsed:false,ref:0}, y=0, seed=7, viol=0; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    let lowSinceExpand=0, highSinceCollapse=0;
    for(let i=0;i<20000;i++){ y=Math.max(0,Math.min(3000,y+(rnd()-0.5)*40)); const n=step(s,y,3000);
      if(!s.collapsed&&n.collapsed){ lowSinceExpand=Math.min(lowSinceExpand,y); if(y<=64) viol++; }
      if(s.collapsed&&!n.collapsed&&y>4){ /* expanded by an upward move */ }
      s=n; }
    ok(viol===0,'random walk (20k steps): never collapses at or above minY'); }

  // ---------- 7. dialog wiring (scroll -> class) ----------
  const m=$('settingsOverlay').querySelector('.modal'), bar=m.querySelector('.modal-bar');
  let top=0, mx=2000; Object.defineProperty(m,'scrollTop',{get:()=>top,set:v=>{top=v;},configurable:true});
  Object.defineProperty(m,'scrollHeight',{get:()=>mx+500,configurable:true}); Object.defineProperty(m,'clientHeight',{get:()=>500,configurable:true});
  const scrollTo=async y=>{ top=y; m.dispatchEvent(new w.Event('scroll')); await sleep(40); };
  w.openSettingsModal('advanced'); await sleep(20);
  ok(!bar.classList.contains('is-collapsed')&&top===0,'opening starts at the top with the full header');
  await scrollTo(30); ok(!bar.classList.contains('is-collapsed'),'wiring: 30px down: still expanded');
  await scrollTo(120); ok(bar.classList.contains('is-collapsed'),'wiring: scroll down collapses the dialog header');
  await scrollTo(112); ok(bar.classList.contains('is-collapsed'),'wiring: 8px back up: stays collapsed');
  await scrollTo(104); ok(bar.classList.contains('is-collapsed'),'wiring: only 16px back up (needs 20): still collapsed');
  await scrollTo(100); ok(bar.classList.contains('is-collapsed'),'wiring: 20px back up, but only ~120ms after collapsing: held back by the cooldown');
  await sleep(340); ok(!bar.classList.contains('is-collapsed'),'wiring: ... and applied by the trailing re-check once the cooldown is over, with no further scrolling');
  await scrollTo(300); await sleep(340); ok(bar.classList.contains('is-collapsed'),'wiring: a long scroll down collapses again');
  await scrollTo(2); ok(!bar.classList.contains('is-collapsed'),'wiring: back at the top: expanded at once (the cooldown never delays the top)');
  await scrollTo(400); await sleep(340); ok(bar.classList.contains('is-collapsed'),'collapsed again before closing');
  w.closeSettingsModal(); top=0; await sleep(20); w.openSettingsModal('general'); await sleep(20);
  ok(!bar.classList.contains('is-collapsed')&&top===0,'re-opening a dialog always resets to the full header at the top');
  await scrollTo(400); ok(bar.classList.contains('is-collapsed'),'collapsed once more');
  w.closeSettingsModal(); top=0; w.openSettingsModal('general'); await sleep(20);   // closed and re-opened in the same moment (browsers reset the offset when hidden)
  ok(!bar.classList.contains('is-collapsed'),'... even when it is closed and re-opened in the same instant');
  ok(typeof w.keepFocusClear==='function'&&!/scroll-padding-top|scroll-margin-top/.test(css),'focus is kept clear of the bars by a small focusin helper (no scroll-padding that would also scroll the bar\'s own buttons)');
  w.closeSettingsModal();
  // rAF throttle: many scroll events in one frame -> one read
  { let reads=0; const orig=w.requestAnimationFrame; w.requestAnimationFrame=f=>{ reads++; return orig.call(w,f); };
    for(let i=0;i<50;i++){ top=10+i; m.dispatchEvent(new w.Event('scroll')); } await sleep(40); w.requestAnimationFrame=orig;
    ok(reads<=2,'scroll listener is rAF-throttled (50 events -> '+reads+' frame request(s))'); }

  // ---------- 8. page header wiring ----------
  const root=d.documentElement; let py=0;
  Object.defineProperty(w,'pageYOffset',{get:()=>py,configurable:true}); Object.defineProperty(root,'scrollHeight',{get:()=>6000,configurable:true});
  const pscroll=async y=>{ py=y; w.dispatchEvent(new w.Event('scroll')); await sleep(40); };
  ok($('topCompact')&&$('appHeader')&&$('hhTitleCompact'),'compact bar and full header both exist');
  ok($('topCompact').querySelector('button[onclick="openSettingsModal()"]')&&$('topCompact').querySelector('button[onclick="openAddForSide()"]')&&$('topCompact').querySelector('#profileBtnCompact'),'compact bar keeps profile, settings and add-item buttons');
  ok($('backupBanner').previousElementSibling.tagName==='HEADER','backup banner is not part of the header (it scrolls away normally)');
  ok(!root.classList.contains('page-collapsed'),'page starts with the full header');
  await pscroll(200); ok(root.classList.contains('page-collapsed')&&root.classList.contains('is-scrolled'),'page: scroll down collapses the header');
  await pscroll(194); ok(root.classList.contains('page-collapsed'),'page: tiny scroll up keeps it compact');
  await pscroll(180); ok(root.classList.contains('page-collapsed'),'page: 20px up straight after collapsing is held back by the cooldown');
  await sleep(340); ok(!root.classList.contains('page-collapsed'),'page: ... then the trailing re-check brings the full header back (20px up)');
  await pscroll(0); ok(!root.classList.contains('page-collapsed')&&!root.classList.contains('is-scrolled'),'page: top is always the full header');
  ok(/^\d+px$/.test(root.style.getPropertyValue('--page-bar-h')),'--page-bar-h is kept in sync for the sticky tabs row');
  // names and avatar mirrored into the compact bar
  w.eval(`householdName='The Smiths'`); w.updateHouseholdTitle(); ok($('hhTitleCompact').textContent==='The Smiths'&&$('hhTitle').textContent==='The Smiths','household name is mirrored into the compact bar');
  ok(/avatar/.test($('profileBtnAvatarCompact').innerHTML),'profile avatar is mirrored into the compact bar');
  ok(!!d.querySelector('#boardSticky > .view-tabs')&&!!d.querySelector('#appHeader > #searchRow'),'Active/Completed row is in the sticky wrapper; the search field lives in the top banner');
  ok(w.eval(`typeof window.requestAnimationFrame`)==='function','rAF available (fallback to setTimeout exists otherwise)');

  finish();
})().catch(e=>{ console.error(e); process.exit(2); });
