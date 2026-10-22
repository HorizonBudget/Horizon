// Damaged documents/backups load safely, the invite link is used once, and the ~1 MB Firestore document
// limit is caught before saving (a fake adapter with save(code, build), like the app's transaction).
const {JSDOM}=require('jsdom');
const html=require('./lib/build-app').buildApp();
const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(clone(store[code]||null),false),5); return ()=>{}; },
  save(code,build){ return new Promise(r=>setTimeout(()=>{ const p=build(clone(store[code]||null)); if(p) store[code]=clone(p); (listeners[code]||[]).forEach(cb=>cb(clone(store[code]),false)); r(); },5)); }
};}
function boot(url,ls){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory;
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    if(ls) for(const k in ls) w.localStorage.setItem(k,ls[k]);
  }});
  const errs=[]; dom.window.addEventListener('error',e=>errs.push(String(e.message)));
  dom.window.__errs=errs;
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const $=(w,id)=>w.document.getElementById(id);
async function signIn(w,code,name){ $(w,'householdCode').value=code; $(w,'yourName').value=name; await w.enterApp(); }
const pill=w=>$(w,'syncPill').textContent;
const toastText=w=>{ const t=w.document.querySelector('.toast, #toast'); return t?t.textContent:''; };

(async()=>{
  // ---------- (a) a damaged household document ----------
  {
    const CODE='JUNK-DOC-1234';
    store[CODE]={ items:[null,{id:1,name:'Tires',category:'Vehicle',cost:600,month:'No date yet',owner:'',completed:false},
      'junk',{name:'No id',category:'Home',cost:5,month:'No date yet',completed:false},{id:3,name:null,category:'Home',cost:1,month:'No date yet'}],
      people:[null,{id:'p1',name:'Sam'}], activity:[null,{text:'ok',time:new Date().toISOString()},{text:'bad',time:'not a date'}],
      categories:['Home',null,5,'','Vehicle','Home'], subcategories:{ Home:['A',null], Bad:'x' }, householdName:'Junk', clientId:'x', updatedAt:'' };
    const A=boot(); await sleep(30);
    await signIn(A,CODE,'Sam'); await sleep(800);
    ok($(A,'app').style.display==='block','a: board opened from a damaged document');
    ok(A.eval('liveItems().map(i=>i.name).sort().join()')===',No id,Tires','a: good items kept, null/junk entries skipped ('+A.eval('liveItems().map(i=>i.name).sort().join()')+')');
    ok(A.eval('CATEGORIES.join()')==='Home,Vehicle','a: junk categories cleaned');
    ok(A.eval('activity.length')===1,'a: bad activity entries skipped');
    ok(store[CODE].items.every(i=>i && i.id!=null) && store[CODE].items.length===3,'a: repaired list saved back with ids');
    ok(A.__errs.length===0,'a: no script errors ('+A.__errs.join('; ')+')');
    // the same document with activity:null and items:null (a whole field broken)
    const B=boot(); await sleep(30);
    store['JUNK-DOC-5678']={ items:null, people:null, activity:null, categories:'junk', subcategories:[1], householdName:5 };
    await signIn(B,'JUNK-DOC-5678','Kim'); await sleep(600);
    ok($(B,'app').style.display==='block' && B.eval('people.length')===1,'a: whole broken fields: board opens fresh');
    // a backup with null entries: restored without losing the good ones or half-replacing the board
    const bk={ app:'household-forecast', version:1, items:[null,{id:9,name:'From backup',category:'Home',cost:9,month:'No date yet',completed:false}], people:[{id:'p1',name:'Sam'},null], activity:[null], categories:null };
    A.onRestoreFileChosen({ files:[new A.File([JSON.stringify(bk)],'b.json')], value:'x' }); await sleep(150);
    $(A,'confirmOk').click(); await sleep(800);
    ok(A.eval('liveItems().map(i=>i.name).join()')==='From backup','a: damaged backup restored');
    ok(A.__errs.length===0,'a: restore had no script errors');
    A.close(); B.close();
  }

  // ---------- (b) the invite link is used once ----------
  {
    const C=boot('http://localhost/#join=LINK-CODE-1234'); await sleep(30);
    ok($(C,'householdCode').value==='LINK-CODE-1234','b: code filled from the link');
    ok(C.location.hash==='','b: link taken out of the address bar');
    await signIn(C,'LINK-CODE-1234','Pat'); await sleep(600);
    const ls={ ledgerHousehold:C.localStorage.getItem('ledgerHousehold') }; C.close();
    const D=boot('http://localhost/',ls); await sleep(600);
    ok($(D,'app').style.display==='block','b: a reload opens the board, not the sign-in screen');
    D.close();
    const E=boot('http://localhost/#join=LINK-CODE-1234',ls); await sleep(600);
    ok($(E,'app').style.display==='block' && E.location.hash==='','b: opening the same invite again on a signed-in device just opens the board');
    E.close();
    const F=boot('http://localhost/#join=OTHER-CODE-999',ls); await sleep(300);
    ok($(F,'gate').style.display!=='none' && $(F,'householdCode').value==='OTHER-CODE-999','b: an invite to a different household shows sign-in with that code');
    F.close();
  }

  // ---------- (c) the 1 MB limit ----------
  {
    const CODE='BIG-BOARD-1234';
    const W=boot(); await sleep(30);
    await signIn(W,CODE,'Sam'); await sleep(600);
    const big=n=>'x'.repeat(n);
    W.eval(`for(let i=0;i<8;i++) items.push({id:1000+i,name:'Big '+i,category:'Home',cost:1,month:'No date yet',owner:'',note:${JSON.stringify(big(105000))},completed:false}); render();`);
    await sleep(800);
    ok(store[CODE].items.length===8,'c: 840 KB board saved');
    ok(/getting full/.test(toastText(W)),'c: early warning shown ('+toastText(W).slice(0,60)+')');
    W.eval(`for(let i=8;i<11;i++) items.push({id:1000+i,name:'Big '+i,category:'Home',cost:1,month:'No date yet',owner:'',note:${JSON.stringify(big(105000))},completed:false}); render();`);
    await sleep(800);
    ok(store[CODE].items.length===8,'c: over the limit: nothing written (the save would fail)');
    ok(/Not synced/.test(pill(W)),'c: pill says not synced ('+pill(W)+')');
    ok(/full/.test(toastText(W)) && /kept on this device/.test(toastText(W)),'c: plain message');
    ok(W.eval('liveItems().length')===11,'c: nothing lost on this device');
    const cache=JSON.parse(W.localStorage.getItem('horizonBoardCache')||'null');
    W.eval(`items=items.filter(i=>i.id<1006); render();`); await sleep(800);
    ok(store[CODE].items.length===6 && /Synced/.test(pill(W)),'c: back under the limit: syncs again');
    // a backup too big to share is refused before anything is replaced
    const bk={ app:'household-forecast', version:1, people:[{id:'p1',name:'Sam'}], items:[] };
    for(let i=0;i<7500;i++) bk.items.push({ id:i+1, name:'Item number '+i, category:'Home', cost:100, month:'No date yet', owner:'Sam', note:'some words about it here', completed:false, createdAt:Date.now() });
    W.onRestoreFileChosen({ files:[new W.File([JSON.stringify(bk)],'b.json')], value:'x' }); await sleep(400);
    ok(/too big/.test($(W,'backupMsg').textContent),'c: too-big backup refused ('+$(W,'backupMsg').textContent.slice(0,50)+')');
    ok(W.eval('liveItems().length')===6 && store[CODE].items.length===6,'c: board unchanged');
    ok(W.eval('boardBytes({items:[{a:"é"}]})')>0 && W.eval('docBytes({ab:"é",n:1,t:true})')===32+3+3+2+8+2+1,'c: size follows Firestore\'s rules');
    W.close();
  }
  console.log(`${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
