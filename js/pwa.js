// ---- Installing Horizon (PWA) -------------------------------------------------------------
// Android and desktop Chrome/Edge offer a real install prompt; iPhone and iPad need Share → Add to Home Screen.
const INSTALL_HINT_KEY = 'horizonInstallHintShown';
let deferredInstallPrompt = null;
let installHintShownHere = false;   // also remembered in memory, for when this device can't store anything
function isStandalone(){
  try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch(e) { return false; }
}
function isIosSafari(){
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // other browsers and in-app browsers (Google app, Facebook, Instagram, ...) can't add to the Home Screen
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\/|Snapchat|LinkedInApp|Pinterest/.test(ua);
}
function updateInstallUi(){
  const txt = document.getElementById('installRowText'), btn = document.getElementById('installRowBtn');
  if(!txt || !btn) return;
  btn.style.display = 'none';
  if(isStandalone()){ txt.textContent = 'Horizon is installed on this device.'; return; }
  if(deferredInstallPrompt){
    txt.textContent = 'Add Horizon to your home screen or desktop so it opens like an app, even without a connection.';
    btn.style.display = '';
  } else if(isIosSafari()){
    txt.textContent = 'On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen”.';
  } else {
    txt.textContent = 'In Chrome or Edge, open the browser menu and choose “Install Horizon” (on Android, “Add to Home screen”). On iPhone or iPad, open this page in Safari, tap Share, then “Add to Home Screen”.';
  }
}
function installHintVisible(){ const h = document.getElementById('installHint'); return !!h && !h.hidden; }
function maybeShowInstallHint(){
  if(installHintVisible()) return;
  if(document.getElementById('app').style.display !== 'block' || !household.code) return;
  if(isStandalone() || installHintShownHere || lsGet(INSTALL_HINT_KEY) === '1') return;
  if(!deferredInstallPrompt && !isIosSafari()) return;
  const canPrompt = !!deferredInstallPrompt;
  document.getElementById('installHintText').textContent = canPrompt
    ? 'Install Horizon on this device to open it like an app, even without a connection.'
    : 'Install Horizon: tap the Share button, then “Add to Home Screen”.';
  document.getElementById('installHintBtn').style.display = canPrompt ? '' : 'none';
  document.getElementById('installHintDismiss').textContent = canPrompt ? 'Not now' : 'Got it';
  document.getElementById('installHint').hidden = false;
  installHintShownHere = true;
  lsSet(INSTALL_HINT_KEY, '1');   // shown once per device, whatever happens next
}
function dismissInstallHint(){
  document.getElementById('installHint').hidden = true;
  lsSet(INSTALL_HINT_KEY, '1');
}
async function installFromHint(){
  const ev = deferredInstallPrompt;
  if(!ev) return;
  deferredInstallPrompt = null;
  document.getElementById('installHint').hidden = true;
  lsSet(INSTALL_HINT_KEY, '1');
  try { ev.prompt(); if(ev.userChoice) await ev.userChoice; } catch(e) {}
  updateInstallUi();
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUi();
  maybeShowInstallHint();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  dismissInstallHint();
  updateInstallUi();
});
// Offline support: only on https (or localhost), and never allowed to break the app.
try {
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
    window.addEventListener('load', () => {
      try { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}); } catch(e) {}
    });
  }
} catch(e) {}
