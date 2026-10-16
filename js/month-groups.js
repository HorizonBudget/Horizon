// ---- Month groups on the Active tab (collapsed state is remembered on this device) ----
const COLLAPSE_KEY = 'horizonCollapsedMonths';
let collapsedMonths = new Set();
let shownGroupMonths = [];
function loadCollapsedMonths(){
  try {
    const a = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
    if(Array.isArray(a)) collapsedMonths = new Set(a.filter(x => typeof x === 'string'));
  } catch(e) { /* storage unavailable: everything stays expanded */ }
}
function saveCollapsedMonths(){
  const known = new Set(liveItems().map(i => i.month || 'No date yet'));
  collapsedMonths = new Set([...collapsedMonths].filter(m => known.has(m) || shownGroupMonths.includes(m)));
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedMonths])); } catch(e) {}
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
function buildMonthGroup(g, index){
  const collapsed = collapsedMonths.has(g.month);
  const total = g.items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);
  const mc = monthColor(g.month);
  const n = g.items.length;
  const sec = document.createElement('section');
  sec.className = 'month-group' + (collapsed ? ' collapsed' : '');
  sec.setAttribute('data-month', g.month);
  const bodyId = 'monthGroupBody' + index;
  const h = document.createElement('h3');
  h.className = 'month-group-head';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'month-group-btn';
  btn.dataset.month = g.month;
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-controls', bodyId);
  btn.innerHTML = `<span class="mg-chev" aria-hidden="true">▾</span>`
    + `<span class="mg-dot" style="background:${mc.solid}" aria-hidden="true"></span>`
    + `<span class="mg-name">${escapeHtml(g.month)}</span>`
    + `<span class="mg-count">${n} item${n === 1 ? '' : 's'}</span>`
    + `<span class="mg-total mono" title="Total forecast for ${escAttr(g.month)}">${fmtMoney(total)}</span>`;
  btn.addEventListener('click', () => toggleMonthGroup(g.month));
  h.appendChild(btn);
  const body = document.createElement('div');
  body.className = 'month-group-body';
  body.id = bodyId;
  if(collapsed) body.hidden = true;
  else g.items.forEach(item => body.appendChild(buildItemCard(item, { completedView: false })));
  sec.appendChild(h); sec.appendChild(body);
  return sec;
}

// ---- Backup reminder (per device) ----
