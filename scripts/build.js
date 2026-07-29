// 三角洲行动 — Bundle 构建脚本
// 将 js/ 目录下的源文件按依赖顺序合并为 js/bundle.js
// 用法: node scripts/build.js
// 注意: 每次修改 js/api.js js/main.js 等源文件后必须运行此脚本同步 bundle.js

const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');

// ★ 拼接顺序（依赖关系：utils→maps→store→api→render→main）
const MODULES = ['utils', 'store', 'api', 'render', 'main'];

const now = new Date();
const dateStr = now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, '0') +
  String(now.getDate()).padStart(2, '0');
const version = 'v' + dateStr + String('abcdefghijklmnopqrstuvwxyz'[Math.min(now.getHours(), 25)]);

// 拼接各模块
let bundle = '// 三角洲行动 — JS Bundle (all modules combined)\n';
bundle += '// ' + version + ' — 自动生成于 ' + now.toISOString().replace('T', ' ').substring(0, 19) + '\n\n';

for (const mod of MODULES) {
  const filePath = path.join(JS_DIR, mod + '.js');
  if (!fs.existsSync(filePath)) {
    console.error('  ✗ 缺失: js/' + mod + '.js');
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  bundle += '// ===== ' + mod + '.js =====\n';
  bundle += content.trim() + '\n\n';
}

// 写入
const bundlePath = path.join(JS_DIR, 'bundle.js');
fs.writeFileSync(bundlePath, bundle, 'utf8');

// 更新 HTML 中的版本号
const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/bundle\.js\?v=[a-z0-9]+/g, 'bundle.js?v=' + version);
fs.writeFileSync(indexPath, html, 'utf8');

// 统计
const oldSize = fs.statSync(bundlePath).size;
console.log('三角洲行动 — Bundle 构建完成');
console.log('  版本: ' + version);
console.log('  文件: js/bundle.js (' + (oldSize / 1024).toFixed(1) + ' KB)');
console.log('  模块: ' + MODULES.join(' → ') + ' (' + MODULES.length + ' files)');
console.log('  HTML: index.html 版本号已更新为 ?v=' + version);
