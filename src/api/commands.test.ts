import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError, CloudClient } from './client';
import { sign } from './sign';
import { ZeehoApi } from './zeeho';
import type { Session } from '../core/model';
import type { CommandStep, HornMode } from '../core/command-report';

const fixture: Session = { token: 'synthetic-token', uid: 'fake', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '测试车', type: '', plate: '' } };
const reply = (data: unknown) => new Response(JSON.stringify({ code: 10000, data }));
// Extracted from the recovered bundle's inert AST, independently of ZeehoApi.
// A one-request implementation must fail even if its own mock says success.
const contract = JSON.parse(readFileSync(new URL('../../verification/recovered-horn-contract.json', import.meta.url), 'utf8'));

for (const mode of ['normal', 'high'] as HornMode[]) {
  test(`${mode} horn matches every recovered request in order, including the empty PUT signature`, async () => {
    const calls: unknown[] = [], progress: CommandStep[] = [];
    const api = new ZeehoApi(new CloudClient(async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, 'Bearer synthetic-token');
      const params = new URLSearchParams(headers['cfmoto-x-param']);
      assert.equal(headers['cfmoto-x-sign'], sign(String(init?.body ?? ''), {}, Number(params.get('timestamp')), params.get('nonce')!).digest);
      calls.push({ method: init?.method, path: new URL(String(url)).pathname,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return reply(null);
    }));
    await api.horn(fixture, undefined, { mode, onProgress: step => progress.push(step) });
    assert.equal(fixture.vehicle.vin, contract.syntheticVin);
    assert.deepEqual(calls, contract[mode]);
    assert.equal(progress.filter(step => step.state === 'accepted').length, contract[mode].length);
  });
}

for (const [mode, failAt] of [['normal', 1], ['normal', 2], ['high', 1]] as const) {
  test(`${mode} horn stops on data=false at step ${failAt}, even with business code 10000`, async () => {
    let calls = 0;
    const progress: CommandStep[] = [];
    const api = new ZeehoApi(new CloudClient(async () => reply(++calls === failAt ? false : null)));
    await assert.rejects(api.horn(fixture, undefined, { mode, onProgress: step => progress.push(step) }),
      (error: unknown) => error instanceof ApiError && error.kind === 'rejected');
    assert.equal(calls, failAt);
    assert.equal(progress.at(-1)?.state, 'failed');
  });
}

test('a failed second step is not retried or replaced by a high-volume command', async () => {
  let calls = 0;
  const api = new ZeehoApi(new CloudClient(async () => {
    if (++calls === 2) throw new TypeError('network');
    return reply(null);
  }));
  await assert.rejects(api.horn(fixture));
  assert.equal(calls, 2);
});

test('cancelling after preparation prevents the second step', async () => {
  const controller = new AbortController(); let calls = 0;
  const api = new ZeehoApi(new CloudClient(async () => { calls++; return reply(null); }));
  await assert.rejects(api.horn(fixture, controller.signal, { onProgress: step => {
    if (step.stage === 'prepare' && step.state === 'accepted') controller.abort();
  } }));
  assert.equal(calls, 1);
});

test('cancelling an in-flight PUT cannot report its late response as accepted', async () => {
  const controller = new AbortController(); let calls = 0;
  const progress: CommandStep[] = [];
  const api = new ZeehoApi(new CloudClient(async () => {
    if (++calls === 2) controller.abort();
    return reply(null);
  }));
  await assert.rejects(api.horn(fixture, controller.signal, { onProgress: step => progress.push(step) }));
  assert.equal(calls, 2);
  assert.equal(progress.at(-1)?.state, 'cancelled');
  assert.equal(progress.some(step => step.stage === 'control' && step.state === 'accepted'), false);
});

test('a rejected PUT retains only safe diagnostic codes', async () => {
  let calls = 0;
  const api = new ZeehoApi(new CloudClient(async () => ++calls === 1 ? reply(null)
    : new Response(JSON.stringify({ code: 30121, message: 'synthetic-private-value' }), { status: 200 })));
  await assert.rejects(api.horn(fixture), (error: unknown) => error instanceof ApiError && error.kind === 'rejected'
    && error.httpStatus === 200 && error.businessCode === '30121' && !error.message.includes('synthetic-private-value'));
  assert.equal(calls, 2);
});
