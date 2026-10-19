// To-do side: data stays inside items[] (kind:'todo'), never leaks into the budget board, syncs with the same fields.
const { JSDOM } = require('jsdom');
const html = require('./lib/build-app').buildApp();
const store = {}; const listeners = {}; const pushes = [];
function fakeFactory(){ return {
  subscribe(code, cb){ (listeners[code] = listeners[code] || []).push(cb); setTimeout(() => cb(store[code] ? JSON.parse(JSON.stringify(store[code])) : null, false), 5); return () => {}; },
  push(code, data){ pushes.push(JSON.parse(JSON.stringify(data))); store[code] = JSON.parse(JSON.stringify(data)); return new Promise(r => setTimeout(() => { (listeners[code] || []).forEach(cb => cb(JSON.parse(JSON.stringify(store[code])), false)); r(); }, 5)); }
}; }
function boot(ls){
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(w){
    w.__cloudAdapterFactory = fakeFactory;
    w.alert = m => { throw new Error('window.alert used: ' + m); };
    w.confirm = () => { throw new Error('window.confirm used'); };
    if(ls) Object.keys(ls).forEach(k => w.localStorage.setItem(k, ls[k]));
    const si = w.setInterval.bind(w); w.setInterval = (fn, ms) => ms === 3600000 ? 0 : si(fn, ms);
  } }).window;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, pass = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fails++; };

(async () => {
  const A = boot(); await sleep(50);
  const d = A.document, $ = id => d.getElementById(id);
  $('householdCode').value = 'TODO-TEST-1234'; $('yourName').value = 'Sam';
  await A.enterApp();
  A.eval(`people.push({id:'p2',name:'Jo',photo:null})`);
  const M0 = A.eval('FUTURE_MONTHS[0]'), M1 = A.eval('FUTURE_MONTHS[1]');
  A.eval(`items.push(
    {id:1,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:${JSON.stringify(M0)},saved:0,owner:'Sam',link:'',completed:false},
    {id:2,name:'Dentist',category:'Health',subcategory:'',cost:100,month:${JSON.stringify(M1)},saved:0,owner:'',link:'',completed:false},
    {id:3,name:'Old Done',category:'Home',subcategory:'',cost:75,month:${JSON.stringify(M0)},saved:0,owner:'',link:'',completed:true});render();`);
  const cards = () => [...d.querySelectorAll('#itemsList .item-card .item-name')].map(c => c.textContent);
  const stat = () => [$('statCount').textContent, $('statNeeded').textContent].join();
  const pills = () => [...d.querySelectorAll('#categoryFilter .month-pill')].map(p => p.textContent.replace(/\s+/g, ' ').trim());
  const groups = () => [...d.querySelectorAll('#itemsList .mg-name')].map(x => x.textContent);
  const todoNames = () => [...d.querySelectorAll('#todoList .todo-row .todo-name')].map(x => x.textContent);
  const groupNames = () => [...d.querySelectorAll('#todoList .todo-group')].map(g => g.dataset.group + ':' + g.querySelector('.mg-count').textContent.replace(/ to-dos?$/, ''));
  const baseCards = cards().join(), baseStat = stat(), basePills = pills().join('|'), baseGroups = groups().join();

  // ---------- defaults ----------
  ok(A.eval('uiSide') === 'budget' && $('app').dataset.side === 'budget', 'starts on the Budget side');
  ok(A.getComputedStyle($('todoView')).display === 'none' && A.getComputedStyle($('budgetView')).display !== 'none', 'To-do view hidden, budget view showing');
  ok(d.querySelector('.side-switch-main .side-opt.active').dataset.side === 'budget', 'switch shows Budget as active');

  // ---------- add ----------
  const today = A.eval('todoDateStr(0)'), yest = A.eval('todoDateStr(-1)'), in3 = A.eval('todoDateStr(3)'), in20 = A.eval('todoDateStr(20)');
  A.setSide('todo');
  ok($('app').dataset.side === 'todo' && A.getComputedStyle($('todoView')).display !== 'none' && A.getComputedStyle($('budgetView')).display === 'none', 'switching shows the To-do view and hides the budget view');
  ok(A.getComputedStyle($('tabActiveBtn')).display === 'none' && A.getComputedStyle($('todoTabAllBtn')).display !== 'none', 'Active/Completed tabs swapped for Everyone/Mine');
  ok(/Nothing on the list yet/.test($('todoList').textContent), 'friendly empty state');
  $('todoQuickInput').value = '  Call the plumber  ';
  $('todoAddForm').dispatchEvent(new A.Event('submit', { cancelable: true, bubbles: true }));
  let t = A.eval(`items.find(i=>i.kind==='todo'&&i.name==='Call the plumber')`);
  ok(!!t && t.completed === false && t.owner === '' && typeof t.createdAt === 'number' && typeof t.id === 'number', 'quick add (form submit / Enter) creates a to-do in items[]');
  ok($('todoQuickInput').value === '', 'quick add field is cleared');
  ok(A.eval('activity[0].text') === 'Sam added to-do “Call the plumber”', 'activity: ' + A.eval('activity[0].text'));
  ok(todoNames().join() === 'Call the plumber' && groupNames().join() === 'none:1', 'shows under No date: ' + groupNames());
  A.eval(`addTodo({name:'Return library books',due:${JSON.stringify(yest)},owner:'Jo'})`);
  A.eval(`addTodo({name:'Pay school lunch',due:${JSON.stringify(today)},owner:'Sam'})`);
  A.eval(`addTodo({name:'Order tires',due:${JSON.stringify(in3)},linkId:1,notes:'Costco has a deal'})`);
  A.eval(`addTodo({name:'Plan trip',due:${JSON.stringify(in20)}})`);
  A.eval(`addTodo({name:'Bad date',due:'2026-02-31'})`);
  ok(A.eval(`items.find(i=>i.name==='Bad date').due`) === undefined, 'an impossible date is dropped');
  ok(groupNames().join() === 'overdue:1,today:1,week:1,later:1,none:2', 'grouped Overdue/Today/This week/Later/No date: ' + groupNames());
  ok(todoNames()[0] === 'Return library books' && todoNames()[2] === 'Order tires', 'order follows the groups: ' + todoNames());
  ok($('todoCountNote').textContent === '6 to do · 1 overdue', 'count: ' + $('todoCountNote').textContent);
  ok($('sideTodoCount').textContent === '6' && !$('sideTodoCount').hidden && $('sideTodoCount').classList.contains('has-overdue'), 'switch badge shows open count, marked overdue');
  const row = id => [...d.querySelectorAll('.todo-row')].find(r => r.querySelector('.todo-name').textContent === id);
  ok(/Yesterday/.test(row('Return library books').querySelector('.todo-due').textContent) && row('Return library books').querySelector('.todo-due').classList.contains('due-overdue'), 'overdue due label');
  ok(/Today/.test(row('Pay school lunch').textContent) && /Sam/.test(row('Pay school lunch').querySelector('.todo-owner').textContent), 'today label + owner');
  const pr = row('Pay school lunch'), pcb = pr.querySelector('input.complete-check');
  ok(!!pcb && !pr.querySelector('.todo-check') && pr.lastElementChild.contains(pcb) && pr.firstElementChild.classList.contains('todo-main'), 'square budget-style checkbox on the right of the row');
  ok(pr.querySelector('.todo-more').compareDocumentPosition(pcb) & 4, '⋯ sits before the checkbox');
  ok(/1 to-do$/.test(d.querySelector('#todoList .todo-group[data-group="overdue"] .mg-count').textContent) && /2 to-dos$/.test(d.querySelector('#todoList .todo-group[data-group="none"] .mg-count').textContent), 'group counts read “N to-dos”');
  ok(d.querySelectorAll('#todoList .todo-group .month-group-btn .mg-chev').length === 5 && !d.querySelector('#todoList .mg-total'), 'groups use the month-group header (arrow, no money total)');

  // ---------- collapsing groups ----------
  const gbtn = k => d.querySelector(`#todoList .month-group-btn[data-group="${k}"]`);
  gbtn('today').click();
  ok(gbtn('today').getAttribute('aria-expanded') === 'false' && d.getElementById('todoGroupBody-today').hidden && !todoNames().includes('Pay school lunch'), 'tapping a group header collapses it');
  ok(d.activeElement === gbtn('today'), 'focus stays on the group header');
  ok(JSON.parse(A.localStorage.getItem('horizonCollapsedTodoGroups')).join() === 'today', 'collapsed state saved on this device');
  ok($('todoCollapseAllBtn').textContent === 'Collapse all' && $('todoCollapseAllBtn').closest('.todo-head'), 'Collapse all link in the To do heading row');
  $('todoCollapseAllBtn').click();
  ok([...d.querySelectorAll('#todoList .month-group-btn')].every(b => b.getAttribute('aria-expanded') === 'false') && todoNames().length === 0 && $('todoCollapseAllBtn').textContent === 'Expand all', 'Collapse all folds every group');
  const R = boot({ horizonCollapsedTodoGroups: A.localStorage.getItem('horizonCollapsedTodoGroups') }); await sleep(30);
  ok(R.eval('collapsedTodoGroups.size') === 5, 'collapsed groups remembered after a reload');
  $('todoCollapseAllBtn').click();
  ok(todoNames().length === 6 && $('todoCollapseAllBtn').textContent === 'Collapse all' && JSON.parse(A.localStorage.getItem('horizonCollapsedTodoGroups')).length === 0, 'Expand all opens everything again');
  ok(!/collapsed|horizonCollapsed/i.test(A.eval('JSON.stringify(snapshotState())')), 'collapsed groups are not synced');
  ok(/Costco has a deal/.test(row('Order tires').querySelector('.todo-note').textContent), 'note preview on the row');

  // ---------- linked item chip ----------
  const chip = row('Order tires').querySelector('.todo-link-chip');
  ok(!!chip && /Tires/.test(chip.textContent), 'linked budget item shows as a chip');
  chip.click();
  ok($('itemOverlay').style.display === 'flex' && $('f_name').value === 'Tires' && $('todoOverlay').style.display !== 'flex', 'tapping the chip opens that budget item (not the to-do)');
  A.closeItemModal();
  A.setSide('budget');
  const tireCard = [...d.querySelectorAll('#itemsList .item-card')].find(c => c.querySelector('.item-name').textContent === 'Tires');
  ok(!!tireCard.querySelector('.tag-todo') && /0\/1 to-do/.test(tireCard.querySelector('.tag-todo').textContent), 'budget card shows the linked to-do tag: ' + (tireCard.querySelector('.tag-todo') || {}).textContent);
  ok(![...d.querySelectorAll('#itemsList .item-card')].some(c => c.querySelector('.item-name').textContent === 'Dentist' && c.querySelector('.tag-todo')), 'no tag on items without to-dos');

  // ---------- budget side ignores to-dos ----------
  ok(cards().join() === baseCards, 'budget cards unchanged: ' + cards());
  ok(stat() === baseStat, 'budget totals/counts unchanged: ' + stat());
  ok(pills().join('|') === basePills, 'category pills unchanged: ' + pills().join('|'));
  ok(groups().join() === baseGroups, 'month groups unchanged: ' + groups());
  ok(A.eval('liveItems().length') === 3 && A.eval('liveItems().every(i=>i.kind!=="todo")'), 'liveItems() has no to-dos');
  const todoId = A.eval(`items.find(i=>i.name==='Plan trip').id`);
  ok(!A.eval(`findLiveItem(${todoId})`) && !!A.eval(`findLiveTodo(${todoId})`), 'findLiveItem ignores to-dos; findLiveTodo finds them');
  A.editItem(todoId); ok($('itemOverlay').style.display !== 'flex', 'editItem on a to-do id does nothing');
  A.eval(`finishCompleting(${todoId})`); ok(A.eval(`findLiveTodo(${todoId}).completed`) === false, 'budget complete ignores to-dos');
  A.switchTab('completed'); ok(cards().join() === 'Old Done', 'Completed tab unaffected'); A.switchTab('active');
  A.openSearch(); $('searchInput').value = 'plumber'; A.onSearchInput();
  ok(cards().length === 0 && /No items match/.test($('itemsList').textContent), 'budget search does not find to-dos');
  A.closeSearch();
  A.openItemModal(); A.eval(`document.getElementById('f_name').value='x'`);
  ok(A.eval(`[...document.querySelectorAll('#f_category option')].every(o=>o.textContent!=='undefined')`), 'category list has no blank/undefined entries');
  A.closeItemModal();
  A.setSide('todo');

  // ---------- search on the to-do side ----------
  A.openSearch(); $('searchInput').value = 'costco'; A.onSearchInput();
  ok(todoNames().join() === 'Order tires', 'to-do search matches notes: ' + todoNames());
  $('searchInput').value = 'tires'; A.onSearchInput();
  ok(todoNames().join() === 'Order tires', 'to-do search matches name/linked item');
  A.closeSearch();

  // ---------- Mine filter ----------
  A.setTodoFilter('mine');
  ok(todoNames().join() === 'Pay school lunch' && $('todoTabMineBtn').classList.contains('active'), 'Mine shows only my to-dos: ' + todoNames());
  $('todoQuickInput').value = 'Mine quick'; A.quickAddTodo();
  ok(A.eval(`items.find(i=>i.name==='Mine quick').owner`) === 'Sam' && todoNames().includes('Mine quick'), 'quick add with Mine showing assigns it to me');
  A.setTodoFilter('all');

  // ---------- complete / undo / done section ----------
  const pid = A.eval(`items.find(i=>i.name==='Call the plumber').id`);
  ok(A.completeTodo(pid) === true, 'completeTodo');
  t = A.eval(`findLiveTodo(${pid})`);
  ok(t.completed === true && typeof t.completedAt === 'number', 'completed + completedAt set');
  ok(A.eval('activity[0].text') === 'Sam ticked off “Call the plumber”', 'activity: ' + A.eval('activity[0].text'));
  ok(!todoNames().includes('Call the plumber'), 'gone from the open list');
  ok(/Done/.test($('todoDoneToggle').textContent) && /1/.test($('todoDoneToggle').textContent) && $('todoDoneBody').hidden, 'Done (1) section, folded');
  $('todoDoneToggle').click();
  ok(!$('todoDoneBody').hidden && $('todoDoneBody').querySelectorAll('.todo-row.is-done').length === 1, 'Done section opens');
  $('toastUndo').click();
  ok(A.eval(`findLiveTodo(${pid}).completed`) === false && A.eval(`'completedAt' in findLiveTodo(${pid})`) === false, 'Undo puts it back');
  ok(!$('todoDoneToggle'), 'Done section disappears when empty');
  // tick through the checkbox (with the short animation)
  const cb = row('Call the plumber').querySelector('.complete-check');
  cb.checked = true; cb.dispatchEvent(new A.Event('change', { bubbles: true }));
  ok(row('Call the plumber').classList.contains('is-ticking'), 'tick animation class');
  await sleep(500);
  ok(A.eval(`findLiveTodo(${pid}).completed`) === true, 'checkbox ticks it off');
  // un-tick from Done
  A.toggleTodoDone(true);
  const dcb = $('todoDoneBody').querySelector('.complete-check');
  ok(dcb.classList.contains('restore-check') && dcb.checked, 'done rows show the checked restore-check box');
  dcb.checked = false; dcb.dispatchEvent(new A.Event('change', { bubbles: true }));
  ok(A.eval(`findLiveTodo(${pid}).completed`) === false, 'un-ticking in Done puts it back on the list');
  A.completeTodo(pid);

  // ---------- edit through the dialog ----------
  const tid = A.eval(`items.find(i=>i.name==='Plan trip').id`);
  row('Plan trip').querySelector('.todo-main').click();
  ok($('todoOverlay').style.display === 'flex' && $('todoModalTitle').textContent === 'Edit to-do' && $('t_name').value === 'Plan trip', 'tapping a to-do opens its details');
  ok($('todoDeleteBtn').style.display !== 'none', 'Delete shown when editing');
  const ownerOpts = [...$('t_owner').options].map(o => o.textContent).join();
  ok(ownerOpts === 'Anyone,Sam,Jo', 'owner choices: ' + ownerOpts);
  const linkOpts = [...$('t_link').options].map(o => o.textContent);
  ok(linkOpts[0] === 'None' && linkOpts.some(o => /^Tires/.test(o)) && linkOpts.some(o => /^Dentist/.test(o)) && !linkOpts.some(o => /Old Done|plumber|Plan trip/.test(o)), 'link choices are live, not-completed budget items only: ' + linkOpts.join('|'));
  $('t_name').value = 'Plan beach trip'; $('t_owner').value = 'Jo'; $('t_notes').value = 'Ask about dates';
  $('t_link').value = '2';
  A.setTodoDueQuick(1);
  ok($('t_due').value === A.eval('todoDateStr(1)') && d.querySelector('#todoDueChips .chip.selected').textContent === 'Tomorrow', 'quick date chips');
  A.saveTodoModal();
  t = A.eval(`findLiveTodo(${tid})`);
  ok(t.name === 'Plan beach trip' && t.owner === 'Jo' && t.notes === 'Ask about dates' && t.linkId === 2 && t.due === A.eval('todoDateStr(1)'), 'edit saved: ' + JSON.stringify(t));
  ok($('todoOverlay').style.display === 'none', 'dialog closed');
  ok(A.eval('activity[0].text') === 'Sam updated to-do “Plan beach trip”', 'activity: ' + A.eval('activity[0].text'));
  $('toastUndo').click();
  t = A.eval(`findLiveTodo(${tid})`);
  ok(t.name === 'Plan trip' && t.owner === '' && t.notes === undefined && t.linkId === undefined && t.due === in20, 'Undo restores the edit');
  // new to-do from the + button on the to-do side; empty name is refused
  d.querySelector('#topCompact .btn-add').click();
  ok($('todoOverlay').style.display === 'flex' && $('todoModalTitle').textContent === 'Add a to-do list item' && $('itemOverlay').style.display !== 'flex', 'compact + adds a to-do on the To-do side');
  ok($('tcAddBtn').getAttribute('aria-label') === 'Add to-do list item' && $('hdrAddBtn').title === 'Add to-do list item' && A.getComputedStyle(d.querySelector('#hdrAddBtn .todo-only')).display !== 'none' && d.querySelector('#hdrAddBtn .todo-only').textContent === '+ To-do list item', 'add buttons say To-do list item');
  A.saveTodoModal();
  ok(/name/.test($('t_nameError').textContent) && $('todoOverlay').style.display === 'flex', 'empty name refused');
  $('t_name').value = 'Fix the gate'; A.setTodoDueQuick(0); A.saveTodoModal();
  ok(A.eval(`items.find(i=>i.name==='Fix the gate').due`) === today, 'new to-do from the dialog');
  d.querySelector('header.top .btn-add').click();
  ok($('todoOverlay').style.display === 'flex', 'header + adds a to-do too'); A.closeTodoModal();

  // ---------- delete / undo / trash / restore ----------
  const gid = A.eval(`items.find(i=>i.name==='Fix the gate').id`);
  A.openTodoModal(gid); A.deleteTodoFromModal();
  ok(A.eval(`typeof items.find(i=>i.id===${gid}).deletedAt`) === 'number' && !A.eval(`findLiveTodo(${gid})`), 'delete soft-deletes');
  ok(A.eval('activity[0].text') === 'Sam removed to-do “Fix the gate”', 'activity: ' + A.eval('activity[0].text'));
  ok(!todoNames().includes('Fix the gate'), 'gone from the list');
  $('toastUndo').click();
  ok(!!A.eval(`findLiveTodo(${gid})`), 'Undo brings it back');
  A.deleteTodo(gid);
  A.openTrashModal();
  const trow = [...d.querySelectorAll('#trashList .trash-item')].find(r => /Fix the gate/.test(r.textContent));
  ok(!!trow && /To-do/.test(trow.querySelector('.trash-item-cost').textContent) && !/\$/.test(trow.querySelector('.trash-item-cost').textContent), 'deleted to-do in Deleted items, labelled To-do');
  trow.querySelector('[data-act=restore]').click();
  ok(!!A.eval(`findLiveTodo(${gid})`), 'restored from Deleted items');
  A.closeTrashModal(); A.closeSettingsModal();
  // Clear done -> trash, with undo
  ok(A.clearDoneTodos() === 1 && A.eval(`typeof items.find(i=>i.id===${pid}).deletedAt`) === 'number', 'Clear done moves done to-dos to Deleted items');
  ok(A.eval('activity[0].text') === 'Sam cleared 1 done to-do', 'activity: ' + A.eval('activity[0].text'));
  $('toastUndo').click();
  ok(A.eval(`findLiveTodo(${pid}).completed`) === true, 'Undo clear done');

  // ---------- person rename updates to-do owners ----------
  const pJo = A.eval(`people.find(p=>p.name==='Jo').id`);
  A.eval(`adminUnlockedFlag=true`);
  const rr = A.eval(`renamePerson(${JSON.stringify(pJo)}, 'Joanna')`);
  ok(rr && rr.ok, 'rename ok ' + JSON.stringify(rr));
  ok(A.eval(`items.find(i=>i.name==='Return library books').owner`) === 'Joanna', 'rename rewrote the to-do owner');
  A.eval(`renamePerson(household.personId, 'Sammy')`);
  ok(A.eval(`items.find(i=>i.name==='Pay school lunch').owner`) === 'Sammy', 'renaming yourself rewrites your to-dos');
  A.setTodoFilter('mine');
  ok(todoNames().includes('Pay school lunch'), 'Mine still finds them after your rename');
  A.setTodoFilter('all');

  // ---------- sync: no new top-level fields; to-dos ride inside items ----------
  A.cloudFlush(); await sleep(30);
  const last = pushes[pushes.length - 1];
  const keys = Object.keys(last).sort().join();
  ok(keys === 'activity,categories,clientId,householdName,items,people,subcategories,updatedAt', 'pushed document keys unchanged: ' + keys);
  ok(Object.keys(A.eval('snapshotState()')).sort().join() === 'activity,categories,householdName,items,people,subcategories', 'snapshot keys unchanged');
  ok(last.items.filter(i => i.kind === 'todo').length >= 7, 'to-dos are inside items[] in the synced document');
  ok(!/"side"|uiSide|todoFilter/.test(JSON.stringify(last)), 'side choice is not synced');
  const B = boot(); await sleep(50);
  B.document.getElementById('householdCode').value = 'TODO-TEST-1234'; B.document.getElementById('yourName').value = 'Joanna';
  await B.enterApp();
  ok(B.eval('liveTodos().length') === A.eval('liveTodos().length') && B.eval('liveItems().length') === 3, 'a second device gets the same to-dos and budget items');

  // ---------- side choice persists per device ----------
  const st = JSON.parse(A.localStorage.getItem('ledgerSettings'));
  ok(st.side === 'todo', 'side saved in ledgerSettings: ' + st.side);
  const C = boot({ ledgerSettings: A.localStorage.getItem('ledgerSettings') }); await sleep(50);
  ok(C.eval('uiSide') === 'todo', 'a reload remembers the To-do side');
  A.setSide('budget');
  ok(JSON.parse(A.localStorage.getItem('ledgerSettings')).side === 'budget' && $('app').dataset.side === 'budget', 'switching back is saved');
  ok($('tcAddBtn').getAttribute('aria-label') === 'Add budget item' && $('hdrAddBtn').getAttribute('aria-label') === 'Add budget item' && d.querySelector('#hdrAddBtn .budget-only').textContent === '+ Budget item' && A.getComputedStyle(d.querySelector('#hdrAddBtn .todo-only')).display === 'none', 'add buttons say Budget item again');
  d.querySelector('#topCompact .btn-add').click();
  ok($('itemOverlay').style.display === 'flex' && $('todoOverlay').style.display !== 'flex' && $('modalTitle').textContent === 'Add a budget item', 'compact + adds a budget item on the Budget side');
  A.closeItemModal();
  const D = boot({ ledgerSettings: JSON.stringify({ side: 'bogus' }) }); await sleep(50);
  ok(D.eval('uiSide') === 'budget', 'unknown side falls back to Budget');

  // ---------- backup counts ----------
  A.exportBackup && (() => { try { A.URL.createObjectURL = () => 'blob:x'; A.URL.revokeObjectURL = () => {}; A.exportBackup(); } catch(e) {} })();
  ok(/3 items, \d+ to-dos, 2 people/.test($('backupMsg').textContent), 'backup message counts items and to-dos separately: ' + $('backupMsg').textContent);

  // ---------- markup safety ----------
  A.eval(`addTodo({name:'<img src=x onerror=alert(1)>', notes:'<b>x</b>'})`);
  A.setSide('todo');
  ok(!d.querySelector('#todoList img') && !d.querySelector('#todoList b'), 'names and notes are escaped');

  console.log(`\n${pass} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
