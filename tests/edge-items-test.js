// Edge cases for budget items: odd input, old-format data, escaping, totals, undo after changes elsewhere,
// double taps, repeats at year ends, trash timing, search with symbols, filters that hide everything, big boards.
const {sleep,ok,boot,mk,setItems,finish}=require('./lib/h.js');
const safe=(fn,dflt)=>{ try { return fn(); } catch(e){ console.log('  threw: '+e.message); return dflt; } };
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const errors=[]; w.addEventListener('error',e=>errors.push(e.message));
  const M0=w.eval('FUTURE_MONTHS[0]'), M1=w.eval('FUTURE_MONTHS[1]');
  const item=id=>w.eval(`items.find(i=>i.id===${JSON.stringify(id)})`);
  const names=()=>[...d.querySelectorAll('#itemsList .item-card .item-name')].map(x=>x.textContent);
  const needed=()=>$('statNeeded').textContent;
  const raw=arr=>w.eval(`items=${JSON.stringify(arr)}; render();`);
  const undo=()=>$('toastUndo').click();
  const confirmOpen=()=>$('confirmOverlay').style.display==='flex';
  const closeConfirm=()=>{ if(confirmOpen()) $('confirmOk').click(); };
  // fills the Add dialog and saves; returns the items added
  const add=(name,cost,more)=>{
    const before=w.eval('items.length');
    w.openItemModal(); $('f_name').value=name; $('f_cost').value=cost;
    if(more) more();
    w.saveItem();
    return w.eval(`items.slice(${before})`);
  };

  // ---------- empty board ----------
  raw([]);
  ok(needed()==='$0' && $('statCount').textContent==='0' && /Nothing on the board yet/.test($('itemsList').textContent),'0 items: $0, 0 count, friendly empty message');
  ok(!$('collapseAllBtn'),'0 items: no Collapse all');

  // ---------- old-format / odd data never breaks the board ----------
  const legacy=[
    {id:1,name:'String cost',category:'Home',cost:'100',month:M0,completed:false},
    {id:2,name:'Number cost',category:'Home',cost:50,month:M0,completed:false},
    {id:3,name:'NaN cost',category:'Home',cost:null,month:M0,completed:false},
    {id:4,name:'No category',cost:10,month:M0,completed:false},
    {id:5,name:'Null category',category:null,cost:10,month:M0,completed:false},
    {id:6,name:'No month',category:'Home',cost:10,completed:false},
    {id:7,name:'Odd month',category:'Home',cost:10,month:'Sometime',completed:false},
    {id:8,name:null,category:'Home',cost:10,month:M0,completed:false},
    {id:'abc',name:'String id',category:'Home',cost:10,month:M0,completed:false},
    {id:10,name:'Bad repeat',category:'Home',cost:10,month:M0,completed:false,repeat:{every:'x',unit:'fortnight'}},
    {id:11,name:'String deletedAt',category:'Home',cost:999,month:M0,completed:false,deletedAt:String(Date.now())},
  ];
  safe(()=>raw(legacy));
  ok(errors.length===0,'odd data renders without errors '+errors.join(' | '));
  ok(names().length===10,'all 10 live odd items get a card ('+names().length+')');
  ok(needed()==='$220','totals add a cost stored as text as a number, skip missing costs ('+needed()+')');
  ok([...d.querySelectorAll('#itemsList .mg-name')].map(x=>x.textContent).slice(-2).join()==='Sometime,No date yet','unreadable month sorts after real months, missing month goes to No date yet');
  ok(!d.querySelector('[data-item-id="10"] .tag-repeat'),'unreadable repeat shows no 🔁');
  ok(w.eval('isDeleted(items.find(i=>i.id===11))') && !names().includes('String deletedAt'),'deletedAt stored as text still counts as deleted');
  // a text id still works from the card's checkbox and ⋯
  const sbox=d.querySelector('[data-item-id="abc"] .complete-check');
  safe(()=>{ sbox.checked=true; sbox.dispatchEvent(new w.Event('change',{bubbles:true})); });
  ok(confirmOpen() && /String id/.test($('confirmMsg').textContent),'checkbox on an item with a text id opens Mark complete');
  $('confirmCancel').click(); await sleep(10);
  safe(()=>d.querySelector('[data-item-id="abc"] .card-more').click());
  ok($('itemOverlay').style.display==='flex' && $('f_name').value==='String id','⋯ on an item with a text id opens it');
  w.closeItemModal();
  // the category filter copes with a missing category
  safe(()=>{ w.eval('filtersOpen=true; render()'); });
  ok(errors.length===0 && d.querySelectorAll('#categoryFilter .month-pill').length>=2,'category pills draw with missing categories');
  // a completed repeating item with an unreadable repeat leaves no copy
  safe(()=>w.eval('finishCompleting(10,{})')); await sleep(10);
  ok(item(10).completed===true && w.eval('items.length')===11,'unreadable repeat: completes, no copy');
  // search over odd data
  safe(()=>{ w.eval(`searchOpen=true; searchQuery='cost'; renderCore()`); });
  ok(errors.length===0 && d.querySelectorAll('#searchBudget .item-card').length===3,'search over odd data works ('+d.querySelectorAll('#searchBudget .item-card').length+')');
  w.eval(`searchOpen=false; searchQuery=''; renderCore()`);
  // Deleted items list with odd data
  w.eval('items.find(i=>i.id===4).deletedAt=Date.now(); items.find(i=>i.id===8).deletedAt=Date.now()');
  safe(()=>w.renderTrashList());
  ok(errors.length===0 && d.querySelectorAll('#trashList .trash-item').length===3,'Deleted items list draws odd items');

  // ---------- escaping ----------
  const evil='<img src=x onerror="window.__pwned=1">"\'&<b>';
  raw([mk({id:1,name:evil,category:'<i>cat</i>',subcategory:'<u>s</u>',owner:'<b>o</b>',month:M0,note:'<script>x</script> https://a.example/"><b>',link:'https://ex.com/"onmouseover="x'})]);
  const card=d.querySelector('[data-item-id="1"]');
  ok(card.querySelector('.item-name').textContent===evil && !card.querySelector('img[src="x"]') && !card.querySelector('.item-name b'),'name with HTML shows as text on the card');
  ok(card.querySelector('.tag-cat').textContent==='<i>cat</i>' && !card.querySelector('.tag-cat i') && !card.querySelector('.tag-subcat u'),'category / subcategory with HTML are text');
  ok(!card.querySelector('script') && !card.querySelector('.note-text b'),'note with HTML is text');
  ok(card.querySelector('.card-more').getAttribute('aria-label')==='Edit '+evil,'quotes in the name survive the ⋯ label');
  ok([...card.querySelectorAll('a')].every(a=>/^https:/.test(a.getAttribute('href')) && !a.hasAttribute('onmouseover')),'link chips stay plain https links');
  w.eval('filtersOpen=true; render()');
  ok(!d.querySelector('#categoryFilter i'),'category pill with HTML is text');
  w.deleteItem(1);
  ok($('toast').querySelector('.toast-msg').textContent.includes('<img') && !$('toast').querySelector('img'),'toast shows HTML-looking name as text');
  w.renderTrashList();
  ok(!d.querySelector('#trashList img') && d.querySelector('#trashList .trash-item-name').textContent===evil,'Deleted items shows it as text');
  undo();
  w.eval(`searchOpen=true; searchQuery=${JSON.stringify('<img')}; renderCore()`);
  ok(d.querySelectorAll('#searchBudget .item-card').length===1 && !d.querySelector('#searchView img[src="x"]'),'search for "<img" finds it as text');
  w.eval(`searchQuery=${JSON.stringify('<zz onerror=1>')}; renderCore()`);
  ok(/No matches/.test($('searchResults').textContent) && !d.querySelector('#searchResults zz'),'"No matches for" shows the typed HTML as text');
  w.eval(`searchOpen=false; searchQuery=''; renderCore()`);
  ok(w.__pwned===undefined,'nothing ran from the HTML-looking text');

  // ---------- adding: names ----------
  raw([]);
  let r=add('   ','50'); closeConfirm();
  ok(r.length===0,'a name of only spaces is refused');
  r=add('Bike 🚲 ✨','50');
  ok(r.length===1 && r[0].name==='Bike 🚲 ✨','emoji name kept as typed');
  r=add('מתנה ליום הולדת','50');
  ok(r.length===1 && r[0].name==='מתנה ליום הולדת' && names().includes('מתנה ליום הולדת'),'right-to-left name kept and shown');
  r=add('x'.repeat(5000),'50');
  ok(r.length===1 && r[0].name.length===200,'a huge pasted name is cut to 200 characters ('+(r[0]&&r[0].name.length)+')');
  ok($('f_name').getAttribute('maxlength')==='200','name field allows 200 characters, like to-dos');

  // ---------- adding: amounts ----------
  raw([]);
  r=add('Zero','0'); const zeroMsg=confirmOpen(); closeConfirm();
  ok(r.length===0 && zeroMsg,'cost 0 is refused with a message');
  r=add('Negative','-50'); const negMsg=confirmOpen()&&$('confirmMsg').textContent; closeConfirm();
  ok(r.length===0 && /more than \$0/.test(negMsg||''),'a negative cost is refused ('+negMsg+')');
  r=add('Huge','1e400'); closeConfirm();
  ok(r.length===0,'an impossible cost (1e400 = Infinity) is refused');
  r=add('Too big','2000000000'); closeConfirm();
  ok(r.length===0,'a cost over $1,000,000,000 is refused');
  r=add('Billion','1000000000');
  ok(r.length===1 && r[0].cost===1e9 && needed()==='$1,000,000,000','$1,000,000,000 is allowed and totals right');
  r=add('Comma','1,200.50'); closeConfirm();
  ok(r.length===0,'"1,200.50" (not a number in a number field) is refused, not saved as $1');
  r=add('Dollar','$'); closeConfirm();
  ok(r.length===0,'"$" is refused');
  r=add('Cents','12.345');
  ok(r.length===1 && r[0].cost===12.35,'cost rounds to cents ('+(r[0]&&r[0].cost)+')');
  r=add('Small','0.01');
  ok(r.length===1 && r[0].cost===0.01,'one cent is allowed');
  ok(w.eval('items.every(i=>typeof i.cost==="number" && isFinite(i.cost))'),'every saved cost is a real number');

  // ---------- double taps ----------
  raw([]);
  w.openItemModal(); $('f_name').value='Twice'; $('f_cost').value='10'; w.saveItem(); w.saveItem();
  ok(w.eval('items.length')===1,'Save tapped twice adds the item once');
  setItems(w,[{id:1,name:'Tap',month:M0,cost:10,repeat:{every:1,unit:'month'}}]);
  w.eval('finishCompleting(1,{}); finishCompleting(1,{})');
  ok(w.eval('items.length')===2 && w.eval('items.filter(i=>!i.completed).length')===1,'completing twice leaves one copy');
  setItems(w,[{id:1,name:'Tap',month:M0,cost:10}]);
  const p1=w.completeItem(1), p2=w.completeItem(1);
  closeConfirm(); await p1; await p2; await sleep(1700);
  ok(item(1).completed===true && w.eval('items.length')===1,'two Mark complete dialogs in a row complete once');

  // ---------- actual price at completion ----------
  for(const [typed,expect] of [['-5',undefined],['abc',undefined],['1e9',1e9],['0',0],['19.999',20]]){
    setItems(w,[{id:1,name:'Pay',month:M0,cost:10}]);
    const p=w.completeItem(1); $('confirmAmount').value=typed; $('confirmOk').click();
    if(confirmOpen()) $('confirmSkip').click();
    await p; await sleep(1600);
    ok(item(1).completed===true && item(1).actualCost===expect,`actual price "${typed}" -> ${expect} (${item(1).actualCost})`);
  }

  // ---------- repeats across the year end ----------
  const nextOf=(m,rep)=>w.eval(`nextRepeatMonth(${JSON.stringify(m)},${JSON.stringify(rep)})`);
  ok(nextOf('Dec 2026',{every:1,unit:'month'})==='Jan 2027','monthly in December -> January next year');
  ok(nextOf('Nov 2026',{every:3,unit:'month'})==='Feb 2027','every 3 months crosses the year');
  ok(nextOf('Feb 2028',{every:1,unit:'year'})==='Feb 2029','yearly from a leap-year February');
  ok(nextOf('Jan 2027',{every:99,unit:'year'})==='Jan 2126','every 99 years');
  ok(nextOf('Dec 2026',{every:1,unit:'week'})==='Jan 2027','weekly lands next month');
  ok(nextOf('No date yet',{every:1,unit:'month'})==='No date yet','No date yet stays No date yet');
  ok(nextOf('Sometime',{every:1,unit:'month'})==='No date yet','an unreadable month gives No date yet');
  setItems(w,[{id:1,name:'Past',month:'Jan 2020',cost:10,repeat:{every:1,unit:'year'}}]);
  w.eval('finishCompleting(1,{})');
  ok(w.eval('items[1].month')==='Jan 2021' && names().includes('Past'),'a past-month repeat makes its copy (shown on the board)');
  w.editItem(w.eval('items[1].id'));
  ok($('f_month').value==='Jan 2021','editing a past-month item keeps its month selected');
  w.closeItemModal();

  // ---------- undo after a change somewhere else ----------
  setItems(w,[{id:1,name:'Edit me',month:M0,cost:100},{id:2,name:'Other',month:M0,cost:5}]);
  w.editItem(1); $('f_name').value='Edited'; w.saveItem();
  w.eval('items.find(i=>i.id===1).completed=true; items.find(i=>i.id===1).actualCost=90');   // someone ticked it off meanwhile
  undo();
  ok(item(1).name==='Edit me' && item(1).completed===true && item(1).actualCost===90,'undoing an edit keeps a completion made elsewhere since');
  setItems(w,[{id:1,name:'Edit me',month:M0,cost:100}]);
  w.editItem(1); $('f_cost').value='200'; w.saveItem();
  w.eval('items.find(i=>i.id===1).deletedAt=Date.now()');   // someone removed it meanwhile
  undo();
  ok(item(1).cost===100 && w.eval('isDeleted(items.find(i=>i.id===1))'),'undoing an edit does not bring back an item removed elsewhere');
  setItems(w,[{id:1,name:'Edit me',month:M0,cost:100,owner:'Sam'}]);
  w.editItem(1); $('f_cost').value='200'; w.saveItem();
  w.eval('items.find(i=>i.id===1).owner="Alex"');   // someone else changed a different field
  undo();
  ok(item(1).cost===100 && item(1).owner==='Alex','undoing an edit only puts back what this edit changed');
  setItems(w,[{id:1,name:'Gone',month:M0,cost:100}]);
  w.deleteItem(1);
  w.eval('items=items.filter(i=>i.id!==1)');   // deleted forever on another phone
  safe(()=>undo());
  ok(w.eval('items.length')===0,'undo of a removal after it was deleted forever does nothing');
  setItems(w,[{id:1,name:'Rep',month:M0,cost:100,repeat:{every:1,unit:'month'}}]);
  w.eval('finishCompleting(1,{actualCost:80})');
  const copyId=w.eval('items[1].id');
  w.eval(`items.find(i=>i.id===${copyId}).cost=150`);
  undo();
  ok(w.eval('items.length')===1 && item(1).completed===false,'undo of a repeat completion removes the copy even after it was changed');
  setItems(w,[{id:1,name:'Edit open',month:M0,cost:100}]);
  w.editItem(1); w.eval('items.find(i=>i.id===1).deletedAt=Date.now()');   // removed while the window is open
  $('f_name').value='Edit open 2'; w.saveItem();
  ok(w.eval('liveItems().length')===1 && w.eval('liveItems()[0].name')==='Edit open 2','saving an item removed elsewhere while open adds it back once');

  // ---------- trash timing ----------
  const now=Date.now(), DAY=86400000;
  setItems(w,[{id:1,name:'Exactly 30',deletedAt:now-30*DAY},{id:2,name:'30 and a bit',deletedAt:now-30*DAY-1},{id:3,name:'Live'}]);
  w.eval(`purgeTrash(${now})`);
  ok(w.eval('items.map(i=>i.id).join()')==='1,3','purge keeps exactly 30 days, erases anything older');
  w.renderTrashList();
  ok(/0 days left/.test($('trashList').textContent),'last day shows 0 days left');
  setItems(w,[{id:1,name:'Live'}]);
  const e0=await w.emptyTrash();
  ok(e0===false && !confirmOpen(),'Empty with nothing deleted asks nothing');
  const f0=await w.deleteItemForever(1);
  ok(f0===false && w.eval('items.length')===1,'Delete forever cannot erase a live item');
  w.restoreDeletedItem(1);
  ok(item(1).name==='Live' && !('deletedAt' in item(1)),'Restore on a live item changes nothing');

  // ---------- search with symbols ----------
  setItems(w,[{id:1,name:'Car (front) [tires]',month:M0,cost:100},{id:2,name:'a.b*c',month:M0,cost:1200.5},{id:3,name:'Plain',month:M0,cost:7}]);
  const hits=q=>{ w.eval(`searchOpen=true; searchQuery=${JSON.stringify(q)}; renderCore()`); return d.querySelectorAll('#searchBudget .item-card').length; };
  ok(safe(()=>hits('('),-1)===1 && safe(()=>hits('[tires]'),-1)===1,'search for brackets matches literally');
  ok(safe(()=>hits('.*'),-1)===0 && safe(()=>hits('b*c'),-1)===1,'".*" is not a pattern, "b*c" matches literally');
  ok(safe(()=>hits('$1,200.50'),-1)===1 && safe(()=>hits('$100'),-1)===1,'search by amount as shown');
  ok(safe(()=>hits('\\'),-1)===0 && errors.length===0,'a backslash does not break search');
  w.eval(`searchOpen=false; searchQuery=''; renderCore()`);

  // ---------- filters that hide everything ----------
  setItems(w,[{id:1,name:'A',category:'Home',month:M0,cost:10},{id:2,name:'B',category:'Kids',month:M0,cost:20,completed:true}]);
  w.eval(`activeCategoryFilter='Kids'; render()`);
  ok(/Nothing matches this filter/.test($('itemsList').textContent) && needed()==='$0','a filter whose items are all done: message and $0');
  w.eval(`activeCategoryFilter='Gone'; render()`);
  ok(w.eval('activeCategoryFilter')==='All' && names().join()==='A','a filter for a category nobody uses any more resets to All');
  w.eval(`activeCategoryFilter='Home'; items.find(i=>i.id===1).deletedAt=Date.now(); render()`);
  ok(w.eval('activeCategoryFilter')==='All','removing the last item in the filtered category resets the filter');

  // ---------- collapse all ----------
  setItems(w,[{id:1,name:'One',month:M0}]);
  ok(!$('collapseAllBtn'),'one month: no Collapse all');
  setItems(w,[{id:1,name:'One',month:M0},{id:2,name:'Two',month:M1}]);
  $('collapseAllBtn').click();
  ok(d.querySelectorAll('#itemsList .month-group-body[hidden]').length===2 && $('collapseAllBtn').textContent==='Expand all','Collapse all folds both months');
  w.eval(`items.push(${JSON.stringify(mk({id:3,name:'Three',month:'No date yet'}))}); render()`);
  ok($('collapseAllBtn').textContent==='Collapse all' && names().join()==='Three','a new month shows open and the link says Collapse all');
  $('collapseAllBtn').click(); $('collapseAllBtn').click();
  ok(d.querySelectorAll('#itemsList .month-group-body[hidden]').length===0,'Expand all opens everything');

  // ---------- 1000 items ----------
  const many=[]; for(let i=1;i<=1000;i++) many.push({id:i,name:'Item '+i,month:FUT(i%24),cost:i%7===0?0.5:10,category:['Home','Kids','Pets'][i%3]});
  function FUT(k){ return w.eval(`FUTURE_MONTHS[${k}]`); }
  w.eval(`boardCardsDrawn=false`);
  setItems(w,many);
  const expected=many.reduce((s,i)=>s+i.cost,0);
  ok(needed()==='$'+Math.round(expected).toLocaleString('en-US') && $('statCount').textContent==='1000','1000 items: count and total right ('+needed()+')');
  w.finishLaterCards();
  ok(d.querySelectorAll('#itemsList .item-card').length===1000,'1000 items: every card drawn once');
  // switching sides while the batches are still coming
  w.eval(`boardCardsDrawn=false`); setItems(w,many);
  w.setSide('todo'); w.setSide('budget'); w.setSide('todo'); w.setSide('budget');
  await sleep(300);
  const ids=[...d.querySelectorAll('#itemsList .item-card')].map(c=>c.dataset.itemId);
  ok(ids.length===1000 && new Set(ids).size===1000,'quick side switching mid-draw: every card exactly once ('+ids.length+')');
  w.setSide('budget');

  // ---------- an owner taken off the household ----------
  setItems(w,[{id:1,name:'Owned',month:M0,owner:'Pat'}]);
  w.editItem(1);
  ok($('f_owner').value==='Pat','an owner no longer in the household stays selected when editing');
  w.saveItem();
  ok(item(1).owner==='Pat','saving keeps that owner');

  ok(errors.length===0,'no page errors overall '+errors.join(' | '));
  finish();
})().catch(e=>{ console.log('FAIL crashed: '+(e&&e.stack||e)); process.exit(1); });
