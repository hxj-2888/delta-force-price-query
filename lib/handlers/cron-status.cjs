'use strict';
// ===== GET /api/cron-status —— Cron 采集心跳 =====
// 仅暴露采集时间戳与物品数，无敏感数据；仅读 KV，一次 GET 不触上游。

const { jsonResponse } = require('../api-response.cjs');

async function handleCronStatus(env) {
  let hb = null;
  try { hb = await env.METADATA_KV.get('cron_heartbeat', 'json'); } catch (_) { /* 未绑定/读失败视作无记录 */ }
  if (!hb || !hb.lastSuccessDate) {
    return jsonResponse({
      code: 0,
      data: { healthy: false, lastSuccessDate: null, msg: '暂无心跳记录（Cron 未部署或从未成功采集）' },
    }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  }
  // 北京时间"今天"；06:00（Cron 调度）之前应看到昨天，之后应看到今天
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = bj.toISOString().split('T')[0];
  const expectStr = bj.getUTCHours() >= 6
    ? todayStr
    : new Date(bj.getTime() - 86400000).toISOString().split('T')[0];
  const daysBehind = Math.round((new Date(todayStr + 'T00:00:00Z') - new Date(hb.lastSuccessDate + 'T00:00:00Z')) / 86400000);
  return jsonResponse({
    code: 0,
    data: {
      healthy: hb.lastSuccessDate >= expectStr,
      lastSuccessDate: hb.lastSuccessDate,
      lastSuccessAt: hb.lastSuccessAt || null,
      lastRunAt: hb.lastRunAt || null,
      lastFailAt: hb.lastFailAt || null,
      lastFailReason: hb.lastFailReason || null,
      itemCount: typeof hb.itemCount === 'number' ? hb.itemCount : null,
      daysBehind,
    },
  }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
}

module.exports = { handleCronStatus };
