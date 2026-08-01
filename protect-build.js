// ===== protect-build.js — 生成受保护部署副本 (_dist) =====
// 功能: 复制运行时白名单文件到 _dist | terser 压缩混淆前端 JS | clean-css 压缩 CSS
//       | 去除 HTML 注释 | 在现有 _headers 基础上补充安全响应头
// 用法: node protect-build.js
const fs = require('fs');
const path = require('path');
const { minify } = require(path.join(__dirname, 'build-tools', 'node_modules', 'terser'));
const CleanCSS = require(path.join(__dirname, 'build-tools', 'node_modules', 'clean-css'));

const ROOT = __dirname;
const DIST = path.join(ROOT, '_dist');
const BANNER = '/*! (c) 2026 DeltaForce Price Query. All rights reserved. 版权所有，禁止未经授权复制、转载或二次发布。 */';

// 只复制运行时必需的文件（.assetsignore 已排除的本地工具/CI 文件一律不发布）
const COPY_ITEMS = [
  'index.html', 'sw.js', 'manifest.json', '_headers', 'wrangler.toml', '.assetsignore',
  'css', 'js/bundle.js', 'js/sw-register.js', 'data', 'functions',
  'delta-force-logo.webp', 'delta-force-logo.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon.ico',
];

// 补充的安全响应头（合并到现有 _headers 末尾；相同路径不同头名会自动合并）
const EXTRA_HEADERS = [
  '',
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '',
];

function listFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

(async () => {
  // 1. 清空并重建 _dist
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // 2. 复制白名单文件
  for (const item of COPY_ITEMS) {
    const src = path.join(ROOT, item);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(DIST, item), { recursive: true });
  }

  // 3. 压缩混淆所有前端 JS（functions/ 是服务端代码，本来就不公开，跳过）
  const jsFiles = listFiles(DIST).filter(
    (f) => f.endsWith('.js') && !f.split(path.sep).includes('functions')
  );
  for (const f of jsFiles) {
    const code = fs.readFileSync(f, 'utf8');
    const res = await minify(code, {
      compress: { passes: 1 },
      mangle: true,
      format: { comments: false },
    });
    if (res.error) {
      console.error('✗ JS 压缩失败:', path.relative(DIST, f), res.error);
      process.exit(1);
    }
    fs.writeFileSync(f, BANNER + '\n' + res.code);
    console.log('✓ JS   ' + path.relative(DIST, f) + '  (' + code.length + ' -> ' + res.code.length + ' B)');
  }

  // 4. 压缩 CSS
  const cssFiles = listFiles(DIST).filter((f) => f.endsWith('.css'));
  for (const f of cssFiles) {
    const code = fs.readFileSync(f, 'utf8');
    const res = new CleanCSS({ level: 1 }).minify(code);
    if (res.errors && res.errors.length) {
      console.error('✗ CSS 压缩失败:', path.relative(DIST, f), res.errors);
      process.exit(1);
    }
    fs.writeFileSync(f, BANNER + '\n' + res.styles);
    console.log('✓ CSS  ' + path.relative(DIST, f) + '  (' + code.length + ' -> ' + res.styles.length + ' B)');
  }

  // 5. 去除 HTML 注释（保留 IE 条件注释）
  const htmlFiles = listFiles(DIST).filter((f) => f.endsWith('.html'));
  for (const f of htmlFiles) {
    const code = fs.readFileSync(f, 'utf8');
    const stripped = code.replace(/<!--(?!\s*\[if)[\s\S]*?-->/g, '');
    fs.writeFileSync(f, stripped);
    console.log('✓ HTML ' + path.relative(DIST, f) + '  (注释已清除)');
  }

  // 6. 在现有 _headers 基础上补充安全头
  const headersPath = path.join(DIST, '_headers');
  const headers = fs.readFileSync(headersPath, 'utf8');
  fs.writeFileSync(headersPath, headers.replace(/\s*$/, '') + EXTRA_HEADERS.join('\n'));
  console.log('✓ _headers 安全头已补充');

  console.log('\n构建完成 → ' + DIST);
})();
