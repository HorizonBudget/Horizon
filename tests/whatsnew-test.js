const {sleep,ok,boot,finish}=require('./lib/h.js');
(async()=>{
  const seenOf=w=>w.localStorage.getItem('horizonSeenVersion');
  const dlg=w=>w.document.getElementById('confirmOverlay').style.display==='flex';
  const toast=w=>w.document.getElementById('toast');
  // 1. first time on a device: silent, remembers version
  let w=boot(); w.eval('checkWhatsNew(false)');
  ok(!dlg(w)&&!toast(w)&&seenOf(w)===w.eval('APP_VERSION'),'fresh sign-in: no notice, version remembered');
  // 2. a small update (same first number) is silent, even with visible changes
  w=boot(); w.eval("localStorage.setItem('horizonSeenVersion',CHANGELOG[1].v); CHANGELOG[0].ui=['This visible change is new.']; checkWhatsNew(false)");
  ok(!dlg(w)&&!toast(w)&&seenOf(w)===w.eval('APP_VERSION'),'small update (same first number): no notice, no toast, version remembered');
  // 3. a big update (first number went up) with a visible change -> dialog with bullets
  w=boot(); w.eval("localStorage.setItem('horizonSeenVersion','2.12.0'); CHANGELOG[0].ui=['This visible change is new.']; checkWhatsNew(false)");
  const msg=w.document.getElementById('confirmMsg').textContent;
  ok(dlg(w)&&/^Horizon just got a little brighter!$/.test(w.document.getElementById('confirmTitle').textContent)&&/^• /.test(msg)&&/visible change is new/.test(msg),'UI change shows a notice with bullet lines');
  ok(w.document.getElementById('confirmCancel').style.display==='none'&&w.document.getElementById('confirmOk').textContent==='Got it','single "Got it" button');
  ok(w.getComputedStyle(w.document.getElementById('confirmMsg')).whiteSpace==='pre-line','message keeps line breaks');
  ok(!toast(w)&&seenOf(w)===w.eval('APP_VERSION'),'no toast and version remembered');
  w.document.getElementById('confirmOk').click(); await sleep(20);
  w.eval('checkWhatsNew(false)'); ok(!dlg(w),'same version again: nothing shown');
  // 3b. big update where no release since had visible changes -> just a small toast
  w=boot(); w.eval("localStorage.setItem('horizonSeenVersion','2.12.0'); CHANGELOG.forEach(c=>{ if(versionCmp(c.v,'2.12.0')>0) delete c.ui; }); checkWhatsNew(false)");
  ok(!dlg(w)&&!!toast(w)&&/little brighter/.test(toast(w).textContent)&&!w.document.getElementById('toastUndo'),'background-only: small "updated" toast, no dialog, no Undo');
  ok(toast(w).textContent.length<45,'toast is short: '+toast(w).textContent);
  // 4. skipped several versions: lines from every release with ui, none from ones without
  w=boot({ls:{horizonSeenVersion:'2.9.0'}}); w.eval("CHANGELOG.find(c=>c.v==='2.10.0').ui=['Install it like an app.']; CHANGELOG[0].ui=['This visible change is new.']; checkWhatsNew(false)");
  const m4=w.document.getElementById('confirmMsg').textContent;
  const expect=w.eval("CHANGELOG.filter(c=>versionCmp(c.v,'2.9.0')>0).reduce((n,c)=>n+(c.ui||[]).length,0)");
  ok(/Install it like an app/.test(m4)&&/visible change is new/.test(m4)&&m4.split('\n').length===expect&&expect>=2,'skipped releases combine their lines ('+m4.split('\n').length+' of '+expect+')');
  // 5. already-signed-in device from before this feature (resume, nothing stored)
  w=boot(); w.eval("CHANGELOG[0].ui=['This visible change is new.']; checkWhatsNew(true)");
  ok(dlg(w)&&seenOf(w)===w.eval('APP_VERSION'),'resumed device with nothing stored is treated as coming from 2.11.0');
  // 6. seen is newer than the app (rollback) -> silent
  w=boot({ls:{horizonSeenVersion:'9.0.0'}}); w.eval('checkWhatsNew(false)');
  ok(!dlg(w)&&!toast(w)&&seenOf(w)==='9.0.0','newer remembered version: silent, untouched');
  // 7. storage blocked -> no crash, no notice
  w=boot({noStorage:true}); let threw=false; try{ w.eval('checkWhatsNew(false); checkWhatsNew(true)'); }catch(e){ threw=true; }
  ok(!threw,'blocked storage does not throw');
  // 8. changelog data sanity
  const bad=w.eval("CHANGELOG.filter(c=>c.ui!==undefined&&(!Array.isArray(c.ui)||c.ui.length===0||c.ui.some(t=>typeof t!=='string'||!t.trim()))).map(c=>c.v)");
  ok(bad.length===0,'every ui field is a non-empty list of strings');
  ok(w.eval("CHANGELOG[0].v")===w.eval('APP_VERSION'),'newest changelog entry matches APP_VERSION');
  ok(w.eval("versionCmp('2.10.0','2.9.0')>0&&versionCmp('2.9.0','2.10.0')<0&&versionCmp('3.0.0','2.12.0')>0&&versionCmp('2.12.0','2.12.0')===0"),'version compare is numeric (2.10 > 2.9)');
  // 9. wired into sign-in
  ok(/checkWhatsNew\(!!resume\)/.test(require('./lib/build-app').buildApp()),'enterApp calls the check');
  finish();
})();
