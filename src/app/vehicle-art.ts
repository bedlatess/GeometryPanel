import type { Vehicle } from '../core/model';
import { storagePrefix } from '../core/scope';

const key = storagePrefix + 'vehicle-art';
const cacheName = storagePrefix + 'vehicle-art-v1';
const safe = (value: unknown): value is string =>
  typeof value === 'string' &&
  (/^https:\/\/[^\s<>"'@]+$/.test(value) ||
    /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
type Sources = { local?: string; main?: string; thumb?: string };
export function vehicleImageSources(car?: Vehicle, thumbnail = false): string[] {
  const record = car ? saved()[car.vin] : undefined;
  return [
    record?.local,
    thumbnail ? (car?.vehicleScalePicUrl ?? record?.thumb) : undefined,
    car?.vehiclePicUrl ?? record?.main,
  ].filter(safe);
}
function saved(): Record<string, Sources> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, Sources>)
      : {};
  } catch {
    return {};
  }
}
export function rememberVehicleArt(cars: Vehicle[]) {
  const values = saved();
  for (const car of cars)
    values[car.vin] = {
      local: values[car.vin]?.local,
      ...(safe(car.vehiclePicUrl) ? { main: car.vehiclePicUrl } : {}),
      ...(safe(car.vehicleScalePicUrl) ? { thumb: car.vehicleScalePicUrl } : {}),
    };
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-8))));
  } catch {}
}
