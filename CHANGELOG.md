# 修改记录

格式：倒序，最新在最上。版本号与 `scripts/build.js` 生成的 bundle 版本（`vYYYYMMDD+小时字母`）对应。

---

## 2026-10-25 — 桌面滑钮全部消失：滚动条改绑真实滚动容器（v20261025n）

### 滑钮-1：桌面端自定义滚动条完全不显示

- **现象**：电脑浏览器（≥1024px 双栏）打开后，右侧金色滑钮消失，只能靠鼠标滚轮翻长列表；
  窄窗口（<1024px 单列）下滑钮正常。移动端无滑钮（预期行为，交给系统惯性滑动）。
- **根因**：`initCustomScrollbar` 用 `document.body/html.scrollHeight` 与 `window.innerHeight`
  判断是否可滚动。但上一轮（v20261024w 换装-8）引入的双栏布局把滚动主体换成了
  `#page-home` / `#page-dash` 等 `.page` 容器（各自 `overflow-y:auto`，`height:100vh`），
  **document 本身不再滚动** → `scrollHeight === innerHeight` → `sh <= vh` 命中
  `thumb.style.display = 'none'` 分支 → 滑钮恒隐藏。CSS 与 DOM 都在，只是被判定"无需滚动"。
  实测桌面 1440：`docScrollHeight=900`、`innerHeight=900`，而 `homeScrollHeight=5463`。
- **改动**：
  1. `js/app/init.js` 滚动条模块重写——每个滚动容器（6 个 `.page` + document 兜底）各建一条
     滚动条，按容器自身的 `scrollTop/scrollHeight/clientHeight` 计算；容器不可滚动或不可见
     （`display:none`、宽高为 0）时自动隐藏。位置由 `getBoundingClientRect()` 动态贴到容器
     可视区右缘内侧，竖直范围随容器高度对齐，底部导航可见时自动避让。
  2. 修掉"隐藏元素量不到高度"死锁：先 `display:block` 再读 `track.clientHeight`。
  3. 滚动事件用 `capture` 收集（容器滚动不冒泡到 window）；`ResizeObserver` + `MutationObserver`
     覆盖切页/列表重渲染/筛选面板展开。
  4. 滑钮点击轨道改「按屏翻页」而非跳转到鼠标处，避免误触丢失阅读位置。
  5. 滚动位置持久化同步修正：`saveBrowseState` 改走 `window.__dfGetScrollTop()`，
     返回首页改走 `window.__dfRestoreScrollTop()`；`showPage` / `switchTab` / 首页翻页
     的「回到顶部」改为按容器 `scrollTop = 0`（原 `window.scrollTo` 在双栏下是空操作）。
  6. `css/components.css` 滚动条样式改由 JS 写位置/高度；滑钮加宽至 10px、常态半透明、
     hover/拖拽高亮，轨道 hover 有反馈。
- **验证**（`node tools/scrollbar-smoke.cjs`，14/14 通过）：

  ```
  桌面 1440x900  左栏滑钮 h=146 w=10；拖动 0→1236，右栏未被误滚 0
  桌面 1440x900  右栏列表滑钮 h=298；双栏同时两条滑钮
  桌面 1440x900  详情页滑钮 h=827
  窄屏 900x1000  恰好一条滑钮（整页滚动）
  手机 390x844   滑钮 DOM 数 0；总览隐藏；首页 390/390 满宽；底栏可见
  ```

  另：`tools/home-ui-smoke.cjs` 40/40、`npm run lint` 63 文件、`npm test` 18/18、
  `npm run check` 通过。

### 构建-1：CSS 版本号无限膨胀（scripts/build.js）

- **现象**：`index.html` 的 CSS 引用变成
  `css/layout.css?v=v20261024w-de573b74-1a4f3325-a700adec-a700adec-…`（十余段 hash）。
- **根因**：更新 CSS 版本号的正则 `[a-z0-9]+(?:-([a-f0-9]+))?` 只能吞掉版本号的第一个
  `-hash` 段，第二段起原样残留，于是每构建一次就再追加一段；同时取到的 `oldHash` 是版本号
  里的 hash 而非 CSS 内容 hash，导致"内容未变"的判定永不成立。
- **改动**：改用 `[^"'\s>]+` 整段吞掉整个 query 值，并显式解析末尾段作为 CSS 内容 hash。
- **验证**：清理后连续构建两次，第二次输出「CSS 内容未变更，保留原有版本号」，
  引用稳定为 `?v=v20261025n-d7ebf4c8-1a4f3325` / `…-297b5ef3`（幂等）。

### 移动端确认（本轮未改动布局，仅回归验证）

- 移动端本就未启用双栏：`@media (min-width:1024px)` 之外 `.page` 不设 `height/overflow`，
  整页单列滚动；`#page-dash` 在 `max-width:1023px` 下 `display:none !important`；
  滑钮在 `pointer: coarse` 下整块不初始化。实测 390×844 与截图一致：单列、点击物品进详情页
  展开，物品与详情不并行。

### 已知遗留（按优先级）

1. 小程序端（weapp）视觉未同步换装，与 Web 端出现视觉分叉。
2. `index.html` 内联关键 CSS 为硬编码色值（令牌在 layout.css 加载后接管），闪色窗口极小但非零。
3. `css/base.css` 仍是未被引用的孤儿文件（内容已并入 layout.css），待后续清理删除。
4. 桌面双栏下左右两栏各自独立滚动，无联动；如需"整页同步滚动"需另设计。

---

## 2026-10-24 — 理财行情风换装：设计令牌 + 红涨绿跌 + 市场宽度（v20261024v）

> 本轮把 `design/finance-demo.html` 评审通过的「理财行情风」移植进正式版。只动视觉层与统计口径，
> 不动预取/路由/缓存/部署链路。`design/` 目录为设计评审产物（demo + 真实行情快照工具），不参与构建与部署。

### 换装-1：CSS 设计令牌层（css/base.css 重写，layout/components 全量跟换）

- **现象**：全站无设计令牌，颜色硬编码散落 CSS/JS/SVG；三套强调色打架（紫蓝渐变 + 金价 + 底栏亮绿）、
  9 处 `border-radius:0` 与其余圆角混用（历史主题覆盖残迹，两个 CSS 文件末尾的空「亮点主题覆盖」段一并清除）。
- **改动**：base.css 引入 `:root` 令牌（表面色阶/文本三级/品牌金/涨跌色/圆角阶梯/阴影），全部组件改引令牌；
  品牌主色从紫蓝渐变改为 Logo 橙金（`--brand`），底栏激活色与全局统一（修掉亮绿孤岛）；全局 `tabular-nums` 等宽数字。
- **验证**：grep 旧色（#667eea/#764ba2/#aab8ff/#1a1a2e/#00e676）在 css/ 与 js 源码中 0 残留。

### 换装-2：涨跌配色默认「红涨绿跌」+ 一键切换（中国行情惯例）

- **改动**：`html[data-scheme=cn|intl]` 双方案令牌，默认 cn=红涨绿跌；首页头部新增切换按钮
  （`toggleScheme`，js/render/shared.js），`localStorage(df_scheme)` 持久化，head 内联脚本提前应用避免闪色。
  图表/迷你线 SVG 颜色统一走 `style="stroke:var(--up/--down)"`（SVG 属性不支持 var()，必须走 style）。
  ▲▼ 箭头保留（色盲可读，原有原则不变）。
- **验证**：注入真实快照实测：切换 intl 后 scheme/按钮文案/localStorage 三处一致，曲线引用 `var(--up)` 自动变绿。

### 换装-3：市场概览条 → 市场宽度卡（去「均价」伪指标）

- **根因**：900 哈夫币的子弹与 128 万的房卡做算术平均无意义，属伪指标。
- **改动**：index.html 概览条 DOM 重构（hs-cells：上涨/平盘/下跌家数 + 行情词；hs-breadth 红绿分布条；
  hs-foot：结果数 + 更新时间），home.js `renderHomeStatBar` 同步改口径（删除均价计算）。
- **验证**：真实快照注入实测 上涨543/平盘633/下跌208、情绪普涨、结果 1,384 件；分布条占比和≈100%。

### 换装-4：涨幅前二卡片重排（降噪 ≥2万 逻辑保留）

- **改动**：topMover 容器类名 `top-mover-card` → `topmover`，渲染改用 components.css 的 `tm-*` 体系
  （排名徽章/金色卡面/涨跌色胶囊），入榜 ≥2万 过滤为原有逻辑不动。
- **验证**：真实快照注入榜首「建筑图纸3号」（¥5.12万，近7天），低价扑克牌不再入榜。

### 换装-5：详情页曲线红涨绿跌同源 + 数据源徽标

- **改动**：charts.js 曲线/渐变/圆点颜色由「首日→当前」趋势决定（`var(--up)/var(--down)`），与详情页
  涨跌方向严格同向；detail.js 图例锚点圆点改中性灰阶、当前点用品牌金；price-curve-box 内新增
  `curve-src` 徽标，cache.js `paintPriceCurve` 绘制后如实标注数据来源（云端每日记录 N 点 / 本地快照 N 点 /
  真实锚点连线）——与「上游没有的字段不许造」红线一致。
- **验证**：实测徽标「云端每日记录 27 点 · 锚点 4」，曲线 `var(--up)` 与「今日涨跌 up」同向。

### 换装-6：等级配色与涨跌色解耦（utils.js getGradeColor）

- **根因**：原等级色板含绿(#4CAF50)/红(#f44336)，与涨跌语义撞色，卡片上两类信息不可分。
- **改动**：新色板 灰/青/蓝/紫/橙/金，六级=品牌金（顶配辨识）。

### 换装-7：底栏图标 + 选中态去紫化

- **改动**：底栏两个 tab 增加 SVG 线性图标；分页按钮、下拉项、chips、联想等选中态统一品牌金令牌。

### 换装-8：桌面 ≥1024px 双栏终端布局 + 市场总览仪表盘

- **改动**：components.css 增加 1024px 断点——首页常驻左栏（440px，CSS 强制可见），右栏渲染当前
  激活页（详情/列表/搜索/收藏）；新增 `#page-dash` 市场总览仪表盘作为右栏默认视图（上涨/平盘/下跌
  大数字 + 涨跌分布条 + 十大板块表现磁贴[点击进板块] + 涨跌幅榜 TOP5[点击进详情]）。
  router.js 注册 dash 页并加 `_syncDashPane`（桌面处于首页时点亮总览；`matchMedia` change 监听
  在窄屏立即熄灭，另有 `max-width:1023px { #page-dash{display:none!important} }` 双保险，
  修掉 resize 残留 active 导致移动端两页叠显的 bug）。renderDashboard 挂在 renderHomeStatBar
  尾部，数据与宽度卡同源。
- **验证**：注入真实快照实测——桌面 grid 440px+840px、左栏 40 卡常驻、总览 543/633/208 与 10 磁贴
  10 榜单行；榜单点击进详情（首页仍在左栏）、返回回总览；405px 下 dash 隐藏、底栏回归、单列不变。

### 换装-9：涨跌颜色分级补齐（demo 对齐）+ 修复 base.css 孤儿文件事故

- **现象**：列表涨跌无底色分级、详情大价格恒为金色；进一步排查发现**全站 CSS 变量未定义**——
  令牌写在了 `css/base.css`，而该文件**从未被 index.html `<link>` 引用**（历史遗留孤儿文件），
  `var(--up)` 等全部失效回落默认值。
- **改动**：①令牌块与语义涨跌色规则并入实际加载的 layout.css 顶部（不动部署白名单）；
  ②列表 `.item-change` 升级为三态胶囊（up/down/flat 底色 + 文字着色，▲▼ 保留）；
  ③详情大价格与 ¥ 符号跟随当日趋势着色（renderDetail + updateDetailPrices 双路径同步类名）；
  ④`.item-card` 补桌面 hover 态。
- **验证**：`--up` 解析为 #f0455c；胶囊 computed `rgba(240,69,92,.12)`；大价格 computed
  `rgb(240,69,92)` 与曲线方向同源。

### 本地中继：网络错误自动重试（lib/node/proxy.cjs）

- **现象**：本机 → delta-force-v5.pages.dev 在部分网络下频繁 `read ECONNRESET`（270KB 的
  item_price_all 极易被重置），页面卡「正在拉取实时价格」直至超时。
- **改动**：中继对网络层错误自动重试（最多 3 次尝试、间隔 800ms）；超时（504）不重试，交由
  页面侧 30s×3 级重试兜底。
- **验证**：日志实锤 ECONNRESET 后重试；test 18/18（注：跑测试须先释放 3000 端口，否则
  server.js 冒烟项因端口占用超时失败）。

### 门禁

```
npm run build   ✅ v20261024v-9d0349c2（16 模块，index.html/sw-register 版本号同步）
npm run lint    ✅ 63 个 JS 文件
npm test        ✅ 18/18
npm run check   ✅ bundle/版本号一致
本地可视化验收   ✅ 真实快照注入（design/demo-data.js，1384 件）：首页宽度卡/涨幅前二/详情曲线/配色切换
tools/home-ui-smoke.cjs 已同步新 DOM（均价断言→平盘家数 + 分布条占比和）；本机无 playwright-core，该项由 CI 执行
```

### 已知遗留（本轮未处理，按优先级）

1. 小程序端（weapp）视觉未同步换装，与 Web 端出现视觉分叉。
2. index.html 内联关键 CSS 为硬编码色值（令牌在 layout.css 加载后接管），闪色窗口极小但非零。
3. `css/base.css` 仍是未被引用的孤儿文件（内容已并入 layout.css），待后续清理删除。

---

## 2026-10-08 — 安卓端 v3.1：修掉启动后顶部的黑框（`versionName` 3.0 → 3.1 / `versionCode` 2 → 3）

- **现象**：手机打开应用，页面顶部压着一条深色「黑框」。
- **根因**：不是 WebView 的问题——`AndroidManifest.xml` **没有声明 `android:theme`**，`res/values/` 下也没有任何主题资源，
  Activity 于是套用系统默认主题，窗口顶部自动多出一条 ActionBar（标题栏）；页面底色是深色，
  深色标题栏叠在深色网页上，看起来就是那条黑框。
- **改动**：① 新增 `android/res/values/styles.xml`（`AppTheme` 继承 `Theme.DeviceDefault.NoActionBar`，
  `windowBackground` 对齐站点底色，顺带消掉首屏白闪）；② `<application>` 加 `android:theme="@style/AppTheme"`；
  ③ `MainActivity` 修掉一段死代码——原来的 `onPageFinished { setVisibility(VISIBLE) }` 从未生效（WebView 默认就是 VISIBLE），
  现改为真正先 `INVISIBLE` 再显示，并补 `onReceivedError` 兜底（否则加载失败会一直停在隐藏态＝整屏纯黑，像闪退）。
- **验证**：从产物里查，不只看编译过没过——`android:theme(0x01010000)=@0x7f050000` → `style/AppTheme`，
  其 `parent=0x01030129`（`Theme.DeviceDefault.NoActionBar`）与 `windowBackground` 均已落地。

---

## 2026-10-08 — 首页四项交互改造（`v20261008w`）

> 来源：一份「变卖物实时价格查询优化方案 Demo」（自带 1379 条造数与 ①②③④ 标注）。
> 落地方针：**只借功能，不换肤**——沿用现有黑底 + 紫蓝 `#667eea` + 金 `#ffd700` 主色，
> 仅把卡片与下拉面板改为圆角 + 更宽松间距；demo 的 4-tab 底栏、桌面三列、15 秒倒计时、阈值预警一律不做。

### ① 首页内联搜索（与搜索页并存）
- 首页 `.search-bar` 由「假框跳页」改为真实输入框：`#homeSearchInput` 边输边给联想（180ms 防抖，取前 6 条，带缩略图/现价/涨跌箭头），点选直接 `openPriceMover` 进详情；无结果给兜底文案。
- 保留搜索页：底部「查看全部 N 个结果」/ 回车 / 右侧「搜索」走 `showSearchWith(kw)` 带词进搜索页。
- 联想与搜索页共用 `searchByIndex` 索引；未做拼音首字母（需引入拼音表，PWA 体积敏感）。

### ② 四个筛选面板统一 + 已选回显
- 四个下拉（时间/价格/分类/排序）统一加底部操作条：**重置 + 查看 N 件**（N 为实时预估，与列表渲染共用 `getHomeFilteredItems` 这一唯一真源，避免两处口径漂移）。
- **分类改多选**（`homeCategoryFilter` 由字符串 `'all'` 改为**数组**），面板内每一项带件数、勾选打 ✓；空数组 = 全部类型。旧存档在 `applyHomeBrowseState` 里做兼容转换。
- **价格**增加自定义区间（两个数字输入），一旦填写即覆盖快捷档，避免两套条件叠加。
- 新增 `#homeFilterChips` 已选回显：每个条件可单独删除，两项以上出现「清空全部」（接上此前**无 UI 入口**的 `resetAllFilters()`）。

### ③ 市场概览条 `#homeStatBar`
- 列表上方显示：当前结果数 / 均价 / 上涨·下跌家数 / 行情方向词（普涨·普跌·持平）/ 数据更新时间，随筛选实时更新。均价与涨跌幅基于当前时间段字段（`bl`/`day_3_bl`/`day_7_bl`）统计。

### ④ 列表卡片增强（首页 + 列表页共用 `renderItemRangeRow`）
- 涨跌加 **▲▼ 箭头**（`.chg-arrow`），不再只靠颜色区分，色盲/黑白屏可读。
- 新增区间行：**今日开盘**（`price_start`）+ **30 天前**（`day_30_price`）+ **当前分位条**（位置按真实价格锚点 min/max 计算）。
- 补品类标签（单分类视图下视为冗余信息，不显示）。
- 卡片点击行为**不变**：整卡仍进详情页并记最近浏览。

### ★ 无「成交量」字段 — 明确不做
上游 `item_price_all` + `metadata.json` 均**没有成交量/挂单量字段**（全仓库 grep 0 命中，demo 的「量 1.8k」是它自造的随机数）。
卡片只用上游真实锚点，不臆造任何派生指标。

### 其他
- iOS 防聚焦缩放：新增的两个输入框 font-size 一律 16px。
- 新增 `tools/home-ui-smoke.cjs`（Playwright + 系统 Chrome，离线注入假数据，40 项断言覆盖 ①②③④），需用 `NODE_PATH` 指向含 `playwright-core` 的目录。

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
