// ===== scripts/build.js — JS Bundle 构建脚本 =====
// 功能清单: 按依赖顺序合并6个JS模块→js/bundle.js | 自动生成版本号(vYYYYMMDD+小时字母)
// 自动更新index.html中bundle.js/sw-register.js的?v=版本号 | 自动同步functions/index.js的VERSION
// 模块拼接顺序: config→utils→maps→store/*→api→render/*→app/*
// 用法: node scripts/build.js
// 校验模式: node scripts/build.js --check  （只校验 bundle 与源码/版本号一致, 不写文件, CI 用）
// 注意: 每次修改 js/ 目录下任何源文件后必须运行此脚本同步 bundle.js，否则线上不会生效
// 依赖: Node.js fs/path | 改动影响: 版本号→影响浏览器缓存策略; 模块顺序→影响全局变量初始化

const fs = require('fs');
const path = require('path');
const CHECK_MODE = process.argv.indexOf('--check') >= 0;

const JS_DIR = path.join(__dirname, '..', 'js');

// 模块拼接顺序: config→utils→maps→store/*→api→render/*→app/*
const MODULES = [
  'config',
  'utils',
  'maps',
  'store/cache',
  'store/favorites',
  'store/search',
  'api',
  'render/shared',
  'render/charts',
  'render/home',
  'render/list',
  'render/detail',
  'render/search',
  'render/favtab',
  'app/router',
  'app/init'
];

function makeVersion() {
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  return 'v' + dateStr + String('abcdefghijklmnopqrstuvwxyz'[Math.min(now.getHours(), 25)]);
}

// 拼接各模块（body 部分与时间戳无关, 保证 --check 可复现比较）
function buildBundle(version) {
  let bundle = '// 三角洲行动 — JS Bundle (all modules combined)\n';
  bundle += '// ' + version + ' — 自动生成于 ' + new Date().toISOString().replace('T', ' ').substring(0, 19) + '\n\n';

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
  return bundle;
}

// ===== 校验模式: 不写任何文件, 只检查一致性 =====
if (CHECK_MODE) {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const bundleRef = html.match(/bundle\.js\?v=([a-z0-9]+)/);
  const swRef = html.match(/sw-register\.js\?v=([a-z0-9]+)/);
  const swRegPath = path.join(JS_DIR, 'sw-register.js');
  const swReg = fs.readFileSync(swRegPath, 'utf8');
  const swRegRef = swReg.match(/sw\.js\?v=([a-z0-9]+)/);
  const funcIndexPath = path.join(__dirname, '..', 'functions', 'index.js');
  const funcContent = fs.readFileSync(funcIndexPath, 'utf8');
  const funcRef = funcContent.match(/export const VERSION = '([^']+)'/);

  const errors = [];
  if (!bundleRef || !swRef || !swRegRef || !funcRef) {
    errors.push('无法从 index.html / sw-register.js / functions/index.js 读取版本号');
  } else {
    const version = bundleRef[1];
    if (swRef[1] !== version) errors.push('index.html 中 sw-register.js 版本号不一致: ' + swRef[1] + ' ≠ ' + version);
    if (swRegRef[1] !== version) errors.push('sw-register.js 中 sw.js 版本号不一致: ' + swRegRef[1] + ' ≠ ' + version);
    if (funcRef[1] !== version) errors.push('functions/index.js VERSION 不一致: ' + funcRef[1] + ' ≠ ' + version);

    const bundlePath = path.join(JS_DIR, 'bundle.js');
    if (!fs.existsSync(bundlePath)) {
      errors.push('缺少 js/bundle.js, 请先运行 node scripts/build.js');
    } else {
      const existing = fs.readFileSync(bundlePath, 'utf8');
      const expected = buildBundle(version);
      // 忽略头部两行（版本+生成时间戳）, 只比较模块内容
      const stripHeader = (s) => s.split('\n').slice(2).join('\n');
      if (stripHeader(existing) !== stripHeader(expected)) {
        errors.push('js/bundle.js 与 js/ 源码不一致, 请运行 node scripts/build.js 重建后提交');
      }
    }
  }

  if (errors.length > 0) {
    console.error('✗ Bundle 校验失败:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('✓ Bundle 校验通过: bundle.js / 版本号 与源码一致');
  process.exit(0);
}

// ===== 正常构建模式 =====
const version = makeVersion();
const bundle = buildBundle(version);

// 写入 bundle.js
const bundlePath = path.join(JS_DIR, 'bundle.js');
fs.writeFileSync(bundlePath, bundle, 'utf8');

// 更新 index.html 中的版本号（bundle.js + sw-register.js 总是更新；CSS 仅当实际修改时才更新）
const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/bundle\.js\?v=[a-z0-9]+/g, 'bundle.js?v=' + version);
html = html.replace(/sw-register\.js\?v=[a-z0-9]+/g, 'sw-register.js?v=' + version);

// ★ CSS 仅在实际内容变化时更新版本号，避免不必要的缓存失效
const cssDir = path.join(__dirname, '..', 'css');
const crypto = require('crypto');
['layout', 'components'].forEach(function(name) {
  var cssPath = path.join(cssDir, name + '.css');
  if (fs.existsSync(cssPath)) {
    var cssContent = fs.readFileSync(cssPath, 'utf8');
    var newHash = crypto.createHash('md5').update(cssContent).digest('hex').substring(0, 8);
    // 从当前 HTML 中提取已有的 hash
    var existingMatch = html.match(new RegExp(name + '\\.css\\?v=[a-z0-9]+(?:-([a-f0-9]+))?'));
    var oldHash = existingMatch ? (existingMatch[1] || '') : '';
    if (oldHash !== newHash) {
      console.log('  CSS: ' + name + '.css 内容已变更，更新版本号');
      html = html.replace(new RegExp(name + '\\.css\\?v=[a-z0-9]+(?:-[a-f0-9]+)?', 'g'), name + '.css?v=' + version + '-' + newHash);
    } else {
      console.log('  CSS: ' + name + '.css 内容未变更，保留原有版本号');
    }
  }
});
fs.writeFileSync(indexPath, html, 'utf8');

// 更新 sw-register.js 内部的 sw.js 注册版本号
const swRegPath = path.join(JS_DIR, 'sw-register.js');
if (fs.existsSync(swRegPath)) {
  let swReg = fs.readFileSync(swRegPath, 'utf8');
  swReg = swReg.replace(/sw\.js\?v=[a-z0-9]+/g, 'sw.js?v=' + version);
  fs.writeFileSync(swRegPath, swReg, 'utf8');
}

// 更新 functions/index.js 中的重定向版本号（手机缓存破除）
const funcIndexPath = path.join(__dirname, '..', 'functions', 'index.js');
if (fs.existsSync(funcIndexPath)) {
  let funcContent = fs.readFileSync(funcIndexPath, 'utf8');
  funcContent = funcContent.replace(/export const VERSION = '[^']*'/, "export const VERSION = '" + version + "'");
  fs.writeFileSync(funcIndexPath, funcContent, 'utf8');
}

// 统计
const oldSize = fs.statSync(bundlePath).size;
console.log('三角洲行动 — Bundle 构建完成');
console.log('  版本: ' + version);
console.log('  文件: js/bundle.js (' + (oldSize / 1024).toFixed(1) + ' KB)');
console.log('  模块: ' + MODULES.join(' → ') + ' (' + MODULES.length + ' files)');
console.log('  HTML: index.html 版本号已同步为 ?v=' + version);
console.log('  CSS: layout.css/components.css 版本号已按需更新（仅变更时）');
console.log('  SW: sw-register.js 内部 sw.js 版本号已同步');
console.log('  函数: functions/index.js VERSION 已同步');
