// ============================================================
//  Profiles, identity and the "own profile only" courtesy lock
//  Every person in `people` has a stable id. Items still store the owner as the person's NAME, so a
//  rename rewrites item owners. This device remembers who you are by id (name kept as a fallback).
//  The lock is a courtesy, not security: there are no real accounts, so anyone with the household
//  code can change the data. It only stops accidental edits to someone else's profile.
// ============================================================
const NAME_MAX = 40;
const ADMIN_KEY = 'horizonProfilesUnlocked';
const LOCK_MSG = 'You can only change your own profile.';
let adminUnlockedFlag = lsGet(ADMIN_KEY) === '1';
function adminUnlocked(){ return adminUnlockedFlag; }

function samePid(a, b){ return a != null && b != null && String(a) === String(b); }
function newPersonId(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
// Older people have no id. Derive it from the name so every device that loads the same data agrees.
function legacyPersonId(name){
  let h = 5381;
  const t = String(name).trim().toLowerCase();
  for(let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return 'p_' + h.toString(36);
}
// Returns { people: copies that all have a unique id, assigned: true if any id had to be made up }.
function ensurePersonIds(list){
  const seen = new Set();
  let assigned = false;
  const out = (Array.isArray(list) ? list : []).filter(p => p && typeof p === 'object' && typeof p.name === 'string').map(p => {
    let id = p.id;
    if(id == null || id === '' || seen.has(String(id))){
      assigned = true;
      const base = legacyPersonId(p.name);
      id = base;
      for(let n = 2; seen.has(String(id)); n++) id = base + '_' + n;
    }
    seen.add(String(id));
    return Object.assign({}, p, { id });
  });
  return { people: out, assigned };
}

function personById(id){ return id == null ? null : (people.find(p => samePid(p.id, id)) || null); }
function personByName(name){
  const n = String(name || '').trim().toLowerCase();
  return n ? (people.find(p => String(p.name).trim().toLowerCase() === n) || null) : null;
}
function currentPerson(){ return personById(household.personId) || personByName(household.name); }
// Is this person the one signed in on this device? By id when we have one, otherwise by name.
function isMe(p){
  if(!p) return false;
  if(household.personId != null) return samePid(household.personId, p.id);
  return !!household.name && String(p.name).trim().toLowerCase() === String(household.name).trim().toLowerCase();
}
function canEditPerson(p){ return !!p && (isMe(p) || adminUnlocked()); }
function firstName(n){ return String(n || '').trim().split(/\s+/)[0] || ''; }

function saveSession(){
  if(!household.code) return;
  lsSet('ledgerHousehold', JSON.stringify({ code: household.code, name: household.name, personId: household.personId == null ? null : household.personId }));
}

// Trim, require something, cap the length, and keep names unique (ignoring upper/lower case).
function checkPersonName(raw, exceptId){
  const name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if(!name) return { error: 'Type a name first.' };
  if(name.length > NAME_MAX) return { error: `Names can be up to ${NAME_MAX} characters.` };
  const clash = people.find(p => !samePid(p.id, exceptId) && String(p.name).trim().toLowerCase() === name.toLowerCase());
  if(clash) return { error: `Someone in this household is already called “${clash.name}”. Pick a different name.` };
  return { name };
}

function createPerson(name){
  const p = { id: newPersonId(), name, photo: null };
  people.push(p);
  return p;
}

// Changes a person's name and every item that lists them as owner (active, completed and deleted).
// Returns { ok, error?, changed? }. Only your own profile, unless profile management is unlocked.
function renamePerson(id, rawName){
  const p = personById(id);
  if(!p) return { ok: false, error: 'That profile no longer exists.' };
  if(!canEditPerson(p)) return { ok: false, error: LOCK_MSG, blocked: true };
  const chk = checkPersonName(rawName, p.id);
  if(chk.error) return { ok: false, error: chk.error };
  const oldName = p.name, newName = chk.name;
  if(oldName === newName) return { ok: true, changed: false };
  const wasMe = isMe(p);
  const touched = [];
  items.forEach(it => { if(it.owner === oldName){ it.owner = newName; touched.push(it.id); } });
  p.name = newName;
  if(wasMe){ household.name = newName; household.personId = p.id; saveSession(); }
  const sel = document.getElementById('f_owner');
  if(sel && sel.value === oldName) populateOwnerSelect(newName);
  logActivity(wasMe ? `${oldName} is now called ${newName}` : `${household.name} renamed ${oldName} to ${newName}`);
  render();
  showToast(`Name changed to ${newName}`, () => {
    const q = personById(id);
    if(!q || q.name !== newName) return;
    const back = checkPersonName(oldName, q.id);
    if(back.error){ askAlert(back.error); return; }
    const mine = isMe(q);
    q.name = oldName;
    items.forEach(it => { if(touched.includes(it.id) && it.owner === newName) it.owner = oldName; });
    if(mine){ household.name = oldName; saveSession(); }
    logActivity(`${household.name} undid the name change`);
    render();
    refreshAdminListIfOpen();
  });
  return { ok: true, changed: true };
}

function setPersonPhoto(id, data){
  const p = personById(id);
  if(!p) return false;
  if(!canEditPerson(p)) return false;
  p.photo = data || null;
  logActivity(`${household.name} ${data ? 'updated' : 'removed'} ${p.name}'s photo`);
  render();
  refreshAdminListIfOpen();
  return true;
}
function removePersonPhoto(id){ return setPersonPhoto(id, null); }

// Adding and removing people is only for an unlocked device (people normally appear by signing in).
function addPerson(rawName){
  if(!adminUnlocked()) return { ok: false, error: LOCK_MSG, blocked: true };
  const chk = checkPersonName(rawName, null);
  if(chk.error) return { ok: false, error: chk.error };
  const p = createPerson(chk.name);
  logActivity(`${household.name} added ${p.name} to the household`);
  render();
  return { ok: true, person: p };
}
// Removing a person only takes them off the household list. Items keep the name as plain-text owner, so
// nothing else changes and nothing is lost. Returns { ok, person, index } so it can be undone.
function removePerson(id){
  if(!adminUnlocked()) return { ok: false, error: LOCK_MSG, blocked: true };
  const index = people.findIndex(x => samePid(x.id, id));
  if(index < 0) return { ok: false, error: 'That profile no longer exists.' };
  const p = people[index];
  if(isMe(p)) return { ok: false, error: 'You can’t remove the profile you’re signed in as on this device.' };
  people.splice(index, 1);
  logActivity(`${household.name} removed ${p.name} from the household`);
  render();
  return { ok: true, person: p, index };
}

// ---- Matching this device to a profile --------------------------------------------------
// After every sync: follow the person by id (so a rename elsewhere carries over), fall back to the
// name, and if neither matches ask which profile is yours.
function reconcileIdentity(){
  if(!household.code || document.getElementById('app').style.display !== 'block') return;
  const p = personById(household.personId) || personByName(household.name);
  if(p){
    if(!samePid(household.personId, p.id) || household.name !== p.name){
      household.personId = p.id; household.name = p.name;
      saveSession();
    }
    return;
  }
  promptIdentityChoice();
}
let identityPrompting = false;
async function promptIdentityChoice(){
  if(identityPrompting || chooseResolve) return;
  identityPrompting = true;
  try {
    const p = await chooseProfile(household.name);
    if(p){ household.name = p.name; household.personId = p.id; saveSession(); render(); }
  } finally { identityPrompting = false; }
}

let chooseResolve = null;
function chooseProfile(prefill){
  if(chooseResolve){ const r = chooseResolve; chooseResolve = null; r(null); }
  const list = document.getElementById('chooseList');
  list.innerHTML = people.length
    ? people.map(p => `<button type="button" class="chooser-btn" data-pid="${escapeHtml(String(p.id))}" onclick="chooseDone(this.dataset.pid)">${avatarHtml(p.name)}<span>${escapeHtml(p.name)}</span></button>`).join('')
    : '<div class="empty">No profiles yet.</div>';
  document.getElementById('chooseNewName').value = prefill || '';
  document.getElementById('chooseError').textContent = '';
  document.getElementById('chooseOverlay').style.display = 'flex';
  return new Promise(res => { chooseResolve = res; });
}
function chooseDone(pid){
  document.getElementById('chooseOverlay').style.display = 'none';
  const r = chooseResolve; chooseResolve = null;
  if(r) r(pid == null ? null : personById(pid));
}
function chooseCreate(){
  const chk = checkPersonName(document.getElementById('chooseNewName').value, null);
  if(chk.error){ document.getElementById('chooseError').textContent = chk.error; return; }
  const p = createPerson(chk.name);
  logActivity(`${p.name} joined the household`);
  chooseDone(p.id);
}

// ---- Header button + Your profile page ----------------------------------------------------
function updateIdentityUi(){
  if(!household.code) return;
  const me = currentPerson();
  const name = me ? me.name : household.name;
  const label = document.getElementById('hhCodeLabel');
  if(label) label.textContent = 'Signed in as ' + name;
  const av = document.getElementById('profileBtnAvatar');
  if(av) av.innerHTML = avatarHtml(name);
  const avc = document.getElementById('profileBtnAvatarCompact');
  if(avc) avc.innerHTML = avatarHtml(name);
  const nm = document.getElementById('profileBtnName');
  if(nm) nm.textContent = firstName(name);
  const pb = document.getElementById('profileBtn');
  if(pb) pb.setAttribute('aria-label', 'Your profile: ' + name);
  const pbc = document.getElementById('profileBtnCompact');
  if(pbc) pbc.setAttribute('aria-label', 'Your profile: ' + name);
  if(document.getElementById('profileOverlay').style.display === 'flex') refreshProfileModal(false);
}

function openProfileModal(){
  if(!currentPerson()){ promptIdentityChoice(); return; }
  refreshProfileModal(true);
  document.getElementById('profileOverlay').style.display = 'flex';
}
function closeProfileModal(){
  document.getElementById('profileOverlay').style.display = 'none';
}
function refreshProfileModal(resetInput){
  const me = currentPerson();
  if(!me) return;
  document.getElementById('profileBigAvatar').innerHTML = avatarHtml(me.name, 'xl');
  document.getElementById('profileHeroName').textContent = me.name;
  document.getElementById('profileChangePhoto').textContent = me.photo ? 'Change photo' : 'Add photo';
  document.getElementById('profileRemovePhoto').style.display = me.photo ? '' : 'none';
  if(resetInput){
    document.getElementById('profileNameInput').value = me.name;
    document.getElementById('profileNameError').textContent = '';
  }
  const others = people.filter(p => !isMe(p));
  document.getElementById('memberList').innerHTML = others.length
    ? others.map(p => `<div class="person-row">${avatarHtml(p.name)}<span class="person-name">${escapeHtml(p.name)}</span></div>`).join('')
    : '<div class="empty">No one else has joined yet. Share your household code from Settings.</div>';
}
function saveMyName(){
  const me = currentPerson();
  const err = document.getElementById('profileNameError');
  if(!me){ err.textContent = 'Pick your profile first.'; return; }
  const r = renamePerson(me.id, document.getElementById('profileNameInput').value);
  if(!r.ok){ err.textContent = r.error; try { document.getElementById('profileNameInput').focus(); } catch(e) {} return; }
  err.textContent = '';
  if(r.changed) closeProfileModal();   // so the Undo message is visible
}
function changeMyPhoto(){
  const inp = document.getElementById('profilePhotoFile');
  inp.value = '';
  inp.click();
}
function onProfilePhotoChosen(){
  const inp = document.getElementById('profilePhotoFile');
  const file = inp.files && inp.files[0];
  inp.value = '';
  const me = currentPerson();
  if(!file || !me) return;
  cropPhotoFile(file, data => setPersonPhoto(me.id, data));
}
function removeMyPhoto(){
  const me = currentPerson();
  if(me) removePersonPhoto(me.id);
}

// ---- Manage all profiles (unlocked by tapping the version line 7 times in Settings → Advanced) ----
let versionTaps = [];
function onVersionTap(){
  const now = Date.now();
  versionTaps.push(now);
  versionTaps = versionTaps.slice(-7);
  if(versionTaps.length === 7 && now - versionTaps[0] <= 4000){
    versionTaps = [];
    if(!adminUnlocked()) unlockAdmin();
  }
}
function unlockAdmin(){
  adminUnlockedFlag = true;
  lsSet(ADMIN_KEY, '1');
  refreshAdminRow();
  showToast('Profile management unlocked on this device.');
}
function lockAdmin(){
  adminUnlockedFlag = false;
  lsDel(ADMIN_KEY);
  versionTaps = [];
  closeAdminModal();
  refreshAdminRow();
  showToast('Profiles are locked again.');
}
function refreshAdminRow(){
  const row = document.getElementById('adminRow');
  if(row) row.style.display = adminUnlocked() ? '' : 'none';
}
function openAdminModal(){
  if(!adminUnlocked()) return;
  renderAdminList();
  document.getElementById('adminError').textContent = '';
  document.getElementById('p_name').value = '';
  document.getElementById('peopleOverlay').style.display = 'flex';
}
function closeAdminModal(){
  document.getElementById('peopleOverlay').style.display = 'none';
  populateOwnerSelect(document.getElementById('f_owner').value);
}
function refreshAdminListIfOpen(){
  if(document.getElementById('peopleOverlay').style.display === 'flex') renderAdminList();
}
function renderAdminList(){
  const wrap = document.getElementById('peopleList');
  if(!people.length){ wrap.innerHTML = '<div class="empty">No one yet. Add a person below.</div>'; return; }
  wrap.innerHTML = people.map(p => `
    <div class="person-row admin-person${isMe(p) ? ' me' : ''}" data-pid="${escapeHtml(String(p.id))}">
      <div class="admin-person-top">
        ${avatarHtml(p.name)}
        <input type="text" class="admin-name" value="${escapeHtml(p.name)}" maxlength="${NAME_MAX}" aria-label="Name" onkeydown="if(event.key==='Enter'){event.preventDefault();adminRename(this);}">
        <button type="button" class="icon-btn" onclick="adminRename(this)">Save name</button>
      </div>
      <div class="admin-person-actions">
        <button type="button" class="icon-btn" onclick="changePersonPhoto(this.closest('.person-row').dataset.pid)">${p.photo ? 'Change photo' : 'Add photo'}</button>
        ${p.photo ? `<button type="button" class="icon-btn" onclick="removePersonPhoto(this.closest('.person-row').dataset.pid)">Remove photo</button>` : ''}
        ${isMe(p) ? '' : `<button type="button" class="icon-btn person-remove" onclick="adminRemove(this)">Remove person</button>`}
      </div>
      <p class="field-error" role="alert"></p>
    </div>`).join('');
}
function adminRename(btn){
  const row = btn.closest('.person-row');
  const err = row.querySelector('.field-error');
  const r = renamePerson(row.dataset.pid, row.querySelector('.admin-name').value);
  if(!r.ok){ err.textContent = r.error; return; }
  renderAdminList();
}
function adminAddFromForm(){
  const err = document.getElementById('adminError');
  const r = addPerson(document.getElementById('p_name').value);
  if(!r.ok){ err.textContent = r.error; return; }
  err.textContent = '';
  document.getElementById('p_name').value = '';
  renderAdminList();
}
function adminRemove(btn){
  const row = btn.closest('.person-row');
  const p = personById(row.dataset.pid);
  if(!p) return;
  if(isMe(p)){ askAlert('You can’t remove the profile you’re signed in as on this device.'); return; }
  askConfirm({
    title: `Remove ${p.name}?`,
    message: `${p.name} will be taken off the household list. Their items keep ${p.name}’s name as plain text, so nothing is lost. They can come back by signing in with the same name.`,
    confirmLabel: 'Remove person', danger: true
  }).then(ok => {
    if(!ok) return;
    const r = removePerson(p.id);
    if(!r.ok){ askAlert(r.error); return; }
    renderAdminList();
    showToast(`Removed ${r.person.name} from the household`, () => {
      if(personById(r.person.id) || personByName(r.person.name)) return;
      people.splice(Math.min(r.index, people.length), 0, r.person);
      logActivity(`${household.name} undid removing ${r.person.name}`);
      render();
      refreshAdminListIfOpen();
    });
  });
}

// Photos for other people (unlocked devices only) go through this shared file input.
let photoTargetId = null;
function changePersonPhoto(id){
  const p = personById(id);
  if(!canEditPerson(p)) return;
  photoTargetId = id;
  const inp = document.getElementById('p_rowPhoto');
  inp.value = '';
  inp.click();
}
function onRowPhotoChosen(){
  const inp = document.getElementById('p_rowPhoto');
  const file = inp.files && inp.files[0];
  const id = photoTargetId;
  inp.value = '';
  if(!file || id == null) return;
  cropPhotoFile(file, data => setPersonPhoto(id, data));
}
