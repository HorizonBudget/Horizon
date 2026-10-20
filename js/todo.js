// ---- To-do side: a simple shared to-do list next to the budget board ----
// To-dos are stored inside the synced `items` array as { kind:'todo', ... } (the Firestore rules only allow the
// existing top-level fields, so there is no separate list). Fields: id, kind, name, completed, completedAt (when
// ticked off), due ('YYYY-MM-DD', optional), owner (person NAME, '' = anyone), notes, linkId (a budget item's id),
// createdAt, deletedAt (Deleted items). The budget side never sees them: liveItems()/findLiveItem() skip kind:'todo'.
// Which side is showing (uiSide) is remembered per device in ledgerSettings (js/settings.js), never synced.

let todoFilter = 'all';       // 'all' (Everyone) or 'mine'; remembered only while the page is open
let todoDoneOpen = false;     // the "Done (N)" section starts folded
let editingTodoId = null;
// collapsed due-date groups, remembered on this device like the budget's month groups (never synced)
const TODO_COLLAPSE_KEY = 'horizonCollapsedTodoGroups';
let collapsedTodoGroups = readCollapsedSet(TODO_COLLAPSE_KEY);
let shownTodoGroups = [];
const TODO_TICK_MS = 420;     // the tick animation plays this long before the to-do moves to Done
const TODO_NAME_MAX = 200, TODO_NOTES_MAX = 500;
const TODO_GROUPS = [
  { key: 'overdue', label: 'Overdue',   color: 'var(--coral)' },
  { key: 'today',   label: 'Today',     color: 'var(--mustard)' },
  { key: 'week',    label: 'This week', color: 'var(--teal)' },
  { key: 'later',   label: 'Later',     color: 'var(--ink-soft)' },
  { key: 'none',    label: 'No date',   color: 'var(--line)' }
];

// ---- Dates (local calendar days; noon avoids daylight-saving edges) ----
function todoDateStr(offsetDays){
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (Number(offsetDays) || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseTodoDate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if(!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return (isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) ? null : d;
}
function cleanTodoDue(s){ return parseTodoDate(s) ? String(s) : ''; }
// whole days from today to the due date (negative = overdue), or null when there is no date
function todoDaysFromToday(due){
  const d = parseTodoDate(due);
  if(!d) return null;
  return Math.round((d - parseTodoDate(todoDateStr(0))) / DAY_MS);
}
// Overdue (before today), Today, This week (the next 7 days), Later, No date
function todoGroupKey(t){
  const n = todoDaysFromToday(t.due);
  if(n === null) return 'none';
  if(n < 0) return 'overdue';
  if(n === 0) return 'today';
  if(n <= 7) return 'week';
  return 'later';
}
function todoDueLabel(due){
  const n = todoDaysFromToday(due);
  if(n === null) return '';
  if(n === 0) return 'Today';
  if(n === 1) return 'Tomorrow';
  if(n === -1) return 'Yesterday';
  const d = parseTodoDate(due);
  if(n > 1 && n < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if(d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// ---- Small helpers ----
function cleanTodoName(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, TODO_NAME_MAX); }
function todoLinkedItem(t){
  if(!t || t.linkId == null) return null;
  return liveItems().find(i => String(i.id) === String(t.linkId)) || null;
}
function todoIsMine(t){ return !!t.owner && t.owner === household.name; }
function linkedTodosFor(item){ return liveTodos().filter(t => t.linkId != null && String(t.linkId) === String(item.id)); }

// ---- Switching sides ----
function setSide(side){
  side = side === 'todo' ? 'todo' : 'budget';
  // picking a side while searching closes the search (results cover both sides)
  const wasSearching = !!(searchQuery || searchOpen);
  if(wasSearching){
    searchQuery = ''; searchOpen = false;
    const inp = document.getElementById('searchInput');
    if(inp) inp.value = '';
  }
  if(side === uiSide && !wasSearching){ applySide(); return; }
  if(side !== uiSide){ uiSide = side; saveSettings(); }
  if((window.pageYOffset || 0) > 0){ try { window.scrollTo(0, 0); } catch(e) {} }
  renderCore();
}
function applySide(){
  const app = document.getElementById('app');
  if(!app) return;
  const todo = uiSide === 'todo';
  app.dataset.side = todo ? 'todo' : 'budget';
  document.querySelectorAll('.side-opt').forEach(b => {
    const on = b.dataset.side === uiSide;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const addLabel = todo ? 'Add to-do item' : 'Add budget item';
  ['tcAddBtn', 'hdrAddBtn'].forEach(id => {
    const b = document.getElementById(id);
    if(b){ b.setAttribute('aria-label', addLabel); b.title = addLabel; }
  });
}
// the + buttons in the header and the compact bar add to whichever side is showing
function openAddForSide(){
  if(uiSide === 'todo') openTodoModal();
  else openItemModal();
}
function setTodoFilter(f){
  todoFilter = f === 'mine' ? 'mine' : 'all';
  renderCore();
}

// ---- Rendering ----
function renderTodos(){
  const list = document.getElementById('todoList');
  if(!list) return;
  const all = liveTodos();
  const open = all.filter(t => !t.completed);
  const overdueAll = open.filter(t => todoGroupKey(t) === 'overdue').length;

  // the count on the To-do switch: everything still open, red-ish when something is overdue
  const badge = document.getElementById('sideTodoCount');
  if(badge){
    badge.hidden = !open.length;
    badge.textContent = open.length;
    badge.classList.toggle('has-overdue', overdueAll > 0);
    badge.title = open.length + ' to do' + (overdueAll ? ', ' + overdueAll + ' overdue' : '');
  }
  document.getElementById('todoTabAllBtn').classList.toggle('active', todoFilter === 'all');
  document.getElementById('todoTabMineBtn').classList.toggle('active', todoFilter === 'mine');

  const shown = t => todoFilter !== 'mine' || todoIsMine(t);
  const shownOpen = open.filter(shown);
  const shownDone = all.filter(t => t.completed && shown(t)).sort((a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0));

  const overdue = shownOpen.filter(t => todoGroupKey(t) === 'overdue').length;
  document.getElementById('todoCountNote').textContent = shownOpen.length
    ? `${shownOpen.length} to do${overdue ? ' · ' + overdue + ' overdue' : ''}`
    : '';
  document.getElementById('todoTitle').textContent = todoFilter === 'mine' ? 'My to-dos' : 'To do';

  list.innerHTML = '';
  shownTodoGroups = [];
  if(!shownOpen.length){
    let msg;
    if(!all.length) msg = '<strong>Nothing on the list yet.</strong><br>Add the little jobs that go with your plans, like “Book the furnace service” or “Call about the roof quote”.';
    else if(!open.length) msg = '<strong>All done!</strong> 🎉<br>Everything on the list is ticked off.';
    else if(todoFilter === 'mine') msg = '<strong>Nothing on your plate.</strong><br>No open to-dos are assigned to you. Tap Everyone to see the whole list.';
    else msg = 'Nothing open here.';
    list.innerHTML = `<div class="empty todo-empty">${msg}</div>`;
  } else {
    const byGroup = {};
    shownOpen.forEach(t => { const k = todoGroupKey(t); (byGroup[k] = byGroup[k] || []).push(t); });
    const groups = TODO_GROUPS.filter(g => byGroup[g.key] && byGroup[g.key].length);
    shownTodoGroups = groups.map(g => g.key);
    groups.forEach(g => {
      const rows = byGroup[g.key];
      // dated groups: soonest first; No date: newest first, so something just added is easy to find
      if(g.key === 'none') rows.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      else rows.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      list.appendChild(buildGroupSection({
        data: { group: g.key }, bodyId: 'todoGroupBody-' + g.key, collapsed: collapsedTodoGroups.has(g.key),
        dot: g.color, name: g.label, count: `${rows.length} to-do${rows.length === 1 ? '' : 's'}`, className: 'todo-group',
        onToggle: () => toggleTodoGroup(g.key),
        fill: body => rows.forEach(t => body.appendChild(buildTodoRow(t)))
      }));
    });
  }
  const allCollapsed = shownTodoGroups.length > 0 && shownTodoGroups.every(k => collapsedTodoGroups.has(k));
  renderCollapseAllLink(document.getElementById('todoToolsSlot'), 'todoCollapseAllBtn', shownTodoGroups.length, allCollapsed, () => setAllTodoGroupsCollapsed(!allCollapsed));

  // Done (N): folded by default, newest first, with Clear done
  const doneWrap = document.getElementById('todoDone');
  doneWrap.innerHTML = '';
  if(shownDone.length){
    const head = document.createElement('div');
    head.className = 'todo-done-head';
    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'month-group-btn todo-done-toggle';
    tog.id = 'todoDoneToggle';
    tog.setAttribute('aria-expanded', todoDoneOpen ? 'true' : 'false');
    tog.setAttribute('aria-controls', 'todoDoneBody');
    tog.innerHTML = `<span class="mg-chev" aria-hidden="true">▾</span><span class="mg-name">Done</span><span class="mg-count">${shownDone.length}</span>`;
    tog.addEventListener('click', () => toggleTodoDone());
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'btn btn-ghost todo-clear-done';
    clr.id = 'todoClearDone';
    clr.textContent = 'Clear done';
    clr.title = 'Move the done to-dos to Deleted items';
    clr.addEventListener('click', () => clearDoneTodos());
    head.appendChild(tog); head.appendChild(clr);
    const body = document.createElement('div');
    body.className = 'todo-done-body';
    body.id = 'todoDoneBody';
    if(!todoDoneOpen) body.hidden = true;
    else shownDone.forEach(t => body.appendChild(buildTodoRow(t)));
    doneWrap.appendChild(head); doneWrap.appendChild(body);
  }
}

function toggleTodoGroup(key){
  if(collapsedTodoGroups.has(key)) collapsedTodoGroups.delete(key); else collapsedTodoGroups.add(key);
  writeCollapsedSet(TODO_COLLAPSE_KEY, collapsedTodoGroups);
  renderCore();
  const b = [...document.querySelectorAll('#todoList .month-group-btn')].find(x => x.dataset.group === key);
  if(b) try { b.focus({ preventScroll: true }); } catch(e) {}
}
function setAllTodoGroupsCollapsed(collapse){
  shownTodoGroups.forEach(k => { if(collapse) collapsedTodoGroups.add(k); else collapsedTodoGroups.delete(k); });
  writeCollapsedSet(TODO_COLLAPSE_KEY, collapsedTodoGroups);
  renderCore();
  const b = document.getElementById('todoCollapseAllBtn');
  if(b) try { b.focus({ preventScroll: true }); } catch(e) {}
}

function buildTodoRow(t){
  const row = document.createElement('div');
  row.className = 'todo-row' + (t.completed ? ' is-done' : '');
  row.dataset.todoId = t.id;
  const g = todoGroupKey(t);
  if(!t.completed) row.dataset.group = g;

  // the same square checkbox as the budget cards (restore-check when done), on the right, in a 44px tap area
  const wrap = document.createElement('label');
  wrap.className = 'todo-check-wrap';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'complete-check' + (t.completed ? ' restore-check' : '');
  cb.checked = !!t.completed;
  cb.title = t.completed ? 'Mark as not done' : 'Mark done';
  cb.setAttribute('aria-label', (t.completed ? 'Put back on the list: ' : 'Mark done: ') + t.name);
  cb.addEventListener('change', () => onTodoCheck(t.id, cb));
  wrap.appendChild(cb);

  const main = document.createElement('div');
  main.className = 'todo-main';
  main.setAttribute('role', 'button');
  main.tabIndex = 0;
  const meta = [];
  if(t.due){
    const cls = t.completed ? '' : ' due-' + g;
    meta.push(`<span class="todo-due${cls}"><span class="note-icon" aria-hidden="true">📅</span>${escapeHtml(todoDueLabel(t.due))}</span>`);
  }
  if(t.owner) meta.push(`<span class="todo-owner">${avatarHtml(t.owner, 'sm')}<span class="todo-owner-name">${escapeHtml(t.owner)}</span></span>`);
  const li = todoLinkedItem(t);
  if(li) meta.push(`<span class="todo-link"><span class="note-icon" aria-hidden="true">💵</span><button type="button" class="todo-link-chip" title="Go to the budget item “${escAttr(li.name)}”"><span class="todo-link-name">${escapeHtml(li.name)}</span></button></span>`);
  const note = String(t.notes || '').trim();
  const url = todoUrl(t);
  main.innerHTML = `<div class="todo-name">${escapeHtml(t.name)}</div>`
    + (meta.length ? `<div class="todo-meta">${meta.join('')}</div>` : '')
    + (url ? `<div class="todo-url item-note"><span class="note-icon" aria-hidden="true">🔗</span>${linkChipHtml(url)}</div>` : '')
    + (note ? `<div class="todo-note item-note"><span class="note-icon" aria-hidden="true">📝</span><span class="todo-note-text">${escapeHtml(note)}</span></div>` : '');
  const open = () => openTodoModal(t.id);
  main.addEventListener('click', e => { if(!e.target.closest('.todo-link-chip, .link-chip')) open(); });
  main.addEventListener('keydown', e => { if(e.target === main && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); open(); } });
  const chip = main.querySelector('.todo-link-chip');
  if(chip && li) chip.addEventListener('click', e => { e.stopPropagation(); goToBudgetItem(li.id); });

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'todo-more';
  more.setAttribute('aria-label', 'Details for ' + t.name);
  more.title = 'Details';
  more.textContent = '⋯';
  more.addEventListener('click', open);

  row.appendChild(main); row.appendChild(more); row.appendChild(wrap);
  return row;
}

function toggleTodoDone(open){
  todoDoneOpen = open === undefined ? !todoDoneOpen : !!open;
  renderCore();
  const b = document.getElementById('todoDoneToggle');
  if(b) try { b.focus({ preventScroll: true }); } catch(e) {}
}

// ---- Changes (each ends in render(), which also syncs) ----
// a to-do's website link (only a real http(s) address counts)
function todoUrl(t){ const u = t && typeof t.url === 'string' ? t.url.trim() : ''; return u && isUrl(u) ? u : ''; }
function addTodo(f){
  f = f || {};
  const name = cleanTodoName(f.name);
  if(!name) return null;
  const t = { id: Date.now() + Math.random(), kind: 'todo', name, completed: false, owner: f.owner || '', createdAt: Date.now() };
  const due = cleanTodoDue(f.due); if(due) t.due = due;
  const notes = String(f.notes || '').trim().slice(0, TODO_NOTES_MAX); if(notes) t.notes = notes;
  const url = normalizeLinkInput(f.url); if(url) t.url = url;
  if(f.linkId != null) t.linkId = f.linkId;
  items.push(t);
  logActivity(`${household.name} added to-do “${name}”`);
  render();
  return t;
}
function quickAddTodo(){
  const inp = document.getElementById('todoQuickInput');
  const name = cleanTodoName(inp.value);
  if(!name){ try { inp.focus(); } catch(e) {} return null; }
  // with "Mine" showing, a quick add is yours, so it doesn't vanish from the list you're looking at
  const t = addTodo({ name, owner: todoFilter === 'mine' ? household.name : '' });
  inp.value = '';
  try { inp.focus({ preventScroll: true }); } catch(e) {}
  flashTodoRow(t && t.id);
  return t;
}
// The 💵 chip on a to-do: switch to the Budget side and bring that item's card into view, opening its month
// (or the Completed tab, or clearing a category filter that hides it) and flashing it, like a new to-do.
function goToBudgetItem(id){
  const it = findLiveItem(id);
  if(!it) return;
  activeTab = it.completed ? 'completed' : 'active';
  if(!it.completed){
    if(collapsedMonths.delete(it.month || 'No date yet')) saveCollapsedMonths();
    if(activeCategoryFilter !== 'All' && activeCategoryFilter !== it.category) activeCategoryFilter = 'All';
  }
  setSide('budget');
  const card = document.querySelector(`#budgetView [data-item-id="${it.id}"]`);
  if(!card) return;
  card.classList.add('is-new');
  if(card.scrollIntoView) try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(e) {}
  setTimeout(() => card.classList.remove('is-new'), 1600);
}
function flashTodoRow(id){
  if(id == null) return;
  const row = [...document.querySelectorAll('#todoList .todo-row')].find(r => r.dataset.todoId === String(id));
  if(!row) return;
  row.classList.add('is-new');
  if(row.scrollIntoView) try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(e) {}
  setTimeout(() => row.classList.remove('is-new'), 1600);
}

function onTodoCheck(id, cb){
  const t = findLiveTodo(id);
  if(!t){ renderCore(); return; }
  if(t.completed){ reopenTodo(id); return; }
  if(!cb.checked) return;
  const row = cb.closest('.todo-row');
  if(row) row.classList.add('is-ticking');
  setTimeout(() => completeTodo(id), TODO_TICK_MS);
}
function completeTodo(id){
  const t = findLiveTodo(id);
  if(!t || t.completed){ renderCore(); return false; }
  t.completed = true;
  t.completedAt = Date.now();
  logActivity(`${household.name} ticked off “${t.name}”`);
  render();
  showToast(`Ticked off “${truncText(t.name, 40)}”.`, () => {
    const cur = findLiveTodo(id);
    if(!cur || !cur.completed) return;
    cur.completed = false; delete cur.completedAt;
    logActivity(`${household.name} undid ticking off “${cur.name}”`);
    render();
  });
  return true;
}
function reopenTodo(id){
  const t = findLiveTodo(id);
  if(!t || !t.completed){ renderCore(); return false; }
  t.completed = false; delete t.completedAt;
  logActivity(`${household.name} put “${t.name}” back on the to-do list`);
  render();
  return true;
}
function deleteTodo(id){
  const t = findLiveTodo(id);
  if(!t) return false;
  t.deletedAt = Date.now();
  logActivity(`${household.name} removed to-do “${t.name}”`);
  render();
  showToast(`Removed “${truncText(t.name, 40)}”.`, () => {
    const cur = items.find(i => i.id === id && isTodo(i) && isDeleted(i));
    if(!cur) return;
    delete cur.deletedAt;
    logActivity(`${household.name} undid removing “${cur.name}”`);
    render();
  });
  return true;
}
// moves the done to-dos that are showing (respecting Everyone / Mine) to Deleted items
function clearDoneTodos(){
  const done = liveTodos().filter(t => t.completed && (todoFilter !== 'mine' || todoIsMine(t)));
  if(!done.length) return 0;
  const now = Date.now(), ids = done.map(t => t.id);
  done.forEach(t => { t.deletedAt = now; });
  const n = done.length, label = n === 1 ? '1 done to-do' : n + ' done to-dos';
  logActivity(`${household.name} cleared ${label}`);
  render();
  showToast(`Cleared ${label}.`, () => {
    items.forEach(i => { if(ids.includes(i.id) && isTodo(i) && Number(i.deletedAt) === now) delete i.deletedAt; });
    logActivity(`${household.name} undid clearing ${label}`);
    render();
  });
  return n;
}

// ---- Details dialog ----
function populateTodoOwnerSelect(selected){
  const sel = document.getElementById('t_owner');
  let opts = '<option value="">Anyone</option>';
  opts += people.map(p => `<option value="${escAttr(p.name)}" ${p.name === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  // someone taken off the household list keeps their to-dos as plain text; keep that name selectable
  if(selected && !people.some(p => p.name === selected)) opts += `<option value="${escAttr(selected)}" selected>${escapeHtml(selected)}</option>`;
  sel.innerHTML = opts;
  sel.value = selected || '';
}
function populateTodoLinkSelect(linkId){
  const sel = document.getElementById('t_link');
  const cur = linkId == null ? null : items.find(i => !isTodo(i) && String(i.id) === String(linkId));
  const choices = liveItems().filter(i => !i.completed).sort((a, b) => cmpMonth(a.month, b.month) || String(a.name).localeCompare(String(b.name)));
  const label = i => i.name + (i.month && i.month !== 'No date yet' ? ' · ' + i.month : '');
  let opts = '<option value="">None</option>';
  opts += choices.map(i => `<option value="${escAttr(String(i.id))}">${escapeHtml(label(i))}</option>`).join('');
  // keep an existing link that is no longer in the list (checked off, or waiting in Deleted items)
  if(cur && !choices.includes(cur)) opts += `<option value="${escAttr(String(cur.id))}">${escapeHtml(label(cur) + (isDeleted(cur) ? ' (deleted)' : ' (done)'))}</option>`;
  sel.innerHTML = opts;
  sel.value = cur ? String(cur.id) : '';
}
function setTodoDueQuick(days){
  document.getElementById('t_due').value = days === null ? '' : todoDateStr(days);
  updateTodoDueChips();
}
function updateTodoDueChips(){
  const v = document.getElementById('t_due').value;
  document.querySelectorAll('#todoDueChips .chip').forEach(c => {
    const d = c.dataset.due;
    c.classList.toggle('selected', d === '' ? !v : v === todoDateStr(Number(d)));
  });
}
function openTodoModal(id){
  const t = id != null ? findLiveTodo(id) : null;
  editingTodoId = t ? t.id : null;
  document.getElementById('todoModalTitle').textContent = t ? 'Edit to-do' : 'Add a to-do item';
  document.getElementById('t_name').value = t ? t.name : '';
  document.getElementById('t_nameError').textContent = '';
  document.getElementById('t_due').value = t ? cleanTodoDue(t.due) : '';
  populateTodoOwnerSelect(t ? (t.owner || '') : (todoFilter === 'mine' ? household.name : ''));
  populateTodoLinkSelect(t ? t.linkId : null);
  document.getElementById('t_notes').value = t ? (t.notes || '') : '';
  document.getElementById('t_url').value = t ? todoUrl(t) : '';
  document.getElementById('t_urlError').textContent = '';
  document.getElementById('todoDeleteBtn').style.display = t ? '' : 'none';
  document.getElementById('todoSaveBtn').textContent = t ? 'Save' : 'Add';
  updateTodoDueChips();
  document.getElementById('todoOverlay').style.display = 'flex';
  if(!t){ try { document.getElementById('t_name').focus({ preventScroll: true }); } catch(e) {} }
}
function closeTodoModal(){
  document.getElementById('todoOverlay').style.display = 'none';
  editingTodoId = null;
}
function saveTodoModal(){
  const name = cleanTodoName(document.getElementById('t_name').value);
  if(!name){
    document.getElementById('t_nameError').textContent = 'Give the to-do a name.';
    try { document.getElementById('t_name').focus(); } catch(e) {}
    return false;
  }
  const due = cleanTodoDue(document.getElementById('t_due').value);
  const owner = document.getElementById('t_owner').value || '';
  const notes = document.getElementById('t_notes').value.trim().slice(0, TODO_NOTES_MAX);
  const url = normalizeLinkInput(document.getElementById('t_url').value);
  if(url === null){
    document.getElementById('t_urlError').textContent = "That doesn't look like a web address. Put plain text in Notes.";
    try { document.getElementById('t_url').focus(); } catch(e) {}
    return false;
  }
  const lv = document.getElementById('t_link').value;
  const li = lv ? items.find(i => !isTodo(i) && String(i.id) === lv) : null;
  const linkId = li ? li.id : null;
  // someone may have removed this to-do while the window was open; then it is saved as a new one
  const t = editingTodoId != null ? findLiveTodo(editingTodoId) : null;
  if(!t){
    closeTodoModal();
    return !!addTodo({ name, due, owner, notes, url, linkId });
  }
  const before = JSON.parse(JSON.stringify(t));
  t.name = name; t.owner = owner;
  if(due) t.due = due; else delete t.due;
  if(notes) t.notes = notes; else delete t.notes;
  if(url) t.url = url; else delete t.url;
  if(linkId != null) t.linkId = linkId; else delete t.linkId;
  closeTodoModal();
  if(JSON.stringify(before) === JSON.stringify(t)) return true;   // nothing changed
  logActivity(`${household.name} updated to-do “${name}”`);
  render();
  const id = t.id;
  showToast(`Saved changes to “${truncText(name, 40)}”.`, () => {
    const cur = items.find(i => i.id === id);
    if(!cur) return;
    Object.keys(cur).forEach(k => { delete cur[k]; });
    Object.assign(cur, before);
    logActivity(`${household.name} undid the changes to “${before.name}”`);
    render();
  });
  return true;
}
function deleteTodoFromModal(){
  const id = editingTodoId;
  closeTodoModal();
  if(id != null) deleteTodo(id);
}

// ---- Budget card: a small "☑ 1/3 to-dos" tag when to-dos are linked to the item (tap = go to the To-do side) ----
function linkedTodoTagHtml(item){
  const linked = linkedTodosFor(item);
  if(!linked.length) return '';
  const done = linked.filter(t => t.completed).length, n = linked.length;
  const title = `${n} linked to-do${n === 1 ? '' : 's'}, ${done} done. Tap to open the To-do list.`;
  return `<button type="button" class="tag tag-todo${done === n ? ' all-done' : ''}" onclick="setSide('todo')" title="${escAttr(title)}" aria-label="${escAttr(title)}"><span aria-hidden="true">☑</span> ${done}/${n} to-do${n === 1 ? '' : 's'}</button>`;
}
