// Horizon service worker.
//  - The app page (index.html / the folder URL) is CACHE-FIRST WITH A BACKGROUND REFRESH (stale-while-revalidate):
//    when a saved copy exists it opens at once, even on a slow or hung connection, and the newest published page is
//    fetched behind it for the next open. A refreshed page is only saved once every app file it names (?v=) is saved
//    too, so the saved copy always opens offline. A new release reaches people on the next open: the page refresh
//    saves it, and the browser's own sw.js check installs the new worker (which precaches its own copy of the page).
//    With nothing saved yet (first visit) the page comes straight from the network.
//  - The app's own files (styles.css and js/*.js) carry ?v=<version> in their URL, so a cached copy of a
//    given URL is always the right one: they are served cache-first and precached at install, so the app
//    opens offline. The list is APP_FILES below; tools/release.py keeps it and the version in step.
//  - Other static files (fonts, icons, manifest) and the Firebase SDK modules from www.gstatic.com are served from
//    the cache and refreshed in the background. The fonts live in fonts/ (no Google Fonts requests at all).
//  - Firestore traffic (firestore.googleapis.com and every other request) is never touched here.
//    Firestore's own on-device cache handles offline data.
// Keep SW_VERSION equal to APP_VERSION in js/config.js: run tools/release.py (a test checks this).
const SW_VERSION = '3.5.1';
const CACHE_PREFIX = 'horizon-';
const CACHE_NAME = CACHE_PREFIX + 'v' + SW_VERSION;
// APP_FILES:BEGIN (written by tools/release.py)
const APP_FILES = [
  'styles.css',
  'js/config.js',
  'js/util.js',
  'js/state.js',
  'js/suggest.js',
  'js/themes.js',
  'js/profiles.js',
  'js/crop.js',
  'js/items.js',
  'js/dialogs.js',
  'js/trash.js',
  'js/item-helpers.js',
  'js/toast.js',
  'js/search.js',
  'js/month-groups.js',
  'js/backup-reminder.js',
  'js/cards.js',
  'js/settings.js',
  'js/update-notice.js',
  'js/changelog.js',
  'js/settings-modal.js',
  'js/sticky-headers.js',
  'js/render.js',
  'js/todo.js',
  'js/style-guide.js',
  'js/cloud.js',
  'js/household.js',
  'js/pwa.js',
  'js/scroll-lock.js',
  'js/main.js',
];
// APP_FILES:END
const PRECACHE = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'horizon-icon-180.png',
  'fonts/inter-latin.woff2', 'fonts/fraunces-latin.woff2', 'fonts/ibm-plex-mono-500-latin.woff2'];
const STATIC_EXT = /\.(?:png|svg|ico|webmanifest|woff2)$/i;

function scopeUrl(){ return new URL('./', self.registration.scope).href; }   // the app shell lives here
function shellKey(){ return scopeUrl(); }

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // best effort: a missing file must never block the update
    await Promise.all(PRECACHE.map(async p => {
      try { const url = new URL(p, scopeUrl()).href; const r = await fetch(url, { cache: 'reload' }); if(r && r.ok) await cache.put(url, r); } catch(e) {}
    }));
    try { const r = await fetch(shellKey(), { cache: 'reload' }); if(r && r.ok) await cache.put(shellKey(), r); } catch(e) {}
    // the app's own files, at the exact ?v= URLs index.html asks for (same best-effort rule)
    // (a same-URL copy is the same file, so reuse one the page refresh or the browser's HTTP cache already has)
    await Promise.all(APP_FILES.map(async f => {
      try {
        const url = new URL(f + '?v=' + SW_VERSION, scopeUrl()).href;
        const r = (await caches.match(url)) || await fetch(url);
        if(r && r.ok) await cache.put(url, r);
      } catch(e) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the previous version's cache for one more release: a page opened from it just before this worker took
    // over still finds its ?v= files. Anything older goes.
    const names = (await caches.keys()).filter(n => n.indexOf(CACHE_PREFIX + 'v') === 0 && n !== CACHE_NAME);
    const older = names.filter(n => versionOrder(n.slice(CACHE_PREFIX.length + 1), SW_VERSION) < 0)
      .sort((a, b) => versionOrder(b.slice(CACHE_PREFIX.length + 1), a.slice(CACHE_PREFIX.length + 1)));
    const keep = older[0];
    await Promise.all(names.filter(n => n !== keep).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// numeric X.Y.Z compare (negative when a is older than b)
function versionOrder(a, b){
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for(let i = 0; i < 3; i++){ const d = (x[i] || 0) - (y[i] || 0); if(d) return d; }
  return 0;
}

function isShellRequest(req, url){
  return req.mode === 'navigate' && url.origin === self.location.origin;
}
function isStaticRequest(url){
  if(url.origin === self.location.origin) return STATIC_EXT.test(url.pathname);
  // Firebase SDK modules only. firestore.googleapis.com and everything else is left alone.
  return url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
}
function isAppFileRequest(url){
  return url.origin === self.location.origin && /\.(?:js|css)$/i.test(url.pathname) && url.searchParams.has('v');
}
function cacheable(res){ return !!res && (res.ok || res.type === 'opaque') && res.status !== 206; }

// The ?v= app files a page asks for (styles.css and js/*.js), as full URLs.
function pageAppFiles(html){
  const out = [], re = /(?:src|href)="((?:js\/[^"?]+\.js|styles\.css)\?v=[^"]+)"/g;
  let m; while((m = re.exec(html))) out.push(new URL(m[1], scopeUrl()).href);
  return out;
}

// Background refresh: save the newest page, but only after every app file it names is saved too, so the saved
// page can always open offline. Anything failing leaves the previous saved page in place.
async function refreshShell(req, cache){
  const res = await fetch(req, { cache: 'no-cache' });
  if(!res || !res.ok) return;
  const html = await res.clone().text();
  const files = await Promise.all(pageAppFiles(html).map(async url => {
    if(await cache.match(url)) return true;
    try { const r = await fetch(url); if(!r || !r.ok) return false; await cache.put(url, r); return true; } catch(e) { return false; }
  }));
  if(files.length && files.every(Boolean)) await cache.put(shellKey(), res);   // only a real app page (it names ?v= files)
  // a page from a newer release: ask the browser to check sw.js now (it usually does anyway)
  if(html.indexOf('?v=' + SW_VERSION + '"') < 0){ try { self.registration.update().catch(() => {}); } catch(e) {} }
}

async function shellRequest(event){
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(shellKey());
  if(saved){
    // open at once from the saved copy; keep the worker alive until the refresh is done
    const done = refreshShell(req, cache).catch(() => {});
    try { event.waitUntil(done); } catch(e) {}
    return saved;
  }
  // nothing saved yet (first visit): straight from the network
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if(res && res.status >= 500) throw new Error('server error');
    if(res && res.ok){
      // only a real app page (it names ?v= files) is saved as the app; e.g. fonts/LICENSE.txt never is
      try { if(pageAppFiles(await res.clone().text()).length) await cache.put(shellKey(), res.clone()); } catch(e) {}
    }
    return res;
  } catch(e) {
    return new Response('Horizon is offline and has no saved copy yet. Open it once while online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// The URL names its version, so a saved copy can never be the wrong one: use it, else fetch and keep it.
// Any Horizon cache may answer (the previous version's is kept one release for pages opened from it).
async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const hit = await caches.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(cacheable(res)){ try { await cache.put(req, res.clone()); } catch(e) {} }
  return res;
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  const refresh = fetch(req).then(async res => {
    if(cacheable(res)){ try { await cache.put(req, res.clone()); } catch(e) {} }
    return res;
  });
  if(hit){ refresh.catch(() => {}); return hit; }
  return refresh;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch(e) { return; }
  if(isShellRequest(req, url)){ event.respondWith(shellRequest(event)); return; }
  if(isAppFileRequest(url)){ event.respondWith(cacheFirst(req)); return; }
  if(isStaticRequest(url)){ event.respondWith(staleWhileRevalidate(req)); return; }
  // anything else (Firestore, fonts, API calls) goes straight to the network
});
