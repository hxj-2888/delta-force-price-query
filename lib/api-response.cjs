'use strict';
// ===== JSON 响应构造（Pages 函数专用，workers Response API） =====
// 所有 /api/* 的 JSON 响应都经此构造，保证 Content-Type 与序列化行为一致。
// 需要额外响应头（ACAO / Cache-Control / Retry-After）时经 extraHeaders 传入。

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

module.exports = { jsonResponse };
