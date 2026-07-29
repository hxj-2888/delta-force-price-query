// 三角洲行动 — 定时任务
// 单 cron "0 22 * * *" (每天 UTC 22:00 = 北京时间 06:00)
// 同时执行：采集每日价格到 D1 + 增量刷新元数据到 KV
//
// TODO: D1 免费版有存储上限（5GB），每天 ~1350 行，约 50 万行/年（~50MB）
// 建议后续加清理任务：每季度删除 180 天前的 price_history 记录
// 示例 SQL: DELETE FROM price_history WHERE recorded_date < date('now', '-180 days')

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';
const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];
const META_FIELDS = ['name', 'pic', 'grade', 'ShopSellType', 'desc', 'secondClassCN', 'length', 'width', 'weight', 'Weight', 'objectID', 'tid'];

export default {
  async scheduled(event, env, ctx) {
    // 单 cron "0 22 * * *" 同时处理：每日价格采集 + 每日增量元数据检查
    await runScheduled(env, ctx);
  },
};

async function runScheduled(env, ctx) {
  const token = (env.API_TOKEN || '').trim();
  if (!token) { console.error('[Cron] API_TOKEN 未配置'); return; }

  // ★ 拉取 item_price_all（价格+元数据共享这一次请求）
  console.log('[Cron] 拉取 item_price_all...');
  const priceUrl = `https://${API_HOST}${API_PATH}/item_price_all?token=${encodeURIComponent(token)}`;
  const priceResp = await fetch(priceUrl, {
    headers: { 'User-Agent': 'DeltaForceCron/1.0', 'Accept': 'application/json' },
  });
  if (!priceResp.ok) { console.error(`[Cron] item_price_all 返回 ${priceResp.status}`); return; }

  const priceData = await priceResp.json();
  if (priceData.code !== 0 || !Array.isArray(priceData.data)) {
    console.error(`[Cron] item_price_all 异常: code=${priceData.code}`); return;
  }
  console.log(`[Cron] 获取到 ${priceData.data.length} 个物品`);

  // ★ 补录：检查昨天是否有记录，没有就用当前数据补上（防止单次失败造成永久缺口）
  if (env.DB) {
    await backfillMissingDays(env, priceData);
  }

  // 任务 1: 采集每日价格到 D1
  await collectDailyPrices(env, priceData);

  // 任务 2: 增量刷新元数据到 KV（仅检查是否有新物品）
  await refreshMetadata(env, priceData, token);
}

// ===== 补录缺失天（最多回溯 3 天，防止 API 超时/D1 故障造成永久缺口） =====
async function backfillMissingDays(env, priceData) {
  const beijingNow = new Date(new Date().getTime() + 8 * 3600 * 1000);
  const todayStr = beijingNow.toISOString().split('T')[0];
  const items = priceData.data.filter(item => item.id && item.price > 0);

  for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
    const target = new Date(beijingNow);
    target.setDate(target.getDate() - daysAgo);
    const dateStr = target.toISOString().split('T')[0];
    // 跳过今天（由 collectDailyPrices 处理）
    if (dateStr === todayStr) continue;

    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM price_history WHERE recorded_date = ?`
      ).bind(dateStr).first();

      if (results && results.cnt > 100) {
        // 该天已有足够数据，停止回溯
        console.log(`[Backfill] ${dateStr} 已有 ${results.cnt} 条记录，回溯终止`);
        break;
      }

      console.log(`[Backfill] ${dateStr} 仅 ${results ? results.cnt : 0} 条，补录中...`);
      const stmts = items.map(item =>
        env.DB.prepare(`INSERT OR REPLACE INTO price_history (item_id, price, name, recorded_date) VALUES (?, ?, ?, ?)`)
          .bind(item.id, item.price, item.name || '', dateStr)
      );

      const BATCH = 100;
      let written = 0;
      for (let i = 0; i < stmts.length; i += BATCH) {
        try {
          await env.DB.batch(stmts.slice(i, i + BATCH));
          written += Math.min(BATCH, stmts.length - i);
        } catch (e) {
          console.error(`[Backfill] 批次写入失败 (${dateStr}, offset=${i}):`, e.message);
        }
      }
      console.log(`[Backfill] ${dateStr} 补录完成: ${written} 条`);
    } catch (e) {
      console.error(`[Backfill] ${dateStr} 查询/写入失败:`, e.message);
      break; // 连续失败则停止，下个 cron 周期再试
    }
  }
}

// ===== 每日价格采集（每日无条件写入，保证 30 天曲线无缺口） =====
async function collectDailyPrices(env, priceData) {
  if (!env.DB) { console.error('[Cron-price] D1 数据库未绑定'); return; }

  try {
    const items = priceData.data.filter(item => item.id && item.price > 0);
    console.log(`[Cron-price] ${items.length} 个有效物品`);
    if (items.length === 0) return;

    const now = new Date();
    const beijing = new Date(now.getTime() + 8 * 3600 * 1000);
    const today = beijing.toISOString().split('T')[0];

    // ★ 每日无条件全量写入，价格不变也存一行，保证每天都有数据点
    // D1 免费版 5GB，按 1307 物品 × 365 天 = ~48 万行/年 ≈ 50MB/年，完全够用
    const statements = items.map(item =>
      env.DB.prepare(`INSERT OR REPLACE INTO price_history (item_id, price, name, recorded_date) VALUES (?, ?, ?, ?)`)
        .bind(item.id, item.price, item.name || '', today)
    );

    const BATCH_SIZE = 100;
    let written = 0;
    let errors = 0;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      try {
        await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
        written += Math.min(BATCH_SIZE, statements.length - i);
      } catch (batchErr) {
        console.error(`[Cron-price] 批量写入失败 (offset=${i}):`, batchErr.message);
        errors++;
      }
    }
    console.log(`[Cron-price] 完成: ${items.length} 个物品, ${written} 条已写入` + (errors ? `, ${errors} 批失败` : ''));
  } catch (err) {
    console.error('[Cron-price] 执行失败:', err.message);
  }
}

// ===== 每周元数据刷新 =====
async function refreshMetadata(env, priceData, token) {
  if (!env.METADATA_KV) { console.error('[Cron-meta] METADATA_KV 未绑定'); return; }

  try {
    // Step 1: 提取全量物品 ID（复用已拉取的 priceData）
    const priceItemIds = new Set();
    priceData.data.forEach(item => { if (item.id) priceItemIds.add(Number(item.id)); if (item.tid) priceItemIds.add(Number(item.tid)); });
    console.log(`[Cron-meta] item_price_all 有 ${priceItemIds.size} 个唯一物品 ID`);

    // Step 2: 读取现有 KV 元数据
    let existingMeta = {};
    try {
      const kvRaw = await env.METADATA_KV.get('metadata', 'json');
      if (kvRaw && typeof kvRaw === 'object') existingMeta = kvRaw;
    } catch(e) {
      console.warn('[Cron-meta] KV 读取失败，视作空元数据:', e.message);
    }
    const existingIds = new Set(Object.keys(existingMeta).map(Number));
    console.log(`[Cron-meta] KV 现有 ${existingIds.size} 个物品元数据`);

    // Step 3: 找出新 ID
    const newIds = [];
    priceItemIds.forEach(id => {
      if (!existingIds.has(id) && id > 0) newIds.push(id);
    });
    console.log(`[Cron-meta] 发现 ${newIds.length} 个新物品 ID`);

    if (newIds.length === 0) {
      console.log('[Cron-meta] 无需更新，退出');
      return;
    }

    // Step 4: 并行拉取 10 个分类的 page 1
    console.log('[Cron-meta] 并行拉取 10 个分类的 item_list page 1...');
    const newIdSet = new Set(newIds);

    const itemListPromises = CATS.map(cat => {
      const url = `https://${API_HOST}${API_PATH}/item_list?types=${cat}&p=1&token=${encodeURIComponent(token)}`;
      return fetch(url, {
        headers: { 'User-Agent': 'DeltaForceMetaRefresh/1.0', 'Accept': 'application/json' },
      }).then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(data => ({ cat, data }));
    });

    const itemListResults = await Promise.all(itemListPromises);

    // Step 5: 从 page 1 提取新物品的元数据
    let newCount = 0;
    for (const { cat, data } of itemListResults) {
      if (!data || data.code !== 0 || !Array.isArray(data.data)) {
        console.warn(`[Cron-meta] ${cat} 返回异常，跳过`);
        continue;
      }
      for (const item of data.data) {
        if (!item.id) continue;
        const id = Number(item.id);
        const tid = item.tid ? Number(item.tid) : 0;
        if (!newIdSet.has(id) && !(tid && newIdSet.has(tid))) continue;

        const meta = { _category: cat };
        META_FIELDS.forEach(f => {
          if (item[f] !== undefined && item[f] !== null && item[f] !== '') {
            meta[f] = item[f];
          }
        });
        existingMeta[String(id)] = meta;
        newIdSet.delete(id);
        if (tid) newIdSet.delete(tid);
        newCount++;
      }
    }

    // Step 6: 写回 KV
    if (newCount > 0) {
      await env.METADATA_KV.put('metadata', JSON.stringify(existingMeta));
      console.log(`[Cron-meta] 完成: ${newCount} 个新物品元数据已写入 KV, 总计 ${Object.keys(existingMeta).length} 件`);
    } else {
      console.log('[Cron-meta] 未能在 page 1 中找到新物品的元数据（可能在更后面的页，下周重试）');
    }
  } catch (err) {
    console.error('[Cron-meta] 执行失败:', err.message);
  }
}
