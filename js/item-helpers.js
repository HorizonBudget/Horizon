function isUrl(str){
  return /^https?:\/\//i.test(String(str || '').trim());
}

// Link/note getters. Old items kept either a URL or free text in `link`; text-only values
// are read as the note (nothing is rewritten until the item is saved again).
function itemLink(item){
  const l = (item && typeof item.link === 'string') ? item.link.trim() : '';
  return l && isUrl(l) ? l : '';
}
function itemNote(item){
  if(!item) return '';
  const n = typeof item.note === 'string' ? item.note.trim() : '';
  if(n) return n;
  const l = typeof item.link === 'string' ? item.link.trim() : '';
  return l && !isUrl(l) ? l : '';
}

// Returns '' (nothing typed), a clean http(s) URL, or null when the text is not a web address.
function normalizeLinkInput(raw){
  const t = String(raw || '').trim();
  if(!t) return '';
  if(/\s/.test(t)) return null;
  if(isUrl(t)){
    try{ const u = new URL(t); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? t : null; }
    catch(e){ return null; }
  }
  if(/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^/?#]*\.[^/?#]*:\d+/.test(t)) return null; // other scheme (javascript:, mailto:, ...)
  if(!t.includes('.') || /^[./]|^\.+$/.test(t)) return null;
  const cand = 'https://' + t;
  try{ const u = new URL(cand); return u.hostname && u.hostname.includes('.') ? cand : null; }
  catch(e){ return null; }
}

function escAttr(str){
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function truncText(str, n){
  str = String(str);
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function siteName(url){
  try{
    const h = new URL(url).hostname.replace(/^www\./i, '');
    if(h) return h;
  }catch(e){}
  return truncText(url.replace(/^https?:\/\//i, ''), 30);
}
// Chip for an http(s) URL. Everything is escaped here; non-http(s) input never becomes a link.
function linkChipHtml(url){
  if(!isUrl(url)) return escapeHtml(url);
  return `<a class="link-chip" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(url)}">${escapeHtml(siteName(url))}</a>`;
}
// Escapes note text and turns http(s) URLs inside it into chips (escaping happens per piece).
function linkifyNote(text){
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  let out = '', last = 0, m;
  while((m = re.exec(text)) !== null){
    let url = m[0], tail = '';
    for(;;){
      const c = url.slice(-1);
      if(/[.,;:!?\]}]/.test(c)){ tail = c + tail; url = url.slice(0, -1); continue; }
      if(c === ')' && (url.split(')').length > url.split('(').length)){ tail = c + tail; url = url.slice(0, -1); continue; }
      break;
    }
    let ok = false;
    try{ const u = new URL(url); ok = (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname; }catch(e){}
    out += escapeHtml(text.slice(last, m.index));
    out += ok ? linkChipHtml(url) + escapeHtml(tail) : escapeHtml(m[0]);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}
function itemLinkNoteHtml(item){
  const l = itemLink(item), n = itemNote(item);
  return (l ? `<div class="item-note"><span class="note-icon">🔗</span>${linkChipHtml(l)}</div>` : '')
       + (n ? `<div class="item-note item-note-text"><span class="note-icon">📝</span><span class="note-text">${linkifyNote(n)}</span></div>` : '');
}

function splitMonth(m){
  if(!m || m === 'No date yet') return ['TBD', 'no date'];
  const parts = m.trim().split(/\s+/);
  if(parts.length >= 2) return [parts[0], parts.slice(1).join(' ')];
  return [m, ''];
}

// Chronological key; "No date yet" and anything unreadable sort after every real month.
function monthSortKey(m){
  const p = parseMonth(m);
  return p ? p.y * 12 + p.m : Infinity;
}
function cmpMonth(a, b){
  const ka = monthSortKey(a), kb = monthSortKey(b);
  if(ka !== kb) return ka < kb ? -1 : 1;
  const na = a === 'No date yet' ? 1 : 0, nb = b === 'No date yet' ? 1 : 0;
  return na - nb;
}

// an item's category as filter text: old data may have none (null/missing), which must not break the board
function catKey(c){ return c == null ? '' : String(c); }

function renderCategoryFilter(){
  const wrap = document.getElementById('categoryFilter');
  wrap.innerHTML = '';
  const live = liveItems();
  const perCat = new Map();
  live.forEach(i => { const k = catKey(i.category); perCat.set(k, (perCat.get(k) || 0) + 1); });
  const cats = [...perCat.keys()].sort((a,b) => a.localeCompare(b));

  if(!cats.includes(activeCategoryFilter) && activeCategoryFilter !== 'All'){
    activeCategoryFilter = 'All';
  }

  const allPill = document.createElement('div');
  allPill.className = 'month-pill' + (activeCategoryFilter === 'All' ? ' active' : '');
  allPill.innerHTML = `All categories <span class="count">${live.length}</span>`;
  allPill.onclick = () => { activeCategoryFilter = 'All'; render(); };
  wrap.appendChild(allPill);

  cats.forEach(c => {
    const count = perCat.get(c);
    const cc = categoryColor(c);
    const isActive = activeCategoryFilter === c;
    const pill = document.createElement('div');
    pill.className = 'month-pill colored-pill' + (isActive ? ' active' : '');
    pill.style.background = isActive ? cc.solid : cc.bg;
    pill.style.borderColor = cc.border;
    pill.style.color = isActive ? '#fff' : cc.fg;
    pill.innerHTML = `${escapeHtml(c || 'No category')} <span class="count">${count}</span>`;
    pill.onclick = () => { activeCategoryFilter = c; render(); };
    wrap.appendChild(pill);
  });
}

function updateFilterNote(){
  const parts = [];
  if(activeCategoryFilter !== 'All') parts.push(activeCategoryFilter);
  const n = parts.length;
  document.getElementById('filtersBtnLabel').textContent = n ? `Filters · ${n}` : 'Filters';
  document.getElementById('filtersBtn').classList.toggle('active', n > 0);
  document.getElementById('filterNote').textContent = n ? `Showing ${parts.join(' · ')}` : '';
  document.getElementById('filterClear').style.display = n ? '' : 'none';
  document.getElementById('filterSummary').style.display = n ? '' : 'none';
}

// ---- Money, actual price and repeat helpers ----
function fmtMoney(n){
  n = Math.round((Number(n) || 0) * 100) / 100;
  const cents = Math.abs(n % 1) > 0.0001;
  return '$' + n.toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
}
// Big amounts are shortened for display from $10k up ($12,500 -> $12.5k, $1,250,000 -> $1.25M, $1e9 -> $1B),
// about three digits, no trailing ".0". Under $10k it is fmtMoney() unchanged. The data always keeps the exact amount.
const MONEY_SHORT_FROM = 10000;
function fmtMoneyShort(n){
  n = Math.round((Number(n) || 0) * 100) / 100;
  const abs = Math.abs(n);
  if(abs < MONEY_SHORT_FROM) return fmtMoney(n);
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  let i = units.findIndex(u => abs >= u[0]);
  let v = abs / units[i][0];
  let dec = v < 10 ? 2 : v < 100 ? 1 : 0;
  let r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
  if(r >= 1000 && i > 0){ i--; v = abs / units[i][0]; dec = 2; r = Math.round(v * 100) / 100; }   // $999,999 -> $1M, not $1000k
  return (n < 0 ? '-' : '') + '$' + String(r) + units[i][1];
}
// The amount as HTML: shortened on screen, the exact amount in the tooltip and for screen readers
function moneyHtml(n){
  const full = fmtMoney(n), short = fmtMoneyShort(n);
  if(short === full) return escapeHtml(full);
  return `<span class="money-short" title="${escAttr(full)}"><span aria-hidden="true">${escapeHtml(short)}</span><span class="sr-only">${escapeHtml(full)}</span></span>`;
}
// Reads a typed estimated cost: "$1,200.50", "1200.5", " 75 " all work. Returns null when empty, the amount in
// cents, or NaN for anything else (letters, a negative or over $1,000,000,000). Commas must group thousands.
function parseCostInput(raw){
  let t = String(raw == null ? '' : raw).replace(/\s+/g, '');
  if(!t) return null;
  t = t.replace(/^(-?)\$/, '$1');
  if(t.includes(',')){
    if(!/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) return NaN;
    t = t.replace(/,/g, '');
  }
  if(!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  const n = Number(t);
  if(!isFinite(n) || n < 0 || n > 1e9) return NaN;
  return Math.round(n * 100) / 100;
}
function hasActualCost(it){ return !!it && typeof it.actualCost === 'number' && isFinite(it.actualCost) && it.actualCost >= 0; }
// "$120 under" / "$30 over" compared with the forecast; '' when there's no actual price
function actualDiff(it){
  if(!hasActualCost(it)) return null;
  const d = Math.round(((Number(it.cost) || 0) - it.actualCost) * 100) / 100;
  if(d > 0) return { kind: 'under', text: fmtMoney(d) + ' under', amount: d, word: 'under' };
  if(d < 0) return { kind: 'over', text: fmtMoney(-d) + ' over', amount: -d, word: 'over' };
  return { kind: 'even', text: 'on forecast' };
}

const REPEAT_UNITS = ['week', 'month', 'year'];
// Returns a clean { every, unit } or null (no repeat / unreadable, so older items just don't repeat).
function normalizeRepeat(r){
  if(!r || typeof r !== 'object') return null;
  const every = Number(r.every);
  if(!Number.isInteger(every) || every < 1 || every > 99 || !REPEAT_UNITS.includes(r.unit)) return null;
  return { every, unit: r.unit };
}
function repeatLabel(r){
  r = normalizeRepeat(r);
  if(!r) return '';
  if(r.every === 1) return { week: 'Repeats weekly', month: 'Repeats monthly', year: 'Repeats yearly' }[r.unit];
  return `Repeats every ${r.every} ${r.unit}s`;
}
// The planner works by month, so a repeat moves the month on:
// months/years by calendar months, weeks by max(1, round(weeks*7/30)) months. "No date yet" stays put.
function repeatMonthStep(r){
  return r.unit === 'year' ? r.every * 12 : r.unit === 'month' ? r.every : Math.max(1, Math.round(r.every * 7 / 30));
}
function nextRepeatMonth(month, r){
  r = normalizeRepeat(r);
  if(!r) return month;
  return addMonthsToMonth(month, repeatMonthStep(r));
}
function setRepeatFields(r){
  const sel = document.getElementById('f_repeat');
  if(!r){ sel.value = ''; }
  else if(r.every === 1){ sel.value = r.unit; }
  else {
    sel.value = 'custom';
    document.getElementById('f_repeatEvery').value = r.every;
    document.getElementById('f_repeatUnit').value = r.unit;
  }
  if(sel.value !== 'custom'){ document.getElementById('f_repeatEvery').value = 1; document.getElementById('f_repeatUnit').value = 'month'; }
  onRepeatChange();
}
function readRepeatFields(){
  const v = document.getElementById('f_repeat').value;
  if(!v) return { repeat: null };
  if(v === 'custom'){
    const raw = document.getElementById('f_repeatEvery').value.trim();
    const n = Number(raw), unit = document.getElementById('f_repeatUnit').value;
    if(!/^\d+$/.test(raw) || n < 1 || n > 99) return { error: 'Repeat every needs a whole number from 1 to 99.' };
    if(!REPEAT_UNITS.includes(unit)) return { error: 'Pick weeks, months or years for the repeat.' };
    return { repeat: { every: n, unit } };
  }
  return REPEAT_UNITS.includes(v) ? { repeat: { every: 1, unit: v } } : { repeat: null };
}
function onRepeatEveryInput(){
  const n = Number(document.getElementById('f_repeatEvery').value);
  document.querySelectorAll('#f_repeatUnit option').forEach(o => { o.textContent = o.value + (n === 1 ? '' : 's'); });
  updateRepeatHint();
}
function onRepeatChange(){
  document.getElementById('repeatCustomRow').style.display = document.getElementById('f_repeat').value === 'custom' ? '' : 'none';
  onRepeatEveryInput();
}
function updateRepeatHint(){
  const rp = readRepeatFields();
  const hint = document.getElementById('repeatHint');
  if(!rp.repeat){ hint.textContent = ''; return; }
  const month = document.getElementById('f_month').value || 'No date yet';
  const next = nextRepeatMonth(month, rp.repeat);
  hint.textContent = (next === 'No date yet' ? 'When you check this off, a new one is added with no date.' : `When you check this off, a new one is added for ${next}.`)
    + (rp.repeat.unit === 'week' ? ' Horizon plans by month, so weekly repeats land in the next month.' : '');
}

// ---- Owner avatars on cards and to-do rows ----
// A photo is stored as a long data: URL. Putting that text into every card's HTML made the board slow to draw
// (each card parsed and decoded its own copy), so cards point at one short blob: URL per photo instead.
// Without blob support (or for anything that is not a data: URL) the photo is used as it is.
const photoUrlCache = new Map();
function photoSrc(photo){
  if(typeof photo !== 'string' || !/^data:/i.test(photo)) return photo;
  if(photoUrlCache.has(photo)) return photoUrlCache.get(photo);
  let url = photo;
  try {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(photo);
    if(m && m[2] && window.URL && URL.createObjectURL && window.Blob){
      const bin = atob(m[3]), bytes = new Uint8Array(bin.length);
      for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: m[1] || 'application/octet-stream' }));
    }
  } catch(e) { url = photo; }
  // forget photos nobody uses any more (a changed or removed photo), so old copies are not kept in memory
  if(photoUrlCache.size){
    const inUse = new Set(people.map(p => p.photo));
    photoUrlCache.forEach((u, p) => {
      if(inUse.has(p)) return;
      if(u !== p) try { URL.revokeObjectURL(u); } catch(e) {}
      photoUrlCache.delete(p);
    });
  }
  photoUrlCache.set(photo, url);
  return url;
}
// avatarHtml() (js/themes.js) with the short photo address; same markup otherwise
function cardAvatarHtml(name, size){
  const person = people.find(p => p.name === name);
  if(!person || !person.photo) return avatarHtml(name, size);
  const src = photoSrc(person.photo);
  if(src === person.photo) return avatarHtml(name, size);
  const cls = 'avatar' + (size === 'sm' ? ' avatar-sm' : size === 'lg' ? ' avatar-lg' : size === 'xl' ? ' avatar-xl' : '');
  return `<img class="${cls}" src="${escAttr(src)}" alt="${escapeHtml(name)}">`;
}
