# 部署指南 — 价格历史 + 定时采集

## 1. 创建 D1 数据库
```bash
wrangler d1 create delta-force-prices
# 把返回的 database_id 填入 wrangler.toml（根目录和 workers/cron/wrangler.toml 两处）
```

## 2. 初始化表结构
```bash
wrangler d1 execute delta-force-prices --remote --file=migrations/0001_create_price_history.sql
wrangler d1 execute delta-force-prices --remote --file=migrations/0002_rate_limit_window.sql
wrangler d1 execute delta-force-prices --remote --file=migrations/0003_rate_limit_client.sql
```
> 0003 是按客户端限流（`X-Client-Id`，匿名 ID：网页端 localStorage 生成、桌面版装机指纹哈希）的
> 计数表。表未创建时限流自动降级为仅内存计数，不影响可用性；阈值常量
> `RATE_MAX_PER_CLIENT` 在 `functions/api/[[path]].js`（规范实现 `scripts/rate-limit.cjs`）。

## 3. 部署 Pages（前端 + API 代理）
```bash
node tools/deploy-pages.cjs
```
> 白名单暂存后部署（与太空杀仓 `tools/deploy-pages.cjs` 同一模式）。
> 禁止 `wrangler pages deploy .` 整目录直推：`.assetsignore` 对 pages deploy 无效（2026-08-29 实测），
> 会把 .env（签名密码）、release.keystore、miniprogram/、test/ 等一并公开到线上。
> 白名单必须包含 `lib/` 与 `scripts/rate-limit.cjs`——Pages 函数 import 这些模块，缺了打包即失败。
> 安装包（apk/zip）不进 git：本地磁盘没有时脚本警告并跳过；CI 部署前从 GitHub Release 拉回。

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
