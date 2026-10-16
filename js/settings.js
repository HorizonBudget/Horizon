// ---- Settings (theme + confirm-on-restore), remembered in this browser when storage is available ----
let theme = 'light';
let savedThemes = [];          // [{id, name, dark, paper, accent}], this device only
const MAX_SAVED_THEMES = 12;

function loadSettings(){
  try {
    const saved = JSON.parse(localStorage.getItem('ledgerSettings') || '{}');
    const okHex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    if(saved.custom && okHex(saved.custom.paper) && okHex(saved.custom.accent)){
      customTheme = { dark: !!saved.custom.dark, paper: saved.custom.paper, accent: saved.custom.accent };
    }
    if(Array.isArray(saved.savedThemes)){
      const seen = new Set();
      savedThemes = [];
      saved.savedThemes.forEach(t => {
        if(!t || typeof t.name !== 'string' || !okHex(t.paper) || !okHex(t.accent)) return;
        const name = t.name.trim().slice(0, 24);
        if(!name || savedThemes.length >= MAX_SAVED_THEMES) return;
        let id = (typeof t.id === 'string' && /^[a-z0-9]{1,24}$/i.test(t.id)) ? t.id : newThemeId();
        while(seen.has(id)) id = newThemeId();
        seen.add(id);
        savedThemes.push({ id, name, dark: !!t.dark, paper: t.paper, accent: t.accent });
      });
    }
    if(saved.theme === 'custom' && saved.custom) theme = 'custom';
    else if(THEMES.some(t => t.key === saved.theme)) theme = saved.theme;
    else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    if(typeof saved.confirmOnRestore === 'boolean') confirmOnRestore = saved.confirmOnRestore;
  } catch(e) { /* storage unavailable: fall back to defaults */ }
  applyTheme();
}
function saveSettings(){
  try { localStorage.setItem('ledgerSettings', JSON.stringify({ theme, confirmOnRestore, custom: customTheme, savedThemes })); } catch(e) {}
}
function applyTheme(){
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  CUSTOM_VAR_KEYS.forEach(k => root.style.removeProperty(k));
  if(theme === 'custom'){
    const v = customVars(customTheme);
    Object.keys(v).forEach(k => root.style.setProperty(k, v[k]));
    root.style.colorScheme = customTheme.dark ? 'dark' : 'light';
  } else {
    root.style.removeProperty('color-scheme');
  }
  // the logo has two fixed looks: dark tile on light themes, light tile on dark themes
  const dark = isDarkTheme();
  root.style.setProperty('--logo-tile', dark ? '#EEF1ED' : '#1F2A24');
  root.style.setProperty('--logo-line', dark ? '#1F2A24' : '#EEF1ED');
  root.style.setProperty('--logo-sun', dark ? '#C98A2B' : '#E0A94A');
  // tint the phone's status bar / installed-app title bar to match the header
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    const c = getComputedStyle(root).getPropertyValue('--card').trim();
    if(meta && /^#[0-9a-fA-F]{3,8}$/.test(c)) meta.setAttribute('content', c);
  } catch(e) {}
}
