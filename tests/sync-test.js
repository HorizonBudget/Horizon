const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
// fake firestore shared by both "devices"
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb,err){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
function boot(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){ w.__cloudAdapterFactory=fakeFactory; w.alert=m=>{ throw new Error('window.alert used: '+m); }; w.confirm=()=>{ throw new Error('window.confirm used'); }; }});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const A=boot(), B=boot();
  await sleep(50);
  A.document.getElementById('householdCode').value='maple harbor 1234'.replace(/ /g,'-');
  A.document.getElementById('yourName').value='Sam';
  await A.enterApp();
  ok(A.document.getElementById('app').style.display==='block','A entered');
  A.document.getElementById('f_name').value='Hair dryer'; A.openItemModal(); A.document.getElementById('f_name').value='Tires'; A.document.getElementById('f_cost').value='600'; A.saveItem();
  await sleep(700);
  ok(store['MAPLE-HARBOR-1234'] && store['MAPLE-HARBOR-1234'].items.length===1,'A item pushed to store');
  B.document.getElementById('householdCode').value='maple-harbor-1234';
  B.document.getElementById('yourName').value='Alex';
  await B.enterApp();
  ok(B.eval("items").length===1 && B.eval("items")[0].name==='Tires','B loaded A item');
  ok(B.eval("people").length===2,'B has Sam + Alex people ('+B.eval("people").map(p=>p.name)+')');
  await sleep(700);
  // live update A <- B
  B.document.getElementById('f_name').value='';B.openItemModal();B.document.getElementById('f_name').value='Dental cleanings';B.document.getElementById('f_cost').value='150';B.saveItem();
  await sleep(800);
  ok(A.eval("items").length===2,'A received B item live ('+A.eval("items").length+')');
  ok(A.eval("people").length===2,'A sees Alex person');
  ok(A.document.getElementById('itemsList').textContent.includes('Dental cleanings'),'A UI re-rendered');
  // no echo loop: count pushes
  const v1=JSON.stringify(store['MAPLE-HARBOR-1234'].updatedAt); await sleep(800);
  ok(JSON.stringify(store['MAPLE-HARBOR-1234'].updatedAt)===v1,'no push loop');
  // delete on A
  A.eval("deleteItem(items[0].id)"); await sleep(800);
  ok(B.eval("liveItems()").length===1 && B.eval("items").length===2 && B.eval("items.filter(isDeleted)").length===1,'B saw soft delete (item kept with deletedAt)');
  // bad code
  const C=boot(); await sleep(30);
  C.document.getElementById('householdCode').value='abc'; C.document.getElementById('yourName').value='Z'; await C.enterApp();
  ok(/6–40/.test(C.document.getElementById('gateError').textContent),'short code rejected');
  // generate code
  C.generateHouseholdCode(); ok(/^[A-Z0-9-]{6,40}$/.test(C.document.getElementById('householdCode').value),'generated '+C.document.getElementById('householdCode').value);
  // resume
  ok(!!A.localStorage.getItem('ledgerHousehold'),'session remembered');
  A.openSettingsModal(); ok(A.document.getElementById('shareCode').textContent==='MAPLE-HARBOR-1234','share code shown');
  // household name + themes + backup
  ok(A.document.getElementById('hhTitle').textContent==='Our household','default title');
  A.document.getElementById('settingsHhName').value='The Smiths'; A.onHouseholdNameInput(); await sleep(800);
  ok(A.document.getElementById('hhTitle').textContent==='The Smiths','title renamed');
  ok(B.document.getElementById('hhTitle').textContent==='The Smiths','B sees synced household name');
  ok(!/MAPLE/.test(A.document.getElementById('hhTitle').textContent+A.document.getElementById('hhCodeLabel').textContent),'code not in header');
  ok(!/openSetupSuggestions/.test(A.document.documentElement.outerHTML),'suggested button gone');
  for(const t of ['warm','ocean','midnight','mocha','dark','light']){ A.setTheme(t); ok(A.document.documentElement.getAttribute('data-theme')===t,'theme '+t); }
  A.setTheme('midnight'); ok(A.eval('colorSet("#C98A2B").fg')!==A.eval('(theme="light",colorSet("#C98A2B").fg)'),'dark palette differs');
  A.setTheme('light');
  // backup export captures
  let blobText=null; A.URL.createObjectURL=b=>{ b.text().then(t=>blobText=t); return 'blob:x'; }; A.URL.revokeObjectURL=()=>{};
  A.exportBackup(); await sleep(100);
  const bk=JSON.parse(blobText); ok(bk.app==='household-forecast'&&bk.items.length===2&&bk.items.filter(i=>i.deletedAt).length===1&&bk.householdName==='The Smiths','backup content');
  // restore into B from backup with one item removed on A
  A.eval('deleteItem(liveItems()[0].id)'); await sleep(700); ok(B.eval('liveItems().length')===0,'B empty after delete');
  const input={files:[new A.File([blobText],'b.json')],value:'x'}; A.onRestoreFileChosen(input); await sleep(150); A.document.getElementById('confirmOk').click(); await sleep(900);
  ok(A.eval('liveItems().length')===1,'A restored'); ok(B.eval('liveItems().length')===1,'B got restored item via sync');
  console.log(fails?'FAILURES '+fails:'ALL OK'); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
