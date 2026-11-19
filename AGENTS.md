# AGENTS.md — 落幕查

> **当前版本**：v20261025q（bundle）· 安卓 `versionName` 3.1 / `versionCode` 3 · 最后更新：2026-11-08（同步 2026-11-04 价格历史 30 天滚动保留状态；补 PowerShell 7 约定）
> **一句话**：三角洲行动变卖物实时价格查询工具（网页 PWA / Windows 安装包 / 安卓 APK / 微信小程序四端同源）。
> **接手入口**：[`README.md`](README.md) → [`DEPLOY.md`](DEPLOY.md) → [`CHANGELOG.md`](CHANGELOG.md) → 本文。
>
> 版本号会随每次 `npm run build` 变化；上方的 `v2026…` 只是本文最后修订时的快照，
> **以 `index.html` 头部的 `build:` 注释为准**（`npm run check` 会强制它与 bundle 一致）。

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
| 语法检查 | `npm run lint`（65 个 JS 文件） |
| 单元测试 | `npm test`（18 项） |
| **bundle 与版本一致性** | `npm run check`（`scripts/build.js --check`） |
| 重建 bundle | `npm run build` |
| 抓取元数据 | `npm run generate-metadata` |
| 部署（唯一正确姿势） | `node tools/deploy-pages.cjs` |
| 首页 UI 冒烟 | `npm run smoke:home`（40 项） |
| 滚动条冒烟（桌面双栏/窄屏/移动端） | `npm run smoke:scrollbar`（14 项） |
| 主题冒烟（明暗 × 红涨绿涨 四组合对比度） | `npm run smoke:theme`（51 项） |
| 文档死链 | `node tools/check-docs.cjs` |

> 三个 `smoke:*` 需要先 `node server.js` 另开终端，并设 `NODE_PATH` 指向装有
> `playwright-core` 的目录（本机不在本项目 node_modules 里）。它们用 Playwright 驱动系统 Chrome。
> 注意 `home-ui-smoke` 会真实请求上游，连跑多次可能撞 429 限流而假失败；等 45s 重跑即可，
> 不要误判为回归。

### PowerShell 7（强制）

- **只在需要调用命令行时使用**：能用专用工具、API 或直接编辑完成的操作，直接用对应工具，不要为了用命令行而用命令行。
- 需要调用命令行时，统一用 **PowerShell 7**：`pwsh` / `pwsh.exe`；**不要用 Windows PowerShell 5.1**（`powershell.exe`）。
- 默认不用 Git Bash / `cmd.exe`；仅当项目脚本明确依赖 POSIX 工具且无法用 PowerShell 等价实现时，先说明原因再使用。
- 多行脚本写成临时 `.ps1`，用 `pwsh -NoProfile -File` 调用；环境变量用 `$env:VAR='...'`，路径含空格时加引号。
- 校验：`pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'` 应输出 7.x（本机 7.6.5），不是 5.1。

### 什么算"绿"

- `npm run lint` 65 文件全过
- `npm test` 18/18
- `npm run check` 通过：`bundle.js` 与源码一致、**且 index.html 的 `build:` 注释 / bundle 版本 / 三处版本号一致**
- 文档死链 0
- 改了 UI/样式：`smoke:theme`（必跑）+ `smoke:home` + `smoke:scrollbar` 全过

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
10. **颜色只许走令牌，且两根轴都要给值。** 主题 `data-theme`（light/dark）与涨跌
   `data-scheme`（cn/intl）是正交的两根轴，共 4 种组合，`css/layout.css` 里逐一显式声明。
   禁止在 CSS/JS 里写死具体色值（`rgba(240,181,66,…)` 这类），要半透明就用
   `color-mix(in srgb, var(--brand) 40%, transparent)`。改色后必须跑 `tools/theme-smoke.cjs`
   ——它会对 4 种组合逐一断言对比度（正文 ≥7:1、小字/涨跌 ≥4.5:1）。
   SVG 属性不支持 `var()`，图表颜色必须经 `getChartTheme()` 读令牌后写成字面值，
   并在主题切换时重绘（`repaintChartsForTheme()`）。

---

## 四、文件地图

| 路径 | 说明 |
|---|---|
| `index.html` | 单页入口（含内联预取脚本 + 内联关键 CSS，`script-src` 需 `'unsafe-inline'`） |
| `js/` | 源码（`render/` 视图、`store/` 缓存与收藏、`app/` 路由与初始化、`utils.js`、`config.js`）→ 打包为 `js/bundle.js` |
| `css/layout.css` · `css/components.css` | 仅这两个被 `<link>`。**令牌层在 layout.css 顶部**（明暗双主题 + 涨跌双轴） |
| `scripts/build.js` | 打包 + 版本号生成 + `--check` + CSS 内容哈希（仅内容变才换版本） |
| `scripts/lint.js` | 零依赖语法检查（`node --check`，ESM 复制为 .mjs 再查） |
| `scripts/generate-metadata.js` | 元数据抓取（含 429 退避、写入前条目数校验） |
| `scripts/rate-limit.cjs` | **限流阈值唯一实现**，桌面版与云端共用；必须在部署白名单里 |
| `lib/` | 云端与桌面版共享的后端模块：`api-auth` / `api-response` / `rate-limit-d1` / `handlers/` / `node/` |
| `functions/api/[[path]].js` | Pages Functions 派发层（限流 → 心跳 → 来源校验 → 脚本鉴权 → 业务路由） |
| `lib/handlers/` | 业务实现：`proxy`（枚举白名单）/ `metadata` / `history` / `cron-status` |
| `workers/cron/` | 独立 Cron Worker（D1 `price_history` 写入 + KV 心跳） |
| `server.js` | 本地/便携/安装包版服务器（纯中继到线上 Pages；本地不持 Token） |
| `migrations/` | D1 表结构（`0001` 价格历史 / `0002` 全局限流 / `0003` 客户端限流） |
| `sw.js` · `manifest.json` | PWA 离线与安装 |
| `test/` | `node --test` 单测：bundle 一致性 / 元数据 / 限流 / 服务器冒烟 |
| `tools/` | 部署脚本 + 三个 Playwright UI 冒烟 + 文档死链检查 |
| `weapp/` | 微信小程序源码（43 文件，视觉未同步换装，见 CHANGELOG 遗留） |
| `design/` | 设计评审产物（demo + 真实快照工具）。**不参与构建与部署**；`demo-data.js`/`real-prices.json` 由脚本生成、不入库 |
| `data/metadata.json` | 静态元数据（约 430KB / 1359 件） |
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
