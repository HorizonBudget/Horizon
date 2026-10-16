const BACKUP_KEY = 'lastBackupAt', BACKUP_SEED_KEY = 'lastBackupSeeded', BACKUP_SNOOZE_KEY = 'backupSnoozedUntil';
const BACKUP_REMIND_DAYS = 30, BACKUP_SNOOZE_DAYS = 7;
function storedTime(v){
  if(v == null || v === '') return NaN;
  return /^\d+$/.test(v) ? Number(v) : Date.parse(v);
}
// First run on a device: start the clock now, so nobody is nagged on day one.
function initBackupReminder(){
  if(Number.isNaN(storedTime(lsGet(BACKUP_KEY)))){
    lsSet(BACKUP_KEY, String(Date.now()));
    lsSet(BACKUP_SEED_KEY, '1');
  }
}
function backupDaysSince(now){
  const t = storedTime(lsGet(BACKUP_KEY));
  return Number.isNaN(t) ? null : Math.floor(((now == null ? Date.now() : now) - t) / DAY_MS);
}
function updateBackupBanner(){
  const el = document.getElementById('backupBanner');
  if(!el) return;
  const now = Date.now();
  const days = backupDaysSince(now);
  const snoozedUntil = storedTime(lsGet(BACKUP_SNOOZE_KEY));
  const show = days !== null && days >= BACKUP_REMIND_DAYS && !(snoozedUntil > now);
  el.hidden = !show;
  if(show) document.getElementById('backupBannerText').textContent = `It’s been ${days} days since your last backup.`;
}
function snoozeBackupReminder(){
  lsSet(BACKUP_SNOOZE_KEY, String(Date.now() + BACKUP_SNOOZE_DAYS * DAY_MS));
  updateBackupBanner();
}
function backupNowFromBanner(){ exportBackup(); }
function updateLastBackupLabel(){
  const el = document.getElementById('lastBackupLabel');
  if(!el) return;
  const t = storedTime(lsGet(BACKUP_KEY));
  if(Number.isNaN(t)){ el.textContent = 'Last backup: not recorded on this device.'; return; }
  const when = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  el.textContent = lsGet(BACKUP_SEED_KEY) === '1'
    ? `Last backup: none yet on this device. Reminders count from ${when}.`
    : `Last backup: ${when}`;
}
