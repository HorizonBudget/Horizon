// every data change ends in render(); that's the single place we notice "something changed, sync it"
function render(){
  renderCore();
  cloudSchedulePush();
}

function renderCore(){
  updateIdentityUi();
  applySide();
  renderBoard();
  renderTodos();
  refreshTrashUi();
  if(!window.ResizeObserver && window.refreshPageBar) window.refreshPageBar();
}

function renderBoard(){
  document.getElementById('tabActiveBtn').classList.toggle('active', activeTab === 'active');
  document.getElementById('tabCompletedBtn').classList.toggle('active', activeTab === 'completed');
  const q = searchTerm();
  const allCompleted = liveItems().filter(i => i.completed);
  const completedItems = allCompleted.filter(i => itemMatchesSearch(i, q));
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
    if(completedItems.length === 0 && q){
      list.innerHTML = `<div class="empty">No items match “${escapeHtml(searchQuery.trim())}”</div>`;
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
  if(activeCategoryFilter !== 'All') visible = visible.filter(i => i.category === activeCategoryFilter);
  if(q) visible = visible.filter(i => itemMatchesSearch(i, q));

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
  if(visible.length === 0 && q){
    list.innerHTML = `<div class="empty">No items match “${escapeHtml(searchQuery.trim())}”</div>`;
  } else if(activeItems.length === 0){
    list.innerHTML = '<div class="empty">Nothing on the board yet. Tap “+ Add future item” to add the first thing you’ll need to buy.</div>';
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
    if(groups.length >= 2){
      const allCollapsed = groups.every(g => collapsedMonths.has(g.month));
      // lives in the heading row beside Filters (not in the list), so it takes no row of its own
      const tools = document.getElementById('monthToolsSlot');
      tools.innerHTML = `<button type="button" class="link-btn" id="collapseAllBtn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>`;
      tools.firstChild.addEventListener('click', () => setAllMonthsCollapsed(!allCollapsed));
    }
    groups.forEach((g, i) => list.appendChild(buildMonthGroup(g, i)));
  }

  // stats — reflect the category filter (and the search) when they are on
  const activeFilters = [activeCategoryFilter].filter(f => f !== 'All');
  if(q) activeFilters.push('“' + searchQuery.trim() + '”');
  const filterLabel = activeFilters.length ? activeFilters.join(' · ') : null;

  document.getElementById('statCount').textContent = visible.length;
  document.getElementById('statCountSub').textContent = visible.length === 1
    ? (filterLabel ? `1 thing in ${filterLabel}` : '1 thing to plan for')
    : (visible.length
        ? (filterLabel ? `in ${filterLabel}` : `across ${new Set(visible.map(i=>i.category)).size} categories`)
        : 'nothing yet');

  const totalForecasted = visible.reduce((sum,i)=> sum + (i.cost || 0), 0);
  document.getElementById('statNeeded').textContent = '$' + Math.round(totalForecasted).toLocaleString();
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
