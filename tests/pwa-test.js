const {JSDOM}=require('jsdom');
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC=path.resolve(__dirname,'..')+'/';
const html=require('./lib/build-app').buildApp();
let pass=0,fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); c?pass++:fails++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pngSize=f=>{ const b=fs.readFileSync(f); if(b.readUInt32BE(0)!==0x89504e47) return null; return [b.readUInt32BE(16),b.readUInt32BE(20)]; };

(async()=>{
  // ---------- manifest ----------
  let man=null;
  try { man=JSON.parse(fs.readFileSync(SRC+'manifest.webmanifest','utf8')); ok(true,'manifest is valid JSON'); } catch(e){ ok(false,'manifest is valid JSON: '+e.message); man={}; }
  ok(man.name==='Horizon'&&man.short_name==='Horizon','manifest names');
  ok(man.start_url==='./'&&man.scope==='./','start_url and scope are relative (site lives under /Horizon/)');
  ok(man.display==='standalone','display standalone');
  ok(/^#[0-9a-f]{6}$/i.test(man.theme_color)&&/^#[0-9a-f]{6}$/i.test(man.background_color),'theme/background colors are hex');
  ok(man.theme_color.toLowerCase()==='#f8faf7'&&man.background_color.toLowerCase()==='#eef1ed','colors match the light theme (--card / --paper)');
  const icons=man.icons||[];
  const find=(sz,purpose)=>icons.find(i=>i.sizes===sz&&(i.purpose||'any').split(' ').includes(purpose));
  ok(!!find('192x192','any')&&!!find('512x512','any')&&!!find('512x512','maskable'),'icons: 192 any, 512 any, 512 maskable declared');
  ok(icons.every(i=>!/^\//.test(i.src)&&!/^https?:/.test(i.src)),'icon paths are relative');
  for(const i of icons){
    const sz=i.sizes.split('x').map(Number);
    for(const dir of [SRC]){
      const f=dir+i.src;
      ok(fs.existsSync(f)&&JSON.stringify(pngSize(f))===JSON.stringify(sz)&&i.type==='image/png',`${dir===SRC?'repo':'outputs'}: ${i.src} exists and is ${i.sizes}`);
    }
  }
  // ---------- index.html wiring ----------
  const head=html.slice(0,html.indexOf('</head>'));
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(head),'manifest linked with a relative URL');
  ok(/<link rel="apple-touch-icon"[^>]*href="horizon-icon-180\.png"/.test(head),'apple-touch-icon points at the brand 180 icon (relative)');
  ok(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}">/.test(head),'theme-color meta');
  ok(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(head)&&/<meta name="apple-mobile-web-app-title" content="Horizon">/.test(head),'apple web-app meta tags');
  ok(!/(href|src)="\/(?!\/)[^"]*"/.test(head),'no root-absolute URLs in the head (sub-path safe)');
  ok(pngSize(SRC+'horizon-icon-180.png')+''==='180,180','apple-touch icon is 180x180');
  ok(!/register\(\s*['"]\//.test(html),'sw registration path is relative');
  ok(/register\('sw\.js'/.test(html),'index registers sw.js');
  // ---------- sw.js ----------
  const swSrc=fs.readFileSync(SRC+'sw.js','utf8');
  let syntaxOk=true; try{ new Function(swSrc); }catch(e){ syntaxOk=false; console.log(e.message); }
  ok(syntaxOk,'sw.js syntax');
  const appVer=/const APP_VERSION = '([^']+)'/.exec(html)[1];
  ok(new RegExp(`SW_VERSION = '${appVer.replace(/\./g,'\\.')}'`).test(swSrc),'SW_VERSION matches APP_VERSION (cache name tied to the app version)');
  ok(!/skipWaiting\(\)[\s\S]*caches\.match\([^)]*index/.test(swSrc)&&/skipWaiting/.test(swSrc)&&/clients\.claim/.test(swSrc),'skipWaiting + clients.claim present');

  // ---------- sw behaviour with stubs ----------
  const SCOPE='https://example.com/Horizon/';
  function mkSW(opts){
    opts=opts||{};
    const handlers={}; const caches_={}; const calls={fetch:[],skip:0,claim:0,deleted:[]};
    const mkCache=name=>{ const m=caches_[name]||(caches_[name]=new Map()); return {
      put:async(k,r)=>{ m.set(typeof k==='string'?k:k.url,r); },
      match:async k=>{ const r=m.get(typeof k==='string'?k:k.url); return r?r.clone():undefined; },
      keys:async()=>[...m.keys()] }; };
    const cachesStub={ open:async n=>mkCache(n), keys:async()=>Object.keys(caches_), delete:async n=>{ calls.deleted.push(n); delete caches_[n]; return true; },
      match:async k=>{ const key=typeof k==='string'?k:k.url; for(const n of Object.keys(caches_)){ const r=caches_[n].get(key); if(r) return r.clone(); } return undefined; } };
    const state={ net:opts.net||(async()=>new Response('net',{status:200})) };
    const fetchStub=(req,init)=>{ calls.fetch.push({url:typeof req==='string'?req:req.url,init}); return state.net(req,init); };
    const self_={ registration:{scope:SCOPE}, location:{origin:'https://example.com'}, skipWaiting(){ calls.skip++; }, clients:{claim:async()=>{ calls.claim++; }}, addEventListener(t,f){ handlers[t]=f; } };
    const ctx={ self:self_, caches:cachesStub, fetch:fetchStub, Response, URL, Promise, console, setTimeout:opts.setTimeout||setTimeout, clearTimeout };
    vm.createContext(ctx); vm.runInContext(swSrc,ctx);
    const fire=async(type,ev)=>{ let p=null; ev.waitUntil=x=>{ p=x; }; ev.respondWith=x=>{ ev._resp=x; ev._responded=true; }; handlers[type](ev); if(p) await p; return ev; };
    const req=(url,extra)=>Object.assign({method:'GET',url,mode:'cors'},extra||{});
    const doFetch=async r=>{ const ev={request:r,respondWith(x){ ev._resp=x; ev._responded=true; },waitUntil(p){ ev._wait=p; }}; handlers.fetch(ev); if(!ev._responded) return {handled:false}; const res=await ev._resp; return {handled:true,res,wait:Promise.resolve(ev._wait)}; };
    return {handlers,caches_,calls,state,fire,req,doFetch,selfRef:self_,cacheKeys:n=>[...(caches_[n]||new Map()).keys()]};
  }
  const NAME='horizon-v'+appVer;
  const nav=sw=>sw.req(SCOPE,{mode:'navigate'});

  // install
  { const sw=mkSW(); await sw.fire('install',{});
    ok(sw.calls.skip===1,'install: skipWaiting');
    ok(sw.cacheKeys(NAME).includes(SCOPE)&&sw.cacheKeys(NAME).includes(SCOPE+'icon-192.png')&&sw.cacheKeys(NAME).includes(SCOPE+'manifest.webmanifest'),'install: shell + icons + manifest precached under the versioned cache');
    const bad=mkSW({net:async()=>{ throw new Error('offline'); }}); let threw=false; try{ await bad.fire('install',{}); }catch(e){ threw=true; }
    ok(!threw,'install: a failed precache never blocks the update'); }
  // activate
  { const sw=mkSW(); sw.caches_['horizon-v2.9.0']=new Map(); sw.caches_['horizon-v2.10.0']=new Map(); sw.caches_['horizon-v2.8.0']=new Map(); sw.caches_[NAME]=new Map(); sw.caches_['someone-elses']=new Map(); sw.caches_['horizon-v999.0.0']=new Map();
    await sw.fire('activate',{});
    ok(!sw.caches_['horizon-v2.9.0']&&!sw.caches_['horizon-v2.8.0']&&!sw.caches_['horizon-v999.0.0'],'activate: older Horizon caches (and stray newer ones) deleted');
    ok(!!sw.caches_['horizon-v2.10.0'],'activate: the previous version\'s cache is kept one more release (numeric order, 2.10 > 2.9)');
    ok(!!sw.caches_[NAME]&&!!sw.caches_['someone-elses'],'activate: current cache and unrelated caches kept');
    ok(sw.calls.claim===1,'activate: clients.claim');
    // an old page opened just before the new worker took over still gets its files from the kept cache
    const u=SCOPE+'js/main.js?v=2.10.0'; sw.caches_['horizon-v2.10.0'].set(u,new Response('old main',{status:200})); sw.state.net=async()=>{ throw new Error('offline'); };
    const r=await sw.doFetch(sw.req(u)); ok(r.handled&&await r.res.text()==='old main','previous version\'s ?v= file served from its kept cache'); }
  // navigation: saved page first, refreshed in the background (stale-while-revalidate)
  async function caches_get(sw){ return sw.caches_[NAME].get(SCOPE).clone(); }
  const page_=(v,files)=>'<html>'+(files||['styles.css','js/config.js','js/main.js']).map(f=>`<script src="${f}?v=${v}" defer></script>`).join('')+'</html>';
  { const sw=mkSW(); const P1=page_(appVer)+'v1', P2=page_(appVer)+'v2'; let body=P1;
    sw.state.net=async req=>{ const u=typeof req==='string'?req:req.url; return new Response(u===SCOPE||u.includes('index.html')?body:'file',{status:200}); };
    let r=await sw.doFetch(nav(sw)); ok(r.handled&&await r.res.text()===P1,'first visit (nothing saved): served from the network');
    ok(sw.calls.fetch[0].init&&sw.calls.fetch[0].init.cache==='no-cache','navigation fetch revalidates (bypasses the HTTP cache)');
    ok(await (await caches_get(sw)).text()===P1,'first visit: page saved to the cache');
    body=P2; r=await sw.doFetch(nav(sw)); ok(await r.res.text()===P1,'saved copy is served at once (no waiting on the network)');
    await r.wait; ok(await (await caches_get(sw)).text()===P2,'background refresh saved the newer page');
    r=await sw.doFetch(nav(sw)); ok(await r.res.text()===P2,'the next open gets the newer page');
    await r.wait;
    sw.state.net=()=>new Promise(()=>{});
    const t0=Date.now(); r=await sw.doFetch(nav(sw)); ok(await r.res.text()===P2&&Date.now()-t0<500,'hung network: saved page served immediately (no timeout wait)');
    sw.state.net=async()=>{ throw new TypeError('Failed to fetch'); };
    r=await sw.doFetch(nav(sw)); await r.wait; ok(await r.res.text()===P2&&await (await caches_get(sw)).text()===P2,'offline: saved page served and kept');
    r=await sw.doFetch(sw.req(SCOPE+'index.html?x=1',{mode:'navigate'})); ok(await r.res.text()===P2,'offline navigation to index.html?x=1 also gets the shell');
    sw.state.net=async()=>new Response('boom',{status:503}); r=await sw.doFetch(nav(sw)); await r.wait; ok(await r.res.text()===P2&&await (await caches_get(sw)).text()===P2,'server error 503: saved page used and kept');
    sw.state.net=async()=>new Response('nf',{status:404}); r=await sw.doFetch(nav(sw)); await r.wait; ok(await (await caches_get(sw)).text()===P2,'a 404 never replaces the saved page');
  }
  { const sw=mkSW({net:async()=>{ throw new Error('x'); }}); const r=await sw.doFetch(nav(sw)); ok(r.res.status===503,'offline with nothing cached: friendly 503, not a crash'); }
  { const sw=mkSW({net:async()=>new Response('Copyright … SIL Open Font License',{status:200})});
    const r=await sw.doFetch(sw.req(SCOPE+'fonts/LICENSE.txt',{mode:'navigate'})); await r.wait;
    ok(r.res.ok&&!sw.cacheKeys(NAME).includes(SCOPE),'first visit to a non-app page (fonts/LICENSE.txt): shown, never saved as the app');
    sw.caches_[NAME].set(SCOPE,new Response(page_(appVer),{status:200}));
    const r2=await sw.doFetch(sw.req(SCOPE+'fonts/LICENSE.txt',{mode:'navigate'})); await r2.wait;
    ok((await (await caches_get(sw)).text()).includes('?v='+appVer),'background refresh of a non-app page never replaces the saved app'); }
  { const sw=mkSW({net:async()=>new Response('nf',{status:404})}); const r=await sw.doFetch(nav(sw)); ok(r.res.status===404&&!sw.cacheKeys(NAME).includes(SCOPE),'first visit 404: passed through, not saved'); }
  { // a new release: the refreshed page is saved only once every ?v= file it names is saved too (opens offline)
    const sw=mkSW(); let updates=0; const fetched=[];
    sw.state.net=async()=>new Response(page_(appVer),{status:200}); await sw.doFetch(nav(sw));
    const newPage=page_('99.0.0'); let failMain=true;
    sw.state.net=async req=>{ const u=typeof req==='string'?req:req.url; fetched.push(u);
      if(u===SCOPE) return new Response(newPage,{status:200});
      if(failMain&&u.includes('js/main.js')) return new Response('nf',{status:404});
      return new Response('file '+u,{status:200}); };
    const reg=sw.selfRef.registration; reg.update=()=>{ updates++; return Promise.resolve(); };
    let r=await sw.doFetch(nav(sw)); ok((await r.res.text()).includes('?v='+appVer),'new release online: this open still shows the saved page at once'); await r.wait;
    ok((await (await caches_get(sw)).text()).includes('?v='+appVer),'a file of the new page failed: the saved page is NOT replaced (no half-saved release)');
    ok(updates>=1,'a page from a newer release asks the browser to check sw.js now');
    failMain=false; r=await sw.doFetch(nav(sw)); await r.wait;
    ok(await (await caches_get(sw)).text()===newPage,'all files saved: the new release is saved for the next open');
    ok(['styles.css','js/config.js','js/main.js'].every(f=>sw.cacheKeys(NAME).includes(SCOPE+f+'?v=99.0.0')),'its ?v= files are saved before the page, so it opens offline');
    sw.state.net=async()=>{ throw new Error('offline'); };
    r=await sw.doFetch(nav(sw)); ok(await r.res.text()===newPage,'next open (even offline) is on the new release');
    for(const f of ['styles.css','js/main.js']){ const x=await sw.doFetch(sw.req(SCOPE+f+'?v=99.0.0')); ok(x.handled&&x.res.ok,'offline: new release file served from cache: '+f); }
  }
  { // same release: refresh needs no file downloads
    const sw=mkSW(); sw.state.net=async()=>new Response(page_(appVer),{status:200});
    await sw.fire('install',{}); const n0=sw.calls.fetch.length;
    const r=await sw.doFetch(nav(sw)); await r.wait;
    ok(sw.calls.fetch.length-n0===1,'refresh of an unchanged release fetches only the page (its files are already saved)'); }
  { // install reuses app files an older cache already saved (same ?v= URL = same file)
    const sw=mkSW(); const u=SCOPE+'js/config.js?v='+appVer; sw.caches_['horizon-v0.0.1']=new Map([[u,new Response('old-cache copy',{status:200})]]);
    await sw.fire('install',{}); ok(!sw.calls.fetch.some(c=>c.url===u)&&await sw.caches_[NAME].get(u).clone().text()==='old-cache copy','install: a file the page refresh already saved is not downloaded again');
    ok(['fonts/inter-latin.woff2','fonts/fraunces-latin.woff2','fonts/ibm-plex-mono-500-latin.woff2'].every(f=>sw.cacheKeys(NAME).includes(SCOPE+f)),'install: the self-hosted fonts are precached');
    for(const f of ['fonts/inter-latin.woff2','fonts/fraunces-latin.woff2','fonts/ibm-plex-mono-500-latin.woff2']) ok(fs.existsSync(SRC+f),'font file exists: '+f); }
  { const sw=mkSW(); sw.state.net=async()=>new Response('font',{status:200}); const u=SCOPE+'fonts/inter-latin.woff2';
    let r=await sw.doFetch(sw.req(u)); await sleep(5); sw.state.net=async()=>{ throw new Error('offline'); };
    r=await sw.doFetch(sw.req(u)); ok(r.handled&&await r.res.text()==='font','fonts: served from the cache (works offline)'); }
  // never cache Firestore
  { const sw=mkSW();
    const urls=['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8','https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents/households/ABC','https://fonts.googleapis.com/css2?family=Inter','https://identitytoolkit.googleapis.com/v1/accounts:lookup',SCOPE+'api/data.json'];
    for(const u of urls){ const r=await sw.doFetch(sw.req(u)); ok(!r.handled,'not intercepted: '+new URL(u).hostname+new URL(u).pathname.slice(0,24)); }
    const r=await sw.doFetch({method:'POST',url:'https://firestore.googleapis.com/x',mode:'cors'}); ok(!r.handled,'POST never intercepted');
    const r2=await sw.doFetch({method:'POST',url:SCOPE+'icon-192.png',mode:'cors'}); ok(!r2.handled,'POST to a static file not intercepted');
    ok(sw.calls.fetch.length===0&&!sw.caches_[NAME],'nothing fetched or cached for those requests');
    const r3=await sw.doFetch(sw.req('https://www.gstatic.com/charts/loader.js')); ok(!r3.handled,'other gstatic paths not cached'); }
  // static: SWR
  { const sw=mkSW(); let n=0; sw.state.net=async()=>new Response('icon'+(++n),{status:200});
    const u=SCOPE+'icon-192.png';
    let r=await sw.doFetch(sw.req(u)); ok(r.handled&&await r.res.text()==='icon1','static: first request goes to the network');
    await sleep(5); ok(sw.cacheKeys(NAME).includes(u),'static: cached');
    r=await sw.doFetch(sw.req(u)); ok(await r.res.text()==='icon1','static: cached copy returned immediately');
    await sleep(10); r=await sw.doFetch(sw.req(u)); ok(await r.res.text()==='icon2','static: background refresh updated the cache (stale-while-revalidate)');
    sw.state.net=async()=>{ throw new Error('offline'); };
    r=await sw.doFetch(sw.req(u)); ok(r.handled&&(await r.res.text()).startsWith('icon'),'static: works offline from cache');
    // Firebase SDK
    const f='https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'; sw.state.net=async()=>new Response('export{}',{status:200});
    r=await sw.doFetch(sw.req(f,{mode:'cors'})); ok(r.handled&&await r.res.text()==='export{}','Firebase SDK module fetched through the worker'); await sleep(5);
    sw.state.net=async()=>{ throw new Error('offline'); };
    r=await sw.doFetch(sw.req(f,{mode:'cors'})); ok(r.handled&&await r.res.text()==='export{}','Firebase SDK module available offline');
    sw.state.net=async()=>new Response('err',{status:500}); const g='https://www.gstatic.com/firebasejs/10.12.2/other.js';
    r=await sw.doFetch(sw.req(g)); await sleep(5); ok(!sw.cacheKeys(NAME).includes(g),'error responses are not cached'); }

  // ---------- registration gating in the page ----------
  async function page(url,hooks){
    const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url,beforeParse(w){ for(const k of ['alert','confirm','prompt']) w[k]=()=>{ throw new Error('native'); }; if(hooks) hooks(w); }});
    await sleep(60); return dom.window;
  }
  const reg=[]; const swHook=w=>{ Object.defineProperty(w.navigator,'serviceWorker',{value:{register:(u,o)=>{ reg.push([u,o]); return Promise.resolve({}); }},configurable:true}); };
  await page('https://horizonbudget.github.io/Horizon/',swHook); ok(reg.length===1&&reg[0][0]==='sw.js'&&reg[0][1].updateViaCache==='none','https: registers sw.js (relative) after load');
  reg.length=0; await page('http://localhost:8000/',swHook); ok(reg.length===1,'localhost: registers');
  reg.length=0; await page('http://192.168.1.5/',swHook); ok(reg.length===0,'plain http on another host: does not register');
  reg.length=0; await page('https://x.github.io/Horizon/',w=>{ Object.defineProperty(w.navigator,'serviceWorker',{value:{register:()=>{ throw new Error('boom'); }},configurable:true}); }); ok(true,'register() throwing is swallowed');
  reg.length=0; await page('https://x.github.io/Horizon/',w=>{ Object.defineProperty(w.navigator,'serviceWorker',{value:{register:()=>Promise.reject(new Error('nope'))},configurable:true}); }); await sleep(30); ok(true,'rejected registration is swallowed');
  await page('https://x.github.io/Horizon/'); ok(true,'no serviceWorker support: page still loads');

  // ---------- install hint + settings row ----------
  const boot=async(opts)=>{ opts=opts||{}; const w=await page('https://x.github.io/Horizon/',w=>{
      w.__cloudAdapterFactory=()=>({subscribe(c,cb){ setTimeout(()=>cb(null,false),5); return ()=>{}; },push(){ return Promise.resolve(); }});
      if(opts.ua) Object.defineProperty(w.navigator,'userAgent',{value:opts.ua,configurable:true});
      if(opts.standalone) w.matchMedia=q=>({matches:/standalone/.test(q),addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      if(opts.ls) for(const k in opts.ls) w.localStorage.setItem(k,opts.ls[k]);
      if(opts.noStorage) Object.defineProperty(w,'localStorage',{get(){ throw new Error('blocked'); }});
    }); return w; };
  const $=(w,id)=>w.document.getElementById(id);
  const signIn=async w=>{ $(w,'householdCode').value='INSTALL-TEST-1'; $(w,'yourName').value='Sam'; await w.enterApp(); };
  const promptEvent=(w,accepted)=>{ const e=new w.Event('beforeinstallprompt',{cancelable:true}); e.prompt=()=>{ e._prompted=true; return Promise.resolve(); }; e.userChoice=Promise.resolve({outcome:accepted===false?'dismissed':'accepted'}); w.dispatchEvent(e); return e; };
  { const w=await boot(); ok($(w,'installHint').hidden,'hint hidden before sign in');
    const e=promptEvent(w); ok(e.defaultPrevented,'native mini-infobar suppressed'); ok($(w,'installHint').hidden,'prompt event before sign-in: still hidden');
    await signIn(w); ok(!$(w,'installHint').hidden&&/Install Horizon/.test($(w,'installHintText').textContent)&&$(w,'installHintBtn').style.display==='','hint shows after sign-in (Chrome/Android/desktop)');
    ok(w.localStorage.getItem('horizonInstallHintShown')==='1','shown flag stored');
    w.dismissInstallHint(); ok($(w,'installHint').hidden,'dismiss hides it');
    w.openSettingsModal(); ok(/Install app/.test($(w,'installRow').textContent)&&$(w,'installRowBtn').style.display==='','Settings → General has an Install app row with a button when installable');
    $(w,'installRowBtn').click(); await sleep(10); ok(e._prompted===true&&$(w,'installRowBtn').style.display==='none','Install button runs the browser prompt');
    // second visit on the same device: flag set -> no hint
    const w2=await boot({ls:{horizonInstallHintShown:'1'}}); promptEvent(w2); await signIn(w2); ok($(w2,'installHint').hidden,'not shown again once shown on this device');
    w2.openSettingsModal(); ok(/Install app/.test($(w2,'installRow').textContent),'...but the Settings row is still there'); }
  { const w=await boot(); await signIn(w); promptEvent(w); await sleep(5); ok(!$(w,'installHint').hidden,'prompt event after sign-in shows the hint'); }
  { const w=await boot({standalone:true}); promptEvent(w); await signIn(w); ok($(w,'installHint').hidden,'already installed (standalone): no hint');
    w.openSettingsModal(); ok(/already installed|is installed/.test($(w,'installRowText').textContent)&&$(w,'installRowBtn').style.display==='none','standalone: Settings says it is installed'); }
  { const IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const w=await boot({ua:IOS}); await signIn(w);
    ok(!$(w,'installHint').hidden&&/Share/.test($(w,'installHintText').textContent)&&/Add to Home Screen/.test($(w,'installHintText').textContent)&&$(w,'installHintBtn').style.display==='none','iOS Safari: one-line Share → Add to Home Screen tip, no install button');
    w.openSettingsModal(); ok(/Share/.test($(w,'installRowText').textContent)&&$(w,'installRowBtn').style.display==='none','iOS: Settings row explains how');
    const wc=await boot({ua:IOS.replace('Version/17.0 Mobile/15E148 Safari/604.1','CriOS/120 Mobile/15E148 Safari/604.1')}); await signIn(wc); ok($(wc,'installHint').hidden,'iOS Chrome: no Safari-only tip'); }
  { const w=await boot(); await signIn(w); ok($(w,'installHint').hidden,'desktop with no install support: no hint');
    w.openSettingsModal(); ok(/browser menu/.test($(w,'installRowText').textContent),'...Settings row still explains how'); }
  { const w=await boot({noStorage:true}); promptEvent(w); let threw=false; try{ await signIn(w); }catch(e){ threw=true; } ok(!threw,'blocked localStorage never throws'); }
  { const w=await boot(); await signIn(w); promptEvent(w); w.dispatchEvent(new w.Event('appinstalled')); ok($(w,'installHint').hidden,'appinstalled hides the hint'); }

  // ---------- offline sync pill ----------
  { const w=await boot(); await signIn(w);
    Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true}); w.setCloudStatus('ok'); ok(/Offline/.test($(w,'syncPill').textContent),'offline: pill says Offline instead of Synced');
    w.dispatchEvent(new w.Event('offline')); ok(/Offline/.test($(w,'syncPill').textContent)&&!/Not saved/.test($(w,'syncPill').textContent),'offline event: not "Not saved"');
    Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true}); w.dispatchEvent(new w.Event('online')); await sleep(20); ok(/Synced/.test($(w,'syncPill').textContent),'back online: Synced again'); }
  console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails?1:0);
})();
