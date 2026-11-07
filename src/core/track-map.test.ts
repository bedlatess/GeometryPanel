import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roadTrack } from './track-map';
import { trajectory, vehicleSettings } from './extensions-model';

test('road map projection fits the route and tiles in one GCJ-02 viewport without filling gaps', () => {
  const map = roadTrack(trajectory('120,30&120.001,30.003&bad&120.005,30.006'))!;
  assert.equal(map.path.split('M').length - 1, 2);
  assert.ok(map.start.x >= 0 && map.start.x <= 640 && map.end.y >= 0 && map.end.y <= 360);
  assert.ok(map.tiles.length <= 12 && map.tiles.length > 0);
  for (const tile of map.tiles) {
    const url = new URL(tile.url);
    assert.match(url.hostname, /^webrd0[1-4]\.is\.autonavi\.com$/); assert.equal(url.searchParams.get('style'), '8');
    assert.equal(Number(url.searchParams.get('z')), map.zoom);
    assert.ok(tile.x < 640 && tile.x > -256 && tile.y < 360 && tile.y > -256);
  }
  assert.equal(roadTrack([]), null);
  assert.equal(roadTrack([{ latitude: NaN, longitude: 120, breakBefore: true }]), null);
});
test('seat generation, RCW exclusion, read-only speeds and complex choices follow recovered conditions', () => {
  const caps = [{ functionCode: 'E_CUSHION_SENSOR', isSupport: true }, { functionCode: 'RADAR_RCW', isSupport: true }, { functionCode: 'CUSTOM_KEY_SET', isSupport: true }];
  const info = { cushionSensor: 1, ecushionSensor: 0, radarRcw: 1, customButtonSingle: 31, maximumSpeedLimit: 45, topSpeed: 80, customButtonLongPress: 3 };
  assert.equal(vehicleSettings(caps, info).some(row => row.key === 'ecushionSensor'), false);
  const rows = vehicleSettings(caps, { ...info, rideFunctionVOList: [{ parentCode: 'E_CUSHION_SENSOR', functionCode: '2.0' }] });
  assert.equal(rows.some(row => row.key === 'cushionSensor'), false);
  assert.equal(rows.find(row => row.key === 'ecushionSensor')?.writable, true);
  assert.deepEqual(rows.find(row => row.key === 'customButtonSingle')?.choices?.map(([value]) => value), ['31', '1', '19', '3']);
  assert.equal(rows.find(row => row.key === 'maximumSpeedLimit')?.writable, false);
  assert.equal(rows.find(row => row.key === 'customButtonLongPress')?.writable, false);
  assert.equal(vehicleSettings(caps, info, 'AE5').some(row => row.key === 'radarRcw'), false);
});
