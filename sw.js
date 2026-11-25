// Keeps the app itself available offline. Movies are stored separately by the page.
const CACHE = 'malakai-movies-v12';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './title-font.ttf'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Saved movies stream from the app's private storage with byte ranges, the way Safari expects video.
// Blob URLs for multi-GB files are unreliable when seeking in Safari.
async function serveMedia(req, name) {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('movies');
    const file = await (await dir.getFileHandle(name)).getFile();
    const size = file.size;
    const type = /\.mov$/i.test(name) ? 'video/quicktime' : 'video/mp4';
    const range = req.headers.get('range');
    if (!range) {
      return new Response(file, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
    }
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start, end;
    if (m[1] === '' || m[1] === undefined) { const n = parseInt(m[2], 10) || 0; start = Math.max(0, size - n); end = size - 1; }
    else { start = parseInt(m[1], 10); end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(file.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': type, 'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
  } catch (err) {
    return new Response('Movie not found', { status: 404 });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  const i = path.indexOf('/__media/');
  if (i >= 0) { e.respondWith(serveMedia(req, decodeURIComponent(path.slice(i + 9)))); return; }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
