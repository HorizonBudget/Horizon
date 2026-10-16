// ---- Sticky headers that collapse while you scroll (2.11.0, calmer since) -------------------
// One small pure function decides when a header should be compact. It is given the previous state, the
// current scroll position and the time, and returns the new state, so the rules can be tested without a browser.
//   state = { collapsed, ref, at }   ref = the scroll position the next movement is measured from
//                                    at  = when the state last changed (ms), for the cooldown
// Rules: close to the top it is always expanded (immediately, whatever the cooldown). Scrolling DOWN by `down` px
// past the lowest point reached since it was last expanded collapses it (only below `minY`). Once collapsed,
// scrolling back UP by `up` px from the lowest point reached expands it again. Anything smaller (finger jitter,
// tiny reversals) changes nothing. After every change the header holds still for `cooldown` ms, so its own
// slide animation (and the little scroll wobble that can come with it) can never trigger the next change.
// A change that is held back is reported as `wait` (ms left); the caller looks again when it is over, so a
// stale state is never left behind. `max` is how far the area can scroll; both the position and the reference
// point are clamped to 0..max so iOS rubber-banding past either end, or the iPhone URL bar sliding away at the
// bottom of the page (which shortens the scroll range and makes the browser nudge the position up), is never
// mistaken for the person scrolling up. `now` omitted = no cooldown (used by the pure tests).
const BAR_RULES = { top: 4, minY: 64, down: 36, up: 20, cooldown: 300 };
const PAGE_BAR_RULES = { top: 4, minY: 96, down: 36, up: 20, cooldown: 300 };
function scrollBarStep(state, y, max, rules, now){
  const r = Object.assign({}, BAR_RULES, rules || {});
  y = Number(y) || 0;
  if(max != null && isFinite(max)){ max = Math.max(0, max); y = Math.min(y, max); } else max = null;
  y = Math.max(0, y);
  const s = state || { collapsed: false, ref: 0 };
  const t = (typeof now === 'number' && isFinite(now)) ? now : null;
  const at = (typeof s.at === 'number' && isFinite(s.at)) ? s.at : null;
  if(y <= r.top) return { collapsed: false, ref: y, at: (s.collapsed && t != null) ? t : at };
  // an area that can barely scroll (the page just got short) never keeps a compact header: there is nothing to make room for
  if(max != null && max <= r.minY) return { collapsed: false, ref: y, at: (s.collapsed && t != null) ? t : at };
  let ref = isFinite(s.ref) ? s.ref : y;
  if(max != null) ref = Math.min(ref, max);
  let want = !!s.collapsed;
  if(!s.collapsed){
    ref = Math.min(ref, y);
    if(y > r.minY && y - ref >= r.down) want = true;
  } else {
    ref = Math.max(ref, y);
    if(ref - y >= r.up) want = false;
  }
  if(want === !!s.collapsed) return { collapsed: want, ref, at };
  if(t != null && at != null && r.cooldown > 0){
    const since = t - at;
    if(since >= 0 && since < r.cooldown) return { collapsed: !!s.collapsed, ref, at, wait: Math.ceil(r.cooldown - since) };
  }
  return { collapsed: want, ref: y, at: t != null ? t : at };
}

// Listens to scrolling on `target` (a scrolling element or the window), at most once per animation frame.
// apply(collapsed) runs only when the state really changes. When a change is held back by the cooldown, a
// timer looks again once it is over (the scroll may well have stopped by then). Returns { reset, state }.
function bindScrollBar(opts){
  let st = { collapsed: false, ref: 0, at: null }, queued = false, timer = null;
  const raf = window.requestAnimationFrame ? f => window.requestAnimationFrame(f) : f => setTimeout(f, 16);
  const clock = opts.now || (() => (window.performance && performance.now) ? performance.now() : Date.now());
  const read = () => {
    queued = false;
    if(timer){ clearTimeout(timer); timer = null; }
    const y = opts.getY();
    const next = scrollBarStep(st, y, opts.getMax(), opts.rules, clock());
    const changed = next.collapsed !== st.collapsed;
    st = next;
    if(opts.onScroll) opts.onScroll(y);
    if(changed) opts.apply(next.collapsed);
    if(next.wait > 0) timer = setTimeout(read, next.wait + 20);
  };
  opts.target.addEventListener('scroll', () => { if(!queued){ queued = true; raf(read); } }, { passive: true });
  return {
    state: () => st,
    // The content changed size under the person's finger (a tab switch, a search, folding months): the browser may nudge
    // the scroll position to keep things in place. That is not a scroll, so measure from where things ended up.
    rebase: () => { if(!timer) st = Object.assign({}, st, { ref: Math.max(0, Number(opts.getY()) || 0) }); },
    reset: () => {
      if(timer){ clearTimeout(timer); timer = null; }
      st = { collapsed: false, ref: 0, at: null };
      if(opts.onScroll) opts.onScroll(0);
      opts.apply(false);
    }
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
  const ctl = bindScrollBar({
    target: window,
    getY: () => window.pageYOffset || root.scrollTop || 0,
    getMax: () => root.scrollHeight - window.innerHeight,
    rules: PAGE_BAR_RULES,
    onScroll: y => root.classList.toggle('is-scrolled', y > 4),
    apply: c => { collapsed = c; root.classList.toggle('page-collapsed', c); setBarVar(); }
  });
  setBarVar();
  const main = document.querySelector('#app main'), stuck = document.getElementById('boardSticky');
  if(main && window.ResizeObserver) new ResizeObserver(() => ctl.rebase()).observe(main);
  if(main) keepFocusClear(main, el => (stuck && stuck.contains(el)) ? null : header.offsetHeight + (stuck ? stuck.offsetHeight : 0) + 8, gap => window.scrollBy(0, gap));
  window.addEventListener('resize', setBarVar);
  window.addEventListener('orientationchange', setBarVar);
  if(window.ResizeObserver){ const ro = new ResizeObserver(setBarVar); ro.observe(header); ro.observe(compact); }
  window.refreshPageBar = setBarVar;   // used when a ResizeObserver isn't there
}
