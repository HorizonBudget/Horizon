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
// fillCards(body, items): optional, puts the cards in an open month (default: all of them right away)
function buildMonthGroup(g, index, fillCards){
  const total = g.items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);
  const n = g.items.length;
  return buildGroupSection({
    data: { month: g.month }, bodyId: 'monthGroupBody' + index, collapsed: collapsedMonths.has(g.month),
    dot: monthColor(g.month).solid, name: g.month, count: `${n} item${n === 1 ? '' : 's'}`,
    extraHtml: `<span class="mg-total mono" title="Total forecast for ${escAttr(g.month)}">${moneyHtml(total)}</span>`,
    onToggle: () => toggleMonthGroup(g.month),
    fill: body => fillCards ? fillCards(body, g.items) : g.items.forEach(item => body.appendChild(buildItemCard(item, { completedView: false })))
  });
}

// ---- The first draw of a big board: the top cards right away, the rest a moment later ----
// Opening the app with hundreds of cards in open months took most of a second before anything showed. The first time
// the board draws its cards (page still at the top) it builds about two screens' worth, lets the browser show them,
// then adds the rest in small batches, in order, to the same months. Any later draw (a change, a sync, a month opened,
// a side switch) cancels the batches still waiting and builds everything at once, so nothing else changes.
const FIRST_DRAW_CARDS = 40, LATER_CARDS_BATCH = 40;
let boardCardsDrawn = false;
let laterCards = { gen: 0, jobs: [] };
function cancelLaterCards(){ laterCards = { gen: laterCards.gen + 1, jobs: [] }; }
// ---- Back to the same spot after a reload or Back ----
// The browser's own scroll restoring only worked when the board happened to be drawn before the page finished
// loading (it often landed at the top). So the page remembers (this tab only) where it was when it was left, and
// after a reload or Back the first full draw scrolls there itself. That draw builds every card (no later batches),
// so the spot is right. A tap, scroll or key press before then, or a few seconds passing, cancels it.
const LEFT_AT_KEY = 'horizonLeftAtY', RESTORE_WINDOW_MS = 5000;
window.addEventListener('pagehide', () => {
  try { sessionStorage.setItem(LEFT_AT_KEY, String(Math.round(window.pageYOffset || 0))); } catch(e) {}
});
function leftAtToRestore(){
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const type = nav ? nav.type : (performance.navigation && performance.navigation.type === 1 ? 'reload' : performance.navigation && performance.navigation.type === 2 ? 'back_forward' : 'navigate');
    if(type !== 'reload' && type !== 'back_forward') return 0;
    const y = Number(sessionStorage.getItem(LEFT_AT_KEY));
    return isFinite(y) && y > 0 ? y : 0;
  } catch(e) { return 0; }
}
let restoreLeftAtY = leftAtToRestore();
if(restoreLeftAtY){
  try { history.scrollRestoration = 'manual'; } catch(e) {}   // no half-way jump by the browser first
  const stop = () => { restoreLeftAtY = 0; };
  ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach(t => window.addEventListener(t, stop, { once: true, passive: true, capture: true }));
  setTimeout(stop, RESTORE_WINDOW_MS);
}
function browserMayRestoreScroll(){ return restoreLeftAtY > 0; }
// called at the end of each draw: scrolls back once the board is showing and tall enough
function restoreLeftAt(){
  if(!restoreLeftAtY) return;
  const app = document.getElementById('app');
  if(!app || app.style.display !== 'block') return;
  if(document.documentElement.classList.contains('dialog-open')){ restoreLeftAtY = 0; return; }
  const max = document.documentElement.scrollHeight - (window.innerHeight || 0);
  if(max < restoreLeftAtY) return;   // not all there yet (e.g. still waiting for the data)
  const y = restoreLeftAtY;
  restoreLeftAtY = 0;
  try { window.scrollTo(0, y); } catch(e) {}
}
// the card filler for this draw: everything now, or (first draw, at the top) FIRST_DRAW_CARDS now and the rest queued
function boardCardFiller(totalOpenCards){
  cancelLaterCards();
  const defer = !boardCardsDrawn && totalOpenCards > FIRST_DRAW_CARDS && (window.pageYOffset || 0) === 0 && !browserMayRestoreScroll();
  if(totalOpenCards > 0) boardCardsDrawn = true;
  if(!defer) return null;
  let room = FIRST_DRAW_CARDS;
  const jobs = laterCards.jobs;
  return (body, list) => {
    const now = list.slice(0, Math.max(0, room)), rest = list.slice(now.length);
    room -= now.length;
    now.forEach(item => body.appendChild(buildItemCard(item, { completedView: false })));
    for(let i = 0; i < rest.length; i += LATER_CARDS_BATCH){
      const part = rest.slice(i, i + LATER_CARDS_BATCH);
      jobs.push(() => {
        const frag = document.createDocumentFragment();
        part.forEach(item => frag.appendChild(buildItemCard(item, { completedView: false })));
        body.appendChild(frag);
      });
    }
  };
}
// starts the queued batches after the browser has shown the first cards (one batch per task, so taps stay quick)
function runLaterCards(){
  const mine = laterCards;
  if(!mine.jobs.length) return;
  const next = () => {
    if(laterCards !== mine || !mine.jobs.length) return;
    mine.jobs.shift()();
    if(mine.jobs.length) setTimeout(next, 0);
    else if(!window.ResizeObserver && window.refreshPageBar) window.refreshPageBar();
  };
  const raf = window.requestAnimationFrame ? f => window.requestAnimationFrame(f) : f => setTimeout(f, 16);
  raf(() => setTimeout(next, 0));
}
// builds whatever is still queued right now (e.g. before looking for a card)
function finishLaterCards(){
  const mine = laterCards;
  while(laterCards === mine && mine.jobs.length) mine.jobs.shift()();
}
