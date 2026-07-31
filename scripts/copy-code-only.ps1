$src = "C:\Users\ASUS\Desktop\delta-force-deploy"
$dst = "C:\Users\ASUS\Desktop\delta-force-deploy-code"

# Clean destination
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
New-Item -ItemType Directory -Force $dst | Out-Null

$copied = 0
$skipped = 0

Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
  $f = $_
  $ext = $f.Extension.ToLower()
  $name = $f.Name.ToLower()
  $dir = $f.DirectoryName.ToLower()
  $relPath = $f.FullName.Substring($src.Length + 1)

  $skip = $false
  $reason = ""

  # Images
  if ($ext -in '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.bmp') {
    $skip = $true; $reason = "image"
  }
  # Documentation
  elseif ($name -in 'readme.md', 'deploy.md', 'readme.txt') {
    $skip = $true; $reason = "doc"
  }
  # Installer / setup
  elseif ($ext -eq '.iss' -or $name -eq 'setup.bat') {
    $skip = $true; $reason = "installer"
  }
  # 本地状态目录: 一律排除（.wrangler 含 CF 账户邮箱+ID，.vercel 含链接信息，.git 非代码）
  # 注意: .wrangler/cache/wrangler-account.json 含账户邮箱，打包分享前必须排除
  elseif ($dir -match '\\(\.wrangler|\.vercel|\.git)($|\\)') {
    $skip = $true; $reason = "local-state"
  }
  # Miniprogram images
  elseif ($dir -like '*\miniprogram\images*') {
    $skip = $true; $reason = "mp-image"
  }

  if ($skip) {
    $skipped++
    Write-Host "SKIP ($reason): $relPath"
  } else {
    $targetDir = Join-Path $dst (Split-Path $relPath -Parent)
    if (-not (Test-Path $targetDir)) {
      New-Item -ItemType Directory -Force $targetDir | Out-Null
    }
    Copy-Item $f.FullName (Join-Path $dst $relPath) -Force
    $copied++
    Write-Host "COPY: $relPath"
  }
}

Write-Host ""
Write-Host "Done: $copied files copied, $skipped files excluded"
Write-Host "Output: $dst"
