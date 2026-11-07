import type { Vehicle } from '../core/model';
import { storagePrefix } from '../core/scope';
import silhouette from '../../public/art/generic-scooter.svg?raw';
import { html } from './kit';
const key = storagePrefix + 'vehicle-art';
const cacheName = storagePrefix + 'vehicle-art-v1';
const safe = (value: unknown): value is string => typeof value === 'string' && (/^https:\/\/[^\s<>"'@]+$/.test(value) || /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
type Sources = { local?: string; main?: string; thumb?: string };
function saved(): Record<string, Sources> { try { const data: unknown = JSON.parse(localStorage.getItem(key) ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, Sources> : {}; } catch { return {}; } }
export function rememberVehicleArt(cars: Vehicle[]) {
  const values = saved();
  for (const car of cars) values[car.vin] = { local: values[car.vin]?.local, ...(safe(car.vehiclePicUrl) ? { main: car.vehiclePicUrl } : {}), ...(safe(car.vehicleScalePicUrl) ? { thumb: car.vehicleScalePicUrl } : {}) };
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-8)))); } catch { }
}
export function vehicleArt(car?: Vehicle, thumbnail = false, demo = false) {
  const record = !demo && car ? saved()[car.vin] : undefined;
  const sources = demo ? [] : [record?.local, thumbnail ? car?.vehicleScalePicUrl ?? record?.thumb : undefined, car?.vehiclePicUrl ?? record?.main].filter(safe);
  return `<span class="vehicle-art" aria-hidden="true">${silhouette}${sources.length ? `<img data-art-sources="${html(JSON.stringify([...new Set(sources)]))}" alt="" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}
const resolved = new Map<string, string>(), pending = new Map<string, Promise<string>>();
async function load(url: string) {
  if (resolved.has(url)) return resolved.get(url)!;
  if (pending.has(url)) return pending.get(url)!;
  const work = (async () => {
    let source = url;
    try { const cache = await caches.open(cacheName), hit = await cache.match(url); if (hit && hit.type !== 'opaque') source = URL.createObjectURL(await hit.blob()); } catch { }
    await new Promise<void>((resolve, reject) => { const test = new Image(); test.referrerPolicy = 'no-referrer'; test.onload = () => resolve(); test.onerror = reject; test.src = source; });
    resolved.set(url, source);
    if (source === url && url.startsWith('https:')) void (async () => {
      try {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return;
        const cache = await caches.open(cacheName); await cache.put(url, response);
        const keys = await cache.keys(); for (const old of keys.slice(0, Math.max(0, keys.length - 8))) await cache.delete(old);
      } catch { }
    })();
    return source;
  })();
  pending.set(url, work);
  try { return await work; } finally { pending.delete(url); }
}
export function mountVehicleArt(host: HTMLElement) {
  for (const image of host.querySelectorAll<HTMLImageElement>('img[data-art-sources]:not([data-art-started])')) {
    image.dataset.artStarted = 'true';
    void (async () => {
      const sources: string[] = JSON.parse(image.dataset.artSources!);
      for (const source of sources) {
        try { const url = await load(source); if (!image.isConnected) return; image.onload = () => image.parentElement?.classList.add('art-loaded'); image.src = url; return; } catch { }
      }
      image.remove();
    })();
  }
}
