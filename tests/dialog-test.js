const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const w=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
  for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
}}).window;
const d=w.document, $=id=>d.getElementById(id);
const open=()=>$('confirmOverlay').style.display==='flex';
const esc=()=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
(async()=>{
  ok(!/\b(window\.)?(confirm|alert|prompt)\(/.test(html.replace(/askConfirm\(|askAlert\(|ev\.prompt\(/g,'').replace(/javascript:alert/g,'')),'no native confirm/alert/prompt calls in source');
  w.eval(`household={name:'T',code:'abc-123'}; items=[{id:1,name:'Boat',category:'Home',cost:5,month:'No date yet',completed:true}]; people=[]; activeTab='completed'; render();`);
  // --- restore checkbox ---
  const cb=()=>d.querySelector('.restore-check');
  ok(!!cb(),'completed item has restore checkbox');
  cb().checked=false; cb().dispatchEvent(new w.Event('change'));
  ok(open() && /Boat/.test($('confirmMsg').textContent),'checkbox opens in-app confirm');
  ok(cb().checked===true,'checkbox stays ticked while asking');
  ok(d.activeElement===$('confirmCancel'),'Cancel is focused');
  $('confirmCancel').click(); await sleep(5);
  ok(!open() && w.eval('items[0].completed')===true && cb().checked===true,'Cancel keeps item completed, checkbox ticked');
  cb().checked=false; cb().dispatchEvent(new w.Event('change')); esc(); await sleep(5);
  ok(!open() && w.eval('items[0].completed')===true,'Escape cancels restore');
  cb().checked=false; cb().dispatchEvent(new w.Event('change'));
  $('confirmOverlay').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true})); await sleep(5);
  ok(!open() && w.eval('items[0].completed')===true,'backdrop cancels restore');
  cb().checked=false; cb().dispatchEvent(new w.Event('change')); $('confirmOk').click(); await sleep(5);
  ok(!open() && w.eval('items[0].completed')===false,'OK moves item back to Active');
  // --- backup restore ---
  const bk=JSON.stringify({app:'household-forecast',version:1,items:[{id:9,name:'New',category:'Home',cost:1,month:'No date yet'}],people:[]});
  let input={files:[new w.File([bk],'b.json')],value:'x'};
  w.onRestoreFileChosen(input);
  ok(input.value==='','file input reset immediately');
  await sleep(100);
  ok(open() && /1 items/.test($('confirmMsg').textContent),'backup restore asks in-app');
  $('confirmCancel').click(); await sleep(5);
  ok(w.eval('items.length')===1 && w.eval('items[0].id')===1,'Cancel leaves board untouched');
  w.onRestoreFileChosen({files:[new w.File([bk],'b.json')],value:'x'}); await sleep(100); $('confirmOk').click(); await sleep(20);
  ok(w.eval('items.length')===1 && w.eval('items[0].id')===9 && /restored/.test($('backupMsg').textContent),'OK replaces board');
  w.onRestoreFileChosen({files:[new w.File(['nope'],'b.json')],value:'x'}); await sleep(100);
  ok(!open() && /doesn’t look like/.test($('backupMsg').textContent),'bad file shows inline message, no dialog');
  // --- leave household ---
  let reloaded=0; w.cloudDisconnect=()=>{}; 
  let p=w.leaveHousehold(); ok(open() && /Leave/.test($('confirmOk').textContent),'leave household asks in-app');
  $('confirmCancel').click(); ok((await p)===false,'Leave: Cancel resolves false, stays signed in');
  // --- validation notices ---
  w.eval(`openItemModal()`);
  d.getElementById('f_name').value=''; w.saveItem(); 
  ok(open() && $('confirmCancel').style.display==='none' && /name and an estimated cost/.test($('confirmMsg').textContent),'item validation shows OK-only notice');
  ok(d.activeElement===$('confirmOk'),'notice focuses OK');
  esc(); await sleep(5); ok(!open(),'Escape dismisses notice');
  w.saveItem(); $('confirmOk').click(); ok(!open(),'OK dismisses notice');
  d.getElementById('f_name').value='X'; d.getElementById('f_cost').value='5';
  d.getElementById('f_category').value='Other'; d.getElementById('f_category').dispatchEvent(new w.Event('change'));
  w.saveItem(); ok(open() && /new category/.test($('confirmMsg').textContent),'new-category validation notice'); $('confirmOk').click();
  w.eval(`closeItemModal()`);
  // profile dialogs are in-app too: removing a person asks first, a blocked edit never uses a native box
  w.eval(`household={name:'T',code:'abc-123',personId:'a'}; people=[{id:'a',name:'T',photo:null},{id:'b',name:'U',photo:null}]; adminUnlockedFlag=true; renderAdminList();`);
  w.adminRemove(d.querySelector('#peopleList [data-pid="b"] .person-remove'));
  ok(open() && $('confirmCancel').style.display!=='none' && /Remove U/.test($('confirmTitle').textContent),'remove person asks in-app first');
  $('confirmCancel').click(); await sleep(5);
  ok(!open() && w.eval('people.length')===2,'cancel keeps the person');
  w.adminRemove(d.querySelector('#peopleList [data-pid="b"] .person-remove')); $('confirmOk').click(); await sleep(5);
  ok(!open() && w.eval('people.length')===1,'confirm removes the person');
  w.eval(`adminUnlockedFlag=false`);
  // --- bad image ---
  const origImage=w.Image; w.Image=function(){ const i={}; setTimeout(()=>i.onerror&&i.onerror(),0); Object.defineProperty(i,'src',{set(){}}); return i; };
  let cancelled=0; w.cropPhotoFile(new w.File(['x'],'x.jpg'),()=>{},()=>{cancelled++;}); await sleep(50);
  ok(cancelled===1 && open() && /read that image/.test($('confirmMsg').textContent),'unreadable image: cancel callback + in-app notice'); $('confirmOk').click();
  w.Image=origImage;
  // --- copy fallback ---
  w.eval(`household={name:'T',code:'abc-123'}`);
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('no'))},configurable:true});
  w.copyHouseholdCode('code'); await sleep(20);
  ok(open() && $('confirmField').style.display!=='none' && $('confirmField').value==='abc-123','clipboard failure shows selectable copy field'); esc(); await sleep(5);
  ok($('confirmField').style.display==='none'||!open(),'copy dialog closes');
  w.askConfirm({message:'q'}); ok($('confirmField').style.display==='none' && $('confirmCancel').style.display!=='none','confirm after notice resets variant'); $('confirmCancel').click();
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})().catch(e=>{console.log('ERR',e); process.exit(2);});
