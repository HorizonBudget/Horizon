// ---- Undo toast: one at a time, ~6 seconds, announced to screen readers ----
const TOAST_MS = 6000;
let toastTimer = null, toastUndoFn = null;
function startToastTimer(ms){
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || TOAST_MS);
}
function showToast(message, undoFn){
  const region = document.getElementById('toastRegion');
  if(!region) return;
  clearTimeout(toastTimer);
  toastUndoFn = typeof undoFn === 'function' ? undoFn : null;
  region.textContent = '';
  const t = document.createElement('div');
  t.className = 'toast';
  t.id = 'toast';
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  t.appendChild(msg);
  if(toastUndoFn){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-undo'; b.id = 'toastUndo'; b.textContent = 'Undo';
    b.addEventListener('click', runToastUndo);
    t.appendChild(b);
  }
  // hovering or focusing the toast keeps it up; leaving gives a fresh moment to reach Undo
  t.addEventListener('mouseenter', () => clearTimeout(toastTimer));
  t.addEventListener('mouseleave', () => startToastTimer());
  t.addEventListener('focusin', () => clearTimeout(toastTimer));
  t.addEventListener('focusout', () => startToastTimer());
  t.addEventListener('keydown', e => { if(e.key === 'Escape'){ e.stopPropagation(); hideToast(); } });
  region.appendChild(t);
  markToastRoom(t);
  startToastTimer();
}
// A toast also shows in front of an open dialog (David, 3.5.x: Undo after removing a person in People must be
// tappable). html.toast-shown + --toast-room let the dialog scroll its last buttons clear of it ("dialogs" CSS section).
function markToastRoom(t){
  const root = document.documentElement;
  if(!t){ root.classList.remove('toast-shown'); root.style.removeProperty('--toast-room'); return; }
  // measured from the bottom of what is visible (above the iPhone keyboard when it is up)
  const vv = window.visualViewport, top = t.getBoundingClientRect().top;
  const h = vv && vv.height > 0 ? (Number(vv.offsetTop) || 0) + vv.height : (window.innerHeight || 0);
  if(top > 0 && h > top) root.style.setProperty('--toast-room', Math.ceil(h - top + 8) + 'px');
  else root.style.removeProperty('--toast-room');
  root.classList.add('toast-shown');
}
function hideToast(){
  clearTimeout(toastTimer); toastTimer = null; toastUndoFn = null;
  const region = document.getElementById('toastRegion');
  if(region) region.textContent = '';
  markToastRoom(null);
}
function runToastUndo(){
  const fn = toastUndoFn;
  hideToast();
  if(fn) fn();
}
