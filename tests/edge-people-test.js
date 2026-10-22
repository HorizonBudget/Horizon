// Edge cases for people/profiles, profile photos and the cropper, the sign-in screen, invite links and install.
// Never touches real Firebase (fake adapter below).
const {JSDOM}=require('jsdom');
const html=require('./lib/build-app').buildApp();
let store={}, listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
// opts: { ls: {key: value}, url, ua, noStorage: true (private mode: every localStorage access throws) }
function boot(opts){
  opts=opts||{};
  const errs=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:opts.url||'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory;
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
    w.addEventListener('error',e=>errs.push(e.message));
    if(opts.ls) for(const k in opts.ls) w.localStorage.setItem(k,opts.ls[k]);
    if(opts.ua) Object.defineProperty(w.navigator,'userAgent',{value:opts.ua,configurable:true});
    if(opts.noStorage) Object.defineProperty(w,'localStorage',{get(){ throw new Error('SecurityError: storage disabled'); },configurable:true});
  }});
  dom.window.__errs=errs;
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const $=(w,id)=>w.document.getElementById(id);
async function signIn(w,name,code){ $(w,'householdCode').value=code; $(w,'yourName').value=name; await w.enterApp(); }
const alertText=w=>$(w,'confirmOverlay').style.display==='flex'?$(w,'confirmMsg').textContent:'';
const closeAlert=w=>{ if($(w,'confirmOverlay').style.display==='flex') $(w,'confirmOk').click(); };

(async()=>{
  // ---------- names ----------
  {
    const w=boot(); await sleep(30);
    await signIn(w,'Sam','EDGE-PEOPLE-1'); await sleep(50);
    w.eval('adminUnlockedFlag=true');
    const add=n=>w.eval(`addPerson(${JSON.stringify(n)})`);
    ok(add('  sam ').ok===false,'same name, different case and spaces: refused');
    ok(add('Mom  Smith').ok===true&&w.eval("people.some(p=>p.name==='Mom Smith')"),'double spaces collapsed');
    ok(add('mom smith').ok===false,'"mom smith" clashes with "Mom Smith"');
    ok(add('José').ok===true&&add('José').ok===false,'José typed two Unicode ways counts as the same name');
    ok(add('   ').ok===false&&/Type a name/.test(add('   ').error),'only spaces: refused');
    ok(add('​​').ok===false,'only zero-width spaces: refused (would look blank)');
    ok(add('ㅤ').ok===false&&add('﻿').ok===false,'other invisible fillers: refused');
    ok(add('a\u0000b').ok===true&&w.eval("people.some(p=>p.name==='a b')"),'control characters turned into a space');
    ok(add('😀').ok===true,'a name of only an emoji is allowed');
    ok(add('👨‍👩‍👧').ok===true&&w.eval("people.some(p=>p.name==='👨‍👩‍👧')"),'emoji joined with zero-width joiners kept whole');
    ok(add('x'.repeat(41)).ok===false&&add('y'.repeat(40)).ok===true,'40 characters max');
    ok(w.eval(`checkPersonName('Ann', null).name`)==='Ann','checkPersonName returns the tidy name');
    // rename to an existing name, to self with different case
    const sam=w.eval("people.find(p=>p.name==='Sam').id");
    ok(w.eval(`renamePerson(${JSON.stringify(sam)}, 'MOM SMITH').ok`)===false,'renaming to an existing name (other case): refused');
    w.eval(`items.push({id:901,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:'No date yet',owner:'Sam',link:'',completed:false},{id:902,kind:'todo',name:'Call',completed:false,owner:'Sam',createdAt:1})`);
    const r=w.eval(`renamePerson(${JSON.stringify(sam)}, 'sam')`);
    ok(r.ok&&r.changed&&w.eval("items.find(i=>i.id===901).owner")==='sam'&&w.eval("items.find(i=>i.id===902).owner")==='sam','case-only rename is allowed and rewrites budget and to-do owners');
    ok(w.eval('household.name')==='sam'&&JSON.parse(w.localStorage.getItem('ledgerHousehold')).name==='sam','session follows my own rename');
    ok(w.eval(`personByName('  SAM ')`)&&w.eval(`isMe(personByName('Sam'))`),'lookups ignore case and spaces');
    // removing a person who owns items and to-dos
    const mom=w.eval("people.find(p=>p.name==='Mom Smith').id");
    w.eval(`items.push({id:903,name:'Gift',category:'Home',subcategory:'',cost:5,month:'No date yet',owner:'Mom Smith',link:'',completed:false},{id:904,kind:'todo',name:'Plan',completed:false,owner:'Mom Smith',createdAt:1})`);
    const before=w.eval('items.length');
    const rm=w.eval(`removePerson(${JSON.stringify(mom)})`);
    ok(rm.ok&&w.eval('items.length')===before&&w.eval("items.find(i=>i.id===903).owner")==='Mom Smith'&&w.eval("items.find(i=>i.id===904).owner")==='Mom Smith','removing a person keeps their items and to-dos (owner kept as text)');
    w.render();
    ok(w.__errs.length===0,'board still draws with an owner who is no longer on the list');
    w.openItemModal(w.eval('items.find(i=>i.id===903)'));
    ok([...$(w,'f_owner').options].some(o=>o.value==='Mom Smith'&&o.selected),'edit form keeps the removed owner selectable');
    w.closeModal&&w.closeModal();
    ok(w.eval(`removePerson(household.personId).ok`)===false,'cannot remove the profile signed in on this device');
    // sign-in name tidying (enterApp passes the raw typed name to createPerson)
    const w2=boot(); await sleep(30);
    await signIn(w2,'Mom   Smith','EDGE-PEOPLE-1'); await sleep(50);
    ok(w2.eval('household.name')==='Mom Smith'&&w2.eval("people.filter(p=>p.name==='Mom Smith').length")===1,'sign-in with extra spaces is tidied to "Mom Smith"');
    const w3=boot(); await sleep(30);
    await signIn(w3,'Kit','EDGE-PEOPLE-2'); await sleep(30);
    await signIn(w3,'kit ','EDGE-PEOPLE-2'); await sleep(30);
    ok(w3.eval('people.length')===1,'signing in again as "kit " finds Kit, no duplicate profile');
    const long=w3.eval(`createPerson('${'z'.repeat(60)}').name.length`);
    ok(long===40,'createPerson caps a long name at 40');
    ok(w3.eval(`createPerson('${'😀'.repeat(30)}').name`)==='😀'.repeat(20),'cap never cuts an emoji in half');
  }
  // ---------- legacy / duplicate people in synced data ----------
  {
    const w=boot(); await sleep(30);
    const st=w.eval(`stateFromDoc({items:[],people:[{name:'Mom'},{name:'mom'},{name:'Mom'},{id:'a',name:'Dad'},{id:'a',name:'Dad2'}]})`);
    ok(st.people.length===5&&new Set(st.people.map(p=>String(p.id))).size===5,'duplicate names / ids from two devices: everyone kept with unique ids');
    const st2=w.eval(`stateFromDoc({items:[],people:[{name:'Mom'},{name:'mom'},{name:'Mom'},{id:'a',name:'Dad'},{id:'a',name:'Dad2'}]})`);
    ok(JSON.stringify(st.people.map(p=>p.id))===JSON.stringify(st2.people.map(p=>p.id)),'made-up ids are the same on every device');
  }
  // ---------- photos: what is stored and shown ----------
  {
    const w=boot(); await sleep(30);
    const good='data:image/jpeg;base64,/9j/AAAA+/=';
    const bad=['x" onerror="window.__pwn=1','data:text/html;base64,PHNjcmlwdD4=','javascript:alert(1)','data:image/png;base64,AA"><img src=x onerror=alert(1)>',42,{},'http://example.com/a.jpg'];
    ok(w.eval(`cleanPhoto(${JSON.stringify(good)})`)===good&&w.eval(`cleanPhoto('data:image/png;base64,iVBOR')`)==='data:image/png;base64,iVBOR','normal photos kept');
    ok(bad.every(b=>w.eval(`cleanPhoto(${JSON.stringify(b)})`)===null),'odd or unsafe photo values become "no photo"');
    const st=w.eval(`stateFromDoc({people:[{id:1,name:'Sam',photo:${JSON.stringify(bad[0])}},{id:2,name:'Kit',photo:${JSON.stringify(good)}},{id:3,name:'Al'}]})`);
    ok(st.people[0].photo===null&&st.people[1].photo===good&&!('photo' in st.people[2]),'synced data: unsafe photo dropped, good photo kept, missing photo left missing');
    w.eval(`people=${JSON.stringify(st.people)}`);
    ok(!/onerror/.test(w.eval(`avatarHtml('Sam')`))&&/<span/.test(w.eval(`avatarHtml('Sam')`)),'a person with an unsafe photo shows initials');
    w.eval(`household={code:'EDGE-X-1',name:'Sam',personId:1}`);
    ok(w.eval(`setPersonPhoto(1, ${JSON.stringify(bad[0])})`)===false&&w.eval('people[0].photo')===null,'setPersonPhoto refuses a non-image value');
    ok(w.eval(`setPersonPhoto(1, ${JSON.stringify(good)})`)===true&&w.eval('people[0].photo')===good,'setPersonPhoto takes a real photo');
    ok(w.eval(`setPersonPhoto(1, null)`)===true&&w.eval('people[0].photo')===null,'setPersonPhoto(null) removes it');
    // doc size: a full household of cropped photos stays far below Firestore's 1 MB document limit
    ok(w.eval('CROP_OUT')===160&&w.eval('CROP_MAX_BYTES')<=40000&&w.eval('CROP_MAX_BYTES')*12<1048576/2,'12 people at the photo size cap use under half of the 1 MB document');
  }
  // ---------- cropper with odd images ----------
  {
    const w=boot(); await sleep(30);
    let got=null, cancelled=0;
    // 0x0 image (an SVG without a size, a broken decode)
    w.openCropEditor({naturalWidth:0,naturalHeight:0,src:'data:image/svg+xml;base64,AA'},x=>{got=x;},()=>{cancelled++;});
    ok($(w,'cropOverlay').style.display!=='flex'&&cancelled===1&&/Couldn’t read that image/.test(alertText(w)),'image with no size: friendly message, editor stays shut');
    closeAlert(w);
    ok(w.eval('crop.open')===false,'crop state not left open');
    // 1x1 image
    w.openCropEditor({naturalWidth:1,naturalHeight:1,src:'data:image/png;base64,AA'},x=>{got=x;},()=>{cancelled++;});
    const s=w.eval('crop.st');
    ok(s.scale===240&&s.x===0&&s.y===0,'1x1 image fills the circle: '+JSON.stringify(s));
    const realRender=w.cropRender;
    w.cropRender=()=>'data:image/jpeg;base64,ONE'; $(w,'cropOk').click();
    w.cropRender=realRender;
    ok(got==='data:image/jpeg;base64,ONE','1x1 image can be used');
    // very wide panorama
    w.openCropEditor({naturalWidth:20000,naturalHeight:200,src:'data:image/png;base64,AA'},x=>{got=x;},()=>{cancelled++;});
    const p=w.eval('crop.st');
    ok(Number.isFinite(p.scale)&&p.scale===1.2&&p.x<=0&&p.x>=240-20000*1.2,'very wide panorama starts centered and covered');
    $(w,'cropCancel').click();
    // the real renderer: fake a canvas so the size/quality logic runs
    let qs=[];
    const fakeCanvas=(sizes)=>{ const orig=w.document.createElement.bind(w.document); w.document.createElement=t=>{ if(t!=='canvas') return orig(t); return { width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},set fillStyle(v){},set imageSmoothingQuality(v){}}), toDataURL:(type,q)=>{ qs.push(q); const n=sizes(q); return n<0?'data:,':'data:image/jpeg;base64,'+'A'.repeat(n); } }; }; return ()=>{ w.document.createElement=orig; }; };
    let undo=fakeCanvas(q=>q>0.7?90000:q>0.5?50000:30000);
    const out=w.cropRender({},1000,1000,{scale:0.24,x:0,y:0},240,160);
    undo();
    ok(out.length<=40000&&qs.join()==='0.8,0.6,0.4','a very busy photo is saved at lower quality to stay small ('+qs.join()+')');
    qs=[]; undo=fakeCanvas(()=>5000); const small=w.cropRender({},1000,1000,{scale:0.24,x:0,y:0},240,160); undo();
    ok(qs.join()==='0.8'&&small.length<6000,'a normal photo is saved once at the usual quality');
    qs=[]; undo=fakeCanvas(()=>-1); let threw=false; try { w.cropRender({},1000,1000,{scale:0.24,x:0,y:0},240,160); } catch(e){ threw=true; } undo();
    ok(threw,'a canvas that returns no image ("data:,") counts as a failure, never stored as a broken photo');
    // file reading: unreadable file and non-image file
    const RealFR=w.FileReader;
    w.FileReader=function(){ const r=this; r.readAsDataURL=()=>setTimeout(()=>r.onerror&&r.onerror(new Error('x')),1); };
    cancelled=0; w.cropPhotoFile({},x=>{got=x;},()=>{cancelled++;}); await sleep(20);
    ok(cancelled===1&&/Couldn’t read that image/.test(alertText(w)),'unreadable file: message shown instead of nothing happening');
    closeAlert(w);
    w.FileReader=RealFR;
    const RealImg=w.Image;
    w.Image=function(){ const im={}; Object.defineProperty(im,'src',{set(v){ setTimeout(()=>im.onerror&&im.onerror(),1); }}); return im; };
    cancelled=0; w.cropPhotoFile(new w.File(['%PDF-1.4'],'a.heic',{type:'image/heic'}),x=>{got=x;},()=>{cancelled++;}); await sleep(50);
    ok(cancelled===1&&/Try a JPG or PNG/.test(alertText(w)),'HEIC or other format the browser cannot show: friendly message');
    closeAlert(w);
    w.Image=RealImg;
    ok(w.__errs.length===0,'no script errors in the cropper cases');
  }
  // ---------- sign-in screen, invite links ----------
  {
    const cases=[['#join=maple-harbor-4827','MAPLE-HARBOR-4827'],['#join=MAPLE-HARBOR-4827&x=1','MAPLE-HARBOR-4827'],['#x=1&join=0000-0001','0000-0001']];
    for(const [hash,want] of cases){
      const w=boot({url:'http://localhost/'+hash}); await sleep(30);
      ok($(w,'householdCode').value===want,'invite link '+hash+' fills in '+want);
    }
    const w=boot({url:'http://localhost/#join=ab'}); await sleep(30);
    ok($(w,'householdCode').value===''&&$(w,'gate').style.display!=='none','too-short invite code is ignored, sign-in screen shown');
    const w2=boot(); await sleep(30);
    await signIn(w2,'Sam','  maple harbor 4827 '); await sleep(30);
    ok(w2.eval('household.code')==='MAPLE-HARBOR-4827','typed code with spaces and lower case becomes MAPLE-HARBOR-4827');
    const w3=boot(); await sleep(30);
    await signIn(w3,'Sam','MAPLE/HARBOR'); await sleep(10);
    ok(w3.eval('household.code')===''&&/6–40 letters/.test($(w3,'gateError').textContent),'code with a slash refused with a clear message (no odd Firestore path)');
    await signIn(w3,'Sam','00000042'); await sleep(30);
    ok(w3.eval('household.code')==='00000042','code with leading zeros kept exactly');
    // deep link to another household while signed in: shows the sign-in screen for the new code, does not mix boards
    store['OTHER-HOUSE-1']={items:[{id:5,name:'Other',category:'Home',subcategory:'',cost:1,month:'No date yet',owner:'',link:'',completed:false}],people:[{id:'q',name:'Kit'}],activity:[],categories:null,clientId:'z',updatedAt:'x'};
    const w4=boot({url:'http://localhost/#join=OTHER-HOUSE-1',ls:{ledgerHousehold:JSON.stringify({code:'MAPLE-HARBOR-4827',name:'Sam',personId:null})}}); await sleep(80);
    ok($(w4,'gate').style.display!=='none'&&$(w4,'householdCode').value==='OTHER-HOUSE-1'&&$(w4,'yourName').value==='Sam','invite to another household while signed in: sign-in screen with the new code and my name');
    $(w4,'gateBtn').click(); await sleep(100);
    ok(w4.eval('household.code')==='OTHER-HOUSE-1'&&w4.eval('items.length')===1&&w4.eval('items[0].name')==='Other','joining it shows only the new household board');
  }
  // ---------- private mode: storage throws on every access ----------
  {
    const w=boot({noStorage:true}); await sleep(50);
    ok(w.eval("(()=>{ try { localStorage.length; return 'ok'; } catch(e){ return 'threw'; } })()")==='threw','(storage really is blocked in this test)');
    ok(w.__errs.length===0,'app starts when storage is blocked');
    await signIn(w,'Sam','PRIVATE-MODE-1'); await sleep(50);
    ok($(w,'app').style.display==='block'&&w.eval('household.code')==='PRIVATE-MODE-1','sign-in works without storage');
    w.eval(`items.push({id:1,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:'No date yet',owner:'Sam',link:'',completed:false}); render()`);
    await sleep(700);
    ok(store['PRIVATE-MODE-1']&&store['PRIVATE-MODE-1'].items.length===1,'changes still sync without storage');
    w.eval('unlockAdmin()'); ok(w.eval('adminUnlocked()')===true,'profile unlock works for this visit without storage');
    w.eval('initBackupReminder(); updateBackupBanner(); updateLastBackupLabel()');
    ok($(w,'backupBanner').hidden===true,'no backup nag when nothing can be remembered');
    ok(w.__errs.length===0,'no script errors in private mode');
    // install hint shown at most once per visit even though it can't be remembered
    w.eval('deferredInstallPrompt={prompt(){},userChoice:Promise.resolve()}');
    w.maybeShowInstallHint(); ok($(w,'installHint').hidden===false,'install hint shows');
    w.dismissInstallHint(); w.maybeShowInstallHint();
    ok($(w,'installHint').hidden===true,'dismissed install hint does not come back in the same visit');
  }
  // ---------- install advice on different browsers ----------
  {
    const UA={
      safari:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      chromeIos:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
      googleApp:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0.1 Mobile/15E148 Safari/604.1',
      facebook:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 [FBAN/FBIOS;FBAV/400.0]',
      firefox:'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
    };
    const results={};
    for(const k in UA){
      const w=boot({ua:UA[k]}); await sleep(30);
      await signIn(w,'Sam','INSTALL-UA-1'); await sleep(30);
      w.updateInstallUi();
      results[k]={ ios:w.isIosSafari(), hint:!$(w,'installHint').hidden, text:$(w,'installRowText').textContent };
    }
    ok(results.safari.ios&&results.safari.hint&&/Share/.test(results.safari.text),'iPhone Safari: Share → Add to Home Screen advice');
    ok(!results.chromeIos.ios&&!results.chromeIos.hint,'Chrome on iPhone: no Safari-only hint');
    ok(!results.googleApp.ios&&!results.googleApp.hint&&/open this page in Safari/.test(results.googleApp.text),'Google app on iPhone: told to open in Safari, no misleading hint');
    ok(!results.facebook.ios&&!results.facebook.hint,'Facebook in-app browser: no misleading hint');
    ok(!results.firefox.ios&&!results.firefox.hint&&/Chrome or Edge/.test(results.firefox.text),'desktop Firefox (no install prompt): general advice, no popup');
    const w=boot(); await sleep(30); await signIn(w,'Sam','INSTALL-UA-2'); await sleep(30);
    w.eval('deferredInstallPrompt={prompt(){ throw new Error("already used"); }}');
    await w.installFromHint();
    ok(w.__errs.length===0&&w.eval('deferredInstallPrompt')===null,'an install prompt that fails does not break anything');
  }
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})();
