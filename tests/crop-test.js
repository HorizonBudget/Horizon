const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
const w=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){ w.alert=m=>{ throw new Error('window.alert used'); }; }}).window;
const d=w.document; let pass=0,fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const V=240;
// ---- pure math ----
ok(near(w.cropMinScale(1000,500,V),0.48)&&near(w.cropMinScale(500,1000,V),0.48)&&near(w.cropMinScale(100,100,V),2.4),'min scale uses the shorter side (landscape, portrait, small)');
for(const [iw,ih] of [[1000,500],[500,1000],[240,240],[100,60],[4000,3000],[161,5000]]){
  const ini=w.cropInitial(iw,ih,V), min=w.cropMinScale(iw,ih,V);
  const covers=(st)=>st.x<=1e-9&&st.y<=1e-9&&iw*st.scale+st.x>=V-1e-9&&ih*st.scale+st.y>=V-1e-9;
  ok(near(ini.scale,min)&&covers(ini),`initial covers view ${iw}x${ih}`);
  // fuzz: any scale/offset gets clamped to full coverage
  let all=true;
  for(const sc of [0.001,min*0.5,min,min*1.7,min*4,min*40]) for(const x of [-1e6,-300,0,500,1e6]) for(const y of [-1e6,-77,0,321,1e6]){
    const c=w.cropClamp({scale:sc,x,y},iw,ih,V);
    if(!covers(c)||c.scale<min-1e-9||c.scale>min*4+1e-9) all=false;
  }
  ok(all,`clamp always keeps the circle fully covered, zoom within [1x,4x] ${iw}x${ih}`);
  // zoom about a point keeps that image point fixed (unless clamped)
  const z=w.cropZoomAt(w.cropInitial(iw,ih,V),min*2,V/2,V/2,iw,ih,V);
  ok(covers(z)&&near(z.scale,min*2),`zoom at centre covers ${iw}x${ih}`);
  const r=w.cropSourceRect(z,V);
  ok(near(r.sw,V/z.scale)&&near(r.sx+r.sw/2, (V/2-z.x)/z.scale) && r.sx>=-1e-9 && r.sy>=-1e-9 && r.sx+r.sw<=iw+1e-6 && r.sy+r.sh<=ih+1e-6,`source rect lies inside the image ${iw}x${ih}`);
}
// zoom-at keeps the anchor point (interior case)
{ const iw=2000,ih=2000; let st=w.cropClamp({scale:w.cropMinScale(iw,ih,V)*2,x:-200,y:-150},iw,ih,V);
  const fx=100,fy=60, ix=(fx-st.x)/st.scale, iy=(fy-st.y)/st.scale;
  const z=w.cropZoomAt(st,st.scale*1.5,fx,fy,iw,ih,V);
  ok(near((fx-z.x)/z.scale,ix,1e-6)&&near((fy-z.y)/z.scale,iy,1e-6),'zoom keeps the point under the cursor fixed'); }
// full-zoom-out source rect is the centred square
{ const r=w.cropSourceRect(w.cropInitial(1000,500,V),V); ok(near(r.sx,250)&&near(r.sy,0)&&near(r.sw,500)&&near(r.sh,500),'initial source rect = centred square (same as old centre-crop)'); }

// ---- editor flow with a stubbed renderer (jsdom has no canvas) ----
const img={naturalWidth:800,naturalHeight:400,src:'data:image/png;base64,AAAA'};
let got=null,cancelled=0;
let renderArgs=null; w.cropRender=(i,iw,ih,st,view,out)=>{ renderArgs={iw,ih,st,view,out}; return 'data:image/jpeg;base64,CROPPED'; };
w.openCropEditor(img,x=>{got=x;},()=>{cancelled++;});
ok(d.getElementById('cropOverlay').style.display==='flex'&&d.getElementById('cropImg').getAttribute('src')===img.src,'editor opens with the image');
ok(/scale\(0\.6\)/.test(d.getElementById('cropImg').style.transform)&&d.getElementById('cropZoom').value==='1','starts at min zoom (slider 1)');
// drag via pointer events
const stage=d.getElementById('cropStage');
stage.getBoundingClientRect=()=>({left:0,top:0,width:240,height:240});
stage.setPointerCapture=()=>{};
const pe=(t,id,x,y,extra)=>stage.dispatchEvent(Object.assign(new w.MouseEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0}),{pointerId:id,pointerType:'touch'},extra||{}));
// zoom first so there is room to pan
d.getElementById('cropZoom').value='2'; d.getElementById('cropZoom').dispatchEvent(new w.Event('input',{bubbles:true}));
let st=w.eval('crop.st'); ok(near(st.scale,1.2),'slider 2x -> scale '+st.scale);
const x0=st.x;
pe('pointerdown',1,100,100); pe('pointermove',1,130,100); pe('pointerup',1,130,100);
ok(near(w.eval('crop.st.x'),Math.min(0,x0+30)),'one-finger drag pans: '+x0+' -> '+w.eval('crop.st.x'));
pe('pointerdown',1,100,100); pe('pointermove',1,-5000,-5000); pe('pointerup',1,-5000,-5000);
{ const c=w.eval('crop.st'); ok(c.x>=240-800*c.scale-1e-9 && c.y>=240-400*c.scale-1e-9 && c.x<=0 && c.y<=0,'drag far away is clamped, circle still covered'); }
// pinch
const before=w.eval('crop.st.scale');
pe('pointerdown',1,80,120); pe('pointerdown',2,160,120);
pe('pointermove',2,200,120);   // distance 80 -> 120 (x1.5)
pe('pointerup',2,200,120); pe('pointerup',1,80,120);
ok(near(w.eval('crop.st.scale'),before*1.5,1e-6)&&near(parseFloat(d.getElementById('cropZoom').value),before*1.5/0.6,1e-6),'pinch zooms by finger-distance ratio and moves slider: '+before+' -> '+w.eval('crop.st.scale'));
pe('pointerdown',1,80,120); pe('pointerdown',2,160,120); pe('pointermove',2,2000,120); pe('pointerup',2,0,0); pe('pointerup',1,0,0);
ok(w.eval('crop.st.scale')<=0.6*4+1e-9,'pinch capped at 4x');
// wheel
{ const s0=w.eval('crop.st.scale'); const ev=new w.WheelEvent('wheel',{deltaY:-200,clientX:120,clientY:120,bubbles:true,cancelable:true}); stage.dispatchEvent(ev);
  ok(ev.defaultPrevented&&near(w.eval('crop.st.scale'),Math.min(s0*Math.exp(0.3),2.4)),'wheel up zooms in and prevents page scroll'); }
{ const ev=new w.WheelEvent('wheel',{deltaY:100000,bubbles:true,cancelable:true}); stage.dispatchEvent(ev); ok(near(w.eval('crop.st.scale'),0.6),'wheel out stops at min zoom'); }
// keyboard
stage.dispatchEvent(new w.KeyboardEvent('keydown',{key:'+',bubbles:true})); ok(w.eval('crop.st.scale')>0.6,'+ key zooms');
// confirm
d.getElementById('cropOk').click();
ok(got==='data:image/jpeg;base64,CROPPED'&&renderArgs.out===160&&renderArgs.view===240&&d.getElementById('cropOverlay').style.display==='none'&&cancelled===0,'Use photo hands the 160px render to the callback and closes');
// cancel paths
got=null; w.openCropEditor(img,x=>{got=x;},()=>{cancelled++;}); d.getElementById('cropCancel').click();
ok(got===null&&cancelled===1&&d.getElementById('cropOverlay').style.display==='none','Cancel does not store anything');
w.openCropEditor(img,x=>{got=x;},()=>{cancelled++;}); d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
ok(got===null&&cancelled===2,'Escape cancels');
// renderer failure
w.cropRender=()=>{ throw new Error('no canvas'); };
w.openCropEditor(img,x=>{got=x;},()=>{cancelled++;}); d.getElementById('cropOk').click();
ok(got===null&&cancelled===3&&d.getElementById('cropOverlay').style.display==='none','render failure cancels cleanly');
ok(d.getElementById('confirmOverlay').style.display==='flex'&&d.getElementById('confirmCancel').style.display==='none'&&/Couldn’t use that photo/.test(d.getElementById('confirmMsg').textContent),'render failure shows in-app notice'); d.getElementById('confirmOk').click();

// ---- profile photo flows go through the editor ----
w.eval("household={name:'Sam',code:'X-CODE-1',personId:7}; people=[{id:7,name:'Sam',photo:null}]; render();"); w.openProfileModal();
w.cropPhotoFile=(f,cb,cn)=>{ w.__cb=cb; w.__cn=cn; };
Object.defineProperty(d.getElementById('profilePhotoFile'),'files',{value:[{name:'a.jpg'}],configurable:true});
w.onProfilePhotoChosen();
ok(typeof w.__cb==='function'&&w.eval("people.find(p=>p.id===7).photo")===null,'my photo: choosing a file opens the editor, nothing stored yet');
w.__cb('data:image/jpeg;base64,NEW');
ok(w.eval("people.find(p=>p.id===7).photo")==='data:image/jpeg;base64,NEW'&&/NEW/.test(d.getElementById('profileBigAvatar').innerHTML)&&w.eval('activity[0].text').includes('updated Sam'),'my photo: confirm stores it, logs, shows on the profile');
w.__cb=null; w.onProfilePhotoChosen(); ok(w.eval("people.find(p=>p.id===7).photo")==='data:image/jpeg;base64,NEW','my photo: no confirm -> unchanged');
// admin path for someone else
w.eval("people.push({id:8,name:'Kit',photo:null}); adminUnlockedFlag=true");
const rowInp=d.getElementById('p_rowPhoto'); Object.defineProperty(rowInp,'files',{value:[{name:'b.jpg'}],configurable:true});
w.eval("photoTargetId=8"); w.onRowPhotoChosen();
ok(typeof w.__cb==='function'&&w.eval("people.find(p=>p.id===8).photo")===null,'admin change-photo: opens editor, nothing stored yet');
w.__cb('data:image/jpeg;base64,CHG');
ok(w.eval("people.find(p=>p.id===8).photo")==='data:image/jpeg;base64,CHG','admin change-photo: confirm stores it');
console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
