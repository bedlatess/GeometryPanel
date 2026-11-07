import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySnapshot, DAILY_FUTURE_TOLERANCE_MS, DAILY_STALE_AFTER_MS } from './daily-model';

const now = Date.parse('2026-11-07T04:00:00Z');

test('daily fields use recovered raw names and battery-specific readings take precedence', () => {
  const result = dailySnapshot({
    totalRideMile: '1234.5', rideMileageMonth: '67.8', ridingTimeMonthUnitMinute: '90', avgVelocityMonth: '32.4',
    current: '2', batteryPower: '150', batteryTemp: '21', refreshTime: '2026-11-07 11:59:00',
  }, { current: '-3.2', power: '-240', batteryTemp: '-5', soh: '96.5', chargeCount: '42', refreshTime: now }, now);
  assert.equal(result.totalMileageKm, 1234.5);
  assert.equal(result.monthMileageKm, 67.8);
  assert.equal(result.monthRideMinutes, 90);
  assert.equal(result.monthAverageSpeedKmh, 32.4);
  assert.equal(result.currentA, -3.2);
  assert.equal(result.powerW, -240);
  assert.equal(result.temperatureC, -5);
  assert.equal(result.healthPercent, 96.5);
  assert.equal(result.chargeCount, 42);
  assert.equal(result.receivedAt, now);
  assert.equal(result.reportedAt, now - 60_000);
  assert.equal(result.batteryReportedAt, now);
});

test('unknown fields stay unknown rather than becoming zero or false', () => {
  const result = dailySnapshot({}, null, now);
  for (const field of ['totalMileageKm', 'monthMileageKm', 'monthRideMinutes', 'monthAverageSpeedKmh', 'currentA', 'powerW', 'temperatureC', 'healthPercent', 'chargeCount', 'headLocked', 'seatLocked', 'vehicleLocked', 'rideState', 'chargeElapsedText', 'chargeElapsedMinutes', 'expectedFullText', 'reportedAt', 'batteryReportedAt', 'location'] as const) {
    assert.equal(result[field], null, field);
  }
  assert.deepEqual(result.capabilities, { networkUnlock: null, unlock: null, search: null, seatOpen: null, storageOpen: null });
  assert.equal(result.reportState, 'unknown');
  assert.equal(result.batteryReportState, 'unknown');
});

test('malformed numbers never coerce arrays, objects, booleans, blanks or infinity to readings', () => {
  for (const value of [null, undefined, '', ' ', true, false, [], [12], {}, '12km', '0x10', Infinity, NaN, '1e309']) {
    const result = dailySnapshot({ totalRideMile: value, current: value, batteryPower: value, batteryTemp: value }, { soh: value, chargeCount: value }, now);
    assert.equal(result.totalMileageKm, null, String(value));
    assert.equal(result.currentA, null, String(value));
    assert.equal(result.powerW, null, String(value));
    assert.equal(result.temperatureC, null, String(value));
    assert.equal(result.healthPercent, null, String(value));
    assert.equal(result.chargeCount, null, String(value));
  }
});

test('valid zeros survive and out-of-range battery readings do not hide home temperature', () => {
  const result = dailySnapshot({ totalRideMile: 0, rideMileageMonth: '0', batteryTemp: 0 }, { current: 0, power: '0', batteryTemp: 255, soh: 0, chargeCount: 0 }, now);
  assert.equal(result.totalMileageKm, 0);
  assert.equal(result.monthMileageKm, 0);
  assert.equal(result.currentA, 0);
  assert.equal(result.powerW, 0);
  assert.equal(result.temperatureC, 0);
  assert.equal(result.healthPercent, 0);
  assert.equal(result.chargeCount, 0);
  assert.equal(dailySnapshot({}, { soh: 101, chargeCount: 1.5 }, now).healthPercent, null);
  assert.equal(dailySnapshot({}, { soh: 101, chargeCount: 1.5 }, now).chargeCount, null);
  assert.equal(dailySnapshot({ totalRideMile: -1, batteryTemp: -101 }, null, now).totalMileageKm, null);
});

test('electrical fallback derives only from the same response and preserves reported readings', () => {
  assert.equal(dailySnapshot({}, { voltage: 75, power: 255 }, now).currentA, 3.4);
  assert.equal(dailySnapshot({}, { voltage: ' ', bmsVoltage: 75, current: -2 }, now).powerW, -150);
  const result = dailySnapshot({ voltage: 75, current: 2 }, { power: 300 }, now);
  assert.equal(result.powerW, 300);
  assert.equal(result.currentA, 2);
  // A battery power reading is never divided by a home voltage from another report.
  assert.equal(dailySnapshot({ voltage: 75 }, { power: 300 }, now).currentA, null);
  assert.equal(dailySnapshot({}, { voltage: 0, power: 300 }, now).currentA, null);
  assert.equal(dailySnapshot({}, { voltage: 75, current: 2, power: 0 }, now).powerW, 0);
  assert.equal(dailySnapshot({}, { voltage: 75, current: 2, power: 300 }, now).currentA, 2);
});

test('battery outage retains home electrical readings without inventing battery health', () => {
  const result = dailySnapshot({ voltage: 72, current: -2, batteryTemp: 18, soh: 99, chargeCount: 7 }, null, now);
  assert.equal(result.currentA, -2);
  assert.equal(result.powerW, -144);
  assert.equal(result.temperatureC, 18);
  assert.equal(result.healthPercent, null);
  assert.equal(result.chargeCount, null);
});

test('explicit support flags differ from unknown; opening capability is separate from lock state', () => {
  const result = dailySnapshot({
    supportNetworkUnlock: false, supportUnlock: 'no', loudlySearchCar: ' YES ', openCushionFlag: '0', openStorageBoxFlag: 1,
    headLockState: '1', seatLockState: 'false', rideState: 0,
    iotProperties: [null, { identify: 'VehicleLock_S', value: '0' }, { identify: 'VehicleLock_S', value: '1' }],
  }, null, now);
  assert.deepEqual(result.capabilities, { networkUnlock: false, unlock: false, search: null, seatOpen: false, storageOpen: true });
  assert.equal(result.headLocked, true);
  assert.equal(result.seatLocked, false);
  assert.equal(result.vehicleLocked, true);
  assert.equal(result.rideState, '0');
  const unknown = dailySnapshot({ headLockState: '2', seatLockState: '', supportUnlock: 'unsupported', iotProperties: {} }, null, now);
  assert.equal(unknown.headLocked, null);
  assert.equal(unknown.seatLocked, null);
  assert.equal(unknown.vehicleLocked, null);
  assert.equal(unknown.capabilities.unlock, null);
});

test('a horn-setting switch never disables the already supported ordinary search command', () => {
  for (const value of [false, '0', true, '1', null]) {
    assert.equal(dailySnapshot({ loudlySearchCar: value }, null, now).capabilities.search, null);
  }
});

test('elapsed charging duration and expected completion text are not remaining minutes', () => {
  const result = dailySnapshot({ chargeTimeString: '1h 65min', expectFullTimeDescribe: '预计 14:30 充满', fullChargeTime: 9000 }, null, now);
  assert.equal(result.chargeElapsedMinutes, 125);
  assert.equal(result.chargeElapsedText, '2 小时 5 分钟');
  assert.equal(result.expectedFullText, '预计 14:30 充满');
  assert.equal(dailySnapshot({ chargeTimeString: '0min' }, null, now).chargeElapsedMinutes, 0);
  assert.equal(dailySnapshot({ chargeTimeString: '0min' }, null, now).chargeElapsedText, '0 分钟');
  assert.equal(dailySnapshot({ chargeTimeString: '约半小时' }, null, now).chargeElapsedMinutes, null);
  assert.equal(dailySnapshot({ chargeTimeString: '约半小时' }, null, now).chargeElapsedText, '约半小时');
  for (const value of ['', '-', '0.0', null]) assert.equal(dailySnapshot({ chargeTimeString: value }, null, now).chargeElapsedText, null);
});

test('reported times support seconds, milliseconds, China dates and explicit ISO zones', () => {
  for (const value of [now, String(now), now / 1000, String(now / 1000), '2026-11-07 12:00:00', '2026.11.7 12:00', '2026年11月7日 12:00', '2026-11-07T12:00:00+08:00', '2026-11-07T12:00:00+0800', '2026-11-07T04:00:00Z']) {
    const result = dailySnapshot({ refreshTime: value }, null, now);
    assert.equal(result.reportedAt, now, String(value));
    assert.equal(result.reportState, 'fresh');
  }
});

test('invalid, ambiguous and impossible dates remain unknown on every browser', () => {
  for (const value of [0, true, {}, '', '2026-02-30 12:00', '2026-13-01 12:00', '2026-11-07 24:00', '2026-11-07 12:99', '2026-11-07 12:00:60', '2026-11-07T12:00:00+25:00', '11/7 12:00', '2026-11-07', '2026-11-07 garbage', Infinity]) {
    const result = dailySnapshot({ refreshTime: value }, null, now);
    assert.equal(result.reportedAt, null, String(value));
    assert.equal(result.reportState, 'unknown');
  }
});

test('age is based on device reports, with separate stale, future and ingestion times', () => {
  const result = dailySnapshot({ refreshTime: now - DAILY_STALE_AFTER_MS - 1 }, { refreshTime: now + DAILY_FUTURE_TOLERANCE_MS + 1 }, now);
  assert.equal(result.reportState, 'stale');
  assert.equal(result.batteryReportState, 'future');
  assert.equal(result.receivedAt, now);
  assert.equal(dailySnapshot({ refreshTime: now - DAILY_STALE_AFTER_MS }, null, now).reportState, 'fresh');
  assert.equal(dailySnapshot({ refreshTime: now + DAILY_FUTURE_TOLERANCE_MS }, null, now).reportState, 'fresh');
});

test('location uses nested raw coordinates, report time and address priority', () => {
  const result = dailySnapshot({ address: '合成停车点 A', location: { longitude: '121.5', latitude: '31.2', altitude: '-3', coordinateSystem: 'GCJ-02', locationTime: now - DAILY_STALE_AFTER_MS - 1, address: '合成停车点 B' } }, null, now);
  assert.deepEqual(result.location, {
    longitude: 121.5, latitude: 31.2, altitudeM: -3, coordinateSystem: 'gcj02', coordinateSystemSource: 'reported',
    reportedAt: now - DAILY_STALE_AFTER_MS - 1, reportState: 'stale', address: '合成停车点 A',
  });
  assert.equal(dailySnapshot({ location: { longitude: 0, latitude: 31.2, addressName: '合成停车点 C', coordinateSystem: 'WGS_84' } }, null, now).location?.address, '合成停车点 C');
  assert.equal(dailySnapshot({ location: { longitude: 0, latitude: 31.2, coordinateSystem: 'WGS_84' } }, null, now).location?.coordinateSystem, 'wgs84');
});

test('opaque vehicle CRS tags follow the recovered GCJ-02 contract, without guessing vendor enum mappings', () => {
  for (const value of [undefined, null, '', ' ', 0, 1, 2, '0', '1', '2', 'unknown', 'unsupported', '-', true, {}]) {
    const location = dailySnapshot({ location: { longitude: 121, latitude: 31, coordinateSystem: value } }, null, now).location;
    assert.equal(location?.coordinateSystem, 'gcj02');
    assert.equal(location?.coordinateSystemSource, 'legacy-default');
  }
  for (const value of ['bd09', 'BD-09', 'BD09LL', '百度坐标', 'EPSG:3857']) {
    const location = dailySnapshot({ location: { longitude: 121, latitude: 31, coordinateSystem: value } }, null, now).location;
    assert.equal(location?.coordinateSystem, 'unknown');
    assert.equal(location?.coordinateSystemSource, 'unknown');
  }
  for (const value of ['GCJ-02', 'gcj02', 'gaode', 'AMap', '高德坐标']) {
    const location = dailySnapshot({ location: { longitude: 121, latitude: 31, coordinateSystem: value } }, null, now).location;
    assert.equal(location?.coordinateSystem, 'gcj02');
    assert.equal(location?.coordinateSystemSource, 'reported');
  }
  for (const value of ['WGS-84', 'WGS_1984', 'EPSG:4326', 'GPS']) {
    const location = dailySnapshot({ location: { longitude: 121, latitude: 31, coordinateSystem: value } }, null, now).location;
    assert.equal(location?.coordinateSystem, 'wgs84');
    assert.equal(location?.coordinateSystemSource, 'reported');
  }
});

test('invalid positions are unavailable and zero in a single axis remains valid', () => {
  for (const location of [null, [], {}, { longitude: 0, latitude: 0 }, { longitude: 181, latitude: 31 }, { longitude: 121, latitude: -91 }, { longitude: '', latitude: 31 }, { longitude: true, latitude: 31 }, { longitude: Infinity, latitude: 31 }]) {
    assert.equal(dailySnapshot({ location }, null, now).location, null);
  }
  assert.equal(dailySnapshot({ location: { longitude: 0, latitude: 30 } }, null, now).location?.longitude, 0);
  assert.equal(dailySnapshot({ location: { longitude: 120, latitude: 0 } }, null, now).location?.latitude, 0);
});
