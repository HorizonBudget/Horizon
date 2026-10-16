const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=require('./lib/build-app').buildApp();
const store={}; const listeners={};
function fakeFactory(){ return {
  subscribe(code,cb){ (listeners[code]=listeners[code]||[]).push(cb); setTimeout(()=>cb(store[code]?JSON.parse(JSON.stringify(store[code])):null,false),5); return ()=>{}; },
  push(code,data){ store[code]=JSON.parse(JSON.stringify(data)); return new Promise(r=>setTimeout(()=>{ (listeners[code]||[]).forEach(cb=>cb(JSON.parse(JSON.stringify(store[code])),false)); r(); },5)); }
};}
let alerts=[];
function boot(){ return new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',beforeParse(w){ w.__cloudAdapterFactory=fakeFactory; w.alert=m=>{ throw new Error('window.alert used: '+m); }; w.confirm=()=>{ throw new Error('window.confirm used'); }; }}).window; }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const LONG='https://www.amazon.com/Some-Very-Long-Name/dp/B0123?tag=x';
(async()=>{
  const A=boot(),B=boot(); await sleep(50);
  A.document.getElementById('householdCode').value='LINK-TEST-1234'; A.document.getElementById('yourName').value='Sam';
  await A.enterApp();
  const dA=A.document;
  const base={category:'Home',subcategory:'',cost:10,month:'No date yet',saved:0,owner:'',completed:false};
  const card=it=>{ A.eval('items.push('+JSON.stringify(Object.assign({},base,it))+');render();'); return dA.querySelector('[data-item-id="'+it.id+'"]'); };
  // legacy text-only link -> note
  let c=card({id:1,name:'Legacy text',link:'ask grandma first'});
  ok(!c.querySelector('a') && c.querySelector('.note-text') && c.querySelector('.note-text').textContent==='ask grandma first','legacy text link shows as note, no link');
  ok(c.querySelector('.note-icon').textContent==='📝','legacy note icon');
  // legacy URL link
  c=card({id:2,name:'Legacy url',link:LONG});
  let a=c.querySelector('a.link-chip');
  ok(a && a.textContent==='amazon.com' && a.getAttribute('href')===LONG && a.getAttribute('title')===LONG,'URL chip text/href/title; www stripped');
  ok(a.target==='_blank' && a.rel==='noopener noreferrer','chip target/rel');
  ok(!c.querySelector('.note-text'),'no note row for URL-only');
  // fallback / unparseable
  let threw=false; try{ c=card({id:3,name:'Bad',link:'http://'+'x'.repeat(100)+' y z:::'}); }catch(e){threw=true;console.log(e)}
  ok(!threw,'unparseable link does not throw');
  threw=false; try{ A.eval("siteName('http://[bad')"); ok(A.eval("siteName('http://[bad')").length<=30,'siteName fallback truncated'); }catch(e){threw=true}
  ok(!threw,'siteName never throws');
  // item with both
  c=card({id:4,name:'Both',link:'https://example.com/a',note:'hello'});
  ok(c.querySelectorAll('.item-note').length===2 && c.querySelector('.item-note').querySelector('a') ,'both shown, link first');
  // non-http legacy link is not a link
  c=card({id:5,name:'JS',link:'javascript:alert(1)'});
  ok(!c.querySelector('a') && c.textContent.includes('javascript:alert(1)'),'javascript: legacy value rendered as inert note text');
  // note linkify + punctuation
  c=card({id:6,name:'Linkify',note:'See https://www.etsy.com/listing/1, or (https://foo.org/x). Also https://bar.com/p?a=1! and https://baz.com/wiki/A_(b).'});
  const hrefs=[...c.querySelectorAll('.note-text a')].map(x=>x.getAttribute('href'));
  ok(JSON.stringify(hrefs)===JSON.stringify(['https://www.etsy.com/listing/1','https://foo.org/x','https://bar.com/p?a=1','https://baz.com/wiki/A_(b)']),'linkify strips trailing punctuation: '+hrefs.join(' | '));
  const nt=c.querySelector('.note-text').textContent;
  ok(nt.includes('etsy.com, or (foo.org).')&&nt.includes('bar.com!')&&!nt.includes('https://'),'punctuation kept as text outside chips');
  ok([...c.querySelectorAll('.note-text a')].map(x=>x.textContent).join()==='etsy.com,foo.org,bar.com,baz.com','chip names');
  // line breaks preserved
  c=card({id:7,name:'Lines',note:'line1\nline2'});
  ok(c.querySelector('.note-text').textContent==='line1\nline2' && A.getComputedStyle(c.querySelector('.note-text')).whiteSpace==='pre-line','newlines kept with pre-line');
  // XSS
  const bad=['<script>alert(1)</script>','<img src=x onerror=alert(1)>','javascript:alert(1)','https://e.com/"onmouseover="alert(1)','https://e.com/a\'><img src=x onerror=alert(1)>','[x](javascript:alert(1)) https://ok.com/<b>x'];
  bad.forEach((t,i)=>{
    const cc=card({id:100+i,name:'XSS'+i,note:t,link:i===2?'javascript:alert(1)':''});
    ok(!cc.querySelector('script')&&!cc.querySelector('.item-main img')&&![...cc.querySelectorAll('a')].some(x=>!/^https?:/.test(x.getAttribute('href')))&&![...cc.querySelectorAll('*')].some(x=>[...x.attributes].some(at=>/^on/i.test(at.name)&&x.className!==undefined&&at.name!=='onchange'&&at.name!=='onclick')),'XSS inert #'+i+' '+t);
  });
  // quote URL: attribute intact
  const q=dA.querySelector('[data-item-id="103"]');
  ok([...q.querySelectorAll('a')].every(x=>!x.hasAttribute('onmouseover')),'quote URL cannot inject attributes');

  // ---- modal: legacy prefill
  A.eval('editItem(1)');
  ok(dA.getElementById('f_link').value==='' && dA.getElementById('f_note').value==='ask grandma first','edit prefill: legacy text -> Note, Link empty');
  A.eval('editItem(2)');
  ok(dA.getElementById('f_link').value===LONG && dA.getElementById('f_note').value==='','edit prefill: legacy url -> Link');
  A.eval('editItem(4)');
  ok(dA.getElementById('f_link').value==='https://example.com/a'&&dA.getElementById('f_note').value==='hello','edit prefill both');
  A.openItemModal();
  ok(dA.getElementById('f_link').value===''&&dA.getElementById('f_note').value===''&&dA.getElementById('linkError').textContent==='','new item: both cleared');
  ok(dA.getElementById('f_note').getAttribute('maxlength')==='500'&&dA.getElementById('f_note').rows===3&&dA.getElementById('f_link').getAttribute('inputmode')==='url'&&dA.getElementById('f_link').getAttribute('autocapitalize')==='off','field attributes');
  // legacy items not rewritten on load/open
  ok(A.eval('items.find(i=>i.id===1)').link==='ask grandma first' && A.eval('items.find(i=>i.id===1)').note===undefined,'legacy item untouched until saved');

  // ---- save: separate fields
  const fill=(n,l,t)=>{ dA.getElementById('f_name').value=n; dA.getElementById('f_cost').value='50'; dA.getElementById('f_link').value=l; dA.getElementById('f_note').value=t; };
  A.openItemModal(); fill('Saved both','https://shop.com/x','buy blue one'); A.saveItem();
  let it=A.eval('items.find(i=>i.name==="Saved both")');
  ok(it.link==='https://shop.com/x'&&it.note==='buy blue one','save stores link and note separately');
  A.openItemModal(); fill('Domain','  amazon.com/x ',''); A.saveItem();
  it=A.eval('items.find(i=>i.name==="Domain")');
  ok(it.link==='https://amazon.com/x'&&it.note==='','amazon.com/x -> https://amazon.com/x');
  A.openItemModal(); fill('Http kept','http://old.example.com/a',''); A.saveItem();
  ok(A.eval('items.find(i=>i.name==="Http kept")').link==='http://old.example.com/a','http:// kept');
  for(const bad of ['hello world','hello','javascript:alert(1)','mailto:a@b.com','ftp://x.com/a','https://','.com']){
    const n=A.eval('items.length'); A.openItemModal(); fill('Rejected',bad,'n'); A.saveItem();
    ok(A.eval('items.length')===n && dA.getElementById('itemOverlay').style.display==='flex' && /doesn't look like a web address/.test(dA.getElementById('linkError').textContent),'rejected: '+bad);
    A.closeItemModal();
  }
  // error clears on typing
  const li=dA.getElementById('f_link'); li.dispatchEvent(new A.Event('input')); ok(dA.getElementById('linkError').textContent==='','error clears on input');
  // migrating a legacy item by saving
  A.eval('editItem(1)'); A.saveItem();
  it=A.eval('items.find(i=>i.id===1)');
  ok(it.link===''&&it.note==='ask grandma first','saving legacy item migrates it');
  // edit existing: empty link/note allowed, clearing
  A.eval('editItem(4)'); dA.getElementById('f_note').value=''; dA.getElementById('f_link').value=''; A.saveItem();
  it=A.eval('items.find(i=>i.id===4)'); ok(it.link===''&&it.note==='','can clear both');
  ok(dA.getElementById('itemOverlay').style.display==='none','modal closed after good save');

  // ---- sync to device B
  await sleep(700);
  B.document.getElementById('householdCode').value='LINK-TEST-1234'; B.document.getElementById('yourName').value='Alex';
  await B.enterApp(); await sleep(1500);
  const bi=B.eval('items.find(i=>i.name==="Saved both")');
  ok(bi&&bi.link==='https://shop.com/x'&&bi.note==='buy blue one','B receives link+note');
  const bl=B.eval('items.find(i=>i.id===2)'); ok(bl && bl.link===LONG && bl.note===undefined,'B gets legacy item unchanged (no passive migration)');
  const bc=B.document.querySelector('[data-item-id="1"]'); ok(!!bc,'B renders items');
  // live edit from A -> B
  A.openItemModal(); fill('Live','live.com','livenote'); A.saveItem(); console.log('A has Live:',!!A.eval('items.find(i=>i.name==="Live")'),'store:',store['LINK-TEST-1234'].items.length,A.eval('items.length'),'B:',B.eval('items.length')); await sleep(1500);console.log('B:',B.eval('items.length'),'store',store['LINK-TEST-1234'].items.length,'A',A.eval('items.length'));
  const lv=B.eval('items.find(i=>i.name==="Live")'); ok(lv&&lv.link==='https://live.com'&&lv.note==='livenote','B sees live save (data)'); ok(!!B.document.querySelector('[data-item-id="'+lv.id+'"] .note-text a, [data-item-id="'+lv.id+'"] .note-text'),'B renders live item note');

  // ---- backup round trip
  let blobText=null; A.URL.createObjectURL=b=>{ b.text().then(t=>blobText=t); return 'blob:x'; }; A.URL.revokeObjectURL=()=>{};
  A.exportBackup(); await sleep(150);
  const bk=JSON.parse(blobText); const bkIt=bk.items.find(i=>i.name==='Saved both');
  ok(bkIt.link==='https://shop.com/x'&&bkIt.note==='buy blue one','backup contains both fields');
  A.eval('items=items.filter(i=>i.name!=="Saved both");render();'); 
  A.onRestoreFileChosen({files:[new A.File([blobText],'b.json')],value:'x'}); await sleep(150); A.document.getElementById('confirmOk').click(); await sleep(900);
  const ri=A.eval('items.find(i=>i.name==="Saved both")');
  ok(ri&&ri.link==='https://shop.com/x'&&ri.note==='buy blue one','restore keeps both fields');
  // old-format backup (link text only) restores and displays as a note
  const old=JSON.parse(blobText); old.items=[Object.assign({},old.items[0],{id:9001,name:'OldBk',link:'plain old text',note:undefined})];
  A.onRestoreFileChosen({files:[new A.File([JSON.stringify(old)],'o.json')],value:'x'}); await sleep(150); A.document.getElementById('confirmOk').click(); await sleep(900);
  const oc=dA.querySelector('[data-item-id="9001"]'); ok(oc && !oc.querySelector('a') && oc.querySelector('.note-text').textContent==='plain old text','old backup text link displays as note');

  // ---- style guide
  A.eval("openStyleGuide ? 0 : 0"); 
  A.eval("renderStyleGuide()");
  ok(dA.querySelectorAll('#guideBody .item-card').length===5,'style guide has 5 sample cards');
  ok(dA.querySelector('#guideCardsFull a.link-chip') && dA.querySelector('#guideCardsNote .note-text a') && dA.querySelector('#guideCardsBoth a.link-chip') && dA.querySelector('#guideCardsBoth .note-text'),'style guide link/note/both samples');
  ok(dA.querySelector('#guideCardsMissing .tag-warn') && dA.querySelector('#guideCardsDone .restore-check'),'guide missing/completed samples ok');
  console.log(`\n${pass} passed, ${fails} failed`); console.log(fails?'FAILURES':'ALL OK'); process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
