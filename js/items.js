const SUGGESTIONS = [
  {name:'Car registration renewal', category:'Vehicle', cost:150},
  {name:'Tires', category:'Vehicle', cost:600},
  {name:'Oil change / service', category:'Vehicle', cost:90},
  {name:'HVAC filter / service', category:'Home', cost:120},
  {name:'Gutter cleaning', category:'Home', cost:180},
  {name:'Property tax', category:'Home', cost:1200},
  {name:'School supplies', category:'Kids', cost:150},
  {name:'Sports registration & gear', category:'Kids', cost:200},
  {name:'Summer camp', category:'Kids', cost:400},
  {name:'Dental cleanings', category:'Health', cost:150},
  {name:'Glasses / contacts', category:'Health', cost:250},
  {name:'Holiday gifts', category:'Holidays & Gifts', cost:500},
  {name:'Birthdays this year', category:'Holidays & Gifts', cost:300},
  {name:'Annual software/subscriptions', category:'Subscriptions', cost:200},
  {name:'Annual family trip', category:'Travel', cost:1000},
];

function updateHouseholdTitle(){
  document.getElementById('hhTitle').textContent = householdName || 'Our household';
  document.getElementById('hhTitleCompact').textContent = householdName || 'Our household';
  document.title = (householdName ? householdName + ' · ' : '') + 'Horizon';
}
function onHouseholdNameInput(){
  householdName = document.getElementById('settingsHhName').value.trim();
  updateHouseholdTitle();
  render();
}

function setGateError(msg){ document.getElementById('gateError').textContent = msg || ''; }

// resume: { personId } when this is an automatic sign-in from a remembered session on this device.
async function enterApp(resume){
  const btn = document.getElementById('gateBtn');
  setGateError('');
  const code = document.getElementById('householdCode').value.trim().toUpperCase().replace(/\s+/g, '-');
  const name = document.getElementById('yourName').value.trim();
  const typedHhName = document.getElementById('householdNameInput').value.trim();
  if(!code || !name){
    setGateError('Add a household code and your name to continue.');
    return;
  }
  if(!/^[A-Z0-9_-]{6,40}$/.test(code)){
    setGateError('Household codes are 6–40 letters, numbers or dashes, like MAPLE-HARBOR-4827.');
    return;
  }
  household = { code, name, personId: null };
  householdName = '';
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  try {
    if(cloudConfigured()){
      const remote = await cloudConnect(code);
      if(remote){
        const st = stateFromDoc(remote);
        applyState(st);
        // when ids had to be made up, leave lastJson empty so they are saved back for everyone
        cloud.lastJson = st.idsAssigned ? '' : stableJson(snapshotState());
      }
      cloud.mode = 'cloud';
      cloud.ready = true;
    } else {
      cloud.mode = 'local';
    }
  } catch(e){
    cloudDisconnect();
    setGateError(friendlyCloudError(e));
    btn.disabled = false;
    btn.textContent = 'Open household board';
    return;
  }
  btn.disabled = false;
  btn.textContent = 'Open household board';
  if(!householdName && typedHhName) householdName = typedHhName;   // an existing household's name wins
  // Who is this? Remembered id first, then the typed name (ignoring upper/lower case). A new name makes a
  // new profile. An automatic sign-in that matches nobody (renamed or removed elsewhere) asks instead.
  let person = (resume && resume.personId != null) ? personById(resume.personId) : null;
  if(!person) person = personByName(name);
  if(!person && resume){
    person = await chooseProfile(name);
    if(!person){
      cloudDisconnect();
      household = { code: '', name: '', personId: null };
      setGateError('Pick or create your profile to continue.');
      return;
    }
  }
  if(!person){
    person = createPerson(name);
    logActivity(`${person.name} joined the household`);
  }
  household.name = person.name;
  household.personId = person.id;
  document.getElementById('yourName').value = person.name;
  saveSession();
  purgeTrash();   // anything deleted over 30 days ago goes now; the render below syncs it
  updateHouseholdTitle();
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  setCloudStatus(cloud.mode === 'cloud' ? 'ok' : 'local');
  render();
  maybeShowInstallHint();
  checkWhatsNew(!!resume);
}

function logActivity(text){
  activity.unshift({ text, time: new Date() });
  activity = activity.slice(0, 6);
}

function timeAgo(t){
  const secs = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000));
  if(isNaN(secs) || secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if(hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

function openItemModal(prefill){
  editingId = prefill && prefill.id ? prefill.id : null;
  document.getElementById('modalTitle').textContent = editingId ? 'Edit item' : 'Add a budget item';
  document.getElementById('f_name').value = prefill ? prefill.name : '';
  document.getElementById('nameHint').innerHTML = '';
  // no name typed yet for a brand-new item, so don't lock the category to a fixed default —
  // let the first alphabetical option show until a name suggests a real category
  populateCategorySelect(prefill ? prefill.category : null);
  populateSubcategoryField(prefill ? prefill.category : null, prefill ? (prefill.subcategory||'') : '');
  document.getElementById('f_cost').value = prefill ? prefill.cost : '';
  costManuallyEdited = !!(prefill && prefill.cost);
  categoryManuallyPicked = !!prefill;
  monthListExpanded = false;
  populateMonthSelect(prefill ? prefill.month : 'No date yet');
  populateOwnerSelect(prefill ? (prefill.owner||'') : '');
  document.getElementById('f_link').value = prefill ? itemLink(prefill) : '';
  document.getElementById('f_note').value = prefill ? itemNote(prefill) : '';
  document.getElementById('linkError').textContent = '';
  setRepeatFields(prefill ? normalizeRepeat(prefill.repeat) : null);
  const isDone = !!(prefill && prefill.completed && editingId);
  document.getElementById('actualRow').style.display = isDone ? '' : 'none';
  document.getElementById('f_actual').value = isDone && hasActualCost(prefill) ? prefill.actualCost : '';
  document.getElementById('removeItemBtn').style.display = editingId ? '' : 'none';
  document.getElementById('itemOverlay').style.display = 'flex';
}
function closeItemModal(){ document.getElementById('itemOverlay').style.display = 'none'; }

function saveItem(){
  const name = document.getElementById('f_name').value.trim();
  let category = document.getElementById('f_category').value;
  const cost = parseFloat(document.getElementById('f_cost').value) || 0;
  const month = document.getElementById('f_month').value || 'No date yet';
  const existing = editingId ? findLiveItem(editingId) : null;
  const saved = existing ? existing.saved : 0;
  const owner = document.getElementById('f_owner').value;
  const note = document.getElementById('f_note').value.trim().slice(0, 500);

  if(!name || !cost){
    askAlert('Give the item a name and an estimated cost.');
    return;
  }

  const link = normalizeLinkInput(document.getElementById('f_link').value);
  if(link === null){
    const err = document.getElementById('linkError');
    err.textContent = "That doesn't look like a web address. Put plain text in Note.";
    const inp = document.getElementById('f_link');
    inp.focus();
    if(err.scrollIntoView) err.scrollIntoView({ block:'nearest' });
    return;
  }

  const rp = readRepeatFields();
  if(rp.error){ askAlert(rp.error); return; }
  const repeat = rp.repeat;

  // the actual price only exists on completed items; empty clears it
  let actualCost;   // undefined = not applicable
  if(existing && existing.completed){
    const actualInput = document.getElementById('f_actual');
    const n = readAmountField(actualInput);
    if(Number.isNaN(n)){ askAlert('The actual price must be $0 or more. Leave it empty if you’d rather not say.'); return; }
    actualCost = n;   // null = cleared
  }

  if(category === 'Other'){
    const newCat = document.getElementById('f_newCategory').value.trim();
    if(!newCat){
      askAlert('Type a name for the new category, then hit Add.');
      return;
    }
    if(!CATEGORIES.includes(newCat)) CATEGORIES.push(newCat);
    category = newCat;
  }

  // subcategory: only read it if the person actually opened that field
  let subcategory = '';
  const subWrapOpen = document.getElementById('subcategoryFieldWrap').style.display !== 'none';
  if(subWrapOpen){
    const subSelectVisible = document.getElementById('f_subcategorySelect').style.display !== 'none';
    if(subSelectVisible){
      const subVal = document.getElementById('f_subcategorySelect').value;
      if(subVal === 'Other'){
        subcategory = document.getElementById('f_newSubcategory').value.trim();
      } else {
        subcategory = subVal; // '' means "None"
      }
    } else {
      subcategory = document.getElementById('f_subcategoryText').value.trim();
    }
  }
  if(subcategory){
    if(!SUBCATEGORIES[category]) SUBCATEGORIES[category] = [];
    if(!SUBCATEGORIES[category].includes(subcategory)) SUBCATEGORIES[category].push(subcategory);
  }

  // someone else may have removed this item while the edit window was open
  if(editingId && !findLiveItem(editingId)) editingId = null;
  if(editingId){
    const it = findLiveItem(editingId);
    const before = JSON.parse(JSON.stringify(it));
    Object.assign(it,{ name, category, cost, month, saved, owner, link, note, subcategory });
    if(repeat) it.repeat = repeat; else delete it.repeat;
    if(actualCost !== undefined){ if(actualCost === null) delete it.actualCost; else it.actualCost = actualCost; }
    logActivity(`${household.name} updated “${name}”`);
    closeItemModal();
    render();
    const id = it.id;
    showToast(`Saved changes to “${truncText(name, 40)}”.`, () => {
      const cur = items.find(i => i.id === id);
      if(!cur) return;
      Object.keys(cur).forEach(k => { delete cur[k]; });
      Object.assign(cur, before);
      logActivity(`${household.name} undid the changes to “${before.name}”`);
      render();
    });
    return;
  } else {
    const fresh = { id: Date.now()+Math.random(), name, category, cost, month, saved, owner, link, note, subcategory, completed:false };
    if(repeat) fresh.repeat = repeat;
    items.push(fresh);
    logActivity(`${household.name} added “${name}” — $${cost}`);
  }
  closeItemModal();
  render();
}

// Soft delete: the item stays in the array, marked with when it was removed.
function deleteItem(id){
  const it = findLiveItem(id);
  if(!it) return;
  it.deletedAt = Date.now();
  logActivity(`${household.name} removed “${it.name}”`);
  render();
  showToast(`Removed “${truncText(it.name, 40)}”.`, () => {
    const cur = items.find(i => i.id === id && isDeleted(i));
    if(!cur) return;
    delete cur.deletedAt;
    logActivity(`${household.name} undid removing “${cur.name}”`);
    render();
  });
}

// "Remove item" button inside the edit window: ask first, then remove and close.
function requestRemoveItem(){
  const it = editingId ? findLiveItem(editingId) : null;
  if(!it) return Promise.resolve(false);
  const id = it.id;
  return askConfirm({
    title: 'Remove item?',
    message: `Remove “${it.name}”? You can restore it from Settings → Deleted items for ${TRASH_DAYS} days.`,
    confirmLabel: 'Remove', danger: true
  }).then(ok => {
    if(!ok) return false;
    closeItemModal();
    deleteItem(id);
    return true;
  });
}

function editItem(id){
  const it = findLiveItem(id);
  if(!it) return;
  openItemModal(it);
}
