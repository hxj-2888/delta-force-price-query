// 云函数 - API代理
// 将小程序请求转发到 orzice.com API，隐藏 API_TOKEN

const https = require('https');

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';
// 从云函数环境变量中获取 API Token（在云开发控制台配置）
const API_TOKEN = process.env.API_TOKEN || '';

exports.main = async (event, context) => {
  const { endpoint, params = {} } = event;

  if (!endpoint) {
    return { code: -1, msg: '缺少 endpoint 参数' };
  }

  // 构建查询字符串
  const searchParams = new URLSearchParams(params);
  searchParams.set('token', API_TOKEN);
  const queryString = searchParams.toString();

  const requestPath = `${API_PATH}/${endpoint}${queryString ? '?' + queryString : ''}`;

  console.log(`[API代理] ${endpoint} → ${API_HOST}${requestPath.replace(API_TOKEN, '***')}`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      port: 443,
      path: requestPath,
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForceMiniapp/1.0',
        'Accept': 'application/json'
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch (e) {
          resolve({ code: -1, msg: 'JSON解析失败', raw: body.substring(0, 500) });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ code: -1, msg: 'API请求失败: ' + err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ code: -1, msg: 'API请求超时' });
    });

    req.end();
  });
};
