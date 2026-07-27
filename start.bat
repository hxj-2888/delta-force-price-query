@echo off
chcp 65001 >nul
title 三角洲行动 - 变卖物价格查询
cd /d "%~dp0"

:: ============================================================
::         三角洲行动 - 变卖物价格查询 一键启动脚本
:: ============================================================

echo.
echo ════════════════════════════════════════════════
echo        三角洲行动 - 变卖物价格查询
echo ════════════════════════════════════════════════
echo.

:: 1. 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js（选择 LTS 长期支持版）:
    echo   https://nodejs.org
    echo.
    echo 安装完成后重新运行本脚本即可。
    echo.
    pause
    exit /b 1
)
echo [✓] Node.js 已安装

:: 2. 检查 .env 文件
if not exist ".env" (
    echo [!] 未找到 .env 文件，正在创建...
    (
        echo # 三角洲行动 API Token
        echo # 将 your_token_here 替换为你的真实 API Token
        echo API_TOKEN=your_token_here
    ) > .env
    echo [✓] 已创建 .env 文件
    echo.
    echo ┌────────────────────────────────────────────┐
    echo │ 请用记事本打开项目目录下的 .env 文件       │
    echo │ 将 your_token_here 替换为你的 API Token     │
    echo │ 保存后重新运行本脚本                        │
    echo └────────────────────────────────────────────┘
    echo.
    start notepad ".env"
    :: 等用户编辑
    set /p dummy="按任意键继续..."
)

:: 3. 验证 .env 中已填入真实 token
findstr /c:"your_token_here" ".env" >nul 2>&1
if %errorlevel% equ 0 (
    echo [!] .env 文件中的 Token 尚未修改，请填入真实 API Token 后重试
    start notepad ".env"
    pause
    exit /b 1
)

:: 4. 启动服务器
echo.
echo [✓] 正在启动服务器...
echo.
echo ┌────────────────────────────────────────────┐
echo │  浏览器访问地址:                            │
echo │  http://localhost:3000                      │
echo │                                            │
echo │  按 Ctrl+C 可停止服务器                     │
echo └────────────────────────────────────────────┘
echo.

:: 自动打开浏览器
start http://localhost:3000

node server.js

pause
