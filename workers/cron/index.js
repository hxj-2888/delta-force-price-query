// 三角洲行动 — 每日价格采集 Cron Worker
// 每天 UTC 22:00（北京时间 06:00）从上游 API 拉取全量价格写入 D1

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

export default {
  async scheduled(event, env, ctx) {
    const token = (env.API_TOKEN || '').trim();
    if (!token) { console.error('[Cron] API_TOKEN 未配置'); return; }
    if (!env.DB) { console.error('[Cron] D1 数据库未绑定'); return; }

    try {
      console.log('[Cron] 开始拉取全量价格...');
      const url = `https://${API_HOST}${API_PATH}/item_price_all?token=${encodeURIComponent(token)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'DeltaForcePriceQuery/1.0', 'Accept': 'application/json' },
      });

      if (!resp.ok) { console.error(`[Cron] 上游 API 返回 ${resp.status}`); return; }

      const data = await resp.json();
      if (data.code !== 0 || !Array.isArray(data.data)) {
        console.error(`[Cron] 上游 API 返回异常: code=${data.code}`); return;
      }

      const items = data.data.filter(item => item.id && item.price > 0);
      console.log(`[Cron] 获取到 ${items.length} 个有效物品`);
      if (items.length === 0) return;

      const { results: lastRecords } = await env.DB.prepare(`
        SELECT item_id, price FROM price_history
        WHERE (item_id, recorded_date) IN (
          SELECT item_id, MAX(recorded_date) FROM price_history GROUP BY item_id
        )
      `).all();

      const lastPriceMap = {};
      for (const row of lastRecords) { lastPriceMap[row.item_id] = row.price; }

      const today = new Date().toISOString().split('T')[0];
      const statements = [];
      for (const item of items) {
        const lastPrice = lastPriceMap[item.id];
        if (lastPrice !== undefined && lastPrice === item.price) continue;
        statements.push(
          env.DB.prepare(`INSERT OR IGNORE INTO price_history (item_id, price, name, recorded_date) VALUES (?, ?, ?, ?)`)
            .bind(item.id, item.price, item.name || '', today)
        );
      }

      if (statements.length === 0) { console.log('[Cron] 所有物品价格无变化'); return; }

      const BATCH_SIZE = 100;
      let written = 0;
      for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        try {
          await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
          written += Math.min(BATCH_SIZE, statements.length - i);
        } catch (batchErr) {
          console.error(`[Cron] 批量写入失败 (offset=${i}):`, batchErr.message);
        }
      }
      console.log(`[Cron] 完成: ${items.length} 个物品, ${written} 条变动已写入`);
    } catch (err) {
      console.error('[Cron] 执行失败:', err.message);
    }
  },
};
