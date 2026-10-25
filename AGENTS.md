# AGENTS.md — 落幕查

> **当前版本**：v20261024v（bundle）· 安卓 `versionName` 3.1 / `versionCode` 3 · 最后更新：2026-10-24（理财行情风换装：设计令牌/红涨绿跌可切/市场宽度卡，详见 CHANGELOG；`design/` 为评审产物不入构建）
> **一句话**：三角洲行动变卖物实时价格查询工具（网页 PWA / Windows 安装包 / 安卓 APK / 微信小程序四端同源）。
> **接手入口**：[`README.md`](README.md) → [`DEPLOY.md`](DEPLOY.md) → [`CHANGELOG.md`](CHANGELOG.md) → 本文。

---

## 一、开工前必读

1. [`DEPLOY.md`](DEPLOY.md) —— D1 / Pages / Cron Worker 三步部署，缺一步价格历史就是空的
2. [`CHANGELOG.md`](CHANGELOG.md) —— 已记录的「已知遗留」清单，**不要重复踩**
3. 本文 §三 红线

---

## 二、命令与门禁

| 目的 | 命令 |
|---|---|
| 本地起服务 | `npm start`（`node server.js`） |
| 语法检查 | `npm run lint`（43 个文件） |
| 单元测试 | `npm test`（8 项） |
| **bundle 与版本一致性** | `npm run check`（`scripts/build.js --check`） |
| 重建 bundle | `npm run build` |
| 抓取元数据 | `npm run generate-metadata` |
| 部署（唯一正确姿势） | `node tools/deploy-pages.cjs` |
| 首页 UI 冒烟 | `node tools/home-ui-smoke.cjs` |
| 滚动条冒烟（桌面双栏/窄屏/移动端） | `node tools/scrollbar-smoke.cjs` |
| 文档死链 | `node tools/check-docs.cjs` |

### 什么算"绿"

- `npm run lint` 43 文件全过
- `npm test` 8/8
- `npm run check` 通过：`bundle.js` 与源码一致、**且 index.html 的 `build:` 注释 / bundle 版本 / 三处版本号一致**
- 文档死链 0

---

## 三、红线

1. **绝不整目录直推 Pages。** `.assetsignore` 对 `wrangler pages deploy` **无效**
   （那是 Workers static assets 的特性），整目录直推会把 `.env`（真实 API Token）与
   `android/release.keystore`（签名私钥）**公开**。部署只走 `tools/deploy-pages.cjs` 的白名单暂存。
2. **上游没有的字段不许造。** `item_price_all` 与 `metadata.json` 没有成交量/挂单量字段
   （全仓 grep 0 命中）。任何"量 XXX"的展示都是臆造，明确不做。
3. **版本号是推导出来的，不是手写的。** 版本号来自 `scripts/build.js` 的 `makeVersion()`
   （`vYYYYMMDD+小时字母`），并自动写回 `index.html` 的 `build:` 注释；由 `--check` 强制一致。
4. **SW 缓存名必须带版本，数据类资源不许缓存优先。** 静态资源名 `deltaforce-static-<版本>`；
   `/data/*` 必须是**网络优先**，否则 `metadata.json` 永久陈旧。
5. **Cron 不在 Pages 里。** Pages Functions 只导出 `onRequest`，**不支持 Cron Triggers**；
   定时任务在独立 Worker `workers/cron/`，由 `.github/workflows/deploy-cron.yml` 部署。
   改定时逻辑去那里，不要去 Pages 配置里找。
6. **`/api` 路由必须精确匹配。** 不许用 `startsWith('/api')`，否则 `/api-not-real` 会被当代理转发。
7. **来源校验不是鉴权。** `isAuthorizedOrigin` 对**无 `Origin`** 的服务端请求放行——
   它只挡跨站浏览器，挡不住 `curl`。不要把它当访问控制来宣称安全。
8. **密钥永不入库、永不发布。** `.env` 与 `*.keystore` 只在本地；`.gitignore` 之外还必须在
   部署白名单里被排除（见红线 1）。
9. **桌面 ≥1024px 下 window 不滚动，`.page` 才是滚动容器。** 双栏布局里左右两栏各自
   `overflow-y:auto`，`document.documentElement.scrollTop` 恒为 0。任何"回到顶部/记录滚动位置/
   滚动条"逻辑都必须按容器写（`el.scrollTop`），不能只写 `window.scrollTo`。
   滚动位置读写统一走 `window.__dfGetScrollTop()` / `window.__dfRestoreScrollTop(y)`。

---

## 四、文件地图

| 路径 | 说明 |
|---|---|
| `index.html` | 单页入口（含内联预取脚本，`script-src` 需 `'unsafe-inline'`） |
| `js/` | 源码（`render/` 视图、`utils.js` 工具、`config.js` 配置）→ 打包为 `js/bundle.js` |
| `scripts/build.js` | 打包 + 版本号生成 + `--check` |
| `scripts/generate-metadata.js` | 元数据抓取（含 429 退避、写入前条目数校验） |
| `functions/api/[[path]].js` | Pages Functions：`/api/proxy`（**枚举白名单**）、`/api/metadata`、`/api/history/:id` |
| `workers/cron/` | 独立 Cron Worker（D1 `price_history` 写入） |
| `server.js` | 本地/便携/安装包版服务器（含本地 CSP、`/api/metadata`、`/api/history`） |
| `migrations/` | D1 表结构 |
| `sw.js` · `manifest.json` | PWA 离线与安装 |
| `android/` | APK 构建（**含 keystore，禁止发布**） |
| `tools/deploy-pages.cjs` | **唯一允许的部署脚本**（白名单暂存） |

---

## 五、记录要求

- 变更记录写在 [`CHANGELOG.md`](CHANGELOG.md)：`## YYYY-MM-DD — 主题（版本号）` + 条目五要素。
- 每条修复必须写**现象 → 根因 → 改动 → 验证**；验证要贴命令输出或实测数字。
- 尾部固定：`已知遗留（按优先级）` / `已否决`。
- 文档偏差（README/注释与实际不符）也记在当轮，不要单独开一轮"文档清理"。

---

## 六、提交前自检

- [ ] 部署用的是 `tools/deploy-pages.cjs`，不是 `wrangler pages deploy .`？
- [ ] `.env` / keystore 有没有进过发布目录？
- [ ] `npm run check` 过了吗（bundle 与三处版本号一致）？
- [ ] 新增的展示字段，上游真的有吗？
- [ ] 改缓存策略了吗？`/data/*` 还是网络优先吗？
- [ ] 部署链路里的 Secret（`UPSTREAM_API_TOKEN`）与 Cloudflare 环境变量一致吗？
