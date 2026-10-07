'use strict';
// ===== D1 跨节点限流层（Pages 函数专用） =====
// 内存层（每 IP / 每客户端）见 scripts/rate-limit.cjs——那是唯一实现，与本模块互补：
// 内存层拦单节点高频（快，零 IO），本模块的 D1 原子 UPSERT 计数跨边缘节点统一阈值。
// 阈值一律取 scripts/rate-limit.cjs 的 DEFAULTS，不在此重定义。
// D1 未绑定 / 表未创建 / 临时故障时返回 true（降级为仅内存限流），不阻塞业务。

const { DEFAULTS } = require('../scripts/rate-limit.cjs');

// 全局限流: 窗口 = 'g' + 北京时间 yyyyMMddHHmm, 旧行每次检查顺带清理（概率 1/20, 控制 D1 写放大）
async function checkGlobalRateLimitDB(db) {
  if (!db) return true; // D1 未绑定 → 降级
  try {
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const win = 'g' + bj.toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
    const { results } = await db.prepare(`
      INSERT INTO rate_limit_window (win, n) VALUES (?1, 1)
      ON CONFLICT(win) DO UPDATE SET n = n + 1
      RETURNING n
    `).bind(win).all();
    const n = results && results[0] ? results[0].n : 0;
    if (Math.random() < 0.05) {
      db.prepare("DELETE FROM rate_limit_window WHERE win < ?1").bind('g' + win.slice(1)).run().catch(() => {});
    }
    return n <= DEFAULTS.maxGlobal;
  } catch (e) {
    // 表不存在或 D1 临时故障: 降级为仅内存限流
    console.warn('[ratelimit] D1 全局限流降级:', e.message);
    return true;
  }
}

// 跨节点按客户端计数: 窗口 = 'c' + 北京时间 yyyyMMddHHmm, 旧行惰性清理（概率 1/20）
// 表 rate_limit_client 见迁移 0003
async function checkClientRateLimitDB(db, clientId) {
  if (!db) return true; // D1 未绑定 → 降级
  try {
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const win = 'c' + bj.toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
    const { results } = await db.prepare(`
      INSERT INTO rate_limit_client (win, client, n) VALUES (?1, ?2, 1)
      ON CONFLICT(win, client) DO UPDATE SET n = n + 1
      RETURNING n
    `).bind(win, clientId).all();
    const n = results && results[0] ? results[0].n : 0;
    if (Math.random() < 0.05) {
      db.prepare("DELETE FROM rate_limit_client WHERE win < ?1").bind(win).run().catch(() => {});
    }
    return n <= DEFAULTS.maxPerClient;
  } catch (e) {
    // 表未创建或 D1 临时故障: 降级为仅内存限流
    console.warn('[ratelimit] D1 客户端限流降级:', e.message);
    return true;
  }
}

module.exports = { checkGlobalRateLimitDB, checkClientRateLimitDB };
