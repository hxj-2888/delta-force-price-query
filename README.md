# 落幕查 · 三角洲行动变卖物价格查询

《三角洲行动》变卖物的**实时价格 + 30 天走势**查询工具：分类浏览、搜索、收藏、价格异动、历史曲线。前端零依赖，后端是 Cloudflare Pages Functions + D1 + 一个独立 Cron Worker。

- 在线版：<https://delta-force-v5.pages.dev>（PWA，可安装到桌面 / 主屏幕）
- 本地跑：`node server.js` → <http://127.0.0.1:3000>（Node.js 18+）
- 2026-08-29 由「三角洲行动-变卖物价格查询」更名为「落幕查」，URL 与包名不变
- 构建号唯一真源是 `index.html` 头部的 `build:` 注释，由 `npm run check` 强制与 `js/bundle.js` 一致

> 玩家自制的数据查询工具，与官方无关联，不做交易、不做自动化操作。
> **上游没有的字段一律不显示**：接口不提供成交量与挂单量，因此这类指标一概不做，也不换个小名目编出来。

---

## 一、能查什么

| 信息 | 来源字段 | 说明 |
|---|---|---|
| 现价与涨跌箭头 | `price` + `bl` / `day_3_bl` / `day_7_bl` | 箭头是形状化的，色盲与黑白屏也能分辨涨跌 |
| 今日开盘 | `price_start` | |
| 3 / 7 / 30 天前 | `day_3_price` / `day_7_price` / `day_30_price` | |
| 当前分位条 | 上述**真实价格锚点**的 min~max 区间 | 标出当前价落在区间哪个位置，不做拟合指标 |
| 迷你走势线 | 本地价格快照 + 云端快照合并 | |
| 品类标签 | `_category` / `secondClassCN` | |
| 30 天曲线 | `GET /api/history/<itemId>`（D1） | 每天采 1 次，只保留近 30 天 |

**物品元数据**：`data/metadata.json`，约 440KB / **1359 件**，由 `npm run generate-metadata` 从上游分页抓取。

## 二、界面怎么用

**搜索**：首页搜索框边输边给联想（**180ms 防抖**、前 6 条、带缩略图 / 现价 / 涨跌箭头），点选直接进详情；回车、点「查看全部 N 个结果」或右侧按钮进搜索页。两个入口共用同一套**字符级倒排索引**，不会一处能搜一处搜不到。暂不做拼音首字母——要引入拼音表，对 PWA 首屏体积不划算。

**筛选**：时间 / 价格 / 分类 / 排序四个下拉是同一套面板组件，底部统一「重置 + 查看 N 件」。

- `N` 是实时预估，与列表渲染共用同一个函数真源，两处数字不会打架；
- 分类**可多选**，每项带件数，不选等于全部；
- 价格有快捷档（`<1万` / `1万~10万` / `10万~100万` / `>100万`）与自定义区间，填了自定义就只认自定义；
- 工具栏下方是已选条件 chips，可单删，多于一条时出现「清空全部」；
- 筛选状态与浏览状态一起持久化，返回首页会还原。

**市场宽度卡**（列表上方）：上涨 / 平盘 / 下跌家数 + 行情方向词（普涨·普跌·持平）+ 净上涨百分比 + 一条按三态占比铺开的红灰绿分布条；底部一行是「结果 N 件」与数据更新时间。家数与方向词按当前时间段（近 1 / 3 / 7 天）统计，随筛选实时变化。

> 「均价」是被删掉的伪指标：900 哈夫币的子弹和 128 万的房卡做算术平均没有意义。

**主题两根正交轴**：浅色 / 深色（`df_theme`）与红涨绿跌 / 绿涨红跌（`df_scheme`）互不干扰，共 4 种组合，各自存 `localStorage`；没显式选过时跟随系统 `prefers-color-scheme`。颜色全部走 `css/layout.css` 顶部的令牌，四种组合逐一显式声明，代码里不许写死色值（SVG 属性不支持 `var()`，图表颜色要先读令牌再写成字面值，并在切主题时重绘）。

**只留在本机的数据**：收藏、最近浏览、搜索历史存在浏览器 `localStorage`，不上传；价格快照另有「内存 + `localStorage`」双级缓存，Service Worker 后台合并。

## 三、架构

```
浏览器（index.html + js/bundle.js，PWA）
  │  /api/*，请求头带 X-Client-Id
  ▼
Cloudflare Pages Functions   functions/api/[[path]].js
  │  限流 → 心跳 → 来源校验 → 脚本鉴权 → 业务路由（精确匹配路径，不许 startsWith('/api')）
  ├── lib/handlers/proxy.cjs       上游代理：只放行 item_list / item_price_all
  ├── lib/handlers/metadata.cjs    元数据（KV 心跳 + 静态 JSON）
  ├── lib/handlers/history.cjs     GET /api/history/:itemId → D1 近 30 天
  └── lib/handlers/cron-status.cjs 采集健康状态

独立 Cron Worker   workers/cron/   （Pages Functions 只导出 onRequest，不支持 Cron Triggers）
  └── 每天 22:00 UTC 采全量价格 → 写 D1 price_history → 清理 30 天前明细 → KV 心跳

本地 / 便携版服务器   server.js
  └── 纯中继：静态文件 + 把 /api/* 转发到线上 Pages，由云端用 Secret 里的 Token 取数
      —— 本地机器不持有、也不需要用户配置任何 Token
```

- **D1 表结构**三段迁移：`0001` 价格历史、`0002` 全局限流窗口、`0003` 按客户端的限流窗口。
- **版本号是推导出来的**：`scripts/build.js` 的 `makeVersion()` 生成 `vYYYYMMDD+小时字母` 并自动写回 `index.html`；CSS 只在内容变化时才换哈希。改 `js/` 后必须 `npm run build`。
- **缓存策略**：SW 静态缓存名带构建号（`deltaforce-static-<版本>`），旧缓存自动回收；**`/data/*` 必须网络优先**，否则 `metadata.json` 会永久陈旧。
- **桌面双栏滚动**：≥1024px 时窗口本身不滚动，`.page` 与左右两栏各自才是滚动容器（`document.documentElement.scrollTop` 恒为 0），所有滚动读写都按容器走。

## 四、限流与安全边界

限流阈值的**唯一实现**在 `scripts/rate-limit.cjs`，本地进程（内存）与云端（D1）共用同一份常量：

| 维度 | 默认值 |
|---|---|
| 统计窗口 | 60 秒 |
| 每 IP | 120 次 / 分钟 |
| 全局 | 600 次 / 分钟（单实例） |
| 每客户端（`X-Client-Id`） | 30 次 / 分钟 |

- 客户端 ID 由前端生成并用 `localStorage`（`df_client_id`）持久化；隐私模式下退化为本次页面加载的随机 ID，只影响限流精度，不影响功能。
- **来源校验不是鉴权**：`isAuthorizedOrigin` 只挡跨站浏览器请求，不带 `Origin` 的服务端调用会放行。它能防浏览器侧滥用，不能当访问控制来宣传安全。
- 上游 Token 只存在于云端环境变量与本地 `.env`，**不入库、不部署、不随任何分发包**。
- 上游代理是**端点枚举白名单**（`item_list` / `item_price_all`），其余路径一律不转发；`item_price_all` 超时 25 秒，其余 15 秒。

## 五、数据可靠性

1350 多件物品按每页 10 条要抓约 135 页，必然撞上游限流，所以抓取与采集都带保护：

- **指数退避重试**：2s → 4s → 8s → 16s，命中 429 再额外等 20 秒让限流窗口滑过；429 / 5xx 视为可重试，不让整页数据被静默丢弃。
- **写入前条目数校验**：本次少于 **1000 件**，或比旧文件掉超过 **10%**，直接拒绝写入并让任务失败——避免残缺的 `metadata.json` 被自动提交后，全站物品瞬间退化成「物品#ID」。
- **采集心跳**：上游 Token 曾在 2026-08-30 ~ 09-23 静默失效 25 天无人察觉，现在 Cron 每次运行向 KV 写心跳，`GET /api/cron-status` 暴露最近成功时间，数据明显过期时界面直接提示而不是继续显示旧价格。
- **口径对齐**：写入侧清理与查询侧共用同一个 30 天窗口（`RETENTION_DAYS = 30`，按北京时间），与 SQL 里的 `date('now','+8 hours','-30 days')` 严格一致，删掉的数据本来就是前端读不到的。

## 六、四种形态

| 形态 | 说明 |
|---|---|
| **网页 PWA** | 主形态。iOS Safari「添加到主屏幕」、Android Chrome「安装应用」、桌面 Chrome/Edge 地址栏安装图标 |
| **本地 / 便携版** | `node server.js`，只监听 `127.0.0.1:3000`，数据全部中继到线上 |
| **Windows 安装包 / 安卓 APK / 微信小程序** | 同一份前端产物打包。**这三端的构建工程不随本仓发布** |

> 微信小程序另有一道硬门槛：request 合法域名必须是 **HTTPS 且完成 ICP 备案**的域名，`*.pages.dev` 无法备案，真机正式版请求不到。自建时需要把自己的已备案域名 CNAME 到 Pages 或反代 `/api/*`，Token 仍留在服务端。

## 七、目录结构

```
├── index.html            # 单页入口（内联预取脚本 + 内联关键 CSS）
├── download.html         # 下载页（安卓 APK / 便携版）
├── manifest.json sw.js   # PWA 清单与离线兜底
├── _headers              # Cloudflare Pages 缓存头与 CSP
├── js/                   # 前端源码：render/（home·list·detail·search·charts·favtab·shared）
│                         #        store/（cache·favorites·search）· app/（init·router）
│                         #        api.js · config.js · maps.js · utils.js → 打包为 js/bundle.js
├── css/                  # layout.css（令牌 + 布局 + 双栏滚动容器）· components.css · base.css
├── lib/                  # 云端与本地共享后端：api-auth · api-response · rate-limit-d1 · handlers/ · node/
├── functions/            # Pages Functions 派发层
├── workers/cron/         # 独立 Cron Worker（自带 wrangler.toml 与 crons 触发器）
├── migrations/           # D1 表结构 0001 价格历史 / 0002 全局限流 / 0003 客户端限流
├── scripts/              # build.js（打包 + 版本号 + --check）· lint.js · generate-metadata.js · rate-limit.cjs
├── data/metadata.json    # 1359 件物品静态元数据
├── server.js             # 本地/便携版中继服务器（127.0.0.1:3000，不持 Token）
└── wrangler.toml         # Pages 的 D1 / KV 绑定
```

## 八、常用命令

```bash
npm start                  # 本地起服务（node server.js）
npm run build              # 改 js/ 后必须执行：重建 bundle + 同步版本号
npm run check              # 校验 bundle 与源码、三处版本号一致（不写文件）
npm run lint               # 全项目 JS 语法检查
npm test                   # 单元测试（限流 / 静态服务 / 元数据 / bundle 一致性）
npm run generate-metadata  # 重新抓取 data/metadata.json
```

改界面后至少核对三件事：明暗 × 涨跌四种组合的对比度（正文 ≥ 7:1、小字与涨跌色 ≥ 4.5:1）、列表与详情两处数据口径一致、`/data/*` 仍是网络优先。

## 九、部署（三样都要部，缺一价格历史就是空的）

```bash
# 1. D1 库与表结构
npx wrangler d1 create delta-force-prices
npx wrangler d1 migrations apply delta-force-prices --remote

# 2. Pages（含 Functions）——见下方警告，不要整目录直推

# 3. Cron Worker（独立项目，Pages 里配不了定时）
npx wrangler deploy --config workers/cron/wrangler.toml
```

- 把 `wrangler.toml` 与 `workers/cron/wrangler.toml` 里的 `database_id`、KV 命名空间 `id` 换成自己账号下的真实值，并在 Pages 与 Cron 两个项目里配置同一个上游 Token 环境变量。
- ⚠️ **禁止 `wrangler pages deploy .` 整目录直推**：`.assetsignore` 对该命令**无效**，直推会把磁盘上的 `.env`、签名私钥、`.wrangler/` 账户信息一并公开到线上。正确做法是先把白名单内的文件复制进一个干净的暂存目录，再部署那个目录。
- 缺 D1 迁移 → `/api/history` 永远是空的；缺 Cron Worker → 30 天曲线不会有云端数据，只会退化成客户端本地快照（换设备即丢失）。

## 十、许可与声明

- 代码以 **MIT** 许可发布，见 [LICENSE](LICENSE)。
- 游戏名称、道具名称与图标版权归《三角洲行动》官方所有；本项目是玩家自制查询工具，不随仓分发任何游戏内资源副本。
- 上游接口未提供的数据（成交量、挂单量、热度等）本项目一律不展示、不估算。
