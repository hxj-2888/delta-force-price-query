// ===== Service Worker 注册逻辑 =====

async function registerPeriodicSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    var reg = await navigator.serviceWorker.register('/sw.js');
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
