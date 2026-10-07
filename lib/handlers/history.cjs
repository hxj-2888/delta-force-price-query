'use strict';
// ===== GET /api/history/:itemId —— 价格历史（D1，近 30 天） =====

const { jsonResponse } = require('../api-response.cjs');

async function handleHistoryRequest(env, itemId) {
  if (!env || !env.DB) {
    return jsonResponse({ code: -1, msg: 'D1 数据库未绑定' }, 500, { 'Access-Control-Allow-Origin': '*' });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT item_id  AS itemId,
             name,
             price,
             recorded_date AS d
      FROM price_history
      WHERE item_id = ?
        AND recorded_date >= date('now', '+8 hours', '-30 days')
      ORDER BY recorded_date DESC
      LIMIT 31
    `).bind(itemId).all();

    const snapshots = results.map(r => ({
      d: r.d,
      p: r.price,
    }));

    return jsonResponse({
      code: 0,
      data: { itemId, name: snapshots.length > 0 ? results[0].name : '', snapshots },
    }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    console.error('[历史查询错误]', err.message);
    return jsonResponse({ code: -1, msg: '查询失败: ' + err.message }, 500, { 'Access-Control-Allow-Origin': '*' });
  }
}

module.exports = { handleHistoryRequest };
