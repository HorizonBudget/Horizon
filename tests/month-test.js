const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const M=i=>w.eval(`FUTURE_MONTHS[${i}]`);
  const heads=()=>[...d.querySelectorAll('#itemsList .month-group-btn')];
  const info=h=>({name:h.querySelector('.mg-name').textContent,count:h.querySelector('.mg-count').textContent,total:h.querySelector('.mg-total').textContent,exp:h.getAttribute('aria-expanded')});
  const names=()=>heads().map(h=>info(h).name);
  const cards=()=>[...d.querySelectorAll('#itemsList .item-card .item-name')].map(x=>x.textContent);
  setItems(w,[
    {id:1,name:'Undated',month:'No date yet',cost:50},
    {id:2,name:'Later',month:M(5),cost:1000,category:'Vehicle'},
    {id:3,name:'Soon A',month:M(0),cost:300,category:'Home',subcategory:'Zed'},
    {id:4,name:'Soon B',month:M(0),cost:10.5,category:'Vehicle',subcategory:'Alpha'},
    {id:5,name:'Mid',month:M(2),cost:200,category:'Home'},
    {id:6,name:'Past',month:'Jan 2020',cost:7},
    {id:7,name:'Far',month:'Mar 2031',cost:9},
    {id:8,name:'Gone',month:M(0),cost:99999,deletedAt:Date.now()},
    {id:9,name:'Finished',month:M(0),cost:5555,completed:true},
  ]);
  ok(JSON.stringify(names())===JSON.stringify(['Jan 2020',M(0),M(2),M(5),'Mar 2031','No date yet']),'groups chronological, past first, far-future after, "No date yet" last: '+names());
  const byName=Object.fromEntries(heads().map(h=>[info(h).name,info(h)]));
  ok(byName[M(0)].count==='2 items' && byName[M(0)].total==='$310.50','group count + total with cents, ignoring deleted/completed ('+byName[M(0)].count+' '+byName[M(0)].total+')');
  ok(byName['Jan 2020'].count==='1 item' && byName['Jan 2020'].total==='$7','singular label, whole-dollar total');
  ok(byName['No date yet'].total==='$50','No date yet total');
  ok(heads().every(h=>h.getAttribute('aria-expanded')==='true' && $(h.getAttribute('aria-controls'))),'all expanded by default, aria-controls targets exist');
  ok(d.querySelector('#itemsList h3.month-group-head > button')!==null,'header is a button inside a heading');
  ok(!!$('collapseAllBtn') && $('collapseAllBtn').textContent==='Collapse all','Collapse all control shown with 2+ groups');
  ok($('collapseAllBtn').closest('.head-tools')===$('filtersBtn').closest('.head-tools') && !!$('filtersBtn').closest('.head-tools') && $('sectionTitle').parentNode===$('filtersBtn').closest('.head-tools').parentNode && !$('itemsList').contains($('collapseAllBtn')),'Collapse all shares the heading row (same tools wrapper) with Filters, not inside the list');
  ok(cards().length===7,'7 cards shown ('+cards().length+')');
  // filters
  w.eval(`activeCategoryFilter='Vehicle';render()`);
  ok(JSON.stringify(names())===JSON.stringify([M(0),M(5)]) && heads().map(h=>info(h).total).join()==='$10.50,$1,000','category filter: empty groups hidden, totals follow ('+heads().map(h=>info(h).total)+')');
  ok($('statNeeded').textContent==='$1,011','top stat unchanged logic (rounded sum)');
  ok(!$('monthFilter') && w.eval('typeof activeMonthFilter')==='undefined','month filter is gone (no pills, no state)');
  w.eval(`activeCategoryFilter='Home';render()`);
  ok(info(heads().find(h=>info(h).name===M(0))).total==='$300','Home only: Soon month total $300');
  // sort inside group
  w.eval(`activeCategoryFilter='All';render()`);
  w.eval(`SUBCATEGORIES.Home=['Zed'];SUBCATEGORIES.Vehicle=['Alpha'];activeCategoryFilter='Home';sortMode='subcategory';render()`);
  ok(JSON.stringify(names())===JSON.stringify(['Jan 2020',M(0),M(2),'Mar 2031','No date yet']),'subcategory sort keeps chronological groups');
  w.eval(`activeCategoryFilter='All';sortMode='month';SUBCATEGORIES={};render()`);
  w.eval(`items.push(${JSON.stringify({id:20,name:'Soon C',category:'Home',cost:1,month:M(0),subcategory:'Beta',completed:false})});items.find(i=>i.id===3).category='Home';SUBCATEGORIES.Home=['Zed','Beta'];activeCategoryFilter='Home';sortMode='subcategory';render()`);
  const g0=[...d.querySelectorAll('.month-group')].find(g=>g.dataset.month===M(0));
  ok([...g0.querySelectorAll('.item-name')].map(x=>x.textContent).join()==='Soon C,Soon A','within a group, subcategory sort applies: '+[...g0.querySelectorAll('.item-name')].map(x=>x.textContent));
  w.eval(`activeCategoryFilter='All';sortMode='month';SUBCATEGORIES={};items=items.filter(i=>i.id!==20);render()`);
  // collapse / persistence
  const hM0=()=>heads().find(h=>h.dataset.month===M(0));
  hM0().click();
  ok(hM0().getAttribute('aria-expanded')==='false' && ![...d.querySelectorAll('.month-group')].find(g=>g.dataset.month===M(0)).querySelector('.item-card'),'click collapses (cards removed, header stays)');
  ok(info(hM0()).total==='$310.50' && info(hM0()).count==='2 items','collapsed header still shows count + total');
  ok(d.activeElement===hM0(),'focus stays on the toggled header');
  ok(JSON.parse(w.localStorage.getItem('horizonCollapsedMonths')).join()===M(0),'collapsed state saved to localStorage');
  const w2=boot({ls:{horizonCollapsedMonths:w.localStorage.getItem('horizonCollapsedMonths')}});
  setItems(w2,JSON.parse(JSON.stringify(w.eval('items'))));
  ok([...w2.document.querySelectorAll('.month-group-btn')].find(h=>h.dataset.month===M(0)).getAttribute('aria-expanded')==='false','collapsed state restored after reload');
  ok([...w2.document.querySelectorAll('.month-group-btn')].filter(h=>h.getAttribute('aria-expanded')==='true').length===5,'other groups still expanded after reload');
  // collapse all / expand all
  $('collapseAllBtn').click();
  ok(heads().every(h=>h.getAttribute('aria-expanded')==='false') && cards().length===0 && $('collapseAllBtn').textContent==='Expand all','Collapse all collapses everything, button flips');
  ok(d.activeElement===$('collapseAllBtn'),'focus kept on the control');
  $('collapseAllBtn').click();
  ok(heads().every(h=>h.getAttribute('aria-expanded')==='true') && cards().length===7 && JSON.parse(w.localStorage.getItem('horizonCollapsedMonths')).length===0,'Expand all restores all, storage cleared');
  // collapse while filtered, then change filter: other state remembered
  hM0().click(); w.eval(`activeCategoryFilter='Home';render()`);
  ok(hM0().getAttribute('aria-expanded')==='false','collapsed state survives filter changes');
  w.eval(`activeCategoryFilter='All';render()`);
  // deleting every item of a month prunes it
  w.eval(`items.filter(i=>i.month===${JSON.stringify(M(0))}&&!i.completed).forEach(i=>i.deletedAt=Date.now());render()`);
  hM0()||0; ok(!heads().find(h=>h.dataset.month===M(0)),'group disappears when all its items are gone');
  // storage blocked
  let threw=null; let w3; try{ w3=boot({noStorage:true}); setItems(w3,[{id:1,name:'a',month:M(0)},{id:2,name:'b',month:M(1)}]); w3.document.querySelector('.month-group-btn').click(); }catch(e){ threw=e; }
  ok(!threw,'blocked storage does not break rendering or toggling ('+(threw&&threw.message)+')');
  ok(w3&&w3.document.querySelector('.month-group-btn').getAttribute('aria-expanded')==='false','toggle still works in-session without storage');
  // completed tab untouched
  w.eval(`activeTab='completed';render()`);
  ok(!d.querySelector('#itemsList .month-group') && cards().join()==='Finished' && !$('collapseAllBtn'),'Completed tab keeps the flat list');
  w.eval(`activeTab='active';render()`);
  // item with missing month
  setItems(w,[{id:1,name:'NoMonth',month:undefined},{id:2,name:'B',month:M(0)}]);
  ok(names().join()===M(0)+',No date yet','missing month grouped under No date yet');
  // empty states
  setItems(w,[]); ok(/Nothing on the board yet/.test($('itemsList').textContent) && !$('collapseAllBtn'),'empty board message');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
