import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationLinks } from './navigation';
import { dailySnapshot } from './daily-model';

test('navigation uses a fixed HTTPS origin, longitude before latitude, and the documented coordinate flag', () => {
  const location = { latitude: 39.908, longitude: 116.397, altitudeM: null,
    coordinateSystem: 'gcj02' as const, coordinateSystemSource: 'reported' as const,
    reportedAt: null, reportState: 'unknown' as const, address: '合成位置' };
  const result = navigationLinks(location)!;
  const marker = new URL(result.map), walk = new URL(result.walk!);
  assert.equal(marker.origin, 'https://uri.amap.com');
  assert.equal(marker.pathname, '/marker');
  assert.equal(marker.searchParams.get('position'), '116.397000,39.908000');
  assert.equal(marker.searchParams.get('coordinate'), 'gaode');
  assert.equal(marker.searchParams.get('callnative'), '0');
  assert.equal(walk.searchParams.get('mode'), 'walk');
  assert.equal(walk.searchParams.get('to'), '116.397000,39.908000,车辆位置');
  const wgs = navigationLinks({ ...location, coordinateSystem: 'wgs84' })!;
  assert.equal(new URL(wgs.map).searchParams.get('coordinate'), 'wgs84');
  assert.equal(wgs.walk, null);
  assert.equal(navigationLinks({ ...location, coordinateSystem: 'unknown' }), null);
  assert.equal(navigationLinks({ ...location, latitude: NaN }), null);
  assert.equal(navigationLinks({ ...location, longitude: 181 }), null);
  assert.equal(navigationLinks({ ...location, longitude: 0, latitude: 0 }), null);
  assert.equal(navigationLinks(dailySnapshot({}, null).location), null);
});
