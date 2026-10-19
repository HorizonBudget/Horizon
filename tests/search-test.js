// Search: a 🔍 button in the header (and the compact bar) opens one results view with budget items AND to-dos,
// whichever side is showing. Every word must match somewhere in the item; the boards themselves are never filtered.
const {sleep,ok,boot,setItems,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const M=i=>w.eval(`FUTURE_MONTHS[${i}]`);
  const type=v=>{ $('searchInput').value=v; $('searchInput').dispatchEvent(new w.Event('input',{bubbles:true})); };
  const rcards=()=>[...d.querySelectorAll('#searchBudget .item-card .item-name')].map(x=>x.textContent).sort();
  const rtodos=()=>[...d.querySelectorAll('#searchTodos .todo-row .todo-name')].map(x=>x.textContent).sort();
  const shown=el=>w.getComputedStyle(el).display!=='none' && !el.hidden;
  setItems(w,[
    {id:1,name:'Washing machine',category:'Home',subcategory:'Laundry',owner:'Sam',month:M(0),cost:700,note:'Check ENERGY rating',link:'https://www.amazon.com/dp/B01'},
    {id:2,name:'Tires',category:'Vehicle',subcategory:'Honda Civic',owner:'Alex',month:M(0),cost:600},
    {id:3,name:'Gift',category:'Holidays & Gifts',owner:'',month:M(1),cost:80,note:'for Grandma'},
    {id:4,name:'Bike helmet',category:'Kids',owner:'Alex',month:'No date yet',cost:40,link:'kids-shop.example.com'},
    {id:5,name:'Deleted washer',category:'Home',month:M(0),cost:5000,deletedAt:Date.now()},
    {id:6,name:'Old washing mat',category:'Home',month:M(0),cost:9,completed:true,owner:'Sam',actualCost:12.5},
    {id:7,name:'Done tires',category:'Vehicle',month:M(0),cost:9,completed:true,note:'alex did it'},
  ]);
  w.eval(`items.push(
    {id:101,kind:'todo',name:'Call tire shop',completed:false,owner:'Alex',due:todoDateStr(1),linkId:2,notes:'ask about the rotation',createdAt:1},
    {id:102,kind:'todo',name:'Measure laundry nook',completed:false,owner:'Sam',linkId:1,createdAt:2},
    {id:103,kind:'todo',name:'Wrap the gift',completed:true,completedAt:Date.now(),owner:'',createdAt:3},
    {id:104,kind:'todo',name:'Deleted todo washing',completed:false,owner:'',deletedAt:Date.now(),createdAt:4});render();`);

  // ---- where the buttons are
  const btn=$('searchBtn'), cbtn=$('searchBtnCompact');
  ok(btn.closest('.top-actions') && btn.nextElementSibling.textContent.trim()==='⚙','header search button sits next to ⚙ in the top bar');
  ok(cbtn && cbtn.closest('#topCompact'),'compact bar has a search button too');
  ok(!d.querySelector('.view-tabs .search-btn, .view-tabs #searchBtn'),'no search button in the Active/Completed / Everyone/Mine row');
  ok(btn.getAttribute('aria-label')==='Search budget items and to-dos' && btn.getAttribute('aria-expanded')==='false' && $('searchRow').hidden && !!btn.querySelector('svg'),'closed: labelled icon button, collapsed');
  btn.click();
  ok(!$('searchRow').hidden && btn.getAttribute('aria-expanded')==='true' && cbtn.getAttribute('aria-expanded')==='true' && d.activeElement===$('searchInput'),'opens and focuses the input');
  ok($('searchView').hidden && shown($('budgetView')),'empty query: the board stays as it was');
  ok($('searchRow').parentNode===$('appHeader') && $('appHeader').classList.contains('search-on') && !shown(d.querySelector('#appHeader .top-actions')) && shown(d.querySelector('#appHeader .brand')),'the field replaces the header buttons; name/logo row stays');
  ok(!d.querySelector('#boardSticky #searchRow') && !$('topCompact').classList.contains('search-on'),'no search row under the banner; compact bar untouched');

  // ---- one results view, both kinds
  type('WASHING');
  ok(!$('searchView').hidden && !shown($('budgetView')) && !shown($('todoView')) && $('app').classList.contains('is-searching'),'typing shows the results view instead of the board');
  ok(rcards().join()==='Old washing mat,Washing machine','budget: case-insensitive, active + completed, never deleted: '+rcards());
  ok(rtodos().join()==='Measure laundry nook','a to-do linked to a matching budget item matches too');
  const done=[...d.querySelectorAll('#searchBudget .item-card')].find(c=>/Old washing mat/.test(c.textContent));
  ok(/Completed/.test(done.querySelector('.tag-done').textContent) && done.querySelector('.complete-check.restore-check'),'completed items are labelled and keep their restore checkbox');
  ok(/Budget items\s*2/.test($('searchBudget').querySelector('h3').textContent) && /To-dos\s*1/.test($('searchTodos').querySelector('h3').textContent),'counts per section');
  ok($('searchCountNote').textContent==='3 matches','total count');
  type('laundry'); ok(rcards().join()==='Washing machine' && rtodos().join()==='Measure laundry nook','subcategory + to-do name: '+rcards()+' | '+rtodos());
  type('vehicle'); ok(rcards().join()==='Done tires,Tires','category');
  type('alex'); ok(rcards().join()==='Bike helmet,Done tires,Tires' && rtodos().join()==='Call tire shop','owner + note, to-do owner');
  type('energy'); ok(rcards().join()==='Washing machine','note');
  ok(rtodos().length===0 && /No to-dos match/.test($('searchTodos').textContent),'a section with 0 shows a short note');
  type('amazon.com'); ok(rcards().join()==='Washing machine','link');
  type('kids-shop'); ok(rcards().join()==='Bike helmet','legacy link without scheme');
  type(M(1).split(' ')[0]); ok(rcards().includes('Gift'),'month');
  type('$600'); ok(rcards().join()==='Tires','forecast amount as shown');
  type('12.5'); ok(rcards().join()==='Old washing mat','actual paid amount');
  type('rotation'); ok(rtodos().join()==='Call tire shop' && rcards().length===0,'to-do notes');
  type('call'); ok(rtodos().join()==='Call tire shop' && rcards().join()==='Tires','a budget item matches the names of its linked to-dos');
  type('tomorrow'); ok(rtodos().join()==='Call tire shop','to-do due label');
  type('washing nook'); ok(rtodos().join()==='Measure laundry nook' && rcards().join()==='Washing machine','all words must match, across linked names');
  type('washing zebra'); ok(rcards().length===0 && rtodos().length===0,'one missing word = no match');
  type('civic honda'); ok(rcards().join()==='Tires','words in any order');
  type('gift'); ok(rcards().join()==='Gift' && rtodos().join()==='Wrap the gift' && d.querySelector('#searchTodos .todo-row.is-done'),'done to-dos are included');
  type('  gift  '); ok(rcards().join()==='Gift','query trimmed');
  type('deleted'); ok(rcards().length===0 && rtodos().length===0 && /No matches/.test($('searchResults').textContent),'deleted things never match; friendly no-match state');
  type('<b>x</b>'); ok(/“<b>x<\/b>”/.test($('searchResults').textContent) && !$('searchResults').querySelector('.empty b'),'query is escaped');
  type('   '); ok($('searchView').hidden && shown($('budgetView')),'whitespace only = no results view');

  // ---- the board is never filtered by search
  type('alex');
  ok(w.eval(`[...document.querySelectorAll('#itemsList .item-card')].length`)===4 && $('statCount').textContent==='4','budget board itself is not filtered');

  // ---- actions on results keep working
  type('laundry');
  const tcb=d.querySelector('#searchTodos .todo-row .complete-check');
  tcb.checked=true; tcb.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(500);
  ok(w.eval('findLiveTodo(102).completed')===true && d.querySelector('#searchTodos .todo-row.is-done'),'ticking a to-do in the results works and it stays listed as done');
  d.querySelector('#searchBudget .card-more').click();
  ok($('itemOverlay').style.display==='flex' && $('f_name').value==='Washing machine','⋯ on a result opens the edit dialog');
  w.closeItemModal();
  d.querySelector('#searchTodos .todo-more').click();
  ok($('todoOverlay').style.display==='flex' && $('t_name').value==='Measure laundry nook','⋯ on a to-do result opens its details');
  w.closeTodoModal();

  // ---- closing returns to the side you were on
  w.setSide('todo'); w.openSearch(); type('tire');
  ok(!shown($('todoView')) && rtodos().join()==='Call tire shop' && rcards().join()==='Done tires,Tires','results are the same from the To-do side');
  $('searchClear').click();
  ok($('searchInput').value==='' && !$('searchRow').hidden && shown($('todoView')) && d.activeElement===$('searchInput'),'✕ clears, keeps the box open, shows the side again');
  type('tire');
  $('searchInput').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok($('searchRow').hidden && $('searchView').hidden && shown($('todoView')) && w.eval('uiSide')==='todo' && d.activeElement===btn,'Escape closes and returns to the To-do side');
  btn.click(); type('tire'); d.querySelector('#searchRow .link-btn').click();
  ok($('searchRow').hidden && shown($('todoView')),'Close returns to the side');
  btn.click(); type('tire'); w.setSide('budget');
  ok($('searchRow').hidden && $('searchView').hidden && shown($('budgetView')),'picking a side closes the search');
  cbtn.click();
  ok(!$('searchRow').hidden && $('searchRow').parentNode===$('topCompact') && $('topCompact').classList.contains('search-on') && !$('appHeader').classList.contains('search-on') && d.activeElement===$('searchInput'),'compact search button turns the compact bar into the search field');
  ok([...$('topCompact').children].filter(c=>c!==$('searchRow')).every(c=>!shown(c)),'everything else in the compact bar is hidden');
  type('tire'); ok(rcards().length>0,'results show from the compact bar');
  d.querySelector('#searchRow .link-btn').click();
  ok($('searchRow').hidden && $('searchRow').parentNode===$('appHeader') && !$('topCompact').classList.contains('search-on') && $('searchView').hidden,'Close puts the field back and restores the compact bar');

  // ---- tapping off the search closes it; taps on the field, the results or a result's checkbox do not
  btn.click(); $('searchInput').click(); ok(!$('searchRow').hidden,'tapping the field keeps it open');
  d.querySelector('#appHeader .brand').click();
  ok($('searchRow').hidden && shown(d.querySelector('#appHeader .top-actions')),'tapping off an empty search closes it');
  btn.click(); type('tire'); d.querySelector('#searchResults .search-section-head').click();
  ok(!$('searchRow').hidden && !$('searchView').hidden,'tapping inside the results keeps the search open');
  d.querySelector('#appHeader .brand').click();
  ok($('searchRow').hidden && $('searchView').hidden && shown($('budgetView')) && $('searchInput').value==='','tapping off with a query closes the search and shows the board');
  cbtn.click(); d.querySelector('#appHeader .brand').click();
  ok($('searchRow').hidden && !$('topCompact').classList.contains('search-on'),'tapping off closes the compact-bar search too');

  ok(!JSON.stringify(w.eval('snapshotState()')).includes('searchQuery'),'search is UI-only, not synced');
  ok($('tabActiveBtn').textContent==='Active' && $('tabCompletedBtn').textContent==='Completed' && /Recent activity/.test($('activityToggle').textContent),'tabs + activity pill intact');
  setItems(w,[]); btn.click(); type('x'); ok(/No matches/.test($('searchResults').textContent),'empty board + query shows no-match message');
  finish();
})().catch(e=>{console.log('ERR',e);process.exit(2)});
