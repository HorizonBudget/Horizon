// ============================================================
//  Cloud sync (Firebase Firestore). One document per household code.
//  The whole board (items, people, activity, categories) lives in that document.
// ============================================================
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const cloud = { mode: 'local', ready: false, adapter: null, unsub: null, timer: null, lastJson: '' };

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
  reconcileIdentity();   // follow a rename made on another device, or ask if this profile is gone
  if(purgeTrash() || remote.idsAssigned){ render(); return; }   // expired deleted items / new ids are saved back
  renderCore();
  setCloudStatus('ok');
}

function cloudSchedulePush(){
  if(!cloud.ready) return;
  if(stableJson(snapshotState()) === cloud.lastJson) return;
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
  const text = { ok: '● Synced', saving: 'Saving…', err: 'Not saved — retrying', local: 'This device only', offline: 'Offline — changes will sync later' }[kind] || '';
  el.textContent = text;
  el.className = 'sync-pill' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  el.title = kind === 'local' ? 'Sharing isn’t set up yet. See the setup guide.' : kind === 'offline' ? 'You’re offline. Horizon keeps your changes on this device and sends them when you’re back online.' : '';
}

window.addEventListener('online', () => { if(cloud.ready) cloudFlush(); });
window.addEventListener('offline', () => { if(cloud.ready) setCloudStatus('offline'); });
document.addEventListener('visibilitychange', () => { if(document.hidden && cloud.timer) cloudFlush(); });
window.addEventListener('pagehide', () => { if(cloud.timer) cloudFlush(); });
