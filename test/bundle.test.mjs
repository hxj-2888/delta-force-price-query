import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bundle.js 与 js/ 源码及版本号一致', () => {
  execFileSync(process.execPath, ['scripts/build.js', '--check'], { cwd: root, stdio: 'pipe' });
});
