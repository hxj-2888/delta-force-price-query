'use strict';
// ===== 零依赖 JS 语法检查（CI 用） =====
// 遍历项目内全部 JS/CJS/MJS 文件并执行 node --check；
// ESM 文件（functions/ 等含 export 的文件）复制为临时 .mjs 再校验。
// 用法: node scripts/lint.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '.vercel', 'installer', 'dist']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
    } else if (/\.(js|cjs|mjs)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function isEsm(file) {
  return fs.readFileSync(file, 'utf8').includes('export ');
}

let failed = 0;
const files = walk(root);

for (const file of files) {
  try {
    if (isEsm(file)) {
      const tmp = path.join(
        os.tmpdir(),
        'lint-' + path.basename(file) + '-' + Math.random().toString(36).slice(2) + '.mjs'
      );
      fs.copyFileSync(file, tmp);
      try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      } finally {
        fs.unlinkSync(tmp);
      }
    } else {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    }
    console.log('  OK  ' + path.relative(root, file));
  } catch (e) {
    failed++;
    console.error('  FAIL ' + path.relative(root, file));
    console.error(String((e.stderr && e.stderr.toString()) || e.message).split('\n').slice(0, 3).join('\n'));
  }
}

if (failed > 0) {
  console.error('✗ ' + failed + ' 个文件存在语法错误');
  process.exit(1);
}
console.log('✓ ' + files.length + ' 个 JS 文件语法检查通过');
