import { ApiError } from '../api/client';
import { dailySnapshot, type DailyDetails } from './daily-model';

export interface Vehicle { vin: string; name: string; type: string; plate: string }
export interface Session { token: string; uid: string; vehicle: Vehicle }
export interface VehicleList {
  vehicles: Vehicle[]; receivedCount: number; unrecognizedCount: number;
}
export interface Snapshot {
  soc: number | null; range: number | null; voltage: number | null;
  online: boolean | null; charging: string; receivedAt: number; partial: boolean;
  daily: DailyDetails;
}
// vinNo is a cloud vehicle identifier, also used for frame numbers. An ISO VIN
// length/character check here silently hid vehicles that the account API returned.
// Restrict it to a bounded, single URL segment without guessing or changing its case.
export const validVehicleId = (value: string) => /^[A-Za-z0-9_-]{1,64}$/.test(value);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('format');
  return value as Record<string, unknown>;
}
export function vehicleList(value: unknown): VehicleList {
  if (!Array.isArray(value)) throw new ApiError('format');
  const vehicles: Vehicle[] = [];
  let unrecognizedCount = 0;
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { unrecognizedCount++; continue; }
    const vin = typeof row.vinNo === 'string' ? row.vinNo.trim() : '';
    if (!validVehicleId(vin)) { unrecognizedCount++; continue; }
    vehicles.push({ vin, name: String(row.vehicleName || '我的极核'),
      type: String(row.vehicleType || ''), plate: String(row.licensePlate || '') });
  }
  return { vehicles, receivedCount: value.length, unrecognizedCount };
}
export function snapshot(home: Record<string, unknown>, battery: Record<string, unknown> | null): Snapshot {
  const numeric = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : null;
  };
  const soc = (data: Record<string, unknown> | null): number | null => {
    const value = numeric(data?.bmssoc);
    return value !== null && value <= 100 ? Math.round(value) : null;
  };
  const state = String(battery?.chargeState ?? home.chargeState ?? '');
  const online = String(home.onlineStatus ?? '').toLowerCase();
  return {
    // The recovered homepage owns remaining range; battery_info has no range
    // contract. An incidental battery field must not overwrite the vehicle report.
    soc: soc(battery) ?? soc(home), range: numeric(home.hmiRidableMile),
    voltage: numeric(battery?.voltage) ?? numeric(battery?.bmsVoltage) ?? numeric(home.voltage) ?? numeric(home.bmsVoltage),
    online: ['online', '1', 'true'].includes(online) ? true : ['offline', '0', 'false'].includes(online) ? false : null,
    charging: String(battery?.chargeStateStr ?? '').includes('充满') ? '已充满' : state === '1' ? '充电中' : state === '0' ? '未充电' : '充电状态未知',
    receivedAt: Date.now(), partial: battery === null, daily: dailySnapshot(home, battery),
  };
}
export const demoVehicle: Vehicle = { vin: 'LAAAAAAAAAAAAAAA1', name: '我的极核', type: '演示车辆', plate: '' };
export const demoSnapshot: Snapshot = {
  soc: 82, range: 91, voltage: 76.4, online: true, charging: '未充电', receivedAt: 0, partial: false,
  daily: dailySnapshot({
    totalRideMile: 2580, rideMileageMonth: 186, ridingTimeMonthUnitMinute: 420, avgVelocityMonth: 26.6,
    headLockState: 1, seatLockState: 1, rideState: '演示车辆已停放', refreshTime: new Date().toISOString(),
    location: { longitude: 116.397, latitude: 39.908, coordinateSystem: 'gcj02', locationTime: new Date().toISOString() },
    address: '演示位置 · 示例数据',
  }, { batteryTemp: 28, soh: 98, chargeCount: 42, current: 0, power: 0, refreshTime: new Date().toISOString() }),
};
