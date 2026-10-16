const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const M0=w.eval('FUTURE_MONTHS[0]');
  const open=()=>$('confirmOverlay').style.display==='flex';
  const esc=()=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const item=id=>w.eval(`items.find(i=>i.id===${id})`);
  const box=id=>d.querySelector(`[data-item-id="${id}"] .complete-check`);
  const check=id=>{ const b=box(id); b.checked=true; b.dispatchEvent(new w.Event('change',{bubbles:true})); };
  const ANIM=1500;
  setItems(w,[{id:1,name:'Boat',month:M0,cost:1000},{id:2,name:'Tires',month:M0,cost:600,category:'Vehicle'},{id:3,name:'Gift',month:M0,cost:80},{id:4,name:'Lamp',month:M0,cost:42.5},{id:5,name:'Rug',month:M0,cost:200},{id:6,name:'Desk',month:M0,cost:300}]);
  // ---- dialog appears, nothing completes yet
  check(1);
  ok(open() && $('confirmTitle').textContent==='Mark complete' && /Boat/.test($('confirmMsg').textContent),'checking opens the completion dialog');
  ok($('confirmAmountWrap').style.display!=='none' && /What did you actually pay\? \(optional\)/.test($('confirmAmountLabel').textContent),'amount field with the right label');
  ok($('confirmOk').textContent==='Mark complete' && $('confirmSkip').textContent==='Skip' && $('confirmSkip').style.display!=='none','Mark complete + Skip buttons');
  ok($('confirmAmount').getAttribute('inputmode')==='decimal' && $('confirmAmount').type==='number','currency input is numeric');
  ok(d.activeElement===$('confirmAmount'),'amount field is focused');
  ok(item(1).completed===false && box(1).checked===true,'item still active while asking');
  // ---- Cancel
  $('confirmCancel').click(); await sleep(10);
  ok(!open() && item(1).completed===false && box(1).checked===false && !('actualCost' in item(1)),'Cancel: active, checkbox unchecked');
  check(1); esc(); await sleep(10);
  ok(!open() && item(1).completed===false && box(1).checked===false,'Escape: active, checkbox unchecked');
  check(1); $('confirmOverlay').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true})); await sleep(10);
  ok(!open() && item(1).completed===false && box(1).checked===false,'backdrop: active, checkbox unchecked');
  // typed text then cancel -> nothing stored
  check(1); $('confirmAmount').value='55'; $('confirmCancel').click(); await sleep(10);
  ok(!('actualCost' in item(1)) && item(1).completed===false,'typed amount then Cancel stores nothing');
  // ---- animation still runs after confirming
  check(1); $('confirmAmount').value='900'; $('confirmOk').click(); await sleep(30);
  const card=d.querySelector('[data-item-id="1"]');
  ok(!open() && !!card && card.classList.contains('card-strike') && item(1).completed===false,'animation starts after dialog (strike), item not yet marked');
  await sleep(ANIM+200);
  ok(item(1).completed===true && item(1).actualCost===900 && typeof item(1).actualCost==='number','amount typed -> completed with numeric actualCost 900');
  ok(!d.querySelector('[data-item-id="1"]'),'card left Active after the animation');
  // ---- Skip
  check(2); $('confirmAmount').value='123'; $('confirmSkip').click(); await sleep(ANIM+200);
  ok(item(2).completed===true && !('actualCost' in item(2)),'Skip completes without an amount even if something was typed');
  // ---- empty Mark complete
  check(3); $('confirmOk').click(); await sleep(ANIM+200);
  ok(item(3).completed===true && !('actualCost' in item(3)),'Mark complete with empty field: completed, no actualCost');
  // ---- cents + zero
  check(4); $('confirmAmount').value='39.999'; $('confirmOk').click(); await sleep(ANIM+200);
  ok(item(4).actualCost===40,'amount rounded to cents (39.999 -> 40)');
  check(5); $('confirmAmount').value='0'; $('confirmOk').click(); await sleep(ANIM+200);
  ok(item(5).completed===true && item(5).actualCost===0,'typed 0 is stored as 0');
  // ---- invalid input keeps dialog open
  check(6); $('confirmAmount').value='-5'; $('confirmOk').click(); await sleep(10);
  ok(open() && item(6).completed===false && /\$0 or more/.test($('confirmAmountError').textContent),'negative amount: error, dialog stays open');
  $('confirmAmount').value='12.5'; $('confirmAmount').dispatchEvent(new w.Event('input'));
  ok($('confirmAmountError').textContent==='','error clears when typing');
  $('confirmAmount').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await sleep(ANIM+200);
  ok(item(6).completed===true && item(6).actualCost===12.5,'Enter submits');
  // ---- other dialogs unaffected by the new controls
  w.askConfirm({message:'q'});
  ok($('confirmAmountWrap').style.display==='none' && $('confirmSkip').style.display==='none','plain confirm hides amount + Skip'); $('confirmCancel').click();
  // ---- activity log
  const acts=w.eval('activity.map(a=>a.text)');
  ok(acts.some(t=>/marked “Boat” as complete — paid \$900/.test(t)),'activity mentions amount: '+acts.find(t=>/Boat/.test(t)));
  ok(acts.some(t=>/marked “Gift” as complete$/.test(t)),'activity without amount has none');
  // ---- display math on completed tab
  w.eval(`activeTab='completed';render()`);
  const cardFor=n=>[...d.querySelectorAll('#itemsList .item-card')].find(c=>c.querySelector('.item-name').textContent===n);
  const paid=n=>{ const c=cardFor(n); return c&&[c.querySelector('.paid-line')&&c.querySelector('.paid-line').textContent, c.querySelector('.paid-diff')&&c.querySelector('.paid-diff').textContent, c.querySelector('.paid-diff')&&c.querySelector('.paid-diff').className]; };
  ok(JSON.stringify(paid('Boat'))===JSON.stringify(['Paid $900','$100 under','paid-diff under']),'under: '+paid('Boat'));
  ok(paid('Desk')[0]==='Paid $12.50' && paid('Desk')[1]==='$287.50 under','cents shown when needed: '+paid('Desk'));
  ok(paid('Rug')[0]==='Paid $0' && paid('Rug')[1]==='$200 under','Paid $0 shown: '+paid('Rug'));
  ok(paid('Lamp')[0]==='Paid $40' && paid('Lamp')[1]==='$2.50 under','Lamp 42.50 vs 40: '+paid('Lamp'));
  ok(paid('Tires')[0]===null && paid('Tires')[2]===null,'no paid line without actualCost');
  w.eval(`items.find(i=>i.id===3).actualCost=100;items.find(i=>i.id===2).actualCost=600;render()`);
  ok(paid('Gift')[1]==='$20 over' && paid('Gift')[2]==='paid-diff over','over: '+paid('Gift'));
  ok(paid('Tires')[1]==='on forecast' && paid('Tires')[2]==='paid-diff even','equal: '+paid('Tires'));
  // legacy / corrupt actualCost values ignored
  w.eval(`items.find(i=>i.id===4).actualCost='abc';items.find(i=>i.id===5).actualCost=-3;render()`);
  ok(paid('Lamp')[0]===null && paid('Rug')[0]===null,'non-numeric / negative actualCost ignored');
  w.eval(`items.find(i=>i.id===4).actualCost=40;items.find(i=>i.id===5).actualCost=0;render()`);
  // active cards never show paid
  w.eval(`activeTab='active';items.push(${JSON.stringify({id:7,name:'Active one',category:'Home',cost:5,month:M0,completed:false,actualCost:3})});render()`);
  ok(!d.querySelector('#itemsList .paid-line'),'active cards never show Paid');
  w.eval(`items=items.filter(i=>i.id!==7);activeTab='completed';render()`);
  // ---- edit modal for a completed item
  w.editItem(1);
  ok($('actualRow').style.display!=='none' && $('f_actual').value==='900' && /Actual price \(optional\)/.test($('actualRow').textContent),'edit modal shows Actual price field, prefilled');
  $('f_actual').value='1100'; w.saveItem();
  ok(item(1).actualCost===1100 && item(1).completed===true,'edited actual price saved');
  w.render();
  ok(paid('Boat')[1]==='$100 over','card now shows over: '+paid('Boat'));
  w.editItem(1); $('f_actual').value=''; w.saveItem();
  ok(!('actualCost' in item(1)),'clearing the field removes actualCost');
  w.editItem(1); $('f_actual').value='-4'; w.saveItem();
  ok(open() && /actual price/i.test($('confirmMsg').textContent) && $('itemOverlay').style.display==='flex' && !('actualCost' in item(1)),'invalid actual price: notice, modal stays open'); $('confirmOk').click();
  w.closeItemModal();
  w.eval(`activeTab='active';items.push(${JSON.stringify({id:8,name:'Fresh',category:'Home',cost:5,month:M0,completed:false})});render()`);
  w.editItem(8); ok($('actualRow').style.display==='none','active item edit: no Actual price field'); w.closeItemModal();
  w.openItemModal(); ok($('actualRow').style.display==='none' && $('f_actual').value==='','new item: no Actual price field'); w.closeItemModal();
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
