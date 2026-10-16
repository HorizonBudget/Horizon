const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
const timers=[];
function boot(){
  return new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory; w.alert=m=>{ throw new Error('window.alert used: '+m); };
    w.confirm=()=>{ throw new Error('window.confirm must not be used for removals'); };
    const si=w.setInterval.bind(w); w.setInterval=(fn,ms)=>{ if(ms===3600000){ timers.push(fn); return 0; } return si(fn,ms); };
  }}).window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const DAY=86400000;
(async()=>{
  const A=boot(), B=boot(); await sleep(50);
  const d=A.document;
  d.getElementById('householdCode').value='TRASH-TEST-1234'; d.getElementById('yourName').value='Sam';
  await A.enterApp();
  const M0=A.eval('FUTURE_MONTHS[0]'), M1=A.eval('FUTURE_MONTHS[1]');
  A.eval(`items.push(
    {id:1,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:${JSON.stringify(M0)},saved:0,owner:'Sam',link:'',completed:false},
    {id:2,name:'Dentist',category:'Health',subcategory:'',cost:100,month:${JSON.stringify(M1)},saved:0,owner:'',link:'',completed:false},
    {id:3,name:'Glasses',category:'Health',subcategory:'',cost:250,month:${JSON.stringify(M1)},saved:0,owner:'',link:'',completed:false},
    {id:4,name:'Old Done',category:'Home',subcategory:'',cost:75,month:${JSON.stringify(M0)},saved:0,owner:'',link:'',completed:true});render();`);
  const cards=()=>[...d.querySelectorAll('#itemsList .item-card')].map(c=>c.querySelector('.item-name').textContent);
  const stat=()=>[d.getElementById('statCount').textContent,d.getElementById('statNeeded').textContent];
  const pills=id=>[...d.querySelectorAll('#'+id+' .month-pill')].map(p=>p.textContent.replace(/\s+/g,' ').trim());
  ok(cards().join()==='Tires,Dentist,Glasses','baseline active cards: '+cards());
  ok(stat().join()==='3,$950','baseline stats '+stat());
  ok(!d.getElementById('monthFilter'),'no month filter pills');
  ok(/All categories 4/.test(pills('categoryFilter')[0]),'baseline All categories pill: '+pills('categoryFilter')[0]);
  const allBefore=pills('categoryFilter')[0];

  // --- remove button placement ---
  ok(![...d.querySelectorAll('#itemsList .item-actions button')].some(b=>/remove/i.test(b.textContent)),'no Remove button on card rows (active)');
  A.openItemModal();
  ok(d.getElementById('removeItemBtn').style.display==='none','Remove item hidden when adding');
  A.closeItemModal();
  A.switchTab('completed');
  ok(![...d.querySelectorAll('#itemsList .item-actions button')].some(b=>/remove/i.test(b.textContent)),'no Remove button on card rows (completed)');
  A.switchTab('active');
  A.editItem(1);
  const rb=d.getElementById('removeItemBtn');
  ok(rb.style.display!=='none' && rb.textContent==='Remove item' && /btn-danger/.test(rb.className),'Remove item shown + danger styled when editing');
  ok(rb.parentElement.firstElementChild===rb,'Remove item is first (left) in footer');
  ok(!/Remove item|removeItemBtn/.test(d.getElementById('itemsList').innerHTML),'no remove control in card markup');

  // --- confirm dialog: cancel keeps ---
  const msgBefore=d.getElementById('confirmOverlay').style.display;
  let p=A.requestRemoveItem();
  ok(d.getElementById('confirmOverlay').style.display==='flex','in-app confirm opens');
  ok(d.getElementById('confirmMsg').textContent==='Remove “Tires”? You can restore it from Settings → Deleted items for 30 days.','confirm text: '+d.getElementById('confirmMsg').textContent);
  d.getElementById('confirmCancel').click(); ok((await p)===false,'cancel resolves false');
  ok(d.getElementById('confirmOverlay').style.display==='none' && !A.eval('isDeleted(findLiveItem(1)||{})') && cards().includes('Tires'),'cancel keeps item');
  ok(d.getElementById('itemOverlay').style.display==='flex','edit modal still open after cancel');
  p=A.requestRemoveItem(); d.dispatchEvent(new A.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); ok((await p)===false && !!A.eval('findLiveItem(1)'),'Escape cancels');
  p=A.requestRemoveItem(); d.getElementById('confirmOverlay').dispatchEvent(new A.MouseEvent('mousedown',{bubbles:true})); ok((await p)===false,'backdrop click cancels');
  // --- confirm OK soft deletes ---
  p=A.requestRemoveItem(); d.getElementById('confirmOk').click(); ok((await p)===true,'confirm resolves true');
  const t1=A.eval('items.find(i=>i.id===1)');
  ok(t1 && typeof t1.deletedAt==='number' && Math.abs(Date.now()-t1.deletedAt)<5000,'item kept with numeric deletedAt');
  ok(d.getElementById('itemOverlay').style.display==='none','edit modal closed after remove');
  ok(A.eval('activity[0].text')==='Sam removed “Tires”','activity logged: '+A.eval('activity[0].text'));
  // --- hidden everywhere ---
  ok(cards().join()==='Dentist,Glasses','card gone from Active');
  ok(stat().join()==='2,$350','stats exclude deleted '+stat());
  ok(![...d.querySelectorAll('#itemsList .mg-name')].some(x=>x.textContent===M0),'month group of the deleted item is gone (completed one is not on Active)');
  ok(!pills('categoryFilter').some(x=>x.startsWith('Vehicle')),'category pill vanished');
  ok(pills('categoryFilter')[0]!==allBefore,'All categories count changed after the delete '+pills('categoryFilter')[0]);
  ok(/All categories 3/.test(pills('categoryFilter')[0]),'All categories count: '+pills('categoryFilter')[0]);
  A.switchTab('completed'); ok(cards().join()==='Old Done','completed tab unaffected: '+cards());
  A.eval('deleteItem(4)'); ok(cards().length===0 && /Nothing completed yet/.test(d.getElementById('itemsList').textContent) && !/checked off/.test(d.getElementById('filterNote').textContent),'deleted completed item hidden from Completed + empty state');
  A.switchTab('active');
  // filter fallback: a category filter on a deleted-only category resets
  A.eval(`activeCategoryFilter='Vehicle';render()`); ok(A.eval('activeCategoryFilter')==='All' && cards().length===2,'stale category filter resets');
  // a month and category that only hold a deleted item disappear from the pills
  const M2=A.eval('FUTURE_MONTHS[2]');
  A.eval(`items.push({id:5,name:'Solo',category:'Pets',subcategory:'',cost:40,month:${JSON.stringify(M2)},saved:0,owner:'',link:'',completed:false});render()`);
  ok([...d.querySelectorAll('#itemsList .mg-name')].some(x=>x.textContent===M2) && pills('categoryFilter').some(x=>x.startsWith('Pets')),'Solo month group + category pill present');
  A.eval('deleteItem(5)');
  ok(![...d.querySelectorAll('#itemsList .mg-name')].some(x=>x.textContent===M2) && !pills('categoryFilter').some(x=>x.startsWith('Pets')),'month group + category pill holding only deleted items vanish');
  A.eval('items=items.filter(i=>i.id!==5)');
  // editItem / complete on deleted item is a no-op
  A.editItem(1); ok(d.getElementById('itemOverlay').style.display==='none','editItem ignores deleted item');
  A.eval('finishCompleting(1)'); ok(A.eval('items.find(i=>i.id===1).completed')===false,'cannot complete deleted item');
  A.eval('deleteItem(1)'); ok(A.eval('items.find(i=>i.id===1).deletedAt')===t1.deletedAt,'double delete does not bump deletedAt');

  // --- Settings row + modal ---
  A.openSettingsModal();
  ok(d.getElementById('trashRowTitle').textContent==='Deleted items (2)','settings row count: '+d.getElementById('trashRowTitle').textContent);
  A.eval('items.find(i=>i.id===1).deletedAt=Date.now()-3*86400000');
  d.getElementById('trashOpenBtn').click();
  ok(d.getElementById('settingsOverlay').style.display==='none' && d.getElementById('trashOverlay').style.display==='flex','trash modal opens from settings');
  let rows=[...d.querySelectorAll('#trashList .trash-item')];
  ok(rows.length===2,'two entries');
  const txt=rows.map(r=>r.textContent.replace(/\s+/g,' '));
  ok(/Tires.*\$600.*Deleted 3 days ago.*27 days left/.test(txt.find(t=>/Tires/.test(t))||''),'Tires entry: '+txt.find(t=>/Tires/.test(t)));
  ok(/Old Done.*\$75.*Deleted today.*30 days left/.test(txt.find(t=>/Old Done/.test(t))||''),'Old Done entry: '+txt.find(t=>/Old Done/.test(t)));
  ok(rows.every(r=>/Restore/.test(r.textContent)&&/Delete forever/.test(r.textContent)),'each has Restore + Delete forever');
  ok(/Empty all/.test(d.getElementById('trashEmptyBtn').textContent),'Empty all present');
  A.eval("items.find(i=>i.id===4).deletedAt=Date.now()-(29*86400000+3600000)");
  A.renderTrashList(); ok(/1 day left/.test(d.getElementById('trashList').textContent),'singular "1 day left"');
  A.eval("items.find(i=>i.id===4).deletedAt=Date.now()");A.renderTrashList();

  // --- restore ---
  const bTires=[...d.querySelectorAll('#trashList .trash-item')].find(r=>/Tires/.test(r.textContent));
  bTires.querySelector('[data-act=restore]').click();
  ok(A.eval('items.find(i=>i.id===1).deletedAt')===undefined && !('deletedAt' in A.eval('items.find(i=>i.id===1)')),'restore clears deletedAt');
  ok(cards().includes('Tires') && stat().join()==='3,$950','restored shows again + totals back '+stat());
  ok(A.eval('activity[0].text')==='Sam restored “Tires” from Deleted items','restore logged: '+A.eval('activity[0].text'));
  ok(d.querySelectorAll('#trashList .trash-item').length===1,'list refreshed live after restore');
  [...d.querySelectorAll('#trashList .trash-item')][0].querySelector('[data-act=restore]').click();
  ok(A.eval('items.find(i=>i.id===4).completed')===true && A.eval('items.find(i=>i.id===4).deletedAt')===undefined,'restore keeps completed state');
  A.switchTab('completed'); ok(cards().join()==='Old Done','restored completed item back on Completed'); A.switchTab('active'); ok(!cards().includes('Old Done'),'and not on Active');
  ok(/No deleted|Nothing deleted/.test(d.getElementById('trashList').textContent) && d.getElementById('trashEmptyBtn').style.display==='none','empty state, Empty all hidden');
  A.closeTrashModal(); ok(d.getElementById('trashOverlay').style.display==='none' && d.getElementById('settingsOverlay').style.display==='flex','Done returns to Settings');
  ok(d.getElementById('trashRowTitle').textContent==='Deleted items (0)','count back to 0');

  // --- delete forever / empty all ---
  A.eval('deleteItem(2);deleteItem(3)'); A.openTrashModal();
  const forever=id=>[...d.querySelectorAll('#trashList .trash-item')].find(r=>r.textContent.includes(id)).querySelector('[data-act=forever]');
  forever('Dentist').click();
  ok(d.getElementById('confirmOverlay').style.display==='flex' && /Dentist/.test(d.getElementById('confirmMsg').textContent),'delete forever asks first');
  d.getElementById('confirmCancel').click(); await sleep(5);
  ok(!!A.eval('items.find(i=>i.id===2)') && d.querySelectorAll('#trashList .trash-item').length===2,'cancel keeps it');
  forever('Dentist').click(); d.getElementById('confirmOk').click(); await sleep(5);
  ok(!A.eval('items.find(i=>i.id===2)') && A.eval('items.some(i=>i.id===3)'),'delete forever removes only that item');
  ok(A.eval('activity[0].text')==='Sam deleted “Dentist” forever','forever logged: '+A.eval('activity[0].text'));
  A.eval('deleteItem(1)');
  d.getElementById('trashEmptyBtn').click(); ok(/2 items/.test(d.getElementById('confirmMsg').textContent),'empty all asks first: '+d.getElementById('confirmMsg').textContent);
  d.getElementById('confirmCancel').click(); await sleep(5); ok(A.eval('items.filter(isDeleted).length')===2,'empty all cancel keeps');
  d.getElementById('trashEmptyBtn').click(); d.getElementById('confirmOk').click(); await sleep(5);
  ok(A.eval('items.filter(isDeleted).length')===0 && A.eval('items.map(i=>i.id).join()')==='4','empty all erased only deleted items: '+A.eval('items.map(i=>i.id).join()'));
  A.closeTrashModal();

  // --- purge boundary ---
  const NOW=Date.now();
  A.eval(`items=[
    {id:101,name:'d29',category:'Home',cost:1,month:'No date yet',deletedAt:${NOW-29*DAY}},
    {id:102,name:'d31',category:'Home',cost:1,month:'No date yet',deletedAt:${NOW-31*DAY}},
    {id:103,name:'legacy',category:'Home',cost:1,month:'No date yet',completed:false},
    {id:104,name:'d30exact',category:'Home',cost:1,month:'No date yet',deletedAt:${NOW-30*DAY}},
    {id:105,name:'future',category:'Home',cost:1,month:'No date yet',deletedAt:${NOW+5*DAY}},
    {id:106,name:'junk',category:'Home',cost:1,month:'No date yet',deletedAt:'abc'},
    {id:107,name:'d30plus',category:'Home',cost:1,month:'No date yet',deletedAt:${NOW-30*DAY-2000}}]`);
  const n=A.eval(`purgeTrash(${NOW})`);
  ok(n===2,'purge removed 2: '+n);
  const left=A.eval('items.map(i=>i.name).join()');
  ok(left==='d29,legacy,d30exact,future,junk','29 days kept, 31 purged, exactly 30 kept, 30d+2s purged, legacy/future/junk kept: '+left);
  ok(A.eval(`purgeTrash(${NOW})`)===0,'purge idempotent');
  ok(A.eval('liveItems().map(i=>i.name).join()')==='legacy,junk','legacy + junk-deletedAt items are live');

  // --- hourly timer purges + syncs ---
  ok(timers.length>=2,'hourly purge timer registered ('+timers.length+')');
  A.eval(`items=[{id:201,name:'oldTrash',category:'Home',cost:1,month:'No date yet',deletedAt:Date.now()-31*86400000},{id:202,name:'keep',category:'Home',cost:1,month:'No date yet'}];render()`);
  await sleep(700);
  ok(store['TRASH-TEST-1234'].items.length===2,'store holds both before hourly purge');
  timers[0](); await sleep(700);
  ok(A.eval('items.length')===1 && store['TRASH-TEST-1234'].items.length===1 && store['TRASH-TEST-1234'].items[0].name==='keep','hourly purge erased + synced');

  // --- sync of soft delete + top-level fields unchanged ---
  B.document.getElementById('householdCode').value='TRASH-TEST-1234'; B.document.getElementById('yourName').value='Alex'; await B.enterApp(); await sleep(600);
  A.eval('deleteItem(202)'); await sleep(800);
  ok(B.eval('liveItems().length')===0 && B.eval('items.length')===1 && typeof B.eval('items[0].deletedAt')==='number','B sees soft delete');
  ok([...B.document.querySelectorAll('#itemsList .item-card')].length===0,'B board hides it');
  const keys=Object.keys(store['TRASH-TEST-1234']).sort().join();
  ok(keys==='activity,categories,clientId,householdName,items,people,subcategories,updatedAt','no new top-level synced fields: '+keys);
  // restore on B syncs back to A
  B.eval('restoreDeletedItem(202)'); await sleep(800);
  ok(A.eval('findLiveItem(202)')!==undefined,'A sees restore');
  await sleep(300);

  // --- purge on load ---
  store['TRASH-TEST-1234'].items.push({id:301,name:'ancient',category:'Home',cost:1,month:'No date yet',deletedAt:Date.now()-45*DAY},{id:302,name:'recent',category:'Home',cost:1,month:'No date yet',deletedAt:Date.now()-2*DAY});
  const C=boot(); await sleep(30);
  C.document.getElementById('householdCode').value='TRASH-TEST-1234'; C.document.getElementById('yourName').value='Pat'; await C.enterApp(); await sleep(800);
  ok(C.eval('items.map(i=>i.name).sort().join()')==='keep,recent' && !store['TRASH-TEST-1234'].items.some(i=>i.name==='ancient') && store['TRASH-TEST-1234'].items.some(i=>i.name==='recent'),'purged on load and synced: '+C.eval('items.map(i=>i.name)'));
  ok(C.document.getElementById('trashRowTitle').textContent==='Deleted items (1)','settings count after load: '+C.document.getElementById('trashRowTitle').textContent);
  // purge when a remote update arrives
  store['TRASH-TEST-1234'].items.push({id:401,name:'stale',category:'Home',cost:1,month:'No date yet',deletedAt:Date.now()-60*DAY});
  store['TRASH-TEST-1234'].clientId='someone-else';
  C.eval('cloudApplyRemote')(JSON.parse(JSON.stringify(store['TRASH-TEST-1234']))); await sleep(800);
  ok(!C.eval('items.some(i=>i.name==="stale")') && !store['TRASH-TEST-1234'].items.some(i=>i.name==='stale'),'purged when sync arrives');

  // --- backup round trip ---
  let blobText=null; A.URL.createObjectURL=b=>{ b.text().then(t=>blobText=t); return 'blob:x'; }; A.URL.revokeObjectURL=()=>{};
  A.eval(`items=[{id:202,name:'keep',category:'Home',cost:1,month:'No date yet'},{id:9,name:'Alive',category:'Home',cost:50,month:'No date yet',completed:false}];deleteItem(202)`);
  A.openSettingsModal('advanced'); A.exportBackup(); await sleep(100);
  const bk=JSON.parse(blobText);
  ok(bk.items.length===2 && bk.items.filter(i=>i.deletedAt).length===1,'backup includes deleted items');
  ok(/Backup saved \(1 item,/.test(d.getElementById('backupMsg').textContent),'backup message counts live items: '+d.getElementById('backupMsg').textContent);
  A.eval('items=[];render()');
  let confirmMsg=''; 
  A.onRestoreFileChosen({files:[new A.File([blobText],'b.json')],value:'x'}); await sleep(150); confirmMsg=d.getElementById('confirmMsg').textContent; A.document.getElementById('confirmOk').click(); await sleep(900);
  ok(/\(1 items,/.test(confirmMsg),'restore confirm counts live items: '+confirmMsg.slice(0,80));
  ok(A.eval('items.length')===2 && A.eval('liveItems().length')===1 && A.eval('items.filter(isDeleted).length')===1,'restore brings back deleted flags');
  ok(cards().join()==='Alive' && d.getElementById('trashRowTitle').textContent==='Deleted items (1)','board + Deleted count after restore');
  // old backup without the field
  const old=JSON.parse(blobText); old.items=old.items.map(i=>{const c=Object.assign({},i); delete c.deletedAt; return c;});
  A.onRestoreFileChosen({files:[new A.File([JSON.stringify(old)],'old.json')],value:'x'}); await sleep(150); A.document.getElementById('confirmOk').click(); await sleep(900);
  ok(A.eval('liveItems().length')===2 && A.eval('items.filter(isDeleted).length')===0 && cards().length===2,'older backup without deletedAt restores as live');
  // backup with an expired deleted item
  const exp=JSON.parse(blobText); exp.items.push({id:77,name:'expired',category:'Home',cost:1,month:'No date yet',deletedAt:Date.now()-40*DAY});
  A.onRestoreFileChosen({files:[new A.File([JSON.stringify(exp)],'exp.json')],value:'x'}); await sleep(150); A.document.getElementById('confirmOk').click(); await sleep(900);
  ok(!A.eval('items.some(i=>i.name==="expired")'),'expired deleted item in a backup is purged on restore');

  // --- style guide samples have no Remove ---
  A.openStyleGuide();
  ok(d.querySelectorAll('#guideBody .item-card').length>=5 && ![...d.querySelectorAll('#guideBody .item-actions button')].some(b=>/remove/i.test(b.textContent)),'style guide cards have no Remove button');

  console.log(`\n${pass} passed, ${fails} failed`); console.log(fails?'FAILURES':'ALL OK'); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
