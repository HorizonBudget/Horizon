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
  startToastTimer();
}
function hideToast(){
  clearTimeout(toastTimer); toastTimer = null; toastUndoFn = null;
  const region = document.getElementById('toastRegion');
  if(region) region.textContent = '';
}
function runToastUndo(){
  const fn = toastUndoFn;
  hideToast();
  if(fn) fn();
}
