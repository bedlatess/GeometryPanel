import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, CloudClient } from './client';
import { sign } from './sign';
import { ZeehoApi } from './zeeho';
import type { Session } from '../core/model';

const fixture: Session = { token: 'synthetic-token', uid: 'fake', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '测试车', type: '', plate: '' } };
const reply = (data: unknown, status = 200, code: string | number = '10000') => new Response(JSON.stringify({ code, data }), { status });

test('legacy signature matches independent Python/JVM golden vector', () => {
  const result = sign('{"test":1}', { z: '9', a: '1', empty: '' }, 1700000000000, '1700000000000AbCd0123456789XY');
  assert.equal(result.canonical, 'a=1&z=9');
  assert.equal(result.digest, '511a9caa12afc1c709a3862ce9966fe7');
});
test('business failure is rejected even when HTTP succeeds', async () => {
  const client = new CloudClient(async () => reply(null, 200, '30121'));
  await assert.rejects(client.request('/v1.0/test'), (error: unknown) => error instanceof ApiError && error.kind === 'rejected');
});
test('HTTP 401 is expiry without a JSON body', async () => {
  const client = new CloudClient(async () => new Response('unauthorized', { status: 401 }));
  await assert.rejects(client.request('/v1.0/test'), (error: unknown) => error instanceof ApiError && error.kind === 'expired');
});
test('login uses recovered public protocol without a user Bearer token', async () => {
  let calls = 0;
  const api = new ZeehoApi(new CloudClient(async (url, init) => {
    calls++;
    assert.equal(url, 'https://tapi.zeehoev.com/v1.0/mine/cfmotoservermine/user/loginByPhone');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Basic bWNrOjEyMzQ1Ng==');
    assert.equal(headers.appid, 'S7qPWPU1');
    assert.ok(headers.signature);
    assert.equal(headers['User-Agent'], undefined);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.phone, '13800000000');
    assert.equal(body.authCode, '123456');
    assert.equal(body.latitude, '');
    return reply({ tokenInfo: { access_token: 'Bearer synthetic-token' }, id: 42 });
  }));
  assert.deepEqual(await api.login('13800000000', '123456'), { token: 'synthetic-token', uid: '42' });
  assert.equal(calls, 1);
});
test('vehicle list is loaded with the newly supplied account token', async () => {
  const api = new ZeehoApi(new CloudClient(async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer new-account');
    return reply([{ vinNo: fixture.vehicle.vin, vehicleName: '车 A', licensePlate: '测试' }]);
  }));
  assert.equal((await api.list('new-account'))[0].vin, fixture.vehicle.vin);
});
test('horn uses the selected binding and recovered command envelope once', async () => {
  let calls = 0;
  const api = new ZeehoApi(new CloudClient(async (_url, init) => {
    calls++;
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.eventId, 11631);
    assert.equal(body.zeehoParamTypeBO, null);
    assert.deepEqual(JSON.parse(body.param), { vinNo: fixture.vehicle.vin, functionCode: 'LOUDLY_SEARCH_CAR', type: 'LOW' });
    return reply(null);
  }));
  await api.horn(fixture); assert.equal(calls, 1);
});
test('uncertain command failures never trigger retries or fallback commands', async () => {
  let calls = 0;
  const api = new ZeehoApi(new CloudClient(async () => { calls++; throw new TypeError('network'); }));
  await assert.rejects(api.horn(fixture)); assert.equal(calls, 1);
});
test('partial battery outage preserves successful home data', async () => {
  const api = new ZeehoApi(new CloudClient(async url => String(url).includes('batteryInfo')
    ? reply(null, 503, '50000') : reply({ bmssoc: 75, onlineStatus: 'ONLINE' })));
  const data = await api.read(fixture);
  assert.equal(data.soc, 75); assert.equal(data.partial, true);
});
test('battery expiry is not hidden by successful home data', async () => {
  const api = new ZeehoApi(new CloudClient(async url => String(url).includes('batteryInfo')
    ? new Response('', { status: 401 }) : reply({ bmssoc: 75 })));
  await assert.rejects(api.read(fixture), (error: unknown) => error instanceof ApiError && error.kind === 'expired');
});
test('cancelled reads do not request another endpoint', async () => {
  const controller = new AbortController(); let calls = 0;
  const api = new ZeehoApi(new CloudClient(async () => { calls++; controller.abort(); return reply({ bmssoc: 75 }); }));
  await assert.rejects(api.read(fixture, controller.signal)); assert.equal(calls, 1);
});
test('response size limit is enforced before parsing', async () => {
  const client = new CloudClient(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(client.request('/v1.0/test'), (error: unknown) => error instanceof ApiError && error.kind === 'limit');
});
test('paths cannot target an arbitrary origin or inject queries', async () => {
  let calls = 0;
  const client = new CloudClient(async () => { calls++; return reply(null); });
  await assert.rejects(client.request('https://example.com/'));
  await assert.rejects(client.request('/v1.0/test?token=anything'));
  assert.equal(calls, 0);
});
