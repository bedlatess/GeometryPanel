import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, vehicles } from './model';

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
test('vehicle bindings are derived only from well formed returned VINs', () => {
  const rows = vehicles([{ vinNo: '../../other-car', vehicleName: 'bad' }, { vinNo: 'LAAAAAAAAAAAAAAA1', vehicleName: '车 A' }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, '车 A');
});
