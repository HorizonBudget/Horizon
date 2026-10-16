// ---- Sticky headers that collapse while you scroll (2.11.0) --------------------------------
// One small pure function decides when a header should be compact. It is given the previous state and
// the current scroll position and returns the new state, so the rules can be tested without a browser.
//   state = { collapsed, ref }   ref = the scroll position the next movement is measured from
// Rules: close to the top it is always expanded. Scrolling DOWN by `down` px past the lowest point
// reached since it was last expanded collapses it (only below `minY`). Once collapsed, scrolling back UP
// by `up` px from the lowest point reached expands it again. Anything smaller (finger jitter, tiny
// reversals) changes nothing. `max` is how far the area can scroll; the position is clamped to
// 0..max so iOS rubber-banding past either end is never mistaken for a scroll up.
const BAR_RULES = { top: 4, minY: 48, down: 24, up: 14 };
const PAGE_BAR_RULES = { top: 4, minY: 72, down: 24, up: 14 };
function scrollBarStep(state, y, max, rules){
  const r = Object.assign({}, BAR_RULES, rules || {});
  y = Number(y) || 0;
  if(max != null && isFinite(max)) y = Math.min(y, Math.max(0, max));
  y = Math.max(0, y);
  const s = state || { collapsed: false, ref: 0 };
  if(y <= r.top) return { collapsed: false, ref: y };
  if(!s.collapsed){
    const ref = Math.min(s.ref, y);
    if(y > r.minY && y - ref >= r.down) return { collapsed: true, ref: y };
    return { collapsed: false, ref };
  }
  const ref = Math.max(s.ref, y);
  if(ref - y >= r.up) return { collapsed: false, ref: y };
  return { collapsed: true, ref };
}

// Listens to scrolling on `target` (a scrolling element or the window), at most once per animation frame.
// apply(collapsed) runs only when the state really changes. Returns { reset, state }.
function bindScrollBar(opts){
  let st = { collapsed: false, ref: 0 }, queued = false;
  const raf = window.requestAnimationFrame ? f => window.requestAnimationFrame(f) : f => setTimeout(f, 16);
  const read = () => {
    queued = false;
    const y = opts.getY();
    const next = scrollBarStep(st, y, opts.getMax(), opts.rules);
    const changed = next.collapsed !== st.collapsed;
    st = next;
    if(opts.onScroll) opts.onScroll(y);
    if(changed) opts.apply(next.collapsed);
  };
  opts.target.addEventListener('scroll', () => { if(!queued){ queued = true; raf(read); } }, { passive: true });
  return {
    state: () => st,
    reset: () => { st = { collapsed: false, ref: 0 }; if(opts.onScroll) opts.onScroll(0); opts.apply(false); }
  };
}

// Browsers only scroll a newly focused element into view when it is off screen, so a field that is
// partly hidden under a sticky bar stays hidden. This nudges the scroll so it ends up clear of the bar.
// below(el) = the screen y the element must be under (null = leave this element alone); scrollBy(gap) scrolls up by -gap.
function keepFocusClear(scroller, below, scrollBy){
  scroller.addEventListener('focusin', e => {
    const el = e.target;
    if(!el || !el.getBoundingClientRect) return;
    setTimeout(() => {
      if(document.activeElement !== el) return;
      const limit = below(el);
      if(limit == null) return;
      const gap = el.getBoundingClientRect().top - limit;
      if(gap < 0) scrollBy(gap);
    }, 0);
  });
}

// The shared dialog header. Each dialog is a .modal whose first child is its <h3> title; anything
// marked data-bar-extra (a description, the Settings tabs) goes under the title row and tucks away
// while scrolling. `closers` says what each dialog's Close button does (none: title only).
const MODAL_BARS = {
  itemOverlay:     () => closeItemModal(),
  settingsOverlay: () => closeSettingsModal(),
  guideOverlay:    () => closeStyleGuide(),
  trashOverlay:    () => closeTrashModal(),
  cropOverlay:     () => closeCropEditor(true),
  confirmOverlay:  null,
  profileOverlay:  () => closeProfileModal(),
  peopleOverlay:   () => closeAdminModal(),
  chooseOverlay:   () => chooseDone(null)
};
function buildModalBar(modal, onClose){
  const kids = Array.from(modal.children);
  const title = kids.find(k => k.tagName === 'H3');
  if(!title || modal.querySelector('.modal-bar')) return null;
  const extras = kids.filter(k => k.hasAttribute('data-bar-extra'));
  const bar = document.createElement('div');
  bar.className = 'modal-bar' + (extras.length ? ' has-extra' : '');
  const row = document.createElement('div');
  row.className = 'modal-bar-row';
  if(onClose){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost modal-close'; b.textContent = '← Close';
    b.setAttribute('aria-label', 'Close');
    b.addEventListener('click', () => onClose());
    row.appendChild(b);
  }
  row.appendChild(title);
  bar.appendChild(row);
  if(extras.length){
    const ex = document.createElement('div');
    ex.className = 'modal-bar-extra';
    extras.forEach(e => ex.appendChild(e));
    bar.appendChild(ex);
  }
  modal.insertBefore(bar, modal.firstChild);
  modal.classList.add('has-bar');
  return bar;
}
function initModalBars(){
  Object.keys(MODAL_BARS).forEach(id => {
    const overlay = document.getElementById(id);
    const modal = overlay && overlay.querySelector('.modal');
    if(!modal) return;
    const bar = buildModalBar(modal, MODAL_BARS[id]);
    if(!bar) return;
    const ctl = bindScrollBar({
      target: modal,
      getY: () => modal.scrollTop,
      getMax: () => modal.scrollHeight - modal.clientHeight,
      apply: c => bar.classList.toggle('is-collapsed', c)
    });
    // every time a dialog opens it starts at the top with the full header
    let wasOpen = false;
    const onStyle = () => {
      const open = overlay.style.display === 'flex';
      // (a dialog closed and opened again in the same moment is caught by the second condition)
      if(open && (!wasOpen || (ctl.state().collapsed && modal.scrollTop <= BAR_RULES.top))){
        modal.scrollTop = 0;
        ctl.reset();
      }
      wasOpen = open;
    };
    if(window.MutationObserver) new MutationObserver(onStyle).observe(overlay, { attributes: true, attributeFilter: ['style'] });
    // tabbing to a field that is sitting under the bar scrolls it clear (the browser doesn't, because the field is "visible")
    keepFocusClear(modal, el => bar.contains(el) ? null : modal.getBoundingClientRect().top + bar.offsetHeight + 8, gap => { modal.scrollTop += gap; });
  });
}

// The board header: the full header is sticky and slides away on scroll down, the compact bar slides in.
// --page-bar-h is how much of the top is covered right now; the Active/Completed row sticks just below it.
function initPageHeader(){
  const root = document.documentElement;
  const header = document.getElementById('appHeader'), compact = document.getElementById('topCompact');
  if(!header || !compact) return;
  let collapsed = false;
  const setBarVar = () => root.style.setProperty('--page-bar-h', (collapsed ? compact.offsetHeight : header.offsetHeight) + 'px');
  bindScrollBar({
    target: window,
    getY: () => window.pageYOffset || root.scrollTop || 0,
    getMax: () => root.scrollHeight - window.innerHeight,
    rules: PAGE_BAR_RULES,
    onScroll: y => root.classList.toggle('is-scrolled', y > 4),
    apply: c => { collapsed = c; root.classList.toggle('page-collapsed', c); setBarVar(); }
  });
  setBarVar();
  const main = document.querySelector('#app main'), stuck = document.getElementById('boardSticky');
  if(main) keepFocusClear(main, el => (stuck && stuck.contains(el)) ? null : header.offsetHeight + (stuck ? stuck.offsetHeight : 0) + 8, gap => window.scrollBy(0, gap));
  window.addEventListener('resize', setBarVar);
  window.addEventListener('orientationchange', setBarVar);
  if(window.ResizeObserver) new ResizeObserver(setBarVar).observe(header);
  window.refreshPageBar = setBarVar;   // used when a ResizeObserver isn't there
}
