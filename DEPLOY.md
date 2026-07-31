# 部署指南 — 价格历史 + 定时采集

## 1. 创建 D1 数据库
```bash
wrangler d1 create delta-force-prices
# 把返回的 database_id 填入 wrangler.toml（根目录和 workers/cron/wrangler.toml 两处）
```

## 2. 初始化表结构
```bash
wrangler d1 execute delta-force-prices --remote --file=migrations/0001_create_price_history.sql
```

## 3. 部署 Pages（前端 + API 代理）
```bash
wrangler pages deploy . --branch=preview
```

## 4. 部署 Cron Worker（独立 Worker，定时采集价格）
```bash
cd workers/cron
wrangler secret put API_TOKEN   # 输入上游 API Token
wrangler deploy                  # 部署后 cron 自动生效（表达式已在 wrangler.toml 中声明）
```

> **注意**：Cron Worker 是独立部署的 Worker（`workers/cron/`），不是 Pages Functions 的一部分。
> Pages Functions 不支持 cron 触发器。`workers/cron/wrangler.toml` 中已声明 `crons = ["0 22 * * *"]`，
> 部署后自动按北京时间每天 06:00 执行，无需在 Dashboard 手动配置。

## 5. 配置 Pages 环境变量
Dashboard → Workers & Pages → 你的 Pages 项目 → Settings → Variables
添加: `API_TOKEN` = 你的上游 API Token

> 如果不配 API_TOKEN，`/api/proxy` 代理将返回 500 错误。
