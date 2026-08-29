# 安全部署脚本 — 白名单暂存后部署到 Cloudflare Pages（delta-force-v5）
# 用法：powershell -ExecutionPolicy Bypass -File .\deploy-pages.ps1
#
# ★ 为什么不能直接 `wrangler pages deploy .`：
#   .assetsignore 是 Workers static assets 的特性，对 wrangler pages deploy 无效（2026-08-29 实测），
#   整目录直推会把磁盘上的 .env（签名密码）、android/release.keystore（签名私钥）、
#   修改记录*.md、审计报告.md 等全部公开。本脚本只暂存白名单内的站点文件。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$PROJECT = 'delta-force-v5'

$STAGE = Join-Path $env:TEMP 'deltaforce-pages-deploy'
if (Test-Path $STAGE) { Remove-Item $STAGE -Recurse -Force }
New-Item -ItemType Directory -Force $STAGE | Out-Null

$allowlist = @(
  'index.html', 'download.html',
  'delta-force-logo.png', 'delta-force-logo.webp',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon.ico',
  'manifest.json', 'sw.js',
  'js', 'data', 'functions', 'wrangler.toml', '_headers'
)
foreach ($item in $allowlist) {
  if (-not (Test-Path $item)) { Write-Host "缺失站点文件: $item" -ForegroundColor Red; exit 1 }
  Copy-Item -Recurse -Force $item "$STAGE/"
}

wrangler pages deploy $STAGE --project-name $PROJECT --branch main
Write-Host "部署后地址：https://$PROJECT.pages.dev" -ForegroundColor Green
