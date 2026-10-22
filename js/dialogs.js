// ---- In-app confirm dialog (used instead of window.confirm for removals) ----
let confirmResolve = null;
let confirmReturnFocus = null;
// opts: title, message, confirmLabel, danger (default true), info (OK-only notice, no Cancel),
// copyText (shows a selectable field with text to copy),
// amount ({label}: shows a dollar amount field; read it from confirmAmountValue after OK/Skip),
// skipLabel (adds a middle button that resolves 'skip').
// Resolves true on OK, 'skip' on the Skip button, false on Cancel/Escape/backdrop.
let confirmAmountValue = '';
function askConfirm(opts){
  opts = opts || {};
  if(confirmResolve){ const r = confirmResolve; confirmResolve = null; r(false); }
  else confirmReturnFocus = document.activeElement;
  document.getElementById('confirmTitle').textContent = opts.title || (opts.info ? 'Heads up' : 'Are you sure?');
  document.getElementById('confirmMsg').textContent = opts.message || '';
  const field = document.getElementById('confirmField');
  field.style.display = opts.copyText ? '' : 'none';
  field.value = opts.copyText || '';
  const amountWrap = document.getElementById('confirmAmountWrap');
  amountWrap.style.display = opts.amount ? '' : 'none';
  document.getElementById('confirmAmount').value = '';
  document.getElementById('confirmAmountError').textContent = '';
  if(opts.amount) document.getElementById('confirmAmountLabel').textContent = opts.amount.label || 'Amount';
  confirmAmountValue = '';
  const skip = document.getElementById('confirmSkip');
  skip.style.display = opts.skipLabel ? '' : 'none';
  skip.textContent = opts.skipLabel || 'Skip';
  const ok = document.getElementById('confirmOk');
  ok.textContent = opts.confirmLabel || 'OK';
  ok.className = 'btn ' + ((opts.info || opts.danger === false) ? 'btn-primary' : 'btn-danger-solid');
  const cancel = document.getElementById('confirmCancel');
  cancel.style.display = opts.info ? 'none' : '';
  document.getElementById('confirmOverlay').dataset.mode = opts.info ? 'info' : 'confirm';
  document.getElementById('confirmOverlay').style.display = 'flex';
  // focus the safe button: Cancel for questions, OK for notices
  try { (opts.info ? ok : opts.amount ? document.getElementById('confirmAmount') : cancel).focus({ preventScroll:true }); } catch(e) {}
  if(opts.copyText){ try { field.select(); } catch(e) {} }
  return new Promise(res => { confirmResolve = res; });
}
// Simple notice with a single OK button (replaces window.alert). Returns a promise that resolves when dismissed.
function askAlert(message, title){
  return askConfirm({ title: title || 'Heads up', message, confirmLabel: 'OK', info: true }).then(() => undefined);
}
function settleConfirm(v){
  document.getElementById('confirmOverlay').style.display = 'none';
  const r = confirmResolve; confirmResolve = null;
  const back = confirmReturnFocus; confirmReturnFocus = null;
  if(back && back.focus && document.contains(back)){ try { back.focus({ preventScroll:true }); } catch(e) {} }
  if(r) r(v);
  if(confirmWaiting.length) setTimeout(runConfirmWaiting, 0);
}
// Runs fn now, or once no question is open any more (askConfirm replaces an open question and answers it "no",
// so a notice that is not urgent waits its turn instead). Checked again after the answer's own follow-up has run.
let confirmWaiting = [];
function whenNoConfirm(fn){
  if(confirmResolve) confirmWaiting.push(fn); else fn();
}
function runConfirmWaiting(){
  const list = confirmWaiting; confirmWaiting = [];
  list.forEach(fn => whenNoConfirm(fn));
}
// Reads the amount field. Returns null for empty, a number (cents) for a valid entry, or NaN when it can't be used.
function readAmountField(inputEl){
  const raw = String(inputEl.value || '').trim();
  if(inputEl.validity && inputEl.validity.badInput) return NaN;
  if(raw === '') return null;
  const n = Number(raw);
  if(!isFinite(n) || n < 0 || n > 1e9) return NaN;
  return Math.round(n * 100) / 100;
}
document.getElementById('confirmOk').addEventListener('click', () => {
  if(document.getElementById('confirmAmountWrap').style.display !== 'none'){
    const input = document.getElementById('confirmAmount');
    if(Number.isNaN(readAmountField(input))){
      document.getElementById('confirmAmountError').textContent = 'Enter an amount of $0 or more, or tap Skip.';
      try { input.focus({ preventScroll:true }); } catch(e) {}
      return;
    }
    confirmAmountValue = input.value;
  }
  settleConfirm(true);
});
document.getElementById('confirmSkip').addEventListener('click', () => settleConfirm('skip'));
document.getElementById('confirmAmount').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); document.getElementById('confirmOk').click(); }
});
document.getElementById('confirmAmount').addEventListener('input', () => { document.getElementById('confirmAmountError').textContent = ''; });
document.getElementById('confirmCancel').addEventListener('click', () => settleConfirm(false));
document.getElementById('confirmOverlay').addEventListener('mousedown', e => { if(e.target.id === 'confirmOverlay') settleConfirm(false); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && confirmResolve){ e.stopPropagation(); settleConfirm(false); } }, true);
