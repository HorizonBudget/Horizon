const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const M=i=>w.eval(`FUTURE_MONTHS[${i}]`);
  const type=v=>{ $('searchInput').value=v; $('searchInput').dispatchEvent(new w.Event('input',{bubbles:true})); };
  const cards=()=>[...d.querySelectorAll('#itemsList .item-card .item-name')].map(x=>x.textContent).sort();
  const heads=()=>[...d.querySelectorAll('#itemsList .month-group-btn')].map(h=>h.querySelector('.mg-name').textContent+'='+h.querySelector('.mg-total').textContent);
  setItems(w,[
    {id:1,name:'Washing machine',category:'Home',subcategory:'Laundry',owner:'Sam',month:M(0),cost:700,note:'Check ENERGY rating',link:'https://www.amazon.com/dp/B01'},
    {id:2,name:'Tires',category:'Vehicle',subcategory:'Honda Civic',owner:'Alex',month:M(0),cost:600},
    {id:3,name:'Gift',category:'Holidays & Gifts',owner:'',month:M(1),cost:80,note:'for Grandma'},
    {id:4,name:'Bike helmet',category:'Kids',owner:'Alex',month:'No date yet',cost:40,link:'kids-shop.example.com'},
    {id:5,name:'Deleted washer',category:'Home',month:M(0),cost:5000,deletedAt:Date.now()},
    {id:6,name:'Old washing mat',category:'Home',month:M(0),cost:9,completed:true,owner:'Sam'},
    {id:7,name:'Done tires',category:'Vehicle',month:M(0),cost:9,completed:true,note:'alex did it'},
  ]);
  // ---- position + a11y
  const btn=$('searchBtn');
  ok(btn.nextElementSibling===$('activityWrap') && btn.parentElement===$('activityWrap').parentElement,'search button sits directly left of the Recent activity pill');
  ok(btn.tagName==='BUTTON' && btn.getAttribute('aria-label')==='Search items' && btn.getAttribute('aria-expanded')==='false' && $('searchRow').hidden,'closed: labelled icon button, collapsed');
  ok(!!btn.querySelector('svg'),'icon button');
  btn.click();
  ok(!$('searchRow').hidden && btn.getAttribute('aria-expanded')==='true' && d.activeElement===$('searchInput'),'opens and focuses the input');
  ok($('searchClear').hidden,'clear button hidden while empty');
  // ---- matching
  type('WASHING');
  ok(cards().join()==='Washing machine','case-insensitive name match, completed + deleted excluded: '+cards());
  ok(!$('searchClear').hidden,'clear button appears');
  type('laundry'); ok(cards().join()==='Washing machine','subcategory');
  type('vehicle'); ok(cards().join()==='Tires','category');
  type('alex'); ok(cards().join()==='Bike helmet,Tires','owner (and not note of completed)');
  type('energy'); ok(cards().join()==='Washing machine','note');
  type('amazon.com'); ok(cards().join()==='Washing machine','link (matches url)');
  type('kids-shop'); ok(cards().join()==='Bike helmet','legacy-style link without scheme');
  type('civic'); ok(cards().join()==='Tires','multi-word subcategory');
  type('  gift  '); ok(cards().join()==='Gift','query trimmed');
  type('deleted'); ok(cards().length===0 && /No items match “deleted”/.test($('itemsList').textContent),'deleted items never match; empty state text');
  type('<b>x</b>'); ok($('itemsList').querySelector('.empty').textContent==='No items match “<b>x</b>”' && !$('itemsList').querySelector('.empty b'),'query is escaped in empty state');
  type('   '); ok(cards().length===4,'whitespace-only query = no filtering ('+cards().length+')');
  // ---- totals follow search
  type('alex'); ok(heads().join()===`${M(0)}=$600,No date yet=$40`,'group totals reflect search: '+heads());
  ok($('statCount').textContent==='2' && $('statNeeded').textContent==='$640','stat cards reflect search');
  // ---- combines with filters
  w.eval(`activeCategoryFilter='Kids';render()`);
  ok(cards().join()==='Bike helmet' && heads().join()==='No date yet=$40','combined with category filter');
  w.eval(`activeCategoryFilter='Vehicle';render()`);
  ok(cards().join()==='Tires','search + filter: only Tires (Alex & Vehicle)');
  w.eval(`activeCategoryFilter='Home';render()`);
  ok(cards().length===0 && /No items match/.test($('itemsList').textContent),'filter + search with no result shows the search empty state');
  w.eval(`activeCategoryFilter='All';render()`);
  ok(w.eval('typeof activeMonthFilter')==='undefined','no month filter state any more');
  // ---- completed tab
  w.switchTab('completed');
  ok(btn.getAttribute('aria-expanded')==='true' && $('searchInput').value==='alex','search persists across tabs');
  ok(cards().join()==='Done tires','search applies to Completed tab (note match): '+cards());
  type('washing'); ok(cards().join()==='Old washing mat' && /1 item checked off/.test($('filterNote').textContent),'Completed: name match + count');
  type('zzz'); ok(/No items match “zzz”/.test($('itemsList').textContent),'Completed empty state');
  type(''); ok(cards().length===2 && !/No items match/.test($('itemsList').textContent),'empty query shows all completed');
  type('washing'); w.switchTab('active');
  ok(cards().join()==='Washing machine','back on Active still filtered');
  // ---- clear + escape
  $('searchClear').click();
  ok($('searchInput').value==='' && cards().length===4 && !$('searchRow').hidden && d.activeElement===$('searchInput'),'✕ clears and keeps the input open + focused');
  type('tires');
  $('searchInput').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok($('searchRow').hidden && btn.getAttribute('aria-expanded')==='false' && cards().length===4 && d.activeElement===btn,'Escape closes, clears the filter, returns focus to the icon');
  btn.click(); type('tires'); btn.click();
  ok($('searchRow').hidden && cards().length===4,'tapping the icon again closes (and clears)');
  // ---- Escape in search does not trigger other Escape handlers badly
  w.setActivityOpen(false);
  // ---- search state does not leak into sync snapshot
  ok(!JSON.stringify(w.eval('snapshotState()')).includes('searchQuery'),'search is UI-only, not synced');
  // ---- activity pill + other tab labels unaffected
  ok(d.getElementById('tabActiveBtn').textContent==='Active' && d.getElementById('tabCompletedBtn').textContent==='Completed' && /Recent activity/.test($('activityToggle').textContent),'tabs + activity pill intact');
  // dialogs/regression: empty board with search shows search message
  setItems(w,[]); btn.click(); type('x'); ok(/No items match “x”/.test($('itemsList').textContent),'empty board + query shows no-match message');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
