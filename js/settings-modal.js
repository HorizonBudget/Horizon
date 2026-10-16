function showSettingsTab(name){
  ['general', 'themes', 'advanced'].forEach(n => {
    document.getElementById('settingsTab-' + n).classList.toggle('active', n === name);
    document.getElementById('settingsPane-' + n).classList.toggle('active', n === name);
  });
  const box = document.querySelector('#settingsOverlay .modal');
  if(box) box.scrollTop = 0;
}

function openSettingsModal(tab){
  document.getElementById('appVersion').textContent = 'Horizon · version ' + APP_VERSION;
  refreshAdminRow();
  updateInstallUi();
  renderChangelog();
  syncCustomizer();
  setThemeMsg('');
  document.getElementById('ct_name').value = '';
  showSettingsTab(typeof tab === 'string' ? tab : 'general');
  const signedIn = !!household.code;
  document.getElementById('sharingSection').style.display = signedIn ? 'block' : 'none';
  document.getElementById('shareCode').textContent = household.code || '—';
  document.getElementById('settingsHhName').value = householdName;
  document.getElementById('backupMsg').textContent = '';
  updateLastBackupLabel();
  document.getElementById('syncDetail').textContent = cloud.mode === 'cloud'
    ? 'Changes save automatically and show up on everyone’s devices within a second or two.'
    : 'Sharing isn’t switched on yet, so this board only lives on this device and is lost when you close the page. See the setup guide to turn it on.';
  document.getElementById('settingsConfirmRestore').checked = confirmOnRestore;
  refreshTrashUi();
  renderThemePicker();
  document.getElementById('settingsOverlay').style.display = 'flex';
}
function closeSettingsModal(){
  document.getElementById('settingsOverlay').style.display = 'none';
}
function onConfirmRestoreSettingChange(){
  confirmOnRestore = document.getElementById('settingsConfirmRestore').checked;
  saveSettings();
}
function setTheme(t){
  theme = t;
  commitTheme();
}
function onCustomChange(which){
  const c = Object.assign({}, currentThemeColors());
  if(which === 'paper') c.paper = document.getElementById('ct_paper').value;
  if(which === 'accent') c.accent = document.getElementById('ct_accent').value;
  customTheme = c; theme = 'custom';
  commitTheme();
}
function setCustomMode(dark){
  const base = currentThemeColors();
  customTheme = { dark, paper: dark === base.dark ? base.paper : (dark ? DEFAULT_PAPER.dark : DEFAULT_PAPER.light), accent: base.accent };
  theme = 'custom';
  commitTheme();
}
function setCustomAccent(hex){
  const base = currentThemeColors();
  customTheme = { dark: base.dark, paper: base.paper, accent: hex };
  theme = 'custom';
  commitTheme();
}
function syncCustomizer(){
  const c = currentThemeColors();
  const set = (id, v) => { const el = document.getElementById(id); if(el && el.value !== v) el.value = v; };
  set('ct_paper', c.paper); set('ct_accent', c.accent);
  document.getElementById('ct_light').classList.toggle('active', !c.dark);
  document.getElementById('ct_dark').classList.toggle('active', !!c.dark);
  document.getElementById('accentSwatches').innerHTML = ACCENT_SWATCHES.map(h =>
    `<button type="button" class="swatch${h.toLowerCase() === c.accent.toLowerCase() ? ' active' : ''}" style="background:${h}" title="${h}" aria-label="Accent ${h}" onclick="setCustomAccent('${h}')"></button>`).join('');
}
function commitTheme(){
  applyTheme();
  saveSettings();
  renderThemePicker();
  syncCustomizer();
  // colors that are computed in JS (pills, badges, chips) need a redraw
  if(document.getElementById('app').style.display === 'block') render();
  if(document.getElementById('guideOverlay').style.display === 'flex') renderStyleGuide();
}
