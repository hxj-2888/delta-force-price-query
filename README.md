# 落幕查 · 三角洲行动变卖物价格查询

落幕查（三角洲行动变卖物实时价格查询工具）：分类浏览、搜索、收藏、价格异动与 30 天历史走势。
支持 Windows 安装包 / 网页 PWA / 安卓 APK / 微信小程序，四端同源。

## 文档索引

| 文件 | 角色 | 内容 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | **作业契约** | 命令 / 门禁 / 红线 / 文件地图（AI 与新接手的人先读） |
| [`DEPLOY.md`](DEPLOY.md) | 部署 | D1 / Pages / Cron Worker 三步部署 |
| [`CHANGELOG.md`](CHANGELOG.md) | 变更流水 | 每轮改动：现象 / 根因 / 改动 / 验证 + 已知遗留 |
| [`README.md`](README.md) | 说明书 | 本文：四端分发与功能说明 |

> 应用已于 2026-08-29 更名「落幕查」（原「三角洲行动-变卖物价格查询」），URL 与包名不变。

---

## 分发方式一：Windows 安装包 （发给 PC 用户）

### 制作安装包

1. 下载安装 **Inno Setup 6** → https://jrsoftware.org/isinfo.php
2. 双击 `installer.iss` → 点击 **Build → Compile**
3. 编译完成后在 `installer\` 目录找到 `落幕查_安装包_v1.0.0.exe`
   （文件名来自 `installer.iss` 的 `OutputBaseFilename`，版本号取自 `MyAppVersion`）

### 用户安装

1. 双击 `setup.exe` 安装
2. 桌面自动生成快捷方式
3. 双击快捷方式 → 直接可用（2026-09-27 起本地版改为**纯中继**：`/api/*` 转发到线上 Pages，
   由云端 Functions 用 Secret 里的 Token 取数，本地不再持有也不需要用户配置 API Token）

---

## 分发方式二：PWA 网页安装（发给手机/电脑用户） 

### 部署到云端

部署到 Cloudflare Pages（免费）——**必须走白名单暂存脚本，禁止 `wrangler pages deploy .` 整目录直推**
（整目录直推会把磁盘上的 `.env`（keystore 密码）、`android/release.keystore`（签名私钥）、
`.wrangler/`（Cloudflare 账户信息）等一并公开到线上；`.assetsignore` 对 `wrangler pages deploy` 无效，勿再依赖）：

```powershell
npm i -g wrangler
wrangler login          # 首次需要，之后复用本地凭据
node tools/deploy-pages.cjs
```

> 脚本内 `PROJECT` 常量为 `delta-force-v5`，自建部署时改成你自己的 Pages 项目名。
> 仓库根目录**没有** `deploy-pages.ps1`（旧文档遗留名），唯一部署入口是 `tools/deploy-pages.cjs`。
>
> **常规路径其实是 CI**：push 到 `main` 即由 `.github/workflows/deploy.yml` 自动部署，
> 本地手动执行只用于应急或首次建项目。

### 用户安装到桌面

用户浏览器打开网址后：

| 平台 | 操作 |
|------|------|
| **iPhone/iPad** | Safari 地址栏 → 分享按钮 → "添加到主屏幕" |
| **Android** | Chrome → 菜单 → "添加到主屏幕" / "安装应用" |
| **Windows/Mac** | Chrome/Edge → 地址栏右侧出现安装图标 → 点击安装 |

安装后手机桌面/电脑桌面出现应用图标，点击即用。

---

## 分发方式三：便携版 ZIP（发给高级用户）

发行目录由 `setup.bat` 生成（自动按 `installer-exclude.txt` 排除 `.env` / 签名密钥 / `android/` 等），或将发行目录打包为 ZIP，解压后双击 `start.bat` 即可。

**切勿手工压缩整个项目目录**——会把 `.env`（keystore 密码）与 `android/release.keystore`（签名私钥）一起带进 ZIP。

前置条件：需安装 Node.js（https://nodejs.org）

---

## 分发方式四：微信小程序

> ⚠️ **重要前提**：微信要求小程序请求的域名必须是 **HTTPS 且完成 ICP 备案** 的域名。
> `*.pages.dev` 等海外域名无法备案，不能加入 request 合法域名，真机正式版无法请求。

### 发布前配置（三步）

1. **准备已备案域名**：将你的已备案域名（如 `api.example.com`）CNAME 到 Cloudflare Pages 项目，
   或用国内服务器/CDN 反向代理到 `/api/*`，保证该域名可正常 HTTPS 访问。
2. **修改小程序 API 地址**：编辑 `weapp/utils/config.js`，把 `API_BASE` 改成你的域名。
   （token 仍留在服务端代理中，不会暴露给客户端）
3. **配置微信后台**：微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名，
   添加你的域名，然后在微信开发者工具中上传代码（需把 `project.config.json` 中的 appid 换成你的 AppID）。

> 开发阶段可在开发者工具勾选「不校验合法域名…」，或真机打开调试模式临时联调；
> 发布正式版前必须完成上述配置，否则首页会提示"请求域名未配置或未备案"。

---

## 项目结构

```
├── index.html          # 主页面（PWA；含内联预取脚本与内联关键 CSS）
├── manifest.json       # PWA 清单，支持手机/电脑安装到桌面
├── sw.js               # Service Worker（后台价格记录 + PWA 安装）
├── js/                 # 前端模块源码（bundle.js 为构建产物，改 js/ 后必须 npm run build）
├── css/                # 样式：layout.css（令牌 + 布局）+ components.css（组件）
├── lib/                # 云端与桌面版共享的后端模块（鉴权/响应/限流/业务 handlers）
├── functions/          # Cloudflare Pages Functions（派发层：限流 → 鉴权 → 路由）
├── workers/cron/       # Cloudflare Cron Worker（每日价格采集，独立部署，非 Pages 的一部分）
├── data/               # 静态元数据（metadata.json，约 430KB / 1359 件）
├── migrations/         # D1 数据库迁移（价格历史 / 全局限流 / 客户端限流）
├── weapp/              # 微信小程序源码
├── design/             # 设计评审产物（demo + 快照工具），不参与构建与部署
├── scripts/            # 构建、语法检查、元数据生成、限流唯一实现
├── test/               # node --test 单测（bundle/元数据/限流/服务器冒烟）
├── tools/              # 部署脚本 + 三个 Playwright UI 冒烟 + 文档死链检查
├── android/            # 安卓 WebView 壳源码（release.keystore 不入库，也不随 Pages 部署）
├── download.html       # 安卓 APK / 便携版 ZIP 下载页
├── CHANGELOG.md        # 修改记录
├── _headers            # Cloudflare Pages 缓存头与 CSP
├── wrangler.toml       # Pages 的 D1/KV 绑定（Cron 不在此配置，见 workers/cron/）
├── tools/deploy-pages.cjs  # 安全部署脚本：白名单暂存后部署（.env/密钥/笔记等永不公开）
├── server.js           # 本地中继服务器（便携版；纯中继到线上 Pages，本地不持 Token）
├── installer.iss       # Inno Setup 安装包脚本 → 生成 落幕查_安装包_v<版本>.exe
├── setup.bat           # 便携版桌面安装脚本
├── start.bat           # 一键启动脚本
└── .env                # 本地私密配置（keystore 密码）：不入库、不部署、不随任何 ZIP 分发
```

---

## 首页交互功能

> 2026-10-08 改造（`v20261008w`）。详见 `CHANGELOG.md`。

### 搜索

| 入口 | 行为 |
|------|------|
| 首页搜索框 | 边输边给联想（180ms 防抖，前 6 条，带缩略图/现价/涨跌箭头），点选直接进物品详情；无结果给兜底文案 |
| 联想底部「查看全部 N 个结果」/ 回车 / 右侧「搜索」 | 带词进入搜索页 |

两者共用 `searchByIndex` 字符级倒排索引。搜索页的**搜索历史 / 最近浏览 / 我的收藏**保持不变。
暂不支持拼音首字母（需引入拼音表，PWA 首屏体积敏感）。

### 筛选（时间 / 价格 / 分类 / 排序）

四个下拉是同一套面板组件，底部统一为 **重置 + 查看 N 件**：

- **N 是实时预估**，与列表渲染共用 `getHomeFilteredItems()` 一个真源，不会两处口径漂移；
- **分类可多选**，每一项带件数，选中项左侧显示实心圆点 `●`；不选 = 全部类型（`homeCategoryFilter` 是数组，空数组即全部）；
- **价格**支持快捷档（`< 1万` / `1万~10万` / `10万~100万` / `> 100万`）与自定义区间；
  一旦填写自定义区间就以它为准，不再叠加快捷档；
- 工具栏下方是**已选条件 chips**：每个条件可单独删除，条件多于一项时出现「清空全部」。

筛选状态随浏览状态一起持久化（`saveBrowseState` / `restoreBrowseState`），返回首页会还原。

### 市场宽度卡

列表上方一块卡片（2026-10-24 起替代原「市场概览条」）：

- **上涨 / 平盘 / 下跌** 家数 + **行情方向词**（普涨·普跌·持平）+ 净上涨百分比；
- **涨跌分布条**：按三态占比铺一条红灰绿条，视觉上一眼看出多空强弱；
- 底部一行：**结果 N 件** + 数据更新时间。

> 原「均价」指标已删除：900 哈夫币的子弹与 128 万的房卡做算术平均没有意义，属伪指标。
> 家数与方向词按当前时间段（近 1 天 `bl` / 近 3 天 `day_3_bl` / 近 7 天 `day_7_bl`）统计，随筛选实时更新。

### 主题与配色

页面右上角有两个互不干扰的切换按钮：

| 按钮 | 作用 | 取值 |
|------|------|------|
| **浅色 / 深色** | 背景色（明暗双主题） | `light`（默认）/ `dark` |
| **红涨 / 绿涨** | 涨跌语义配色 | `cn` 红涨绿跌（默认）/ `intl` 绿涨红跌 |

两根轴正交，共 4 种组合；各自存 `localStorage`（`df_theme` / `df_scheme`），刷新后保持。
未显式选过主题时跟随系统 `prefers-color-scheme`。

### 物品卡片

| 元素 | 数据来源 |
|------|----------|
| 价格 + ▲▼ 涨跌箭头 | `price` + `bl` / `day_*_bl`；箭头用于色盲/黑白屏也能分辨涨跌 |
| 今日开盘 | `price_start` |
| 30 天前 | `day_30_price` |
| 当前分位条 | 当前价在「开盘 + 3/7/30 天前 + 当前」这些**真实价格锚点**的 min/max 区间中的位置 |
| 品类标签 | `_category` / `secondClassCN`（单分类视图下视为冗余，不显示） |
| 迷你走势线 | 本地价格快照 + 云端快照合并 |

点击整卡仍进详情页并记最近浏览，**没有**改成原地展开。

> ⚠️ **没有「成交量」字段**：上游 `item_price_all` 与 `data/metadata.json` 均不提供成交量/挂单量，
> 因此卡片只展示上游真实字段，不臆造任何派生指标（热度、成交笔数之类一概不做）。

### UI 冒烟测试

三个脚本都用 Playwright 驱动系统 Chrome，需先起本地服务：

```powershell
node server.js                                  # 另开一个终端，默认 http://127.0.0.1:3000
$env:NODE_PATH="...\node_modules"               # 指向装有 playwright-core 的目录
node tools/home-ui-smoke.cjs                    # 40 项：首页交互
node tools/scrollbar-smoke.cjs                  # 14 项：桌面双栏/窄屏/移动端滑钮
node tools/theme-smoke.cjs                      # 51 项：明暗 × 涨跌四组合对比度
```

覆盖：

- **home**：概览条数值、卡片箭头/区间/分位/圆角、分类多选与件数、「查看 N 件」预估、
  价格自定义区间、chips 增删与清空、联想弹出与无结果兜底、列表页卡片同步、无 JS 运行时错误。
- **scrollbar**：桌面 ≥1024px 左右两栏各有独立滑钮、拖动只滚本栏、滚动时滑钮跟随；
  窄屏整页只有一条；移动端不创建滑钮 DOM 且保持单列。
- **theme**：4 组合下正文 ≥7:1 / 小字与涨跌 ≥4.5:1、涨跌语义方向、切换按钮交互、
  `localStorage` 持久化、两轴互不干扰、深色下无浅色残留块。

> `home-ui-smoke` 会真实请求上游 API；连跑多次可能撞 429 而报「无 JS 运行时错误」失败，
> 等 45 秒重跑即可，不是回归。

---

## 开发与自动化

```bash
npm run build              # 重建 js/bundle.js 并同步版本号（修改 js/ 后必须执行）
npm run check              # 校验 bundle 与源码/版本号一致（不写文件）
npm test                   # 单元 + 冒烟测试（限流/静态服务/元数据/bundle）
npm run lint               # 全项目 JS 语法检查
npm run generate-metadata  # 重新生成 data/metadata.json
```

CI 流程（push 到 main 自动执行）：

1. `check`：语法检查 → 单元/冒烟测试 → bundle 一致性校验，任一失败即阻止部署；
2. 部署到 Cloudflare Pages（delta-force-v5）；
3. 部署 Cron Worker（delta-force-cron，每日采集价格写入 D1）；
4. `smoke-test`：部署后自动验证平台的首页和 `/api/metadata` 均可访问；
5. 每周一 11:00（北京时间）自动重新生成元数据，有变化则提交并重新部署。

> **关于第 3 步（重要）**：Cloudflare Pages Functions **不支持** Cron Triggers，
> Dashboard 的 Pages 项目里也找不到该配置项。D1 价格历史完全依赖独立 Worker `workers/cron/`。
> 若只部署 Pages，30 天价格曲线不会有云端数据，只会退化为客户端本地快照（换设备即丢失）。
> 该步骤需要额外 Secret `UPSTREAM_API_TOKEN`（上游 orzice.com 的 Token）；
> 未配置时工作流会跳过并输出告警，不会让主流程失败。

> **关于第 5 步**：`scripts/generate-metadata.js` 内置了保护——若因限流/网络导致采集条目
> 低于旧文件的 90%（或少于 1000 件），会拒绝写入并让任务失败，
> 避免残缺的 `metadata.json` 被自动提交到线上。
