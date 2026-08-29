@echo off
chcp 65001 >nul
title 落幕查 - 安装到桌面
cd /d "%~dp0"

echo ════════════════════════════════════════════════
echo    落幕查 - 变卖物价格查询  桌面安装
echo ════════════════════════════════════════════════
echo.

set "INSTALL_DIR=%APPDATA%\DeltaForcePriceQuery"

echo 即将安装到: %INSTALL_DIR%
echo.
echo 按任意键开始安装，或关闭窗口取消...
pause >nul

:: 1. 创建安装目录
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if %errorlevel% neq 0 (
    echo [✗] 无法创建安装目录
    pause
    exit /b 1
)

:: 2. 复制所有文件
echo [→] 正在复制文件...
xcopy /E /Y /Q /EXCLUDE:"%~dp0installer-exclude.txt" ".\*" "%INSTALL_DIR%\" >nul 2>&1
echo [✓] 文件复制完成

:: 3. 创建桌面快捷方式 (VBS)
echo [→] 正在创建桌面快捷方式...
set "DESKTOP=%USERPROFILE%\Desktop"
set "VBS=%TEMP%\shortcut.vbs"

> "%VBS%" echo Set ws = WScript.CreateObject("WScript.Shell")
>> "%VBS%" echo deskPath = ws.SpecialFolders("Desktop")
>> "%VBS%" echo Set shortcut = ws.CreateShortcut(deskPath ^& "\落幕查-变卖物价格查询.lnk")
>> "%VBS%" echo shortcut.TargetPath = "%INSTALL_DIR%\start.bat"
>> "%VBS%" echo shortcut.WorkingDirectory = "%INSTALL_DIR%"
>> "%VBS%" echo shortcut.IconLocation = "%INSTALL_DIR%\icon.ico,0"
>> "%VBS%" echo shortcut.Description = "落幕查 - 变卖物实时价格查询"
>> "%VBS%" echo shortcut.WindowStyle = 1
>> "%VBS%" echo shortcut.Save

cscript //nologo "%VBS%" >nul 2>&1
set "SHORTCUT_OK=%errorlevel%"
del "%VBS%" >nul 2>&1

:: 如果 logo 图标设置失败（cscript 返回非 0），用系统图标兜底
if not "%SHORTCUT_OK%"=="0" (
    echo [!] 自定义图标设置失败，使用系统图标兜底...
    > "%TEMP%\shortcut2.vbs" echo Set ws = WScript.CreateObject("WScript.Shell")
    >> "%TEMP%\shortcut2.vbs" echo deskPath = ws.SpecialFolders("Desktop")
    >> "%TEMP%\shortcut2.vbs" echo Set shortcut = ws.CreateShortcut(deskPath ^& "\落幕查-变卖物价格查询.lnk")
    >> "%TEMP%\shortcut2.vbs" echo shortcut.IconLocation = "shell32.dll,13"
    >> "%TEMP%\shortcut2.vbs" echo shortcut.Save
    cscript //nologo "%TEMP%\shortcut2.vbs" >nul 2>&1
    del "%TEMP%\shortcut2.vbs" >nul 2>&1
)
echo [✓] 桌面快捷方式已创建

:: 4. 首次运行，检查配置
echo.
echo ┌────────────────────────────────────────────┐
echo │  安装完成！                                │
echo │                                            │
echo │  桌面已生成快捷方式:                        │
echo │  "落幕查-变卖物价格查询"                  │
echo │                                            │
echo │  首次使用前请先配置 API Token:              │
echo │  双击快捷方式后，脚本会引导你完成配置        │
echo └────────────────────────────────────────────┘
echo.

start explorer "%INSTALL_DIR%"
echo 安装目录已打开，可以查看 .env 文件并配置 Token。

pause
