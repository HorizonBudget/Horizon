// Edge cases for backups (export / restore) and the backup reminder. Never touches real Firebase.
const {JSDOM}=require('jsdom');
const html=require('./lib/build-app').buildApp();
let store={}, listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
let lastBlob=null;
function boot(ls){
  const errs=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory;
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    w.URL.createObjectURL=b=>{ lastBlob=b; return 'blob:x'; }; w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){};   // no real download in jsdom
    w.addEventListener('error',e=>errs.push(e.message));
    if(ls) for(const k in ls) w.localStorage.setItem(k,ls[k]);
  }});
  dom.window.__errs=errs;
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const $=(w,id)=>w.document.getElementById(id);
// Measures the longest stretch the page could not respond (a 5 ms ticker that runs late); call the result to stop.
function freezeWatch(){
  let last=Date.now(), worst=0;
  const iv=setInterval(()=>{ const n=Date.now(); worst=Math.max(worst,n-last); last=n; },5);
  return ()=>{ clearInterval(iv); return Math.max(worst,Date.now()-last); };
}
const dialogOpen=w=>$(w,'confirmOverlay').style.display==='flex';
// Picks a backup file. answer: true = Replace board, false = Cancel, null = leave the question open.
async function restore(w,content,answer){
  const txt=typeof content==='string'?content:JSON.stringify(content);
  w.onRestoreFileChosen({files:[new w.File([txt],'backup.json')],value:'x'});
  await sleep(60);
  const asked=dialogOpen(w), question=asked?$(w,'confirmMsg').textContent:'';
  if(asked&&answer===true) $(w,'confirmOk').click();
  if(asked&&answer===false) $(w,'confirmCancel').click();
  await sleep(20);
  return { asked, question, msg:$(w,'backupMsg').textContent };
}
const item=(id,extra)=>Object.assign({id,name:'Item '+id,category:'Home',subcategory:'',cost:10,month:'No date yet',owner:'Sam',link:'',completed:false},extra||{});
const CODE='EDGE-BACKUP-1';

(async()=>{
  const w=boot(); await sleep(30);
  $(w,'householdCode').value=CODE; $(w,'yourName').value='Sam'; await w.enterApp(); await sleep(30);
  w.eval(`items=[${JSON.stringify(item(1,{name:'Keep me'}))}]; render()`); await sleep(600);
  const keep=()=>w.eval('items.length')===1&&w.eval('items[0].name')==='Keep me';

  // ---------- files that are not backups ----------
  const bad={
    'truncated JSON': '{"app":"household-forecast","version":1,"items":[{"id":1,"na',
    'empty file': '',
    'plain text': 'hello',
    'JSON null': 'null',
    'JSON array': '[1,2,3]',
    'another app': {app:'something-else',items:[],people:[]},
    'items not a list': {app:'household-forecast',version:1,items:{},people:[]},
    'people missing': {app:'household-forecast',version:1,items:[]},
    'byte-order mark + garbage': '﻿{oops'
  };
  for(const k in bad){
    const r=await restore(w,bad[k],true);
    ok(!r.asked&&/doesn’t look like/.test(r.msg)&&keep(),`${k}: friendly message, board untouched`);
  }
  // ---------- cancel ----------
  { const r=await restore(w,{app:'household-forecast',version:1,items:[item(7)],people:[{name:'Sam'}]},false);
    ok(r.asked&&keep(),'Cancel leaves the board as it was'); }

  // ---------- an old backup (2.x style): no version, people without ids, no to-dos, no categories ----------
  {
    w.eval(`CATEGORIES.push('Boats')`);
    const old={app:'household-forecast',items:[item(11,{name:'Old tires',month:'Oct 2025',saved:120}),item(12,{name:'Old done',completed:true,actualCost:40})],people:[{name:'Sam',photo:null},{name:'Alex',photo:null}]};
    const r=await restore(w,old,true);
    ok(r.asked&&/2 items/.test(r.question)&&/2 people/.test(r.question)&&!/to-do/.test(r.question),'old backup: question counts items and people, no to-do line: '+r.question);
    ok(w.eval('items.length')===2&&w.eval('people.every(p=>p.id!=null&&p.id!=="")'),'old backup restored; people got ids');
    ok(w.eval(`CATEGORIES.includes('Boats')`),'old backup without categories keeps the current category list');
    ok(w.eval('household.name')==='Sam'&&w.eval('household.personId')===w.eval("people.find(p=>p.name==='Sam').id"),'still signed in as Sam (matched by name)');
    await sleep(700);
    ok(store[CODE].items.length===2&&store[CODE].people.every(p=>p.id),'restored board (with ids) saved for everyone');
    ok(Object.keys(store[CODE]).every(k=>['items','people','activity','categories','subcategories','householdName','clientId','updatedAt'].includes(k)),'saved document has only the allowed top-level fields');
    ok(w.__errs.length===0,'no script errors');
  }
  // ---------- extra top-level fields in a backup never reach the shared document ----------
  {
    const r=await restore(w,{app:'household-forecast',version:1,exportedAt:'2026-01-01',householdCode:'SOMEONE-ELSE-9',extra:'x',settings:{theme:'dark'},items:[item(21)],people:[{name:'Sam'}]},true);
    await sleep(700);
    ok(r.asked&&w.eval('household.code')===CODE,'backup made in a different household restores into this one (code unchanged)');
    ok(!('extra' in store[CODE])&&!('settings' in store[CODE])&&!('householdCode' in store[CODE])&&!('exportedAt' in store[CODE]),'unknown backup fields are not saved to the shared document');
  }
  // ---------- the file picker asks first when the backup is from another household ----------
  {
    ok(/onchange="onRestorePicked\(this\)"/.test(html),'restore file picker goes through the household check');
    const pick=async (obj)=>{ const inp={files:[new w.File([typeof obj==='string'?obj:JSON.stringify(obj)],'b.json')],value:'x'}; w.onRestorePicked(inp); await sleep(60); return inp; };
    const bk=code=>Object.assign({app:'household-forecast',version:1,items:[item(51)],people:[{name:'Sam'}]},code===undefined?{}:{householdCode:code});
    w.eval(`items=[${JSON.stringify(item(1,{name:'Keep me'}))}]; render()`);
    const inp=await pick(bk('SOMEONE-ELSE-9'));
    ok(inp.value===''&&dialogOpen(w)&&/another household/.test($(w,'confirmMsg').textContent)&&/SOMEONE-ELSE-9/.test($(w,'confirmMsg').textContent),'other household: plain warning first: '+$(w,'confirmMsg').textContent);
    $(w,'confirmCancel').click(); await sleep(60);
    ok(!dialogOpen(w)&&keep(),'saying no to the warning stops there, board untouched');
    await pick(bk('SOMEONE-ELSE-9')); $(w,'confirmOk').click(); await sleep(60);
    ok(dialogOpen(w)&&/Replace everything/.test($(w,'confirmMsg').textContent),'saying yes goes on to the usual "Replace board?" question');
    $(w,'confirmCancel').click(); await sleep(20);
    ok(keep(),'and that one can still be cancelled');
    for(const [label,code] of [['same household',CODE],['same household, other case/spaces',' '+CODE.toLowerCase()+' '],['old backup with no household recorded',undefined]]){
      await pick(bk(code));
      ok(dialogOpen(w)&&/Replace everything/.test($(w,'confirmMsg').textContent),label+': no extra warning');
      $(w,'confirmCancel').click(); await sleep(20);
    }
    await pick('{"app":"household-forecast","items":[');
    ok(!dialogOpen(w)&&/doesn’t look like/.test($(w,'backupMsg').textContent)&&keep(),'broken file through the picker: usual message, no warning');
    await pick(bk('SOMEONE-ELSE-9')); $(w,'confirmOk').click(); await sleep(60); $(w,'confirmOk').click(); await sleep(30);
    ok(w.eval('items.length')===1&&w.eval('items[0].id')===51&&w.eval('household.code')===CODE,'confirming both restores into this household');
    lastBlob=null; w.exportBackup(); const exp=JSON.parse(await lastBlob.text());
    ok(exp.householdCode===CODE,'new backups record the household code');
  }
  // ---------- to-dos, trash, unsafe photo ----------
  {
    const now=Date.now();
    const bk={app:'household-forecast',version:1,items:[item(31),{id:32,kind:'todo',name:'Call vet',completed:false,owner:'Sam',createdAt:now},
      item(33,{deletedAt:now-40*86400000}),item(34,{deletedAt:now-86400000})],
      people:[{id:'s1',name:'Sam',photo:'x" onerror="window.__pwn=1'},{id:'k1',name:'Kit',photo:'data:image/jpeg;base64,/9j/AAAA'}]};
    const r=await restore(w,bk,true);
    ok(/1 items/.test(r.question)&&/1 to-dos/.test(r.question),'question counts budget items and to-dos separately (trash not counted): '+r.question);
    ok(w.eval('items.some(i=>i.id===32&&i.kind==="todo")'),'to-dos restored');
    ok(!w.eval('items.some(i=>i.id===33)')&&w.eval('items.some(i=>i.id===34)'),'trash older than 30 days dropped, recent trash kept');
    ok(w.eval("people.find(p=>p.name==='Sam').photo")===null&&w.eval("people.find(p=>p.name==='Kit').photo")==='data:image/jpeg;base64,/9j/AAAA','unsafe photo in a backup dropped, real photo kept');
    w.render();
    ok(w.document.querySelectorAll('[onerror]').length===0&&!w.__pwn,'no injected markup anywhere on the page');
    ok(w.eval('household.personId')==='s1','signed-in profile follows the id in the backup');
  }
  // ---------- a backup without me in it: asks who I am ----------
  {
    const r=await restore(w,{app:'household-forecast',version:1,items:[],people:[{id:'z9',name:'Kit'}]},true);
    await sleep(30);
    ok(r.asked&&$(w,'chooseOverlay').style.display==='flex','backup without my profile: the "which one is you?" screen opens');
    w.chooseCreate();   // name prefilled with my name
    ok(w.eval('household.name')==='Sam'&&w.eval('people.length')===2&&$(w,'chooseOverlay').style.display==='none','I can recreate my profile from there');
  }
  // ---------- export → restore round trip ----------
  {
    w.eval(`items=[${JSON.stringify(item(41,{name:'Café ☕',note:'a "quote" <b>'}))},{id:42,kind:'todo',name:'Ring',completed:false,owner:'Sam',createdAt:1,url:'https://example.com'}]; householdName='The Smiths'; render()`);
    lastBlob=null; w.exportBackup();
    ok(!!lastBlob&&/Backup saved \(1 item, 1 to-do, 2 people\)/.test($(w,'backupMsg').textContent),'export: file made, message counts: '+$(w,'backupMsg').textContent);
    const txt=await lastBlob.text();
    const data=JSON.parse(txt);
    ok(data.app==='household-forecast'&&data.householdCode===CODE&&data.items.length===2,'export file has the app marker, code and every item');
    w.eval(`items=[]; householdName=''; render()`);
    const r=await restore(w,txt,true);
    ok(r.asked&&w.eval('items.length')===2&&w.eval("items[0].name")==='Café ☕'&&w.eval("items[0].note")==='a "quote" <b>'&&w.eval('householdName')==='The Smiths','round trip keeps everything, including accents, emoji, quotes and the household name');
    ok(w.eval(`Number(lsGet('lastBackupAt'))`)>Date.now()-5000&&w.eval(`lsGet('lastBackupSeeded')`)===null,'export records the backup time');
  }
  // ---------- very large backups ----------
  // The shared database holds about 1 MB per household, so a backup that cannot fit is refused
  // up front (plain message, board untouched); a large one that fits restores without freezing.
  {
    w.eval(`items=[${JSON.stringify(item(1,{name:'Keep me'}))}]; render()`); await sleep(600);
    const before=w.eval('JSON.stringify(items)');
    const many=Array.from({length:10000},(_,i)=>item(1000+i));
    w.__many=many;
    ok(w.eval('boardBytes(docToSnap({items:window.__many,people:[]}).snap)>DOC_MAX_BYTES'),'10,000-item backup really is over the size limit');
    const watch=freezeWatch();
    const r=await restore(w,{app:'household-forecast',version:1,items:many,people:[{name:'Sam'}]},null);
    const ms=watch();
    ok(r.asked&&/too big/i.test(r.question)&&/Nothing was changed/.test(r.question)&&!/Replace everything/.test(r.question)&&/too big/i.test(r.msg),'10,000-item backup is refused with a plain message (no "Replace board" question)');
    if(dialogOpen(w)) $(w,'confirmOk').click();
    await sleep(20);
    ok(w.eval('JSON.stringify(items)')===before&&!w.eval('cloud.replaceNext'),'board unchanged after the refused backup');
    ok(ms<1500,'refusing the 10,000-item backup does not freeze the page (longest pause '+ms+' ms)');
    ok(w.__errs.length===0,'no script errors with 10,000 items');
  }
  {
    const many=Array.from({length:2000},(_,i)=>item(20000+i));
    w.__many=many;
    ok(w.eval('boardBytes(docToSnap({items:window.__many,people:[{name:"Sam"}]}).snap)<DOC_MAX_BYTES'),'2,000-item backup fits under the size limit');
    const watch=freezeWatch();
    const r=await restore(w,{app:'household-forecast',version:1,items:many,people:[{name:'Sam'}]},true);
    await sleep(600);   // let the save and its echo run too
    const ms=watch();
    ok(r.asked&&/2000 items/.test(r.question)&&w.eval('items.length')===2000&&/restored/.test($(w,'backupMsg').textContent),'2,000-item backup restores');
    // jsdom builds cards far slower than a real browser: a redraw after the first one builds every card at
    // once (js/month-groups.js), about 3 s for 2,000 cards here, so this only catches a real hang
    ok(ms<10000,'2,000-item restore does not freeze the page (longest pause '+ms+' ms)');
    ok(w.__errs.length===0,'no script errors with 2,000 items');
  }
  // ---------- backup reminder data ----------
  {
    const DAY=86400000, now=Date.now();
    const cases=[
      ['garbage date', {lastBackupAt:'not a date'}, b=>b.hidden&&!Number.isNaN(Number(b.w.localStorage.getItem('lastBackupAt')))],
      ['date in the future (clock was wrong)', {lastBackupAt:String(now+90*DAY)}, b=>b.hidden],
      ['ISO date 45 days ago', {lastBackupAt:new Date(now-45*DAY).toISOString()}, b=>!b.hidden&&/45 days/.test(b.text)],
      ['45 days ago but snoozed', {lastBackupAt:String(now-45*DAY),backupSnoozedUntil:String(now+DAY)}, b=>b.hidden],
      ['snooze ran out', {lastBackupAt:String(now-45*DAY),backupSnoozedUntil:String(now-DAY)}, b=>!b.hidden],
      ['29 days ago', {lastBackupAt:String(now-29*DAY)}, b=>b.hidden]
    ];
    for(const [label,ls,check] of cases){
      const v=boot(ls); await sleep(30);
      v.eval('initBackupReminder(); updateBackupBanner(); updateLastBackupLabel()');
      const el=$(v,'backupBanner');
      ok(check({w:v,hidden:el.hidden,text:$(v,'backupBannerText').textContent})&&v.__errs.length===0,'reminder: '+label);
    }
  }
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})();
