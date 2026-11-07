import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSession, changeAccountPreferences, emptyAccounts, nativeAccounts, rememberAccount, removeAccount, validateAccounts } from './accounts';
import type { Session } from './model';
const a: Session = { uid: 'synthetic-user-a', token: 'synthetic-token-a', vehicle: { vin: 'CAR_A', name: '合成车 A', type: 'AE8', plate: '' } };
const b: Session = { uid: 'synthetic-user-b', token: 'synthetic-token-b', vehicle: { vin: 'CAR_B', name: '合成车 B', type: 'AE6', plate: '' } };
let serial = 0; const makeId = () => `local-${++serial}`;
test('accounts retain distinct credentials and stable opaque vehicle identities', () => {
  const first = rememberAccount(emptyAccounts(), a, undefined, makeId);
  const second = rememberAccount(first, b, undefined, makeId);
  assert.equal(second.accounts.length, 2); assert.deepEqual(accountSession(second), b);
  assert.deepEqual(accountSession(second, first.selectedVehicleId), a);
  assert.equal(JSON.stringify(second.accounts.map(x => [x.id, x.vehicles.map(y => y.id)])).includes('CAR_'), false);
});
test('token renewal invalidates account epoch without changing shortcuts identities', () => {
  const first = rememberAccount(emptyAccounts(), a, undefined, makeId);
  const next = rememberAccount(first, { ...a, token: 'synthetic-new-token' }, undefined, makeId);
  assert.equal(next.accounts[0].epoch, 1); assert.equal(next.accounts[0].id, first.accounts[0].id);
  assert.equal(next.selectedVehicleId, first.selectedVehicleId); assert.equal(first.accounts[0].token, a.token);
});

test('ordinary session saves preserve paused background participation and discard unknown fields', () => {
  const first = rememberAccount(emptyAccounts(), a, undefined, makeId);
  first.accounts[0].enabled = false;
  const next = rememberAccount(first, a, undefined, makeId);
  assert.equal(next.accounts[0].enabled, false);
  assert.equal(rememberAccount(next, { ...a, token: 'renewed' }, undefined, makeId).accounts[0].enabled, true);
  const extra = structuredClone(next) as any; extra.accounts[0].unknown = 'discard-me'; extra.accounts[0].vehicles[0].unknown = 'discard-me';
  assert.equal(JSON.stringify(nativeAccounts(extra)).includes('discard-me'), false);
});

test('a delayed label edit preserves an expired account state and other newly saved accounts', () => {
  const before = rememberAccount(emptyAccounts(), a, undefined, makeId), desired = structuredClone(before);
  desired.accounts[0].label = '新名称';
  const current = rememberAccount(before, b, undefined, makeId); current.accounts[0].enabled = false; current.accounts[0].epoch++;
  const result = changeAccountPreferences(current, before, desired);
  assert.equal(result.accounts.length, 2); assert.equal(result.accounts[0].label, '新名称');
  assert.equal(result.accounts[0].enabled, false); assert.equal(result.accounts[0].epoch, 1);
  assert.throws(() => changeAccountPreferences(rememberAccount(current, { ...a, token: 'renewed' }, undefined, makeId), before, desired));
});
test('fresh vehicle list replaces stale cars but single session update retains other cars', () => {
  const first = rememberAccount(emptyAccounts(), a, [a.vehicle, b.vehicle], makeId);
  assert.equal(rememberAccount(first, a, undefined, makeId).accounts[0].vehicles.length, 2);
  assert.equal(rememberAccount(first, a, [a.vehicle], makeId).accounts[0].vehicles.length, 1);
});
test('account deletion selects a remaining car and empty book has no session', () => {
  const first = rememberAccount(rememberAccount(emptyAccounts(), a, undefined, makeId), b, undefined, makeId);
  const remaining = removeAccount(first, first.accounts[1].id);
  assert.deepEqual(accountSession(remaining), a);
  assert.equal(accountSession(removeAccount(remaining, remaining.accounts[0].id)), null);
});
test('account validator refuses duplicate ids, invalid selection and credential/control characters', () => {
  const book = rememberAccount(emptyAccounts(), a, undefined, makeId);
  assert.throws(() => validateAccounts({ ...book, selectedVehicleId: 'missing' }));
  assert.throws(() => validateAccounts({ ...book, accounts: [...book.accounts, book.accounts[0]] }));
  assert.throws(() => validateAccounts({ ...book, accounts: [{ ...book.accounts[0], token: 'bad token' }] }));
  assert.throws(() => validateAccounts({ ...book, accounts: [{ ...book.accounts[0], epoch: -1 }] }));
  assert.equal(nativeAccounts(book).accounts[0].vehicles[0].label, a.vehicle.name);
});
