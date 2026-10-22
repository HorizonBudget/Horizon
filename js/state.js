let household = { code: '', name: '' };   // code = shared key, name = the signed-in person
let householdName = '';                    // display name for the household, shared and just for show
let items = [];
// Removed items stay in `items` with a deletedAt (epoch ms) for 30 days. They live in the same
// array so the synced fields don't change. Everything that lists, counts or totals items must
// go through liveItems() so they never show up as real items.
const TRASH_DAYS = 30, DAY_MS = 86400000;
// To-dos (the To-do side) live in the same `items` array with kind:'todo', again so the synced fields
// never change. liveItems()/findLiveItem() are the BUDGET items only; to-dos go through liveTodos()/findLiveTodo().
function isDeleted(it){ return !!it && Number(it.deletedAt) > 0; }
function isTodo(it){ return !!it && it.kind === 'todo'; }
function liveItems(){ return items.filter(i => !isDeleted(i) && !isTodo(i)); }
function findLiveItem(id){ return items.find(i => i.id === id && !isDeleted(i) && !isTodo(i)); }
function liveTodos(){ return items.filter(i => isTodo(i) && !isDeleted(i)); }
function findLiveTodo(id){ return items.find(i => i.id === id && isTodo(i) && !isDeleted(i)); }
function deletedItems(){ return items.filter(isDeleted).sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt)); }
// Erases items deleted more than 30 days ago. Returns how many were erased.
function purgeTrash(now){
  now = now == null ? Date.now() : now;
  const before = items.length;
  items = items.filter(i => !(isDeleted(i) && now - Number(i.deletedAt) > TRASH_DAYS * DAY_MS));
  return before - items.length;
}
let activity = [];
let editingId = null;
let activeTab = 'active';
let sortMode = 'month';
function onSortModeChange(){
  sortMode = document.getElementById('sortModeSelect').value;
  render();
}
let activeCategoryFilter = 'All';
let people = [];
let activityOpen = false;
let filtersOpen = false;   // collapsed on every page load; remembered only while the page is open

function setActivityOpen(open){
  activityOpen = !!open;
  document.getElementById('activityPanel').classList.toggle('open', activityOpen);
  const btn = document.getElementById('activityToggle');
  btn.classList.toggle('open', activityOpen);
  btn.setAttribute('aria-expanded', activityOpen ? 'true' : 'false');
}
function toggleActivity(){ setActivityOpen(!activityOpen); }
document.addEventListener('click', e => {
  if(!activityOpen) return;
  const wrap = document.getElementById('activityWrap');
  if(wrap && !wrap.contains(e.target)) setActivityOpen(false);
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && activityOpen){ setActivityOpen(false); const b = document.getElementById('activityToggle'); if(b) b.focus(); }
});

function toggleFilters(){
  filtersOpen = !filtersOpen;
  applyFiltersOpen();
}
function applyFiltersOpen(){
  document.getElementById('filterPanel').classList.toggle('open', filtersOpen && activeTab === 'active');
  const btn = document.getElementById('filtersBtn');
  btn.classList.toggle('open', filtersOpen);
  btn.setAttribute('aria-expanded', filtersOpen ? 'true' : 'false');
}
function clearFilters(){
  activeCategoryFilter = 'All';
  sortMode = 'month';
  render();
}

let CATEGORIES = ['Clothing','Education','Electronics','Health','Holidays & Gifts','Home','Kids','Pets','Subscriptions','Travel','Vehicle'];
// 'Other' is a fixed sentinel, always shown last, used to trigger adding a brand-new category.

function sortedCategoryList(){
  return [...CATEGORIES].sort((a,b) => a.localeCompare(b)).concat(['Other']);
}

function populateCategorySelect(selected){
  const sel = document.getElementById('f_category');
  const list = sortedCategoryList();
  sel.innerHTML = list.map(c => `<option ${c===selected?'selected':''}>${escapeHtml(c)}</option>`).join('');
  document.getElementById('newCatRow').classList.remove('show');
  document.getElementById('f_newCategory').value = '';
}

function onCategoryChange(){
  categoryManuallyPicked = true;
  const val = document.getElementById('f_category').value;
  const row = document.getElementById('newCatRow');
  if(val === 'Other'){
    row.classList.add('show');
    document.getElementById('f_newCategory').focus();
  } else {
    row.classList.remove('show');
  }
  // subcategories are scoped to a category, so switching category resets that field
  populateSubcategoryField(val === 'Other' ? null : val, '');
}

// category name -> array of subcategory names that have been used under it
let SUBCATEGORIES = {};

function toggleSubcategoryField(show){
  const wrap = document.getElementById('subcategoryFieldWrap');
  const btn = document.getElementById('subcatToggleBtn');
  const shouldShow = show !== undefined ? show : wrap.style.display === 'none';
  wrap.style.display = shouldShow ? '' : 'none';
  btn.style.display = shouldShow ? 'none' : '';
  if(shouldShow){
    const textField = document.getElementById('f_subcategoryText');
    if(textField.style.display !== 'none') textField.focus();
  }
}

function populateSubcategoryField(category, selectedValue){
  const textField = document.getElementById('f_subcategoryText');
  const selectField = document.getElementById('f_subcategorySelect');
  const newRow = document.getElementById('newSubcatRow');
  const existing = (category && SUBCATEGORIES[category]) ? SUBCATEGORIES[category] : [];

  newRow.classList.remove('show');
  document.getElementById('f_newSubcategory').value = '';
  // only auto-expand the field when there's already a value to show (e.g. editing an item)
  toggleSubcategoryField(!!selectedValue);

  if(existing.length === 0){
    // nothing created yet for this category — plain type-in field
    textField.style.display = '';
    selectField.style.display = 'none';
    textField.value = selectedValue || '';
    return;
  }

  // subcategories already exist for this category — switch to a dropdown
  textField.style.display = 'none';
  selectField.style.display = '';
  const sorted = [...existing].sort((a,b) => a.localeCompare(b));
  const options = ['', ...sorted, 'Other'];
  const valueInList = selectedValue && sorted.includes(selectedValue);
  selectField.innerHTML = options.map(o => {
    const label = o === '' ? 'None' : o;
    const isSelected = valueInList ? (o === selectedValue) : (o === '' && !selectedValue);
    return `<option value="${escapeHtml(o)}" ${isSelected?'selected':''}>${escapeHtml(label)}</option>`;
  }).join('');

  if(selectedValue && !valueInList){
    // the item's saved subcategory isn't in this category's list yet (e.g. category just changed) — offer it via Other
    selectField.value = 'Other';
    newRow.classList.add('show');
    document.getElementById('f_newSubcategory').value = selectedValue;
  }
}

function onSubcategorySelectChange(){
  const val = document.getElementById('f_subcategorySelect').value;
  const row = document.getElementById('newSubcatRow');
  if(val === 'Other'){
    row.classList.add('show');
    document.getElementById('f_newSubcategory').focus();
  } else {
    row.classList.remove('show');
  }
}

// Months are stored as text like "Oct 2026". These helpers read and write that one format, so
// the month picker, the sort order and repeating items all agree (and work past the picker's 24 months).
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseMonth(str){
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(String(str || '').trim());
  if(!m) return null;
  const idx = MONTH_ABBR.findIndex(a => a.toLowerCase() === m[1].toLowerCase());
  return idx < 0 ? null : { y: Number(m[2]), m: idx };
}
function formatMonth(y, m){
  const total = y * 12 + m;
  return MONTH_ABBR[((total % 12) + 12) % 12] + ' ' + Math.floor(total / 12);
}
function addMonthsToMonth(str, n){
  const p = parseMonth(str);
  return p ? formatMonth(p.y, p.m + n) : 'No date yet';
}
function buildMonthOptions(){
  const months = [];
  const now = new Date();
  for(let i=0;i<24;i++) months.push(formatMonth(now.getFullYear(), now.getMonth() + i));   // current month, never past
  return months;
}
// FUTURE_MONTHS excludes 'No date yet' and never includes months that have already passed.
const FUTURE_MONTHS = buildMonthOptions();
const MONTH_OPTIONS = ['No date yet', ...FUTURE_MONTHS];
const MONTHS_COLLAPSED_COUNT = 5;
let monthListExpanded = false;

// The list is built when the page loads; if the app stays open into a new month, rebuild it so the picker
// starts at the current month again (a past month an item already has stays selectable, see below).
function refreshMonthOptions(){
  const fresh = buildMonthOptions();
  if(fresh[0] === FUTURE_MONTHS[0]) return false;
  FUTURE_MONTHS.splice(0, FUTURE_MONTHS.length, ...fresh);
  MONTH_OPTIONS.splice(0, MONTH_OPTIONS.length, 'No date yet', ...fresh);
  return true;
}

function populateMonthSelect(selected){
  refreshMonthOptions();
  const sel = document.getElementById('f_month');
  // If the currently selected month isn't in the collapsed view, auto-expand so it stays visible.
  const selectedIsBeyondCollapsed = selected && selected !== 'No date yet'
    && FUTURE_MONTHS.indexOf(selected) >= MONTHS_COLLAPSED_COUNT;
  if(selectedIsBeyondCollapsed) monthListExpanded = true;

  const visibleMonths = monthListExpanded ? FUTURE_MONTHS : FUTURE_MONTHS.slice(0, MONTHS_COLLAPSED_COUNT);
  const options = ['No date yet', ...visibleMonths];
  // a month outside the picker's range (a past month, or a repeat that landed far ahead) must stay selectable
  if(selected && selected !== 'No date yet' && parseMonth(selected) && !options.includes(selected)){
    options.push(selected);
    options.sort((a, b) => (a === 'No date yet' ? -Infinity : monthSortKey(a)) - (b === 'No date yet' ? -Infinity : monthSortKey(b)) || 0);
  }
  sel.innerHTML = options.map(m => `<option ${m===selected?'selected':''}>${escapeHtml(m)}</option>`).join('');

  const btn = document.getElementById('monthShowMoreBtn');
  if(btn){
    btn.style.display = monthListExpanded ? 'none' : (FUTURE_MONTHS.length > MONTHS_COLLAPSED_COUNT ? 'inline-block' : 'none');
  }
}

function showMoreMonths(){
  monthListExpanded = true;
  const current = document.getElementById('f_month').value;
  populateMonthSelect(current);
}

function populateOwnerSelect(selected){
  const sel = document.getElementById('f_owner');
  let opts = '<option value="">No one yet</option>';
  opts += people.map(p => `<option ${p.name===selected?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  // someone taken off the household list still owns their items as plain text; keep that name selectable
  if(selected && !people.some(p => p.name === selected)) opts += `<option selected>${escapeHtml(selected)}</option>`;
  sel.innerHTML = opts;
}
