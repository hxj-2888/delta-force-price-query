-- 0003: 按客户端限流计数表（「同账号」维度, 防脚本刷）
-- 设计: 该项目没有账号体系, 以匿名客户端 ID（X-Client-Id 头）等价「账号」:
--       网页端 localStorage 生成、桌面版用装机指纹哈希, 服务端只作为限流桶。
--       每分钟窗口一行（win, client）, 每次请求原子 +1 并返回当前计数,
--       超过 RATE_MAX_PER_CLIENT 则拒绝。旧行由查询侧惰性清理（概率 1/20）。
--       与 0002 的全局窗口同构; D1 故障时 API 层自动降级回内存计数。

CREATE TABLE IF NOT EXISTS rate_limit_client (
  win    TEXT NOT NULL,               -- 窗口标识: 'c' + yyyyMMddHHmm (UTC+8)
  client TEXT NOT NULL,               -- X-Client-Id（格式校验通过才入库）
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (win, client)
);
