// ---- Month groups on the Active tab (collapsed state is remembered on this device) ----
// The boxed, collapsible group (▾ arrow, colored dot, name, count) and the "Collapse all" link are shared with the
// To-do side's due-date groups (js/todo.js): buildGroupSection(), renderCollapseAllLink(), readCollapsedSet().
const COLLAPSE_KEY = 'horizonCollapsedMonths';
let collapsedMonths = new Set();
let shownGroupMonths = [];
// a remembered set of collapsed group names (per device, never synced); empty when storage is unavailable
function readCollapsedSet(key){
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    if(Array.isArray(a)) return new Set(a.filter(x => typeof x === 'string'));
  } catch(e) { /* storage unavailable: everything stays expanded */ }
  return new Set();
}
function writeCollapsedSet(key, set){
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch(e) {}
}
function loadCollapsedMonths(){ collapsedMonths = readCollapsedSet(COLLAPSE_KEY); }
function saveCollapsedMonths(){
  const known = new Set(liveItems().map(i => i.month || 'No date yet'));
  collapsedMonths = new Set([...collapsedMonths].filter(m => known.has(m) || shownGroupMonths.includes(m)));
  writeCollapsedSet(COLLAPSE_KEY, collapsedMonths);
}
function focusGroupButton(month){
  const b = [...document.querySelectorAll('#itemsList .month-group-btn')].find(x => x.dataset.month === month);
  if(b) try { b.focus({ preventScroll:true }); } catch(e) {}
}
function toggleMonthGroup(month){
  if(collapsedMonths.has(month)) collapsedMonths.delete(month); else collapsedMonths.add(month);
  saveCollapsedMonths();
  renderCore();
  focusGroupButton(month);
}
function setAllMonthsCollapsed(collapse){
  shownGroupMonths.forEach(m => { if(collapse) collapsedMonths.add(m); else collapsedMonths.delete(m); });
  saveCollapsedMonths();
  renderCore();
  const b = document.getElementById('collapseAllBtn');
  if(b) try { b.focus({ preventScroll:true }); } catch(e) {}
}
// "Collapse all" / "Expand all" in a heading row. slot = the .month-tools span; nothing shows for fewer than 2 groups.
function renderCollapseAllLink(slot, id, count, allCollapsed, onClick){
  if(!slot) return;
  slot.innerHTML = '';
  if(count < 2) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'link-btn'; b.id = id;
  b.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
  b.addEventListener('click', onClick);
  slot.appendChild(b);
}
// One collapsible group. o: { data:{name:value} (set on the section and its button), bodyId, collapsed, dot (css color),
// name, count (text), extraHtml (e.g. a money total), className, title, onToggle, fill(body) }
function buildGroupSection(o){
  const sec = document.createElement('section');
  sec.className = 'month-group' + (o.collapsed ? ' collapsed' : '') + (o.className ? ' ' + o.className : '');
  const h = document.createElement('h3');
  h.className = 'month-group-head';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'month-group-btn';
  Object.keys(o.data || {}).forEach(k => { sec.dataset[k] = o.data[k]; btn.dataset[k] = o.data[k]; });
  btn.setAttribute('aria-expanded', o.collapsed ? 'false' : 'true');
  btn.setAttribute('aria-controls', o.bodyId);
  btn.innerHTML = `<span class="mg-chev" aria-hidden="true">▾</span>`
    + `<span class="mg-dot" style="background:${o.dot}" aria-hidden="true"></span>`
    + `<span class="mg-name">${escapeHtml(o.name)}</span>`
    + `<span class="mg-count">${escapeHtml(o.count)}</span>`
    + (o.extraHtml || '');
  btn.addEventListener('click', o.onToggle);
  h.appendChild(btn);
  const body = document.createElement('div');
  body.className = 'month-group-body';
  body.id = o.bodyId;
  if(o.collapsed) body.hidden = true;
  else o.fill(body);
  sec.appendChild(h); sec.appendChild(body);
  return sec;
}
function buildMonthGroup(g, index){
  const total = g.items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);
  const n = g.items.length;
  return buildGroupSection({
    data: { month: g.month }, bodyId: 'monthGroupBody' + index, collapsed: collapsedMonths.has(g.month),
    dot: monthColor(g.month).solid, name: g.month, count: `${n} item${n === 1 ? '' : 's'}`,
    extraHtml: `<span class="mg-total mono" title="Total forecast for ${escAttr(g.month)}">${fmtMoney(total)}</span>`,
    onToggle: () => toggleMonthGroup(g.month),
    fill: body => g.items.forEach(item => body.appendChild(buildItemCard(item, { completedView: false })))
  });
}
