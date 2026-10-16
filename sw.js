// Horizon service worker.
//  - The app page (index.html / the folder URL) is NETWORK-FIRST: whenever you are online you get the
//    newest published version. The cached copy is only used when the network fails or is very slow,
//    so a pushed update can never get stuck behind an old cached page.
//  - The app's own files (styles.css and js/*.js) carry ?v=<version> in their URL, so a cached copy of a
//    given URL is always the right one: they are served cache-first and precached at install, so the app
//    opens offline. The list is APP_FILES below; tools/release.py keeps it and the version in step.
//  - Other static files (icons, manifest) and the Firebase SDK modules from www.gstatic.com are served from
//    the cache and refreshed in the background.
//  - Firestore traffic (firestore.googleapis.com and every other request) is never touched here.
//    Firestore's own on-device cache handles offline data.
// Keep SW_VERSION equal to APP_VERSION in js/config.js: run tools/release.py (a test checks this).
const SW_VERSION = '3.0.0';
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
  'js/style-guide.js',
  'js/cloud.js',
  'js/household.js',
  'js/pwa.js',
  'js/scroll-lock.js',
  'js/main.js',
];
// APP_FILES:END
const NAV_TIMEOUT_MS = 5000;   // slow network: fall back to the saved copy after this long
const PRECACHE = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'horizon-icon-180.png'];
const STATIC_EXT = /\.(?:png|svg|ico|webmanifest)$/i;

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
    await Promise.all(APP_FILES.map(async f => {
      try { const url = new URL(f + '?v=' + SW_VERSION, scopeUrl()).href; const r = await fetch(url, { cache: 'reload' }); if(r && r.ok) await cache.put(url, r); } catch(e) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

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

async function networkFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const key = shellKey();
  const network = fetch(req, { cache: 'no-cache' }).then(async res => {
    if(res && res.status >= 500) throw new Error('server error');   // a broken server shouldn't hide the saved copy
    if(res && res.ok){ try { await cache.put(key, res.clone()); } catch(e) {} }
    return res;
  });
  network.catch(() => {});   // handled below; this only stops an "unhandled rejection" if the timer wins first
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); });
  try {
    const first = await Promise.race([network, timeout]);
    if(first){ clearTimeout(timer); return first; }
    // slow: use the saved copy if there is one, otherwise keep waiting for the network
    const saved = await cache.match(key);
    return saved || await network;
  } catch(e) {
    clearTimeout(timer);
    const saved = await cache.match(key);
    if(saved) return saved;
    return new Response('Horizon is offline and has no saved copy yet. Open it once while online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// The URL names its version, so a saved copy can never be the wrong one: use it, else fetch and keep it.
async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
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
  if(isShellRequest(req, url)){ event.respondWith(networkFirst(req)); return; }
  if(isAppFileRequest(url)){ event.respondWith(cacheFirst(req)); return; }
  if(isStaticRequest(url)){ event.respondWith(staleWhileRevalidate(req)); return; }
  // anything else (Firestore, fonts, API calls) goes straight to the network
});
