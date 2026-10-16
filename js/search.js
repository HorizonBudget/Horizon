// ---- Search (tab row) ----
let searchQuery = '', searchOpen = false;
function searchTerm(){ return searchQuery.trim().toLowerCase(); }
function itemMatchesSearch(it, q){
  if(!q) return true;
  return [it.name, it.category, it.subcategory, it.owner, itemNote(it), itemLink(it), typeof it.link === 'string' ? it.link : '']
    .some(v => String(v || '').toLowerCase().includes(q));
}
function updateSearchUi(){
  document.getElementById('searchRow').hidden = !searchOpen;
  const btn = document.getElementById('searchBtn');
  btn.setAttribute('aria-expanded', searchOpen ? 'true' : 'false');
  btn.classList.toggle('open', searchOpen);
  btn.classList.toggle('active', !!searchTerm());
  document.getElementById('searchClear').hidden = !searchQuery;
}
function openSearch(){
  searchOpen = true;
  updateSearchUi();
  const inp = document.getElementById('searchInput');
  try { inp.focus({ preventScroll:true }); } catch(e) {}
}
function closeSearch(){
  const had = !!searchQuery;
  searchOpen = false; searchQuery = '';
  document.getElementById('searchInput').value = '';
  updateSearchUi();
  if(had) renderCore();
  try { document.getElementById('searchBtn').focus({ preventScroll:true }); } catch(e) {}
}
function toggleSearch(){ searchOpen ? closeSearch() : openSearch(); }
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
