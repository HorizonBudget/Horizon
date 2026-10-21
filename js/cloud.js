// ============================================================
//  Cloud sync (Firebase Firestore). One document per household code.
//  The whole board (items, people, activity, categories) lives in that document.
// ============================================================
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const cloud = { mode: 'local', ready: false, adapter: null, unsub: null, timer: null, lastJson: '',
  held: false, heldBase: null, gen: 0, retry: null, cachedJson: '' };

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
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [appM, fsM] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  let db;
  try {
    // keeps a local copy so the board still opens and accepts edits briefly offline
    db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  } catch(e){ db = fsM.getFirestore(app); }
  return {
    subscribe(code, onData, onError){
      return fsM.onSnapshot(fsM.doc(db, 'households', code),
        snap => onData(snap.exists() ? snap.data() : null, snap.metadata.fromCache), onError);
    },
    push(code, data){ return fsM.setDoc(fsM.doc(db, 'households', code), data); }
  };
}
function getAdapter(){
  return window.__cloudAdapterFactory ? Promise.resolve(window.__cloudAdapterFactory()) : makeFirebaseAdapter();
}

function cloudConnect(code){
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => { if(!settled){ settled = true; clearTimeout(t); fn(v); } };
    const t = setTimeout(() => finish(reject, new Error('timeout')), 12000);
    try {
      cloud.adapter = await getAdapter();
      cloud.unsub = cloud.adapter.subscribe(code, (data, fromCache) => {
        // an empty answer from the local cache isn't proof the household is new; wait for the server
        if(!data && fromCache) return;
        if(!settled){ finish(resolve, data); return; }
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
  cloud.gen++; cloud.held = false; cloud.heldBase = null; cloud.cachedJson = '';
  clearTimeout(cloud.retry); cloud.retry = null;
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
  cacheConfirmedBoard(cloud.lastJson);
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
  const now = stableJson(snapshotState());
  if(now === cloud.lastJson){ cacheConfirmedBoard(now); return; }
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
  cacheConfirmedBoard(j, state);
  const payload = JSON.parse(JSON.stringify(Object.assign({}, state, { clientId, updatedAt: new Date().toISOString() })));
  Promise.resolve(cloud.adapter.push(household.code, payload))
    .then(() => { if(!cloud.timer) setCloudStatus('ok'); })
    .catch(() => {
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
  const text = { updating: 'Updating…', ok: '● Synced', saving: 'Saving…', err: 'Not saved — retrying', local: 'This device only', offline: 'Offline — changes will sync later' }[kind] || '';
  el.textContent = text;
  el.className = 'sync-pill' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  el.title = kind === 'local' ? 'Sharing isn’t set up yet. See the setup guide.' : kind === 'offline' ? 'You’re offline. Horizon keeps your changes on this device and sends them when you’re back online.' : '';
}

window.addEventListener('online', () => { if(cloud.ready) cloudFlush(); else if(cloud.held && cloud.retry) cloudResumeHeld(household.code); });
window.addEventListener('offline', () => { if(cloud.ready) setCloudStatus('offline'); });
document.addEventListener('visibilitychange', () => { if(document.hidden && cloud.timer) cloudFlush(); });
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
// What the server has now matches this device: remember it as the copy to open next time.
function cacheConfirmedBoard(json, state){
  if(!cloud.ready || cloud.mode !== 'cloud' || !household.code || !json || json === cloud.cachedJson) return;
  cloud.cachedJson = json;
  saveBoardCache(household.code, state || snapshotState(), null);
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
  const out = remote.filter(v => !(has(base, v) && !has(local, v)));
  local.forEach(v => { if(!has(base, v) && !has(out, v)) out.push(v); });
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
  res.categories = stableJson(lc) === stableJson(bc) ? rc : mergeList(bc, lc, rc);
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
function cloudResumeHeld(code){
  clearTimeout(cloud.retry); cloud.retry = null;
  const gen = ++cloud.gen;
  let first = true;
  const retry = () => {
    if(gen !== cloud.gen) return;
    try { if(cloud.unsub) cloud.unsub(); } catch(e) {}
    cloud.unsub = null;
    setCloudStatus('updating');
    cloud.retry = setTimeout(() => cloudResumeHeld(code), 15000);
  };
  getAdapter().then(adapter => {
    if(gen !== cloud.gen) return;
    cloud.adapter = adapter;
    cloud.unsub = adapter.subscribe(code, (data, fromCache) => {
      if(gen !== cloud.gen) return;
      if(!data && fromCache) return;
      if(first){ first = false; cloudFinishHeld(data); return; }
      if(data && data.clientId !== clientId) cloudApplyRemote(data);
    }, err => {
      if(gen !== cloud.gen) return;
      if(first) retry(); else setCloudStatus('err');
    });
  }).catch(retry);
}
function cloudFinishHeld(data){
  const base = cloud.heldBase, local = snapshotState();
  cloud.held = false; cloud.heldBase = null;
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
  if(remoteJson) cacheConfirmedBoard(remoteJson, remoteSnap);
  reconcileIdentity();
  purgeTrash();
  setCloudStatus('ok');
  render();   // anything changed here before the answer is saved now
}
