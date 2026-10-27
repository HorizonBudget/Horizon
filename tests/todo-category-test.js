// Categories on the To-do side: the All / Mine / category chip row (remembered per device), the category tag on rows,
// the Category picker in the to-do dialog (shared list with the budget side), search, sync merge, backups.
const {sleep,ok,boot,mk,finish}=require('./lib/h.js');
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const errors=[]; w.addEventListener('error',e=>errors.push(e.message));
  const T=o=>Object.assign({kind:'todo',completed:false,owner:'',createdAt:1},o);
  const setAll=arr=>w.eval(`items=${JSON.stringify(arr)}; render();`);
  const rows=()=>[...d.querySelectorAll('#todoList .todo-row .todo-name')].map(x=>x.textContent);
  const chips=()=>[...d.querySelectorAll('#todoFilterRow .todo-chip')].map(c=>c.querySelector('.chip-label').textContent+':'+c.querySelector('.chip-count').textContent);
  const chip=key=>[...d.querySelectorAll('#todoFilterRow .todo-chip')].find(c=>c.dataset.filter===key);
  const picked=()=>{ const c=d.querySelector('#todoFilterRow .todo-chip.selected'); return c?c.dataset.filter:null; };
  const todo=id=>w.eval(`items.find(i=>i.id===${JSON.stringify(id)})`);
  const settings=()=>JSON.parse(w.localStorage.getItem('ledgerSettings')||'{}');
  const today=w.eval('todoDateStr(0)'), yest=w.eval('todoDateStr(-1)'), in20=w.eval('todoDateStr(20)');
  const M0=w.eval('FUTURE_MONTHS[0]');
  const board=()=>[
    mk({id:1,name:'Washer',category:'Home',cost:900,month:M0}), mk({id:2,name:'Tires',category:'Vehicle',cost:600,month:M0}),
    T({id:10,name:'Fix gate',category:'Home',due:yest,owner:'Sam'}),
    T({id:11,name:'Measure nook',category:'Home',due:today,linkId:1}),
    T({id:12,name:'Paint hall',category:'Home'}),
    T({id:13,name:'Call tire shop',category:'Vehicle',due:in20,owner:'Alex'}),
    T({id:14,name:'Library books',owner:'Sam'}),
    T({id:15,name:'Old Home job',category:'Home',completed:true,completedAt:5})
  ];
  w.setSide('todo');

  // ---------- the chip row ----------
  setAll(board());
  ok(!$('todoTabAllBtn') && !$('todoTabMineBtn'),'Everyone / Mine tabs are gone');
  ok(chips().join('|')==='All:5|Mine:2|Home:3|Vehicle:1|No category:1','chips: All, Mine, categories A-Z, No category, open counts: '+chips().join('|'));
  ok(picked()==='all' && chip('all').getAttribute('aria-pressed')==='true','All picked by default');
  ok(chip('cat:Home').querySelector('.chip-dot').style.background!=='' && !chip('all').querySelector('.chip-dot') && chip('mine').classList.contains('is-mine'),'category chips have a color dot; Mine is the dashed chip');
  ok($('todoTitle').textContent==='To do' && $('todoQuickInput').placeholder==='Quick add todo','All: title "To do", hint "Quick add todo"');
  ok(d.querySelector('#todoFilterRow').closest('#boardSticky') && d.querySelector('#boardSticky #activityWrap'),'chips and Recent activity sit in the sticky bar');

  chip('cat:Home').click();
  ok(picked()==='cat:Home' && rows().join()==='Fix gate,Measure nook,Paint hall','Home picked: only Home to-dos: '+rows());
  ok([...d.querySelectorAll('#todoList .todo-group')].map(g=>g.dataset.group).join()==='overdue,today,none','groups follow the pick');
  ok($('todoCountNote').textContent==='3 to do · 1 overdue','count follows the pick: '+$('todoCountNote').textContent);
  ok($('todoTitle').textContent==='Home to-dos' && $('todoQuickInput').placeholder==='Quick add to Home','title and quick add hint name the category');
  ok(settings().todoFilter==='cat:Home','pick saved in ledgerSettings.todoFilter');
  ok(!w.eval('snapshotState().todoFilter') && !/todoFilter/.test(JSON.stringify(w.eval('snapshotState()'))),'pick is not synced');
  // Collapse all covers only the groups showing
  $('todoCollapseAllBtn').click();
  ok(w.eval('[...collapsedTodoGroups].sort().join()')==='none,overdue,today','Collapse all folds only the shown groups');
  $('todoCollapseAllBtn').click();
  ok(w.eval('collapsedTodoGroups.size')===0,'Expand all opens them again');

  // quick add / + To-do item while a category is picked
  $('todoQuickInput').value='Buy caulk'; w.quickAddTodo();
  const qa=w.eval(`items.find(i=>i.name==='Buy caulk')`);
  ok(qa.category==='Home' && qa.owner==='' && rows().includes('Buy caulk'),'quick add with Home picked puts it in Home and it stays in view');
  w.openTodoModal();
  ok($('t_category').value==='Home' && $('t_owner').value==='','+ To-do item with Home picked starts in Home');
  w.closeTodoModal();

  chip('mine').click();
  ok(rows().join()==='Fix gate,Library books' && $('todoTitle').textContent==='My to-dos' && $('todoQuickInput').placeholder==='Quick add todo','Mine: my to-dos, title "My to-dos"');
  $('todoQuickInput').value='Mine quick'; w.quickAddTodo();
  const mq=w.eval(`items.find(i=>i.name==='Mine quick')`);
  ok(mq.owner==='Sam' && !('category' in mq),'quick add on Mine assigns it to me (no category)');
  w.openTodoModal();
  ok($('t_owner').value==='Sam' && $('t_category').value==='','+ To-do item on Mine is mine, no category');
  w.closeTodoModal();

  chip('none').click();
  ok(rows().join()==='Mine quick,Library books' && $('todoTitle').textContent==='No category','No category: only uncategorized ones: '+rows());
  ok(!d.querySelector('#todoList .todo-cat'),'no category tag on uncategorized rows');

  // ---------- remembered per device; falls back to All ----------
  w.setTodoFilter('cat:Vehicle');
  const w2=boot({ls:{ledgerSettings:w.localStorage.getItem('ledgerSettings')}});
  w2.eval(`items=${JSON.stringify(board())}; uiSide='todo'; render();`);
  ok(w2.eval('todoFilter')==='cat:Vehicle' && w2.document.querySelector('#todoFilterRow .todo-chip.selected').dataset.filter==='cat:Vehicle','a reload remembers the picked chip');
  w2.eval(`items=[]; render();`);
  ok(w2.eval('todoFilter')==='cat:Vehicle','an empty (not yet loaded) list keeps the remembered pick');
  ok(w2.document.querySelector('#todoFilterRow .todo-chip.selected').dataset.filter==='all','...while showing All');
  w2.eval(`items=${JSON.stringify(board().filter(i=>i.category!=='Vehicle'))}; render();`);
  ok(w2.eval('todoFilter')==='all' && JSON.parse(w2.localStorage.getItem('ledgerSettings')).todoFilter==='all','category with no to-dos left (renamed / removed): back to All');
  for(const junk of [5,'cat:','bogus',null,{x:1}]){
    const w3=boot({ls:{ledgerSettings:JSON.stringify({todoFilter:junk})}});
    ok(w3.eval('todoFilter')==='all','junk saved pick '+JSON.stringify(junk)+' means All');
  }

  // ---------- empty states ----------
  setAll([T({id:20,name:'Done one',category:'Garden',completed:true,completedAt:3}), T({id:21,name:'Other',category:'Home'})]);
  w.setTodoFilter('cat:Garden');
  ok(picked()==='cat:Garden' && /No Garden to-dos/.test($('todoList').textContent) && /ticked off/.test($('todoList').textContent),'category with only done to-dos: "No Garden to-dos"');
  ok(chips().join('|')==='All:1|Mine:0|Garden:0|Home:1','a category with only done to-dos keeps its chip (count 0)');
  ok(/Done/.test($('todoDoneToggle').textContent) && /1/.test($('todoDoneToggle').textContent),'Done section follows the pick');
  d.querySelector('#todoList .todo-show-all').click();
  ok(picked()==='all' && rows().join()==='Other','"Show all to-dos" goes back to All');
  w.setTodoFilter('mine');
  ok(/Nothing on your plate/.test($('todoList').textContent) && d.querySelector('#todoList .todo-show-all'),'Mine empty state has a way back to All');
  w.setTodoFilter('all');

  // Clear done respects the pick
  setAll([T({id:30,name:'A',category:'Home',completed:true,completedAt:3}),T({id:31,name:'B',category:'Kids',completed:true,completedAt:2}),T({id:32,name:'C',category:'Home'})]);
  w.setTodoFilter('cat:Home');
  ok(w.clearDoneTodos()===1 && w.eval('isDeleted(items[0])') && !w.eval('isDeleted(items[1])'),'Clear done on Home clears only Home');
  $('toastUndo').click();
  ok(!w.eval('isDeleted(items[0])'),'undo of Clear done puts it back');
  w.setTodoFilter('all');

  // ---------- row tag; junk categories ----------
  setAll([T({id:40,name:'Tagged',category:'Holidays & Gifts'}),T({id:41,name:'Null',category:null}),T({id:42,name:'Num',category:5}),T({id:43,name:'Obj',category:{a:1}}),T({id:44,name:'Blank',category:'   '}),T({id:45,name:'Evil',category:'<b>x</b>'})]);
  const tag=id=>d.querySelector(`[data-todo-id="${id}"] .todo-cat`);
  ok(tag(40) && tag(40).querySelector('.todo-cat-name').textContent==='Holidays & Gifts' && tag(40).querySelector('.chip-dot'),'row shows a category tag with its dot');
  ok(!tag(41) && !tag(42) && !tag(43) && !tag(44),'null / number / object / blank category: no tag');
  ok(tag(45).querySelector('.todo-cat-name').textContent==='<b>x</b>' && !d.querySelector('#todoList b') && !d.querySelector('#todoFilterRow b'),'HTML-looking category is text');
  ok(chip('none').querySelector('.chip-count').textContent==='4' && errors.length===0,'junk categories count as No category, no errors');
  w.openTodoModal(42);
  ok($('t_category').value==='','opening a to-do with a junk category shows No category');
  w.closeTodoModal();
  ok(todo(42).category===5,'opening and closing does not rewrite the stored value');

  // ---------- dialog ----------
  const order=[...d.querySelectorAll('#todoOverlay input, #todoOverlay select, #todoOverlay textarea')].map(e=>e.id).filter(id=>id!=='t_newCategory');
  ok(order.join()==='t_name,t_category,t_due,t_owner,t_link,t_url,t_notes','field order Name, Category, Due, Who, Pair, Link, Notes: '+order);
  ok(/Category/.test(d.querySelector('label[for="t_category"]').textContent) && /optional/.test(d.querySelector('label[for="t_category"]').textContent),'label "Category (optional)"');
  setAll([mk({id:1,name:'Washer',category:'Home',month:M0}), mk({id:2,name:'Boat fix',category:'Marine',month:M0}), T({id:50,name:'Measure'})]);
  w.openTodoModal(50);
  const opts=[...$('t_category').options].map(o=>o.textContent);
  const shared=w.eval('[...CATEGORIES].sort((a,b)=>a.localeCompare(b))');
  ok(opts[0]==='No category' && opts[opts.length-1]==='+ New category…' && opts.slice(1,-1).join()===shared.join(),'picker lists No category, the shared categories A-Z, + New category…');
  ok(d.querySelector('#todoOverlay .field-hint') && /Budget side/.test(d.querySelector('#todoOverlay .field-hint').textContent),'hint text under the picker');
  $('t_category').value='Health'; w.onTodoCategoryChange();
  ok($('t_categoryDot').style.background!=='' ,'dot follows the picked category');
  w.saveTodoModal();
  ok(todo(50).category==='Health' && /Health/.test(d.querySelector('[data-todo-id="50"] .todo-cat').textContent),'saving stores category on the to-do');
  $('toastUndo').click();
  ok(!('category' in todo(50)),'undo of the edit takes the category off again');

  // pairing a budget item fills in its category; you can still change it
  w.openTodoModal(50);
  $('t_link').value='2'; w.onTodoLinkChange();
  ok($('t_category').value==='Marine','choosing a budget item pair sets its category (even one not in the shared list)');
  $('t_category').value='Home'; w.onTodoCategoryChange();
  w.saveTodoModal();
  ok(todo(50).category==='Home' && todo(50).linkId===2,'the category can still be changed after pairing');
  w.openTodoModal(50);
  $('t_category').value=''; w.saveTodoModal();
  ok(!('category' in todo(50)),'No category removes the field');

  // + New category… : shared with the budget side, both ways
  const nCats=w.eval('CATEGORIES.length');
  w.openTodoModal(50);
  $('t_category').value='__new'; w.onTodoCategoryChange();
  ok($('t_newCatRow').classList.contains('show'),'+ New category… shows a name field');
  ok(w.saveTodoModal()===false && /name/.test($('t_categoryError').textContent) && $('todoOverlay').style.display==='flex','no name typed: asks for one, nothing saved');
  $('t_newCategory').value='  Garden   shed '; ok(w.saveTodoModal()===true,'saves with a new category');
  ok(todo(50).category==='Garden shed' && w.eval('CATEGORIES.includes("Garden shed")') && w.eval('CATEGORIES.length')===nCats+1,'new category made from a to-do is added to the shared list');
  w.populateCategorySelect(null);
  ok([...$('f_category').options].some(o=>o.textContent==='Garden shed'),'...and shows in the budget item dialog');
  w.openTodoModal(50); $('t_category').value='__new'; w.onTodoCategoryChange(); $('t_newCategory').value='HOME'; w.saveTodoModal();
  ok(todo(50).category==='Home' && w.eval('CATEGORIES.length')===nCats+1,'a new name that only differs in case reuses the existing category');
  w.openItemModal(); $('f_name').value='Mulch'; $('f_cost').value='40';
  $('f_category').value='Other'; w.onCategoryChange(); $('f_newCategory').value='Yard'; w.saveItem();
  ok(w.eval(`items.find(i=>i.name==='Mulch').category`)==='Yard','budget side still adds a new category');
  w.openTodoModal(50);
  ok([...$('t_category').options].some(o=>o.value==='Yard'),'a category made on the budget side shows in the to-do dialog');
  w.closeTodoModal();
  // a brand-new to-do from the dialog
  w.openTodoModal(); $('t_name').value='Rake leaves'; $('t_category').value='Yard'; w.saveTodoModal();
  ok(w.eval(`items.find(i=>i.name==='Rake leaves').category`)==='Yard','adding from the dialog stores the category');

  // ---------- budget side does not count to-dos ----------
  setAll([mk({id:1,name:'Washer',category:'Home',cost:900,month:M0}), T({id:60,name:'T1',category:'Home'}), T({id:61,name:'T2',category:'Kids'})]);
  w.setSide('budget');
  const pills=[...d.querySelectorAll('#categoryFilter .month-pill')].map(p=>p.textContent.replace(/\s+/g,' ').trim());
  ok(pills.join('|')==='All categories 1|Home 1','budget Filters count budget items only: '+pills.join('|'));
  ok($('statCount').textContent==='1','budget totals ignore to-dos');
  w.setSide('todo');

  // ---------- search ----------
  setAll([T({id:70,name:'Call vet',category:'Pets'}), T({id:71,name:'Something else'})]);
  w.openSearch(); $('searchInput').value='pets'; w.onSearchInput();
  ok([...d.querySelectorAll('#searchTodos .todo-name')].map(x=>x.textContent).join()==='Call vet','search finds a to-do by its category');
  w.closeSearch();

  // ---------- sync merge: the new field merges like any other ----------
  {
    const base={items:[{id:1,kind:'todo',name:'A',completed:false}],people:[],activity:[],categories:['Home'],subcategories:{},householdName:''};
    const local=JSON.parse(JSON.stringify(base)); local.items[0].category='Home';
    const remote=JSON.parse(JSON.stringify(base)); remote.items[0].name='A renamed';
    const m=w.mergeHeldState(base,local,remote);
    ok(m.items[0].category==='Home' && m.items[0].name==='A renamed','merge: category set here + name changed elsewhere both kept');
    const local2=JSON.parse(JSON.stringify(base)); local2.items[0].category='Home';
    const remote2=JSON.parse(JSON.stringify(base)); remote2.items[0].category='Kids';
    const m2=w.mergeHeldState(base,local2,remote2);
    ok(m2.items[0].category==='Home','merge: same field changed both places: this device\'s edit is the one sent (as for any field)');
    const base3=JSON.parse(JSON.stringify(base)); base3.items[0].category='Home';
    const local3=JSON.parse(JSON.stringify(base3)); delete local3.items[0].category;
    const m3=w.mergeHeldState(base3,local3,JSON.parse(JSON.stringify(base3)));
    ok(!('category' in m3.items[0]),'merge: category cleared here stays cleared');
  }
  ok(Object.keys(w.eval('snapshotState()')).sort().join()==='activity,categories,householdName,items,people,subcategories','no new top-level synced field');

  // ---------- backups: restore accepts the field and junk values ----------
  {
    const s=w.stateFromDoc({items:[{id:1,kind:'todo',name:'A',category:'Home'},{id:2,kind:'todo',name:'B',category:null},{id:3,kind:'todo',name:'C',category:['x']}],people:[{id:1,name:'Sam'}],categories:['Home']});
    ok(s.items.length===3 && s.items[0].category==='Home','a backup / document with to-do categories loads them');
    w.applyState(s); w.render();
    ok(errors.length===0 && d.querySelectorAll('#todoList .todo-cat').length===1 && chips().join('|')==='All:3|Mine:0|Home:1|No category:2','junk categories from a backup load without errors');
  }

  // ---------- narrow phone: chip labels can shrink ----------
  setAll([T({id:80,name:'Long',category:'A really very extremely long category name that goes on and on and on'})]);
  ok(w.getComputedStyle(d.querySelector('.todo-chip')).maxWidth==='100%' && w.getComputedStyle(d.querySelector('.todo-chip .chip-label')).textOverflow==='ellipsis','a long category chip cannot push the page sideways');

  ok(errors.length===0,'no page errors: '+errors.join(' | '));
  finish();
})();
