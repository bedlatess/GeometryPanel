import { ApiError, CloudClient } from './client';
import { nativeBinding } from './native-materials';
import { object, validVehicleId, type Session } from '../core/model';

const APP = '/v1.0/app/cfmotoserverapp';
const text = (value: unknown, max = 256) => (typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) && String(value).length <= max ? String(value).trim() : '';
export interface WallpaperChoice { id: string; name: string }
export function wallpaperChoices(value: unknown): WallpaperChoice[] {
  const data = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).find(([key, row]) => ['list', 'records', 'rows', 'items', 'recordList', 'data'].includes(key) && Array.isArray(row))?.[1] : [];
  if (!Array.isArray(data)) throw new ApiError('format');
  return data.slice(0, 50).flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const id = text(row.id ?? row.wallpaperId ?? row.wallpaperID, 64);
    return validVehicleId(id) ? [{ id, name: text(row.wallpaperName ?? row.name ?? row.title, 80) || '壁纸模板' }] : [];
  });
}
export function wallpaperSpec(value: unknown) {
  const wrapped = object(value), detail = object(wrapped.wallpaper ?? wrapped.detail ?? wrapped);
  let zip = detail.wallpaperContentZip;
  if (typeof zip === 'string' && zip.length <= 16384) { try { zip = JSON.parse(zip); } catch { zip = null; } }
  if (Array.isArray(zip)) { if (zip.length !== 1) throw new ApiError('format'); zip = zip[0]; }
  const meta = zip && typeof zip === 'object' && !Array.isArray(zip) ? zip as Record<string, unknown> : {};
  const wallpaperNum = text(meta.wallpaperNum ?? detail.wallpaperNum ?? detail.wallpaperNo);
  const displayWallpaperSet = text(meta.displayWallpaperSet ?? detail.displayWallpaperSet, 2048);
  if (!wallpaperNum || !displayWallpaperSet) throw new ApiError('format');
  for (const [value, maximum] of [[meta.url ?? meta.fileUrl, 4096], [meta.fileName, 200], [meta.md5, 32]] as const) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > maximum)) throw new ApiError('format');
  }
  const rawUrl = text(meta.url ?? meta.fileUrl, 4096), fileName = text(meta.fileName, 200);
  const extra: { url?: string; fileName?: string; fileSize?: number; md5?: string } = {};
  if (rawUrl) {
    let url: URL; try { url = new URL(rawUrl); } catch { throw new ApiError('format'); }
    if (url.protocol !== 'https:' || !['oss-cfmoto-private.zeehoev.com', 'zeeho-user.oss-cn-hangzhou.aliyuncs.com'].includes(url.hostname)
      || url.username || url.password || url.hash || url.port && url.port !== '443' || !url.pathname.toLowerCase().endsWith('.zip')) throw new ApiError('format');
    extra.url = url.href;
  }
  if (fileName) { if (!/^[^/\\\u0000-\u001f\u007f]+\.zip$/i.test(fileName) || fileName === '.zip') throw new ApiError('format'); extra.fileName = fileName; }
  if (meta.fileSize !== undefined && meta.fileSize !== null) {
    if (typeof meta.fileSize !== 'number' && !(typeof meta.fileSize === 'string' && /^\d+$/.test(meta.fileSize))) throw new ApiError('format');
    const size = Number(meta.fileSize); if (!Number.isSafeInteger(size) || size <= 0 || size > 16 * 1024 * 1024) throw new ApiError('format'); extra.fileSize = size;
  }
  const md5 = text(meta.md5, 32); if (md5) { if (!/^[a-f0-9]{32}$/i.test(md5)) throw new ApiError('format'); extra.md5 = md5.toLowerCase(); }
  return { wallpaperNum, displayWallpaperSet, ...extra };
}
export class MeterApi {
  constructor(private readonly cloud = new CloudClient()) {}
  async wallpapers(session: Session, signal?: AbortSignal) {
    this.check(session);
    return wallpaperChoices(await this.cloud.request(`${APP}/vehicle/wallpaper/pageVehicleWallpaper`, { token: session.token, signal,
      query: { vinNo: session.vehicle.vin, pageNum: '1', pageSize: '50' } }));
  }
  async openContext(session: Session, wallpaperId: string | null, signal?: AbortSignal) {
    this.check(session);
    if (wallpaperId !== null && !validVehicleId(wallpaperId)) throw new ApiError('format');
    const home = object(await this.cloud.request(`${APP}/vehicleHomePageV2/${session.vehicle.vin}`, { token: session.token, signal }));
    signal?.throwIfAborted();
    const settings = object(await this.cloud.request(`${APP}/vehicleSet/vehicleSetInfo/${session.vehicle.vin}`, { token: session.token, signal }));
    signal?.throwIfAborted();
    const binding = nativeBinding(session, home, settings, Date.now(), false);
    const wifiAddress = typeof home.wifiAddress === 'string' && home.wifiAddress.length <= 4096 ? home.wifiAddress : '';
    if (home.mmiWifiIp != null && home.mmiWifiIp !== '' && home.mmiWifiIp !== '192.168.0.1') throw new ApiError('format');
    const size = (value: unknown) => {
      if (typeof value !== 'number' && typeof value !== 'string' || value === '') return null;
      const number = Number(value); return Number.isInteger(number) && number > 0 && number <= 8192 ? number : null;
    };
    const width = size(home.wallpaperResolutionWidth), height = size(home.wallpaperResolutionHeight);
    let spec = {};
    if (wallpaperId) spec = wallpaperSpec(await this.cloud.request(`${APP}/vehicle/wallpaper/vehicleWallpaperDetail/${wallpaperId}`, { token: session.token, signal, query: { vinNo: session.vehicle.vin } }));
    signal?.throwIfAborted();
    return { binding, params: { mode: wallpaperId ? 'wallpaper' : 'cast', wifiAddress, ...(width && height && width * height <= 16777216 ? { width, height } : {}), ...spec } };
  }
  private check(session: Session) {
    if (!session?.vehicle || !validVehicleId(session.vehicle.vin) || !session.token || !session.uid) throw new ApiError('format');
  }
}
