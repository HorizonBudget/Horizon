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
// Seasonal themes: same three base colors as every other theme (the rest is derived by customVars), plus a default
// background pattern that is applied when the theme is picked. Nothing here is special-cased anywhere else.
// Optional `danger`: a theme whose accent is itself red sets its own delete/over color so the two stay apart.
const SEASONAL_THEMES = [
  { key:'halloween', label:'Halloween',     emoji:'🎃', dark:true,  paper:'#1B1026', accent:'#F5922F', pattern:{ type:'emoji', emoji:'🎃', size:'medium', strength:'medium' } },
  { key:'autumn',    label:'Autumn',        emoji:'🍂', dark:false, paper:'#F5EADB', accent:'#853F14', pattern:{ type:'emoji', emoji:'🍂', size:'medium', strength:'medium' } },
  { key:'christmas', label:'Christmas',     emoji:'🎄', dark:false, paper:'#FBF7F4', accent:'#A50F2A', danger:'#A33A00', pattern:{ type:'emoji', emoji:'🎅', size:'medium', strength:'medium' } },
  { key:'winter',    label:'Winter',        emoji:'❄️', dark:false, paper:'#E6EEF7', accent:'#444C99', pattern:{ type:'emoji', emoji:'❄️', size:'medium', strength:'medium' } },
  { key:'valentine', label:'Valentine’s',   emoji:'💗', dark:false, paper:'#FBE9EE', accent:'#9E1E51', pattern:{ type:'emoji', emoji:'💗', size:'medium', strength:'medium' } },
  { key:'spring',    label:'Spring',        emoji:'🌷', dark:false, paper:'#EAF4DF', accent:'#336019', pattern:{ type:'emoji', emoji:'🌷', size:'medium', strength:'medium' } },
  { key:'summer',    label:'Summer',        emoji:'☀️', dark:false, paper:'#FFF1CF', accent:'#085F70', pattern:{ type:'emoji', emoji:'☀️', size:'medium', strength:'medium' } },
  { key:'july4',     label:'Fourth of July', emoji:'⭐', dark:false, paper:'#E8EEFA', accent:'#A8112B', pattern:{ type:'emoji', emoji:'⭐', size:'medium', strength:'medium' } }
];
function allThemes(){ return THEMES.concat(SEASONAL_THEMES); }
function findTheme(key){ return allThemes().find(x => x.key === key); }
function seasonalTheme(key){ return SEASONAL_THEMES.find(x => x.key === key); }

// ---- Background patterns (per device; drawn on a fixed layer behind the page, see styles.css) ----
const PATTERN_TYPES = [
  { key:'none', label:'None' }, { key:'stripes', label:'Stripes' }, { key:'diagonal', label:'Diagonal stripes' },
  { key:'dots', label:'Dots' }, { key:'grid', label:'Grid' }, { key:'emoji', label:'Emoji' }
];
const PATTERN_SIZES = ['small', 'medium', 'large'];
const PATTERN_STRENGTHS = ['subtle', 'medium', 'bold'];
// pixel size of one repeat; emoji tiles are drawn at twice this (two rows, staggered)
const PATTERN_PX = { geo: { small:12, medium:20, large:34 }, emoji: { small:44, medium:68, large:104 } };
// layer opacity. Geometric patterns are drawn in the ink color; emoji keep their own colors, so they can go higher.
// Soft and accent text never sits on the bare pattern: the few bits of text that sit directly on the page (empty
// message, Collapse all) get a paper backing whenever a pattern is on (styles.css, seasonal-patterns). Tests check both.
const PATTERN_OPACITY = { geo: { subtle:0.08, medium:0.13, bold:0.18 }, emoji: { subtle:0.14, medium:0.22, bold:0.30 } };
const PATTERN_MAX_OPACITY = 0.30;   // the strongest any pattern can be (headings in the ink color are checked against this)
// extra safety margin for soft text: it stays AA even on a page tinted this much with ink (the old cap; keeps colors stable)
const PATTERN_SOFT_TEXT_TINT = 0.16;
const EMOJI_PRESETS = ['🎃', '👻', '🍂', '🦃', '🎄', '🎅', '❄️', '💗', '🌷', '☀️', '🎆', '⭐', '🐾'];
const DEFAULT_EMOJI = '⭐';
function defaultPattern(){ return { type:'none', size:'medium', strength:'medium', emoji:DEFAULT_EMOJI, auto:false }; }

// An emoji "cluster" = one visible emoji: a flag (two regional indicators), or a pictograph with optional variation
// selector / skin tone, optionally joined to more pictographs with ZWJ. Digits, #, *, letters and punctuation are NOT
// matched, even though Unicode calls digits "Emoji". (c), (r), tm and the like are left out on purpose.
const EMOJI_MOD = '[\\u{1F3FB}-\\u{1F3FF}]?';
function emojiClusterSource(pict, ri){
  return ri + '{2}|(?![\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139])' + pict + '\\uFE0F?' + EMOJI_MOD +
    '(?:\\u200D' + pict + '\\uFE0F?' + EMOJI_MOD + '){0,6}';
}
let EMOJI_CLUSTER_RE;
try {
  EMOJI_CLUSTER_RE = new RegExp(emojiClusterSource('\\p{Extended_Pictographic}', '\\p{Regional_Indicator}'), 'gu');
} catch(e) {
  // older browsers without Unicode property escapes: the main emoji blocks by range
  EMOJI_CLUSTER_RE = new RegExp(emojiClusterSource('[\\u2190-\\u21FF\\u2300-\\u23FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\u{1F000}-\\u{1FAFF}]', '[\\u{1F1E6}-\\u{1F1FF}]'), 'gu');
}
const EMOJI_MAX_CLUSTERS = 3;
const EMOJI_MAX_UNITS = 16;       // UTF-16 length of one cluster (a family emoji is 11)
function emojiClusters(input){
  if(typeof input !== 'string') return [];
  const out = [];
  const text = input.slice(0, 200);   // bound the work before matching, whatever was pasted
  const re = new RegExp(EMOJI_CLUSTER_RE.source, 'gu');
  let m;
  while((m = re.exec(text)) && out.length < EMOJI_MAX_CLUSTERS){
    if(m[0].length <= EMOJI_MAX_UNITS) out.push(m[0]);
    if(m[0].length === 0) re.lastIndex++;
  }
  return out;
}
// Keeps only real emoji (1 to 3 of them). The result can contain nothing that is special in HTML, SVG, CSS or a URL.
function sanitizeEmoji(input){ return emojiClusters(input).join(''); }
// The tile is an inline SVG with <text>. Only sanitized emoji ever reach it, and the whole thing is percent-encoded.
function emojiTileUri(emoji, px){
  const glyphs = emojiClusters(emoji);
  if(!glyphs.length) return '';
  const n = Math.max(8, Math.min(400, Math.round(Number(px) || 64)));
  const W = n * 2, f = Math.round(n * 0.5);
  // staggered rows: two glyphs on the first row, then one in the middle and one wrapped across the left/right edge
  const spots = [[0.5, 0.5, -12], [1.5, 0.5, 10], [1.0, 1.5, 12], [0, 1.5, -10], [2, 1.5, -10]];
  const text = spots.map((s, i) => {
    const g = glyphs[(i === 4 ? 3 : i) % glyphs.length];
    const x = Math.round(s[0] * n), y = Math.round(s[1] * n + f * 0.35);
    return `<text x='${x}' y='${y}' transform='rotate(${s[2]} ${x} ${Math.round(s[1] * n)})'>${g}</text>`;
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${W}' viewBox='0 0 ${W} ${W}'><g font-size='${f}' text-anchor='middle' font-family='Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif'>${text}</g></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27');
}
// Turns anything found in storage (or a saved theme) into a safe pattern object, or null if it is not an object.
function cleanPattern(raw){
  if(!raw || typeof raw !== 'object') return null;
  const d = defaultPattern();
  return {
    type: PATTERN_TYPES.some(t => t.key === raw.type) ? raw.type : d.type,
    size: PATTERN_SIZES.includes(raw.size) ? raw.size : d.size,
    strength: PATTERN_STRENGTHS.includes(raw.strength) ? raw.strength : d.strength,
    emoji: sanitizeEmoji(raw.emoji) || d.emoji,
    auto: raw.auto === true
  };
}
function patternGroup(type){ return type === 'emoji' ? 'emoji' : 'geo'; }
function patternPx(p){ return PATTERN_PX[patternGroup(p.type)][p.size] || PATTERN_PX[patternGroup(p.type)].medium; }
function patternOpacity(p){ return PATTERN_OPACITY[patternGroup(p.type)][p.strength] || PATTERN_OPACITY[patternGroup(p.type)].medium; }
function samePattern(a, b){
  return !!a && !!b && a.type === b.type && (a.type === 'none' || (a.size === b.size && a.strength === b.strength && (a.type !== 'emoji' || a.emoji === b.emoji)));
}
let customTheme = { dark:false, paper:'#EEF1ED', accent:'#3F6D64' };
const ACCENT_SWATCHES = ['#3F6D64','#2F6E9E','#A85A3A','#7C6FB5','#B5556F','#5F8F3E','#C98A2B','#4A6FA5'];
const DEFAULT_PAPER = { light:'#EEF1ED', dark:'#131719' };
function currentThemeColors(){
  if(theme === 'custom') return customTheme;   // may carry an optional danger color (from a saved seasonal theme)
  const t = findTheme(theme) || THEMES[0];
  return t.danger ? { dark: t.dark, paper: t.paper, accent: t.accent, danger: t.danger } : { dark: t.dark, paper: t.paper, accent: t.accent };
}
function isDarkTheme(){
  if(theme === 'custom') return themeInk(customTheme).dark;
  const t = findTheme(theme); return !!(t && t.dark);
}
function relLuminance(hex){
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(h1, h2){
  const a = relLuminance(h1), b = relLuminance(h2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// soft text (dates, hints) must stay readable on every surface it can sit on, including tinted ones
function softInkFor(ink, paper, card, field, tintAlpha){
  const surfaces = [paper, card, field, mixHex(paper, ink, tintAlpha), mixHex(card, ink, tintAlpha), mixHex(paper, ink, PATTERN_SOFT_TEXT_TINT)];
  for(let amt = 0.4; amt > 0; amt -= 0.05){
    const c = mixHex(ink, paper, amt);
    if(surfaces.every(s => contrastRatio(c, s) >= 4.8)) return c;
  }
  return ink;
}
// text on an accent (or red) button: whichever of dark / white reads best on both colors
function onAccentFor(accent, coral){
  let best = '#14181A', bestScore = -1;
  ['#14181A', '#FFFFFF'].forEach(c => {
    const s = Math.min(contrastRatio(c, accent), contrastRatio(c, coral));
    if(s > bestScore){ bestScore = s; best = c; }
  });
  return best;
}
// Body text color for a page color. Normally light text in dark mode and dark text in light mode; but a custom page
// color picked against its mode (black page in Light, white page in Dark) would make text vanish, so then the mode
// that reads better wins (and pure black / white on a mid-gray page). Every preset and seasonal theme keeps its mode.
function themeInk(c){
  const paper = c.paper;
  const darkInk = mixHex(paper, '#000000', 0.88), lightInk = mixHex(paper, '#ffffff', 0.9);
  const mine = c.dark ? lightInk : darkInk;
  if(contrastRatio(mine, paper) >= 7) return { dark: !!c.dark, ink: mine };
  // score each choice on the page and on the card color that mode derives from it (most text sits on one of the two)
  const score = (dark, ink) => Math.min(contrastRatio(ink, paper),
    contrastRatio(ink, dark ? mixHex(paper, '#ffffff', 0.05) : mixHex(paper, '#ffffff', 0.55)));
  return [[true, lightInk], [false, darkInk], [true, '#ffffff'], [false, '#000000']]
    .map(([dark, ink]) => ({ dark, ink, r: score(dark, ink) }))
    .sort((a, b) => b.r - a.r)
    .map(({ dark, ink }) => ({ dark, ink }))[0];
}
// An accent picked (almost) the same as the page would hide links, tabs and buttons. Only then is it nudged toward
// the text color until it stands out (3:1). Every preset, seasonal theme and offered swatch is far above that.
function visibleAccent(accent, paper, card, ink){
  let a = accent;
  for(let amt = 0.1; amt <= 1 && Math.min(contrastRatio(a, paper), contrastRatio(a, card)) < 3; amt += 0.1) a = mixHex(accent, ink, Math.min(1, amt));
  return a;
}
const ACCENT_MIN_CONTRAST = 1.5;   // below this against the page the accent counts as invisible
function customVars(c){
  const paper = c.paper;
  const { dark, ink } = themeInk(c);
  const card = dark ? mixHex(paper, '#ffffff', 0.05) : mixHex(paper, '#ffffff', 0.55);
  const field = dark ? mixHex(paper, '#ffffff', 0.1) : '#FFFFFF';
  const accent = Math.min(contrastRatio(c.accent, paper), contrastRatio(c.accent, card)) < ACCENT_MIN_CONTRAST ? visibleAccent(c.accent, paper, card, ink) : c.accent;
  const [r, g, b] = hexToRgb(ink), [ar, ag, ab] = hexToRgb(accent);
  const coral = /^#[0-9a-fA-F]{6}$/.test(c.danger || '') ? c.danger : (dark ? '#F4A098' : '#9E352F');
  const [cr, cg, cb] = hexToRgb(coral);
  return {
    '--paper': paper,
    '--card': card,
    '--field': field,
    '--ink': ink,
    '--ink-soft': softInkFor(ink, paper, card, field, dark ? 0.09 : 0.07),
    '--line': `rgba(${r},${g},${b},${dark ? 0.15 : 0.13})`,
    '--tint': `rgba(${r},${g},${b},${dark ? 0.09 : 0.07})`,
    '--hover': `rgba(${r},${g},${b},${dark ? 0.07 : 0.05})`,
    '--overlay': dark ? 'rgba(0,0,0,0.65)' : `rgba(${r},${g},${b},0.4)`,
    '--warn-fg': dark ? '#F0C877' : '#7A5A17',
    '--mustard': dark ? '#E0A94A' : '#C98A2B',
    '--coral': coral,
    '--teal': accent,
    '--teal-light': `rgba(${ar},${ag},${ab},${dark ? 0.2 : 0.14})`,
    '--mustard-light': dark ? 'rgba(224,169,74,0.2)' : 'rgba(201,138,43,0.16)',
    '--coral-light': `rgba(${cr},${cg},${cb},${dark ? 0.2 : 0.14})`,
    '--on-accent': onAccentFor(accent, coral)
  };
}
const CUSTOM_VAR_KEYS = Object.keys(customVars({ dark:false, paper:'#EEF1ED', accent:'#3F6D64' }));
function themeChipHtml(t, extra){
  return `<button type="button" class="theme-opt${t.key === theme ? ' active' : ''}" aria-pressed="${t.key === theme}" onclick="setTheme('${t.key}')">
    <span class="theme-swatch" style="background:linear-gradient(135deg, ${t.paper} 0 45%, ${t.accent} 45% 100%)"></span>${t.label}${extra || ''}</button>`;
}
function themePickerHtml(){
  const all = THEMES.concat(theme === 'custom' ? [{ key:'custom', label:'Custom', paper: customTheme.paper, accent: customTheme.accent }] : []);
  return all.map(t => themeChipHtml(t)).join('');
}
function seasonalPickerHtml(){
  return SEASONAL_THEMES.map(t => themeChipHtml(t, ` <span class="theme-emoji" aria-hidden="true">${t.emoji}</span>`)).join('');
}
function renderThemePicker(){
  const el = document.getElementById('themePicker');
  if(el) el.innerHTML = themePickerHtml();
  const sea = document.getElementById('seasonalPicker');
  if(sea) sea.innerHTML = seasonalPickerHtml();
  renderSavedThemes();
}
function newThemeId(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function savablePattern(){
  const p = bgPattern;
  return { type:p.type, size:p.size, strength:p.strength, emoji:p.emoji };
}
function sameThemeColors(a, b){
  return !!a.dark === !!b.dark && a.paper.toLowerCase() === b.paper.toLowerCase() && a.accent.toLowerCase() === b.accent.toLowerCase();
}
// saved theme names: at most 24 characters, never cutting an emoji in half
function clipThemeName(s){ return Array.from(String(s || '').trim()).slice(0, 24).join('').trim(); }
// text inside a quoted attribute (escapeHtml leaves quotes alone)
function attrText(s){ return escapeHtml(s).replace(/"/g, '&quot;'); }
function renderSavedThemes(){
  const sec = document.getElementById('savedThemesSection');
  const el = document.getElementById('savedThemes');
  if(!sec || !el) return;
  sec.style.display = savedThemes.length ? '' : 'none';
  const cur = currentThemeColors();
  const isCur = t => sameThemeColors(t, cur) && (!t.pattern || samePattern(t.pattern, bgPattern));
  el.innerHTML = savedThemes.map(t => `<div class="theme-opt saved-opt${isCur(t) ? ' active' : ''}" data-saved-id="${t.id}">
    <button type="button" class="saved-apply" onclick="applySavedTheme('${t.id}')" title="Use “${attrText(t.name)}”"><span class="theme-swatch" style="background:linear-gradient(135deg, ${t.paper} 0 45%, ${t.accent} 45% 100%)"></span><span class="saved-name">${escapeHtml(t.name)}</span></button>
    <button type="button" class="saved-del" onclick="deleteSavedTheme('${t.id}')" aria-label="Delete ${attrText(t.name)}" title="Delete">✕</button></div>`).join('');
}
function setThemeMsg(text){
  const el = document.getElementById('ct_msg');
  if(el) el.textContent = text || '';
}
function saveCurrentTheme(){
  const input = document.getElementById('ct_name');
  const name = clipThemeName(input.value);
  if(!name){ setThemeMsg('Type a name first.'); input.focus(); return; }
  const c = currentThemeColors();
  const key = name.toLowerCase();
  const existing = savedThemes.findIndex(t => t.name.toLowerCase() === key);
  if(existing === -1 && savedThemes.length >= MAX_SAVED_THEMES){
    setThemeMsg(`You can keep up to ${MAX_SAVED_THEMES} themes. Delete one to make room.`);
    return;
  }
  if(existing !== -1) savedThemes.splice(existing, 1);
  const entry = { id: newThemeId(), name, dark: !!c.dark, paper: c.paper, accent: c.accent, pattern: savablePattern() };
  if(c.danger) entry.danger = c.danger;
  savedThemes.push(entry);
  input.value = '';
  saveSettings();
  renderSavedThemes();
  setThemeMsg(`Saved “${name}”`);
}
function applySavedTheme(id){
  const t = savedThemes.find(x => x.id === id);
  if(!t) return;
  customTheme = { dark: !!t.dark, paper: t.paper, accent: t.accent };
  if(t.danger) customTheme.danger = t.danger;
  theme = 'custom';
  // a saved theme remembers its pattern; older ones saved without one leave the current pattern alone
  if(t.pattern) bgPattern = Object.assign({}, t.pattern, { auto:false });
  else if(bgPattern.auto) bgPattern = defaultPattern();
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
  const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0,2);
  return parts.length ? parts.map(w=>Array.from(w)[0].toUpperCase()).join('') : '?';   // Array.from: never half an emoji
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
