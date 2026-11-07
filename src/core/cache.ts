import { appScope } from './scope';

export async function managePageCache(clear = false): Promise<string> {
  if (!navigator.serviceWorker) return '当前入口没有浏览器离线缓存，可联网重新打开页面。';
  const registration = await navigator.serviceWorker.getRegistration(appScope);
  if (!registration?.active) return '当前入口由原生容器或网络管理页面；浏览器离线缓存未启用。';
  if (registration.waiting || registration.installing) return '新页面正在准备或等待切换，请先完成更新再清理旧缓存。';
  return new Promise(resolve => {
    const channel = new MessageChannel(), timer = setTimeout(() => { channel.port1.close(); resolve('当前页面版本尚不支持缓存管理，请先检查更新。'); }, 5000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close(); const result = event.data;
      resolve(result?.busy ? '新页面正在准备，请先完成更新再清理。' : result?.failed ? '缓存读取未完成，请联网重试。'
        : result?.ready ? `离线页面完整，共 ${Number(result.files) || 0} 个静态文件。${clear ? `已清理 ${Number(result.removed) || 0} 份旧页面缓存。` : ''}账号与本机记录保留。`
          : '离线页面尚不完整，请联网检查更新。账号与本机记录保留。');
    };
    registration.active!.postMessage({ type: clear ? 'CLEAR_UNUSED_CACHES' : 'CACHE_STATUS' }, [channel.port2]);
  });
}
