-- 三角洲行动 - 价格历史数据库
-- D1 迁移 #1: 创建 price_history 表

CREATE TABLE IF NOT EXISTS price_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL,
  price         REAL    NOT NULL,
  name          TEXT    NOT NULL DEFAULT '',
  recorded_date TEXT    NOT NULL,
  UNIQUE(item_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_item_date
  ON price_history(item_id, recorded_date DESC);

CREATE INDEX IF NOT EXISTS idx_item_max_date
  ON price_history(item_id, recorded_date);
