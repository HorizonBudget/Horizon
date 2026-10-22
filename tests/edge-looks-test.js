// Edge cases for themes, custom colors, saved themes and background patterns: damaged saved settings, unreadable
// custom color picks (text and accent must stay readable), awkward saved-theme names, odd custom emoji input, every
// pattern on every theme. The layout side (long words, RTL, huge amounts, 320px, no fonts) is tests/edge-looks-audit.py.
const {ok, boot, finish} = require('./lib/h.js');
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// independent WCAG contrast (not the app's own)
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = h => { const c = rgb(h); return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = n => '#' + n.toString(16).padStart(6, '0');

(async () => {
  // ---------- 1. damaged saved settings never stop the app ----------
  const damaged = ['null', '[]', '"x"', '5', 'true', '{bad json', '{"theme":"custom"}', '{"theme":"__proto__"}', '{"theme":{"x":1}}',
    '{"theme":"custom","custom":{"paper":"red","accent":"#12"}}', '{"custom":{"paper":"#ffffff","accent":"#ffffff","danger":"javascript:x"},"theme":"custom"}',
    '{"savedThemes":{"a":1},"pattern":"stripes"}', '{"savedThemes":[null,5,"x",{"name":5},{"name":"ok","paper":"#fff","accent":"#000000"}]}',
    '{"pattern":{"type":"emoji","emoji":null,"size":"huge","strength":-1}}', '{"pattern":{"type":"constructor"}}', '{"side":{"x":1}}'];
  for(const raw of damaged){
    const errs = [];
    const w = boot({ ls: { ledgerSettings: raw }, hook: win => win.addEventListener('error', e => errs.push(e.message)) });
    let threw = '';
    try { w.render(); w.openSettingsModal('themes'); w.applyTheme(); } catch(e) { threw = e.message; }
    const t = w.eval('theme'), p = w.eval('JSON.stringify(bgPattern)');
    const goodTheme = t === 'custom' ? /^#[0-9a-fA-F]{6}$/.test(w.eval('customTheme.paper')) : !!w.findTheme(t);
    const goodPat = ['none', 'stripes', 'diagonal', 'dots', 'grid', 'emoji'].includes(JSON.parse(p).type);
    ok(!threw && !errs.length && goodTheme && goodPat && Array.isArray(w.eval('savedThemes')), 'damaged settings ' + raw + ' -> opens with theme ' + t + (threw || errs.join(' ')));
  }
  {
    const w = boot({ ls: { ledgerSettings: '{"custom":{"paper":"#ffffff","accent":"#ffffff","danger":"javascript:x"},"theme":"custom"}' } });
    ok(!w.eval('customTheme.danger') && !/javascript/.test(w.document.documentElement.getAttribute('style')), 'a bad saved danger color is dropped');
  }

  // ---------- 2. unreadable custom color picks stay readable ----------
  const w = boot(), d = w.document, root = d.documentElement;
  const v = k => root.style.getPropertyValue(k).trim();
  const setCustom = c => { w.eval(`customTheme=${JSON.stringify(c)}; theme='custom'; commitTheme();`); };
  // presets, seasonal themes and every offered swatch must look exactly as before
  const seasonal = JSON.parse(w.eval('JSON.stringify(SEASONAL_THEMES)'));
  ok(seasonal.every(t => w.themeInk(t).dark === t.dark && w.customVars(t)['--teal'] === t.accent), 'seasonal themes keep their own mode and accent');
  const swatches = JSON.parse(w.eval('JSON.stringify(ACCENT_SWATCHES)'));
  ok([false, true].every(dark => swatches.every(a => w.customVars({ dark, paper: dark ? '#131719' : '#EEF1ED', accent: a })['--teal'] === a)), 'offered accent swatches are never changed (light and dark)');
  ok(w.themeInk({ dark:false, paper:'#EEF1ED' }).ink === w.mixHex('#EEF1ED', '#000000', 0.88) && w.themeInk({ dark:true, paper:'#131719' }).ink === w.mixHex('#131719', '#ffffff', 0.9), 'normal custom pages keep the usual text color');

  const hard = [
    ['black page in Light mode', { dark:false, paper:'#000000', accent:'#3F6D64' }],
    ['white page in Dark mode', { dark:true, paper:'#FFFFFF', accent:'#3F6D64' }],
    ['mid-gray page, Light', { dark:false, paper:'#777777', accent:'#3F6D64' }],
    ['mid-gray page, Dark', { dark:true, paper:'#767676', accent:'#3F6D64' }],
    ['white accent on white page', { dark:false, paper:'#FFFFFF', accent:'#FFFFFF' }],
    ['black accent on black page', { dark:true, paper:'#000000', accent:'#000000' }],
    ['accent equal to page', { dark:false, paper:'#EEF1ED', accent:'#EEF1ED' }],
    ['pale yellow accent', { dark:false, paper:'#FFFFFF', accent:'#FFF3B0' }],
    ['navy page in Light mode', { dark:false, paper:'#0E1320', accent:'#0E1320' }]
  ];
  for(const [label, c] of hard){
    setCustom(c);
    const ink = v('--ink'), soft = v('--ink-soft'), paper = v('--paper'), card = v('--card'), field = v('--field'), teal = v('--teal'), on = v('--on-accent');
    const rs = [ratio(ink, paper), ratio(ink, card), ratio(soft, paper), ratio(soft, card)];
    ok(rs.every(r => r >= 4.5), `${label}: text ${rs.map(r => r.toFixed(2)).join(' / ')} (AA 4.5)`);
    // a mid-tone page cannot give every derived surface 4.5 at once; fields get a 4:1 floor (page and cards get AA)
    ok(ratio(ink, field) >= 4, `${label}: typing in a field ${ratio(ink, field).toFixed(2)}`);
    // button text on the accent is the existing dark-or-white choice; only checked here for the bold-text 3:1 floor
    ok(Math.min(ratio(teal, paper), ratio(teal, card)) >= 3 && ratio(on, teal) >= 3, `${label}: accent visible (${ratio(teal, paper).toFixed(2)}) and its button text ${ratio(on, teal).toFixed(2)}`);
    ok(w.isDarkTheme() === (lum(paper) < lum(ink)), `${label}: pills and logo follow the readable mode`);
    ok(d.getElementById('ct_paper').value.toLowerCase() === c.paper.toLowerCase() && d.getElementById('ct_accent').value.toLowerCase() === c.accent.toLowerCase(), `${label}: the color pickers still show what was picked`);
  }
  // a sweep of page colors in both modes: body text always AA
  let worst = 99, worstAt = '';
  for(let i = 0; i < 400; i++){
    const paper = hex((i * 2654435761) % 0x1000000);
    for(const dark of [false, true]){
      const vars = w.customVars({ dark, paper, accent:'#3F6D64' });
      const r = Math.min(ratio(vars['--ink'], paper), ratio(vars['--ink-soft'], paper), ratio(vars['--ink'], vars['--card']));
      if(r < worst){ worst = r; worstAt = paper + (dark ? ' dark' : ' light'); }
    }
  }
  // medium-tone pages (mid blue/purple/gray) cannot reach 4.5 for both page and cards with black or white text; the
  // app picks the better of the two. Before the readable-mode fix the worst here was 1.00 (text invisible).
  ok(worst >= 4.2, `800 random custom pages: body and soft text never below 4.2 (worst ${worst.toFixed(2)} at ${worstAt})`);

  // ---------- 3. saved theme names ----------
  w.eval(`savedThemes=[]; theme='light'; commitTheme();`);
  const save = name => { d.getElementById('ct_name').value = name; w.saveCurrentTheme(); };
  w.openSettingsModal('themes');
  save('My "x" <b>Fall</b> & co');
  const el = d.querySelector('#savedThemes .saved-apply');
  ok(!!el && el.getAttribute('title') === 'Use “My "x" <b>Fall</b> & co”' && !d.querySelector('#savedThemes b'), 'a name with quotes and HTML shows as plain text: ' + (el && el.getAttribute('title')));
  ok(d.querySelector('#savedThemes .saved-del').getAttribute('aria-label') === 'Delete My "x" <b>Fall</b> & co' && d.querySelectorAll('#savedThemes [onclick]').length === 2, 'the delete button label is intact and no extra handlers sneak in');
  save('" onclick="window.__pwn=1');
  d.querySelectorAll('#savedThemes .saved-apply').forEach(b => b.dispatchEvent(new w.MouseEvent('mouseover')));
  ok(!w.__pwn && d.querySelectorAll('#savedThemes [onclick]').length === 4, 'a name made to break out of the attribute stays text');
  save('🎃'.repeat(30));
  const em = w.eval('savedThemes[savedThemes.length-1].name');
  ok(Array.from(em).length === 24 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(em), 'a 30-emoji name is cut to 24 emoji without breaking one in half');
  save('   ');
  ok(d.getElementById('ct_msg').textContent === 'Type a name first.', 'a blank name is refused');
  const before = w.eval('savedThemes.length');
  save('MY "X" <B>FALL</B> & CO');
  ok(w.eval('savedThemes.length') === before, 'the same name in other capitals replaces the old one');
  w.eval('savedThemes=[]'); for(let i = 0; i < 12; i++) save('Theme ' + i);
  save('One too many');
  ok(w.eval('savedThemes.length') === 12 && /up to 12/.test(d.getElementById('ct_msg').textContent), 'the 13th theme is refused with a message');
  {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'same', name: i % 3 ? 'n' + i : '🎃'.repeat(30), paper:'#EEF1ED', accent:'#3F6D64' }));
    const w2 = boot({ ls: { ledgerSettings: JSON.stringify({ savedThemes: many }) } });
    const st = JSON.parse(w2.eval('JSON.stringify(savedThemes)'));
    ok(st.length === 12 && new Set(st.map(t => t.id)).size === 12 && st.every(t => Array.from(t.name).length <= 24), 'stored themes: capped at 12, ids made unique, names cut cleanly');
  }

  // ---------- 4. custom emoji input ----------
  const field = d.getElementById('pat_emoji');
  const typeEmoji = s => { field.value = s; w.onCustomEmojiInput(); return field.value; };
  const fam = '👨‍👩‍👧‍👦', flagUS = '🇺🇸', flagGB = '🇬🇧', thumb = '👍🏽', rainbow = '🏳️‍🌈';
  w.setPatternType('none');
  const cases = [
    ['family (ZWJ)', fam, fam], ['two flags', flagUS + flagGB, flagUS + flagGB], ['skin tone', thumb, thumb], ['rainbow flag', rainbow, rainbow],
    ['letters and digits', 'abc123#*', ''], ['keycap', '1️⃣', ''], ['(c) (r) tm', '©®™', ''], ['one lone flag letter', '🇺', ''],
    ['emoji between words', 'hi 🦄 there', '🦄'], ['50 emoji', '🎄'.repeat(50), '🎄🎄🎄'], ['markup', '<svg onload=x>🦄</svg>', '🦄'],
    ['quotes and url bits', '"\');url(x)🦊', '🦊'], ['Arabic text', 'مرحبا', ''], ['spaces only', '   ', '']
  ];
  for(const [label, input, want] of cases){
    const got = typeEmoji(input);
    ok(got === want, `custom emoji, ${label}: kept “${got}”`);
  }
  ok(w.eval('bgPattern.emoji') === '🦊', 'text-only input never replaces the last good emoji');
  ok(w.sanitizeEmoji('x'.repeat(100000) + '🎃') === '' && w.sanitizeEmoji(null) === '' && w.sanitizeEmoji({}) === '', 'huge or non-text input is bounded and harmless');
  typeEmoji(fam + flagUS + thumb);
  const img = root.style.getPropertyValue('--pat-image');
  ok(root.getAttribute('data-pat') === 'emoji' && /^url\("data:image\/svg\+xml,[^"'()<>\s]+"\)$/.test(img), 'family + flag + skin tone make a safe pattern tile');

  // ---------- 5. every pattern on every theme ----------
  const allKeys = JSON.parse(w.eval('JSON.stringify(allThemes().map(t=>t.key))'));
  const types = ['none', 'stripes', 'diagonal', 'dots', 'grid', 'emoji'];
  let combos = 0, bad = [];
  for(const k of allKeys.concat(['custom'])){
    if(k === 'custom') setCustom({ dark:true, paper:'#FFFFFF', accent:'#FFFFFF' }); else w.setTheme(k);
    for(const t of types) for(const s of ['small', 'large']) for(const st of ['subtle', 'bold']){
      combos++;
      try { w.setPatternType(t); w.setPatternSize(s); w.setPatternStrength(st); } catch(e) { bad.push(k + ' ' + t + ' ' + e.message); continue; }
      const op = parseFloat(root.style.getPropertyValue('--pat-opacity') || '0');
      if((t === 'none') !== !root.getAttribute('data-pat') || op > w.eval('PATTERN_MAX_OPACITY')) bad.push(`${k} ${t} ${s} ${st}`);
    }
  }
  ok(!bad.length, `${combos} theme x pattern x size x strength combinations apply cleanly ${bad.slice(0, 3).join(', ')}`);

  // ---------- 6. avatar initials ----------
  const ini = n => w.initials(n);
  ok(ini('👨‍👩‍👧‍👦🎉') === '👨' && ini('🎃 Sam') === '🎃S' && !/[\uD800-\uDFFF]/.test(ini('🎉🎉').replace(/🎉/g, '')), 'an emoji name gives a whole emoji as the avatar letter, not a broken �');
  ok(ini('   ') === '?' && ini('') === '?' && ini('مرحبا بالعالم') === 'مب' && ini('ann  marie') === 'AM', 'blank, right-to-left and double-spaced names');

  // ---------- 7. layout guard ----------
  ok(/\.month-pill\{[^}]*max-width:100%;[^}]*text-overflow:ellipsis/.test(css), 'a very long category name in a filter pill is cut with … instead of pushing the page sideways');

  finish();
})();
