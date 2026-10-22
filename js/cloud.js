// ============================================================
//  Cloud sync (Firebase Firestore). One document per household code.
//  The whole board (items, people, activity, categories) lives in that document.
// ============================================================
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const cloud = { mode: 'local', ready: false, adapter: null, unsub: null, timer: null, lastJson: '',
  held: false, heldBase: null, gen: 0, retry: null, inflight: '', heldCheck: null, fb: null,
  confirmedJson: '', confirmedState: null, cacheBase: '', cacheCur: '' };

function cloudConfigured(){
  return !!window.__cloudAdapterFactory || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

// JSON with sorted keys, so the same data always produces the same string
function stableJson(v){
  if(Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if(v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

function snapshotState(){
  return JSON.parse(JSON.stringify({
    items, people,
    activity: activity.map(a => ({ text: a.text, time: new Date(a.time).toISOString() })),
    categories: CATEGORIES,
    subcategories: SUBCATEGORIES,
    householdName
  }));
}
function stateFromDoc(d){
  const pl = ensurePersonIds(d.people);   // older data and old backups have people without ids
  return {
    idsAssigned: pl.assigned,
    items: Array.isArray(d.items) ? d.items : [],
    people: pl.people,
    activity: Array.isArray(d.activity) ? d.activity : [],
    categories: Array.isArray(d.categories) ? d.categories : null,
    subcategories: d.subcategories && typeof d.subcategories === 'object' ? d.subcategories : null,
    householdName: typeof d.householdName === 'string' ? d.householdName : ''
  };
}
function applyState(s){
  items = s.items;
  people = s.people;
  activity = s.activity.map(a => ({ text: a.text, time: new Date(a.time) })).slice(0, 6);
  if(s.categories) CATEGORIES = s.categories;
  if(s.subcategories) SUBCATEGORIES = s.subcategories;
  householdName = s.householdName || '';
  updateHouseholdTitle();
}

async function makeFirebaseAdapter(){
  if(cloud.fb) return cloud.fb;   // one Firestore instance per page, also across retries
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  // tests hand in a fake of the two Firebase modules (window.__firebaseModules); the real ones are never loaded there
  const [appM, fsM] = window.__firebaseModules || await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  let db;
  try {
    // keeps a local copy so the board still opens and accepts edits briefly offline
    db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  } catch(e){ db = fsM.getFirestore(app); }
  cloud.fb = {
    // includeMetadataChanges: with the offline copy, a server answer that matches the copy only changes
    // metadata.fromCache. Without this option Firestore sends no event for it, and a device waiting for the
    // server (quick resume) would wait forever.
    subscribe(code, onData, onError){
      return fsM.onSnapshot(fsM.doc(db, 'households', code), { includeMetadataChanges: true },
        snap => onData(snap.exists() ? snap.data() : null, snap.metadata.fromCache), onError);
    },
    // one-off read straight from the server (fails when offline); the safety net for quick resume
    fetch(code){ return fsM.getDocFromServer(fsM.doc(db, 'households', code)).then(snap => snap.exists() ? snap.data() : null); },
    push(code, data){ return fsM.setDoc(fsM.doc(db, 'households', code), data); }
  };
  return cloud.fb;
}
function getAdapter(){
  return window.__cloudAdapterFactory ? Promise.resolve(window.__cloudAdapterFactory()) : makeFirebaseAdapter();
}

const CACHE_ANSWER_WAIT = 4000;   // ms the normal sign-in waits for the server before using the phone's copy
function cloudConnect(code){
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => { if(!settled){ settled = true; clearTimeout(t); fn(v); } };
    const t = setTimeout(() => finish(reject, new Error('timeout')), 12000);
    try {
      cloud.adapter = await getAdapter();
      let synced = false, cacheWait = null;
      cloud.unsub = cloud.adapter.subscribe(code, (data, fromCache) => {
        if(!fromCache) synced = true;
        if(!settled){
          // an empty answer from the local cache isn't proof the household is new; wait for the server
          if(!data && fromCache) return;
          // the phone's own copy may be older than the server: use it only when offline, or when the
          // server is slow to answer
          if(fromCache && navigator.onLine !== false){
            clearTimeout(cacheWait);
            cacheWait = setTimeout(() => finish(resolve, data), CACHE_ANSWER_WAIT);
            return;
          }
          clearTimeout(cacheWait);
          finish(resolve, data); return;
        }
        if(fromCache && !synced) return;   // older copy from this phone; the server answer follows
        if(data && data.clientId !== clientId) cloudApplyRemote(data);
      }, err => {
        if(!settled) finish(reject, err);
        else setCloudStatus('err');
      });
    } catch(e){ finish(reject, e); }
  });
}
function cloudDisconnect(){
  try { if(cloud.unsub) cloud.unsub(); } catch(e) {}
  cloud.unsub = null; cloud.ready = false; cloud.adapter = null; cloud.lastJson = '';
  clearTimeout(cloud.timer); cloud.timer = null;
  cloud.gen++; cloud.held = false; cloud.heldBase = null; cloud.inflight = '';
  cloud.confirmedJson = ''; cloud.confirmedState = null; cloud.cacheBase = ''; cloud.cacheCur = '';
  clearTimeout(cloud.retry); cloud.retry = null;
  clearTimeout(cloud.heldCheck); cloud.heldCheck = null;
}
function friendlyCloudError(e){
  const code = e && e.code;
  if(code === 'permission-denied') return 'The shared database refused the request. Check that the security rules from the setup guide are published.';
  if(e && e.message === 'timeout') return 'Couldn’t reach the shared database. Check your connection and the Firebase settings in the app file, then try again.';
  return 'Couldn’t connect to the shared database' + (e && e.message ? ' (' + e.message + ')' : '') + '.';
}

function cloudApplyRemote(data){
  const remote = stateFromDoc(data);
  const j = stableJson(JSON.parse(JSON.stringify({
    items: remote.items, people: remote.people, activity: remote.activity,
    categories: remote.categories || CATEGORIES, subcategories: remote.subcategories || SUBCATEGORIES,
    householdName: remote.householdName
  })));
  if(j === cloud.lastJson && !remote.idsAssigned) return;
  clearTimeout(cloud.timer); cloud.timer = null;
  applyState(remote);
  cloud.lastJson = remote.idsAssigned ? '' : stableJson(snapshotState());
  if(cloud.lastJson){ markConfirmed(cloud.lastJson, snapshotState()); refreshBoardCache(); }
  reconcileIdentity();   // follow a rename made on another device, or ask if this profile is gone
  if(purgeTrash() || remote.idsAssigned){ render(); return; }   // expired deleted items / new ids are saved back
  renderCore();
  setCloudStatus('ok');
}

function cloudSchedulePush(){
  if(cloud.held){
    const local = snapshotState();
    saveBoardCache(household.code, cloud.heldBase, stableJson(local) === stableJson(cloud.heldBase) ? null : local);
    setCloudStatus('updating');
    return;
  }
  if(!cloud.ready) return;
  const cur = snapshotState(), now = stableJson(cur);
  if(now === cloud.lastJson && !cloud.inflight) markConfirmed(now, cur);
  refreshBoardCache(cur, now);
  if(now === cloud.lastJson) return;
  setCloudStatus('saving');
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(cloudFlush, 400);
}
function cloudFlush(){
  clearTimeout(cloud.timer); cloud.timer = null;
  if(!cloud.ready) return;
  const state = snapshotState();
  const j = stableJson(state);
  if(j === cloud.lastJson){ setCloudStatus('ok'); return; }
  cloud.lastJson = j;
  cloud.inflight = j;   // not "what the server has" until the save is confirmed
  const payload = JSON.parse(JSON.stringify(Object.assign({}, state, { clientId, updatedAt: new Date().toISOString() })));
  Promise.resolve(cloud.adapter.push(household.code, payload))
    .then(() => {
      if(cloud.inflight === j) cloud.inflight = '';
      if(!cloud.ready) return;
      markConfirmed(j, state); refreshBoardCache();
      if(!cloud.timer) setCloudStatus('ok');
    })
    .catch(() => {
      if(cloud.inflight === j) cloud.inflight = '';
      cloud.lastJson = '';
      setCloudStatus('err');
      clearTimeout(cloud.timer);
      cloud.timer = setTimeout(cloudFlush, 5000); // try again shortly
    });
}

function setCloudStatus(kind){
  const el = document.getElementById('syncPill');
  if(!el) return;
  // with no connection nothing can be "Synced". Edits are kept on this device and sent when it's back.
  if(kind !== 'local' && navigator.onLine === false) kind = 'offline';
  const text = { updating: 'Updating…', blocked: 'Not synced — changes kept here', ok: '● Synced', saving: 'Saving…', err: 'Not saved — retrying', local: 'This device only', offline: 'Offline — changes will sync later' }[kind] || '';
  el.textContent = text;
  el.className = 'sync-pill' + (kind === 'ok' ? ' ok' : (kind === 'err' || kind === 'blocked') ? ' err' : '');
  el.title = kind === 'blocked' ? (cloud.blockedMsg || '') : kind === 'local' ? 'Sharing isn’t set up yet. See the setup guide.' : kind === 'offline' ? 'You’re offline. Horizon keeps your changes on this device and sends them when you’re back online.' : '';
}

window.addEventListener('online', () => {
  if(cloud.ready) cloudFlush();
  else if(cloud.held && cloud.retry) cloudResumeHeld(household.code);
  else if(cloud.held && cloud.heldCheck) scheduleHeldCheck(HELD_CHECK_SOON);
});
window.addEventListener('offline', () => { if(cloud.ready) setCloudStatus('offline'); });
document.addEventListener('visibilitychange', () => {
  if(document.hidden && cloud.timer) cloudFlush();
  if(!document.hidden && cloud.held && cloud.heldCheck) scheduleHeldCheck(HELD_CHECK_SOON);   // phone woke up still waiting
});
window.addEventListener('pagehide', () => { if(cloud.timer) cloudFlush(); });

// ============================================================
//  Quick resume (per device only, never synced). A copy of the board is kept in localStorage per household
//  code, so a signed-in device shows the board at once and catches up when Firestore answers.
//  `base` is the last copy the server had (sent or received); `local` holds edits made on the cached board
//  before the first answer. Saves are held until then; the first answer is merged field by field, so
//  newer data from other devices is kept and only what was changed here goes on top.
// ============================================================
const BOARD_CACHE_KEY = 'horizonBoardCache';
const BOARD_CACHE_MAX = 1500000;    // characters; localStorage is ~5 MB on most browsers
const BOARD_PHOTO_MAX = 120000;     // bigger profile photos are left out of the copy (the server still has them)

function stripCachePhotos(st, all){
  if(!st || !Array.isArray(st.people)) return st;
  return Object.assign({}, st, { people: st.people.map(p => {
    if(!p || !p.photo || (!all && String(p.photo).length <= BOARD_PHOTO_MAX)) return p;
    const q = Object.assign({}, p); delete q.photo; return q;
  }) });
}
function saveBoardCache(code, base, local){
  if(!code || !base) return;
  try {
    const rec = { code, savedAt: Date.now(), base, local: local || null };
    let json = JSON.stringify(Object.assign({}, rec, { base: stripCachePhotos(base), local: local ? stripCachePhotos(local) : null }));
    if(json.length > BOARD_CACHE_MAX) json = JSON.stringify(Object.assign({}, rec, { base: stripCachePhotos(base, true), local: local ? stripCachePhotos(local, true) : null }));
    if(json.length > BOARD_CACHE_MAX){ clearBoardCache(); return; }
    localStorage.setItem(BOARD_CACHE_KEY, json);
  } catch(e){ clearBoardCache(); }   // full storage or private mode: just go without a copy
}
function loadBoardCache(code){
  try {
    const rec = JSON.parse(localStorage.getItem(BOARD_CACHE_KEY) || 'null');
    if(!rec || !code || rec.code !== code || !rec.base || !Array.isArray(rec.base.items) || !Array.isArray(rec.base.people)) return null;
    return rec;
  } catch(e){ return null; }
}
function clearBoardCache(){ try { localStorage.removeItem(BOARD_CACHE_KEY); } catch(e) {} }
// `state` is what the server has (received, or sent and confirmed): the base of the copy on this device.
function markConfirmed(json, state){
  if(!json || !state) return;
  cloud.confirmedJson = json; cloud.confirmedState = state;
}
// Saves the copy: the confirmed base, plus this device's unconfirmed edits (merged in on the next resume).
function refreshBoardCache(cur, curJson){
  if(!cloud.ready || cloud.mode !== 'cloud' || !household.code || !cloud.confirmedState) return;
  cur = cur || snapshotState();
  curJson = curJson || stableJson(cur);
  if(cloud.cacheBase === cloud.confirmedJson && cloud.cacheCur === curJson) return;
  cloud.cacheBase = cloud.confirmedJson; cloud.cacheCur = curJson;
  saveBoardCache(household.code, cloud.confirmedState, curJson === cloud.confirmedJson ? null : cur);
}

// ---- three-way merge of the first server answer with edits made on the cached copy ----
function mergeObjFields(b, l, r){
  const out = Object.assign({}, r);
  new Set(Object.keys(b).concat(Object.keys(l))).forEach(k => {
    if(stableJson(l[k]) === stableJson(b[k])) return;
    if(l[k] === undefined) delete out[k]; else out[k] = l[k];
  });
  return out;
}
function mergeById(base, local, remote){
  const key = o => String(o && o.id);
  const bMap = new Map(base.map(o => [key(o), o])), lMap = new Map(local.map(o => [key(o), o]));
  const out = [], seen = new Set();
  remote.forEach(r => {
    const k = key(r), b = bMap.get(k), l = lMap.get(k);
    seen.add(k);
    if(b && l) out.push(mergeObjFields(b, l, r));
    else if(b && !l){ if(stableJson(b) !== stableJson(r)) out.push(r); }   // removed here; keep only if changed elsewhere
    else if(!b && l) out.push(l);
    else out.push(r);
  });
  local.forEach(l => {
    const k = key(l);
    if(seen.has(k)) return;
    const b = bMap.get(k);
    if(!b || stableJson(b) !== stableJson(l)) out.push(l);   // new here, or changed here after it was removed elsewhere
  });
  return out;
}
function mergeList(base, local, remote){
  const has = (arr, v) => arr.some(x => stableJson(x) === stableJson(v));
  // this device's order wins (so a reorder made here survives); drop what was removed elsewhere, add what was added there
  const out = local.filter(v => !(has(base, v) && !has(remote, v)));
  remote.forEach(v => { if(!has(base, v) && !has(out, v)) out.push(v); });
  return out;
}
function mergeHeldState(base, local, remote){
  const res = {
    items: mergeById(base.items || [], local.items || [], remote.items || []),
    people: mergeById(base.people || [], local.people || [], remote.people || []),
    householdName: local.householdName !== base.householdName ? local.householdName : remote.householdName
  };
  const added = (local.activity || []).filter(a => !(base.activity || []).some(x => stableJson(x) === stableJson(a)));
  res.activity = added.concat(remote.activity || []).slice(0, 6);
  const bc = base.categories || [], lc = local.categories || [], rc = remote.categories || bc;
  res.categories = stableJson(lc) === stableJson(bc) ? rc : stableJson(rc) === stableJson(bc) ? lc : mergeList(bc, lc, rc);
  const bs = base.subcategories || {}, ls = local.subcategories || {}, rs = remote.subcategories || bs;
  if(stableJson(ls) === stableJson(bs)) res.subcategories = rs;
  else {
    res.subcategories = {};
    new Set(Object.keys(bs).concat(Object.keys(ls), Object.keys(rs))).forEach(c => {
      const m = mergeList(bs[c] || [], ls[c] || [], rs[c] || []);
      if(m.length) res.subcategories[c] = m;
    });
  }
  return res;
}

// Connect in the background for a board already shown from the cached copy.
// Saves stay held until the server has answered (a snapshot with fromCache false, or the safety-net read below).
const HELD_CHECK_MS = 6000;      // no server answer by then while online: ask the server directly
const HELD_CHECK_RETRY = 15000;
const HELD_CHECK_SOON = 1500;    // after coming back online or waking up
function cloudResumeHeld(code){
  clearTimeout(cloud.retry); cloud.retry = null;
  const gen = ++cloud.gen;
  let synced = false;
  const retry = () => {
    if(gen !== cloud.gen) return;
    try { if(cloud.unsub) cloud.unsub(); } catch(e) {}
    cloud.unsub = null;
    clearTimeout(cloud.heldCheck); cloud.heldCheck = null;
    setCloudStatus('updating');
    cloud.retry = setTimeout(() => cloudResumeHeld(code), 15000);
  };
  getAdapter().then(adapter => {
    if(gen !== cloud.gen) return;
    cloud.adapter = adapter;
    cloud.heldCode = code;
    scheduleHeldCheck(HELD_CHECK_MS);
    cloud.unsub = adapter.subscribe(code, (data, fromCache) => {
      if(gen !== cloud.gen) return;
      if(!fromCache) synced = true;
      if(cloud.held){
        // Firestore's own offline copy on this phone may be older than the server: only a server answer
        // (which already includes any of this device's not-yet-sent writes) may be merged and release saves.
        if(fromCache) return;
        if(!data){ cloudHeldBlocked('gone'); return; }
        cloudFinishHeld(data); return;
      }
      // released by the safety-net read: an older cached snapshot arriving now must not replace the merge
      if(fromCache && !synced) return;
      if(!data && fromCache) return;
      if(data && data.clientId !== clientId) cloudApplyRemote(data);
    }, err => {
      if(gen !== cloud.gen) return;
      if(!cloud.held){ setCloudStatus('err'); return; }
      if(heldRefused(err)) cloudHeldBlocked(err);
      else retry();
    });
  }).catch(retry);
}
function heldRefused(err){
  const c = err && err.code;
  return c === 'permission-denied' || c === 'not-found' || c === 'unauthenticated' || c === 'invalid-argument';
}
// Safety net: if no server-confirmed snapshot has come while online, read the document from the server once
// and merge that. Saves are only released against a real server answer, never against the phone's copy.
function scheduleHeldCheck(ms){
  clearTimeout(cloud.heldCheck);
  const gen = cloud.gen;
  cloud.heldCheck = setTimeout(() => heldServerCheck(gen), ms);
}
function heldServerCheck(gen){
  cloud.heldCheck = null;
  if(gen !== cloud.gen || !cloud.held || !cloud.adapter) return;
  const again = () => { if(gen === cloud.gen && cloud.held) scheduleHeldCheck(HELD_CHECK_RETRY); };
  if(typeof cloud.adapter.fetch !== 'function' || navigator.onLine === false){ again(); return; }
  cloud.heldCheck = -1;   // marks a check in progress (so 'online' / wake-up can kick a new one later)
  Promise.resolve().then(() => cloud.adapter.fetch(cloud.heldCode)).then(data => {
    if(gen !== cloud.gen || !cloud.held) return;
    cloud.heldCheck = null;
    if(!data){ cloudHeldBlocked('gone'); return; }
    cloudFinishHeld(data);
  }, err => {
    if(gen !== cloud.gen || !cloud.held) return;
    cloud.heldCheck = null;
    if(heldRefused(err)) cloudHeldBlocked(err); else again();
  });
}
// The server refused or the household is gone: stop trying, keep edits on this device (still held) and say so.
function cloudHeldBlocked(err){
  try { if(cloud.unsub) cloud.unsub(); } catch(e) {}
  cloud.unsub = null; cloud.gen++;
  clearTimeout(cloud.retry); cloud.retry = null;
  clearTimeout(cloud.heldCheck); cloud.heldCheck = null;
  cloud.blockedMsg = (err === 'gone'
    ? 'This household wasn’t found in the shared database. Check the household code with your family.'
    : friendlyCloudError(err)) + ' Your changes are kept on this device and nothing was overwritten.';
  setCloudStatus('blocked');
  if(typeof showToast === 'function') showToast(cloud.blockedMsg);
}
function cloudFinishHeld(data){
  const base = cloud.heldBase, local = snapshotState();
  cloud.held = false; cloud.heldBase = null;
  clearTimeout(cloud.heldCheck); cloud.heldCheck = null;
  let remoteJson = '', remoteSnap = null;
  if(data){
    const remote = stateFromDoc(data);
    applyState(remote);
    remoteSnap = snapshotState();
    remoteJson = remote.idsAssigned ? '' : stableJson(remoteSnap);
    const merged = mergeHeldState(base, local, remoteSnap);
    applyState(stateFromDoc(merged));
  }
  cloud.lastJson = remoteJson;
  cloud.ready = true;
  markConfirmed(remoteJson, remoteSnap);
  reconcileIdentity();
  purgeTrash();
  setCloudStatus('ok');
  render();   // anything changed here before the answer is saved now
  if(cloud.timer) cloudFlush();   // send the merge at once, before any other snapshot can arrive
}
