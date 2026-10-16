// Seasonal themes + background patterns: definitions, WCAG AA contrast, emoji sanitizing, per-device persistence,
// saved themes, reset, the pattern layer (never takes clicks), and nothing leaking into the synced Firestore data.
const {JSDOM, html, sleep, ok, boot, finish} = require('./lib/h.js');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

// ---- independent WCAG helpers (deliberately not the app's own) ----
const parse = c => {
  c = c.trim();
  if(c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const m = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return [m[0], m[1], m[2], m[3] === undefined ? 1 : m[3]];
};
const over = (fg, bg, a) => { const f = parse(fg), b = Array.isArray(bg) ? bg : parse(bg); const al = a === undefined ? f[3] : a; return [0, 1, 2].map(i => f[i] * al + b[i] * (1 - al)).concat([1]); };
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(Array.isArray(a) ? a : parse(a)), y = lum(Array.isArray(b) ? b : parse(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const w = boot(), d = w.document, $ = id => d.getElementById(id);
  const ev = s => w.eval(s);
  const root = d.documentElement;
  const cssvar = k => root.style.getPropertyValue(k).trim();
  const lsSettings = win => JSON.parse(win.localStorage.getItem('ledgerSettings') || '{}');

  // ---------- 1. definitions ----------
  const seasonal = JSON.parse(ev('JSON.stringify(SEASONAL_THEMES)'));
  const wantLabels = ['Halloween', 'Autumn', 'Christmas', 'Winter', 'Valentine’s', 'Spring', 'Summer', 'Fourth of July'];
  ok(wantLabels.every(l => seasonal.some(t => t.label === l)), 'all 8 seasonal themes defined: ' + seasonal.map(t => t.label).join(', '));
  const keys = seasonal.map(t => t.key);
  const presetKeys = JSON.parse(ev('JSON.stringify(THEMES.map(t=>t.key))'));
  ok(new Set(keys).size === keys.length && keys.every(k => /^[a-z0-9]+$/.test(k) && !presetKeys.includes(k) && k !== 'custom'), 'seasonal keys are unique, plain and do not clash with presets or custom');
  ok(seasonal.every(t => /^#[0-9a-fA-F]{6}$/.test(t.paper) && /^#[0-9a-fA-F]{6}$/.test(t.accent) && typeof t.dark === 'boolean' && t.label && t.emoji), 'each has paper, accent, dark, label, emoji');
  ok(seasonal.every(t => t.pattern && t.pattern.type === 'emoji' && ['small', 'medium', 'large'].includes(t.pattern.size) && ['subtle', 'medium', 'bold'].includes(t.pattern.strength) && w.sanitizeEmoji(t.pattern.emoji) === t.pattern.emoji), 'each has a valid default pattern');
  const defaults = Object.fromEntries(seasonal.map(t => [t.key, t.pattern.emoji]));
  ok(defaults.halloween === '🎃' && defaults.christmas === '🎄' && defaults.valentine === '💗' && defaults.winter === '❄️' && defaults.spring === '🌷' && defaults.summer === '☀️' && defaults.autumn === '🍂', 'sensible default emoji (Halloween 🎃, Christmas 🎄, Valentine’s 💗 ...)');
  ok(seasonal.some(t => t.dark) && seasonal.some(t => !t.dark), 'the set has both light and dark themes');
  ok(ev('THEMES.length') === 6, 'the six existing presets are untouched');

  // markup: own labeled group in the Themes tab
  w.openSettingsModal('themes');
  const pane = $('settingsPane-themes');
  const labels = [...pane.querySelectorAll('.setting-label')].map(e => e.textContent.trim());
  ok(labels.includes('Presets') && labels.includes('Seasonal') && labels.includes('Background pattern') && labels.indexOf('Presets') < labels.indexOf('Seasonal'), 'Themes tab has Presets, Seasonal and Background pattern groups: ' + labels.join(' | '));
  const chips = [...d.querySelectorAll('#seasonalPicker .theme-opt')];
  ok(chips.length === 8 && chips.every(c => /^setTheme\('[a-z0-9]+'\)$/.test(c.getAttribute('onclick'))), 'Seasonal group shows 8 theme buttons');
  ok(d.querySelectorAll('#themePicker .theme-opt').length === 6, 'Presets group still shows the 6 presets');
  ok(chips.map(c => c.textContent.replace(/\s+/g, ' ').trim()).join('|').includes('Halloween') && !!d.querySelector('#seasonalPicker .theme-swatch'), 'chips have a color swatch and label');

  // ---------- 2. contrast (WCAG AA 4.5:1) in every seasonal theme ----------
  const AA = 4.5;
  let contrastFails = [];
  let contrastChecks = 0;
  const check = (theme, what, a, b) => { contrastChecks++; const r = ratio(a, b); if(r < AA) contrastFails.push(`${theme}: ${what} = ${r.toFixed(2)}`); };
  const maxOpacity = ev('PATTERN_MAX_OPACITY');
  for(const t of seasonal){
    w.setTheme(t.key);
    ok(root.getAttribute('data-theme') === t.key, t.key + ': data-theme set');
    const v = k => cssvar(k);
    const need = ['--paper', '--card', '--field', '--ink', '--ink-soft', '--line', '--tint', '--hover', '--overlay', '--warn-fg', '--mustard', '--coral', '--teal', '--teal-light', '--mustard-light', '--coral-light', '--on-accent'];
    ok(need.every(k => v(k)), t.key + ': every color variable is set (derived from the 3 base colors)');
    ok(root.style.colorScheme === (t.dark ? 'dark' : 'light'), t.key + ': color-scheme ' + (t.dark ? 'dark' : 'light'));
    const P = parse(v('--paper')), C = parse(v('--card')), F = parse(v('--field'));
    const ink = parse(v('--ink'));
    const patPaper = over(v('--ink'), P, maxOpacity);              // strongest pattern pixel an ink-colored emoji / stripe can make
    const T = t.key;
    for(const [n, bg] of [['paper', P], ['card', C], ['field', F], ['paper+pattern', patPaper], ['card+tint', over(v('--tint'), C)], ['paper+tint', over(v('--tint'), P)], ['card+hover', over(v('--hover'), C)]]){
      check(T, 'ink on ' + n, v('--ink'), bg);
      check(T, 'soft ink on ' + n, v('--ink-soft'), bg);
    }
    // accent as text (links, active tab, chip hover) on every surface it appears on
    for(const [n, bg] of [['paper', P], ['card', C], ['field', F], ['paper+pattern', patPaper], ['card+accent tint', over(v('--teal-light'), C)], ['card+hover', over(v('--hover'), C)]]) check(T, 'accent text on ' + n, v('--teal'), bg);
    // accent buttons (.seg.active, add button, ...): text on accent, and hover (opacity .9 over the page)
    check(T, 'on-accent text on accent button', v('--on-accent'), v('--teal'));
    for(const [n, back] of [['card', C], ['paper', P]]){
      check(T, 'accent button hover on ' + n, over(v('--on-accent'), back, 0.9), over(v('--teal'), back, 0.9));
    }
    // primary button and active pill: paper text on ink, plus hover (.88)
    check(T, 'primary button (paper on ink)', v('--paper'), v('--ink'));
    for(const [n, back] of [['card', C], ['paper', P]]) check(T, 'primary button hover on ' + n, over(v('--paper'), back, 0.88), over(v('--ink'), back, 0.88));
    // toast: paper text on ink
    check(T, 'toast text', v('--paper'), v('--ink'));
    // danger buttons: outline (coral text) incl. hover tint, solid (on-accent on coral) incl. hover
    for(const [n, bg] of [['card', C], ['paper', P], ['field', F], ['card+coral tint', over(v('--coral-light'), C)]]) check(T, 'danger text on ' + n, v('--coral'), bg);
    check(T, 'danger solid button text', v('--on-accent'), v('--coral'));
    check(T, 'danger solid hover', over(v('--on-accent'), C, 0.9), over(v('--coral'), C, 0.9));
    // warning tag
    check(T, 'warning text on warning tint (card)', v('--warn-fg'), over(v('--mustard-light'), C));
    check(T, 'warning text on warning tint (paper)', v('--warn-fg'), over(v('--mustard-light'), P));
    // the colored tags / month pills / owner chips are computed in JS from the theme's light or dark mode
    const sets = JSON.parse(ev(`JSON.stringify([].concat(PALETTE, Object.values(FIXED_CATEGORY_HEX), OWNER_HEX).filter((h,i,a)=>a.indexOf(h)===i).map(h=>colorSet(h)))`));
    sets.forEach(s => { check(T, 'tag ' + s.solid + ' on card', s.fg, over(s.bg, C)); check(T, 'tag ' + s.solid + ' on paper', s.fg, over(s.bg, P)); });
    const neutral = JSON.parse(ev('JSON.stringify(neutralSet())'));
    check(T, 'neutral tag on card', neutral.fg, over(neutral.bg, C));
    // the pattern at every strength can never push text below AA (geometric and emoji, blended toward ink)
    for(const type of ['geo', 'emoji']) for(const s of ['subtle', 'medium', 'bold']){
      const o = ev(`PATTERN_OPACITY.${type}.${s}`);
      const bg = over(v('--ink'), P, o);
      check(T, `soft ink on page with ${type}/${s} pattern`, v('--ink-soft'), bg);
      check(T, `accent text on page with ${type}/${s} pattern`, v('--teal'), bg);
    }
  }
  ok(contrastFails.length === 0, `WCAG AA (4.5:1) holds for all ${contrastChecks} text/button/state checks across the ${seasonal.length} seasonal themes` + (contrastFails.length ? '\n   ' + contrastFails.slice(0, 25).join('\n   ') : ''));
  ok(ev('PATTERN_MAX_OPACITY') >= Math.max(...['geo', 'emoji'].flatMap(g => ['subtle', 'medium', 'bold'].map(s => ev(`PATTERN_OPACITY.${g}.${s}`)))), 'PATTERN_MAX_OPACITY covers every strength (so the contrast checks above are the worst case)');
  // the contrast fix in customVars also helps Custom themes: soft text on a custom theme passes too
  w.setCustomAccent('#3F6D64');
  ok(ratio(cssvar('--ink-soft'), cssvar('--paper')) >= AA && ratio(cssvar('--on-accent'), cssvar('--teal')) >= AA, 'Custom theme (Sage colors): soft ink and accent button also pass AA');

  // ---------- 3. emoji sanitizing ----------
  const san = s => w.sanitizeEmoji(s);
  ok(san('🎃') === '🎃' && san('🎃🎄') === '🎃🎄' && san('🎃🎄❄️') === '🎃🎄❄️', 'keeps 1-3 emoji');
  ok(san('🎃🎄❄️💗🌷') === '🎃🎄❄️', 'caps at 3 emoji');
  ok(san('❄️') === '❄️' && san('☀️') === '☀️' && san('👨‍👩‍👧') === '👨‍👩‍👧' && san('🇺🇸') === '🇺🇸' && san('👍🏽') === '👍🏽', 'keeps variation selectors, ZWJ sequences, flags and skin tones as one emoji');
  ok(san('abc 123 #*') === '' && san('') === '' && san('   ') === '', 'letters, digits, # * and blanks give nothing');
  ok(san('hi 🎃 there 🎄!') === '🎃🎄', 'strips text between emoji');
  ok(san('"><script>alert(1)</script>') === '' && san('"><script>🎃</script>') === '🎃', 'script-tag text is stripped');
  ok(san("'; } body { display:none } /*") === '' && san("🎃'; }") === '🎃', "'; } CSS breakout text is stripped");
  ok(san(')"; background:url(x)') === '' && san('\\') === '' && san('&amp;<>') === '', 'quotes, parens, backslash, ampersand, angle brackets are stripped');
  ok(san('‍️‍') === '' && san('‍🎃‍') === '🎃', 'stray ZWJ / variation selectors are dropped');
  ok(san('\u0000\u0007‮🎃') === '🎃' && san('\u{E0067}\u{E0062}') === '', 'control, bidi and tag characters are dropped');
  ok(san('©®™') === '' && san('1️⃣') === '', 'copyright-style symbols and keycaps are not accepted');
  const longStr = '🎃'.repeat(5000) + 'x'.repeat(100000);
  let t0 = Date.now(); const longOut = san(longStr);
  ok(longOut === '🎃🎃🎃' && Date.now() - t0 < 200, 'very long input is cut to 3 emoji quickly (' + (Date.now() - t0) + ' ms)');
  t0 = Date.now(); const zwj = san('🎃' + '‍🎃'.repeat(20000));
  ok(zwj.length <= 3 * 16 && Date.now() - t0 < 200, 'a giant ZWJ chain cannot make a giant value (' + zwj.length + ' chars)');
  ok(san(null) === '' && san(undefined) === '' && san(42) === '' && san({}) === '' && san(['🎃']) === '', 'non-strings give nothing');
  const hostile = ['"><script>alert(1)</script>🎃', "'); } body{display:none} /*🎃", '🎃"/><svg onload=alert(1)>', '🎃</text><script>x</script>', 'url(javascript:x)🎃', '🎃\\22 \\27 '];
  const uris = hostile.map(h => w.emojiTileUri(san(h), 68));
  ok(uris.every(u => /^data:image\/svg\+xml,[A-Za-z0-9%\-_.~!*]+$/.test(u)), 'tile URI is plain percent-encoded text (no quote, paren, space, <, >, backslash, semicolon) even for hostile input');
  ok(w.emojiTileUri('<script>', 68) === '' && w.emojiTileUri('', 68) === '', 'no emoji means no tile at all');
  // the SVG is well formed and contains only svg/g/text, with the emoji as the only text
  const svgText = decodeURIComponent(w.emojiTileUri('🎃🎄', 68).slice('data:image/svg+xml,'.length));
  const doc = new w.DOMParser().parseFromString(svgText, 'image/svg+xml');
  const tags = new Set([...doc.querySelectorAll('*')].map(e => e.tagName));
  ok(!doc.querySelector('parsererror') && [...tags].every(t => ['svg', 'g', 'text'].includes(t)), 'tile is well-formed SVG with only svg, g and text elements: ' + [...tags].join(','));
  ok([...doc.querySelectorAll('text')].every(t => /^[🎃🎄]$/u.test(t.textContent)) && !/on\w+=/i.test(svgText) && !/<script/i.test(svgText), 'tile text is only the emoji; no event handlers or scripts');
  ok(w.emojiTileUri('🎃', 1e9).length < 5000 && w.emojiTileUri('🎃', -5).length > 0, 'tile size is clamped');

  // what actually lands in CSS
  w.setPatternEmoji('"><script>🎃');
  const img = cssvar('--pat-image');
  ok(/^url\("data:image\/svg\+xml,[A-Za-z0-9%\-_.~!*]+"\)$/.test(img), '--pat-image is a single quoted data URI: ' + img.slice(0, 60) + '...');
  ok(ev('bgPattern.emoji') === '🎃', 'hostile custom emoji stored as just 🎃');
  ok(!/script|<|>/i.test(root.getAttribute('style') || '') || /^url/.test(img), 'root style attribute has no markup');
  // the hostile value straight in storage never reaches CSS either
  const wh = boot({ ls: { ledgerSettings: JSON.stringify({ theme: 'light', pattern: { type: 'emoji', size: 'medium', strength: 'medium', emoji: '"); } *{display:none} /*<script>' } }) } });
  ok(wh.eval('bgPattern.emoji') === '⭐' && /^url\("data:image\/svg\+xml,[A-Za-z0-9%\-_.~!*]+"\)$/.test(wh.document.documentElement.style.getPropertyValue('--pat-image').trim()), 'hostile emoji in saved settings falls back to a safe default');

  // ---------- 4. picking themes sets / removes patterns ----------
  w.resetTheme();
  ok(ev('bgPattern.type') === 'none' && !root.hasAttribute('data-pat'), 'start: no pattern');
  w.setTheme('halloween');
  ok(ev('bgPattern.type') === 'emoji' && ev('bgPattern.emoji') === '🎃' && root.getAttribute('data-pat') === 'emoji', 'Halloween brings 🎃');
  ok(cssvar('--pat-size') === '68px' && cssvar('--pat-opacity') === '0.12', 'default size/strength applied (' + cssvar('--pat-size') + ', ' + cssvar('--pat-opacity') + ')');
  w.setTheme('christmas');
  ok(ev('bgPattern.emoji') === '🎄', 'Christmas brings 🎄');
  w.setTheme('light');
  ok(ev('bgPattern.type') === 'none' && !root.hasAttribute('data-pat') && cssvar('--pat-image') === '', 'leaving a seasonal theme for Sage takes its untouched pattern away');
  // a pattern the person chose themselves is kept
  w.setPatternType('dots');
  w.setTheme('ocean'); ok(ev('bgPattern.type') === 'dots' && root.getAttribute('data-pat') === 'dots', 'own pattern (dots) stays when picking Ocean');
  w.setTheme('midnight'); ok(ev('bgPattern.type') === 'dots', '... and Midnight');
  w.setTheme('halloween'); ok(ev('bgPattern.emoji') === '🎃' && ev('bgPattern.type') === 'emoji', 'picking a seasonal theme applies its pattern');
  // changing a seasonal default makes it theirs
  w.setPatternType('grid');
  w.setTheme('dark'); ok(ev('bgPattern.type') === 'grid', 'a seasonal pattern the person changed stays when they leave the theme');
  w.setTheme('spring'); w.setPatternEmoji('🐾'); w.setTheme('warm');
  ok(ev('bgPattern.emoji') === '🐾' && ev('bgPattern.type') === 'emoji', 'a different emoji picked on a seasonal theme stays too');
  w.setPatternType('none'); w.setTheme('winter'); ok(ev('bgPattern.emoji') === '❄️', 'removing the pattern, then picking another seasonal theme brings that one');
  w.setPatternType('none'); ok(ev('bgPattern.type') === 'none' && !root.hasAttribute('data-pat'), 'None removes the pattern');
  // size / strength / each type
  for(const type of ['stripes', 'diagonal', 'dots', 'grid', 'emoji']){
    w.setPatternType(type);
    ok(root.getAttribute('data-pat') === type && cssvar('--pat-size') && cssvar('--pat-opacity'), 'type ' + type + ' sets data-pat, size and opacity');
  }
  w.setPatternType('dots');
  const sizes = ['small', 'medium', 'large'].map(s => { w.setPatternSize(s); return parseFloat(cssvar('--pat-size')); });
  ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], 'size small < medium < large: ' + sizes.join(', '));
  const strengths = ['subtle', 'medium', 'bold'].map(s => { w.setPatternStrength(s); return parseFloat(cssvar('--pat-opacity')); });
  ok(strengths[0] < strengths[1] && strengths[1] < strengths[2] && strengths[2] <= maxOpacity, 'strength subtle < medium < bold, never above the audited maximum: ' + strengths.join(', '));
  w.setPatternType('nonsense'); w.setPatternSize('huge'); w.setPatternStrength('loud');
  ok(ev('bgPattern.type') === 'dots' && ev('bgPattern.size') === 'large' && ev('bgPattern.strength') === 'bold', 'unknown type / size / strength values are ignored');
  // reset
  w.setTheme('halloween'); w.setPatternType('stripes'); w.setTheme('midnight');
  w.resetTheme();
  ok(ev('theme') === 'light' && ev('bgPattern.type') === 'none' && !root.hasAttribute('data-pat') && cssvar('--pat-opacity') === '', 'Reset to Sage clears the pattern too');
  ok(/onclick="resetTheme\(\)">Reset to Sage/.test(html), 'the Reset to Sage button calls resetTheme()');
  // customizing a seasonal theme keeps it a normal custom theme
  w.setTheme('halloween'); w.setCustomAccent('#2F6E9E');
  ok(ev('theme') === 'custom' && ev('customTheme.paper') === '#1B1026' && ev('customTheme.dark') === true, 'customizing a seasonal theme starts from its colors');

  // ---------- 5. UI controls ----------
  w.resetTheme(); w.openSettingsModal('themes');
  const preset = e => [...d.querySelectorAll('#patEmojiPresets .emoji-opt')].find(b => b.dataset.emoji === e);
  const vis = id => $(id).style.display !== 'none';
  ok(!vis('patOptions'), 'no size/strength/emoji controls while pattern is None');
  d.querySelector('#patTypes [data-pat-type="emoji"]').click();
  ok(vis('patOptions') && vis('patEmojiBox') && ev('bgPattern.type') === 'emoji', 'choosing Emoji reveals size, strength and emoji controls');
  ok(d.querySelectorAll('#patEmojiPresets .emoji-opt').length >= 10 && ['🎃', '🎄', '❄️', '🍂', '💗', '🌷', '☀️', '🎆', '⭐', '🐾'].every(e => !!preset(e)), 'preset emoji row has the 10 suggested emoji');
  preset('🐾').click();
  ok(ev('bgPattern.emoji') === '🐾' && preset('🐾').classList.contains('active'), 'clicking a preset emoji applies it and highlights it');
  d.querySelector('#patSize [data-pat-size="large"]').click(); d.querySelector('#patStrength [data-pat-strength="bold"]').click();
  ok(ev('bgPattern.size') === 'large' && ev('bgPattern.strength') === 'bold' && d.querySelector('#patSize .active').dataset.patSize === 'large', 'size and strength buttons work and show which is on');
  const field = $('pat_emoji');
  field.value = 'abc"><script>🎄x🌷y'; field.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(field.value === '🎄🌷' && ev('bgPattern.emoji') === '🎄🌷', 'custom emoji field cleans what is typed and applies it: ' + field.value);
  field.value = '🎃🎄❄️💗'; field.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(field.value === '🎃🎄❄️', 'custom field keeps at most 3 emoji');
  field.value = 'just text'; field.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(field.value === '' && ev('bgPattern.emoji') === '🎃🎄❄️', 'text with no emoji empties the field and leaves the last good emoji');
  ok(field.getAttribute('maxlength') && +field.getAttribute('maxlength') <= 60 && field.getAttribute('type') === 'text', 'custom field has a maxlength');
  ok(d.querySelector('#patEmojiPresets .emoji-opt.active') === null, 'no preset highlighted while a custom emoji is used');
  ok(!!d.querySelector('.pat-preview .pat-layer') && d.querySelector('.pat-preview').getAttribute('aria-hidden') === 'true', 'live preview box is present');
  // seasonal chip click through the real button
  d.querySelector('#seasonalPicker .theme-opt').click();
  ok(ev('theme') === 'halloween' && d.querySelector('#seasonalPicker .theme-opt.active') !== null && d.querySelector('#patTypes [data-pat-type="emoji"]').classList.contains('active') && preset('🎃').classList.contains('active'), 'clicking the Halloween chip: theme on, chip highlighted, pattern controls follow');

  // ---------- 6. persistence + migration ----------
  w.resetTheme(); w.setTheme('valentine'); w.setPatternSize('large'); w.setPatternStrength('subtle');
  let st = lsSettings(w);
  ok(st.theme === 'valentine' && st.pattern && st.pattern.type === 'emoji' && st.pattern.emoji === '💗' && st.pattern.size === 'large' && st.pattern.strength === 'subtle', 'pattern saved in ledgerSettings: ' + JSON.stringify(st.pattern));
  const w2 = boot({ ls: { ledgerSettings: w.localStorage.getItem('ledgerSettings') } });
  ok(w2.eval('theme') === 'valentine' && w2.eval('bgPattern.emoji') === '💗' && w2.eval('bgPattern.size') === 'large' && w2.document.documentElement.getAttribute('data-pat') === 'emoji', 'seasonal theme and pattern survive a reload');
  ok(w2.eval('bgPattern.auto') === false, 'after changing size, the pattern counts as the person’s own');
  const w2b = boot({ ls: { ledgerSettings: JSON.stringify({ theme: 'halloween', pattern: { type: 'emoji', size: 'medium', strength: 'medium', emoji: '🎃', auto: true } }) } });
  w2b.setTheme('light');
  ok(w2b.eval('bgPattern.type') === 'none', 'the "came with the theme" flag survives a reload');
  // old settings (no pattern fields at all)
  const old = JSON.stringify({ theme: 'warm', confirmOnRestore: false, custom: { dark: false, paper: '#EEF1ED', accent: '#3F6D64' }, savedThemes: [{ id: 'a1', name: 'Old one', dark: true, paper: '#111111', accent: '#abcdef' }] });
  const w3 = boot({ ls: { ledgerSettings: old } });
  ok(w3.eval('theme') === 'warm' && w3.eval('bgPattern.type') === 'none' && !w3.document.documentElement.hasAttribute('data-pat'), 'old saved settings load with no pattern');
  ok(w3.eval('savedThemes.length') === 1 && !w3.eval('savedThemes[0].pattern') && w3.eval('confirmOnRestore') === false, 'old saved themes load without a pattern, other settings intact');
  w3.openSettingsModal('themes');
  ok(w3.document.querySelectorAll('#savedThemes .saved-opt').length === 1, 'old saved theme is listed');
  w3.document.querySelector('#savedThemes .saved-apply').click();
  ok(w3.eval('theme') === 'custom' && w3.eval('customTheme.accent') === '#abcdef' && w3.eval('bgPattern.type') === 'none', 'applying an old saved theme still works and leaves the pattern alone');
  w3.setPatternType('stripes'); w3.document.querySelector('#savedThemes .saved-apply').click();
  ok(w3.eval('bgPattern.type') === 'stripes', 'a saved theme without a pattern keeps the pattern the person has');
  for(const bad of [null, 'x', 5, [], { type: 'zzz', size: 9, strength: {}, emoji: 7 }, { type: 'emoji', emoji: '🎃'.repeat(999) }]){
    const wb = boot({ ls: { ledgerSettings: JSON.stringify({ theme: 'light', pattern: bad }) } });
    const p = JSON.parse(wb.eval('JSON.stringify(bgPattern)'));
    ok(['none', 'stripes', 'diagonal', 'dots', 'grid', 'emoji'].includes(p.type) && ['small', 'medium', 'large'].includes(p.size) && ['subtle', 'medium', 'bold'].includes(p.strength) && wb.sanitizeEmoji(p.emoji) === p.emoji && p.emoji.length <= 48, 'garbage pattern ' + JSON.stringify(bad).slice(0, 40) + ' becomes a safe pattern');
  }
  const wc = boot({ ls: { ledgerSettings: '{not json' } });
  ok(wc.eval('bgPattern.type') === 'none', 'broken settings JSON still boots');
  const wd = boot({ noStorage: true });
  wd.setTheme('halloween'); wd.setPatternType('dots'); wd.resetTheme();
  ok(wd.eval('theme') === 'light', 'works when storage is blocked');
  const we = boot({ ls: { ledgerSettings: JSON.stringify({ theme: 'nope' }) } });
  ok(we.eval('bgPattern.type') === 'none' && ['light', 'dark'].includes(we.eval('theme')), 'unknown saved theme name falls back safely');

  // ---------- 7. saved themes remember the pattern ----------
  const ws = boot();
  ws.openSettingsModal('themes');
  ws.setTheme('christmas'); ws.setPatternSize('small');
  ws.document.getElementById('ct_name').value = 'My Xmas'; ws.saveCurrentTheme();
  let sv = lsSettings(ws).savedThemes;
  ok(sv.length === 1 && sv[0].pattern && sv[0].pattern.type === 'emoji' && sv[0].pattern.emoji === '🎄' && sv[0].pattern.size === 'small' && sv[0].paper === '#0C2016', 'saved theme stores colors and pattern: ' + JSON.stringify(sv[0].pattern));
  ok(!('auto' in sv[0].pattern), 'saved pattern has no theme flag');
  ws.resetTheme();
  ws.document.querySelector('#savedThemes .saved-apply').click();
  ok(ws.eval('theme') === 'custom' && ws.eval('bgPattern.emoji') === '🎄' && ws.eval('bgPattern.size') === 'small' && ws.eval('bgPattern.auto') === false && ws.document.documentElement.getAttribute('data-pat') === 'emoji', 'applying it brings the colors and the pattern back');
  ok(ws.document.querySelector('#savedThemes .saved-opt.active') !== null, 'saved theme shows as the active one');
  ws.setPatternType('grid');
  ok(ws.document.querySelector('#savedThemes .saved-opt.active') === null, 'changing the pattern un-highlights the saved theme (the pattern is part of it)');
  ws.setPatternType('none'); ws.document.getElementById('ct_name').value = 'Plain'; ws.saveCurrentTheme();
  ws.setTheme('ocean'); ws.setPatternType('dots');
  ws.document.querySelector('#savedThemes [data-saved-id]:nth-child(2) .saved-apply').click();
  ok(ws.eval('bgPattern.type') === 'none', 'a theme saved with "no pattern" removes the pattern when applied');
  const ws2 = boot({ ls: { ledgerSettings: ws.localStorage.getItem('ledgerSettings') } });
  ok(ws2.eval('savedThemes.length') === 2 && ws2.eval('savedThemes[0].pattern.emoji') === '🎄', 'saved themes keep their patterns after a reload');
  const wsh = boot({ ls: { ledgerSettings: JSON.stringify({ savedThemes: [{ id: 'z', name: 'Hostile', paper: '#111111', accent: '#222222', pattern: { type: 'emoji', emoji: '"><script>🎃', size: 'x', strength: 'y' } }] }) } });
  ok(wsh.eval('savedThemes[0].pattern.emoji') === '🎃' && wsh.eval('savedThemes[0].pattern.size') === 'medium', 'a hostile saved pattern is cleaned on load');

  // ---------- 8. the pattern layer: behind everything, takes no clicks ----------
  const start = css.indexOf('SECTION: seasonal-patterns');
  const end = css.indexOf('SECTION: sticky-scroll');
  const sec = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; { const re = /([^{}@]+)\{([^{}]*)\}/g; let m; while((m = re.exec(sec))) rules.push({ sel: m[1].trim().replace(/\s+/g, ' '), decl: m[2].replace(/\s+/g, ' ') }); }
  const layerRules = rules.filter(r => /body::before|\.pat-layer/.test(r.sel));
  const base = rules.find(r => r.sel === 'html[data-pat] body::before');
  ok(!!base && /position:\s*fixed/.test(base.decl) && /pointer-events:\s*none/.test(base.decl) && /z-index:\s*-?\d/.test(base.decl), 'html[data-pat] body::before is position:fixed, pointer-events:none, with a z-index');
  ok(+(base.decl.match(/z-index:\s*(-?\d+)/) || [])[1] <= 0, 'the layer sits behind the content (z-index ' + (base.decl.match(/z-index:\s*(-?\d+)/) || [])[1] + ')');
  const preview = rules.find(r => r.sel === '.pat-layer');
  ok(!!preview && /pointer-events:\s*none/.test(preview.decl), 'the preview layer takes no pointer events either');
  ok(!/background-attachment/.test(sec) && !/background-attachment:\s*fixed/.test(css), 'no background-attachment:fixed anywhere (broken on iPhone)');
  ok(layerRules.every(r => !/\bcursor\b|:hover|:active/.test(r.sel + r.decl)), 'layer rules have no hover/active/cursor behavior');
  ok(rules.filter(r => /^html\[data-pat=/.test(r.sel)).length >= 5 && ['stripes', 'diagonal', 'dots', 'grid', 'emoji'].every(t => rules.some(r => r.sel.includes(`html[data-pat="${t}"]`))), 'CSS draws all five pattern types');
  ok(!/\b(vw|100vw)\b/.test(sec) && !/transform:\s*(translate|rotate|scale)\((?!Z)/.test(sec), 'the layer uses no vw widths (no sideways scroll) and nothing that scrolls with the page');
  ok(rules.filter(r => /^html\[data-pat/.test(r.sel)).every(r => r.sel.split(',').every(s => /^html\[data-pat/.test(s.trim()))), 'every pattern rule is keyed on html[data-pat], so the sign-in screen gets it too');
  ok(!/#app|#gate/.test(sec.replace(/\/\*[\s\S]*?\*\//g, '')), 'pattern CSS does not depend on #app, so it also shows behind the sign-in screen');
  // the real DOM: no element that could sit above the page and catch taps
  const pl = d.querySelector('.pat-layer');
  ok(w.getComputedStyle(pl).pointerEvents === 'none' && w.getComputedStyle(pl).position === 'absolute', 'preview layer computes to pointer-events:none');
  ok(d.querySelectorAll('.pat-layer').length === 1 && pl.children.length === 0 && pl.parentElement.classList.contains('pat-preview'), 'the only pattern element in the DOM is the inert preview layer');

  // ---------- 9. the sign-in screen ----------
  const wg = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(win){ win.localStorage.setItem('ledgerSettings', JSON.stringify({ theme: 'halloween', pattern: { type: 'emoji', size: 'medium', strength: 'medium', emoji: '🎃' } })); } }).window;
  const gd = wg.document;
  ok(gd.getElementById('app').style.display !== 'block' && gd.getElementById('gate') && gd.documentElement.getAttribute('data-theme') === 'halloween' && gd.documentElement.getAttribute('data-pat') === 'emoji' && /^url\("data:/.test(gd.documentElement.style.getPropertyValue('--pat-image')), 'sign-in screen: theme and pattern are applied before sign-in');
  ok(gd.documentElement.style.getPropertyValue('--paper') === '#1B1026', 'sign-in screen uses the seasonal colors');

  // ---------- 10. nothing leaks into synced data ----------
  const store = {};
  const fake = () => ({ subscribe(code, cb){ setTimeout(() => cb(store[code] ? JSON.parse(JSON.stringify(store[code])) : null, false), 5); return () => {}; }, push(code, data){ store[code] = JSON.parse(JSON.stringify(data)); return Promise.resolve(); } });
  const wy = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(win){ win.__cloudAdapterFactory = fake; } }).window;
  await sleep(50);
  wy.document.getElementById('householdCode').value = 'PATTERN-TEST-1'; wy.document.getElementById('yourName').value = 'Sam';
  await wy.enterApp();
  wy.eval(`items.push({id:99,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:FUTURE_MONTHS[0],saved:0,owner:'',link:'',note:'',completed:false}); render();`);
  wy.setTheme('halloween'); wy.setPatternType('stripes'); wy.setPatternEmoji('🐾');
  wy.document.getElementById('ct_name').value = 'Pat'; wy.saveCurrentTheme();
  await sleep(800);
  const doc2 = store['PATTERN-TEST-1'];
  const allowed = ['items', 'people', 'activity', 'categories', 'subcategories', 'householdName', 'clientId', 'updatedAt'];
  ok(!!doc2 && Object.keys(doc2).every(k => allowed.includes(k)), 'synced household document has only the allowed fields: ' + Object.keys(doc2 || {}).join(','));
  ok(!/pattern|bgPattern|halloween|stripes|🐾|savedThemes|ledgerSettings/.test(JSON.stringify(doc2)), 'nothing about themes or patterns is in the synced document');
  const jsDir = path.join(ROOT, 'js');
  const users = fs.readdirSync(jsDir).filter(f => /bgPattern|savablePattern|applyPattern/.test(fs.readFileSync(path.join(jsDir, f), 'utf8')));
  ok(users.every(f => ['themes.js', 'settings.js', 'settings-modal.js'].includes(f)), 'pattern code lives only in themes.js, settings.js and settings-modal.js: ' + users.join(', '));
  ok(!/pattern/i.test(fs.readFileSync(path.join(jsDir, 'cloud.js'), 'utf8')) && !/pattern/i.test(fs.readFileSync(path.join(jsDir, 'household.js'), 'utf8')), 'cloud.js and household.js never mention patterns');
  ok(!/pattern/i.test(wy.eval('JSON.stringify(snapshotState())')), 'snapshotState() (what gets synced and backed up) has no pattern');
  // the form fields in the new controls: 16px on touch screens comes from the existing coarse-pointer rule
  ok(/@media \(pointer:coarse\)\{ input, select, textarea\{font-size:16px !important;\} \}/.test(css) && $('pat_emoji') && !/font-size/.test($('pat_emoji').getAttribute('style') || ''), 'custom emoji field gets 16px on touch screens (existing rule, no inline size)');

  finish();
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
