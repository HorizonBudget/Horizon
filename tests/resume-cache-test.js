// Quick resume: a signed-in device shows the board from its own saved copy at once, then catches up with
// Firestore. Edits made before the first answer are kept and merged, never written over newer server data.
const {JSDOM}=require('jsdom');
const html=require('./lib/build-app').buildApp();
let store={}, listeners={}, held=false, queued=[], pushes=0, pushFail=false;
function deliver(code,cb){ cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false); }
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); if(held) queued.push({code,cb,err:arguments[2]}); else setTimeout(()=>deliver(code,cb),5); return ()=>{ listeners[code]=(listeners[code]||[]).filter(f=>f!==cb); }; },
  push(code,data){ pushes++; if(pushFail) return Promise.reject(new Error('offline')); store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
function boot(ls){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory;
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    if(ls) for(const k in ls) w.localStorage.setItem(k,ls[k]);
  }});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const CODE='RESUME-TEST-1234';
const $=(w,id)=>w.document.getElementById(id);
const lsOf=w=>{ const o={}; for(let i=0;i<w.localStorage.length;i++){ const k=w.localStorage.key(i); o[k]=w.localStorage.getItem(k); } return o; };
function addItem(w,name,cost){ w.openItemModal(); $(w,'f_name').value=name; $(w,'f_cost').value=String(cost); w.saveItem(); }
const names=w=>w.eval('liveItems().map(i=>i.name).sort().join(",")');

(async()=>{
  // ---------- set up: device A signs in, adds two items, the copy is saved ----------
  const A=boot(); await sleep(30);
  $(A,'householdCode').value=CODE; $(A,'yourName').value='Sam'; await A.enterApp();
  addItem(A,'Tires',600); addItem(A,'Dentist',150);
  await sleep(700);
  ok(store[CODE] && store[CODE].items.length===2,'two items on the server');
  const cache=JSON.parse(A.localStorage.getItem('horizonBoardCache')||'null');
  ok(cache && cache.code===CODE && cache.base.items.length===2 && !cache.local,'confirmed copy saved per household code');
  ok(Object.keys(store[CODE]).every(k=>['items','people','activity','categories','subcategories','householdName','clientId','updatedAt'].includes(k)),'no new top-level synced field');
  const saved=lsOf(A);

  // ---------- meanwhile another device changes the server copy ----------
  const srv=JSON.parse(JSON.stringify(store[CODE]));
  srv.items.find(i=>i.name==='Tires').cost=650;
  srv.items.push({id:'srv-new',name:'Gutters',category:'Home',cost:180,month:'No date yet',owner:'',completed:false});
  srv.clientId='other-device'; srv.householdName='The Smiths';
  store[CODE]=srv;

  // ---------- 1. reopen: board shows straight away from the copy, before any answer ----------
  held=true; queued=[]; pushes=0;
  saved.horizonSeenVersion='2.0.0';   // big update since last visit: the notice must still show, once
  const B=boot(saved);
  await sleep(40);
  ok($(B,'app').style.display==='block' && $(B,'gate').style.display==='none','board shown before any snapshot');
  ok(names(B)==='Dentist,Tires','cached items shown');
  ok($(B,'gateBtn').textContent!=='Connecting…','no Connecting… on resume');
  ok(/Updating/.test($(B,'syncPill').textContent),'quiet Updating… status ('+$(B,'syncPill').textContent+')');
  const noticeShown=$(B,'confirmOverlay').style.display==='flex' || /brighter/.test(B.document.body.textContent);
  ok(B.localStorage.getItem('horizonSeenVersion')===B.eval('APP_VERSION') && noticeShown,'update notice shown on resume');
  if($(B,'confirmOverlay').style.display==='flex') $(B,'confirmOk').click();

  // ---------- 2. edits before the answer are held, not pushed ----------
  addItem(B,'Camp',400);
  B.eval("items.find(i=>i.name==='Dentist').cost=175; render()");
  await sleep(600);
  ok(pushes===0,'no save while waiting for the first answer');
  const c2=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
  ok(c2.local && c2.local.items.length===3 && c2.base.items.length===2,'held edits kept in the copy on this device');

  // ---------- 2b. the phone's own (stale) Firestore copy answers first: display only, nothing merged or saved ----------
  const stale=JSON.parse(saved.horizonBoardCache).base; stale.clientId='old';
  queued.forEach(q=>q.cb(JSON.parse(JSON.stringify(stale)),true));
  await sleep(600);
  ok(pushes===0 && !store[CODE].items.some(i=>i.name==='Camp'),'stale cached snapshot does not release saves');
  ok(/Updating/.test($(B,'syncPill').textContent) && B.eval('cloud.held'),'still waiting for the server after a cached snapshot');
  ok(B.eval('liveItems().length')===3,'held edits still on screen');

  // ---------- 3. first answer arrives: merged, nothing lost, nothing overwritten ----------
  held=false; queued.forEach(q=>deliver(q.code,q.cb)); queued=[];
  await sleep(700);
  ok(names(B)==='Camp,Dentist,Gutters,Tires','server item and held item both present ('+names(B)+')');
  ok(B.eval("items.find(i=>i.name==='Tires').cost")===650,'newer server change kept (Tires 650)');
  ok(B.eval("items.find(i=>i.name==='Dentist').cost")===175,'edit made before the answer kept (Dentist 175)');
  ok($(B,'hhTitle').textContent==='The Smiths','server household name applied');
  ok(store[CODE].items.length===4 && store[CODE].items.some(i=>i.name==='Camp') && store[CODE].items.some(i=>i.name==='Gutters') && store[CODE].items.find(i=>i.name==='Tires').cost===650,'merged board saved to the server');
  ok(/Synced/.test($(B,'syncPill').textContent),'status back to Synced');
  const c3=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
  ok(!c3.local && c3.base.items.length===4,'copy now matches the server');

  // ---------- 4. no edits: the first answer simply replaces the copy ----------
  const saved2=lsOf(B);
  const srv2=JSON.parse(JSON.stringify(store[CODE]));
  srv2.items=srv2.items.filter(i=>i.name!=='Camp'); srv2.clientId='other-device';
  store[CODE]=srv2;
  held=true; queued=[]; pushes=0;
  const C=boot(saved2); await sleep(40);
  ok(names(C)==='Camp,Dentist,Gutters,Tires','C shows its copy first');
  held=false; queued.forEach(q=>deliver(q.code,q.cb)); queued=[]; await sleep(600);
  ok(names(C)==='Dentist,Gutters,Tires','first answer replaces the copy (Camp removed elsewhere)');
  ok(pushes===0,'nothing pushed when nothing changed here');

  // ---------- 5. copy of another household is never shown ----------
  const other=Object.assign({},saved2,{ledgerHousehold:JSON.stringify({code:'OTHER-HOUSE-9999',name:'Sam',personId:null})});
  held=true; queued=[];
  const D=boot(other); await sleep(40);
  ok($(D,'app').style.display!=='block' && $(D,'gateBtn').textContent==='Connecting…','other household code: normal sign-in, no stale board');
  held=false; queued.forEach(q=>deliver(q.code,q.cb)); queued=[]; await sleep(300);

  // ---------- 6. leaving clears the copy ----------
  C.leaveHousehold(); await sleep(30); $(C,'confirmOk').click(); await sleep(30);
  ok(C.localStorage.getItem('horizonBoardCache')===null && C.localStorage.getItem('ledgerHousehold')===null,'leaving removes the copy');

  // ---------- 7. size-aware: big photos are left out, a full storage never breaks the app ----------
  const big='data:image/jpeg;base64,'+'A'.repeat(200000);
  B.eval(`people[0].photo=${JSON.stringify(big)}; render()`); await sleep(700);
  const c7=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
  ok(c7 && !c7.base.people.some(p=>p.photo),'big photo left out of the copy');
  ok(store[CODE].people.some(p=>p.photo===big),'photo still synced to the server');
  B.eval("window.__origSet=Storage.prototype.setItem; Storage.prototype.setItem=function(){ throw new Error('QuotaExceededError'); }");
  let threw=false; try { addItem(B,'Shoes',80); await sleep(700); } catch(e){ threw=true; }
  ok(!threw && store[CODE].items.some(i=>i.name==='Shoes'),'quota error does not break saving');
  B.eval("Storage.prototype.setItem=window.__origSet");

  // ---------- 8. merge helper: deletes elsewhere stay deleted unless edited here ----------
  const m=A.mergeHeldState(
    {items:[{id:'a',n:1},{id:'b',n:1}],people:[],activity:[],categories:['X'],subcategories:{}},
    {items:[{id:'a',n:1},{id:'b',n:2},{id:'c',n:1}],people:[],activity:[{text:'t',time:'z'}],categories:['X','Y'],subcategories:{}},
    {items:[{id:'a',n:5,deletedAt:9}],people:[],activity:[],categories:['X','Z'],subcategories:{}});
  ok(m.categories.join()==='X,Y,Z','categories merged, this device order kept');
  const r=A.mergeHeldState({items:[],people:[],activity:[],categories:['A','B','C'],subcategories:{}},
    {items:[],people:[],activity:[],categories:['C','A','B'],subcategories:{}},
    {items:[],people:[],activity:[],categories:['A','B','C','D'],subcategories:{}});
  ok(r.categories.join()==='C,A,B,D','category reorder made while held survives the merge ('+r.categories.join()+')');
  ok(JSON.stringify(m.items)==='[{"id":"a","n":5,"deletedAt":9},{"id":"b","n":2},{"id":"c","n":1}]','three-way item merge '+JSON.stringify(m.items));
  ok(m.activity.length===1,'activity merged');

  // ---------- 9. a failed save is not recorded as what the server has; the edit stays in the copy ----------
  pushFail=true;
  addItem(B,'Boots',90); await sleep(700);
  const c9=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
  ok(c9 && !c9.base.items.some(i=>i.name==='Boots') && c9.local && c9.local.items.some(i=>i.name==='Boots'),'unconfirmed save kept as an edit, not as server data');
  pushFail=false; await sleep(5500);
  const c9b=JSON.parse(B.localStorage.getItem('horizonBoardCache'));
  ok(store[CODE].items.some(i=>i.name==='Boots') && c9b.base.items.some(i=>i.name==='Boots') && !c9b.local,'after the retry succeeds the copy is confirmed');

  // ---------- 10. the server refuses, or the household is gone: stop, say so, keep edits ----------
  for(const kind of ['permission','gone']){
    const lsB=lsOf(B); held=true; queued=[]; pushes=0;
    const E=boot(lsB); await sleep(40);
    addItem(E,'Kept '+kind,10); await sleep(500);
    const q=queued[queued.length-1];
    if(kind==='permission') q.err({code:'permission-denied'}); else q.cb(null,false);
    await sleep(300);
    ok(/Not synced/.test($(E,'syncPill').textContent) && /kept on this device/.test(E.document.body.textContent),kind+': plain message shown');
    ok(E.eval('cloud.retry')===null && E.eval('cloud.unsub')===null,kind+': stops retrying');
    addItem(E,'More '+kind,10); await sleep(500);
    const ce=JSON.parse(E.localStorage.getItem('horizonBoardCache'));
    ok(pushes===0 && ce.local.items.some(i=>i.name==='Kept '+kind) && ce.local.items.some(i=>i.name==='More '+kind),kind+': edits kept on this device, nothing saved');
    held=false;
  }

  // ---------- 11. profile gone from the copy but edits unsent: open anyway, ask after the server answers ----------
  {
    const ls=lsOf(B); const rec=JSON.parse(ls.horizonBoardCache);
    rec.local=JSON.parse(JSON.stringify(rec.base)); rec.local.items.push({id:'held-x',name:'Held edit',category:'Home',cost:5,month:'No date yet',owner:'',completed:false});
    ls.horizonBoardCache=JSON.stringify(rec);
    ls.ledgerHousehold=JSON.stringify({code:CODE,name:'Nobody',personId:'no-such-id'});
    held=true; queued=[]; pushes=0;
    const F=boot(ls); await sleep(40);
    ok($(F,'app').style.display==='block' && F.eval("liveItems().some(i=>i.name==='Held edit')"),'unknown profile with held edits: copy still shown');
    held=false; queued.forEach(q=>deliver(q.code,q.cb)); queued=[]; await sleep(300);
    ok($(F,'chooseOverlay').style.display==='flex','asks who this is after the server answers');
    ok(F.eval("liveItems().some(i=>i.name==='Held edit')"),'held edit kept through the profile question');
  }

  console.log(`${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
