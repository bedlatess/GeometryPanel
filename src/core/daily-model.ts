/** Device report age, independent of when this browser received a response. */
export const DAILY_STALE_AFTER_MS = 30 * 60_000;
export const DAILY_FUTURE_TOLERANCE_MS = 5 * 60_000;

export type ReportState = 'fresh' | 'stale' | 'future' | 'unknown';
export type CoordinateSystem = 'gcj02' | 'wgs84' | 'unknown';
export interface DailyLocation {
  latitude: number;
  longitude: number;
  altitudeM: number | null;
  coordinateSystem: CoordinateSystem;
  coordinateSystemSource: 'reported' | 'legacy-default' | 'unknown';
  reportedAt: number | null;
  reportState: ReportState;
  address: string | null;
}
export interface DailyDetails {
  totalMileageKm: number | null;
  monthMileageKm: number | null;
  monthRideMinutes: number | null;
  monthAverageSpeedKmh: number | null;
  currentA: number | null;
  powerW: number | null;
  temperatureC: number | null;
  healthPercent: number | null;
  chargeCount: number | null;
  headLocked: boolean | null;
  seatLocked: boolean | null;
  vehicleLocked: boolean | null;
  rideState: string | null;
  chargeElapsedText: string | null;
  chargeElapsedMinutes: number | null;
  expectedFullText: string | null;
  /** Response ingestion time. It must never be presented as a device report. */
  receivedAt: number;
  reportedAt: number | null;
  reportState: ReportState;
  batteryReportedAt: number | null;
  batteryReportState: ReportState;
  location: DailyLocation | null;
  capabilities: {
    networkUnlock: boolean | null;
    unlock: boolean | null;
    search: boolean | null;
    seatOpen: boolean | null;
    storageOpen: boolean | null;
  };
}

const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const nonnegative = (value: unknown): number | null => {
  const result = numeric(value);
  return result !== null && result >= 0 ? result : null;
};
const text = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const result = String(value).trim();
  return result && !['-', '--', 'null', 'undefined'].includes(result.toLowerCase()) ? result : null;
};
const flag = (value: unknown): boolean | null => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== 'string') return null;
  const result = value.trim().toLowerCase();
  if (['1', 'true', 'y', 'yes'].includes(result)) return true;
  if (['0', 'false', 'n', 'no'].includes(result)) return false;
  return null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

// The cloud's unqualified dates are China standard time. Parsing them explicitly
// also avoids Safari's implementation-dependent parsing of "YYYY-MM-DD HH:mm".
function reportedTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const input = String(value).trim();
  if (/^(?:\d{10}|\d{12,13})$/.test(input)) {
    const time = Number(input) * (input.length === 10 ? 1000 : 1);
    return time >= Date.UTC(2000, 0, 1) && Number.isFinite(time) ? time : null;
  }
  const parts = input.match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!parts) return null;
  const [, y, m, d, h, min, sec = '0', fraction = '', zone] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const hour = Number(h), minute = Number(min), second = Number(sec);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const milliseconds = Number(fraction.padEnd(3, '0'));
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const calendar = new Date(utc);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  let offsetMinutes = 8 * 60;
  if (zone?.toUpperCase() === 'Z') offsetMinutes = 0;
  else if (zone) {
    const digits = zone.replace(':', '');
    const offsetHour = Number(digits.slice(1, 3)), offsetMinute = Number(digits.slice(3, 5));
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMinutes = (digits[0] === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }
  return utc - offsetMinutes * 60_000;
}

function reportState(time: number | null, now: number): ReportState {
  if (time === null) return 'unknown';
  if (time - now > DAILY_FUTURE_TOLERANCE_MS) return 'future';
  return now - time > DAILY_STALE_AFTER_MS ? 'stale' : 'fresh';
}

function locationFrom(home: Record<string, unknown>, now: number): DailyLocation | null {
  const raw = record(home.location);
  if (!raw) return null;
  const longitude = numeric(raw.longitude), latitude = numeric(raw.latitude);
  if (longitude === null || latitude === null || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || longitude === 0 && latitude === 0) return null;
  const omittedCrs = raw.coordinateSystem === null || raw.coordinateSystem === undefined || typeof raw.coordinateSystem === 'string' && !raw.coordinateSystem.trim();
  const crs = text(raw.coordinateSystem);
  const key = crs?.toLowerCase().replace(/[-_\s]/g, '');
  // Every recovered map pipeline accepts GCJ-02 as its input contract. Keep that
  // compatibility default only when the server omits CRS; never override a label.
  const coordinateSystem: CoordinateSystem = omittedCrs || key === 'gcj02' ? 'gcj02' : key === 'wgs84' ? 'wgs84' : 'unknown';
  const reportedAt = reportedTime(raw.locationTime);
  return {
    longitude, latitude, altitudeM: numeric(raw.altitude), coordinateSystem,
    coordinateSystemSource: omittedCrs ? 'legacy-default' : coordinateSystem === 'unknown' ? 'unknown' : 'reported',
    reportedAt, reportState: reportState(reportedAt, now),
    address: text(home.address) ?? text(raw.address) ?? text(raw.addressName),
  };
}

function electrical(raw: Record<string, unknown>, powerField: string): { current: number | null; power: number | null } {
  const voltage = nonnegative(raw.voltage) ?? nonnegative(raw.bmsVoltage);
  const current = numeric(raw.current), power = numeric(raw[powerField]);
  const product = voltage !== null && current !== null ? voltage * current : null;
  const quotient = voltage !== null && voltage > 0 && power !== null ? power / voltage : null;
  return {
    current: current ?? (quotient !== null && Number.isFinite(quotient) ? Number(quotient.toFixed(1)) : null),
    power: power ?? (product !== null && Number.isFinite(product) ? Math.round(product) : null),
  };
}

function elapsed(value: unknown): { text: string | null; minutes: number | null } {
  const raw = text(value);
  if (raw === null || raw === '0.0') return { text: null, minutes: null };
  const match = raw.match(/^(?:(\d+)\s*h)?\s*(\d+)\s*min$/i);
  if (!match) return { text: raw, minutes: null };
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(minutes)) return { text: null, minutes: null };
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return { text: [hours ? `${hours} 小时` : '', remainder || !hours ? `${remainder} 分钟` : ''].filter(Boolean).join(' '), minutes };
}

export function dailySnapshot(home: Record<string, unknown>, battery: Record<string, unknown> | null, now = Date.now()): DailyDetails {
  const receivedAt = Number.isFinite(now) ? now : Date.now();
  const homeElectrical = electrical(home, 'batteryPower');
  const batteryElectrical = electrical(battery ?? {}, 'power');
  const reportedAt = reportedTime(home.refreshTime), batteryReportedAt = reportedTime(battery?.refreshTime);
  const temperature = (value: unknown) => {
    const result = numeric(value);
    return result !== null && result >= -100 && result <= 200 ? result : null;
  };
  const health = nonnegative(battery?.soh);
  const charges = nonnegative(battery?.chargeCount);
  const vehicleLock = Array.isArray(home.iotProperties)
    ? home.iotProperties.map(record).reverse().find(item => item?.identify === 'VehicleLock_S')
    : undefined;
  const chargeElapsed = elapsed(home.chargeTimeString);
  return {
    totalMileageKm: nonnegative(home.totalRideMile),
    monthMileageKm: nonnegative(home.rideMileageMonth),
    monthRideMinutes: nonnegative(home.ridingTimeMonthUnitMinute),
    monthAverageSpeedKmh: nonnegative(home.avgVelocityMonth),
    currentA: batteryElectrical.current ?? homeElectrical.current,
    powerW: batteryElectrical.power ?? homeElectrical.power,
    temperatureC: temperature(battery?.batteryTemp) ?? temperature(home.batteryTemp),
    healthPercent: health !== null && health <= 100 ? health : null,
    chargeCount: charges !== null && Number.isSafeInteger(charges) ? charges : null,
    headLocked: flag(home.headLockState), seatLocked: flag(home.seatLockState),
    vehicleLocked: flag(vehicleLock?.value), rideState: text(home.rideState),
    chargeElapsedText: chargeElapsed.text, chargeElapsedMinutes: chargeElapsed.minutes,
    expectedFullText: text(home.expectFullTimeDescribe),
    receivedAt, reportedAt, reportState: reportState(reportedAt, receivedAt),
    batteryReportedAt, batteryReportState: reportState(batteryReportedAt, receivedAt),
    location: locationFrom(home, receivedAt),
    capabilities: {
      networkUnlock: flag(home.supportNetworkUnlock), unlock: flag(home.supportUnlock),
      // loudlySearchCar is a current horn-setting switch, not a support flag.
      search: null, seatOpen: flag(home.openCushionFlag), storageOpen: flag(home.openStorageBoxFlag),
    },
  };
}
