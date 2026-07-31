import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('data/metadata.json 有效且完整', () => {
  const raw = readFileSync(path.join(root, 'data', 'metadata.json'), 'utf8');
  const meta = JSON.parse(raw);
  const keys = Object.keys(meta);
  assert.ok(keys.length > 1000, '物品数量应大于 1000, 实际 ' + keys.length);
  const first = meta[keys[0]];
  assert.ok(first.name, '条目应包含 name');
  assert.ok(first.pic, '条目应包含 pic');
  assert.ok(first._category, '条目应包含 _category');
});
