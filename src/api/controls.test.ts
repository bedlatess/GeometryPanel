import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError, CloudClient } from './client';
import { VehicleControls, type VehicleAction } from './controls';
import { createUnlockSecret } from './legacy-unlock';
import type { Session } from '../core/model';
import type { CommandStep } from '../core/command-report';

const contract = JSON.parse(readFileSync(new URL('../../docs/dev/verification/recovered-controls-contract.json', import.meta.url), 'utf8'));
const fixture: Session = { token: 'synthetic-token', uid: 'synthetic-user', vehicle: { vin: contract.syntheticVin, name: '测试车', type: '', plate: '' } };
const reply = (data: unknown, status = 200, code = 10000) => new Response(JSON.stringify({ code, data }), { status });

test('browser-compatible encryption matches independent Python ECB vectors and full-block padding', async () => {
  let aligned = false;
  for (const vector of contract.encryption.vectors) {
    assert.equal(await createUnlockSecret(vector.lockFlag, vector.vin), vector.secret);
    assert.equal(vector.plaintext, JSON.stringify({ lockFlag: vector.lockFlag, vinNo: vector.vin }));
    if (new TextEncoder().encode(vector.plaintext).length % 16 === 0) {
      aligned = true;
      assert.equal(atob(vector.secret).length, new TextEncoder().encode(vector.plaintext).length + 16);
    }
  }
  assert.equal(aligned, true);
});

for (const action of ['powerOn', 'powerOff', 'seat'] as VehicleAction[]) {
  test(`${action} sends every recovered request once, in order, with the selected account binding`, async () => {
    const calls: unknown[] = [], progress: CommandStep[] = [];
    const api = new VehicleControls(new CloudClient(async (url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-token');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      calls.push({ method: init?.method, path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
      return reply(null);
    }));
    await api.execute(fixture, action, undefined, step => progress.push(step));
    assert.deepEqual(calls, contract.actions[action]);
    assert.deepEqual(progress.map(step => step.state), calls.flatMap(() => ['sending', 'accepted']));
  });
}

for (const [action, failAt] of [['powerOn', 1], ['powerOn', 2], ['powerOff', 1], ['powerOff', 2], ['seat', 1]] as const) {
  test(`${action} stops on a negative data result at step ${failAt} despite code 10000`, async () => {
    let calls = 0; const progress: CommandStep[] = [];
    const api = new VehicleControls(new CloudClient(async () => reply(++calls === failAt ? false : null)));
    await assert.rejects(api.execute(fixture, action, undefined, step => progress.push(step)),
      (error: unknown) => error instanceof ApiError && error.kind === 'rejected');
    assert.equal(calls, failAt);
    assert.equal(progress.at(-1)?.state, 'failed');
    assert.equal(progress.at(-1)?.businessCode, '10000');
  });
}

for (const [action, failAt] of [['powerOn', 1], ['powerOff', 2], ['seat', 1]] as const) {
  test(`${action} network failure at step ${failAt} never retries or falls back`, async () => {
    let calls = 0;
    const api = new VehicleControls(new CloudClient(async () => {
      if (++calls === failAt) throw new TypeError('synthetic-private-value');
      return reply(null);
    }));
    await assert.rejects(api.execute(fixture, action), (error: unknown) => error instanceof ApiError && error.kind === 'network');
    assert.equal(calls, failAt);
  });
}

test('expired second-step credentials are propagated with no later request', async () => {
  let calls = 0;
  const api = new VehicleControls(new CloudClient(async () => ++calls === 1 ? reply(null) : new Response('', { status: 401 })));
  await assert.rejects(api.execute(fixture, 'powerOn'), (error: unknown) => error instanceof ApiError && error.kind === 'expired');
  assert.equal(calls, 2);
});

test('cancelling before control begins sends no command', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const api = new VehicleControls(new CloudClient(async () => { calls++; return reply(null); }));
  await assert.rejects(api.execute(fixture, 'powerOn', controller.signal));
  assert.equal(calls, 0);
});

test('cancelling after preparation stops before encryption and second dispatch', async () => {
  const controller = new AbortController(); let calls = 0;
  const api = new VehicleControls(new CloudClient(async () => { calls++; return reply(null); }));
  await assert.rejects(api.execute(fixture, 'powerOff', controller.signal, step => {
    if (step.stage === 'prepare' && step.state === 'accepted') controller.abort();
  }));
  assert.equal(calls, 1);
});

test('cancelling while the second step returns cannot report late success', async () => {
  const controller = new AbortController(); let calls = 0; const progress: CommandStep[] = [];
  const api = new VehicleControls(new CloudClient(async () => {
    if (++calls === 2) controller.abort();
    return reply(null);
  }));
  await assert.rejects(api.execute(fixture, 'powerOn', controller.signal, step => progress.push(step)));
  assert.equal(calls, 2);
  assert.equal(progress.at(-1)?.state, 'cancelled');
  assert.equal(progress.some(step => step.stage === 'control' && step.state === 'accepted'), false);
});

test('a cancellation during secret generation does not return a usable command secret', async () => {
  const controller = new AbortController();
  const original = crypto.subtle.encrypt;
  crypto.subtle.encrypt = async function (...args) {
    const result = await Reflect.apply(original, this, args);
    controller.abort();
    return result;
  };
  try { await assert.rejects(createUnlockSecret(1, fixture.vehicle.vin, controller.signal)); }
  finally { crypto.subtle.encrypt = original; }
});

test('later caller mutation cannot change either captured account or vehicle', async () => {
  const mutable = structuredClone(fixture), calls: unknown[] = [];
  const api = new VehicleControls(new CloudClient(async (url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-token');
    calls.push({ method: init?.method, path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
    mutable.token = 'another-account'; mutable.vehicle.vin = 'LBBBBBBBBBBBBBBB2';
    return reply(null);
  }));
  await api.execute(mutable, 'powerOn');
  assert.deepEqual(calls, contract.actions.powerOn);
});

test('a 15-character cloud vehicle identifier remains bound across both power requests', async () => {
  const vin = '123456789012345', calls: { path: string; body: any }[] = [];
  const api = new VehicleControls(new CloudClient(async (url, init) => {
    calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
    return reply(null);
  }));
  await api.execute({ ...fixture, vehicle: { ...fixture.vehicle, vin } }, 'powerOn');
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].body.param).vinNo, vin);
  assert.equal(calls[1].body.vinNo, vin);
  assert.equal(calls[1].body.secret, contract.encryption.vectors.find((vector: any) => vector.vin === vin && vector.lockFlag === 1).secret);
});

test('unsafe, missing, or non-string bindings cannot dispatch a command', async () => {
  let calls = 0;
  const api = new VehicleControls(new CloudClient(async () => { calls++; return reply(null); }));
  for (const value of ['', '../other', 'A?x=1', undefined, null, 123]) {
    const invalid = { ...fixture, vehicle: { ...fixture.vehicle, vin: value } } as Session;
    await assert.rejects(api.execute(invalid, 'seat'), (error: unknown) => error instanceof ApiError && error.kind === 'format');
  }
  for (const token of ['', 'Bearer synthetic-token', undefined]) {
    await assert.rejects(api.execute({ ...fixture, token } as Session, 'powerOn'));
  }
  await assert.rejects(api.execute(fixture, 'other' as VehicleAction));
  assert.equal(calls, 0);
});
