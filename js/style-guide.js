// ---- Style guide: shows every visual element with sample data (nothing is saved) ----
function guidePillHtml(label, colors, active, count){
  const bg = active ? colors.solid : colors.bg;
  const fg = active ? '#fff' : colors.fg;
  return `<span class="month-pill guide-static" style="background:${bg}; border-color:${colors.border}; color:${fg};">${escapeHtml(label)}${count != null ? ` <span class="count">${count}</span>` : ''}</span>`;
}

function openStyleGuide(){
  closeSettingsModal();
  renderStyleGuide();
  document.getElementById('guideOverlay').style.display = 'flex';
}
function closeStyleGuide(){
  document.getElementById('guideOverlay').style.display = 'none';
  openSettingsModal('themes');
}

function renderStyleGuide(){
  const m = FUTURE_MONTHS;
  const body = document.getElementById('guideBody');
  const catList = sortedCategoryList();
  const sampleOwners = ['Dana', 'Sam', 'Alex', 'Jordan', 'Riley'];

  body.innerHTML = `
    <div class="setting-label">Theme (same setting as in Settings, so you can compare looks here)</div>
    <div class="theme-picker">${themePickerHtml()}</div>

    <div class="guide-section">
      <h4>Item cards</h4>
      <p class="guide-desc">Each card has the target month on the left, the name and tags in the middle, and the estimated cost on the right. The thin stripe on the left edge is the category color. Check the box on the first sample to watch the completion animation (it comes back afterward so you can replay it).</p>
      <div class="guide-label">Everything filled in</div>
      <div class="guide-list" id="guideCardsFull"></div>
      <div class="guide-label">Missing an owner and a month (warning flags appear)</div>
      <div class="guide-list" id="guideCardsMissing"></div>
      <div class="guide-label">With a note (a web address inside a note becomes a link)</div>
      <div class="guide-list" id="guideCardsNote"></div>
      <div class="guide-label">With both a link and a note</div>
      <div class="guide-list" id="guideCardsBoth"></div>
      <div class="guide-label">On the Completed tab (the checked box restores it)</div>
      <div class="guide-list" id="guideCardsDone"></div>
    </div>

    <div class="guide-section">
      <h4>Month colors</h4>
      <p class="guide-desc">Every month keeps its own color on its card badge and on its month heading. The first sample shows the solid version. "No date yet" stays gray.</p>
      <div class="guide-row">
        ${m.slice(0, 6).map((mo, i) => guidePillHtml(mo, monthColor(mo), i === 0, i + 1)).join('')}
        ${guidePillHtml('No date yet', monthColor('No date yet'), false, 2)}
      </div>
    </div>

    <div class="guide-section">
      <h4>Category colors</h4>
      <p class="guide-desc">Categories use the same filled-pill style, and the color also shows as the stripe on each card. New categories you create get their own color automatically.</p>
      <div class="guide-row">
        ${catList.map((c, i) => guidePillHtml(c, categoryColor(c), i === 0, null)).join('')}
      </div>
    </div>

    <div class="guide-section">
      <h4>People</h4>
      <p class="guide-desc">Each person keeps one color. Their initials show until they add a photo to their own profile (tap your name at the top of the board).</p>
      <div class="guide-row">
        ${sampleOwners.map(n => { const oc = ownerColor(n); return `<span class="owner-chip" style="background:${oc.bg}; color:${oc.fg}; margin-top:0;">${avatarHtml(n, 'sm')}${escapeHtml(n)}</span>`; }).join('')}
      </div>
    </div>

    <div class="guide-section">
      <h4>Tags and flags</h4>
      <p class="guide-desc">Gray tags describe the item. Yellow flags mean something is missing. Click Edit on the card to fill it in and the flag goes away.</p>
      <div class="guide-row">
        <span class="tag tag-cat">Category</span>
        <span class="tag tag-subcat">Subcategory</span>
        <span class="tag tag-warn">No owner</span>
        <span class="tag tag-warn">No month</span>
      </div>
    </div>

    <div class="guide-section">
      <h4>Summary cards</h4>
      <p class="guide-desc">These two cards follow the category filter and the search.</p>
      <div class="summary-strip" style="margin-bottom:0;">
        <div class="stat"><div class="stat-label">Items on Horizon</div><div class="stat-value mono">4</div><div class="stat-sub">across 3 categories</div></div>
        <div class="stat"><div class="stat-label">Total forecasted</div><div class="stat-value mono">$1,520</div><div class="stat-sub">across all future items</div></div>
      </div>
    </div>

    <div class="guide-section">
      <h4>Suggestion engine</h4>
      <p class="guide-desc">As you type an item name, the board suggests a category and a typical price. Try a few names here. Prices are rough US averages for planning, not quotes, and typos and plurals are handled.</p>
      <input type="text" id="guideEngineInput" placeholder="Try: hair dryer, refridgerator, dog food, braces" oninput="guideEngineTry(this.value)">
      <div class="guide-engine-out" id="guideEngineOut">Type an item name to see what the board would suggest.</div>
    </div>
  `;

  const sampleMonth = (i, fallback) => m[i] || fallback;
  const add = (id, item, opts) => document.getElementById(id).appendChild(buildItemCard(item, Object.assign({ preview: true }, opts || {})));

  add('guideCardsFull', { id: 'g1', name: 'Car registration renewal', category: 'Vehicle', subcategory: 'Honda Civic', cost: 150, month: sampleMonth(1, 'No date yet'), owner: 'Dana', repeat: { every: 1, unit: 'year' }, link: 'https://www.amazon.com/Some-Very-Long-Product-Name-Stainless-Steel-Edition/dp/B0123456789?tag=horizon-20&ref=sr_1_3&keywords=washing+machine+front+load' });
  add('guideCardsMissing', { id: 'g2', name: 'New washing machine', category: 'Home', subcategory: '', cost: 700, month: 'No date yet', owner: '', link: '' });
  add('guideCardsNote', { id: 'g3', name: 'Holiday gifts', category: 'Holidays & Gifts', subcategory: '', cost: 500, month: sampleMonth(2, 'No date yet'), owner: 'Sam', link: '', note: 'Ask the grandparents what they want first.\nIdeas: https://www.etsy.com/listing/123456/handmade-gift-set, then compare prices.' });
  add('guideCardsBoth', { id: 'g5', name: 'Family photo session', category: 'Holidays & Gifts', subcategory: '', cost: 300, month: sampleMonth(3, 'No date yet'), owner: 'Alex', link: 'https://example.com/book', note: 'Call to confirm the time first.' });
  add('guideCardsDone', { id: 'g4', name: 'Dental cleaning', category: 'Health', subcategory: '', cost: 150, month: sampleMonth(0, 'No date yet'), owner: 'Sam', link: '', actualCost: 135 }, { completedView: true });
}

function guideEngineTry(val){
  const out = document.getElementById('guideEngineOut');
  if(!val.trim()){ out.textContent = 'Type an item name to see what the board would suggest.'; return; }
  const s = suggestForName(val);
  out.innerHTML = s ? suggestionHintHtml(s) : 'No typical price on file for this one. You would pick a category and add your own estimate.';
}

// Plays the same strike, pop and collapse as a real completion, then brings the sample back.
function demoComplete(cb){
  const card = cb.closest('.item-card');
  if(!card || card.dataset.demoRunning) return;
  card.dataset.demoRunning = '1';
  card.classList.add('card-strike');
  setTimeout(() => {
    const h = card.scrollHeight;
    card.style.maxHeight = h + 'px';
    card.classList.add('card-pop');
    setTimeout(() => { card.classList.remove('card-pop'); card.classList.add('card-collapsed'); }, ANIM_POP_MS);
    setTimeout(() => {
      card.classList.remove('card-strike', 'card-collapsed');
      cb.checked = false;
      setTimeout(() => { card.style.maxHeight = ''; delete card.dataset.demoRunning; }, 800);
    }, ANIM_POP_MS + ANIM_COLLAPSE_MS + 700);
  }, ANIM_STRIKE_MS);
}
