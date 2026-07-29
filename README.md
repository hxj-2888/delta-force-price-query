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

部署到 Vercel（免费）：
```
npm i -g vercel && vercel
```

或部署到 Cloudflare Pages（免费）：
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

## 项目结构

```
├── installer.iss       # Inno Setup 安装包脚本 → 生成 setup.exe
├── manifest.json       # PWA 清单，支持手机/电脑安装到桌面
├── setup.bat           # 便携版桌面安装脚本
├── start.bat           # 一键启动脚本
├── server.js           # 本地代理服务器
├── index.html          # 主页面
├── .env                # API Token 配置
├── sw.js               # Service Worker（离线/PWA）
├── js/                 # 前端脚本
├── css/                # 样式文件
└── delta-force-logo.png
```
