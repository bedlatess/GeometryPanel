import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, vehicleList, validVehicleId } from './model';

test('missing fields and blank numeric strings remain unknown', () => {
  const data = snapshot({ bmssoc: ' ', onlineStatus: 'unrecognized' }, null);
  assert.equal(data.soc, null); assert.equal(data.range, null); assert.equal(data.online, null);
  assert.equal(data.charging, '充电状态未知');
});
test('invalid battery SOC does not erase a valid home SOC', () => {
  const data = snapshot({ bmssoc: '80' }, { bmssoc: 101, voltage: '76.4' });
  assert.equal(data.soc, 80); assert.equal(data.voltage, 76.4);
});
test('battery SOC takes precedence, range uses home, and null charge state uses home fallback', () => {
  const data = snapshot({ bmssoc: 80, chargeState: 1, hmiRidableMile: 50 }, { bmssoc: '81.6', chargeState: null, hmiRidableMile: 91 });
  assert.equal(data.soc, 82); assert.equal(data.range, 50); assert.equal(data.charging, '充电中');
});

test('remaining range follows the homepage contract despite incidental battery values', () => {
  for (const batteryRange of [0, '0', 91, [], [0], {}, '', null, undefined]) {
    const data = snapshot({ hmiRidableMile: '64.5' }, { hmiRidableMile: batteryRange });
    assert.equal(data.range, 64.5);
  }
  // No recovered battery range contract exists, so missing home range is unknown.
  assert.equal(snapshot({}, { hmiRidableMile: 91 }).range, null);
  assert.equal(snapshot({ hmiRidableMile: 64.5 }, null).range, 64.5);
});

test('a real zero range from the homepage stays zero rather than using a fallback estimate', () => {
  for (const range of [0, '0', '0.0']) {
    assert.equal(snapshot({ hmiRidableMile: range }, { hmiRidableMile: 91 }).range, 0);
  }
});

test('malformed numeric shapes cannot become zero readings or hide valid home SOC and voltage', () => {
  for (const value of [null, undefined, '', ' ', [], [0], ['64'], {}, new Number(0), true, false, NaN, Infinity, -1, '0x10', '64km']) {
    const data = snapshot({ hmiRidableMile: value, bmssoc: 80, voltage: 76.4 }, { bmssoc: value, voltage: value, bmsVoltage: value });
    assert.equal(data.range, null, String(value));
    assert.equal(data.soc, 80, String(value));
    assert.equal(data.voltage, 76.4, String(value));
  }
});

test('valid battery SOC and voltage retain their established precedence, including zero', () => {
  const data = snapshot({ bmssoc: 80, voltage: 76.4 }, { bmssoc: '81.6', voltage: '', bmsVoltage: '77.2' });
  assert.equal(data.soc, 82);
  assert.equal(data.voltage, 77.2);
  const zero = snapshot({ bmssoc: 80, voltage: 76.4 }, { bmssoc: 0, voltage: 0 });
  assert.equal(zero.soc, 0);
  assert.equal(zero.voltage, 0);
});
test('vehicle identifiers are not restricted to 17 character ISO VINs', () => {
  const result = vehicleList([
    { vinNo: '123456789012345', vehicleName: '15 位车架号' },
    { vinNo: 'LAAAAAAAAAAAAAAA1', vehicleName: '17 位 VIN' },
    { vinNo: '  lqqqiiii000000001  ', vehicleName: '保持接口返回的大小写' },
  ]);
  assert.deepEqual(result.vehicles.map(car => car.vin), ['123456789012345', 'LAAAAAAAAAAAAAAA1', 'lqqqiiii000000001']);
  assert.equal(result.receivedCount, 3); assert.equal(result.unrecognizedCount, 0);
});
test('unrecognized records remain distinguishable from an empty account list', () => {
  assert.deepEqual(vehicleList([]), { vehicles: [], receivedCount: 0, unrecognizedCount: 0 });
  assert.deepEqual(vehicleList([{ vinNo: '' }]), { vehicles: [], receivedCount: 1, unrecognizedCount: 1 });
  assert.throws(() => vehicleList({ data: [] }));
});
test('unsafe and missing identifiers are counted without hiding valid vehicles', () => {
  const result = vehicleList([null, { vinNo: '../../other-car' }, { vinNo: 123456789012345 }, { vinNo: 'LAAAAAAAAAAAAAAA1', vehicleName: '车 A' }]);
  assert.equal(result.vehicles.length, 1); assert.equal(result.vehicles[0].name, '车 A');
  assert.equal(result.receivedCount, 4); assert.equal(result.unrecognizedCount, 3);
});
test('cloud identifiers must fit a bounded single URL segment', () => {
  for (const id of ['', '../car', 'car/other', 'car?token=x', 'car%2fother', '车架号', 'a'.repeat(65)]) assert.equal(validVehicleId(id), false);
  assert.equal(validVehicleId('legacy_vehicle-123'), true);
});
