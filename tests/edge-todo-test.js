// Edge cases for the To-do side: odd names, HTML-looking text, bad dates, leap days, daylight-saving days and
// midnight, owners taken off the household, links to removed budget items, double taps, undo after changes elsewhere.
process.env.TZ = 'America/New_York';   // a zone with daylight saving, so the DST checks below mean something
const {sleep,ok,boot,mk,finish}=require('./lib/h.js');
const safe=(fn,dflt)=>{ try { return fn(); } catch(e){ console.log('  threw: '+e.message); return dflt; } };
(async()=>{
  const w=boot(), d=w.document, $=id=>d.getElementById(id);
  const errors=[]; w.addEventListener('error',e=>errors.push(e.message));
  // a clock we can move: new Date() / Date.now() read FAKE_NOW when it is set
  w.eval(`window.FAKE_NOW=null; { const RD=Date; Date=class extends RD{ constructor(...a){ if(a.length) super(...a); else super(window.FAKE_NOW==null?RD.now():window.FAKE_NOW); } static now(){ return window.FAKE_NOW==null?RD.now():window.FAKE_NOW; } }; }`);
  const setNow=s=>w.eval(`window.FAKE_NOW=${s==null?'null':`new Date(${JSON.stringify(s)}).getTime()`}`);
  const M0=w.eval('FUTURE_MONTHS[0]');
  const todo=id=>w.eval(`items.find(i=>i.id===${JSON.stringify(id)})`);
  const rows=()=>[...d.querySelectorAll('#todoList .todo-row .todo-name')].map(x=>x.textContent);
  const group=id=>w.eval(`todoGroupKey(items.find(i=>i.id===${JSON.stringify(id)}))`);
  const undo=()=>$('toastUndo').click();
  const T=(o)=>Object.assign({kind:'todo',completed:false,owner:'',createdAt:1},o);
  const setAll=arr=>w.eval(`items=${JSON.stringify(arr)}; render();`);
  w.setSide('todo');

  // ---------- names ----------
  setAll([]);
  $('todoQuickInput').value='   \n\t  '; w.quickAddTodo();
  ok(w.eval('liveTodos().length')===0,'quick add of only spaces adds nothing');
  $('todoQuickInput').value='  Call   the   plumber  '; w.quickAddTodo(); w.eval(`addTodo({name:'  Line\\n\\nbreaks '})`);
  ok(w.eval('liveTodos()[0].name')==='Call the plumber' && w.eval('liveTodos()[1].name')==='Line breaks','line breaks and extra spaces are tidied');
  w.eval(`addTodo({name:'y'.repeat(5000)})`);
  ok(w.eval('liveTodos()[2].name.length')===200,'a huge name is cut to 200');
  w.eval(`addTodo({name:'🎂 עוגה', notes:'x'.repeat(900)})`);
  ok(w.eval('liveTodos()[3].name')==='🎂 עוגה' && w.eval('liveTodos()[3].notes.length')===500,'emoji / right-to-left name kept, notes cut to 500');
  ok(w.eval(`addTodo({name:null})`)===null && w.eval(`addTodo({})`)===null,'no name: nothing added');

  // ---------- HTML-looking text ----------
  const evil='<img src=x onerror="window.__pwned=1">"\'&';
  setAll([mk({id:1,name:evil,month:M0}), T({id:2,name:evil,notes:evil,owner:evil,linkId:1,due:'2030-01-01'})]);
  const row=d.querySelector('#todoList .todo-row');
  ok(row.querySelector('.todo-name').textContent===evil && !row.querySelector('img[src="x"]'),'to-do name with HTML is text');
  ok(row.querySelector('.todo-note-text').textContent===evil && row.querySelector('.todo-owner-name').textContent===evil,'notes and owner with HTML are text');
  ok(row.querySelector('.todo-link-name').textContent===evil && row.querySelector('.todo-link-chip').title.includes(evil),'linked budget item name is text');
  w.openTodoModal(2);
  ok($('t_owner').value===evil && [...$('t_link').options].some(o=>o.textContent.startsWith(evil)),'dialog lists owner / budget item with HTML as text');
  ok(w.saveTodoModal()===true && todo(2).owner===evil,'saving keeps that owner exactly');
  ok(w.__pwned===undefined,'nothing ran from HTML-looking text');

  // ---------- website link ----------
  setAll([]);
  w.openTodoModal(); $('t_name').value='Link'; $('t_url').value='javascript:alert(1)';
  ok(w.saveTodoModal()===false && /web address/.test($('t_urlError').textContent),'javascript: link refused');
  $('t_url').value='example.com/a?b=1'; w.saveTodoModal();
  ok(w.eval('liveTodos()[0].url')==='https://example.com/a?b=1','a bare address gets https://');
  w.eval(`items.push({id:9,kind:'todo',name:'Old url',url:'ftp://x.example',completed:false}); render()`);
  ok(!d.querySelector('[data-todo-id="9"] .todo-url'),'a stored non-web link is not shown as a link');

  // ---------- due dates ----------
  setNow('2026-10-22T12:00:00');
  ok(w.eval(`cleanTodoDue('2027-02-29')`)==='' && w.eval(`cleanTodoDue('2028-02-29')`)==='2028-02-29','Feb 29 only in a leap year');
  ok(w.eval(`cleanTodoDue('2026-13-01')`)==='' && w.eval(`cleanTodoDue('2026-04-31')`)==='' && w.eval(`cleanTodoDue('26-1-1')`)==='' && w.eval(`cleanTodoDue(null)`)==='','impossible dates are dropped');
  setAll([T({id:1,name:'bad',due:'2026-02-30'}),T({id:2,name:'num',due:20261022}),T({id:3,name:'leap',due:'2028-02-29'})]);
  ok(errors.length===0 && group(1)==='none' && group(2)==='none' && group(3)==='later','stored bad dates go to No date without errors');
  ok(w.eval(`todoDueLabel('2028-02-29')`)==='Tue, Feb 29, 2028','leap-day label shows the year');
  // year end
  setNow('2026-12-31T23:30:00');
  ok(w.eval('todoDateStr(1)')==='2027-01-01' && w.eval(`todoDueLabel('2027-01-01')`)==='Tomorrow','Dec 31: tomorrow is Jan 1, labelled Tomorrow');
  ok(w.eval(`todoDueLabel('2027-01-09')`)==='Sat, Jan 9, 2027','a date next year shows the year');
  // daylight saving starts (2027-03-14 at 2am in New York: a 23-hour day)
  setNow('2027-03-14T00:30:00');
  setAll([T({id:1,due:'2027-03-13',name:'a'}),T({id:2,due:'2027-03-14',name:'b'}),T({id:3,due:'2027-03-21',name:'c'}),T({id:4,due:'2027-03-22',name:'d'})]);
  ok([1,2,3,4].map(group).join()==='overdue,today,week,later','DST start day: overdue / today / this week (7 days) / later');
  setNow('2027-03-14T23:30:00');
  ok(w.eval('todoDateStr(0)')==='2027-03-14' && w.eval('todoDateStr(1)')==='2027-03-15' && group(2)==='today','DST start day, late evening: still today');
  // daylight saving ends (2027-11-07: a 25-hour day)
  setNow('2027-11-07T23:30:00');
  setAll([T({id:1,due:'2027-11-07',name:'a'}),T({id:2,due:'2027-11-08',name:'b'}),T({id:3,due:'2027-11-06',name:'c'})]);
  ok(group(1)==='today' && w.eval(`todoDueLabel('2027-11-08')`)==='Tomorrow' && w.eval(`todoDueLabel('2027-11-06')`)==='Yesterday','DST end day: today / Tomorrow / Yesterday');
  // midnight while the app stays open
  setNow('2027-11-08T23:59:00');
  setAll([T({id:1,due:'2027-11-08',name:'Due today'})]);
  ok(d.querySelector('#todoList .todo-group').dataset.group==='today','before midnight: Today');
  setNow('2027-11-09T00:01:00');
  w.refreshTodosIfNewDay();
  ok(d.querySelector('#todoList .todo-group').dataset.group==='overdue' && /Yesterday/.test(d.querySelector('#todoList .todo-due').textContent),'after midnight the list moves it to Overdue by itself');
  setNow(null);

  // ---------- owners ----------
  setAll([T({id:1,name:'Pat job',owner:'Pat'}),T({id:2,name:'Mine',owner:'Sam'}),T({id:3,name:'Anyone'})]);
  w.openTodoModal(1);
  ok($('t_owner').value==='Pat','an owner taken off the household stays selected');
  w.closeTodoModal();
  w.setTodoFilter('mine');
  ok(rows().join()==='Mine','Mine shows only mine');
  $('todoQuickInput').value='Quick mine'; w.quickAddTodo();
  ok(rows().includes('Quick mine'),'quick add while on Mine is mine and stays visible');
  w.eval(`people=people.filter(p=>p.name!=='Sam'); render()`);
  ok(errors.length===0 && rows().includes('Mine'),'Mine still works if my profile row is gone');
  w.eval(`people.push({id:1,name:'Sam',photo:null})`);
  w.setTodoFilter('all');

  // ---------- links to budget items ----------
  setAll([mk({id:1,name:'Roof',month:M0}), mk({id:2,name:'Gutters',month:M0}), T({id:10,name:'Get quote',linkId:1}), T({id:11,name:'To todo',linkId:10}), T({id:12,name:'Text link',linkId:'1'})]);
  const chip=id=>!!d.querySelector(`[data-todo-id="${id}"] .todo-link-chip`);
  ok(chip(10) && chip(12) && !chip(11),'link shows for a budget item (number or text id), not for a to-do');
  w.deleteItem(1);
  ok(!chip(10) && w.eval('liveTodos().length')===3,'budget item removed: chip goes, to-do stays');
  w.openTodoModal(10);
  ok($('t_link').value==='1' && /\(deleted\)/.test($('t_link').selectedOptions[0].textContent),'dialog keeps the link, marked (deleted)');
  $('t_name').value='Get quote!'; w.saveTodoModal();
  ok(todo(10).linkId===1,'saving keeps the link to the removed item');
  undo();   // undo the edit
  w.restoreDeletedItem(1);
  ok(chip(10),'budget item restored: chip back');
  w.eval('finishCompleting(1,{})');
  ok(chip(10) && w.eval(`linkedTodosFor(items.find(i=>i.id===1)).length`)===2,'budget item completed: chip still there');
  safe(()=>d.querySelector('[data-todo-id="10"] .todo-link-chip').click());
  ok(w.eval('uiSide')==='budget' && w.eval('activeTab')==='completed' && !!d.querySelector('#itemsList [data-item-id="1"]'),'chip jumps to a completed item on Completed');
  w.switchTab('active'); w.setSide('todo');
  // delete forever
  w.deleteItem(1);
  const pf=w.deleteItemForever(1); $('confirmOk').click(); await pf;
  ok(!chip(10) && errors.length===0,'budget item deleted forever: no chip, no errors');
  w.openTodoModal(10);
  ok($('t_link').value==='','dialog shows None for a link to an erased item');
  w.closeTodoModal();
  ok(safe(()=>{ w.goToBudgetItem(1); return true; },false) && w.eval('uiSide')==='todo','jumping to an erased item does nothing');
  // jump opens a collapsed month and clears a hiding filter
  setAll([mk({id:2,name:'Gutters',month:M0,category:'Home'}), mk({id:3,name:'Kid',month:M0,category:'Kids'}), T({id:10,name:'Clean',linkId:2})]);
  w.eval(`collapsedMonths.add(${JSON.stringify(M0)}); activeCategoryFilter='Kids'; render()`);
  d.querySelector('[data-todo-id="10"] .todo-link-chip').click();
  ok(w.eval('activeCategoryFilter')==='All' && !!d.querySelector('#itemsList [data-item-id="2"]'),'jump clears the filter and opens the month');
  w.setSide('todo');
  // a repeating budget item: the link stays with the one that was done
  setAll([mk({id:2,name:'Filter',month:M0,repeat:{every:1,unit:'month'}}), T({id:10,name:'Buy filter',linkId:2})]);
  w.eval('finishCompleting(2,{})');
  ok(todo(10).linkId===2 && w.eval('items.filter(i=>!isTodo(i)).length')===2,'repeat: the to-do stays linked to the completed one');

  // ---------- double taps ----------
  setAll([]);
  w.openTodoModal(); $('t_name').value='Once'; w.saveTodoModal(); w.saveTodoModal();
  ok(w.eval('liveTodos().length')===1,'Add tapped twice adds once');
  const tid=w.eval('liveTodos()[0].id');
  w.completeTodo(tid); w.completeTodo(tid);
  ok(todo(tid).completed===true && /Ticked off/.test($('toast').textContent),'ticking off twice: done once');
  w.reopenTodo(tid);
  const cb=()=>d.querySelector(`#todoList [data-todo-id="${tid}"] .complete-check`);
  cb().checked=true; cb().dispatchEvent(new w.Event('change')); cb().dispatchEvent(new w.Event('change'));
  await sleep(600);
  ok(todo(tid).completed===true && w.eval('activity.filter(a=>/ticked off “Once”/.test(a.text)).length')===2,'double tap on the checkbox ticks off once');

  // ---------- undo after changes elsewhere ----------
  setAll([T({id:1,name:'Edit me',owner:''})]);
  w.openTodoModal(1); $('t_name').value='Edited'; w.saveTodoModal();
  w.eval('items[0].completed=true; items[0].completedAt=5');   // ticked off on another phone
  undo();
  ok(todo(1).name==='Edit me' && todo(1).completed===true && todo(1).completedAt===5,'undoing an edit keeps a tick-off made since');
  setAll([T({id:1,name:'Edit me'})]);
  w.openTodoModal(1); $('t_notes').value='n'; w.saveTodoModal();
  w.eval('items[0].deletedAt=Date.now()');
  undo();
  ok(!('notes' in todo(1)) && w.eval('isDeleted(items[0])'),'undoing an edit does not bring back a removed to-do');
  setAll([T({id:1,name:'Gone'})]);
  w.deleteTodo(1); w.eval('items=[]');
  safe(()=>undo());
  ok(w.eval('items.length')===0,'undo of removal after the to-do was erased does nothing');
  setAll([T({id:1,name:'Open'})]);
  w.openTodoModal(1); w.eval('items[0].deletedAt=Date.now()');
  $('t_name').value='Open again'; w.saveTodoModal();
  ok(w.eval('liveTodos().length')===1 && w.eval('liveTodos()[0].name')==='Open again','saving a to-do removed elsewhere while open adds it back once');

  // ---------- Clear done ----------
  setAll([T({id:1,name:'A',completed:true,completedAt:3,owner:'Sam'}),T({id:2,name:'B',completed:true,completedAt:2,owner:'Alex'}),T({id:3,name:'C'})]);
  w.setTodoFilter('mine');
  ok(w.clearDoneTodos()===1 && w.eval('isDeleted(items[0])') && !w.eval('isDeleted(items[1])'),'Clear done on Mine clears only mine');
  w.setTodoFilter('all');
  ok(w.clearDoneTodos()===1,'then Everyone clears the rest');
  w.restoreDeletedItem(2);
  undo();
  ok(!w.eval('isDeleted(items[1])') && w.eval('items.filter(isDeleted).length')===1,'undo after a manual restore: no double change');
  ok(w.clearDoneTodos()===1 && w.clearDoneTodos()===0,'Clear done twice: second does nothing');
  w.reopenTodo(3);   // not done: nothing happens
  ok(todo(3).completed===false,'reopen on an open to-do does nothing');

  // ---------- old-format to-dos ----------
  setAll([{id:1,kind:'todo',name:null},{id:2,kind:'todo',name:'No fields'},{id:3,kind:'todo',name:'Done no time',completed:true},{id:'x',kind:'todo',name:'Text id',due:'2020-01-01'}]);
  ok(errors.length===0 && rows().length===3,'old to-dos with missing fields draw ('+rows().length+')');
  w.toggleTodoDone(true);
  ok(d.querySelectorAll('#todoDone .todo-row').length===1,'done one without a time shows under Done');
  safe(()=>d.querySelector('[data-todo-id="x"] .todo-main').click());
  ok($('todoOverlay').style.display==='flex' && $('t_name').value==='Text id','a to-do with a text id opens');
  w.closeTodoModal();

  // ---------- many to-dos and side switching ----------
  const many=[]; for(let i=0;i<500;i++) many.push(T({id:i+1,name:'T'+i,due:i%3?undefined:'2030-01-0'+(1+i%9),createdAt:i}));
  setAll(many);
  w.setSide('budget'); w.setSide('todo'); w.setSide('budget'); w.setSide('todo');
  const ids=[...d.querySelectorAll('#todoList .todo-row')].map(r=>r.dataset.todoId);
  ok(ids.length===500 && new Set(ids).size===500 && $('sideTodoCount').textContent==='500','500 to-dos after quick side switches: each once, count 500');

  ok(errors.length===0,'no page errors overall '+errors.join(' | '));
  finish();
})().catch(e=>{ console.log('FAIL crashed: '+(e&&e.stack||e)); process.exit(1); });
