# 修改记录

格式：倒序，最新在最上。版本号与 `scripts/build.js` 生成的 bundle 版本（`vYYYYMMDD+小时字母`）对应。

---

## 2026-08-29 — 安全加固（`v20260829q`，无前端产物变更）

> 全项目安全审计后的整改；bundle 未变，版本号沿用。

- `/api/proxy`（functions 与 server.js 同步）：endpoint 由字符集校验收紧为**枚举白名单**
  （当前仅 `item_list` / `item_price_all`），防止代理+token 被用来调用上游任意子路径。
- 新增 `deploy-pages.ps1`：本地部署改为**白名单暂存**——实测 `.assetsignore` 对
  `wrangler pages deploy` 无效（那是 Workers static assets 的特性），整目录直推会把
  磁盘上的 `.env`（签名密码）与 `android/release.keystore` 公开；禁止再手动整目录直推。
- 移除无效的 `.assetsignore`；CHANGELOG 移除本机备份目录路径。

---

## 2026-08-29 — 应用更名「落幕查」（`v20260829q`）

> 起因：用户要求应用名改为「落幕查」，移除主页「三角洲行动」字样，安卓端版本号升至 3.0。
> 说明：无 JS 源码改动，bundle 因工作区行尾归一（CRLF）重建，版本号顺延 `v20260829p → v20260829q`。

### 更名范围

- **网页端**：`index.html` 标题 / 头部标题 / PWA 名称、`manifest.json` name/short_name/description、`download.html` 标题与图标名提示。
- **桌面端**：`start.bat` / `setup.bat` 窗口标题与快捷方式名、`installer.iss` 安装包名与快捷方式。
- **安卓端**：`AndroidManifest.xml` label →「落幕查」，`versionName 1.0.0 → 3.0`、`versionCode 1 → 2`（`build.cmd` 的 aapt2 参数同步）。
- **小程序端**：`app.json` / 首页导航标题、项目描述。
- **其他**：`package.json` 描述与关键词、`server.js` 启动横幅、`test/server.test.mjs` 首页冒烟断言（`三角洲行动` → `落幕查`）。
- 未动：`js/` 源码与 `bundle.js`（无 JS 改动，bundle 版本保持 `v20260829p`）；README/CHANGELOG 中的历史记载；download.html 中小程序的微信搜索名（平台侧名称，代码改不到）。

### 构建脚本

- `android/build.cmd`：签名密码优先从 gitignored 根 `.env` 读取（`KEYSTORE_PASS`/`KEY_PASS`），其次环境变量，最后交互提示。

---

## 2026-08-29 — 列表小图分辨率提升（`v20260829p`）

> 起因：高分屏（DPR≥2）上列表物品图发糊，用户要求提高拉取像素。

### 列表物品图 72px → 144px

- **改动**：`smallPicUrl` 缩略参数从 `thumbnail/72x` 提升到 `thumbnail/144x`
  （`js/utils.js` 默认值 + `render/home.js`、`render/list.js`、`render/search.js`、`render/favtab.js` 共 8 处调用点）。
  腾讯云 CI webp 下单张约 1.3KB → 约 3KB，36px 展示位在 3~4 倍屏上不再发糊，首屏增量约 100KB。
- **实测**：`node scripts/build.js --check` 通过、`npm test` 8/8 通过、`node scripts/lint.js` 43 文件通过。

---

## 2026-08-29 — 安全与稳定性修复（`v20260829j`）

> 起因：全项目风险分析后的一次集中整改。
> 改动前备份：（本机备份目录，路径略）（完整副本，含 `.git`）。

### P0-1 修复：桌面版 / 便携版 / 安装包版物品名称全部显示为「物品#ID」

- **现象**：`index.html` 的预取脚本固定请求 `/api/metadata`，但 `server.js` 没有实现该路由。
  请求掉进 `proxyApi` 的 URL path 兜底逻辑，被当成上游接口转发到
  `orzice.com/workApi/v1/sjz_api/metadata`，上游返回错误 JSON。
  而预取代码只做 `r.json()`，既不检查 `resp.ok` 也不检查 `code`，错误体被当成元数据使用，
  于是 `metadata[item.id]` 恒为 `undefined`，全站物品名退化为 `物品#<id>`。
- **改动**
  - `server.js`：新增 `/api/metadata`（带 mtime 缓存读取 `data/metadata.json`）与
    `/api/history/:id`（本地无 D1，明确返回 `{code:-1}`，前端自动降级到本地快照）。
    两者均排在 `/api` 代理分支之前。
  - `index.html`：给 `/api/metadata` 与静态文件兜底补上 `resp.ok`、结构、空内容、非 0 `code` 四道校验。
- **实测**（本地起服务验证）
  ```
  GET /api/metadata      → 200，1350 条，无 code 字段（修复前为上游错误体）
  GET /api/history/123   → 200 {code:-1}（前端降级到本地快照）
  ```

### P0-2 修复：元数据自动刷新可能把残缺数据发布到线上

- **现象**：`scripts/generate-metadata.js` 抓全量分页（10 分类），但 Pages 端限流为
  **120 次/分钟/IP**，而 GitHub Actions 是单一出口 IP，必然撞上 429；
  脚本原样无重试、失败页静默丢弃，结尾**无条件覆写** `data/metadata.json`，
  随后 `metadata-refresh.yml` 检测到 diff 就自动提交并触发全量部署。
- **改动**
  - 抽出 `fetchOnce()`，新增 `fetchViaProxy()`：对 429/5xx/网络错误做指数退避重试
    （2s→4s→8s→16s，429 额外 +20s 等限流窗口滑过），最多 4 次；
    4xx（除 429）与 JSON 解析错误不重试。
  - 翻页并发由 6 降到 3，降低 60s 窗口内撞满限流的概率。
  - 新增**写入前校验**：条目数 < 1000 或低于旧文件的 90% 时拒绝写入并 `exit(1)`，保留旧文件。
  - 结束时输出成功/失败页数，便于定位。

### P0-3 修复：每日价格采集任务从未被 CI 部署

- **现象**：根 `wrangler.toml` 注释指示在 Pages 项目的
  `Settings → Functions → Cron Triggers` 配置定时任务，但 **Pages Functions 不支持 Cron**
  （只导出 `onRequest`），该配置项并不存在；而两个已有工作流都只做 `wrangler pages deploy`。
  真正的 Cron 是独立 Worker `workers/cron/`，从未被自动部署过 → D1 `price_history` 可能长期为空。
- **改动**
  - 新增 `.github/workflows/deploy-cron.yml`：部署 `workers/cron/`（独立触发 + 被 `deploy.yml` 调用）。
    未配置 `UPSTREAM_API_TOKEN` 时跳过并告警，不会让主流程变红。
  - `deploy.yml`：Pages 部署后新增 `deploy-cron` job。
  - 修正 `wrangler.toml` 注释，改为指向 `DEPLOY.md` 第 4 节与 `deploy-cron.yml`。

### P0-4 修复：部署资产未排除敏感文件

- **现象**：`.assetsignore` 未排除 `.env`（含真实 API_TOKEN）与 `android/`（含 `release.keystore`
  签名私钥）。Cloudflare 官方文档只保证 `.assetsignore` 生效，不能依赖 `.gitignore`。
- **改动**：`.assetsignore` 新增 `.env`、`.env.*`、`*.keystore`、`*.jks`、`*.pem`、`*.key`、
  `wrangler.toml`、`.wrangler/`、`.vercel/`、`android/`。
- **注意**：根目录的 `delta-force.apk` / `delta-force-portable.zip` 是 `download.html` 的分发产物，
  本轮**仍随 Pages 发布**（未加 `*.apk`/`*.zip`，否则下载页会 404）。建议后续迁移到 GitHub Release
  后再排除，已在文件注释中标注。

### P1 加固

| 项 | 改动 |
|---|---|
| 误发布风险 | `package.json` 新增 `"private": true`（原缺 `private` 且有 `bin` 字段，一次 `npm publish` 就会把依赖 token 的服务端脚本推上公共 registry） |
| 预取数据净化 | `index.html` 合并后统一把 `id/tid/price/bl/day_*_bl/grade/length/width/weight` 等数值字段收敛为有限数字（预取路径不走 `sanitizeItemArray`，因为此刻 `bundle.js` 尚未加载） |
| 渲染层转义 | `js/render/detail.js` 的占格/重量字段加 `escapeHtml`；7 处 `onclick` 与 1 处 `data-item-id` 中的 id 由 `JSON.stringify(item.id)` 改为 `Number(item.id)` |
| SW 缓存 | `sw.js` 缓存名由固定 `deltaforce-static-v2` 改为 `deltaforce-static-<版本>`（版本取自注册 URL 的 `?v=`），发版即自动隔离并触发旧缓存清理；`/data/*` 由缓存优先改为网络优先，修复 `metadata.json` 永久陈旧 |
| Cron 健壮性 | `workers/cron/index.js` 新增 `fetchWithTimeout()`（价格拉取 25s、翻页 15s）；元数据翻页加 40s 总预算，超时则中断并保留已收集部分；`INSERT OR REPLACE` 改为 `ON CONFLICT ... DO UPDATE`（避免自增 id churn） |
| 路由匹配 | `server.js` 的 `/api` 判断由 `req.url.startsWith('/api')` 收紧为路径精确匹配（`/api-not-real` 不再被误当代理） |

### 文档与注释修正（原描述与代码不符的部分）

| 位置 | 原描述 | 实际情况 / 修正后 |
|---|---|---|
| `wrangler.toml:15-16` | 「Cron 触发器：Dashboard → Pages 项目 → Functions → Cron Triggers」 | Pages Functions 不支持 Cron，该配置项不存在。已改为指向 `DEPLOY.md` 第 4 节与 `deploy-cron.yml` |
| `.assetsignore:3` | 「wrangler pages deploy 会同时尊重 .gitignore 与 .assetsignore」 | Cloudflare 官方文档仅保证 `.assetsignore` 生效。已改为如实说明，并要求敏感文件必须写在本文件 |
| `index.html:2` | `build: v20260731q` | 实际已到 `v20260805w`。已让 `scripts/build.js` 自动同步该注释，并将一致性纳入 `--check`（CI 强制） |
| `README.md` 项目结构 | 缺 `_headers`、`wrangler.toml`、`.assetsignore`、`android/`、`download.html`、`CHANGELOG.md` 等 | 已补全，并标注 `.env` 除不入库外还必须在 `.assetsignore` 中排除 |
| `README.md` CI 流程 | 只描述 3 步，未提 Cron Worker | 已补第 3 步（Cron 部署）及其前置条件 `UPSTREAM_API_TOKEN`，并说明元数据写入保护 |
| `DEPLOY.md` | — | 内容经核对准确（已明确「Pages Functions 不支持 cron 触发器」），无需修改 |

> 说明：`README.md` 中「每周一 11:00（北京时间）自动刷新元数据」经核对为 `cron: '0 3 * * 1'`，**描述属实，未改**。

### 验证结果

```
npm run lint    ✓ 43 个 JS 文件语法检查通过
npm test        ✓ 8 passed / 0 failed
npm run check   ✓ bundle.js 与源码、三处版本号一致（v20260829j）
本地路由实测     ✓ 见 P0-1 的实测输出
```

### 已知遗留（本轮未处理，按优先级）

1. **`/api/proxy` 仍是开放代理** — 无 `Origin` 头的请求直接放行（`functions/api/[[path]].js:50`），
   任何人可脚本化拉取全量数据。需引入轻量凭证（Turnstile / nonce）或改用 Cloudflare Rate Limiting
   （现有限流是单 isolate 内存计数，多节点下实际阈值为 N×120）。
2. **`/api/metadata`、`/api/history/:id` 未做来源校验** — 位置在 `isAuthorizedOrigin` 之前返回。
3. **小程序端** — `API_BASE` 指向无法备案的 `*.pages.dev`，真机正式版不可用；
   `getMetadata()` 无缓存（每次冷启动 426KB）；`getApp()` 在模块顶层调用。
4. **死代码** — `js/maps.js`（110 行）全文件零调用但仍被打进 bundle；
   `getFirstBatchItems`、`warmAllDataBackground`、`appendHomeItems`、`isAllPage1Ready`、
   `getQueueLength`、`hasCache` 无调用点。**未删除**，因为 `maps.js` 可能是为后续功能预留。
5. **其他** — 冗余索引 `idx_item_max_date`；缺 `apple-touch-icon`；
   `functions/api/[[path]].js` 用全局 `fetch` 回源自身静态文件（应改用 `env.ASSETS.fetch()`）；
   `android/build.cmd` 依赖已废弃的 `aapt`/`dx`；前端渲染层与 CF Function 无测试覆盖。

---

## 2026-08-29 — 安全项补充（版本仍为 `v20260829j`）

> 本轮**只做安全项**。决策项（`/api/proxy` 凭证方案、esbuild 改造、限流物理共享、
> 删除冗余索引、死代码清理）按决定**均未修改**。
>
> **版本号未变化的原因**：`scripts/build.js` 的版本号粒度是「日期 + 小时」，同一小时内的多次
> 构建会生成相同版本号。入口 HTML 由 `_headers` 设为 `no-store`、JS/CSS 为 `max-age=300`，
> 因此不影响更新生效。（如需更细粒度，可让 `makeVersion()` 引入分钟或内容 hash——本次未改。）

### 安全-1：`/api/metadata` 与 `/api/history/:id` 补来源校验

- **现象**：`isAuthorizedOrigin` 原本排在这两个业务分支**之后**（第 141 行 vs 第 85/137 行），
  导致跨站浏览器可直接读取 D1 价格历史。
- **改动**：`functions/api/[[path]].js` 把来源校验上移到限流之后、业务分支之前（现第 82 行）。
- **语义澄清（重要）**：`isAuthorizedOrigin` 对**无 `Origin`** 的服务端请求放行，
  因此本校验的作用是**拒绝跨站浏览器读取**，**不能**阻止 `curl` 之类的脚本化调用——
  后者仍由限流与（待配置的）WAF 规则兜底。

### 安全-2：本地服务器补 CSP

- **现象**：`_headers` 里的 CSP 只对 Cloudflare Pages 生效，`server.js` 的 `serveFile`
  此前完全没有 CSP，桌面版与网页版安全基线不一致。
- **改动**：`server.js` 新增 `CSP_LOCAL` 并对所有静态响应生效（与 `_headers` 对齐，
  `connect-src` 收窄为 `'self'`，因为本地所有请求都走同源 `/api`）；同时补 `Cache-Control: no-cache`。
- **已知妥协**：`script-src` 仍需 `'unsafe-inline'`（`index.html` 的预取脚本是内联的）。

### 安全-3：`_metaPatch` 加上限、过期与版本隔离

- **现象**：`deltaforce_meta_patch_v1` 无条数上限、无过期、无结构版本，会无限累积已下架物品；
  且其数据（`name`/`pic`）会流入渲染层。
- **改动**：`index.html` 升级为 `v2`（旧的 `v1` 首次读取时清除），新增
  条数上限 2000、TTL 90 天；写入失败（配额不足）时清空而非静默失败。
- **性质说明**：渲染侧已有 `escapeHtml`/`sanitizeUrl`，本项属于**纵深防御 + 存储卫生**，
  不是已确认的漏洞利用路径。

### ⚠️ 更正上一轮方案中的一处错误判断

上一轮《剩余修改方案》"批次一 / 第 2 项"中，我判断：
> 「加来源校验会连带打断 `scripts/generate-metadata.js`……必须同步引入 `INTERNAL_TOKEN`。」

**这个判断是错的，已更正。** 复核 `isAuthorizedOrigin` 的实现后确认：
```js
if (!origin) return true;   // 无 Origin 的服务端请求放行
```
`generate-metadata.js` 与 `workers/cron` 发的是服务端请求（无 `Origin`、无 `sec-fetch-site`），
**上移校验后仍然放行，无需任何内部令牌通道，也无需改动 workflow**。
因此本次改动**零耦合、零破坏风险**，比原方案描述的简单得多。

### 验证

```
npm run lint    ✓ 43 个 JS 文件语法检查通过
npm test        ✓ 8 passed / 0 failed
npm run check   ✓ bundle.js 与源码、版本号一致
本地服务器实测   ✓ GET /                 → 200，响应头含 Content-Security-Policy
                ✓ GET /api/metadata     → 200，1350 条（CSP 上线后仍正常）
                ✓ GET /api/history/1     → 200 {code:-1}（前端降级到本地快照）
                ✓ GET /js/bundle.js      → 200
```

> 附带排查：`curl` 经 PowerShell 管道输出时会引入 `\ufeff`（BOM），一度疑似元数据文件带 BOM。
> 直接读取文件头确认前 8 字节为 `7b 22 31 22`（`{"1"`），**文件无 BOM，非真实问题**。

---

## 2026-08-29 — 修复「图标迟迟不显示」（版本仍为 `v20260829j`）

### 根因诊断（实测，非猜测）

**物品图片本身没有加载失败，而是加载太慢。**

| 检查项 | 结果 |
|---|---|
| 上游图片防盗链 | ❌ 不存在。无 Referer / 无 UA 连测 6 次均 `200`（首次 `000` 为偶发网络抖动） |
| CSP 拦截 | ❌ 不存在。`img-src 'self' https: data:` 允许上游 https 图片 |
| 图片真实尺寸 | **304×336 像素、65KB/张**，而页面只用 **36×36** 展示 |
| 首屏图片流量 | 首页 40 张 ≈ **2.6MB**，`TopMover` 区块还是 `loading="eager" decoding="sync" fetchpriority="high"` |

所以现象是：占位符 `-` 先渲染出来，图片再陆陆续续到位——看起来就像"图标没显示"。

### 修复 1：列表小图改用腾讯云 CDN 缩略参数（收益最大）

实测腾讯云 CI 对 `playerhub.df.qq.com` 支持实时缩略：

| 参数 | 返回 |
|---|---|
| 原图 | 200 / 65361 B |
| `?imageMogr2/thumbnail/72x` | 200 / 5743 B |
| **`?imageMogr2/thumbnail/72x/format/webp`** | **200 / 1344 B（体积降到 2%）** |

- `js/utils.js` 新增 `smallPicUrl(url, size)`：只对 `playerhub.df.qq.com` 域名追加参数，
  其他 CDN 原样返回，避免拼出不存在的参数导致 404。
- 8 处列表渲染（home/list/search/favtab，36~40px 小图）改走缩略图；
  `detail.js` 详情页**保持原图**（要清晰度）。
- **效果：首屏图片流量 2.6MB → 约 52KB，降低 98%。**
- 72px 取值原因：显示尺寸 36px 的 2 倍，覆盖 Retina/高分屏。

### 修复 2：favicon 兼容性

- **现象**：原引用是 `<link rel="icon" type="image/webp">`，Safari 及部分浏览器不支持
  WebP 图标 → 标签页图标不显示。而项目里现成的 `icon.ico`（47KB）**从未被引用**。
- **改动**：`index.html` 增加 `icon.ico`（`sizes="any"`，放在前）+ 保留 webp 备选 +
  补 `apple-touch-icon`（缺失时 iOS「添加到主屏幕」会用页面截图充当）。

### 遗留（未改，需设计决策）

分类 Tab 的图标在 `js/config.js:42-51` 全部是 `icon: ''`——**从未配置过**，所以分类页签
一直只有文字没有图标。若要补上，需要先确定素材来源（emoji / SVG / 上游图片），
属于 UI 设计决策，未擅自处理。

### 验证

```
npm run lint    ✓ 43 个 JS 文件语法检查通过
npm test        ✓ 8 passed / 0 failed
npm run check   ✓ bundle.js 与源码、版本号一致
bundle 校验     ✓ smallPicUrl 定义 + 8 处调用均已打入 bundle.js
缩略图实测      ✓ 200 / 1344 B
```

> **查看效果前请硬刷新（Ctrl+Shift+R）**：Service Worker 对静态资源是「缓存优先 + 后台更新」，
> 普通刷新可能仍命中旧缓存，第二次刷新才会更新；硬刷新会绕过 SW。

---

## 2026-08-29 — 首页默认排序：数据与图片优先进首屏（版本仍为 `v20260829j`）

### 需求

首页默认排序（分类=全部、排序=综合）改为：**已加载的数据 + 有图**的物品优先放进
用户可见的首屏；**其余分类/涨跌幅/价格排序逻辑一律不动**。

### 改动（`js/render/home.js`）

新增 `_homeDefaultAllSort(a, b)`，仅在 **`homeSortBy==='default' && homeCategoryFilter==='all'`**
分支生效，优先级：

1. 有实时价格（`price > 0`）优先于价格缺失
2. 有图片（`pic` 存在）优先于无图（占位符 `-`）
3. 同分时回退到原综合热度 `getItemSignificance` 降序（与分类视图口径一致），
   保证原有「综合热度」默认体验不被破坏

改动的两处入口：
- `renderHomeMovers`（缓存/预取数据路径）—— `default` + `all` 分支
- `renderHomeMoversWithData`（数据就绪路径）—— 同上

**未改动**：分类筛选视图排序、涨跌幅排序、价格排序、`_significanceScore` 预取顺序、
TopMover 区块、分页逻辑、`getItemSignificance` 定义。

### 行为验证（node 模拟）

```
输入: {无价无图} {有价无图} {无价有图} {有价有图}
排序: 有价有图 → 有价无图 → 无价有图 → 无价无图   ✓
同分时: 综合热度降序；同为 0 时保持原始顺序（稳定排序）✓
```

### 数据记录影响评估（用户问：本轮全部修改是否影响后端价格数据记录）

**结论：不影响，且有正向加固。** 逐条链路核对：

| 数据记录链路 | 本轮相关改动 | 影响评估 |
|---|---|---|
| Cron Worker → D1 `price_history` | fetch 超时(25s)、`INSERT OR REPLACE` → `ON CONFLICT DO UPDATE`、翻页预算 | **无影响（正向）**。UPSERT 与 REPLACE 落库内容等价，但不再删插整行 → rowid/`sqlite_sequence` 不再虚高；超时阈值远大于上游正常耗时(<5s)，不会误杀 |
| SW → IndexedDB 每日价格 | 仅改 `STATIC_CACHE` 命名与 `/data/*` 缓存策略 | **零影响**。`recordPrices` / IndexedDB 逻辑未动；DB 名与版本(2)未变，SW 更新不丢数据 |
| 本地快照 localStorage/IndexedDB | `cache.js` 未做任何逻辑改动 | 零影响 |
| 上传价格 `/api/proxy?endpoint=item_price_all` | 来源校验上移 | **零影响**。SW 发起的同源请求带 `Origin` 且等于站点源 → 放行；小程序 `wx.request` 无 `Origin` → 放行 |
| `functions/index.js` VERSION 变化 | 302 重定向 URL 变化 → SW 更新 | 无数据影响，`periodicSync` tag 未变，注册仍在 |

**唯一的部署注意事项（非代码影响）**：`.github/workflows/deploy-cron.yml` 会把 GitHub
Secret `UPSTREAM_API_TOKEN` 写入 Cron Worker 的 `API_TOKEN` 环境变量。若该 Secret
未配置或配置了错误的 token，CI 会跳过部署（未配置时），或覆盖 Dashboard 中的正确 token
（配置错误时）。请确保 `UPSTREAM_API_TOKEN` 与 Cloudflare 环境变量 `API_TOKEN` 保持一致。

---

## 2026-08-05 — `v20260805w`

（此前的改动未纳入版本记录，此处仅标注基线版本，细节已不可考。）
