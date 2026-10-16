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
    const n = liveItems().length;
    msg.textContent = `Backup saved (${n} item${n === 1 ? '' : 's'}, ${people.length} ${people.length === 1 ? 'person' : 'people'}).`;
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
      askConfirm({
        title: 'Restore from backup?',
        message: `Replace everything on the board with this backup (${d.items.filter(i => !isDeleted(i)).length} items, ${d.people.length} people)? This also replaces it for everyone sharing the board.`,
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
  const m = /[#&]join=([A-Za-z0-9_-]{6,40})/.exec(location.hash || '');
  if(m) document.getElementById('householdCode').value = m[1].toUpperCase();
  else if(saved && saved.code) document.getElementById('householdCode').value = saved.code;
  if(saved && saved.name) document.getElementById('yourName').value = saved.name;
  if(!cloudConfigured()){
    document.getElementById('gateHint').textContent = 'Sharing isn’t switched on yet, so this board stays on this device and is lost when you close the page. Follow the setup guide to turn it on.';
  }
  if(!m && saved && saved.code && saved.name && cloudConfigured()) enterApp({ personId: saved.personId == null ? null : saved.personId });
}
