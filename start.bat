@echo off
title 落幕查 - 变卖物价格查询
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════
echo        落幕查 - 变卖物价格查询
echo ════════════════════════════════════════════════
echo.

:: 1. 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js（选择 LTS 长期支持版）: https://nodejs.org
    echo 安装完成后重新运行本脚本即可。
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

:: 2. 启动服务器（免配置：API 由线上 Cloudflare Functions 中继，本地无需任何 token）
echo.
echo [OK] 正在启动服务器...
echo.
echo ┌────────────────────────────────────────────┐
echo │  浏览器访问地址: http://localhost:3000     │
echo │  按 Ctrl+C 可停止服务器                     │
echo └────────────────────────────────────────────┘
echo.

start "" http://localhost:3000
node server.js
pause
exit /b 0
