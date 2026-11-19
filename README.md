# 落幕查

《三角洲行动》变卖物价格查询工具：分类浏览、搜索、收藏、涨跌榜和 30 天价格走势。

- 在线使用：<https://delta-force-v5.pages.dev>
- 下载页：<https://delta-force-v5.pages.dev/download.html>

## 运行

静态站点零依赖：

```bash
node server.js
```

打开 <http://localhost:8787>（端口以 `server.js` 输出为准）。

Cloudflare Pages 部署：

```bash
wrangler pages deploy . --project-name delta-force-v5
```

`wrangler.toml` 中的 D1 / KV 绑定需要在 Cloudflare 控制台创建后填入自己的 ID。

## 数据

价格快照与 30 天历史保存在 `data/`；采集与定时刷新代码在 `workers/cron/`。

## 许可

代码 MIT，见 `LICENSE`。
