; 落幕查 - 变卖物价格查询  Windows 安装包
; 使用 Inno Setup 6 编译 → 生成 setup.exe
; 下载 Inno Setup: https://jrsoftware.org/isinfo.php

#define MyAppName "落幕查-变卖物价格查询"
#define MyAppNameEn "DeltaForcePriceQuery"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DeltaForce"
#define MyAppURL "http://localhost:3000"

[Setup]
AppId={{D8F4A1B2-3C5E-4A9D-8B7C-6E2F0A1D3E5F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppNameEn}
DefaultGroupName={#MyAppName}
OutputDir=.\installer
OutputBaseFilename=落幕查_安装包_v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=.\icon.ico
UninstallDisplayIcon={app}\icon.ico
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinese"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Files]
Source: ".\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; 排除安装器自身目录
; ★ 安装包只含运行时文件；绝不打入：签名私钥/源码目录/CI 配置/分发产物
Excludes: "installer\*,.git\*,node_modules\*,miniprogram\*,miniprogram.zip,functions\*,workers\*,migrations\*,test\*,.env*,.gitignore,_headers,wrangler.toml,DEPLOY.md,README.md,project.config.json,project.private.config.json,.vercel\*,.wrangler\*,.assetsignore,android\*,scripts\*,.github\*,*.keystore,*.jks,*.pem,*.key,*.apk,*.zip"

[Dirs]
Name: "{app}"; Permissions: users-full

[Icons]
; 桌面快捷方式
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start.bat"; WorkingDir: "{app}"; Comment: "落幕查 变卖物实时价格查询"

; 开始菜单
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\{#MyAppName}\卸载"; Filename: "{uninstallexe}"

[Run]
; 安装完成后自动运行
Filename: "{app}\start.bat"; Description: "立即启动落幕查价格查询"; Flags: nowait postinstall shellexec

[Code]
// 安装前检测 Node.js
function InitializeSetup: Boolean;
var
  NodePath: String;
begin
  Result := True;
  // 简单提示，不做强制拦截
end;

// 安装完成后的操作
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // 标记 .env 需要配置
  end;
end;
