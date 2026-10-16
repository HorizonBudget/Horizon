function paidHtml(item){
  const d = actualDiff(item);
  return `<div class="paid-line">Paid ${fmtMoney(item.actualCost)}</div><div class="paid-diff ${d.kind}">${escapeHtml(d.text)}</div>`;
}

function buildItemCard(item, opts){
  opts = opts || {};
  const oc = ownerColor(item.owner);
  const mc = monthColor(item.month);
  const [monthWord, monthYear] = splitMonth(item.month);

  const card = document.createElement('div');
  card.className = 'item-card';
  card.setAttribute('data-cat', item.category);
  card.setAttribute('data-item-id', item.id);
  card.style.setProperty('--cat-color', categoryColor(item.category).solid);

  let checkboxHtml;
  if(opts.preview && opts.completedView){
    checkboxHtml = `<input type="checkbox" class="complete-check restore-check" checked title="Restore checkbox (sample)" onchange="this.checked=true">`;
  } else if(opts.preview){
    checkboxHtml = `<input type="checkbox" class="complete-check" title="Try it: check to see the completion animation" onchange="demoComplete(this)">`;
  } else if(opts.completedView){
    checkboxHtml = `<input type="checkbox" class="complete-check restore-check" checked title="Mark as not complete" onchange="onRestoreCheckboxChange(${item.id}, this)">`;
  } else {
    checkboxHtml = `<input type="checkbox" class="complete-check" title="Mark complete" onchange="completeItem(${item.id})">`;
  }

  card.innerHTML = `
    ${checkboxHtml}
    <div class="card-body">
      <div class="card-side">
        <div class="month-badge" style="background:${mc.bg}; border-color:${mc.border};">
          <div class="month-badge-label" style="color:${mc.fg};">${escapeHtml(monthWord)}</div>
          <div class="month-badge-sub" style="color:${mc.fg};">${escapeHtml(monthYear)}</div>
        </div>
        ${item.owner ? `<span title="${escapeHtml(item.owner)}" style="display:inline-flex;">${avatarHtml(item.owner,'lg')}</span>` : ''}
      </div>
      <div class="item-main">
        <div class="item-top">
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="tag tag-cat">${escapeHtml(item.category)}</span>
          ${item.subcategory ? `<span class="tag tag-subcat">${escapeHtml(item.subcategory)}</span>` : ''}
          ${!opts.completedView && !item.owner ? `<span class="tag tag-warn" title="No one assigned yet">No owner</span>` : ''}
          ${!opts.completedView && item.month === 'No date yet' ? `<span class="tag tag-warn" title="No target month set">No month</span>` : ''}
          ${normalizeRepeat(item.repeat) ? `<span class="tag-repeat" role="img" aria-label="${escAttr(repeatLabel(item.repeat))}" title="${escAttr(repeatLabel(item.repeat))}">🔁</span>` : ''}
        </div>
        ${itemLinkNoteHtml(item)}
        <div class="item-actions">
          <button class="icon-btn" ${opts.preview ? 'disabled' : `onclick="editItem(${item.id})"`}>Edit</button>
        </div>
      </div>
    </div>
    <div class="item-amount">
      <div class="item-amount-value">${fmtMoney(item.cost)}</div>
      ${opts.completedView && hasActualCost(item) ? paidHtml(item) : ''}
    </div>
  `;
  return card;
}

function switchTab(tab){
  activeTab = tab;
  render();
}

const ANIM_STRIKE_MS = 650;
const ANIM_POP_MS = 220;
const ANIM_COLLAPSE_MS = 650;

// Checking an item opens a small dialog asking what was actually paid (optional).
// Mark complete = with whatever was typed, Skip = no amount, Cancel/Escape/backdrop = nothing happens.
function completeItem(id){
  const it = findLiveItem(id);
  if(!it || it.completed) return Promise.resolve(false);
  const uncheck = () => {
    const c = document.querySelector(`[data-item-id="${id}"] .complete-check`);
    if(c) c.checked = false;
  };
  return askConfirm({
    title: 'Mark complete',
    message: `“${it.name}” was forecast at ${fmtMoney(it.cost)}.`,
    amount: { label: 'What did you actually pay? (optional)' },
    confirmLabel: 'Mark complete', skipLabel: 'Skip', danger: false
  }).then(res => {
    if(!res){ uncheck(); return false; }
    let actual = null;
    if(res === true){
      const n = Number(String(confirmAmountValue).trim());
      if(String(confirmAmountValue).trim() !== '' && isFinite(n) && n >= 0) actual = Math.round(n * 100) / 100;
    }
    animateCompletion(id, () => finishCompleting(id, { actualCost: actual }));
    return true;
  });
}

// strike through the name, a quick pop, then collapse so the items below slide up
function animateCompletion(id, done){
  const card = document.querySelector(`[data-item-id="${id}"]`);
  if(!card){ done(); return; }
  card.classList.add('card-strike');
  setTimeout(() => {
    const h = card.scrollHeight;
    card.style.maxHeight = h + 'px';
    card.classList.add('card-pop');
    setTimeout(() => {
      card.classList.remove('card-pop');
      card.classList.add('card-collapsed');
    }, ANIM_POP_MS);
    setTimeout(done, ANIM_POP_MS + ANIM_COLLAPSE_MS);
  }, ANIM_STRIKE_MS);
}

// opts.actualCost: a number when the person said what they paid, otherwise nothing.
function finishCompleting(id, opts){
  opts = opts || {};
  const it = findLiveItem(id);
  if(!it || it.completed){ render(); return null; }
  const hasActual = typeof opts.actualCost === 'number' && isFinite(opts.actualCost) && opts.actualCost >= 0;
  it.completed = true;
  if(hasActual) it.actualCost = opts.actualCost; else delete it.actualCost;

  // a repeating item leaves a fresh copy behind, moved on by one step
  let copy = null;
  const rep = normalizeRepeat(it.repeat);
  if(rep){
    copy = {
      id: Date.now() + Math.random(), name: it.name, category: it.category, subcategory: it.subcategory || '',
      cost: it.cost, month: nextRepeatMonth(it.month, rep), saved: 0, owner: it.owner || '',
      link: it.link || '', note: it.note || '', repeat: { every: rep.every, unit: rep.unit }, completed: false
    };
    items.push(copy);
  }
  let text = `${household.name} marked “${it.name}” as complete`;
  if(hasActual) text += ` — paid ${fmtMoney(opts.actualCost)}`;
  if(copy) text += `; next one added for ${copy.month}`;
  logActivity(text);
  render();

  const copyId = copy ? copy.id : null;
  const short = truncText(it.name, 40);
  const msg = copy ? `“${short}” complete. Next one added for ${copy.month}.` : `“${short}” marked complete.`;
  showToast(msg, () => {
    const cur = items.find(i => i.id === id);
    if(cur){ cur.completed = false; delete cur.actualCost; }
    if(copyId !== null) items = items.filter(i => i.id !== copyId);
    logActivity(`${household.name} undid completing “${it.name}”`);
    render();
  });
  return copy;
}

let confirmOnRestore = true;

function onRestoreCheckboxChange(id, checkboxEl){
  if(confirmOnRestore){
    const it = findLiveItem(id);
    checkboxEl.checked = true;   // stays ticked until the person says yes
    askConfirm({
      title: 'Move back to Active?',
      message: `Move “${it ? it.name : 'this item'}” back to Active?`,
      confirmLabel: 'Move back', danger: false
    }).then(ok => { if(ok) restoreItem(id); });
    return;
  }
  restoreItem(id);
}

// Moving back to Active drops the actual price (an active item has none); Undo brings it back.
function restoreItem(id){
  const it = findLiveItem(id);
  if(!it) { render(); return; }
  const hadActual = hasActualCost(it), actual = it.actualCost;
  it.completed = false;
  delete it.actualCost;
  logActivity(`${household.name} restored “${it.name}” to active`);
  render();
  showToast(`“${truncText(it.name, 40)}” moved back to Active.`, () => {
    const cur = items.find(i => i.id === id);
    if(!cur) return;
    cur.completed = true;
    if(hadActual) cur.actualCost = actual;
    logActivity(`${household.name} undid restoring “${cur.name}”`);
    render();
  });
}
