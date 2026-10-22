// ---- Household code helpers ----
const CODE_WORDS = ['MAPLE','HARBOR','CEDAR','RIVER','SUNNY','PINE','AMBER','CLOVER','MEADOW','FALCON','WILLOW','COBALT','JUNIPER','ORCHARD','PEBBLE','LANTERN','TIMBER','SPARROW','BRIGHT','QUARTZ'];
function generateHouseholdCode(){
  const r = new Uint32Array(3);
  (window.crypto || window.msCrypto).getRandomValues(r);
  const code = CODE_WORDS[r[0] % CODE_WORDS.length] + '-' + CODE_WORDS[r[1] % CODE_WORDS.length] + '-' + String(1000 + (r[2] % 9000));
  document.getElementById('householdCode').value = code;
  setGateError('');
}

function copyHouseholdCode(kind){
  const text = kind === 'link' ? (location.href.split('#')[0] + '#join=' + household.code) : household.code;
  const btn = document.getElementById(kind === 'link' ? 'copyLinkBtn' : 'copyCodeBtn');
  const label = btn.textContent;
  const showManual = () => { askConfirm({ title: 'Copy this', message: 'Your browser wouldn’t copy it automatically. Select the text below and copy it.', copyText: text, info: true }); };
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = label; }, 1500); };
  try {
    navigator.clipboard.writeText(text).then(done, showManual);
  } catch(e){ showManual(); }
}

function exportBackup(){
  const msg = document.getElementById('backupMsg');
  try {
    const data = Object.assign({ app: 'household-forecast', version: 1, exportedAt: new Date().toISOString(), householdCode: household.code }, snapshotState());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `household-forecast-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const n = liveItems().length, nt = liveTodos().length;
    msg.textContent = `Backup saved (${n} item${n === 1 ? '' : 's'}, ${nt ? nt + ' to-do' + (nt === 1 ? '' : 's') + ', ' : ''}${people.length} ${people.length === 1 ? 'person' : 'people'}).`;
    lsSet(BACKUP_KEY, String(Date.now()));
    lsDel(BACKUP_SEED_KEY); lsDel(BACKUP_SNOOZE_KEY);
    updateBackupBanner();
    updateLastBackupLabel();
    showToast(msg.textContent);
  } catch(e){ msg.textContent = 'Couldn’t create the backup file on this device.'; }
}
function onRestoreFileChosen(input){
  const msg = document.getElementById('backupMsg');
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if(!d || d.app !== 'household-forecast' || !Array.isArray(d.items) || !Array.isArray(d.people)) throw new Error('bad');
      // the shared database holds at most about 1 MB per household: refuse before anything is replaced
      if(cloud.mode === 'cloud' && boardBytes(docToSnap(d).snap) > DOC_MAX_BYTES){
        msg.textContent = 'That backup is too big to share: it is over the size limit of the shared database. Nothing was changed.';
        askAlert(msg.textContent);
        return;
      }
      const nItems = d.items.filter(i => !isDeleted(i) && !isTodo(i)).length, nTodos = d.items.filter(i => !isDeleted(i) && isTodo(i)).length;
      askConfirm({
        title: 'Restore from backup?',
        message: `Replace everything on the board with this backup (${nItems} items, ${nTodos ? nTodos + ' to-dos, ' : ''}${d.people.length} people)? This also replaces it for everyone sharing the board.`,
        confirmLabel: 'Replace board', danger: true
      }).then(ok => {
        if(!ok) return;
        applyState(stateFromDoc(d));
        reconcileIdentity();
        purgeTrash();
        logActivity(`${household.name} restored the board from a backup`);
        render();
        msg.textContent = 'Board restored from backup.';
      });
    } catch(e){ msg.textContent = 'That file doesn’t look like a Household Forecast backup.'; }
  };
  reader.readAsText(file);
}

function leaveHousehold(){
  return askConfirm({
    title: 'Leave this household?',
    message: 'Leave this household on this device? Nothing is deleted. Your family keeps the board and you can come back with the code.',
    confirmLabel: 'Leave', danger: true
  }).then(ok => {
    if(!ok) return false;
    try { localStorage.removeItem('ledgerHousehold'); } catch(e) {}
    clearBoardCache();
    cloudDisconnect();
    location.reload();
    return true;
  });
}

// On load: prefill the gate from an invite link or the last household used on this device,
// and (when sharing is on) go straight back into the board.
function resumeSession(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('ledgerHousehold') || 'null'); } catch(e) {}
  let m = /[#&]join=([A-Za-z0-9_-]{6,40})/.exec(location.hash || '');
  if(m){
    // used once: take the invite out of the address bar so a reload doesn't bring the sign-in screen back
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch(e) {}
    // an invite to the household this device is already signed in to: just open it
    if(saved && saved.code && saved.code === m[1].toUpperCase()) m = null;
  }
  if(m) document.getElementById('householdCode').value = m[1].toUpperCase();
  else if(saved && saved.code) document.getElementById('householdCode').value = saved.code;
  if(saved && saved.name) document.getElementById('yourName').value = saved.name;
  if(!cloudConfigured()){
    document.getElementById('gateHint').textContent = 'Sharing isn’t switched on yet, so this board stays on this device and is lost when you close the page. Follow the setup guide to turn it on.';
  }
  if(!m && saved && saved.code && saved.name && cloudConfigured()){
    if(!resumeFromCache(saved)) enterApp({ personId: saved.personId == null ? null : saved.personId });
  } else if(!saved || !saved.code) clearBoardCache();   // signed out on this device: no copy of any board stays behind
}

// Signed in before and this device has a copy of the board: show it now and catch up in the background
// (js/cloud.js cloudResumeHeld). Returns false when there is no usable copy, so the normal sign-in runs.
function resumeFromCache(saved){
  const rec = loadBoardCache(saved.code);
  if(!rec) return false;
  const st = stateFromDoc(rec.local || rec.base);
  const n = String(saved.name).trim().toLowerCase();
  const person = (saved.personId != null && st.people.find(p => samePid(p.id, saved.personId)))
    || st.people.find(p => String(p.name).trim().toLowerCase() === n);
  // renamed or removed elsewhere: with nothing unsent, the normal sign-in asks who this is. With unsent edits,
  // open the copy anyway so they aren't lost; reconcileIdentity asks once the server has answered.
  if(!person && !rec.local) return false;
  household = person ? { code: saved.code, name: person.name, personId: person.id }
    : { code: saved.code, name: saved.name, personId: saved.personId == null ? null : saved.personId };
  applyState(st);
  cloud.mode = 'cloud';
  cloud.held = true;
  cloud.heldBase = JSON.parse(JSON.stringify(rec.base));
  document.getElementById('yourName').value = household.name;
  saveSession();
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  setCloudStatus('updating');
  render();
  maybeShowInstallHint();
  checkWhatsNew(true);
  cloudResumeHeld(saved.code);
  return true;
}
