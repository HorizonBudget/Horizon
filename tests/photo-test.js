const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
// fake firestore shared by both "devices"
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb,err){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
function boot(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){ w.__cloudAdapterFactory=fakeFactory; w.alert=m=>{console.log('ALERT',m)}; w.confirm=()=>true; }});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const A=boot(), B=boot(); await sleep(50);
  A.document.getElementById('householdCode').value='PHOTO-TEST-1234'; A.document.getElementById('yourName').value='Sam';
  await A.enterApp();
  A.document.getElementById('f_name').value='x'; A.openItemModal(); A.document.getElementById('f_name').value='Tires'; A.document.getElementById('f_cost').value='600';
  A.document.getElementById('f_owner').value='Sam'; A.saveItem(); await sleep(700);
  B.document.getElementById('householdCode').value='PHOTO-TEST-1234'; B.document.getElementById('yourName').value='Alex'; await B.enterApp(); await sleep(1200);
  A.openProfileModal();
  const prof=()=>A.document.getElementById('profileOverlay');
  ok(prof().style.display==='flex'&&/Add photo/.test(A.document.getElementById('profileChangePhoto').textContent)&&A.document.getElementById('profileRemovePhoto').style.display==='none','no photo -> Add photo only');
  const id=A.eval("people.find(p=>p.name==='Sam').id");
  const PH='data:image/jpeg;base64,/9j/AAAA';
  A.eval(`setPersonPhoto(${JSON.stringify(id)}, ${JSON.stringify(PH)})`);
  ok(A.eval("people.find(p=>p.name==='Sam').photo")===PH,'photo set');
  ok(A.eval("activity[0].text")==="Sam updated Sam's photo",'activity: '+A.eval("activity[0].text"));
  ok(!!A.document.querySelector('#profileBigAvatar img.avatar')&&/Change photo/.test(A.document.getElementById('profileChangePhoto').textContent)&&A.document.getElementById('profileRemovePhoto').style.display!=='none','profile shows img + Change/Remove photo');
  ok(!!A.document.querySelector('#profileBtnAvatar img.avatar'),'header profile button shows the photo');
  ok(!!A.document.querySelector('#itemsList img.avatar, #itemsList img.avatar-sm'),'item owner chip uses img');
  await sleep(800);
  ok(B.eval("people.find(p=>p.name==='Sam').photo")===PH,'B device sees photo via sync');
  A.eval(`removePersonPhoto(${JSON.stringify(id)})`);
  ok(A.eval("people.find(p=>p.name==='Sam').photo")===null,'photo cleared');
  ok(A.eval("activity[0].text")==="Sam removed Sam's photo",'activity: '+A.eval("activity[0].text"));
  ok(!A.document.querySelector('#profileBigAvatar img.avatar')&&/Add photo/.test(A.document.getElementById('profileChangePhoto').textContent)&&A.document.getElementById('profileRemovePhoto').style.display==='none','initials + Add photo restored');
  ok(!A.document.querySelector('#itemsList img.avatar, #itemsList img.avatar-sm'),'item chip back to initials');
  await sleep(800);
  ok(B.eval("people.find(p=>p.name==='Sam').photo")===null,'B sees removal');
  // B is Alex: cannot change Sam's photo
  ok(B.eval(`setPersonPhoto(${JSON.stringify(id)}, 'x')`)===false&&B.eval("people.find(p=>p.name==='Sam').photo")===null,'B cannot change Sam\'s photo');
  ok(A.eval("setPersonPhoto('nope','x')")===false,'unknown id no throw');
  console.log(fails?('FAILS '+fails):'ALL OK'); process.exit(0);
})();
