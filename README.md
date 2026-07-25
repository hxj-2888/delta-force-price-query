# 三角洲行动 - 变卖物价格查询（微信小程序版）

三角洲行动（Delta Force）游戏内变卖物实时价格查询微信小程序。从网页版转换而来，完整保留了所有核心功能。

## 功能

- 🏠 **首页** — 分类浏览、涨幅推送、收藏价格变动提醒
- 📋 **物品列表** — 按分类查看所有物品，支持价格/涨跌幅排序和分页
- 🔍 **搜索** — 名称关键词搜索，支持搜索历史、最近浏览、收藏快捷入口
- 📈 **价格异动** — 涨幅榜/跌幅榜，支持多种时间周期（今日/近3天/近7天/本地记录）
- ❤️ **收藏管理** — 我的收藏，价格变动达到25%自动提醒
- 📊 **价格图表** — Canvas 绘制30天价格趋势曲线

## 技术栈

- 微信小程序原生框架（WXML / WXSS / JS）
- Canvas 2D API 图表绘制
- 云函数 API 代理（隐藏 API Token）
- wx.setStorageSync 本地数据缓存
- 应用级全局状态管理

## 与原网页版的区别

| 特性 | 网页版 | 小程序版 |
|------|--------|----------|
| DOM操作 | innerHTML | 数据绑定 setData |
| 存储 | localStorage | wx.setStorageSync |
| API请求 | fetch | wx.request / 云函数 |
| 图表 | 内联SVG | Canvas 2D |
| Service Worker | 支持 | 不支持（云函数替代） |
| IndexedDB | 价格历史 | wx.setStorage 替代 |
| 图片错误处理 | onerror | wx:if 条件渲染 |

## 项目结构

```
delta-force-miniapp/
├── app.js                  # 全局应用逻辑
├── app.json                # 全局配置（tabBar等）
├── app.wxss                # 全局样式
├── project.config.json     # 项目配置
├── sitemap.json           # 搜索索引配置
├── utils/
│   ├── api.js              # API请求层
│   ├── store.js            # 数据持久化层
│   ├── util.js             # 工具函数
│   └── chart.js            # Canvas图表绘制
├── pages/
│   ├── home/               # 首页
│   ├── list/               # 物品列表
│   ├── detail/             # 物品详情
│   ├── search/             # 搜索页
│   ├── price/              # 价格异动
│   └── favorites/          # 我的收藏
├── cloudfunctions/
│   └── apiProxy/           # API代理云函数
└── images/                 # 图片资源
```

## 快速开始

### 1. 前置条件

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 微信小程序 AppID（在[微信公众平台](https://mp.weixin.qq.com)注册）
- 开通云开发（用于云函数代理API）

### 2. 配置

1. 在 `project.config.json` 中替换 `appid` 为你的小程序 AppID
2. 在 `app.js` 中修改云环境ID（`env` 字段）
3. 在云开发控制台配置环境变量 `API_TOKEN`（API访问令牌）

### 3. 配置服务器域名白名单

在微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名中：

- **request合法域名**: `https://orzice.com`（直连模式需要）
- **云函数模式**: 无需配置（推荐）

### 4. 部署云函数

在微信开发者工具中：
1. 右键 `cloudfunctions/apiProxy` → 上传并部署：云端安装依赖
2. 在云开发控制台 → 云函数 → apiProxy → 编辑 → 环境变量添加 `API_TOKEN`

### 5. 运行

1. 用微信开发者工具打开 `delta-force-miniapp` 目录
2. 选择"云开发"模式
3. 点击编译预览

## 使用模式

### 云函数代理模式（推荐）
```javascript
// app.js
globalData: { useCloudProxy: true }
```
API请求通过云函数转发，隐藏API Token。需要开通云开发。

### 直连模式
```javascript
// app.js
globalData: { useCloudProxy: false }
```
直接请求API。需要将 `orzice.com` 加入request合法域名白名单。

## Tab Bar 图标说明

当前使用最小占位图标，请替换 `images/` 目录下以下文件为实际图标（推荐 81x81 PNG）：
- `tab-home.png` / `tab-home-active.png` — 首页
- `tab-price.png` / `tab-price-active.png` — 价格异动
- `tab-fav.png` / `tab-fav-active.png` — 我的收藏

## 数据来源

三角洲数据帝 [orzice.com](https://orzice.com) 开放平台

## License

仅供学习和个人使用。禁止用于商业用途。
