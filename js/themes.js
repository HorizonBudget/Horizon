// ---- Color system: every color is one base hex; light and dark tones are derived from it ----
function hexToRgb(h){ const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(h, target, amt){
  const a = hexToRgb(h), b = hexToRgb(target);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amt).toString(16).padStart(2, '0')).join('');
}
const THEMES = [
  { key:'light',    label:'Sage',     dark:false, paper:'#EEF1ED', card:'#F8FAF7', accent:'#3F6D64' },
  { key:'warm',     label:'Sand',     dark:false, paper:'#F3EEE6', card:'#FBF8F2', accent:'#A85A3A' },
  { key:'ocean',    label:'Ocean',    dark:false, paper:'#E9F0F6', card:'#F5F9FC', accent:'#2F6E9E' },
  { key:'dark',     label:'Dark',     dark:true,  paper:'#131719', card:'#1B2123', accent:'#6DB5A4' },
  { key:'midnight', label:'Midnight', dark:true,  paper:'#0E1320', card:'#161C2E', accent:'#7BA7E8' },
  { key:'mocha',    label:'Mocha',    dark:true,  paper:'#1A1512', card:'#231C18', accent:'#E0A070' }
];
let customTheme = { dark:false, paper:'#EEF1ED', accent:'#3F6D64' };
const ACCENT_SWATCHES = ['#3F6D64','#2F6E9E','#A85A3A','#7C6FB5','#B5556F','#5F8F3E','#C98A2B','#4A6FA5'];
const DEFAULT_PAPER = { light:'#EEF1ED', dark:'#131719' };
function currentThemeColors(){
  if(theme === 'custom') return customTheme;
  const t = THEMES.find(x => x.key === theme) || THEMES[0];
  return { dark: t.dark, paper: t.paper, accent: t.accent };
}
function isDarkTheme(){
  if(theme === 'custom') return !!customTheme.dark;
  const t = THEMES.find(x => x.key === theme); return !!(t && t.dark);
}
function relLuminance(hex){
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function customVars(c){
  const dark = c.dark, paper = c.paper, accent = c.accent;
  const ink = dark ? mixHex(paper, '#ffffff', 0.9) : mixHex(paper, '#000000', 0.88);
  const [r, g, b] = hexToRgb(ink), [ar, ag, ab] = hexToRgb(accent);
  return {
    '--paper': paper,
    '--card': dark ? mixHex(paper, '#ffffff', 0.05) : mixHex(paper, '#ffffff', 0.55),
    '--field': dark ? mixHex(paper, '#ffffff', 0.1) : '#FFFFFF',
    '--ink': ink,
    '--ink-soft': mixHex(ink, paper, 0.4),
    '--line': `rgba(${r},${g},${b},${dark ? 0.15 : 0.13})`,
    '--tint': `rgba(${r},${g},${b},${dark ? 0.09 : 0.07})`,
    '--hover': `rgba(${r},${g},${b},${dark ? 0.07 : 0.05})`,
    '--overlay': dark ? 'rgba(0,0,0,0.65)' : `rgba(${r},${g},${b},0.4)`,
    '--warn-fg': dark ? '#F0C877' : '#7A5A17',
    '--mustard': dark ? '#E0A94A' : '#C98A2B',
    '--coral': dark ? '#E8847C' : '#C1524B',
    '--teal': accent,
    '--teal-light': `rgba(${ar},${ag},${ab},${dark ? 0.2 : 0.14})`,
    '--mustard-light': dark ? 'rgba(224,169,74,0.2)' : 'rgba(201,138,43,0.16)',
    '--coral-light': dark ? 'rgba(232,132,124,0.2)' : 'rgba(193,82,75,0.14)',
    '--on-accent': relLuminance(accent) > 0.4 ? '#14181A' : '#FFFFFF'
  };
}
const CUSTOM_VAR_KEYS = Object.keys(customVars({ dark:false, paper:'#EEF1ED', accent:'#3F6D64' }));
function themePickerHtml(){
  const all = THEMES.concat(theme === 'custom' ? [{ key:'custom', label:'Custom', paper: customTheme.paper, accent: customTheme.accent }] : []);
  return all.map(t => `<button type="button" class="theme-opt${t.key === theme ? ' active' : ''}" onclick="setTheme('${t.key}')">
    <span class="theme-swatch" style="background:linear-gradient(135deg, ${t.paper} 0 45%, ${t.accent} 45% 100%)"></span>${t.label}</button>`).join('');
}
function renderThemePicker(){
  const el = document.getElementById('themePicker');
  if(el) el.innerHTML = themePickerHtml();
  renderSavedThemes();
}
function newThemeId(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function sameThemeColors(a, b){
  return !!a.dark === !!b.dark && a.paper.toLowerCase() === b.paper.toLowerCase() && a.accent.toLowerCase() === b.accent.toLowerCase();
}
function renderSavedThemes(){
  const sec = document.getElementById('savedThemesSection');
  const el = document.getElementById('savedThemes');
  if(!sec || !el) return;
  sec.style.display = savedThemes.length ? '' : 'none';
  const cur = currentThemeColors();
  el.innerHTML = savedThemes.map(t => `<div class="theme-opt saved-opt${sameThemeColors(t, cur) ? ' active' : ''}" data-saved-id="${t.id}">
    <button type="button" class="saved-apply" onclick="applySavedTheme('${t.id}')" title="Use “${escapeHtml(t.name)}”"><span class="theme-swatch" style="background:linear-gradient(135deg, ${t.paper} 0 45%, ${t.accent} 45% 100%)"></span><span class="saved-name">${escapeHtml(t.name)}</span></button>
    <button type="button" class="saved-del" onclick="deleteSavedTheme('${t.id}')" aria-label="Delete ${escapeHtml(t.name)}" title="Delete">✕</button></div>`).join('');
}
function setThemeMsg(text){
  const el = document.getElementById('ct_msg');
  if(el) el.textContent = text || '';
}
function saveCurrentTheme(){
  const input = document.getElementById('ct_name');
  const name = (input.value || '').trim().slice(0, 24);
  if(!name){ setThemeMsg('Type a name first.'); input.focus(); return; }
  const c = currentThemeColors();
  const key = name.toLowerCase();
  const existing = savedThemes.findIndex(t => t.name.toLowerCase() === key);
  if(existing === -1 && savedThemes.length >= MAX_SAVED_THEMES){
    setThemeMsg(`You can keep up to ${MAX_SAVED_THEMES} themes. Delete one to make room.`);
    return;
  }
  if(existing !== -1) savedThemes.splice(existing, 1);
  savedThemes.push({ id: newThemeId(), name, dark: !!c.dark, paper: c.paper, accent: c.accent });
  input.value = '';
  saveSettings();
  renderSavedThemes();
  setThemeMsg(`Saved “${name}”`);
}
function applySavedTheme(id){
  const t = savedThemes.find(x => x.id === id);
  if(!t) return;
  customTheme = { dark: !!t.dark, paper: t.paper, accent: t.accent };
  theme = 'custom';
  setThemeMsg('');
  commitTheme();
}
function deleteSavedTheme(id){
  const t = savedThemes.find(x => x.id === id);
  if(!t) return;
  savedThemes = savedThemes.filter(x => x.id !== id);
  saveSettings();
  renderSavedThemes();
  setThemeMsg(`Deleted “${t.name}”`);
}
function colorSet(hex){
  const [r, g, b] = hexToRgb(hex);
  if(isDarkTheme()){
    return { solid: hex, fg: mixHex(hex, '#ffffff', 0.5), bg: `rgba(${r},${g},${b},0.34)`, border: `rgba(${r},${g},${b},0.75)` };
  }
  return { solid: hex, fg: mixHex(hex, '#000000', 0.45), bg: `rgba(${r},${g},${b},0.42)`, border: `rgba(${r},${g},${b},0.7)` };
}
function neutralSet(){
  return isDarkTheme()
    ? { solid:'#7A877F', fg:'#B5C0B9', bg:'rgba(230,236,232,0.1)', border:'rgba(230,236,232,0.22)' }
    : { solid:'#5A665D', fg:'#5A665D', bg:'rgba(31,42,36,0.1)', border:'rgba(31,42,36,0.18)' };
}
function hashIndex(str, mod){
  let h = 0;
  for(let i = 0; i < str.length; i++){ h = str.charCodeAt(i) + ((h << 5) - h); }
  return Math.abs(h) % mod;
}
const PALETTE = ['#C98A2B','#4A85A8','#C1524B','#3F6D64','#7C6FB5','#5F8F3E','#B5556F','#C9782B','#4A6FA5','#6B7F3A','#8F4E7A','#4E8F7D'];
function monthColor(m){
  if(!m || m === 'No date yet') return neutralSet();
  return colorSet(PALETTE[hashIndex(m, PALETTE.length)]);
}
const FIXED_CATEGORY_HEX = {
  'Vehicle':'#C98A2B', 'Home':'#3F6D64', 'Kids':'#C1524B', 'Health':'#7C6FB5', 'Holidays & Gifts':'#B5556F',
  'Subscriptions':'#4A85A8', 'Travel':'#5F8F3E', 'Clothing':'#8F4E7A', 'Education':'#4E8F7D',
  'Electronics':'#4A6FA5', 'Pets':'#6B7F3A'
};
function categoryColor(c){
  if(c === 'Other') return neutralSet();
  return colorSet(FIXED_CATEGORY_HEX[c] || PALETTE[hashIndex(c, PALETTE.length)]);
}
const OWNER_HEX = ['#C98A2B','#3F6D64','#C1524B','#7C6FB5','#4A85A8','#5F8F3E','#B5556F'];
function ownerColor(name){
  if(!name) return neutralSet();
  return colorSet(OWNER_HEX[hashIndex(name, OWNER_HEX.length)]);
}

function initials(name){
  if(!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}

function avatarHtml(name, size){
  const cls = 'avatar' + (size==='sm' ? ' avatar-sm' : size==='lg' ? ' avatar-lg' : size==='xl' ? ' avatar-xl' : '');
  const person = people.find(p => p.name === name);
  const oc = ownerColor(name);
  if(person && person.photo){
    return `<img class="${cls}" src="${person.photo}" alt="${escapeHtml(name)}">`;
  }
  return `<span class="${cls}" style="background:${oc.solid}">${escapeHtml(initials(name))}</span>`;
}
