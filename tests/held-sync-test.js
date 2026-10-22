// Quick resume against a fake of the real Firebase modules (window.__firebaseModules), so the app's own
// Firestore adapter (js/cloud.js makeFirebaseAdapter) is what runs. The fake follows the SDK's event rules:
//  - a listener first gets the phone's offline copy (fromCache true) when it has one, or when offline;
//  - when the server answer equals that copy, only metadata.fromCache changes, and Firestore sends NO event
//    for that unless the listener asked for { includeMetadataChanges: true }.
// 3.5.0 waited for a fromCache:false event that never came, so the board said "Updating…" forever.
const {JSDOM}=require('jsdom');
const html=require('./lib/build-app').buildApp();
const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
const server={};
let serverPushes=0;
// one "phone": its Firestore offline copy survives page reloads, like IndexedDB does
function makeDevice(){ return { online:true, silent:false, fetchErr:null, cache:{}, queue:[], fss:[] }; }
function makeModules(dev){
  const listeners=new Set();
  const fs={ listeners };
  function emit(l,fromCache){
    if(l.dead) return;
    const d=dev.cache[l.code]; const j=JSON.stringify(d==null?null:d);
    const dataChanged=!l.emitted || j!==l.json;
    const metaChanged=l.emitted && fromCache!==l.fromCache;
    if(!dataChanged && !(metaChanged && l.meta)) return;   // the SDK rule this test is about
    l.emitted=true; l.json=j; l.fromCache=fromCache;
    l.next({ exists:()=>d!=null, data:()=>clone(d), metadata:{ fromCache, hasPendingWrites:false } });
  }
  function syncFromServer(l){
    if(l.dead || !dev.online || dev.silent) return;
    if(server[l.code]) dev.cache[l.code]=clone(server[l.code]); else delete dev.cache[l.code];
    l.synced=true; emit(l,false);
  }
  fs.goOnline=()=>{ dev.online=true; listeners.forEach(l=>{ if(!l.synced) setTimeout(()=>syncFromServer(l),10); }); flush(); };
  fs.unsilence=()=>{ dev.silent=false; listeners.forEach(l=>setTimeout(()=>syncFromServer(l),10)); };
  fs.serverChanged=code=>{ listeners.forEach(l=>{ if(l.code===code && l.synced && dev.online && !dev.silent) setTimeout(()=>syncFromServer(l),5); }); };
  fs.emitCached=(code,data)=>{ dev.cache[code]=clone(data); listeners.forEach(l=>{ if(l.code===code){ l.json=''; emit(l,true); } }); };
  function flush(){
    if(!dev.online) return;
    const q=dev.queue; dev.queue=[];
    q.forEach(w=>setTimeout(()=>{ server[w.code]=clone(w.data); serverPushes++; w.done(); dev.fss.forEach(f=>f.serverChanged(w.code)); },10));
  }
  const appM={ initializeApp:()=>({}) };
  const fsM={
    persistentLocalCache:o=>o||{}, persistentMultipleTabManager:()=>({}),
    initializeFirestore:()=>({}), getFirestore:()=>({}),
    doc:(db,col,code)=>({ code }),
    onSnapshot(ref,a,b,c){
      const opts=typeof a==='function'?{}:a, next=typeof a==='function'?a:b, err=typeof a==='function'?b:c;
      const l={ code:ref.code, meta:!!opts.includeMetadataChanges, next, err, emitted:false, synced:false };
      listeners.add(l);
      setTimeout(()=>{ if(dev.cache[l.code]!=null || !dev.online) emit(l,true); },5);
      setTimeout(()=>syncFromServer(l),30);
      return ()=>{ l.dead=true; listeners.delete(l); };
    },
    setDoc(ref,data){
      dev.cache[ref.code]=clone(data);
      listeners.forEach(l=>{ if(l.code===ref.code) emit(l,!l.synced); });   // latency compensation
      return new Promise(done=>{ dev.queue.push({ code:ref.code, data:clone(data), done }); flush(); });
    },
    getDocFromServer(ref){
      if(!dev.online) return Promise.reject({ code:'unavailable' });
      if(dev.fetchErr) return Promise.reject({ code:dev.fetchErr });
      const d=server[ref.code];
      return new Promise(r=>setTimeout(()=>r({ exists:()=>d!=null, data:()=>clone(d) }),10));
    }
  };
  fs.modules=[appM,fsM];
  dev.fss.push(fs);
  return fs;
}
function boot(dev,ls){
  const fs=makeModules(dev);
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    w.__firebaseModules=fs.modules;
    w.__cloudAdapterFactory=()=>w.makeFirebaseAdapter();
    Object.defineProperty(w.navigator,'onLine',{ configurable:true, get:()=>dev.online });
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    if(ls) for(const k in ls) w.localStorage.setItem(k,ls[k]);
  }});
  dom.window.__fs=fs;
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const $=(w,id)=>w.document.getElementById(id);
const lsOf=w=>{ const o={}; for(let i=0;i<w.localStorage.length;i++){ const k=w.localStorage.key(i); o[k]=w.localStorage.getItem(k); } return o; };
function addItem(w,name,cost){ w.openItemModal(); $(w,'f_name').value=name; $(w,'f_cost').value=String(cost); w.saveItem(); }
const names=w=>w.eval('liveItems().map(i=>i.name).sort().join(",")');
const pill=w=>$(w,'syncPill').textContent;
function quit(w){ try { w.eval('cloudDisconnect()'); } catch(e) {} w.close(); }

(async()=>{
  const CODE='HELD-SYNC-1234';
  // ---------- set up: a phone signs in the normal way and adds two items ----------
  const phone=makeDevice();
  const A=boot(phone); await sleep(30);
  $(A,'householdCode').value=CODE; $(A,'yourName').value='Sam'; await A.enterApp();
  addItem(A,'Tires',600); addItem(A,'Dentist',150);
  await sleep(800);
  ok(server[CODE] && server[CODE].items.length===2,'set-up: two items on the server');
  ok(phone.cache[CODE] && phone.cache[CODE].items.length===2,'set-up: Firestore copy on the phone matches');
  const saved=lsOf(A); quit(A);

  // ---------- 1. the server matches the phone's copy: only metadata changes, the board must still catch up ----------
  {
    const B=boot(phone,saved); await sleep(20);
    ok(/Updating/.test(pill(B)) && B.eval('cloud.held'),'1: opens from the copy, waiting');
    addItem(B,'Camp',400);
    const before=serverPushes;
    await sleep(1500);   // well before the safety net (6 s): only the metadata event can release it
    ok(!B.eval('cloud.held'),'1: server answer equal to the copy releases the hold (metadata-only event)');
    ok(/Synced/.test(pill(B)),'1: status Synced ('+pill(B)+')');
    ok(serverPushes>before && server[CODE].items.some(i=>i.name==='Camp'),'1: edit made while waiting reached the household');
    ok(Object.keys(server[CODE]).every(k=>['items','people','activity','categories','subcategories','householdName','clientId','updatedAt'].includes(k)),'1: no new top-level synced field');
    Object.assign(saved,lsOf(B)); quit(B);
  }

  // ---------- 2. upgrade: held edits saved on the phone by 3.5.0 are merged and sent, newer server data kept ----------
  {
    const ls=Object.assign({},saved); const rec=JSON.parse(ls.horizonBoardCache);
    rec.local=clone(rec.base);
    rec.local.items.find(i=>i.name==='Dentist').cost=175;
    rec.local.items.push({ id:'held-1', name:'Held from 3.5.0', category:'Home', cost:20, month:'No date yet', owner:'', completed:false });
    ls.horizonBoardCache=JSON.stringify(rec);
    const srv=clone(server[CODE]); srv.items.find(i=>i.name==='Tires').cost=650; srv.clientId='other-device'; server[CODE]=srv;
    const B=boot(phone,ls); await sleep(20);
    ok(B.eval("liveItems().some(i=>i.name==='Held from 3.5.0')"),'2: held edit from 3.5.0 shown');
    await sleep(1500);
    ok(!B.eval('cloud.held') && /Synced/.test(pill(B)),'2: released and Synced');
    const it=n=>server[CODE].items.find(i=>i.name===n);
    ok(it('Held from 3.5.0') && it('Dentist').cost===175 && it('Tires').cost===650,'2: held edits sent, newer server change kept');
    const c=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
    ok(c && !c.local && c.base.items.some(i=>i.name==='Held from 3.5.0'),'2: copy on the phone now confirmed');
    Object.assign(saved,lsOf(B)); quit(B);
  }

  // ---------- 3. opened offline: nothing released or sent; coming back online catches up ----------
  {
    phone.online=false;
    const B=boot(phone,saved); await sleep(50);
    addItem(B,'Offline edit',30); await sleep(800);
    ok(B.eval('cloud.held') && !server[CODE].items.some(i=>i.name==='Offline edit'),'3: offline: held, nothing sent');
    ok(/Offline/.test(pill(B)),'3: says offline ('+pill(B)+')');
    B.__fs.goOnline(); B.dispatchEvent(new B.Event('online'));
    await sleep(1500);
    ok(!B.eval('cloud.held') && server[CODE].items.some(i=>i.name==='Offline edit'),'3: back online: merged and sent');
    ok(/Synced/.test(pill(B)),'3: Synced');
    Object.assign(saved,lsOf(B)); quit(B);
  }

  // ---------- 4. the live listener never answers (stalled stream): safety net reads the server once ----------
  {
    const srv=clone(server[CODE]); srv.items.push({ id:'srv-2', name:'Gutters', category:'Home', cost:180, month:'No date yet', owner:'', completed:false }); srv.clientId='other-device'; server[CODE]=srv;
    phone.silent=true;
    const B=boot(phone,saved); await sleep(20);
    addItem(B,'Stalled edit',40);
    await sleep(3000);
    ok(B.eval('cloud.held') && !server[CODE].items.some(i=>i.name==='Stalled edit'),'4: still held before the safety net');
    await sleep(4500);
    ok(!B.eval('cloud.held'),'4: safety net released the hold');
    ok(server[CODE].items.some(i=>i.name==='Stalled edit') && server[CODE].items.some(i=>i.name==='Gutters'),'4: merged with the server copy, not the stale phone copy');
    // the stale Firestore copy shows up late: it must not undo the merge
    const stale=clone(JSON.parse(saved.horizonBoardCache).base); stale.clientId='old';
    B.__fs.emitCached(CODE,stale); await sleep(700);
    ok(names(B).includes('Stalled edit') && names(B).includes('Gutters'),'4: late cached snapshot ignored ('+names(B)+')');
    ok(server[CODE].items.some(i=>i.name==='Stalled edit'),'4: server keeps the merge');
    phone.silent=false;
    Object.assign(saved,lsOf(B)); quit(B);
  }

  // ---------- 5. safety net refused by the server: stop, say so, keep edits ----------
  {
    phone.silent=true; phone.fetchErr='permission-denied';
    const B=boot(phone,saved); await sleep(20);
    addItem(B,'Refused edit',5);
    await sleep(7000);
    ok(/Not synced/.test(pill(B)) && B.eval('cloud.held'),'5: refused: plain message, still held');
    ok(!server[CODE].items.some(i=>i.name==='Refused edit'),'5: nothing sent');
    phone.silent=false; phone.fetchErr=null; quit(B);
  }

  // ---------- 6. phone woke up still waiting: checks the server soon instead of waiting ----------
  {
    phone.silent=true;
    const B=boot(phone,saved); await sleep(20);
    addItem(B,'Wake edit',6);
    await sleep(200);
    Object.defineProperty(B.document,'hidden',{ configurable:true, get:()=>false });
    B.document.dispatchEvent(new B.Event('visibilitychange'));
    await sleep(2500);
    ok(!B.eval('cloud.held') && server[CODE].items.some(i=>i.name==='Wake edit'),'6: wake-up check released the hold');
    phone.silent=false; Object.assign(saved,lsOf(B)); quit(B);
  }

  // ---------- 7. first sign-in on a phone whose Firestore copy is older than the server ----------
  {
    const old=makeDevice(); old.cache[CODE]=clone(server[CODE]); old.cache[CODE].items=[]; old.cache[CODE].clientId='old';
    const C=boot(old); await sleep(30);
    $(C,'householdCode').value=CODE; $(C,'yourName').value='Sam'; await C.enterApp();
    ok(C.eval('liveItems().length')===server[CODE].items.filter(i=>!i.deletedAt&&i.kind!=='todo').length,'7: sign-in uses the server answer, not the older phone copy');
    await sleep(800);
    ok(server[CODE].items.length>0,'7: server not overwritten with the older copy');
    quit(C);
  }

  console.log(`${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
