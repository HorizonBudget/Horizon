// ---- Settings (theme + confirm-on-restore), remembered in this browser when storage is available ----
let theme = 'light';
let uiSide = 'budget';         // 'budget' or 'todo': which side of Horizon is showing. This device only.
let savedThemes = [];          // [{id, name, dark, paper, accent, danger?, pattern?}], this device only
let bgPattern = defaultPattern();   // {type, size, strength, emoji, auto}; auto = it came with a seasonal theme and was not changed. This device only.
const MAX_SAVED_THEMES = 12;

function loadSettings(){
  try {
    let saved = JSON.parse(localStorage.getItem('ledgerSettings') || '{}');
    if(!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};   // damaged settings: start fresh
    const okHex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    if(saved.custom && okHex(saved.custom.paper) && okHex(saved.custom.accent)){
      customTheme = { dark: !!saved.custom.dark, paper: saved.custom.paper, accent: saved.custom.accent };
      if(okHex(saved.custom.danger)) customTheme.danger = saved.custom.danger;
    }
    if(Array.isArray(saved.savedThemes)){
      const seen = new Set();
      savedThemes = [];
      saved.savedThemes.forEach(t => {
        if(!t || typeof t.name !== 'string' || !okHex(t.paper) || !okHex(t.accent)) return;
        const name = clipThemeName(t.name);
        if(!name || savedThemes.length >= MAX_SAVED_THEMES) return;
        let id = (typeof t.id === 'string' && /^[a-z0-9]{1,24}$/i.test(t.id)) ? t.id : newThemeId();
        while(seen.has(id)) id = newThemeId();
        seen.add(id);
        const entry = { id, name, dark: !!t.dark, paper: t.paper, accent: t.accent };
        if(okHex(t.danger)) entry.danger = t.danger;
        const pat = cleanPattern(t.pattern);
        if(pat){ delete pat.auto; entry.pattern = pat; }
        savedThemes.push(entry);
      });
    }
    bgPattern = cleanPattern(saved.pattern) || defaultPattern();
    if(saved.theme === 'custom' && saved.custom) theme = 'custom';
    else if(findTheme(saved.theme)) theme = saved.theme;
    else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    if(typeof saved.confirmOnRestore === 'boolean') confirmOnRestore = saved.confirmOnRestore;
    uiSide = saved.side === 'todo' ? 'todo' : 'budget';
  } catch(e) { /* storage unavailable: fall back to defaults */ }
  applyTheme();
}
function saveSettings(){
  try { localStorage.setItem('ledgerSettings', JSON.stringify({ theme, confirmOnRestore, custom: customTheme, savedThemes, pattern: bgPattern, side: uiSide })); } catch(e) {}
}
function applyTheme(){
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  CUSTOM_VAR_KEYS.forEach(k => root.style.removeProperty(k));
  if(theme === 'custom' || seasonalTheme(theme)){
    // custom and seasonal themes: every color is derived from the three base colors
    const c = currentThemeColors();
    const v = customVars(c);
    Object.keys(v).forEach(k => root.style.setProperty(k, v[k]));
    root.style.colorScheme = themeInk(c).dark ? 'dark' : 'light';
  } else {
    root.style.removeProperty('color-scheme');
  }
  // the logo has two fixed looks: dark tile on light themes, light tile on dark themes
  const dark = isDarkTheme();
  root.style.setProperty('--logo-tile', dark ? '#EEF1ED' : '#1F2A24');
  root.style.setProperty('--logo-line', dark ? '#1F2A24' : '#EEF1ED');
  root.style.setProperty('--logo-sun', dark ? '#C98A2B' : '#E0A94A');
  applyPattern();
  // tint the phone's status bar / installed-app title bar to match the header
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    const c = getComputedStyle(root).getPropertyValue('--card').trim();
    if(meta && /^#[0-9a-fA-F]{3,8}$/.test(c)) meta.setAttribute('content', c);
  } catch(e) {}
}

// The pattern itself is drawn by CSS (styles.css, "seasonal-patterns") on a fixed layer behind the page; this only sets
// the switches it reads: html[data-pat], --pat-size, --pat-opacity and (emoji) --pat-image.
function applyPattern(){
  const root = document.documentElement;
  const p = cleanPattern(bgPattern) || defaultPattern();
  const clear = () => ['--pat-size', '--pat-opacity', '--pat-image'].forEach(k => root.style.removeProperty(k));
  if(p.type === 'none'){ root.removeAttribute('data-pat'); clear(); return; }
  root.setAttribute('data-pat', p.type);
  root.style.setProperty('--pat-size', patternPx(p) + 'px');
  root.style.setProperty('--pat-opacity', String(patternOpacity(p)));
  if(p.type === 'emoji'){
    const uri = emojiTileUri(p.emoji, patternPx(p));
    if(uri) root.style.setProperty('--pat-image', 'url("' + uri + '")');
    else root.removeAttribute('data-pat');
  } else {
    root.style.removeProperty('--pat-image');
  }
}

// ---- Restore: a backup made in a different household asks first ----
// Runs before the normal restore (js/household.js onRestoreFileChosen), which still checks the file and asks
// "Replace board?". Backups record householdCode; very old ones that don't are not questioned (the normal
// question already says everything will be replaced). Anything unreadable goes straight on for its usual message.
function backupHouseholdCode(text){
  try {
    const d = JSON.parse(text);
    return d && typeof d.householdCode === 'string' ? d.householdCode.trim().toUpperCase() : '';
  } catch(e) { return ''; }
}
function onRestorePicked(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const handOn = () => onRestoreFileChosen({ files: [file], value: '' });
  const reader = new FileReader();
  reader.onload = () => {
    const from = backupHouseholdCode(String(reader.result || ''));
    const here = String(household.code || '').trim().toUpperCase();
    if(!from || !here || from === here){ handOn(); return; }
    askConfirm({
      title: 'Backup from another household',
      message: `This backup is from another household (${from}). Restore it into this one anyway?`,
      confirmLabel: 'Continue'
    }).then(ok => { if(ok) handOn(); });
  };
  reader.onerror = handOn;
  reader.readAsText(file);
}
