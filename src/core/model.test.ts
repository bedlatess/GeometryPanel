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
test('battery values take precedence and null charge state uses home fallback', () => {
  const data = snapshot({ bmssoc: 80, chargeState: 1, hmiRidableMile: 50 }, { bmssoc: '81.6', chargeState: null, hmiRidableMile: 91 });
  assert.equal(data.soc, 82); assert.equal(data.range, 91); assert.equal(data.charging, '充电中');
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
