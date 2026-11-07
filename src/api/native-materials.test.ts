import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudClient } from './client';
import { nativeBinding, NativeMaterialsApi } from './native-materials';
import type { Session } from '../core/model';

const session: Session = { uid: 'synthetic-user', token: 'synthetic-token', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '测试车', plate: '', type: '' } };
const material = { key: '0123456789abcdef', encryptValue: 'ab'.repeat(64), iv: 'synthetic-iv' };
const home = () => ({ vinNo: session.vehicle.vin, bindingUserId: session.uid, sharedFlag: 0, bluetoothAddress: 'AA:BB:CC:DD:EE:01', inductiveUnlocking2: 1, encryptInfo: { ...material } });
test('native material parser narrows verified cloud data; account bearer token is never bridged', () => {
  const binding = nativeBinding(session, { ...home(), arbitrary: 'PRIVATE-NOT-NEEDED' }, { inductiveUnlocking2: '1' }, 1234);
  assert.equal(binding.fetchedAt, 1234); assert.equal(binding.inductiveGeneration, 2); assert.equal(binding.cloudEnabled, true);
  assert.equal(binding.ownerId, session.uid); assert.match(binding.credentialDigest, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(binding).includes(session.token)); assert.ok(!JSON.stringify(binding).includes('PRIVATE-NOT-NEEDED'));
});
test('material binding rejects missing/mismatched VIN, owner, shared vehicle and malformed key', () => {
  for (const patch of [{ vinNo: undefined }, { vinNo: 'OTHER' }, { vin: 'OTHER' }, { bindingUserId: 'other-user' }, { sharedFlag: 1 }, { sharedFlag: 'unknown' }, { encryptInfo: { ...material, key: 'short' } }, { encryptInfo: { ...material, encryptValue: '00' } }]) {
    assert.throws(() => nativeBinding(session, { ...home(), ...patch }, {}));
  }
  assert.throws(() => nativeBinding(session, home(), { vinNo: 'OTHER' }));
  assert.throws(() => nativeBinding(session, home(), { bindingUserId: 'OTHER' }));
});
test('material generation requires HMI MAC enable for 3.0, prioritizes settings cloud enable independently', () => {
  assert.equal(nativeBinding(session, { ...home(), inductiveUnlocking3Flag: true }, {}).inductiveGeneration, 2);
  const binding = nativeBinding(session, { ...home(), inductiveUnlocking3Flag: 1, bleStatusVO: { hmiBleMacEnable: 1 } }, { inductiveUnlocking2: false, inductiveUnlocking: true });
  assert.equal(binding.inductiveGeneration, 3); assert.equal(binding.cloudEnabled, false);
});
test('material cloud preparation is read-only and registration follows recovered exact body', async () => {
  const calls: { path: string; method: string; body: any }[] = [];
  const api = new NativeMaterialsApi(new CloudClient(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ code: 10000, data: path.includes('vehicleHomePage') ? home() : {} }));
  }));
  await api.prepare(session);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.method === 'GET'));
  await assert.rejects(api.register(session, '../bad'));
  assert.equal(calls.length, 2);
  await api.register(session, '0123456789abcdef');
  assert.ok(calls[2].path.endsWith('/app/inductiveUnlock/airLock/save'));
  assert.deepEqual(calls[2].body, { inductiveUnlockType: '2.0', openStatus: 1, uniqueIdentify: '0123456789abcdef', vinNo: session.vehicle.vin });
});
test('inductive switch uses recovered empty type/identity and requires post-write readback', async () => {
  const calls: any[] = [];
  const api = new NativeMaterialsApi(new CloudClient(async (input, init) => {
    const url = new URL(String(input)); calls.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ code: 10000, data: url.pathname.includes('vehicleHomePage') ? home() : url.pathname.includes('vehicleSetInfo') ? { inductiveUnlocking2: false } : null }));
  }));
  const result = await api.configureInductive(session, true);
  assert.deepEqual(calls[2].body, { inductiveUnlockType: '', openStatus: 1, uniqueIdentify: '', vinNo: session.vehicle.vin });
  assert.ok(calls[2].path.endsWith('/airLock/setting'));
  assert.ok(calls[3].path.includes('/vehicleSetInfo/'));
  assert.deepEqual(result, { current: false, confirmed: false });
});
