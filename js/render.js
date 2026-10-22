// every data change ends in render(); that's the single place we notice "something changed, sync it"
function render(){
  renderCore();
  cloudSchedulePush();
}

function renderCore(){
  useLinkIndex(true);   // budget item <-> to-do links are indexed once per draw (js/todo.js)
  try {
    updateIdentityUi();
    applySide();
    renderBoard();
    renderTodos();
    renderSearchResults();
    refreshTrashUi();
  } finally { useLinkIndex(false); }
  restoreLeftAt();   // after a reload or Back: back to where the page was (js/month-groups.js)
  if(!window.ResizeObserver && window.refreshPageBar) window.refreshPageBar();
}

// Cards are only built for what can be seen: the Budget side's list stays empty while the To-do side or the search
// results are showing (both redraw through renderCore() when they hand back), and a collapsed month builds its cards
// when it is opened (buildGroupSection). Totals, counts and filters are always kept up to date.
function budgetListShown(){ return uiSide !== 'todo' && !searchShowing(); }

function renderBoard(){
  document.getElementById('tabActiveBtn').classList.toggle('active', activeTab === 'active');
  document.getElementById('tabCompletedBtn').classList.toggle('active', activeTab === 'completed');
  // search no longer filters the board: it has its own results view covering both sides (js/search.js)
  const completedItems = liveItems().filter(i => i.completed);
  cancelLaterCards();   // any cards still waiting from the first draw are rebuilt below (js/month-groups.js)
  updateSearchUi();
  updateBackupBanner();

  const summaryStrip = document.getElementById('summaryStrip');
  const sectionTitleEl = document.getElementById('sectionTitle');
  const filterNoteEl = document.getElementById('filterNote');
  const filtersBtnEl = document.getElementById('filtersBtn');
  const list = document.getElementById('itemsList');
  document.getElementById('monthToolsSlot').innerHTML = '';   // Collapse all is added below only when there are month groups

  if(activeTab === 'completed'){
    summaryStrip.style.display = 'none';
    filtersBtnEl.style.display = 'none';
    document.getElementById('filterPanel').classList.remove('open');
    document.getElementById('sortControl').style.display = 'none';
    sectionTitleEl.textContent = 'Completed';
    // on this tab the summary line just says how many are checked off
    filterNoteEl.textContent = completedItems.length
      ? `${completedItems.length} item${completedItems.length>1?'s':''} checked off`
      : '';
    document.getElementById('filterClear').style.display = 'none';
    document.getElementById('filterSummary').style.display = completedItems.length ? '' : 'none';

    list.innerHTML = '';
    if(!budgetListShown()){
      // built when the Budget side shows again
    } else if(completedItems.length === 0){
      list.innerHTML = '<div class="empty">Nothing completed yet. Check an item off from Active to see it here.</div>';
    } else {
      const sorted = [...completedItems].sort((a,b) => cmpMonth(a.month, b.month));
      sorted.forEach(item => list.appendChild(buildItemCard(item, { completedView: true })));
    }

    renderActivity();
    return;
  }

  summaryStrip.style.display = '';
  filtersBtnEl.style.display = '';
  sectionTitleEl.textContent = 'Coming up';
  applyFiltersOpen();

  renderCategoryFilter();
  updateFilterNote();

  list.innerHTML = '';
  const activeItems = liveItems().filter(i => !i.completed);
  let visible = activeItems;
  if(activeCategoryFilter !== 'All') visible = visible.filter(i => catKey(i.category) === activeCategoryFilter);

  // "sort by subcategory" only makes sense once a single category with subcategories is selected
  const catHasSub = activeCategoryFilter !== 'All'
    && SUBCATEGORIES[activeCategoryFilter] && SUBCATEGORIES[activeCategoryFilter].length > 0;
  const sortControl = document.getElementById('sortControl');
  if(catHasSub){
    sortControl.style.display = '';
    document.getElementById('sortModeSelect').value = sortMode;
  } else {
    sortControl.style.display = 'none';
    sortMode = 'month';
  }

  shownGroupMonths = [];
  if(activeItems.length === 0){
    list.innerHTML = '<div class="empty">Nothing on the board yet. Tap “+ Budget item” to add the first thing you’ll need to buy.</div>';
  } else if(visible.length === 0){
    list.innerHTML = '<div class="empty">Nothing matches this filter yet.</div>';
  } else {
    // one section per month, oldest first, "No date yet" last; sorting applies inside each section
    const byMonth = new Map();
    visible.forEach(it => {
      const key = it.month || 'No date yet';
      if(!byMonth.has(key)) byMonth.set(key, { month: key, items: [] });
      byMonth.get(key).items.push(it);
    });
    const groups = [...byMonth.values()].sort((a, b) => cmpMonth(a.month, b.month));
    if(sortMode === 'subcategory'){
      groups.forEach(g => g.items.sort((a, b) => (a.subcategory || '￿').localeCompare(b.subcategory || '￿')));
    }
    shownGroupMonths = groups.map(g => g.month);
    // lives in the heading row beside Filters (not in the list), so it takes no row of its own
    const allCollapsed = groups.every(g => collapsedMonths.has(g.month));
    renderCollapseAllLink(document.getElementById('monthToolsSlot'), 'collapseAllBtn', groups.length, allCollapsed, () => setAllMonthsCollapsed(!allCollapsed));
    if(budgetListShown()){
      const openCards = groups.reduce((n, g) => n + (collapsedMonths.has(g.month) ? 0 : g.items.length), 0);
      const fill = boardCardFiller(openCards);   // a big board's first draw adds its far cards a moment later
      const frag = document.createDocumentFragment();
      groups.forEach((g, i) => frag.appendChild(buildMonthGroup(g, i, fill)));
      list.appendChild(frag);
      runLaterCards();
    }
  }

  // stats — reflect the category filter when it is on
  const activeFilters = [activeCategoryFilter].filter(f => f !== 'All');
  const filterLabel = activeFilters.length ? activeFilters.join(' · ') : null;

  document.getElementById('statCount').textContent = visible.length;
  document.getElementById('statCountSub').textContent = visible.length === 1
    ? (filterLabel ? `1 thing in ${filterLabel}` : '1 thing to plan for')
    : (visible.length
        ? (filterLabel ? `in ${filterLabel}` : `across ${new Set(visible.map(i=>catKey(i.category))).size} categories`)
        : 'nothing yet');

  const totalForecasted = visible.reduce((sum,i)=> sum + (Number(i.cost) || 0), 0);
  document.getElementById('statNeeded').innerHTML = moneyHtml(Math.round(totalForecasted));
  document.getElementById('statNeededSub').textContent = filterLabel ? `for ${filterLabel}` : 'across all future items';

  renderActivity();
}

function renderActivity(){
  const actList = document.getElementById('activityList');
  actList.innerHTML = '';
  const countEl = document.getElementById('activityCount');
  countEl.textContent = activity.length;
  countEl.title = activity.length === 1 ? '1 update' : `${activity.length} updates`;
  if(activity.length === 0){
    actList.innerHTML = '<div class="empty">No activity yet.</div>';
  } else {
    activity.forEach(a => {
      const row = document.createElement('div');
      row.className = 'activity-row';
      row.innerHTML = `<span>${escapeHtml(a.text)}</span><span class="activity-time">${timeAgo(a.time)}</span>`;
      actList.appendChild(row);
    });
  }
}
