function showSettingsTab(name){
  if(!['general', 'themes', 'advanced'].includes(name)) name = 'general';   // never a blank Settings
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
  syncPatternUi();
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
  const sea = seasonalTheme(t);
  // a seasonal theme brings its own pattern; leaving one takes that pattern away again, but a pattern the person
  // chose or changed themselves stays
  if(sea) bgPattern = Object.assign({}, sea.pattern, { auto:true });
  else if(bgPattern.auto) bgPattern = defaultPattern();
  commitTheme();
}
function resetTheme(){
  bgPattern = defaultPattern();
  setTheme('light');
}
function onCustomChange(which){
  const c = Object.assign({}, currentThemeColors());
  delete c.danger;   // editing the colors by hand goes back to the standard delete/over red
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
  syncPatternUi();
  // colors that are computed in JS (pills, badges, chips) need a redraw
  if(document.getElementById('app').style.display === 'block') render();
  if(document.getElementById('guideOverlay').style.display === 'flex') renderStyleGuide();
}

// ---- Background pattern controls (Themes tab) ----
function changePattern(change){
  bgPattern = Object.assign({}, bgPattern, change, { auto:false });
  applyPattern();
  saveSettings();
  syncPatternUi();
  renderSavedThemes();
}
function setPatternType(type){
  if(!PATTERN_TYPES.some(t => t.key === type)) return;
  changePattern({ type });
}
function setPatternSize(size){ if(PATTERN_SIZES.includes(size)) changePattern({ size }); }
function setPatternStrength(strength){ if(PATTERN_STRENGTHS.includes(strength)) changePattern({ strength }); }
function setPatternEmoji(emoji){
  const e = sanitizeEmoji(emoji);
  if(e) changePattern({ type:'emoji', emoji:e });
}
// Typing in the "Custom emoji" box: keep only real emoji (max 3) right in the field, and apply once there is one.
function onCustomEmojiInput(){
  const el = document.getElementById('pat_emoji');
  const clean = sanitizeEmoji(el.value);
  if(el.value !== clean) el.value = clean;
  if(clean) setPatternEmoji(clean);
}
function syncPatternUi(){
  const p = bgPattern;
  const mark = (el, on) => { if(el){ el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); } };
  document.querySelectorAll('#patTypes [data-pat-type]').forEach(b => mark(b, b.dataset.patType === p.type));
  document.querySelectorAll('#patSize [data-pat-size]').forEach(b => mark(b, b.dataset.patSize === p.size));
  document.querySelectorAll('#patStrength [data-pat-strength]').forEach(b => mark(b, b.dataset.patStrength === p.strength));
  const presets = document.getElementById('patEmojiPresets');
  if(presets){
    if(!presets.children.length){
      presets.innerHTML = EMOJI_PRESETS.map(e => `<button type="button" class="emoji-opt" data-emoji="${e}" aria-label="Pattern ${e}" onclick="setPatternEmoji(this.dataset.emoji)">${e}</button>`).join('');
    }
    presets.querySelectorAll('[data-emoji]').forEach(b => mark(b, p.type === 'emoji' && b.dataset.emoji === p.emoji));
  }
  const field = document.getElementById('pat_emoji');
  if(field && document.activeElement !== field) field.value = (p.type === 'emoji' && !EMOJI_PRESETS.includes(p.emoji)) ? p.emoji : '';
  const opts = document.getElementById('patOptions');
  if(opts) opts.style.display = p.type === 'none' ? 'none' : '';
  const box = document.getElementById('patEmojiBox');
  if(box) box.style.display = p.type === 'emoji' ? '' : 'none';
}
