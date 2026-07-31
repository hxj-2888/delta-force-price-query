// ===== sw-register.js — Service Worker 注册 =====
// 功能清单: 注册sw.js(带版本号破缓存) | 申请Periodic Background Sync权限(24h间隔)
// 回退: 不支持periodicsync的浏览器→main.js的每日记录定时器兜底
// 依赖: sw.js | 被依赖: main.js(初始化时调用registerPeriodicSync)
// 改动影响: 修改sw.js版本号→强制更新SW; 修改minInterval→影响记录频率

async function registerPeriodicSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    var reg = await navigator.serviceWorker.register('/sw.js?v=v20260731p');
    console.log('[SW] 注册成功', reg.scope);

    if ('periodicSync' in reg) {
      var permission = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (permission.state === 'granted') {
        await reg.periodicSync.register('record-daily-prices', {
          minInterval: 24 * 60 * 60 * 1000
        });
        console.log('[SW] PeriodicSync 注册成功');
      } else {
        console.log('[SW] PeriodicSync 未授权（permission:', permission.state + '）');
      }
    } else {
      console.log('[SW] 浏览器不支持 PeriodicSync，将使用页面加载时记录');
    }
  } catch (e) {
    console.log('[SW] 注册失败:', e.message);
  }
}
