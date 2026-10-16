const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
let store={}, listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
function boot(ls){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){
    w.__cloudAdapterFactory=fakeFactory;
    for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('window.'+k+' used'); };
    w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
    if(ls) for(const k in ls) w.localStorage.setItem(k,ls[k]);
  }});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0,pass=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const CODE='PROFILE-TEST-1234';
async function signIn(w,name,code){ w.document.getElementById('householdCode').value=code||CODE; w.document.getElementById('yourName').value=name; await w.enterApp(); }
const $=(w,id)=>w.document.getElementById(id);
const tapN=(w,n,gap)=>{ return (async()=>{ for(let i=0;i<n;i++){ w.onVersionTap(); if(gap) await sleep(gap); } })(); };
const confirmOpen=w=>$(w,'confirmOverlay').style.display==='flex';

(async()=>{
  await sleep(50);
  // ---------- 1. ids for legacy people ----------
  {
    const w=boot(); await sleep(30);
    const r=w.eval(`ensurePersonIds([{name:'Sam',photo:null},{id:5.5,name:'Alex'},{name:'sam'},{id:5.5,name:'Dup'},{name:'Kit',id:''}])`);
    ok(r.assigned&&r.people.length===5,'legacy people all kept');
    ok(r.people.every(p=>p.id!=null&&p.id!==''),'every person has an id');
    ok(new Set(r.people.map(p=>String(p.id))).size===5,'ids are unique (even for duplicate names / duplicate ids)');
    ok(r.people[1].id===5.5&&typeof r.people[1].id==='number','existing numeric id left untouched');
    const r2=w.eval(`ensurePersonIds([{name:'Sam'},{id:5.5,name:'Alex'},{name:'sam'}])`);
    ok(r2.people[0].id===r.people[0].id,'derived id is deterministic (two devices agree)');
    ok(w.eval(`ensurePersonIds([{id:1,name:'A'}]).assigned`)===false,'nothing assigned when all have ids');
    ok(w.eval(`ensurePersonIds(null).people.length`)===0&&w.eval(`ensurePersonIds([null,3,{id:1}]).people.length`)===0,'junk entries dropped, null ok');
    const orig=[{name:'Sam'}]; w.eval(`ensurePersonIds(${JSON.stringify(orig)})`);
    const st=w.eval(`stateFromDoc({items:[],people:[{name:'Zed'}]})`);
    ok(st.idsAssigned===true&&st.people[0].id,'stateFromDoc assigns ids');
  }
  // ---------- 2. legacy cloud doc: ids assigned on load and saved back ----------
  store[CODE]={items:[{id:1,name:'Tires',category:'Vehicle',subcategory:'',cost:600,month:'No date yet',saved:0,owner:'Sam',link:'',completed:false},
                       {id:2,name:'Old done',category:'Home',subcategory:'',cost:50,month:'No date yet',saved:0,owner:'Sam',link:'',completed:true,actualCost:40},
                       {id:3,name:'Trashed',category:'Home',subcategory:'',cost:20,month:'No date yet',saved:0,owner:'Sam',link:'',completed:false,deletedAt:Date.now()-1000},
                       {id:4,name:'Alex thing',category:'Home',subcategory:'',cost:20,month:'No date yet',saved:0,owner:'Alex',link:'',completed:false}],
               people:[{id:111.25,name:'Sam',photo:null},{name:'Alex',photo:null}],activity:[],categories:null,clientId:'other',updatedAt:'x'};
  const A=boot(), B=boot(); await sleep(50);
  await signIn(A,'sam');   // lower case: finds the existing Sam
  ok(A.eval('people.length')===2,'typed name finds existing person case-insensitively (no duplicate)');
  ok(A.eval('household.name')==='Sam'&&A.eval('household.personId')===111.25,'signed in as the existing person, canonical name + id');
  ok(A.eval('people.every(p=>p.id!=null&&p.id!=="")'),'legacy Alex got an id');
  await sleep(700);
  ok(store[CODE].people.every(p=>p.id!=null&&p.id!==''),'assigned ids were saved back to the shared board');
  const ses=JSON.parse(A.localStorage.getItem('ledgerHousehold'));
  ok(ses.code===CODE&&ses.name==='Sam'&&ses.personId===111.25,'session stores code + name + person id');
  // ---------- 3. auto-create at sign-in ----------
  await signIn(B,'Jordan'); await sleep(50);
  ok(B.eval('people.length')===3&&B.eval("people.find(p=>p.name==='Jordan')").id,'new name creates a profile automatically');
  ok(String(B.eval('household.personId'))===String(B.eval("people.find(p=>p.name==='Jordan').id")),'B signed in as the new person');
  ok(/joined the household/.test(B.eval('activity[0].text')),'join logged');
  ok(!/>\+ Person<|openPeopleModal|addPerson\(\)|>Add person</.test(html),'+ Person button and Add person flow are gone');
  await sleep(800);
  ok(A.eval('people.length')===3,'A sees Jordan via sync');
  // header button
  ok($(A,'profileBtnName').textContent==='Sam'&&$(A,'profileBtnAvatar').textContent.trim()==='S','header profile button: first name + initials');
  ok(/Signed in as Sam/.test($(A,'hhCodeLabel').textContent),'signed in as label');
  ok($(A,'yourName').getAttribute('maxlength')==='40','name field capped at 40');
  // profile modal
  A.openProfileModal();
  ok($(A,'profileOverlay').style.display==='flex'&&$(A,'profileNameInput').value==='Sam'&&$(A,'profileHeroName').textContent==='Sam','profile page opens with my name');
  const ml=$(A,'memberList');
  ok(/Alex/.test(ml.textContent)&&/Jordan/.test(ml.textContent)&&!/Sam/.test(ml.textContent),'members list shows the others only');
  ok(!ml.querySelector('button,input,select,a'),'members list has no edit controls');
  ok(/your own name and photo/.test($(A,'profileHint').textContent),'hint about who can edit what');
  A.closeProfileModal();

  // ---------- 5/6. rename ----------
  const aliasMine=()=>A.eval("people.find(p=>p.id===111.25)");
  let r=A.eval(`renamePerson(111.25,'   ')`); ok(!r.ok&&/name/i.test(r.error),'empty name rejected');
  r=A.eval(`renamePerson(111.25,'${'x'.repeat(41)}')`); ok(!r.ok&&/40/.test(r.error),'too long rejected');
  r=A.eval(`renamePerson(111.25,'alex')`); ok(!r.ok&&/already called/.test(r.error)&&aliasMine().name==='Sam','duplicate (case-insensitive) rejected, nothing changed');
  r=A.eval(`renamePerson(111.25,'  JORDAN ')`); ok(!r.ok&&aliasMine().name==='Sam','duplicate with padding rejected');
  r=A.eval(`renamePerson(111.25,'Sam')`); ok(r.ok&&!r.changed&&A.eval('activity.length')>0&&!/now called/.test(A.eval('activity[0].text')),'same name is a no-op');
  // UI error notice
  A.openProfileModal(); $(A,'profileNameInput').value='Alex'; A.saveMyName();
  ok(/already called/.test($(A,'profileNameError').textContent)&&$(A,'profileOverlay').style.display==='flex','profile page shows the error inline and stays open');
  $(A,'profileNameInput').value='Samantha Q'; A.saveMyName();
  ok($(A,'profileOverlay').style.display==='none','successful rename closes the page');
  ok(aliasMine().name==='Samantha Q','person renamed');
  ok(A.eval("items.filter(i=>i.owner==='Samantha Q').map(i=>i.id).sort().join()")==='1,2,3','owner rewritten on active, completed AND deleted items');
  ok(A.eval("items.filter(i=>i.owner==='Sam').length")===0&&A.eval("items.find(i=>i.id===4).owner")==='Alex','nobody else touched');
  ok(A.eval('household.name')==='Samantha Q'&&JSON.parse(A.localStorage.getItem('ledgerHousehold')).name==='Samantha Q'&&JSON.parse(A.localStorage.getItem('ledgerHousehold')).personId===111.25,'local signed-in name + stored session updated, id kept');
  ok(/Signed in as Samantha Q/.test($(A,'hhCodeLabel').textContent)&&$(A,'profileBtnName').textContent==='Samantha','header + label updated');
  ok(A.eval('activity[0].text')==='Sam is now called Samantha Q','activity logged');
  ok(!!A.document.querySelector('#toast')&&/Samantha Q/.test($(A,'toast').textContent)&&!!$(A,'toastUndo'),'undo toast shown');
  await sleep(900);
  // ---------- 7. other device follows ----------
  ok(B.eval("people.find(p=>p.id===111.25).name")==='Samantha Q'&&B.eval("items.find(i=>i.id===3).owner")==='Samantha Q','B received rename + item owners as one state change');
  ok(B.eval('household.name')==='Jordan','B (Jordan) unaffected');
  // C signed in as Sam on another device
  const C=boot(); await sleep(30);
  // C was signed in as Sam before the rename (remembered session with id)
  // simulate: C signs in now as Samantha Q then A renames again
  await signIn(C,'Samantha Q'); await sleep(900);
  ok(C.eval('household.personId')===111.25,'C matched by name -> id');
  A.eval(`renamePerson(111.25,'Sammy')`); await sleep(900);
  ok(C.eval('household.name')==='Sammy'&&/Signed in as Sammy/.test($(C,'hhCodeLabel').textContent),'C follows the rename via id: label shows the new name');
  ok(JSON.parse(C.localStorage.getItem('ledgerHousehold')).name==='Sammy'&&C.eval('isMe(people.find(p=>p.id===111.25))'),'C session name updated and still "me"');
  ok($(C,'profileBtnName').textContent==='Sammy','C header button updated');
  // undo rename on A
  A.runToastUndo?A.runToastUndo():null;
  // the latest toast belongs to the Sammy rename (undo)
  await sleep(50);
  ok(A.eval("people.find(p=>p.id===111.25).name")==='Samantha Q'&&A.eval("items.filter(i=>i.owner==='Samantha Q').length")===3,'Undo restores name and item owners');
  ok(A.eval('household.name')==='Samantha Q','undo restores signed-in name');
  await sleep(900);
  ok(C.eval('household.name')==='Samantha Q','C follows the undo as well');

  // ---------- 8. non-own edits blocked at function level ----------
  const alexId=A.eval("people.find(p=>p.name==='Alex').id");
  const before=JSON.stringify(A.eval('({people,items})'));
  r=A.eval(`renamePerson(${JSON.stringify(alexId)},'Alexandra')`); ok(!r.ok&&r.blocked,'cannot rename someone else');
  ok(A.eval(`setPersonPhoto(${JSON.stringify(alexId)},'data:image/png;base64,AAAA')`)===false,'cannot set someone else\'s photo');
  ok(A.eval(`removePersonPhoto(${JSON.stringify(alexId)})`)===false,'cannot remove someone else\'s photo');
  ok(A.eval(`addPerson('Zoe')`).blocked===true,'cannot add a person when locked');
  ok(A.eval(`removePerson(${JSON.stringify(alexId)})`).blocked===true,'cannot remove a person when locked');
  A.eval(`changePersonPhoto(${JSON.stringify(alexId)})`); ok(A.eval('photoTargetId')!==alexId,'photo picker for someone else does not even open');
  ok(JSON.stringify(A.eval('({people,items})'))===before,'nothing changed by the blocked calls');
  ok(A.eval(`openAdminModal()`)===undefined&&$(A,'peopleOverlay').style.display!=='flex','admin list does not open while locked');
  ok($(A,'adminRow').style.display==='none'&&!/Manage all profiles/.test($(A,'settingsPane-general').textContent),'admin row hidden when locked');
  // assigning items to others still works
  A.openItemModal(); const opts=[...$(A,'f_owner').options].map(o=>o.value);
  ok(opts.includes('Alex')&&opts.includes('Jordan')&&opts.includes('Samantha Q'),'owner dropdown lists every profile');
  $(A,'f_name').value='For Alex'; $(A,'f_cost').value='10'; $(A,'f_owner').value='Alex'; A.saveItem();
  ok(A.eval("items.find(i=>i.name==='For Alex').owner")==='Alex','items can be assigned to others');

  // ---------- 9. backdoor ----------
  A.openSettingsModal(); A.showSettingsTab('advanced');
  ok($(A,'appVersion').textContent==='Horizon · version '+A.eval('APP_VERSION'),'version line');
  await tapN(A,6); ok(!A.eval('adminUnlocked()'),'6 taps do nothing');
  A.eval('versionTaps=[]'); await tapN(A,7,700); ok(!A.eval('adminUnlocked()'),'7 slow taps (over 4s) do nothing');
  A.eval('versionTaps=[]'); await tapN(A,7); ok(A.eval('adminUnlocked()'),'7 quick taps unlock');
  ok($(A,'adminRow').style.display!=='none'&&/Manage all profiles/.test($(A,'adminRow').textContent)&&/Lock again/.test($(A,'adminRow').textContent),'Manage all profiles + Lock again shown');
  ok(A.localStorage.getItem('horizonProfilesUnlocked')==='1','unlock persisted');
  A.closeSettingsModal();
  // persisted across reload (new window with same storage)
  const A2=boot({horizonProfilesUnlocked:'1'}); await sleep(20);
  ok(A2.eval('adminUnlocked()')===true,'unlock survives a reload');
  A2.openSettingsModal(); ok($(A2,'adminRow').style.display!=='none','admin row visible after reload');

  // ---------- 10. admin: add / rename / remove ----------
  A.openAdminModal(); ok($(A,'peopleOverlay').style.display==='flex'&&A.document.querySelectorAll('#peopleList .person-row').length===3,'admin list shows everyone');
  $(A,'p_name').value='alex'; A.adminAddFromForm(); ok(/already called/.test($(A,'adminError').textContent)&&A.eval('people.length')===3,'admin add rejects duplicate');
  $(A,'p_name').value='Zoe'; A.adminAddFromForm();
  ok(A.eval('people.length')===4&&A.eval("people.find(p=>p.name==='Zoe').id")&&A.document.querySelectorAll('#peopleList .person-row').length===4,'admin can add a person');
  let row=A.document.querySelector(`#peopleList [data-pid="${alexId}"]`);
  row.querySelector('.admin-name').value='Alexandra'; A.adminRename(row.querySelector('.icon-btn'));
  ok(A.eval("people.find(p=>p.id==="+JSON.stringify(alexId)+").name")==='Alexandra','admin can rename anyone');
  ok(A.eval("items.filter(i=>i.owner==='Alexandra').length")===2&&A.eval("items.find(i=>i.id===4).owner")==='Alexandra'&&A.eval("items.find(i=>i.name==='For Alex').owner")==='Alexandra','...and their items follow');
  row=A.document.querySelector(`#peopleList [data-pid="${alexId}"]`);
  row.querySelector('.admin-name').value='jordan'; A.adminRename(row.querySelector('.icon-btn'));
  ok(/already called/.test(row.querySelector('.field-error').textContent)||/already called/.test(A.document.querySelector(`#peopleList [data-pid="${alexId}"] .field-error`).textContent),'admin rename also enforces unique names');
  ok(A.eval(`setPersonPhoto(${JSON.stringify(alexId)},'data:image/png;base64,AAAA')`)===true&&A.eval("people.find(p=>p.name==='Alexandra').photo")!==null,'admin can set anyone\'s photo');
  ok(A.eval(`removePersonPhoto(${JSON.stringify(alexId)})`)===true&&A.eval("people.find(p=>p.name==='Alexandra').photo")===null,'admin can remove anyone\'s photo');
  // can't remove self
  const meId=A.eval('household.personId');
  ok(!A.document.querySelector(`#peopleList [data-pid="${meId}"] .person-remove`),'no Remove person button on my own row');
  ok(A.eval(`removePerson(${JSON.stringify(meId)})`).ok===false,'removePerson refuses my own profile');
  // remove Alexandra: confirm, items keep name text
  A.adminRemove(A.document.querySelector(`#peopleList [data-pid="${alexId}"] .person-remove`));
  ok(confirmOpen(A)&&/Alexandra/.test($(A,'confirmTitle').textContent)&&/plain text/.test($(A,'confirmMsg').textContent),'remove asks first and explains');
  $(A,'confirmCancel').click(); await sleep(5); ok(A.eval('people.length')===4,'cancel keeps her');
  A.adminRemove(A.document.querySelector(`#peopleList [data-pid="${alexId}"] .person-remove`)); $(A,'confirmOk').click(); await sleep(10);
  ok(A.eval('people.length')===3&&!A.eval("people.some(p=>p.name==='Alexandra')"),'person removed from the list');
  ok(A.eval("items.filter(i=>i.owner==='Alexandra').length")===2,'items keep the owner name as plain text');
  A.openItemModal(A.eval("items.find(i=>i.name==='For Alex')")); 
  ok($(A,'f_owner').value==='Alexandra','edit form still shows the removed person\'s name as owner (not reset to "No one")');
  A.closeItemModal();
  ok(!!$(A,'toastUndo'),'undo toast for removal'); A.runToastUndo(); ok(A.eval("people.some(p=>p.name==='Alexandra')")&&A.eval('people.length')===4,'undo puts the person back');
  A.closeAdminModal();
  await sleep(900);
  // lock again
  A.openSettingsModal(); A.lockAdmin();
  ok(!A.eval('adminUnlocked()')&&$(A,'adminRow').style.display==='none'&&A.localStorage.getItem('horizonProfilesUnlocked')===null,'Lock again re-locks and clears storage');
  ok(A.eval(`addPerson('Nope')`).blocked===true,'locked again: functions blocked');
  A.closeSettingsModal();

  // ---------- 4. backup round trip ----------
  let blobText=null; A.URL.createObjectURL=b=>{ b.text().then(t=>blobText=t); return 'blob:x'; };
  A.exportBackup(); await sleep(100);
  const bk=JSON.parse(blobText);
  ok(bk.people.length===4&&bk.people.every(p=>p.id!=null&&p.id!==''),'backup keeps person ids');
  A.eval(`people=people.slice(0,1)`); A.render();
  A.onRestoreFileChosen({files:[new A.File([blobText],'b.json')],value:'x'}); await sleep(100); $(A,'confirmOk').click(); await sleep(100);
  ok(A.eval('people.length')===4&&A.eval("people.find(p=>p.id===111.25).name")==='Samantha Q','restore keeps people and ids');
  // old backup without ids
  const old=JSON.parse(blobText); old.people=old.people.map(p=>{ const q=Object.assign({},p); delete q.id; return q; });
  A.onRestoreFileChosen({files:[new A.File([JSON.stringify(old)],'old.json')],value:'x'}); await sleep(100); $(A,'confirmOk').click(); await sleep(100);
  ok(A.eval('people.length')===4&&A.eval('people.every(p=>p.id!=null&&p.id!=="")')&&new Set(A.eval('people.map(p=>String(p.id))')).size===4,'old backup without ids: ids assigned on restore');
  ok(A.eval('household.name')==='Samantha Q'&&A.eval('isMe(currentPerson())')&&A.eval('household.personId')===A.eval("people.find(p=>p.name==='Samantha Q').id"),'still signed in after the restore (re-matched by name)');
  await sleep(900); ok(store[CODE].people.every(p=>p.id!=null&&p.id!==''),'restored ids synced');

  // ---------- 11. remembered sessions ----------
  // (a) legacy session (no personId): matched by name, stays signed in, no chooser
  const L=boot({ledgerHousehold:JSON.stringify({code:CODE,name:'Jordan'})}); await sleep(800);
  ok($(L,'app').style.display==='block'&&!$(L,'chooseOverlay').style.display.includes('flex')&&L.eval('household.name')==='Jordan'&&L.eval('household.personId')!=null,'legacy stored sign-in (no id) stays signed in and gets an id by name');
  ok(JSON.parse(L.localStorage.getItem('ledgerHousehold')).personId===L.eval('household.personId'),'id now remembered');
  // (b) stored id whose person was renamed elsewhere: matched by id, no chooser
  const jid=A.eval("people.find(p=>p.name==='Jordan').id");
  const R=boot({ledgerHousehold:JSON.stringify({code:CODE,name:'Old Name',personId:jid})}); await sleep(800);
  ok($(R,'app').style.display==='block'&&R.eval('household.name')==='Jordan'&&$(R,'yourName').value==='Jordan','renamed elsewhere: matched by id, picks up the new name');
  // (c) neither matches: chooser
  const N=boot({ledgerHousehold:JSON.stringify({code:CODE,name:'Ghost',personId:'nope'})}); await sleep(800);
  ok($(N,'chooseOverlay').style.display==='flex'&&/Which profile is you/.test($(N,'chooseTitle').textContent)&&N.document.querySelectorAll('#chooseList .chooser-btn').length===4,'no match: "Which profile is you?" lists the profiles');
  ok($(N,'app').style.display!=='block','not signed in until chosen');
  N.document.querySelector('#chooseList .chooser-btn').click(); await sleep(50);
  ok($(N,'app').style.display==='block'&&$(N,'chooseOverlay').style.display==='none'&&N.eval('household.personId')!=null&&N.eval('isMe(currentPerson())'),'picking a profile signs in as it');
  ok(JSON.parse(N.localStorage.getItem('ledgerHousehold')).name===N.eval('household.name'),'choice remembered');
  // (d) chooser -> create new
  const N2=boot({ledgerHousehold:JSON.stringify({code:CODE,name:'Ghost',personId:'nope'})}); await sleep(800);
  $(N2,'chooseNewName').value='Jordan'; N2.chooseCreate(); ok(/already called/.test($(N2,'chooseError').textContent)&&$(N2,'chooseOverlay').style.display==='flex','create new rejects a duplicate name');
  $(N2,'chooseNewName').value='Ghost'; N2.chooseCreate(); await sleep(50);
  ok($(N2,'app').style.display==='block'&&N2.eval('household.name')==='Ghost'&&N2.eval("people.some(p=>p.name==='Ghost')"),'create new makes a profile and signs in');
  // (e) cancel returns to the gate
  const N3=boot({ledgerHousehold:JSON.stringify({code:CODE,name:'Ghost2',personId:'nope'})}); await sleep(800);
  N3.chooseDone(null); await sleep(30);
  ok($(N3,'app').style.display!=='block'&&/Pick or create/.test($(N3,'gateError').textContent),'cancel leaves you on the sign-in page');
  // (f) profile removed from under a signed-in device
  await sleep(900);
  B.eval('household'); const bId=B.eval('household.personId');
  A.eval(`adminUnlockedFlag=true`);
  A.eval(`removePerson(${JSON.stringify(bId)})`); await sleep(900);
  ok($(B,'chooseOverlay').style.display==='flex','B: when my profile disappears, the chooser appears');
  B.document.querySelector('#chooseList .chooser-btn').click(); await sleep(30);
  ok($(B,'chooseOverlay').style.display==='none'&&B.eval('isMe(currentPerson())'),'B picks a profile again');

  // ---------- 12. dead code gone / guide ----------
  ok(!/id="p_photo"|p_avatarPreview|pendingPhotoData|clearPhotoChoice|btn-manage/.test(html),'old add-person photo UI removed');
  ok(!/under \+ Person/.test(html),'style guide no longer mentions + Person');
  ok(/<span class="app-version version-tap"|class="app-version version-tap"/.test(html)&&!/7 times|seven taps|backdoor|tap the version/i.test(html.replace(/<script>[\s\S]*<\/script>/,m=>m.replace(/\/\/.*$/gm,''))),'backdoor not advertised in visible text');
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})();
