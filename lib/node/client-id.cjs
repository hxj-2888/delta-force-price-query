'use strict';
// ===== 匿名客户端 ID（桌面版） =====
// 云端第三层限流的「同账号」桶（见 functions/api/[[path]].js / lib/api-auth.cjs）：
// 本地浏览器带来的 X-Client-Id 优先透传（与网页版同一 localStorage ID）；
// 缺失时用装机指纹哈希（hostname|username 的 SHA-256 前 32 位, 不落盘、不含原始值）。
// 透传与兜底 ID 都必须过 CLIENT_ID_RE（限流器的统一格式约束）。

const os = require('os');
const crypto = require('crypto');
const { CLIENT_ID_RE } = require('../../scripts/rate-limit.cjs');

const INSTALL_CLIENT_ID = crypto.createHash('sha256')
  .update(os.hostname() + '|' + os.userInfo().username)
  .digest('hex').slice(0, 32);

function getClientId(req) {
  const forwarded = req && req.headers && req.headers['x-client-id'];
  if (typeof forwarded === 'string' && CLIENT_ID_RE.test(forwarded.trim())) {
    return forwarded.trim();
  }
  return INSTALL_CLIENT_ID;
}

module.exports = { getClientId, INSTALL_CLIENT_ID };
