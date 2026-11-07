import type { TrackPoint } from './extensions-model';

/** GCJ-02 positions use the same projection and road tiles as the recovered app. */
export function roadTrack(points: TrackPoint[]) {
  if (!points.length || points.length > 20_000 || points.some(p => !Number.isFinite(p.longitude) || !Number.isFinite(p.latitude) || Math.abs(p.longitude) > 180 || Math.abs(p.latitude) > 90)) return null;
  const width = 640, height = 360;
  const world = points.map(p => ({ x: (p.longitude + 180) / 360,
    y: (1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-85.0511, Math.min(85.0511, p.latitude)) * Math.PI / 360)) / Math.PI) / 2, gap: p.breakBefore }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of world) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const scale = Math.min((width - 80) / Math.max(maxX - minX, 1e-12), (height - 80) / Math.max(maxY - minY, 1e-12));
  const zoom = Math.max(0, Math.min(16, Math.floor(Math.log2(scale / 256)))), count = 2 ** zoom, pixels = 256 * count;
  const left = (minX + maxX) / 2 * pixels - width / 2, top = (minY + maxY) / 2 * pixels - height / 2;
  const coords = world.map(p => ({ x: p.x * pixels - left, y: p.y * pixels - top }));
  const tiles: { url: string; x: number; y: number }[] = [];
  for (let x = Math.floor(left / 256); x < Math.ceil((left + width) / 256); x++) {
    for (let y = Math.floor(top / 256); y < Math.ceil((top + height) / 256); y++) {
      if (y < 0 || y >= count) continue;
      const wrappedX = (x % count + count) % count;
      tiles.push({ x: x * 256 - left, y: y * 256 - top,
        url: `https://webrd0${1 + (wrappedX + y) % 4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${wrappedX}&y=${y}&z=${zoom}` });
    }
  }
  const pair = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  return { width, height, zoom, tiles, path: coords.map((p, i) => `${i === 0 || world[i].gap ? 'M' : 'L'}${pair(p)}`).join(' '), start: coords[0], end: coords[coords.length - 1] };
}
