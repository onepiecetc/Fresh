const IMAGE_CACHE = "optc-sugo-images-v1";
const MAX_IMAGE_ENTRIES = 180;

const IMAGE_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com"
]);

function isOptcImageRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (!IMAGE_HOSTS.has(url.hostname)) return false;
  const isUnitImage = url.pathname.includes("2Shankz/optc-db.github.io")
    && (
      url.pathname.includes("/api/images/full/transparent/")
      || url.pathname.includes("/api/images/thumbnail/")
    );
  const isShipIcon = url.pathname.includes("blzn50/optc-ships")
    && (
      url.pathname.includes("/public/icon/")
      || url.pathname.includes("/public/full/")
    );
  return isUnitImage || isShipIcon;
}

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_IMAGE_ENTRIES) return;
  const excess = keys.length - MAX_IMAGE_ENTRIES;
  await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone())
      .then(() => trimImageCache(cache))
      .catch(() => {});
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("optc-sugo-images-") && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (!isOptcImageRequest(event.request)) return;
  event.respondWith(cacheFirst(event.request));
});
