import { ApiError } from '../api/client';

export interface Vehicle { vin: string; name: string; type: string; plate: string }
export interface Session { token: string; uid: string; vehicle: Vehicle }
export interface Snapshot {
  soc: number | null; range: number | null; voltage: number | null;
  online: boolean | null; charging: string; receivedAt: number; partial: boolean;
}
export const validVin = (value: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(value);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('format');
  return value as Record<string, unknown>;
}
export function vehicles(value: unknown): Vehicle[] {
  if (!Array.isArray(value)) throw new ApiError('format');
  return value.map(object).filter(row => validVin(String(row.vinNo ?? ''))).map(row => ({
    vin: String(row.vinNo), name: String(row.vehicleName || '我的极核'),
    type: String(row.vehicleType || ''), plate: String(row.licensePlate || ''),
  }));
}
export function snapshot(home: Record<string, unknown>, battery: Record<string, unknown> | null): Snapshot {
  const numeric = (value: unknown): number | null => {
    if (value === null || value === undefined || typeof value === 'string' && !value.trim() || typeof value === 'boolean') return null;
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
    soc: soc(battery) ?? soc(home), range: numeric(battery?.hmiRidableMile) ?? numeric(home.hmiRidableMile),
    voltage: numeric(battery?.voltage) ?? numeric(battery?.bmsVoltage) ?? numeric(home.voltage) ?? numeric(home.bmsVoltage),
    online: ['online', '1', 'true'].includes(online) ? true : ['offline', '0', 'false'].includes(online) ? false : null,
    charging: String(battery?.chargeStateStr ?? '').includes('充满') ? '已充满' : state === '1' ? '充电中' : state === '0' ? '未充电' : '充电状态未知',
    receivedAt: Date.now(), partial: battery === null,
  };
}
export const demoVehicle: Vehicle = { vin: 'LAAAAAAAAAAAAAAA1', name: '我的极核', type: '演示车辆', plate: '' };
export const demoSnapshot: Snapshot = { soc: 82, range: 91, voltage: 76.4, online: true, charging: '未充电', receivedAt: 0, partial: false };
