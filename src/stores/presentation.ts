import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { DAILY_FUTURE_TOLERANCE_MS, DAILY_STALE_AFTER_MS } from '../core/daily-model';
import { demoSnapshot, demoVehicle } from '../core/model';
import { useSessionStore } from './session';
export const format = (v: number | null | undefined, unit = '') =>
  v == null
    ? '—'
    : v.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + (unit ? ` ${unit}` : '');
/** "2026-11-01" / "2026.11.01 08:10" / timestamp -> "11 月 1 日" (other years keep the year). */
export function calendarDay(value: unknown, withTime = false): string {
  if (value == null || value === '') return '—';
  let date: Date | null = null;
  if (typeof value === 'number') date = new Date(value);
  else {
    const m = String(value).match(
      /^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2}))?/,
    );
    if (m) date = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  if (!date || Number.isNaN(date.getTime())) return String(value);
  const head =
    (date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear()} 年 `) +
    `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  if (!withTime) return head;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${head} ${hh}:${mm}`;
}
/** Minutes -> "28 分钟" / "7 小时 12 分". */
export function duration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} 分钟`;
  return m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m / 60} 小时`;
}
export function age(time: number | null | undefined, suffix = '更新') {
  if (time == null || time - Date.now() > DAILY_FUTURE_TOLERANCE_MS) return '更新时间未知';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return (
    (minutes < 1
      ? '刚刚'
      : minutes < 60
        ? `${minutes} 分钟前`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} 小时前`
          : `${Math.floor(minutes / 1440)} 天前`) + suffix
  );
}
export const useVehiclePresentation = defineStore('vehicle-presentation', () => {
  const session = useSessionStore();
  const now = ref(Date.now());
  const updateClock = () => {
    now.value = Date.now();
  };
  window.setInterval(updateClock, 1000);
  const online = ref(navigator.onLine);
  window.addEventListener('online', () => {
    online.value = true;
  });
  window.addEventListener('offline', () => {
    online.value = false;
  });
  const vehicle = computed(() =>
    session.state.preview ? demoVehicle : session.state.session?.vehicle,
  );
  const reading = computed(() => (session.state.preview ? demoSnapshot : session.state.reading));
  const daily = computed(() => reading.value?.daily);
  const fresh = computed(
    () =>
      daily.value?.reportState === 'fresh' &&
      daily.value.reportedAt != null &&
      now.value - daily.value.reportedAt <= DAILY_STALE_AFTER_MS,
  );
  const locked = computed(() => (fresh.value ? daily.value?.vehicleLocked : null));
  const lockText = computed(() =>
    locked.value === true ? '已锁车' : locked.value === false ? '未锁车' : '锁状态未知',
  );
  const stale = computed(() => !fresh.value);
  const charging = computed(() => reading.value?.charging === '充电中');
  const status = computed(() => {
    if (session.state.expired) return ['登录已过期', '', 'alert', 'danger'];
    if (!online.value) return ['网络不可用', '显示上次的数据', 'wifi-off', ''];
    if (reading.value?.online === false)
      return ['车辆离线', age(daily.value?.reportedAt), 'wifi-off', ''];
    if (stale.value)
      return [
        daily.value?.reportState === 'stale' ||
        (daily.value?.reportedAt != null &&
          now.value - daily.value.reportedAt > DAILY_STALE_AFTER_MS)
          ? age(daily.value.reportedAt, '').replace(/前$/, '前的数据')
          : '更新时间未知',
        '下拉刷新',
        'clock',
        'warning',
      ];
    if (charging.value)
      return [
        '正在充电',
        daily.value?.expectedFullText
          ? `约 ${daily.value.expectedFullText}充满`
          : age(daily.value?.reportedAt),
        'bolt',
        'energy',
      ];
    if (reading.value?.charging === '已充满')
      return ['已充满', age(daily.value?.reportedAt), 'bolt', 'energy'];
    return [
      lockText.value,
      age(daily.value?.reportedAt),
      locked.value === false ? 'unlock' : locked.value === true ? 'lock' : 'lockq',
      '',
    ];
  });
  return {
    online,
    vehicle,
    reading,
    daily,
    fresh,
    locked,
    lockText,
    stale,
    charging,
    status,
    updateClock,
  };
});
