// ============================================================
//  Cloud sync (Firebase Firestore). One document per household code.
//  The whole board (items, people, activity, categories) lives in that document.
// ============================================================
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const cloud = { mode: 'local', ready: false, adapter: null, unsub: null, timer: null, lastJson: '',
  held: false, heldBase: null, gen: 0, retry: null, inflight: '', heldCheck: null, fb: null,
  confirmedJson: '', confirmedState: null, cacheBase: '', cacheCur: '', saveSeq: 0, tooBig: false, sizeWarned: false,
  serverStamp: 0, replaceNext: false, pendingSend: false, storageWarned: false };

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
// Reads a household document or a backup file. Damaged entries (an empty item, a bad date, junk categories)
// are skipped or repaired so one bad entry never stops the rest of the board from loading.
const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
function cleanStrList(list){
  const out = [];
  (Array.isArray(list) ? list : []).forEach(v => {
    if(typeof v !== 'string' || !v.trim() || out.includes(v)) return;
    out.push(v);
  });
  return out;
}
function cleanItems(list){
  let assigned = false;
  const ids = new Set();
  const raw = (Array.isArray(list) ? list : []).filter(isPlainObj);
  if(Array.isArray(list) && raw.length !== list.length) assigned = true;   // damaged entries dropped: save the clean list back
  raw.forEach(i => { if(i.id != null && i.id !== '') ids.add(String(i.id)); });
  const out = raw.map((i, n) => {
    let it = i;
    if(typeof it.name !== 'string') it = Object.assign({}, it, { name: it.name == null ? '' : String(it.name) });
    if(it.id == null || it.id === ''){
      // the same id on every device (from the item's place in the list), so they agree when it is saved back
      assigned = true;
      let id = 900000000 + n;
      while(ids.has(String(id))) id += 100000;
      ids.add(String(id));
      it = Object.assign({}, it, { id });
    }
    return it;
  });
  return { items: out, assigned };
}
function cleanActivity(list){
  return (Array.isArray(list) ? list : [])
    .filter(a => isPlainObj(a) && a.text != null && a.time != null && !isNaN(new Date(a.time).getTime()))
    .map(a => ({ text: String(a.text), time: a.time }));
}
function cleanSubcategories(v){
  if(!isPlainObj(v)) return null;
  const out = {};
  Object.keys(v).forEach(k => { if(Array.isArray(v[k])) out[k] = cleanStrList(v[k]); });
  return out;
}
function stateFromDoc(d){
  if(!isPlainObj(d)) d = {};
  const pl = ensurePersonIds(d.people);   // older data and old backups have people without ids
  const it = cleanItems(d.items);
  const cats = cleanStrList(d.categories);
  return {
    // true when the stored copy needs saving back (ids made up, damaged entries dropped)
    idsAssigned: pl.assigned || it.assigned || (Array.isArray(d.people) && pl.people.length !== d.people.length),
    items: it.items,
    people: pl.people,
    activity: cleanActivity(d.activity),
    categories: cats.length ? cats : null,
    subcategories: cleanSubcategories(d.subcategories),
    householdName: typeof d.householdName === 'string' ? d.householdName : ''
  };
}
// A document as snapshotState() would give it once applied, without touching the board.
function docToSnap(d){
  const s = stateFromDoc(d);
  const snap = JSON.parse(JSON.stringify({
    items: s.items, people: s.people,
    activity: s.activity.slice(0, 6).map(a => ({ text: a.text, time: new Date(a.time).toISOString() })),
    categories: s.categories || CATEGORIES, subcategories: s.subcategories || SUBCATEGORIES,
    householdName: s.householdName
  }));
  return { snap, assigned: s.idsAssigned };
}
const EMPTY_BASE = { items: [], people: [], activity: [], categories: [], subcategories: {}, householdName: '' };
function applyState(s){
  const act = s.activity.map(a => ({ text: a.text, time: new Date(a.time) })).slice(0, 6);   // everything checked before anything is replaced
  items = s.items;
  people = s.people;
  activity = act;
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
        snap => onData(snap.exists() ? snap.data() : null, snap.metadata.fromCache, !!snap.metadata.hasPendingWrites), onError);
    },
    // one-off read straight from the server (fails when offline); the safety net for quick resume
    fetch(code){ return fsM.getDocFromServer(fsM.doc(db, 'households', code)).then(snap => snap.exists() ? snap.data() : null); },
    // Saves go through a transaction: read the server's document, merge this device's changes into it
    // (build), write the result. Firestore retries it if another device saved in between. A transaction
    // only runs online and is never kept in Firestore's offline write queue, so an old whole-board save can't
    // be replayed later over newer changes. Offline edits wait in the copy on this device (horizonBoardCache).
    // build returns null when there is nothing to write.
    save(code, build){
      const ref = fsM.doc(db, 'households', code);
      return fsM.runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const payload = build(snap.exists() ? snap.data() : null);
        if(payload) tx.set(ref, payload);
      });
    }
  };
  return cloud.fb;
}
function getAdapter(){
  return window.__cloudAdapterFactory ? Promise.resolve(window.__cloudAdapterFactory()) : makeFirebaseAdapter();
}

const CACHE_ANSWER_WAIT = 4000;   // ms the normal sign-in waits for the server before using the phone's copy
function cloudConnect(code){
  return new Promise(async (resolve, reject) => {
    let cacheWait = null;
    let settled = false;
    const finish = (fn, v) => { if(!settled){ settled = true; clearTimeout(t); clearTimeout(cacheWait); fn(v); } };
    // what the server has is the base that later saves and incoming changes are merged against
    const answer = data => {
      if(settled) return;
      if(data){ const r = docToSnap(data); markConfirmed(stableJson(r.snap), r.snap); noteStamp(stampOf(data)); }
      // edits kept in the small "storage full" record (no quick-open copy): merged in and sent after sign-in
      const rec = loadBoardCache(code);
      if(rec && rec.compact && rec.local){
        const merged = mergeHeldState(rec.base, rec.local, data ? docToSnap(data).snap : EMPTY_BASE);
        data = Object.assign({}, data || {}, merged);
        cloud.pendingSend = true;
      }
      finish(resolve, data);
    };
    const t = setTimeout(() => finish(reject, new Error('timeout')), 12000);
    try {
      cloud.adapter = await getAdapter();
      let synced = false, cachedData = null;
      cloud.unsub = cloud.adapter.subscribe(code, (data, fromCache, pending) => {
        if(!fromCache) synced = true;
        if(!settled){
          // an empty answer from the local cache isn't proof the household is new; wait for the server
          if(!data && fromCache) return;
          // the phone's own copy may be older than the server: use it only when offline, or when the
          // server is slow to answer (the wait starts once, at the first cached copy, and uses the newest one)
          if(fromCache && navigator.onLine !== false){
            cachedData = data;
            if(!cacheWait) cacheWait = setTimeout(() => answer(cachedData), CACHE_ANSWER_WAIT);
            return;
          }
          answer(data); return;
        }
        if(fromCache && !synced) return;   // older copy from this phone; the server answer follows
        if(data && !pending) cloudApplyRemote(data);
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
  cloud.saveSeq++; cloud.tooBig = false; cloud.sizeWarned = false;
  cloud.serverStamp = 0; cloud.replaceNext = false; cloud.pendingSend = false;   // a save still running is ignored when it ends
  clearTimeout(cloud.retry); cloud.retry = null;
  clearTimeout(cloud.heldCheck); cloud.heldCheck = null;
}
function friendlyCloudError(e){
  const code = e && e.code;
  if(code === 'permission-denied') return 'The shared database refused the request. Check that the security rules from the setup guide are published.';
  if(e && e.message === 'timeout') return 'Couldn’t reach the shared database. Check your connection and the Firebase settings in the app file, then try again.';
  return 'Couldn’t connect to the shared database' + (e && e.message ? ' (' + e.message + ')' : '') + '.';
}

// A server copy arrived (another device saved, or the echo of this device's own save). Changes made here
// that the server doesn't have yet are kept on top, field by field, and sent.
function cloudApplyRemote(data){
  const st = stampOf(data);
  if(st && st < cloud.serverStamp) return;   // an older copy arriving late: a newer one is already the base
  noteStamp(st);
  const r = docToSnap(data), remote = r.snap, rj = stableJson(remote);
  if(rj === cloud.confirmedJson && !r.assigned) return;   // nothing new
  const cur = snapshotState(), cj = stableJson(cur);
  // a restored backup replaces the board: nothing from the server is mixed into it before it is sent
  const next = cloud.replaceNext ? cur
    : cj === cloud.confirmedJson || cj === rj ? remote : mergeHeldState(cloud.confirmedState || EMPTY_BASE, cur, remote);
  applyState(stateFromDoc(next));
  markConfirmed(rj, remote);
  cloud.lastJson = r.assigned ? '' : rj;   // new ids made up here are saved back for everyone
  refreshBoardCache();
  reconcileIdentity();   // follow a rename made on another device, or ask if this profile is gone
  // expired deleted items, new ids, or edits made here that the server doesn't have yet: render() saves them
  if(purgeTrash() || r.assigned || stableJson(snapshotState()) !== rj){ render(); return; }
  renderCore();
  if(!cloud.inflight && !cloud.timer) setCloudStatus('ok');
}

// updatedAt doubles as an order: every save writes a time later than the copy it was merged into, so a
// copy with an older updatedAt is an older copy (snapshots and save answers can arrive out of order).
// Stamps are compared as times (ms); a missing or unreadable updatedAt is 0 and orders nothing.
function stampOf(d){ const t = d && typeof d.updatedAt === 'string' ? Date.parse(d.updatedAt) : NaN; return isNaN(t) ? 0 : t; }
function nextStamp(prev){ return new Date(Math.max(Date.now(), prev + 1)).toISOString(); }
function noteStamp(st){ if(st > cloud.serverStamp) cloud.serverStamp = st; }

// ---- size: Firestore refuses a document over 1 MiB (1,048,576 bytes) ----
const DOC_MAX_BYTES = 1000000;   // stop below the real limit (estimate + document name overhead)
const DOC_WARN_BYTES = 800000;   // say early that the board is getting full
function utf8Len(str){
  let n = 0;
  for(let i = 0; i < str.length; i++){
    const c = str.charCodeAt(i);
    if(c < 0x80) n += 1; else if(c < 0x800) n += 2;
    else if(c >= 0xD800 && c < 0xDC00){ n += 4; i++; } else n += 3;
  }
  return n;
}
// Firestore's own size rules: strings are UTF-8 bytes + 1, numbers 8, true/false/null 1, field names + 1
function docBytes(v){
  if(v == null || typeof v === 'boolean') return 1;
  if(typeof v === 'string') return utf8Len(v) + 1;
  if(typeof v === 'number') return 8;
  if(Array.isArray(v)) return v.reduce((n, x) => n + docBytes(x), 0);
  if(typeof v === 'object') return Object.keys(v).reduce((n, k) => v[k] === undefined ? n : n + utf8Len(k) + 1 + docBytes(v[k]), 32);
  return 1;
}
function boardBytes(state){ return docBytes(Object.assign({}, state, { clientId, updatedAt: new Date().toISOString() })) + 100; }
const TOO_BIG_MSG = 'The shared board is full: it has reached the size limit of the shared database, so your latest changes can’t be sent. They are kept on this device and nothing was lost. Empty the trash, or remove old items or profile photos, and it will sync again.';
const NEARLY_FULL_MSG = 'Your shared board is getting full. Emptying the trash or removing old items you no longer need keeps it syncing.';
function showTooBig(){
  cloud.blockedMsg = TOO_BIG_MSG;
  setCloudStatus('blocked');
  if(!cloud.tooBig && typeof showToast === 'function') showToast(TOO_BIG_MSG);
  cloud.tooBig = true;
}
// false when the board is too big to save (the person is told once, the pill says so)
function checkBoardSize(state){
  const bytes = boardBytes(state);
  if(bytes > DOC_MAX_BYTES){ showTooBig(); return false; }
  cloud.tooBig = false;
  if(bytes > DOC_WARN_BYTES){
    if(!cloud.sizeWarned && typeof showToast === 'function') showToast(NEARLY_FULL_MSG);
    cloud.sizeWarned = true;
  } else cloud.sizeWarned = false;
  return true;
}

function cloudSchedulePush(){
  if(cloud.held){
    const local = snapshotState();
    saveBoardCache(household.code, cloud.heldBase, stableJson(local) === stableJson(cloud.heldBase) ? null : local);
    setCloudStatus('updating');
    return;
  }
  if(!cloud.ready) return;
  if(cloud.pendingSend){ cloud.pendingSend = false; cloud.lastJson = ''; }   // edits from the small record go out now
  const cur = snapshotState(), now = stableJson(cur);
  if(now === cloud.lastJson && !cloud.inflight) markConfirmed(now, cur);
  refreshBoardCache(cur, now);
  if(now === cloud.lastJson) return;
  setCloudStatus('saving');
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(cloudFlush, 400);
}
// Sends what changed here since the last copy the server confirmed (cloud.confirmedState), merged into the
// server's current document, so changes other devices made meanwhile are never overwritten.
const SAVE_GIVE_UP = 30000;   // a save with no answer by then is tried again (a late answer is harmless: it merges)
function cloudFlush(){
  clearTimeout(cloud.timer); cloud.timer = null;
  if(!cloud.ready || cloud.inflight) return;   // one save at a time; when it ends, anything newer follows
  const state = snapshotState();
  const j = stableJson(state);
  if(j === cloud.lastJson){ setCloudStatus('ok'); return; }
  if(!checkBoardSize(state)){ cloud.lastJson = ''; return; }
  // offline: the edits wait in the copy on this device and go out on the 'online' event (or the slow retry)
  if(navigator.onLine === false){ setCloudStatus('offline'); cloud.timer = setTimeout(cloudFlush, 30000); return; }
  const base = cloud.confirmedState || EMPTY_BASE, seq = ++cloud.saveSeq, code = household.code;
  const replace = cloud.replaceNext;   // a restored backup: write this board as it is
  cloud.lastJson = j;
  cloud.inflight = j;   // not "what the server has" until the save is confirmed
  let written = state, writtenStamp = 0;
  const build = data => {
    let merged = state, remoteJson = '', repair = false;
    if(data){
      const r = docToSnap(data), remote = r.snap;
      repair = r.assigned;
      remoteJson = stableJson(remote);
      if(!replace && remoteJson !== stableJson(base)) merged = JSON.parse(JSON.stringify(mergeHeldState(base, state, remote)));
    }
    written = merged;
    if(remoteJson && !repair && stableJson(merged) === remoteJson){ writtenStamp = stampOf(data); return null; }   // the server already has all of it
    const updatedAt = nextStamp(stampOf(data));
    writtenStamp = Date.parse(updatedAt);
    const payload = JSON.parse(JSON.stringify(Object.assign({}, merged, { clientId, updatedAt })));
    if(docBytes(payload) + 100 > DOC_MAX_BYTES){ const e = new Error('too big'); e.code = 'too-big'; throw e; }
    return payload;
  };
  const adapter = cloud.adapter;
  const fail = e => {
    if(seq !== cloud.saveSeq) return;
    cloud.saveSeq++;
    clearTimeout(giveUp);
    cloud.inflight = ''; cloud.lastJson = '';
    if(e && e.code === 'too-big'){ showTooBig(); return; }
    setCloudStatus('err');
    clearTimeout(cloud.timer);
    cloud.timer = setTimeout(cloudFlush, 5000); // try again shortly
  };
  const giveUp = setTimeout(() => fail(new Error('timeout')), SAVE_GIVE_UP);
  // test fakes with only push(): a plain write of this device's board
  Promise.resolve().then(() => typeof adapter.save === 'function' ? adapter.save(code, build) : adapter.push(code, build(null)))
    .then(() => {
      if(seq !== cloud.saveSeq) return;
      clearTimeout(giveUp);
      cloud.inflight = '';
      if(!cloud.ready) return;
      if(replace) cloud.replaceNext = false;
      if(writtenStamp && writtenStamp < cloud.serverStamp){
        // a newer copy from another device came in while saving (it already holds this save, and it was merged
        // into the board): it stays the base, so another device's change is never mistaken for one made here
        cloudSchedulePush();
        if(!cloud.timer) setCloudStatus('ok');
        return;
      }
      noteStamp(writtenStamp);
      const wj = stableJson(written);
      markConfirmed(wj, written);
      cloud.lastJson = wj;
      if(wj !== j){
        // the save brought in changes from other devices; keep anything edited here while it ran
        const cur = snapshotState();
        applyState(stateFromDoc(stableJson(cur) === j ? written : mergeHeldState(state, cur, written)));
        reconcileIdentity();
        renderCore();
      }
      cloudSchedulePush();   // edits made while saving go next
      if(!cloud.timer) setCloudStatus('ok');
    }, fail);
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
// Only what changed here: the changed/removed items and people (with their base version), plus the small fields.
// Merged the same way as the full copy (items untouched here are simply taken from the server).
function compactEdits(base, local){
  const pick = key => {
    const id = o => String(o && o.id);
    const bMap = new Map((base[key] || []).map(o => [id(o), o])), lMap = new Map((local[key] || []).map(o => [id(o), o]));
    const b = [], l = [];
    lMap.forEach((o, k) => { const bo = bMap.get(k); if(!bo || stableJson(bo) !== stableJson(o)){ l.push(o); if(bo) b.push(bo); } });
    bMap.forEach((o, k) => { if(!lMap.has(k)) b.push(o); });
    return { b, l };
  };
  const small = st => ({ activity: st.activity, categories: st.categories, subcategories: st.subcategories, householdName: st.householdName });
  const it = pick('items'), pp = pick('people');
  return { base: Object.assign(small(base), { items: it.b, people: pp.b }), local: Object.assign(small(local), { items: it.l, people: pp.l }) };
}
const STORAGE_FULL_MSG = 'This device’s storage is full, so changes made while offline can’t be kept if Horizon is closed. Keep Horizon open until you’re back online, or free up space on this device.';
// Returns false when this device's unsent edits could not be stored at all.
function saveBoardCache(code, base, local){
  if(!code || !base) return true;
  const put = rec => {
    try {
      const json = JSON.stringify(rec);
      if(json.length > BOARD_CACHE_MAX) return false;
      localStorage.setItem(BOARD_CACHE_KEY, json);
      return true;
    } catch(e){ return false; }
  };
  const full = all => ({ code, savedAt: Date.now(), base: stripCachePhotos(base, all), local: local ? stripCachePhotos(local, all) : null,
    replace: !!(local && cloud.replaceNext) });   // a restore not sent yet still replaces the board after a restart
  if(put(full(false)) || put(full(true))){ cloud.storageWarned = false; return true; }
  clearBoardCache();   // full storage or private mode: the old copy goes first, to make room
  if(local){
    // keep the unsent edits before anything else: a small record without the rest of the board
    const c = compactEdits(base, local);
    const rec = all => ({ code, savedAt: Date.now(), compact: true, base: stripCachePhotos(c.base, true), local: stripCachePhotos(c.local, all) });
    if(put(rec(false)) || put(rec(true))){ cloud.storageWarned = false; return true; }
    if(!cloud.storageWarned && (navigator.onLine === false || cloud.held) && typeof showToast === 'function') showToast(STORAGE_FULL_MSG);
    cloud.storageWarned = true;
    return false;
  }
  return true;
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
  cloud.confirmedJson = json; cloud.confirmedState = JSON.parse(JSON.stringify(state));   // own copy: the board edits its objects in place
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
  // owners are stored by name: a rename (same person id, new name) applies to items saved with the old name
  const renames = new Map();
  (base.people || []).forEach(b => {
    const m = b && res.people.find(p => p && String(p.id) === String(b.id));
    if(m && m.name !== b.name && !res.people.some(p => p && p.name === b.name)) renames.set(b.name, m.name);
  });
  if(renames.size) res.items = res.items.map(it => it && renames.has(it.owner) ? Object.assign({}, it, { owner: renames.get(it.owner) }) : it);
  // activity: the server's lines plus lines added here, each once (same time and text), newest 6
  const akey = a => (a && a.time) + '|' + (a && a.text);
  const baseKeys = new Set((base.activity || []).map(akey)), seenA = new Set();
  res.activity = (remote.activity || []).concat((local.activity || []).filter(a => !baseKeys.has(akey(a))))
    .filter(a => a && !seenA.has(akey(a)) && seenA.add(akey(a)))
    .sort((x, y) => (Date.parse(y.time) || 0) - (Date.parse(x.time) || 0))
    .slice(0, 6);
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
    cloud.unsub = adapter.subscribe(code, (data, fromCache, pending) => {
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
      // a server copy from before the merge was sent is merged too (never shown bare), see cloudApplyRemote
      if(data && !pending) cloudApplyRemote(data);
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
  // 'online' / wake-up during the read may already have set a new timer: keep that one, never leave a spare
  const done = () => { if(cloud.heldCheck === -1) cloud.heldCheck = null; };
  Promise.resolve().then(() => cloud.adapter.fetch(cloud.heldCode)).then(data => {
    if(gen !== cloud.gen || !cloud.held) return;
    done();
    if(!data){ cloudHeldBlocked('gone'); return; }
    cloudFinishHeld(data);
  }, err => {
    if(gen !== cloud.gen || !cloud.held) return;
    done();
    if(heldRefused(err)) cloudHeldBlocked(err);
    else if(!cloud.heldCheck) again();
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
    remoteJson = stableJson(remoteSnap);
    noteStamp(stampOf(data));
    const merged = cloud.replaceNext ? local : mergeHeldState(base, local, remoteSnap);
    applyState(stateFromDoc(merged));
    if(remote.idsAssigned) remoteJson = '';   // new ids made up here are saved back for everyone
  }
  cloud.lastJson = remoteJson;
  cloud.ready = true;
  if(remoteSnap) markConfirmed(stableJson(remoteSnap), remoteSnap);
  reconcileIdentity();
  purgeTrash();
  setCloudStatus('ok');
  render();   // anything changed here before the answer is saved now
  if(cloud.timer) cloudFlush();   // send the merge at once, before any other snapshot can arrive
}
