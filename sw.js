// ===== sw.js — Service Worker 后台价格记录 =====
// 功能清单: Periodic Background Sync每日自动抓取全量价格→IndexedDB | 分批写入(500条/批)
// 为30天价格折线图提供每日数据锚点,即使页面未打开也能积累历史
// 依赖: IndexedDB(deltaforce_price_db/daily_prices) 同域/api/proxy
// 改动影响: 修改记录频率→影响价格图表数据密度; 修改分批大小→影响写入性能

// 使用同域 API 代理，无需硬编码后端地址
const PROXY_URL = self.location.origin + '/api/proxy';

const DB_NAME = 'deltaforce_price_db';
const DB_VERSION = 2;  // ★ 与 store.js MAIN_DB_VERSION 保持一致
const STORE_NAME = 'daily_prices';
const STATIC_CACHE = 'deltaforce-static-v1';

self.addEventListener('install', () => {
  console.log('[SW] install');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] activate');
  e.waitUntil(clients.claim());
});

// ★ fetch handler：满足 Chrome/Edge 的 PWA 可安装条件（要求 SW 注册 fetch 事件），
//   同时提供轻量运行时缓存：HTML 网络优先，静态资源缓存优先（版本号 ?v= 保证更新）
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 仅处理同源 GET，API 请求一律走网络（保证价格实时）
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname === '/' || url.pathname === '/index.html') {
    // HTML 网络优先：离线时回退缓存，保证已安装应用可打开
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(url.pathname, copy));
          return resp;
        })
        .catch(() => caches.match(url.pathname))
    );
    return;
  }

  // 静态资源（css/js/img/manifest 等）：缓存优先 + 后台更新
  e.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request)
        .then((resp) => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Periodic Background Sync 主入口
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'record-daily-prices') {
    e.waitUntil(recordPrices());
  }
});

async function recordPrices() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'item_price_all' }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.code !== 0 || !Array.isArray(data.data)) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayTs = Math.floor(today.getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    const entries = data.data
      .filter(item => item.id && item.price > 0)
      .map(item => ({
        key: String(item.id) + '_' + dayTs,
        itemId: item.id,
        dayTs: dayTs,
        ts: now,
        price: item.price,
        name: item.name || '',
        pic: item.pic || ''
      }));

    if (entries.length === 0) {
      console.log('[SW] recordPrices: 无有效数据');
      return;
    }

    // 分批写入 IndexedDB（每批 500 条，避免大事务超时）
    const db = await openDB();
    const BATCH = 500;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const entry of batch) {
        store.put(entry);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    console.log('[SW] recordPrices: 已记录 ' + entries.length + ' 件物品');
  } catch (e) {
    console.error('[SW] recordPrices error:', e);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}
