// Service Worker — 离线缓存核心资源
const CACHE = "workbench-v1";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// 安装:预缓存核心资源
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

// 激活:清理旧缓存
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求策略:核心资源缓存优先并后台更新;其他请求网络优先失败回退缓存
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 仅处理同源请求;跨域(翻译/TTS/AI API)直接放行
  if (url.origin !== self.location.origin) return;

  const isCore = CORE.some((c) => url.pathname.endsWith(c.replace("./", "/")) || url.pathname === "/");
  if (isCore) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    e.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
  }
});
