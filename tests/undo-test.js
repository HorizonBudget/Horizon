const {JSDOM,html,sleep,ok,finish}=require('./lib/h.js');
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
function boot(){ return new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){ w.__cloudAdapterFactory=fakeFactory; for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error(k); }; w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{}; }}).window; }
(async()=>{
  const A=boot(), B=boot(); await sleep(50);
  for(const [W,n] of [[A,'Sam'],[B,'Alex']]){ W.document.getElementById('householdCode').value='UNDO-TEST-1234'; W.document.getElementById('yourName').value=n; await W.enterApp(); await sleep(800); }
  const d=A.document, $=id=>d.getElementById(id);
  const M0=A.eval('FUTURE_MONTHS[0]');
  const item=(W,id)=>W.eval(`items.find(i=>i.id===${id})`);
  const toast=()=>$('toast');
  const undo=()=>$('toastUndo').click();
  A.eval(`items=[${[1,2,3,4].map(i=>JSON.stringify({id:i,name:'Item '+i,category:'Home',subcategory:'',cost:100*i,month:M0,saved:0,owner:'',link:'',note:'',completed:false})).join(',')}]; render()`);
  await sleep(700);
  ok(B.eval('items.length')===4,'B has the board');
  // region semantics
  const reg=$('toastRegion');
  ok(reg.getAttribute('role')==='status' && reg.getAttribute('aria-live')==='polite' && !toast(),'live region present, no toast at rest');
  // ---- 1. remove -> undo
  A.deleteItem(1); await sleep(700);
  ok(!!toast() && /Removed “Item 1”/.test(toast().textContent) && !!$('toastUndo'),'remove shows toast with Undo');
  ok(reg.contains(toast()),'toast lives inside the aria-live region');
  ok(B.eval('liveItems().length')===3,'B saw removal');
  undo(); await sleep(700);
  ok(!A.eval('isDeleted(items.find(i=>i.id===1))') && A.eval('liveItems().length')===4 && !toast(),'undo clears deletedAt, toast gone');
  ok(B.eval('liveItems().length')===4,'undo synced to B');
  ok(/undid removing “Item 1”/.test(A.eval('activity[0].text')),'undo writes an activity entry: '+A.eval('activity[0].text'));
  // ---- 2. complete -> undo (with actual price)
  A.eval('finishCompleting(2,{actualCost:150})'); await sleep(700);
  ok(item(A,2).completed && item(A,2).actualCost===150 && /“Item 2” marked complete/.test(toast().textContent),'complete shows toast');
  ok(item(B,2).completed===true,'B sees completion');
  undo(); await sleep(700);
  ok(item(A,2).completed===false && !('actualCost' in item(A,2)),'undo restores to active and removes actual price');
  ok(item(B,2).completed===false && !('actualCost' in item(B,2)),'undo synced');
  // ---- 3. complete repeating -> undo removes the copy
  A.eval(`items.find(i=>i.id===3).repeat={every:1,unit:'month'}; render()`);
  A.eval('finishCompleting(3,{actualCost:99})'); await sleep(700);
  ok(A.eval('items.length')===5 && B.eval('items.length')===5 && /Next one added for/.test(toast().textContent),'repeat copy created + toast');
  undo(); await sleep(700);
  ok(A.eval('items.length')===4 && B.eval('items.length')===4 && item(A,3).completed===false && !('actualCost' in item(A,3)) && !!item(A,3).repeat,'undo removes the copy (hard, not in Deleted items) and un-completes; repeat setting kept');
  ok(A.eval('items.filter(isDeleted).length')===0,'no trash entry left by undo');
  // ---- 4. restore -> undo
  A.eval('finishCompleting(4,{actualCost:300})'); toast(); // toast replaced below
  await sleep(100); A.eval('restoreItem(4)'); await sleep(700);
  ok(item(A,4).completed===false && !('actualCost' in item(A,4)) && /moved back to Active/.test(toast().textContent),'restore shows toast');
  undo(); await sleep(700);
  ok(item(A,4).completed===true && item(A,4).actualCost===300 && item(B,4).completed===true && item(B,4).actualCost===300,'undo of restore re-completes with the original actual price (synced)');
  // ---- 5. edit -> undo
  A.eval(`items.find(i=>i.id===4).completed=false;delete items.find(i=>i.id===4).actualCost;render()`);
  A.editItem(1);
  $('f_name').value='Renamed'; $('f_cost').value='777'; $('f_note').value='hello'; $('f_repeat').value='year'; A.onRepeatChange();
  A.saveItem(); await sleep(700);
  ok(item(A,1).name==='Renamed' && item(A,1).cost===777 && item(A,1).repeat.unit==='year' && /Saved changes to “Renamed”/.test(toast().textContent),'edit saved + toast');
  ok(item(B,1).name==='Renamed','B sees edit');
  undo(); await sleep(700);
  ok(item(A,1).name==='Item 1' && item(A,1).cost===100 && item(A,1).note==='' && !('repeat' in item(A,1)),'undo restores previous values (and removes a repeat that did not exist)');
  ok(item(B,1).name==='Item 1' && !('repeat' in item(B,1)),'edit undo synced');
  // edit completed item's actual price + undo
  A.eval(`finishCompleting(4,{actualCost:300})`); await sleep(50);
  A.editItem(4); $('f_actual').value='250'; A.saveItem(); ok(item(A,4).actualCost===250,'actual price edit'); undo(); ok(item(A,4).actualCost===300,'undo of actual price edit');
  // ---- one toast at a time
  A.deleteItem(2); A.deleteItem(3);
  ok(d.querySelectorAll('#toastRegion .toast').length===1 && /Item 3/.test(toast().textContent),'a new toast replaces the old one');
  undo(); ok(A.eval('isDeleted(items.find(i=>i.id===3))')===false && A.eval('isDeleted(items.find(i=>i.id===2))')===true,'undo only affects the latest action');
  // ---- timing
  const t0=Date.now(); A.deleteItem(1);
  await sleep(5500); ok(!!toast(),'still visible at 5.5s');
  await sleep(900); ok(!toast(),'auto-hides after about 6s ('+(Date.now()-t0)+'ms)');
  A.eval('restoreDeletedItem(1)'); ok(!toast(),'restoring from Deleted items shows no toast (not requested)');
  // ---- Escape safety
  A.deleteItem(1); toast().dispatchEvent(new A.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok(!toast() && A.eval('isDeleted(items.find(i=>i.id===1))')===true,'Escape on the toast dismisses it without undoing');
  A.eval('restoreDeletedItem(1)');
  A.deleteItem(1); d.dispatchEvent(new A.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok(!!toast(),'Escape elsewhere does not drop the toast or throw');
  // dialog open: toast under overlay (z-index) -- check CSS values
  ok(/z-index:45/.test(html.replace(/\s/g,'').match(/\.toast-region\{[^}]*\}/)[0]) && /z-index:50/.test(html.replace(/\s/g,'').match(/\.overlay\{[^}]*\}/)[0]),'toast sits below modal overlays');
  // undo after the item was erased elsewhere does not throw
  A.eval(`items=items.filter(i=>i.id!==1)`); let threw=false; try{ undo(); }catch(e){ threw=true; } ok(!threw,'undo of a vanished item is a no-op');
  // plain toast (backup) has no Undo
  A.showToast('Hello'); ok(!$('toastUndo') && toast().textContent==='Hello','toast without undo shows no button');
  // hover pauses
  A.deleteItem(2); toast().dispatchEvent(new A.MouseEvent('mouseenter')); await sleep(6300); ok(!!toast(),'hovering keeps the toast up'); toast().dispatchEvent(new A.MouseEvent('mouseleave')); await sleep(6300); ok(!toast(),'leaving lets it expire');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
