// No scrolling the board behind an open dialog (js/scroll-lock.js): the pure decisions, the lock class, the touch / wheel
// guard and the position pin. The real-browser side (wheel and finger over the backdrop, short and long dialogs, every
// dialog) is in sticky-audit.py.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { buildApp, ROOT } = require('./lib/build-app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, pass = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fails++; };
const dom = new JSDOM(buildApp(), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window, d = w.document, root = d.documentElement, $ = id => d.getElementById(id);
(async () => {
  await sleep(60);
  // ---------- 1. the pure decisions ----------
  const can = (top, sh, ch, dir) => w.scrollerCanScroll({ scrollTop: top, scrollHeight: sh, clientHeight: ch }, dir);
  ok(can(0, 1000, 500, 1) && !can(0, 1000, 500, -1), 'at the top: can scroll down, cannot scroll up');
  ok(can(250, 1000, 500, 1) && can(250, 1000, 500, -1), 'in the middle: can scroll either way');
  ok(!can(500, 1000, 500, 1) && can(500, 1000, 500, -1), 'at the end: cannot scroll down, can scroll up');
  ok(!can(0, 500, 500, 1) && !can(0, 500, 500, -1), 'a dialog that fits cannot scroll at all');
  ok(!can(0, 501, 500, 1) && !can(0, 501, 500, -1), 'a 1px overflow (rounding) counts as not scrollable');
  ok(can(499.2, 1000, 500, 1) === false && can(497, 1000, 500, 1) === true, 'the end is detected within 1px (fractional scroll positions on high-density screens)');
  ok(w.scrollDirFromTouch(-20) === 1 && w.scrollDirFromTouch(20) === -1 && w.scrollDirFromTouch(0) === 0, 'finger up = scroll further down; finger down = scroll back up');
  ok(w.scrollDirFromWheel(100) === 1 && w.scrollDirFromWheel(-100) === -1 && w.scrollDirFromWheel(0) === 0, 'wheel down = scroll further down');
  ok(w.overlayIsOpen({ style: { display: 'flex' } }) && !w.overlayIsOpen({ style: { display: 'none' } }) && !w.overlayIsOpen({ style: { display: '' } }) && !w.overlayIsOpen(null), 'an overlay is open when it has a display other than none');

  // ---------- 2. wiring ----------
  const ids = [...d.querySelectorAll('.overlay')].map(o => o.id);
  ok(ids.length === 9, 'the page has 9 dialogs: ' + ids.join(', '));
  ok(w.dialogScrollLock && typeof w.dialogScrollLock.isLocked === 'function', 'initScrollLock ran at start-up and published window.dialogScrollLock');
  ok(!root.classList.contains('dialog-open') && !w.dialogScrollLock.isLocked(), 'nothing open: not locked');
  let all = true;
  for (const id of ids) {
    $(id).style.display = 'flex'; await sleep(5);
    const on = root.classList.contains('dialog-open') && w.dialogScrollLock.isLocked();
    $(id).style.display = 'none'; await sleep(5);
    if (!on || root.classList.contains('dialog-open')) { all = false; console.log('  ' + id + ' on=' + on); }
  }
  ok(all, 'every one of the 9 dialogs locks the page while open and unlocks it when closed');
  $('settingsOverlay').style.display = 'flex'; $('trashOverlay').style.display = 'flex'; await sleep(5);
  $('trashOverlay').style.display = 'none'; await sleep(5);
  ok(root.classList.contains('dialog-open'), 'two dialogs open (Settings, then Deleted items): closing the top one keeps the lock (Settings is still open)');
  $('settingsOverlay').style.display = 'none'; await sleep(5);
  ok(!root.classList.contains('dialog-open'), '... and closing the last one releases it');
  w.openSettingsModal(); await sleep(5); ok(root.classList.contains('dialog-open'), 'the real openSettingsModal() locks');
  w.closeSettingsModal(); await sleep(5); ok(!root.classList.contains('dialog-open'), 'the real closeSettingsModal() unlocks');
  w.openTrashModal(); await sleep(5); w.closeTrashModal(); await sleep(5);
  ok(root.classList.contains('dialog-open'), 'closing Deleted items goes back to Settings, which keeps the lock');
  w.closeSettingsModal(); await sleep(5);
  ok(!root.classList.contains('dialog-open'), 'closing Settings releases it');

  // ---------- 3. the touch / wheel guard ----------
  const ev = (type, target, props) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, props || {}); target.dispatchEvent(e); return e; };
  const touch = (type, target, x, y) => ev(type, target, { touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  const drag = (target, dyList, dx) => { let y = 300; touch('touchstart', target, 100, y); const out = []; for (const dy of dyList) { y += dy; out.push(touch('touchmove', target, 100 + (dx || 0), y).defaultPrevented); } touch('touchend', target, 0, 0); return out; };
  const stub = (el, top, sh, ch) => { Object.defineProperty(el, 'scrollTop', { get: () => top.v, set: v => { top.v = v; }, configurable: true }); Object.defineProperty(el, 'scrollHeight', { get: () => sh, configurable: true }); Object.defineProperty(el, 'clientHeight', { get: () => ch, configurable: true }); };
  const settings = $('settingsOverlay'), modal = settings.querySelector('.modal'), top = { v: 0 };
  // closed: the guard is not even attached
  ok(drag(modal, [-10])[0] === false && ev('wheel', modal, { deltaY: 100, deltaX: 0 }).defaultPrevented === false, 'no dialog open: touch and wheel are left alone (guard not attached)');
  w.openSettingsModal(); await sleep(5);
  const csOverflow = w.getComputedStyle(modal).overflowY;
  ok(csOverflow === 'auto', 'the dialog is a vertical scroller (overflow-y: ' + csOverflow + ')');
  stub(modal, top, 500, 500);   // fits: nothing to scroll
  ok(drag(modal, [-10, -10])[1] === true && drag(modal, [10, 10])[1] === true, 'a dialog that fits: finger up and finger down are both cancelled (nothing behind may move)');
  ok(drag(settings, [-12])[0] === true && drag(settings, [12])[0] === true, 'on the dark backdrop: cancelled both ways');
  ok(drag(d.body, [-12])[0] === true, 'anywhere outside a dialog: cancelled');
  stub(modal, top, 2000, 500); top.v = 0;
  ok(drag(modal, [12])[0] === true, 'long dialog at its top: dragging down (scrolling up) is cancelled, it would chain to the page');
  ok(drag(modal, [-12])[0] === false, 'long dialog at its top: dragging up (scrolling down) is left to the dialog');
  top.v = 700;
  ok(drag(modal, [-12])[0] === false && drag(modal, [12])[0] === false, 'long dialog in the middle: both ways left alone');
  top.v = 1500;
  ok(drag(modal, [-12])[0] === true && drag(modal, [12])[0] === false, 'long dialog at its end: dragging up is cancelled (no chaining to the page), dragging down still scrolls back');
  // reversing direction mid-gesture is judged move by move
  top.v = 1500; ok(JSON.stringify(drag(modal, [-10, -10, 10, 10, -10])) === '[true,true,false,false,true]', 'a gesture that reverses at the end of the dialog is judged move by move: [' + JSON.stringify(drag(modal, [-10, -10, 10, 10, -10])) + ']');
  // an inner scroller (a list inside the dialog)
  const inner = d.createElement('div'); inner.style.overflowY = 'auto'; modal.appendChild(inner); const itop = { v: 0 }; stub(inner, itop, 900, 200);
  top.v = 1500;
  ok(drag(inner, [-12])[0] === false, 'an inner list that can scroll down keeps working even when the dialog itself is at its end');
  itop.v = 700; ok(drag(inner, [-12])[0] === true && drag(inner, [12])[0] === false, 'inner list at its end and dialog at its end: cancelled; back up works');
  inner.remove();
  // sideways, pinch, sliders
  top.v = 0; stub(modal, top, 500, 500);
  ok(drag(modal, [-3, -3], 12)[0] === false, 'a mostly sideways drag is left alone (nothing scrolls sideways; sliders keep working)');
  { touch('touchstart', modal, 10, 10); const e = ev('touchmove', modal, { touches: [{ clientX: 10, clientY: 40 }, { clientX: 80, clientY: 40 }] }); ok(!e.defaultPrevented, 'two fingers (pinch) are left alone'); }
  { const r = d.createElement('input'); r.type = 'range'; modal.appendChild(r); ok(drag(r, [-12, -12])[1] === false, 'a range slider (the photo zoom) is never interfered with'); r.remove(); }
  { const e = ev('touchmove', modal, { touches: [{ clientX: 100, clientY: 300 }] }); }
  // wheel
  top.v = 0; stub(modal, top, 2000, 500);
  const wheel = (t, dy, extra) => ev('wheel', t, Object.assign({ deltaY: dy, deltaX: 0 }, extra || {})).defaultPrevented;
  ok(wheel(settings, 120) === true && wheel(settings, -120) === true, 'wheel over the backdrop: cancelled');
  ok(wheel(modal, 120) === false && wheel(modal, -120) === true, 'wheel over a long dialog at its top: down scrolls it, up (would chain) is cancelled');
  top.v = 700; ok(wheel(modal, 120) === false && wheel(modal, -120) === false, 'wheel in the middle of a long dialog: left alone');
  top.v = 1500; ok(wheel(modal, 120) === true && wheel(modal, -120) === false, 'wheel at the end of a long dialog: cancelled (no chaining), up still works');
  ok(wheel(settings, 120, { ctrlKey: true }) === false, 'ctrl + wheel (pinch zoom on a trackpad) is left alone');
  ok(wheel(settings, 0, { deltaX: 80 }) === false, 'a purely sideways wheel is left alone');
  // not cancelable events (a scroll already under way) must not throw
  { let threw = false; try { const e = new w.Event('touchmove', { bubbles: true, cancelable: false }); e.touches = [{ clientX: 1, clientY: 1 }]; settings.dispatchEvent(e); } catch (x) { threw = true; } ok(!threw, 'an already-started (non-cancelable) touch scroll does not throw'); }

  // ---------- 4. the position pin ----------
  let py = 1200; const calls = [];
  Object.defineProperty(w, 'pageYOffset', { get: () => py, configurable: true });
  w.scrollTo = (x, y) => { calls.push(y); py = y; };
  w.closeSettingsModal(); await sleep(5); calls.length = 0;
  py = 1200; w.openSettingsModal(); await sleep(5);
  ok(root.classList.contains('dialog-open') && calls.length === 0, 'locking does not scroll the page at all (position kept at 1200)');
  py = 0; w.dispatchEvent(new w.Event('scroll'));
  ok(py === 1200 && calls[calls.length - 1] === 1200, 'if the browser moves the page anyway (iOS), it is put straight back before the header looks');
  py = 1201; w.dispatchEvent(new w.Event('scroll')); ok(py === 1201, 'a 1px wobble (rounding) is left alone');
  py = 1200;
  w.closeSettingsModal(); await sleep(5); calls.length = 0;
  ok(!root.classList.contains('dialog-open') && py === 1200 && calls.length === 0, 'unlocking leaves the position exactly where it was (no scroll call)');
  py = 40; w.dispatchEvent(new w.Event('scroll')); ok(py === 40 && calls.length === 0, 'after closing, scrolling is free again (the pin is detached)');
  w.openSettingsModal(); await sleep(5); py = 900; w.closeSettingsModal(); await sleep(5);
  ok(py === 40 || calls[calls.length - 1] === 40, 'if the browser lost the position during the dialog, closing restores it');

  // ---------- 5. the files ----------
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const sec = css.slice(css.indexOf('SECTION: sticky-scroll'), css.indexOf('SECTION: version-history')).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/html\.dialog-open\s*\{[^}]*overflow:\s*hidden/.test(sec), 'CSS: html.dialog-open { overflow:hidden } sits in the sticky-scroll section');
  ok(/html\.dialog-open\.had-scrollbar\s*\{[^}]*scrollbar-gutter:\s*stable/.test(sec), 'CSS: a page that had a scrollbar keeps its gutter (nothing jumps sideways)');
  ok(/\.overlay\s*\{[^}]*overscroll-behavior:\s*contain/.test(sec) && /\.modal\s*\{[^}]*overscroll-behavior:\s*contain/.test(sec), 'CSS: .overlay and .modal contain their overscroll');
  ok(!/body[^{}]*\{[^}]*overflow\s*:\s*hidden/.test(sec) && !/position:\s*fixed/.test(sec), 'CSS: no overflow:hidden on body and no position:fixed body (either would break the sticky headers / lose the scroll position)');
  ok(/<script src="js\/scroll-lock\.js\?v=[^"]+"><\/script>\s*<script src="js\/main\.js/.test(idx), 'index.html loads scroll-lock.js immediately before main.js');
  ok(/initScrollLock\(\);/.test(main) && main.indexOf('initScrollLock') < main.indexOf('resumeSession'), 'main.js calls initScrollLock() before the session resumes');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); ok(sw.includes("'js/scroll-lock.js'"), 'sw.js caches scroll-lock.js for offline use');
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
