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
  const kb = initKeyboardFit(() => locked);
  const sync = () => { overlays.some(overlayIsOpen) ? lock() : unlock(); if(kb) kb.update(); };
  if(window.MutationObserver){
    const mo = new MutationObserver(sync);
    overlays.forEach(o => mo.observe(o, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
  }
  sync();
  const api = { sync, isLocked: () => locked, keyboard: kb };
  window.dialogScrollLock = api;
  return api;
}

// ---- Keep the field you are typing in above the on-screen keyboard ---------------------------------------------
// iPhone Safari does not make the page shorter when the keyboard comes up: the keyboard slides over the bottom of
// the screen and only the "visual viewport" (window.visualViewport) gets shorter. A dialog covers the whole screen
// and, on a phone, sits at the bottom of it, so its lower fields (Notes) ended up under the keyboard; and because
// the page is locked while a dialog is open, Safari could not scroll them into sight either.
// So while a dialog is open and the keyboard is up, the dialogs are fitted into the part of the screen that is still
// visible (--vv-top / --vv-h on <html> plus the class kb-open; CSS in the "sticky-scroll" section) and scroll inside
// themselves, and the focused field is scrolled to the middle of what is left. Android Chrome already shrinks the page
// for its keyboard, so there the difference is about 0 and nothing changes; desktops never get here at all.
const KEYBOARD_MIN_PX = 100;   // a smaller difference is a toolbar sliding away, not a keyboard

// The visible part of the screen when a keyboard covers the rest ({ top, height } in px), or null for "no keyboard".
// layoutH = the full screen height the page is laid out for (it does not change when the iPhone keyboard opens).
function keyboardViewport(vv, layoutH){
  if(!vv || !(layoutH > 0)) return null;
  if(vv.scale && vv.scale > 1.05) return null;         // pinch-zoomed in: that shrinks the visible part too, but it is not a keyboard
  const h = Number(vv.height) || 0;
  if(h <= 0 || layoutH - h < KEYBOARD_MIN_PX) return null;
  return { top: Math.max(0, Math.round(Number(vv.offsetTop) || 0)), height: Math.round(h) };
}

// How far should a scroller move (positive = further down) so field `r` ({top, bottom}, screen px) sits in the middle
// of the visible band top..bottom? 0 when it is already comfortably inside. A field taller than the band (a big
// Notes box) lines its top up with the band instead, so the start of what you are typing shows.
function fieldScrollDelta(r, top, bottom, margin){
  margin = margin == null ? 12 : margin;
  if(!r || bottom - top <= 2 * margin) return 0;
  if(r.top >= top + margin && r.bottom <= bottom - margin) return 0;
  if(r.bottom - r.top > bottom - top - 2 * margin) return Math.round(r.top - (top + margin));
  return Math.round((r.top + r.bottom) / 2 - (top + bottom) / 2);
}

// Fields that bring up a keyboard (or the iPhone picker wheel, which covers the screen the same way).
function isKeyboardField(el){
  if(!el || el.nodeType !== 1) return false;
  if(el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if(el.tagName !== 'INPUT') return false;
  return !/^(checkbox|radio|range|button|submit|reset|file|color|image|hidden)$/i.test(el.type || 'text');
}

function initKeyboardFit(isLocked){
  const vv = window.visualViewport, root = document.documentElement;
  if(!vv || !vv.addEventListener) return null;
  let fitted = false, timer = null;
  const layoutH = () => Math.max(window.innerHeight || 0, root.clientHeight || 0);

  // scroll the focused field into the visible part of its dialog (only while the keyboard is up)
  function reveal(){
    const el = document.activeElement;
    if(!fitted || !isKeyboardField(el) || !el.closest) return;
    const modal = el.closest('.modal'), overlay = modal && modal.closest('.overlay');
    if(!modal || !overlayIsOpen(overlay)) return;
    const m = modal.getBoundingClientRect(), bar = modal.querySelector('.modal-bar');
    let top = m.top;
    if(bar && !bar.contains(el)) top = Math.max(top, bar.getBoundingClientRect().bottom);
    const bottom = Math.min(m.bottom, (Number(vv.offsetTop) || 0) + (Number(vv.height) || 0));
    const delta = fieldScrollDelta(el.getBoundingClientRect(), top, bottom);
    if(delta) modal.scrollTop += delta;
  }
  function update(){
    const kb = isLocked() ? keyboardViewport(vv, layoutH()) : null;
    if(kb){
      root.style.setProperty('--vv-top', kb.top + 'px');
      root.style.setProperty('--vv-h', kb.height + 'px');
      if(!fitted){ fitted = true; root.classList.add('kb-open'); }
    } else if(fitted){
      fitted = false;
      root.classList.remove('kb-open');
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
    }
  }
  // the keyboard opening, closing or changing height is a resize of the visual viewport; Safari sliding the
  // visible part around is a scroll of it (only the position needs updating then)
  vv.addEventListener('resize', () => { update(); reveal(); });
  vv.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  // tapping into a field: wait for the keyboard to finish sliding up (about 300ms), then make sure the field shows.
  // Moving from one field to the next keeps the keyboard up, so there is no resize then: this timer covers it.
  document.addEventListener('focusin', e => {
    if(!isKeyboardField(e.target) || !e.target.closest || !e.target.closest('.modal')) return;
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; update(); reveal(); }, 300);
  });
  return { update, reveal, isFitted: () => fitted };
}
