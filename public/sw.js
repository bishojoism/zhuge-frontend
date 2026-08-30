// 《主格》Service Worker（新前端：Vite 构建产物，哈希资源名）
// v3：install 时动态预缓存 index.html 引用的核心 JS/CSS（hash 文件名，rebuild 后自动跟随）
const CACHE_NAME = 'zhuge-web-v3';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/favicon-32.png', '/favicon.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // 壳资源（导航回退 / 图标 / manifest）
        await cache.addAll(PRECACHE).catch(() => {});
        // 核心 JS/CSS：解析 index.html 中引用的 /assets/*.js|css 并预缓存，
        // 让首屏资源在首次访问时即从 SW 缓存秒出（无需等网络往返）
        const res = await fetch('/index.html');
        const html = await res.text();
        const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
        await cache.addAll(urls).catch(() => {});
      } catch (e) { /* 预缓存失败不阻塞安装 */ }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源 GET
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 导航请求：网络优先，离线回退缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/_shell', copy));
          return response;
        })
        .catch(() => caches.match('/_shell').then((c) => c || caches.match('/')))
    );
    return;
  }

  // API：网络直连（不缓存，保证数据新鲜）
  if (url.pathname.startsWith('/api/')) return;

  // sw.js 自身：网络直连（否则旧 SW 会缓存旧版脚本，导致更新检查永远拿到旧字节）
  if (url.pathname === '/sw.js') return;

  // 静态资源（哈希文件名）：缓存优先 + 后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ===== 系统通知（Web Push）：显示系统通知，点击跳转 =====
self.addEventListener('push', (event) => {
  let data = { title: '主格', body: '你有新消息', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* 保留默认 */ }
  // tag 用跳转地址分组：同一主题的通知合并成一条，不同主题各自独立
  const tag = 'zhuge-' + (data.url || '/');
  event.waitUntil(
    self.registration.showNotification(data.title || '主格', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon.png',
      data: { url: data.url || '/' },
      tag,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
