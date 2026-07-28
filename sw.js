// ===== 三角洲行动 - 价格自动记录 Service Worker =====
// 利用 Periodic Background Sync API，即使页面关闭也能每天后台抓取价格
// Chrome 80+ / Edge 80+ 支持，需要用户授权
// 回退方案：页面打开时自动补录当天数据

// 使用同域 API 代理，无需硬编码后端地址
const PROXY_URL = self.location.origin + '/api/proxy';

const DB_NAME = 'deltaforce_price_db';
const DB_VERSION = 1;
const STORE_NAME = 'daily_prices';

self.addEventListener('install', () => {
  console.log('[SW] install');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] activate');
  e.waitUntil(clients.claim());
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
