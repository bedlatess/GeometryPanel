import type { DailyDetails } from './daily-model';

export function navigationLinks(location: DailyDetails['location']): { map: string; walk: string | null } | null {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
    || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180
    || location.latitude === 0 && location.longitude === 0 || location.coordinateSystem === 'unknown') return null;
  const position = `${location.longitude.toFixed(6)},${location.latitude.toFixed(6)}`;
  const marker = new URL('https://uri.amap.com/marker');
  marker.search = new URLSearchParams({ position, name: '车辆位置', src: 'GeometryPanel',
    coordinate: location.coordinateSystem === 'wgs84' ? 'wgs84' : 'gaode', callnative: '0' }).toString();
  // AMap's marker URI documents both CRSs. Its route URI expects map coordinates;
  // keep explicit WGS84 points in the marker page, whose own UI offers directions.
  const route = new URL('https://uri.amap.com/navigation');
  route.search = new URLSearchParams({ to: `${position},车辆位置`, mode: 'walk', src: 'GeometryPanel', callnative: '0' }).toString();
  return { map: marker.href, walk: location.coordinateSystem === 'gcj02' ? route.href : null };
}
