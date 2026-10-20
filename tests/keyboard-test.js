// The on-screen keyboard over an open dialog (js/scroll-lock.js, initKeyboardFit). iPhone Safari slides its keyboard over
// the page and only window.visualViewport gets shorter; a dialog sitting at the bottom of the screen ended up under it.
// Here a fake visualViewport fires resize events like the iPhone does; the real-browser look is checked by hand / Playwright.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { buildApp, ROOT } = require('./lib/build-app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, pass = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fails++; };

const SCREEN_H = 844;   // an iPhone 14-ish screen
let vv = null;
const dom = new JSDOM(buildApp(), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(win) {
    Object.defineProperty(win, 'innerHeight', { get: () => SCREEN_H, configurable: true });
    vv = new win.EventTarget();
    Object.assign(vv, { height: SCREEN_H, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(win, 'visualViewport', { value: vv, configurable: true });
  }
});
const w = dom.window, d = w.document, root = d.documentElement, $ = id => d.getElementById(id);
const keyboard = (h, top) => { vv.height = h; vv.offsetTop = top || 0; vv.dispatchEvent(new w.Event('resize')); };
const rect = (el, r) => { el.getBoundingClientRect = () => Object.assign({ left: 0, right: 390, width: 390, height: r.bottom - r.top }, r); };

(async () => {
  await sleep(60);
  // ---------- 1. the pure decisions ----------
  const kv = w.keyboardViewport;
  ok(kv({ height: 844, offsetTop: 0, scale: 1 }, 844) === null, 'no keyboard: full height, nothing to do');
  ok(kv({ height: 790, offsetTop: 0, scale: 1 }, 844) === null, 'a toolbar sliding (54px) is not a keyboard');
  const k = kv({ height: 500.4, offsetTop: 120.2, scale: 1 }, 844);
  ok(k && k.height === 500 && k.top === 120, 'keyboard up: the visible part is reported in whole px (' + JSON.stringify(k) + ')');
  ok(kv({ height: 400, offsetTop: 0, scale: 2 }, 844) === null, 'pinch-zoomed in: not a keyboard');
  ok(kv(null, 844) === null && kv({ height: 400 }, 0) === null, 'no visualViewport (or no height to compare with): nothing');
  const fd = w.fieldScrollDelta;
  ok(fd({ top: 200, bottom: 250 }, 100, 500) === 0, 'a field already well inside the visible part: no scroll');
  ok(fd({ top: 600, bottom: 680 }, 100, 500) === 340, 'a field under the keyboard: scrolled to the middle (+340)');
  ok(fd({ top: 40, bottom: 80 }, 100, 500) === -240, 'a field hidden under the dialog header: scrolled back down into the middle (-240)');
  ok(fd({ top: 600, bottom: 1100 }, 100, 500) === 488, 'a field taller than the visible part: its top lines up with the top (+488)');
  ok(fd({ top: 600, bottom: 650 }, 100, 110) === 0, 'no room left at all: leave it');
  ok(w.isKeyboardField(d.createElement('textarea')) && w.isKeyboardField(d.createElement('select')), 'textareas and selects bring up a keyboard / picker');
  const inp = t => { const i = d.createElement('input'); i.type = t; return i; };
  ok(w.isKeyboardField(inp('text')) && w.isKeyboardField(inp('number')) && w.isKeyboardField(inp('date')) && w.isKeyboardField(inp('email')), 'text, number, date and email inputs do too');
  ok(!w.isKeyboardField(inp('checkbox')) && !w.isKeyboardField(inp('range')) && !w.isKeyboardField(inp('file')) && !w.isKeyboardField(d.createElement('button')), 'checkboxes, sliders, file pickers and buttons do not');

  // ---------- 2. wiring ----------
  ok(w.dialogScrollLock && w.dialogScrollLock.keyboard && typeof w.dialogScrollLock.keyboard.update === 'function', 'initScrollLock also set up the keyboard fit (visualViewport is there)');
  keyboard(500, 0);
  ok(!root.classList.contains('kb-open') && !root.style.getPropertyValue('--vv-h'), 'no dialog open (header search, to-do quick-add): the keyboard changes nothing');
  keyboard(SCREEN_H);

  w.openTodoModal(); await sleep(5);
  const ov = $('todoOverlay'), modal = ov.querySelector('.modal'), notes = $('t_notes'), bar = modal.querySelector('.modal-bar');
  ok(root.classList.contains('dialog-open') && !root.classList.contains('kb-open'), 'to-do dialog open, keyboard down: locked, not fitted');
  // the phone layout before the keyboard: modal at the bottom of the screen, Notes near its bottom
  let st = 0;
  Object.defineProperty(modal, 'scrollTop', { get: () => st, set: v => { st = Math.max(0, v); }, configurable: true });
  rect(modal, { top: 200, bottom: 832 });
  rect(bar, { top: 200, bottom: 260 });
  rect(notes, { top: 640 - 0, bottom: 720 });
  notes.getBoundingClientRect = () => ({ top: 640 - st, bottom: 720 - st, left: 0, right: 390, width: 390, height: 80 });
  notes.focus();
  ok(d.activeElement === notes, 'Notes has the focus');
  // the keyboard slides up: the visible part is now 844 - 336 = 508px
  keyboard(508, 0);
  ok(root.classList.contains('kb-open'), 'keyboard up while a dialog is open: html gets kb-open');
  ok(root.style.getPropertyValue('--vv-h') === '508px' && root.style.getPropertyValue('--vv-top') === '0px', 'the visible part is published as --vv-h / --vv-top (' + root.style.getPropertyValue('--vv-h') + ', ' + root.style.getPropertyValue('--vv-top') + ')');
  // (the real dialog would now be squeezed into those 508px; here the fake layout stays, so check the scroll it chose:
  //  visible band = below the bar (260) to the top of the keyboard (508); Notes 640..720 -> middle 680, band middle 384)
  ok(st === 296, 'Notes was under the keyboard: the dialog scrolled itself so Notes is in the middle of what is left (scrollTop ' + st + ')');
  // Safari slides the visible part down a little (vv scroll): the position follows, nothing else changes
  vv.offsetTop = 40; vv.dispatchEvent(new w.Event('scroll'));
  ok(root.style.getPropertyValue('--vv-top') === '40px' && st === 296, 'Safari moving the visible part: --vv-top follows (40px), no extra scrolling');
  vv.offsetTop = 0; vv.dispatchEvent(new w.Event('scroll'));
  // moving to another field keeps the keyboard up (no resize): the 300ms timer brings it into view
  const name = $('t_name');
  name.getBoundingClientRect = () => ({ top: 300 - st, bottom: 340 - st, left: 0, right: 390, width: 390, height: 40 });
  name.focus(); await sleep(350);
  ok(st === 0, 'tabbing back up to the name field (hidden above, under the header): scrolled back up into view after the keyboard settles (scrollTop ' + st + ')');
  // keyboard goes away: everything restored
  keyboard(SCREEN_H);
  ok(!root.classList.contains('kb-open') && !root.style.getPropertyValue('--vv-h') && !root.style.getPropertyValue('--vv-top'), 'keyboard down: kb-open and the variables are gone');
  const before = st; keyboard(SCREEN_H); name.focus(); await sleep(350);
  ok(st === before, 'with no keyboard up (desktop), focusing a field never scrolls the dialog on its own');
  // closing the dialog while the keyboard is still up clears it too
  notes.focus(); keyboard(508);
  ok(root.classList.contains('kb-open'), 'keyboard up again');
  w.closeTodoModal(); await sleep(5);
  ok(!root.classList.contains('dialog-open') && !root.classList.contains('kb-open') && !root.style.getPropertyValue('--vv-h'), 'closing the dialog with the keyboard still up: unlocked and unfitted');
  keyboard(SCREEN_H);

  // the budget item dialog's Note works the same way
  w.openItemModal(); await sleep(5);
  const imodal = $('itemOverlay').querySelector('.modal'), note = $('f_note');
  let ist = 0; Object.defineProperty(imodal, 'scrollTop', { get: () => ist, set: v => { ist = v; }, configurable: true });
  rect(imodal, { top: 100, bottom: 832 });
  const ibar = imodal.querySelector('.modal-bar'); if (ibar) rect(ibar, { top: 100, bottom: 160 });
  note.getBoundingClientRect = () => ({ top: 700 - ist, bottom: 780 - ist, left: 0, right: 390, width: 390, height: 80 });
  note.focus(); keyboard(508);
  ok(root.classList.contains('kb-open') && ist > 0 && 780 - ist <= 508 - 12, 'budget item Note: scrolled above the keyboard (bottom now at ' + (780 - ist) + 'px, keyboard starts at 508px)');
  w.closeItemModal(); await sleep(5); keyboard(SCREEN_H);
  ok(!root.classList.contains('kb-open'), 'closed: back to normal');

  // ---------- 3. the CSS ----------
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const sec = css.slice(css.indexOf('SECTION: sticky-scroll'), css.indexOf('SECTION: version-history')).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/html\.dialog-open\.kb-open \.overlay\s*\{[^}]*top:\s*var\(--vv-top[^}]*height:\s*var\(--vv-h[^}]*bottom:\s*auto/.test(sec), 'CSS: with the keyboard up the dialog layer is sized to the visible part (sticky-scroll section)');
  ok(/html\.dialog-open\.kb-open \.modal\s*\{[^}]*max-height:\s*calc\(var\(--vv-h/.test(sec), 'CSS: ... and the dialog itself is never taller than that, so it scrolls inside');
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
