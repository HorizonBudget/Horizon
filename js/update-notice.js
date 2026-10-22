// ---- Update notice (2.12.0) ----
// Each CHANGELOG entry may carry `ui`: short lines about things people will SEE or do differently.
// Entries without `ui` are background work. Since 3.3.2 only a big update (the first number goes up, like 2.x to 3.0)
// is announced: a notice with the `ui` lines of every release since the last one this device saw, or a small
// "updated" toast if none had any. Smaller updates are silent (the version is still remembered).
// A stored version that is not a version at all ("abc", "undefined") reads as null: treated like nothing stored.
function cleanVersion(v){
  const m = /^\s*v?(\d+(?:\.\d+){0,3})\s*$/i.exec(v == null ? '' : String(v));
  return m ? m[1] : null;
}
function versionParts(v){ return String(v || '0').split('.').map(n => parseInt(n, 10) || 0); }
function versionCmp(a, b){
  const x = versionParts(a), y = versionParts(b);
  for(let i = 0; i < 3; i++){ const d = (x[i] || 0) - (y[i] || 0); if(d) return d; }
  return 0;
}
function whatsNewSince(lastSeen){
  return CHANGELOG.filter(c => versionCmp(c.v, lastSeen) > 0 && versionCmp(c.v, APP_VERSION) <= 0);
}
function checkWhatsNew(resumed){
  let seen = null;
  // storage blocked (private mode): the version could never be remembered, so a notice would show on every open
  try { seen = cleanVersion(localStorage.getItem('horizonSeenVersion')); } catch(e) { return; }
  // first time on this device: nothing to announce. A device that was already signed in before this
  // feature existed counts as coming from 2.11.0.
  if(!seen){
    if(resumed) seen = '2.11.0';
    else { try { localStorage.setItem('horizonSeenVersion', APP_VERSION); } catch(e) {} return; }
  }
  if(versionCmp(seen, APP_VERSION) >= 0) return;
  try { localStorage.setItem('horizonSeenVersion', APP_VERSION); } catch(e) { return; }   // full / read-only storage: same
  if(versionParts(APP_VERSION)[0] <= versionParts(seen)[0]) return;
  const lines = [];
  whatsNewSince(seen).forEach(c => (c.ui || []).forEach(t => lines.push(t)));
  if(!lines.length){ showToast('Horizon just got a little brighter!'); return; }
  // never push aside a question someone is answering: the notice waits until it is closed
  whenNoConfirm(() => askConfirm({ title: 'Horizon just got a little brighter!', message: lines.map(t => '• ' + t).join('\n'), confirmLabel: 'Got it', info: true }));
}
