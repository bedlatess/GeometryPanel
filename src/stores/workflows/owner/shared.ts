import { ownerText as txt } from '../../../core/owner-model';
export const ownerRoutes: Record<string, string> = {
  '/vehicle/health': '体检',
  '/vehicle/firmware': '固件信息',
  '/vehicle/location/fences': '电子围栏',
  '/vehicle/settings/phone-keys': '手机钥匙',
  '/vehicle/settings/card-keys': '卡钥匙',
  '/vehicle/settings/charge-plan': '充电计划',
  '/vehicle/settings/sharing': '车辆分享',
  '/vehicle/settings/low-phone': '超低电量电话提醒',
  '/records/battery/score': '电池评分',
  '/records/battery/official': '官方记录',
};
export const date = (v: unknown) => {
  const s = txt(v);
  return /^20\d{2}-\d{2}-\d{2}/.test(s)
    ? s
        .slice(0, 10)
        .replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${y}年${Number(m)}月${Number(d)}日`)
    : s;
};
export const maskPhone = (v: unknown) => txt(v).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
