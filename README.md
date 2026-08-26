# 三角洲行动 - 变卖物价格查询

三角洲行动游戏变卖物实时价格查询工具。支持 Windows 安装包 / 网页 PWA 一键安装到桌面。

---

## 分发方式一：Windows 安装包 （发给 PC 用户）

### 制作安装包

1. 下载安装 **Inno Setup 6** → https://jrsoftware.org/isinfo.php
2. 双击 `installer.iss` → 点击 **Build → Compile**
3. 编译完成后在 `installer\` 目录找到 `三角洲行动-变卖物价格查询_安装包_v1.0.0.exe`

### 用户安装

1. 双击 `setup.exe` 安装
2. 桌面自动生成快捷方式
3. 双击快捷方式 → 首次运行引导配置 API Token → 即可使用

---

## 分发方式二：PWA 网页安装（发给手机/电脑用户） 

### 部署到云端

部署到 Cloudflare Pages（免费）：
```
npm i -g wrangler && wrangler pages deploy .
```

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

将整个项目打包为 ZIP，解压后双击 `start.bat` 即可。

前置条件：需安装 Node.js（https://nodejs.org）

---

## 分发方式四：微信小程序

> ⚠️ **重要前提**：微信要求小程序请求的域名必须是 **HTTPS 且完成 ICP 备案** 的域名。
> `*.pages.dev` 等海外域名无法备案，不能加入 request 合法域名，真机正式版无法请求。

### 发布前配置（三步）

1. **准备已备案域名**：将你的已备案域名（如 `api.example.com`）CNAME 到 Cloudflare Pages 项目，
   或用国内服务器/CDN 反向代理到 `/api/*`，保证该域名可正常 HTTPS 访问。
2. **修改小程序 API 地址**：编辑 `miniprogram/utils/config.js`，把 `API_BASE` 改成你的域名。
   （token 仍留在服务端代理中，不会暴露给客户端）
3. **配置微信后台**：微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名，
   添加你的域名，然后在微信开发者工具中上传代码（需把 `project.config.json` 中的 appid 换成你的 AppID）。

> 开发阶段可在开发者工具勾选「不校验合法域名…」，或真机打开调试模式临时联调；
> 发布正式版前必须完成上述配置，否则首页会提示"请求域名未配置或未备案"。

---

## 项目结构

```
├── index.html          # 主页面（PWA）
├── manifest.json       # PWA 清单，支持手机/电脑安装到桌面
├── sw.js               # Service Worker（后台价格记录 + PWA 安装）
├── js/                 # 前端模块源码（bundle.js 为构建产物）
├── css/                # 样式文件
├── functions/          # Cloudflare Pages Functions（API 代理 + 缓存破除）
├── workers/cron/       # Cloudflare Cron Worker（每日价格采集）
├── data/               # 静态元数据（metadata.json）
├── migrations/         # D1 数据库迁移
├── miniprogram/        # 微信小程序源码
├── scripts/            # 构建与元数据生成脚本
├── server.js           # 本地代理服务器（便携版）
├── installer.iss       # Inno Setup 安装包脚本 → 生成 setup.exe
├── setup.bat           # 便携版桌面安装脚本
├── start.bat           # 一键启动脚本
├── .env                # API Token 配置（本地，不入库）
└── delta-force-logo.png
```

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
3. `smoke-test`：部署后自动验证平台的首页和 `/api/metadata` 均可访问；
4. 每周一 11:00（北京时间）自动重新生成元数据，有变化则提交并重新部署。
