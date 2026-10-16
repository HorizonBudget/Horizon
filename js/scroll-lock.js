// ---- No scrolling the board behind an open dialog -------------------------------------------------
// While any dialog (an element with class "overlay") is open, the page behind it must stay put: not from the
// mouse wheel, not from a finger dragging on the dark backdrop or on a dialog that is too short to scroll,
// and not by "scroll chaining" when you reach the end of a long dialog.
//
// Three layers, because no single one works in every browser (iPhone Safari is the picky one):
//  1. CSS: html.dialog-open { overflow:hidden } stops the page scrolling (styles.css, "sticky-scroll" section),
//     and .overlay / .modal use overscroll-behavior:contain so a dialog's scroll never chains out of it.
//     Deliberately NOT position:fixed on the body (it would throw the scroll position away) and NOT overflow on
//     the body (that would make the body a scroll container and un-stick the sticky headers).
//  2. A touchmove / wheel guard, only attached while a dialog is open: a drag or wheel turn is cancelled unless
//     something inside the dialog can actually scroll in that direction. Dialogs keep scrolling normally.
//  3. A pin: if the browser moves the page anyway while a dialog is open, it is put straight back, before the
//     sticky header ever looks at the position, so the header state cannot flicker. The scroll position is
//     never changed by opening or closing a dialog.
// The pure decision helpers come first so they can be tested without a browser.

const SCROLL_LOCK_CLASS = 'dialog-open';

// Can a scroller with these measurements move in direction `dir` (+1 = further down, -1 = back up)?
function scrollerCanScroll(m, dir){
  const room = (m.scrollHeight || 0) - (m.clientHeight || 0);
  if(room <= 1) return false;
  const top = m.scrollTop || 0;
  return dir > 0 ? top < room - 1 : top > 1;
}

// Which way does a finger move scroll? Finger up (y getting smaller) scrolls further down; returns 0 for "no vertical move".
function scrollDirFromTouch(dy){ return dy < 0 ? 1 : dy > 0 ? -1 : 0; }
// A wheel turned down (positive deltaY) scrolls further down.
function scrollDirFromWheel(dy){ return dy > 0 ? 1 : dy < 0 ? -1 : 0; }

// An overlay is open when it has been given a display other than none (that is how every dialog opens and closes).
function overlayIsOpen(o){ return !!o && !!o.style && o.style.display !== '' && o.style.display !== 'none'; }

// Starting at `target`, is there a vertically scrolling element inside the open dialog that can move in `dir`?
// (The walk stops at the overlay; the page itself never counts.)
function dialogCanScroll(target, dir){
  let el = target && target.nodeType === 3 ? target.parentNode : target;
  while(el && el.nodeType === 1){
    if(el.classList && el.classList.contains('overlay')) return false;
    const cs = window.getComputedStyle(el), oy = cs.overflowY;
    if((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scrollerCanScroll(el, dir)) return true;
    el = el.parentNode;
  }
  return false;
}

// Things that handle their own dragging and must never be interfered with: sliders, and surfaces that opt out
// of browser panning (the photo crop stage). Cancelling touchmove there would break them.
function ownsItsTouches(target){
  let el = target && target.nodeType === 3 ? target.parentNode : target;
  if(!el || el.nodeType !== 1) return false;
  if(el.tagName === 'INPUT' && (el.type === 'range')) return true;
  const ta = window.getComputedStyle(el).touchAction;
  return ta === 'none';
}

// Should this scroll attempt be cancelled? True unless the dialog under the finger / pointer can scroll that way.
function shouldBlockPageScroll(target, dir){
  if(!dir) return false;
  if(ownsItsTouches(target)) return false;
  return !dialogCanScroll(target, dir);
}

function initScrollLock(){
  const root = document.documentElement;
  const overlays = Array.from(document.querySelectorAll('.overlay'));
  if(!overlays.length) return null;
  let locked = false, savedY = 0, lastX = 0, lastY = 0;
  const pageY = () => window.pageYOffset || root.scrollTop || 0;

  const onTouchStart = e => {
    if(!e.touches || e.touches.length !== 1) return;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
  };
  const onTouchMove = e => {
    if(!e.touches || e.touches.length !== 1) return;     // pinch: not a scroll
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    const dx = x - lastX, dy = y - lastY;
    lastX = x; lastY = y;
    if(Math.abs(dy) < Math.abs(dx)) return;              // sideways: nothing scrolls sideways here, leave sliders etc. alone
    if(shouldBlockPageScroll(e.target, scrollDirFromTouch(dy)) && e.cancelable) e.preventDefault();
  };
  const onWheel = e => {
    if(e.ctrlKey) return;                                // pinch-zoom on a trackpad
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if(shouldBlockPageScroll(e.target, scrollDirFromWheel(e.deltaY)) && e.cancelable) e.preventDefault();
  };
  const onScroll = () => {
    const y = pageY();
    if(Math.abs(y - savedY) <= 1) return;
    window.scrollTo(0, savedY);
    const now = pageY();
    if(Math.abs(now - savedY) > 1) savedY = now;         // the page really did get shorter: accept where it ended up
  };

  function lock(){
    if(locked) return;
    locked = true;
    savedY = pageY();
    // a desktop page with a visible scrollbar keeps its gutter, so nothing shifts sideways when the bar disappears
    if(window.innerWidth - root.clientWidth > 0) root.classList.add('had-scrollbar');
    root.classList.add(SCROLL_LOCK_CLASS);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function unlock(){
    if(!locked) return;
    locked = false;
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    document.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('scroll', onScroll);
    root.classList.remove(SCROLL_LOCK_CLASS, 'had-scrollbar');
    if(Math.abs(pageY() - savedY) > 1) window.scrollTo(0, savedY);
  }
  const sync = () => { overlays.some(overlayIsOpen) ? lock() : unlock(); };
  if(window.MutationObserver){
    const mo = new MutationObserver(sync);
    overlays.forEach(o => mo.observe(o, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
  }
  sync();
  const api = { sync, isLocked: () => locked };
  window.dialogScrollLock = api;
  return api;
}
