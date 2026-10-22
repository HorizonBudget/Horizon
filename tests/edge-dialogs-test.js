// Edge cases for scrolling and dialogs (3.5.x sweep): sticky headers, the scroll lock behind dialogs, the iPhone
// keyboard fit, askConfirm, toasts, Settings (General / Advanced), the version list, the update notice and the backup
// reminder. Odd inputs (bad stored values, blocked storage), dialogs stacked on dialogs, and things arriving at awkward
// moments. The real-browser look (short screens, long dialogs, sideways scroll) is in sticky-audit.py / overflow-audit.py.
const {sleep,ok,boot,finish}=require('./lib/h.js');
const DAY=86400000;
const $=(w,id)=>w.document.getElementById(id);
const open=(w,id)=>$(w,id).style.display==='flex';
const locked=w=>w.document.documentElement.classList.contains('dialog-open');
const kbOpen=w=>w.document.documentElement.classList.contains('kb-open');
const key=(w,k,target)=>{ const e=new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}); (target||w.document.body).dispatchEvent(e); return e; };
// a window whose page scroll position and height we control (jsdom does no layout)
function scrollable(w,state){
  Object.defineProperty(w,'pageYOffset',{get:()=>state.y,configurable:true});
  Object.defineProperty(w,'innerHeight',{get:()=>state.h,configurable:true});
  Object.defineProperty(w.HTMLHtmlElement.prototype,'scrollHeight',{get:()=>state.sh,configurable:true});
  w.scrollTo=(x,y)=>{ state.y=Math.max(0,Math.min(y,state.sh-state.h)); };
  w.scrollBy=(x,y)=>{ w.scrollTo(0,state.y+y); };
}
function withKeyboard(state){
  return w=>{
    Object.defineProperty(w,'innerHeight',{get:()=>state.h,configurable:true});
    const vv=new w.EventTarget(); Object.assign(vv,{height:state.h,width:390,offsetTop:0,offsetLeft:0,scale:1});
    Object.defineProperty(w,'visualViewport',{value:vv,configurable:true});
    state.vv=vv; w.scrollTo=()=>{};
  };
}
(async()=>{
  // ================= 1. sticky header rules (pure) =================
  let w=boot(); const step=(s,y,max,r,now)=>w.scrollBarStep(s,y,max,r,now);
  const down={collapsed:true,ref:900,at:null};
  ok(!step(down,NaN,2000).collapsed && !step(down,undefined,2000).collapsed,'a missing / NaN scroll position counts as the top: full header');
  ok(!step(down,-60,2000).collapsed,'rubber-banding above the top (negative position): full header');
  ok(step({collapsed:true,ref:1500},1600,1500).collapsed,'bouncing past the bottom is clamped: not mistaken for scrolling up');
  ok(!step(down,90,90,w.eval('PAGE_BAR_RULES')).collapsed,'the page got short (collapsed every month): a compact header expands again');
  ok(!step({collapsed:false,ref:0},500,-200).collapsed,'content shorter than the screen (negative max): never compact');
  const back=step({collapsed:false,ref:100,at:5000},400,2000,null,4000);
  ok(back.collapsed && !back.wait,'a clock that jumped backwards does not freeze the header (no endless cooldown)');
  ok(!step(null,0,2000).collapsed && typeof step(undefined,500,2000).collapsed==='boolean','no previous state: no error, starts from the top');
  const r1=step({collapsed:false,ref:0},50,2000,{minY:20});
  ok(r1.collapsed,'partial rules are merged with the defaults (minY 20, down 36 kept)');

  // ================= 2. page header + dialog header, wired =================
  let ps={y:0,h:700,sh:5000};
  w=boot({hook:x=>scrollable(x,ps)}); await sleep(30);
  const html=w.document.documentElement;
  const scrollTo=async y=>{ ps.y=y; w.dispatchEvent(new w.Event('scroll')); await sleep(40); };
  await scrollTo(200); await scrollTo(800); await sleep(350);
  ok(html.classList.contains('page-collapsed'),'board header: scrolling down collapses it');
  ps.sh=760; await scrollTo(60);
  ok(!html.classList.contains('page-collapsed'),'collapse all months while scrolled: the page gets short and the full header comes back');
  ps.sh=5000; await scrollTo(1500); await sleep(350);
  ok(html.classList.contains('page-collapsed'),'... and collapses again once the page is long again');
  ps.h=400; w.dispatchEvent(new w.Event('resize')); await sleep(40); await scrollTo(1495);
  ok(html.classList.contains('page-collapsed'),'resize / rotate while scrolled, then a 5px jitter: header state unchanged');
  // dialog header: scrolled + compact, closed, reopened -> top and full header
  w.openSettingsModal(); await sleep(10);
  const sm=$(w,'settingsOverlay').querySelector('.modal'), bar=sm.querySelector('.modal-bar');
  let mt=0; Object.defineProperty(sm,'scrollTop',{get:()=>mt,set:v=>{ mt=Math.max(0,v); },configurable:true});
  Object.defineProperty(sm,'scrollHeight',{get:()=>3000,configurable:true}); Object.defineProperty(sm,'clientHeight',{get:()=>600,configurable:true});
  const mscroll=async y=>{ mt=y; sm.dispatchEvent(new w.Event('scroll')); await sleep(40); };
  await mscroll(100); await mscroll(600); await sleep(350);
  ok(bar.classList.contains('is-collapsed'),'Settings header: scrolling down tucks the tabs away');
  w.closeSettingsModal(); await sleep(10); w.openSettingsModal(); await sleep(10);
  ok(mt===0 && !bar.classList.contains('is-collapsed'),'closed while compact, reopened: back at the top with the full header');
  await mscroll(100); await mscroll(600); await sleep(350);
  w.closeSettingsModal(); w.openSettingsModal(); await sleep(10);
  ok(mt===0 && !bar.classList.contains('is-collapsed'),'closed and reopened in the same moment: still a fresh start');
  w.closeSettingsModal(); await sleep(10);

  // ================= 3. scroll lock with stacked dialogs =================
  ps={y:700,h:700,sh:5000};
  w=boot({hook:x=>scrollable(x,ps)}); await sleep(30);
  $(w,'itemOverlay').style.display='flex'; await sleep(5);
  let p=w.askConfirm({title:'Remove?'}); await sleep(5);
  ok(locked(w) && open(w,'confirmOverlay'),'a question over the item dialog: page locked');
  const esc=key(w,'Escape'); await sleep(5);
  ok(!open(w,'confirmOverlay') && open(w,'itemOverlay') && locked(w),'Escape closes only the question; the item dialog and the lock stay');
  ok(await p===false,'... and the question answers "no"');
  ok(esc.defaultPrevented===false,'(Escape is not blocked for the browser)');
  $(w,'itemOverlay').style.display='none'; await sleep(5);
  ok(!locked(w) && ps.y===700,'closing the last dialog unlocks and the board is where it was (700px)');
  let seen=0; const count=()=>seen++; w.document.addEventListener('keydown',count);
  key(w,'Escape'); ok(seen===1,'Escape with no question open is passed on to the rest of the app');
  w.document.removeEventListener('keydown',count);
  $(w,'trashOverlay').style.display='flex'; $(w,'trashOverlay').style.display='none'; await sleep(5);
  ok(!locked(w),'a dialog opened and closed in the same moment leaves no lock behind');
  w.openSettingsModal(); await sleep(5); ps.y=1200; w.dispatchEvent(new w.Event('scroll')); await sleep(5);
  ok(ps.y===700,'the board is pinned while Settings is open');
  ps.sh=900; ps.y=200; w.dispatchEvent(new w.Event('scroll')); w.closeSettingsModal(); await sleep(5);
  ok(!locked(w) && ps.y===200,'the page got shorter behind the dialog: unlock lands at the new bottom, no error');

  // ================= 4. iPhone keyboard fit =================
  const ks={h:844}; w=boot({hook:withKeyboard(ks)}); await sleep(30);
  const kb=(h,top)=>{ ks.vv.height=h; ks.vv.offsetTop=top||0; ks.vv.dispatchEvent(new w.Event('resize')); };
  kb(450); ok(!kbOpen(w),'keyboard up with no dialog open (sign-in field): nothing changes');
  kb(844);
  $(w,'itemOverlay').style.display='flex'; await sleep(5); kb(450);
  ok(kbOpen(w) && html.ownerDocument && w.document.documentElement.style.getPropertyValue('--vv-h')==='450px','keyboard up in the item dialog: fitted (450px)');
  p=w.askConfirm({title:'Remove?'}); await sleep(5); $(w,'confirmCancel').click(); await sleep(5);
  ok(kbOpen(w),'a question opened and closed over it: still fitted (item dialog and keyboard still up)');
  ks.h=390; Object.assign(ks.vv,{height:200}); w.dispatchEvent(new w.Event('resize')); await sleep(5);
  ok(w.document.documentElement.style.getPropertyValue('--vv-h')==='200px','phone turned sideways with the keyboard up: the fit follows (200px)');
  ks.h=844; kb(450);
  $(w,'itemOverlay').style.display='none'; await sleep(5);
  ok(!kbOpen(w) && !w.document.documentElement.style.getPropertyValue('--vv-h'),'dialog closed while the keyboard is still up: fit removed, nothing left on <html>');
  $(w,'itemOverlay').style.display='flex'; await sleep(5); kb(450); kb(844);
  ok(!kbOpen(w) && locked(w),'keyboard put away, dialog still open: fit removed, lock kept');
  Object.assign(ks.vv,{scale:2}); kb(420); ok(!kbOpen(w),'pinch-zoomed in: not mistaken for a keyboard');
  Object.assign(ks.vv,{scale:1}); kb(844);
  const f=$(w,'itemOverlay').querySelector('input:not([type=checkbox]):not([type=hidden])');
  f.focus(); $(w,'itemOverlay').style.display='none'; await sleep(5); Object.assign(ks.vv,{height:450}); await sleep(350);
  ok(!kbOpen(w),'the delayed check after tapping a field runs after the dialog closed: no fit, no lock');
  ok(!locked(w),'(lock released)');

  // ================= 5. askConfirm =================
  w=boot(); await sleep(10);
  const opener=w.document.createElement('button'); opener.textContent='x'; w.document.body.appendChild(opener); opener.focus();
  const p1=w.askConfirm({title:'First?'}); const p2=w.askConfirm({title:'Second?'});
  ok(await p1===false && $(w,'confirmTitle').textContent==='Second?','a second question replaces the first, which answers "no"');
  $(w,'confirmOk').click(); ok(await p2===true,'the second question gets its own answer');
  ok(w.document.activeElement===opener,'focus goes back to the button that opened the first question');
  opener.focus(); p=w.askConfirm({title:'Gone?'}); opener.remove(); let threw=false;
  try{ $(w,'confirmOk').click(); }catch(e){ threw=true; }
  ok(!threw && await p===true,'the button that opened it was removed meanwhile: closing still works');
  p=w.askConfirm({}); let n=0; p.then(()=>n++); $(w,'confirmOk').click(); $(w,'confirmOk').click(); await sleep(5);
  ok(n===1,'a double tap on OK answers once');
  w.askConfirm({info:true,message:'note'}); ok($(w,'confirmCancel').style.display==='none','notice: no Cancel');
  w.settleConfirm(true); w.askConfirm({title:'Q'});
  ok($(w,'confirmCancel').style.display==='' && w.document.activeElement===$(w,'confirmCancel') && $(w,'confirmOverlay').dataset.mode==='confirm','a question after a notice: Cancel is back and has focus');
  w.settleConfirm(false);
  w.askConfirm({amount:{label:'Paid'}}); $(w,'confirmAmount').value='-5'; $(w,'confirmOk').click();
  ok(open(w,'confirmOverlay') && /\$0 or more/.test($(w,'confirmAmountError').textContent),'a bad amount keeps the question open with a message');
  w.askConfirm({title:'Next'}); ok(!$(w,'confirmAmountError').textContent && $(w,'confirmAmountWrap').style.display==='none','the next question starts clean (no old error, no amount box)');
  w.settleConfirm(false);
  w.askConfirm({message:'<img src=x onerror="window.__xss=1"><b>bold</b>'}); await sleep(5);
  ok(!w.__xss && !$(w,'confirmMsg').querySelector('b'),'a message with HTML in it is shown as plain text');
  const inside=new w.MouseEvent('mousedown',{bubbles:true}); $(w,'confirmOverlay').querySelector('.modal').dispatchEvent(inside);
  ok(open(w,'confirmOverlay'),'pressing inside the dialog does not close it');
  $(w,'confirmOverlay').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));
  ok(!open(w,'confirmOverlay'),'pressing the dark backdrop closes it');
  const al=w.askAlert('hi'); $(w,'confirmOk').click(); ok(await al===undefined,'askAlert resolves (with nothing) when OK is pressed');
  w.askConfirm({message:Array(80).fill('A long line about something that changed.').join('\n')});
  ok(w.getComputedStyle($(w,'confirmOverlay').querySelector('.modal')).overflowY==='auto','a very long notice scrolls inside the dialog');
  w.settleConfirm(true);
  threw=false; try{ w.settleConfirm(true); w.settleConfirm(false); }catch(e){ threw=true; } ok(!threw,'closing an already closed question does nothing');

  // ================= 6. toasts =================
  w=boot(); await sleep(10);
  const calls=[]; for(let i=0;i<5;i++) w.showToast('Toast '+i,()=>calls.push(i));
  ok($(w,'toastRegion').children.length===1 && $(w,'toast').textContent.startsWith('Toast 4'),'five toasts at once: only the newest shows');
  $(w,'toastUndo').click(); ok(calls.join()==='4' && !$(w,'toast'),'Undo undoes only the newest, once, and the toast goes');
  threw=false; try{ w.runToastUndo(); }catch(e){ threw=true; } ok(!threw && calls.length===1,'a second Undo (double tap) does nothing');
  w.showToast('A'); w.showToast('B',()=>{}); w.showToast('C');
  ok(!$(w,'toastUndo'),'a plain toast after an undo toast has no stale Undo button');
  key(w,'Escape',$(w,'toast')); ok(!$(w,'toast'),'Escape on the toast hides it');
  w.showToast('x',()=>{}); w.askConfirm({title:'Over a toast'}); key(w,'Escape',$(w,'toastUndo'));
  ok(!open(w,'confirmOverlay') && w.document.getElementById('toast'),'Escape with a question open closes the question first, not the toast');
  const reg=$(w,'toastRegion'); reg.remove(); threw=false; try{ w.showToast('no region'); w.hideToast(); }catch(e){ threw=true; } ok(!threw,'no toast area on the page: no crash');

  // ================= 7. update notice =================
  const seenOf=x=>x.localStorage.getItem('horizonSeenVersion');
  const notice=x=>open(x,'confirmOverlay');
  for(const bad of ['abc','', 'undefined','null','NaN','{}','3.x']){
    w=boot({ls:{horizonSeenVersion:bad}}); w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(false)");
    ok(!notice(w) && seenOf(w)===w.eval('APP_VERSION'),'stored version "'+bad+'" (unreadable): treated as a new device, silent');
  }
  w=boot({ls:{horizonSeenVersion:'abc'}}); w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(true)");
  const lines=notice(w)?$(w,'confirmMsg').textContent.split('\n').length:0;
  ok(lines===w.eval("whatsNewSince('2.11.0').reduce((n,c)=>n+(c.ui||[]).length,0)"),'unreadable stored version on a signed-in device: treated like nothing stored ('+lines+' lines, not every line ever)');
  w=boot({ls:{horizonSeenVersion:' 2.12.0 '}}); w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(false)");
  ok(notice(w),'a stored version with spaces around it is still read');
  w=boot({ls:{horizonSeenVersion:'v2.12.0'}}); w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(false)");
  ok(notice(w),'a stored version written as "v2.12.0" is still read');
  ok(w.eval("versionCmp('3.10.0','3.9.0')>0 && versionCmp('10.0.0','9.9.9')>0 && versionCmp('3.5','3.5.0')===0 && versionCmp('3.5.0.1','3.5.0')===0"),'3.10.0 > 3.9.0, 10.0.0 > 9.9.9, 3.5 = 3.5.0');
  w=boot({noStorage:true}); w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(true)");
  ok(!notice(w) && !$(w,'toast'),'storage blocked (private mode): no notice, so it cannot pop up on every single open');
  w=boot({ls:{horizonSeenVersion:'2.12.0'},hook:x=>{ x.Storage.prototype.setItem=()=>{ throw new Error('QuotaExceededError'); }; }});
  w.eval("CHANGELOG[0].ui=['New thing.']; checkWhatsNew(false)");
  ok(!notice(w) && !$(w,'toast'),'storage that can be read but not written (old iPhone private mode, full storage): no notice');
  w=boot({ls:{horizonSeenVersion:'2.12.0'}}); w.eval("CHANGELOG[0].ui=['New thing.']");
  const q=w.askConfirm({title:'Join this household?'}); w.eval('checkWhatsNew(false)'); await sleep(5);
  ok($(w,'confirmTitle').textContent==='Join this household?','the update notice waits while another question is open (it is not cancelled)');
  $(w,'confirmOk').click(); ok(await q===true,'... the question gets the real answer');
  await sleep(5); ok(notice(w) && /New thing/.test($(w,'confirmMsg').textContent),'... and the notice shows right after');
  $(w,'confirmOk').click(); await sleep(5); ok(!notice(w),'... and goes away with "Got it"');
  w=boot({ls:{horizonSeenVersion:'2.12.0'}}); w.eval("CHANGELOG[0].ui=['New thing.']");
  w.openSettingsModal(); w.eval('checkWhatsNew(false)'); await sleep(5);
  ok(notice(w) && open(w,'settingsOverlay'),'notice over an open Settings: both open, notice on top');
  $(w,'confirmOk').click(); await sleep(5); ok(open(w,'settingsOverlay') && locked(w),'... closing it leaves Settings open and the page locked');

  // ================= 8. backup reminder =================
  const age=d=>String(Date.now()-d*DAY);
  w=boot({ls:{lastBackupAt:String(Date.now()+400*DAY)}});
  const t=Number(w.localStorage.getItem('lastBackupAt'));
  ok(Math.abs(t-Date.now())<5000,'a backup date in the future (clock was wrong): the reminder clock restarts today');
  w.updateLastBackupLabel(); ok(!/20[3-9]\d|Invalid/.test($(w,'lastBackupLabel').textContent),'Settings never shows a future backup date: '+$(w,'lastBackupLabel').textContent);
  w=boot({ls:{lastBackupAt:String(Date.now()+3*3600000)}});
  ok(w.localStorage.getItem('lastBackupAt')!==null && Number(w.localStorage.getItem('lastBackupAt'))>Date.now(),'a few hours ahead (time zones): kept as it is');
  w=boot({ls:{lastBackupAt:'99999999999999999999'}}); w.updateLastBackupLabel();
  ok(!/Invalid/.test($(w,'lastBackupLabel').textContent),'a huge stored number: no "Invalid Date"');
  w=boot({ls:{lastBackupAt:'yesterday-ish'}}); ok(Math.abs(Number(w.localStorage.getItem('lastBackupAt'))-Date.now())<5000,'garbage backup date: the clock restarts');
  w=boot({ls:{lastBackupAt:new Date(Date.now()-40*DAY).toISOString()}}); w.render();
  ok(!$(w,'backupBanner').hidden,'an ISO date string is understood (40 days: banner)');
  w=boot({ls:{lastBackupAt:age(45),backupSnoozedUntil:String(Date.now()+365*DAY)}}); w.render();
  ok(!$(w,'backupBanner').hidden,'a snooze that ends a year from now (clock was wrong) does not silence the reminder forever');
  w=boot({ls:{lastBackupAt:age(45),backupSnoozedUntil:String(Date.now()+6*DAY)}}); w.render();
  ok($(w,'backupBanner').hidden,'a normal snooze (6 days left) still works');
  w=boot({noStorage:true}); threw=false; try{ w.render(); w.updateLastBackupLabel(); w.snoozeBackupReminder(); }catch(e){ threw=true; }
  ok(!threw && $(w,'backupBanner').hidden,'storage blocked: no banner, no crash');

  // ================= 9. Settings =================
  w=boot(); w.openSettingsModal('bogus'); await sleep(5);
  ok($(w,'settingsPane-general').classList.contains('active'),'Settings asked for a tab that does not exist: opens on General (not blank)');
  w.closeSettingsModal(); w.openSettingsModal(new w.MouseEvent('click')); ok($(w,'settingsPane-general').classList.contains('active'),'opened from a click: General');
  w.openSettingsModal('advanced'); w.openSettingsModal(); ok($(w,'settingsPane-general').classList.contains('active') && !$(w,'settingsPane-advanced').classList.contains('active'),'opened twice (Advanced, then plain): General only');
  w.closeSettingsModal(); await sleep(5);
  w.toggleOlderVersions(); ok(!$(w,'changelogOlder').hidden,'Show all versions opens the list');
  w.toggleOlderVersions(); w.toggleOlderVersions(); w.closeSettingsModal(); w.openSettingsModal(); await sleep(5);
  ok($(w,'changelogOlder').hidden && /Show all/.test($(w,'changelogToggle').textContent),'reopening Settings folds the old versions away again');
  w.closeSettingsModal();
  w.eval("household={name:'',code:''}"); threw=false; try{ w.openSettingsModal(); }catch(e){ threw=true; }
  ok(!threw && $(w,'sharingSection').style.display==='none','signed out: Settings opens, sharing section hidden');
  w=boot({noStorage:true}); threw=false; try{ w.openSettingsModal(); w.showSettingsTab('advanced'); w.closeSettingsModal(); }catch(e){ threw=true; }
  ok(!threw,'storage blocked: Settings opens and closes');
  for(const bad of ['{not json','null','[]','"text"','{"theme":42,"pattern":"x","savedThemes":{}}']){
    w=boot({ls:{ledgerSettings:bad}}); threw=false; try{ w.openSettingsModal(); w.showSettingsTab('advanced'); }catch(e){ threw=true; }
    ok(!threw && open(w,'settingsOverlay'),'saved settings '+JSON.stringify(bad)+': app starts and Settings opens');
  }
  finish();
})();
