// ---- Search (the 🔍 button in the header and the compact bar) ----
// The search field opens IN the bar you tapped: it takes the place of the header's buttons, or fills the whole compact
// bar (which then stays put while the search is open; js/sticky-headers.js checks searchOpen). One results view for budget items AND to-dos together, whichever side is showing. The boards themselves are not
// filtered. Every word typed must appear somewhere in the item (any field), ignoring upper/lower case.
let searchQuery = '', searchOpen = false, searchWasShowing = false, searchWhere = 'header';
function searchTerm(){ return searchQuery.trim().toLowerCase(); }
function searchWords(q){ return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
function textMatchesAll(parts, q){
  const words = searchWords(q);
  if(!words.length) return true;
  const hay = parts.map(v => String(v == null ? '' : v).toLowerCase()).join('\n');
  return words.every(w => hay.includes(w));
}
// budget item: name, category, subcategory, owner, note, link, month, forecast and actual amounts, linked to-do names
function itemMatchesSearch(it, q){
  if(!searchWords(q).length) return true;
  const parts = [it.name, it.category, it.subcategory, it.owner, itemNote(it), itemLink(it), typeof it.link === 'string' ? it.link : '',
    it.month, fmtMoney(it.cost), fmtMoneyShort(it.cost), String(Number(it.cost) || 0)];
  if(hasActualCost(it)) parts.push(fmtMoney(it.actualCost), fmtMoneyShort(it.actualCost), String(it.actualCost));
  linkedTodosFor(it).forEach(t => parts.push(t.name));
  return textMatchesAll(parts, q);
}
// to-do: name, notes, owner, category, due date (as shown and as typed), linked budget item name
function todoMatchesSearch(t, q){
  if(!searchWords(q).length) return true;
  const li = todoLinkedItem(t);
  return textMatchesAll([t.name, t.notes, todoUrl(t), t.owner, todoCategory(t), t.due ? todoDueLabel(t.due) : '', t.due, li ? li.name : ''], q);
}
function searchShowing(){ return searchOpen && !!searchTerm(); }

// moves the one search field into the header or the compact bar and swaps that bar's buttons for it
function placeSearchRow(){
  const row = document.getElementById('searchRow');
  const header = document.getElementById('appHeader'), compact = document.getElementById('topCompact');
  const host = searchOpen && searchWhere === 'compact' ? compact : header;
  if(row.parentNode !== host) host.appendChild(row);
  header.classList.toggle('search-on', searchOpen && searchWhere === 'header');
  compact.classList.toggle('search-on', searchOpen && searchWhere === 'compact');
}
function updateSearchUi(){
  document.getElementById('searchRow').hidden = !searchOpen;
  placeSearchRow();
  ['searchBtn', 'searchBtnCompact'].forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.setAttribute('aria-expanded', searchOpen ? 'true' : 'false');
    btn.classList.toggle('open', searchOpen);
    btn.classList.toggle('active', !!searchTerm());
  });
  document.getElementById('searchClear').hidden = !searchQuery;
}
// where: 'header' or 'compact'; by default the bar that is showing right now
function openSearch(where){
  searchWhere = where === 'compact' || where === 'header' ? where
    : (document.documentElement.classList.contains('page-collapsed') ? 'compact' : 'header');
  searchOpen = true;
  updateSearchUi();
  const inp = document.getElementById('searchInput');
  try { inp.focus({ preventScroll:true }); } catch(e) {}
}
// the search button that can be seen right now (the compact bar's while the page header is tucked away)
function visibleSearchBtn(){
  return document.getElementById(document.documentElement.classList.contains('page-collapsed') ? 'searchBtnCompact' : 'searchBtn');
}
function closeSearch(){
  const had = !!searchQuery;
  searchOpen = false; searchQuery = '';
  document.getElementById('searchInput').value = '';
  updateSearchUi();
  if(window.syncPageBar) window.syncPageBar();   // the page header may have been held still while searching
  if(had) renderCore();   // back to the side you were on
  try { visibleSearchBtn().focus({ preventScroll:true }); } catch(e) {}
}
function toggleSearch(where){ searchOpen ? closeSearch() : openSearch(where); }
function clearSearch(){
  searchQuery = '';
  const inp = document.getElementById('searchInput');
  inp.value = '';
  updateSearchUi();
  renderCore();
  try { inp.focus({ preventScroll:true }); } catch(e) {}
}
function onSearchInput(){
  searchQuery = document.getElementById('searchInput').value;
  updateSearchUi();
  renderCore();
}
document.getElementById('searchInput').addEventListener('keydown', e => {
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeSearch(); }
});
// A tap anywhere off the search (not the field, its results, the search buttons, a dialog or a toast) closes it.
document.addEventListener('click', e => {
  if(!searchOpen || !(e.target instanceof Element) || !e.target.isConnected) return;
  if(e.target.closest('#searchRow, #searchView, #searchBtn, #searchBtnCompact, .overlay, #toastRegion')) return;
  closeSearch();
});

// The results: "Budget items (N)" then "To-dos (N)". Cards and rows are the real ones, so their checkbox and ⋯ work.
function renderSearchResults(){
  const view = document.getElementById('searchView');
  if(!view) return;
  const on = searchShowing();
  document.getElementById('app').classList.toggle('is-searching', on);
  view.hidden = !on;
  const res = document.getElementById('searchResults');
  res.innerHTML = '';
  if(!on){ document.getElementById('searchCountNote').textContent = ''; searchWasShowing = false; return; }
  // results start at the top: under the header, or (searching from the compact bar, which stays) right under it
  if(!searchWasShowing){
    const cur = window.pageYOffset || 0;
    const y = searchWhere === 'compact'
      ? Math.max(0, Math.round(view.getBoundingClientRect().top + cur - document.getElementById('topCompact').offsetHeight - 12)) : 0;
    if(Math.abs(cur - y) > 1){ try { window.scrollTo(0, y); } catch(e) {} }
  }
  searchWasShowing = true;
  const q = searchTerm();
  const its = liveItems().filter(i => itemMatchesSearch(i, q))
    .sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0) || cmpMonth(a.month, b.month));
  const groupRank = t => t.completed ? 99 : TODO_GROUPS.findIndex(g => g.key === todoGroupKey(t));
  const tds = liveTodos().filter(t => todoMatchesSearch(t, q))
    .sort((a, b) => groupRank(a) - groupRank(b) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  const n = its.length + tds.length;
  document.getElementById('searchCountNote').textContent = n ? `${n} match${n === 1 ? '' : 'es'}` : '';
  if(!n){
    res.innerHTML = `<div class="empty"><strong>No matches</strong> for “${escapeHtml(searchQuery.trim())}”.<br>Try a different word. Search looks in budget items and to-dos, including notes, people and amounts.</div>`;
    return;
  }
  const section = (id, title, count, noneText, fill) => {
    const sec = document.createElement('section');
    sec.className = 'search-section';
    sec.id = id;
    sec.innerHTML = `<h3 class="search-section-head">${title} <span class="search-count">${count}</span></h3>`;
    const body = document.createElement('div');
    body.className = 'search-section-body';
    if(count) fill(body);
    else body.innerHTML = `<p class="search-none">${noneText}</p>`;
    sec.appendChild(body);
    res.appendChild(sec);
  };
  section('searchBudget', 'Budget items', its.length, 'No budget items match.',
    body => its.forEach(it => body.appendChild(buildItemCard(it, { completedView: !!it.completed, doneLabel: true }))));
  section('searchTodos', 'To-dos', tds.length, 'No to-dos match.',
    body => tds.forEach(t => body.appendChild(buildTodoRow(t))));
}
