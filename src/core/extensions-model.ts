import { ApiError } from '../api/client';
import { dailySnapshot } from './daily-model';

const obj = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown): string => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
export const extensionNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const positive = (value: unknown): number | null => { const n = extensionNumber(value); return n !== null && n >= 0 ? n : null; };
const flag = (value: unknown): boolean | null => value === true || value === 1 || value === '1' || value === 'true' ? true
  : value === false || value === 0 || value === '0' || value === 'false' ? false : null;
const root = (value: unknown) => { const result = obj(value); if (!result) throw new ApiError('format'); return result; };
const rows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) throw new ApiError('format');
  return value.slice(0, 500).map(obj).filter((row): row is Record<string, unknown> => row !== null);
};
const time = (value: unknown) => dailySnapshot({ refreshTime: value }, null).reportedAt;
export function validMonth(value: string): boolean { return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value); }
export function validDay(value: string): boolean {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export const chinaDay = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

export interface RideDay { date: string; day: string | null; mileageKm: number | null; minutes: number | null; maxSpeedKmh: number | null }
export interface RideMonth { totalMileageKm: number | null; days: RideDay[] }
export function rideMonth(value: unknown): RideMonth {
  const raw = root(value);
  return { totalMileageKm: positive(raw.rideMileageTotal), days: rows(raw.rideRecordList).map(row => {
    const date = str(row.date), day = date.replaceAll('.', '-');
    return { date, day: validDay(day) ? day : null, mileageKm: positive(row.rideMileage), minutes: positive(row.ridingTimeDayUnitMinute), maxSpeedKmh: positive(row.maxSpeed) };
  }).sort((a, b) => b.date.localeCompare(a.date)) };
}
export interface TrackPoint { longitude: number; latitude: number; breakBefore: boolean }
export interface RideTrack { id: string; day: string; start: string; end: string; mileageKm: number | null; minutes: number | null; maxSpeedKmh: number | null; from: string; to: string; points: TrackPoint[] }
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string' || value.length > 50_000) return {};
  try { return obj(JSON.parse(value)) ?? {}; } catch { return {}; }
};
const address = (value: unknown) => { const raw = jsonObject(value); return str(raw.name) || str(raw.address); };
export function trajectory(value: unknown): TrackPoint[] {
  if (typeof value !== 'string') return [];
  const result: TrackPoint[] = [];
  let gap = true;
  for (const row of value.split('&').slice(0, 20_000)) {
    const [x, y] = row.split(','), longitude = extensionNumber(x), latitude = extensionNumber(y);
    if (longitude === null || latitude === null || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || longitude === 0 && latitude === 0) { gap = true; continue; }
    result.push({ longitude, latitude, breakBefore: gap }); gap = false;
  }
  return result;
}
export function rideTracks(value: unknown): { tracks: RideTrack[]; receivedCount: number } {
  const grouped = rows(value), all: Record<string, unknown>[] = [];
  for (const group of grouped) all.push(...rows(group.historyList));
  const tracks = all.slice(0, 200).map(row => ({
    id: str(row.rideId), day: str(row.dayTime), start: str(row.startTime), end: str(row.endTime),
    mileageKm: positive(row.rideMileage), minutes: positive(row.ridingTimeUnitMinute), maxSpeedKmh: positive(row.maxSpeed),
    from: address(row.startAddr), to: address(row.endAddr), points: trajectory(row.trajectory),
  })).sort((a, b) => b.start.localeCompare(a.start));
  return { tracks, receivedCount: all.length };
}
/** Local route shape only; no road attribution or inferred missing segments. */
export function trackPath(points: TrackPoint[]): { path: string; start: string; end: string } | null {
  if (!points.length) return null;
  const projected = points.map(p => ({ x: p.longitude, y: -Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, p.latitude)) * Math.PI / 360)) * 180 / Math.PI, gap: p.breakBefore }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of projected) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const scale = Math.min(280 / Math.max(maxX - minX, 0.00001), 160 / Math.max(maxY - minY, 0.00001));
  const coords = projected.map(p => `${(160 + (p.x - (minX + maxX) / 2) * scale).toFixed(2)},${(100 + (p.y - (minY + maxY) / 2) * scale).toFixed(2)}`);
  return { path: coords.map((p, i) => `${i === 0 || projected[i].gap ? 'M' : 'L'}${p}`).join(' '), start: coords[0], end: coords[coords.length - 1] };
}
export interface TireReading { position: '前轮' | '后轮'; pressureBar: number | null; temperatureC: number | null; warningCode: number | null; reportedAt: number | null }
export function tireReadings(value: unknown): { updatedAt: number | null; wheels: TireReading[] } {
  const raw = root(value), wheels = new Map<number, TireReading>();
  for (const row of rows(raw.realTimeData)) {
    const position = extensionNumber(row.sensorPosition);
    if (position !== 1 && position !== 2) continue;
    const reportedAt = time(row.reportTime), old = wheels.get(position);
    if (old?.reportedAt !== null && old?.reportedAt !== undefined && (reportedAt === null || old.reportedAt > reportedAt)) continue;
    const temp = extensionNumber(row.tireTemp), warning = positive(row.warningType);
    wheels.set(position, { position: position === 1 ? '前轮' : '后轮', pressureBar: positive(row.tirePressure),
      temperatureC: temp !== null && temp >= -100 && temp <= 200 ? temp : null,
      warningCode: warning !== null && Number.isInteger(warning) ? warning : null, reportedAt });
  }
  return { updatedAt: time(raw.updateTime), wheels: [...wheels.entries()].sort(([a], [b]) => a - b).map(([, row]) => row) };
}
export interface VehicleAlert { id: string; vin: string; title: string; time: string; unread: boolean | null; detail: string; address: string }
export function vehicleAlerts(value: unknown, vin: string): { alerts: VehicleAlert[]; accountUnread: number | null; receivedCount: number } {
  const raw = root(value), all = rows(raw.messageVOList);
  const alerts = all.map(row => {
    const extra = jsonObject(row.extra), car = typeof extra.carInfo === 'string' ? jsonObject(extra.carInfo) : obj(extra.carInfo);
    const place = jsonObject(extra.address);
    return { id: str(row.messageId), vin: str(row.vinNo) || str(extra.vinNo) || str(car?.vinNo), title: str(row.content) || '车辆消息',
      time: str(row.messageTime) || str(row.messageTimeStr), unread: str(row.unread) === '0' ? true : str(row.unread) === '1' ? false : null,
      detail: str(extra.detail), address: str(place.address) || str(extra.address) };
  }).filter(row => !row.vin || row.vin === vin);
  return { alerts, accountUnread: positive(raw.noRead), receivedCount: all.length };
}

export interface SettingDefinition { key: string; title: string; capability?: string; command?: string; version?: string; endpoint?: 'property' | 'sound' | 'moto' | 'lowpower'; choices?: ReadonlyArray<readonly [string, string]>; guarded?: boolean }
const binary = [['0', '关闭'], ['1', '开启']] as const;
const def = (key: string, title: string, capability: string, command: string, choices: SettingDefinition['choices'] = binary, version = 'v2'): SettingDefinition => ({ key, title, capability, command, choices, version, endpoint: 'property' });
export const settingDefinitions: readonly SettingDefinition[] = [
  def('precisionEndurance', '精准续航', 'PRECISION_ENDURANCE', '55', binary, ''),
  def('extendedRange', '低电量长续航', 'LOW_BATTERY_LONG_RANGE', '72', binary, ''),
  def('kineticEnergyRecovery', '动能回收', 'KINETIC_ENERGY_RECOVERY', '62', [['0', '关闭'], ['1', '标准'], ['2', '增强']]),
  def('cruiseControlHold', '动态定速巡航', 'CRUISE_CONTROL_HOLD', '64'),
  def('barkePower', '电子制动', 'BRAKE_POWER', '57'),
  def('etcsTractionControl', 'eTCS 牵引力控制', 'E_TCS_TRACTION_CONTROL', '59'),
  def('radarBsd', 'BSD 盲区监测', 'RADAR_BLIND_MONITOR', '81', [['0', '关闭'], ['1', '标准'], ['2', '灵敏']]),
  def('automaticParking', '自动驻车', 'AUTOMATIC_PARKING_GO', '51'),
  def('inducedVibration', '震动防盗报警', 'INDUCED_VIBRATION_GO', '61', [['0', '微弱'], ['1', '标准'], ['2', '灵敏'], ['3', '关闭']]),
  def('passwordUnlocking', '密码解锁', 'PASSWORD_UNLOCKING', '74'),
  def('originNfc', 'NFC 卡片钥匙', 'CUSTOM_NFC', '90'),
  def('emergencyBrakeFlash', '紧急制动提示', 'EMERGENCY_BRAKE_FLASH', '107'),
  def('automaticShutdown', '离车关机', 'AUTO_SHUTDOWN_TIME_GO', '32'),
  def('automaticShutdownSwitch', '超时关机保护', 'AUTOMATIC_SHUTDOWN_TIMEOUT', '103'),
  def('edgeSupportSensing', '边撑感应', 'EDGE_SUPPORT_SENSING', '73'),
  def('comeHomeWithYou', '伴我回家', 'COME_HOME_WITH_YOU', '56'),
  { key: 'motoPlay', title: '车机投屏开关', capability: 'MOTOPLAY', endpoint: 'moto', choices: binary },
  { key: 'mileageUnit', title: '车机里程单位', command: '2', version: 'v2', endpoint: 'property', choices: [['1', '公制'], ['2', '英制']] },
  { key: 'temperatureUnit', title: '车机温度单位', command: '3', version: 'v2', endpoint: 'property', choices: [['1', '摄氏度'], ['2', '华氏度']] },
  { key: 'timeFormat', title: '车机时间格式', command: '5', version: 'v2', endpoint: 'property', choices: [['1', '12 小时制'], ['2', '24 小时制']] },
  { key: 'soundEffectSetting.soundSize', title: '车机音量', endpoint: 'sound', choices: Array.from({ length: 11 }, (_, i) => [String(i * 10), String(i * 10)] as const) },
  { key: 'comeHomeWithYouTime', title: '伴我回家时长', command: '58', version: 'v2', endpoint: 'property', choices: [3, 10, 30, 60, 120, 180].map(n => [String(n), `${n} 秒`] as const) },
  { key: 'automaticShutdownTimeout', title: '超时关机时间', command: '108', version: 'v2', endpoint: 'property', choices: [5, 10, 20, 30, 60].map(n => [String(n), `${n} 分钟`] as const) },
  { ...def('inductiveDistance', '感应解锁距离', '', '54', [['1', '更近'], ['3', '默认'], ['5', '更远']]), guarded: true },
  { ...def('leaveOffTime', '离车关机时长', '', '33', [3, 5, 10, 30, 60, 120, 180].map(n => [String(n), `${n} 秒`] as const)), guarded: true },
  { ...def('radarRcw', 'RCW 后碰撞预警', 'RADAR_RCW', '82', [['0', '关闭'], ['1', '标准'], ['2', '灵敏']]), guarded: true },
  { ...def('cushionSensor', '座垫感应 1.0', 'E_CUSHION_SENSOR', '66'), guarded: true },
  { ...def('ecushionSensor', '电子座垫感应 2.0', 'E_CUSHION_SENSOR', '66'), guarded: true },
  { ...def('customButtonSingle', '自定义按键 · 单击', 'CUSTOM_KEY_SET', '142', [['31', '无操作'], ['1', 'Hello 音效'], ['19', '陡坡缓降设置'], ['3', '解锁座垫']]), guarded: true },
  { key: 'lowPower', title: '车辆低电量提醒', capability: 'LOW_BATTERY_WARN', endpoint: 'lowpower', guarded: true, choices: [10, 15, 20, 25, 30, 35, 40, 45, 50].map(n => [String(n), `${n}%`] as const) },
];
export interface VehicleSetting { key: string; title: string; value: string | null; display: string; writable: boolean; reason: string; choices: SettingDefinition['choices'] }
const nested = (raw: Record<string, unknown>, key: string): unknown => key.split('.').reduce<unknown>((v, part) => obj(v)?.[part], raw);
export function vehicleSettings(capabilities: unknown, info: unknown, vehicleType = ''): VehicleSetting[] {
  const caps = rows(capabilities), raw = root(info), disabled = Array.isArray(raw.disabledContent) ? rows(raw.disabledContent) : [];
  const result: VehicleSetting[] = [];
  const inductive2 = flag(raw.inductiveUnlocking2), inductive1 = flag(raw.inductiveUnlocking);
  const inductive = inductive2 ?? inductive1;
  if (inductive !== null || caps.some(row => row.functionCode === 'INDUCTIVE_UNLOCKING_2')) {
    const blocked = disabled.find(row => /^inductiveUnlocking(?:2)?(?:_|$)/.test(str(row.functionName)));
    const reason = blocked ? str(blocked.content) || '车辆当前条件不允许修改' : inductive === null ? '当前云端值未知，暂不可修改' : '';
    result.push({ key: 'cloudInductiveEnabled', title: '车辆感应钥匙开关', value: inductive === null ? null : inductive ? '1' : '0',
      display: inductive === null ? '未知' : inductive ? '开启' : '关闭', writable: !reason, reason, choices: binary });
  }
  for (const definition of settingDefinitions) {
    const seat2 = Array.isArray(raw.rideFunctionVOList) && rows(raw.rideFunctionVOList).some(row => row.parentCode === 'E_CUSHION_SENSOR' && row.functionCode === '2.0');
    if (definition.key === 'ecushionSensor' && !seat2 || definition.key === 'cushionSensor' && seat2) continue;
    let capability = definition.capability ? caps.find(row => row.functionCode === definition.capability) : undefined;
    if (definition.key === 'radarRcw') {
      const blind = caps.find(row => row.functionCode === 'RADAR_BLIND_MONITOR');
      const inherited = flag(blind?.isSupport) === true && Array.isArray(blind?.blueToothServiceCodeList)
        && rows(blind.blueToothServiceCodeList).some(row => row.functionName === 'RADAR_RCW' && row.isSupportSetting !== false);
      if (vehicleType.trim().toUpperCase() === 'AE5' || flag(capability?.isSupport) === false || flag(capability?.isSupport) !== true && !inherited) continue;
      capability ??= blind;
    }
    const received = nested(raw, definition.key), current = typeof received === 'boolean' ? received ? '1' : '0' : str(received);
    if (!capability && !current) continue;
    const value = definition.choices?.some(([n]) => n === current) ? current : null;
    const blocked = disabled.find(row => str(row.functionName).split('_')[0] === definition.key.split('.')[0]);
    const services = Array.isArray(capability?.blueToothServiceCodeList) ? rows(capability.blueToothServiceCodeList) : [];
    const bleOnly = services.length > 0 && !services.some(row => { const code = positive(row.serviceCode); return code !== null && ((code >>> 24) & 255) === 16; });
    const reason = flag(capability?.isSupport) === false ? '当前车型不支持' : blocked ? str(blocked.content) || '车辆当前条件不允许修改' : bleOnly ? '此项只提供手机直连能力，网页暂不可改' : value === null ? '当前值未识别，暂不可修改' : '';
    result.push({ key: definition.key, title: definition.title, value, display: definition.choices?.find(([n]) => n === current)?.[1] ?? (current || '未知'), writable: !reason && !!definition.endpoint, reason, choices: definition.choices });
  }
  const readOnly = [
    ['themeName','仪表主题',''],['language','语言',''],['soundEffectStatus','节日音效',''],
    ['withdrawalStartTime','撤防开始时间',''],['withdrawalEndTime','撤防结束时间',''],
    ['ecoMaxSpeed','节能档极速','km/h'],['streetMaxSpeed','街道档极速','km/h'],['sportMaxSpeed','运动档极速','km/h'],
    ['powerMode','驾驶模式',''],['energyRecoveryEco','节能档动能回收',''],['energyRecoverySport','运动档动能回收',''],['energyRecoveryStreet','街道档动能回收',''],
    ['steepSlopeDescent','陡坡缓降',''],['easyReadyGo','简易骑行',''],['radarFcw','前碰撞预警',''],
    ['maximumSpeedLimit', '最高车速限制', 'km/h'], ['maximumSpeed', '限速档', ''], ['topSpeed', '整车上限', 'km/h'],
    ['customButtonLongPress', '自定义按键 · 长按', ''], ['customButtonLeft', '自定义按键 · 左键', ''],
    ['customButtonRight', '自定义按键 · 右键', ''], ['customButtonCombination', '自定义按键 · 组合键', ''],
  ];
  for (const [key, title, unit] of readOnly) {
    const value = str(raw[key]);
    if (!value || key === 'radarFcw' && caps.some(c => c.functionCode === 'RADAR_ASSISTED_FCW' && (c.isSupport === true || c.isSupport === 1 || c.isSupport === '1'))) continue;
    const display = key === 'radarFcw' ? ({'1':'关闭','2':'标准','4':'灵敏'} as Record<string,string>)[value] ?? '—' : `${value}${unit ? ` ${unit}` : ''}`;
    result.push({ key, title, value, display, writable: false,
      reason: key.startsWith('customButton') ? '当前不可修改' : '当前不可修改', choices: undefined });
  }
  const nestedReadOnly:[string,string,string][]=[
    ['lightEffectSetting','chargingDynamicEffect','充电灯效'],['lightEffectSetting','cyclingDynamicEffect','骑行灯效'],['lightEffectSetting','parkingDynamicEffect','停车灯效'],
    ['lightEffectSetting','lowBeamLight','近光灯'],['lightEffectSetting','positionLight','位置灯'],['lightEffectSetting','pixelLight','像素灯'],['lightEffectSetting','projectionLight','投影灯'],['lightEffectSetting','longDistanceLighting','远光灯'],
    ['drivingRecorderSetting','privacyMode','记录仪隐私'],['drivingRecorderSetting','resolution','记录仪分辨率'],['drivingRecorderSetting','sentryMode','哨兵模式'],['drivingRecorderSetting','impactSnapshot','碰撞抓拍'],['drivingRecorderSetting','videoWatermark','视频水印'],
  ];
  for(const [key,field,title]of nestedReadOnly){const v=obj(raw[key])?.[field];if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')continue;const value=String(v);result.push({key:key+'.'+field,title,value,display:value,writable:false,reason:'',choices:undefined});}
  for (const capability of caps) {
    const code = str(capability.functionCode);
    if (!code || ['AUTOMATIC_LOCK','RADAR_ASSISTED_FCW','PASSWORD_UNLOCKING'].includes(code) || code === 'INDUCTIVE_UNLOCKING_2' || settingDefinitions.some(definition => definition.capability === code)) continue;
    result.push({ key: code, title: str(capability.functionName) || '其他功能', value: null, display: flag(capability.isSupport) === false ? '不支持' : '—', writable: false, reason: '当前不可修改', choices: undefined });
  }
  return result;
}
