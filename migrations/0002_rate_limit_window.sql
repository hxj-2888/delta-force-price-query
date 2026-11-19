-- 0002: /api/proxy 跨节点全局限流计数表
-- 设计: 每分钟一个窗口行, 每次请求原子 +1 并返回当前计数,
--       超过 RATE_MAX_GLOBAL(600/分钟) 则拒绝。旧行由查询侧惰性清理。
-- 说明: KV 因免费额度写限制(1000次/天)不适合计数; D1 免费 10 万写/天足够,
--       且为原子 UPSERT, 无跨节点竞态。故障时 API 层自动降级回内存限流。

CREATE TABLE IF NOT EXISTS rate_limit_window (
  win   TEXT PRIMARY KEY,          -- 窗口标识: 'g' + yyyyMMddHHmm (UTC+8)
  n     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window_win ON rate_limit_window(win);
