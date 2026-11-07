import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudClient, ApiError } from './client';
import { ExtensionsApi } from './extensions';
import { sign } from './sign';
import { settingDefinitions } from '../core/extensions-model';
import { readFileSync } from 'node:fs';
import type { Session } from '../core/model';
const session: Session = { token: 'synthetic-token', uid: 'synthetic-user', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '合成测试车', type: '', plate: '' } };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ code: 10000, data }), { status });

test('query text on the wire matches raw sorted legacy signature; existing body signing stays intact', async () => {
  const client = new CloudClient(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.search, '?a=2026.11&z=9');
    const headers = init!.headers as Record<string, string>, params = new URLSearchParams(headers['cfmoto-x-param']);
    assert.equal(headers['cfmoto-x-sign'], sign('{"test":1}', { z: '9', a: '2026.11', empty: '' }, Number(params.get('timestamp')), params.get('nonce')!).digest);
    return reply(null);
  });
  await client.request('/v1.0/test', { method: 'POST', body: { test: 1 }, query: { z: '9', a: '2026.11', empty: '' } });
});
test('query injection, non-string and oversized shapes are rejected before fetch', async () => {
  let calls = 0; const client = new CloudClient(async () => { calls++; return reply(null); });
  for (const query of [{ a: 'x&token=secret' }, { a: 'x y' }, { a: 'a+b' }, { 'a?b': 'c' }, { a: [] }, { a: 'x'.repeat(257) }, []]) {
    await assert.rejects(client.request('/v1.0/test', { query: query as unknown as Record<string, string> }));
  }
  assert.equal(calls, 0);
});
test('recovered ride and track queries use exact month and date formats', async () => {
  const paths: string[] = [];
  const api = new ExtensionsApi(new CloudClient(async (input, init) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer synthetic-token');
    assert.equal(url.searchParams.get('vinNo'), session.vehicle.vin);
    if (url.pathname.endsWith('/myRideInfo')) { assert.equal(url.searchParams.get('month'), '2026.11'); return reply({ rideRecordList: [] }); }
    assert.equal(url.searchParams.get('startDateTime'), '2026-11-07'); assert.equal(url.searchParams.get('startTime'), '2026-11');
    assert.equal(url.searchParams.get('page'), '2'); assert.equal(url.searchParams.get('pageSize'), '20');
    assert.equal(url.searchParams.has('startDate'), false); return reply([]);
  }));
  await api.month(session, '2026-11'); await api.tracks(session, '2026-11-07', 2);
  assert.deepEqual(paths.map(path => path.split('/').pop()), ['myRideInfo', 'ridetrack_v2']);
});
test('tires and alerts send only recovered query names', async () => {
  const api = new ExtensionsApi(new CloudClient(async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/monitoring')) { assert.equal(url.searchParams.get('sensorType'), 'EXTERNAL'); assert.equal(url.searchParams.get('vinNo'), session.vehicle.vin); return reply({ realTimeData: [] }); }
    assert.equal(url.pathname, '/v1.0/mine/cfmotoservermine/app/Message/list_v2');
    assert.equal(url.searchParams.get('messageKind'), '3'); assert.equal(url.searchParams.get('userId'), session.uid); assert.equal(url.searchParams.get('pageSize'), '20');
    return reply({ messageVOList: [] });
  }));
  await api.tires(session); await api.alerts(session);
});
test('settings read combines capability query and VIN-bound current values', async () => {
  const paths: string[] = [];
  const api = new ExtensionsApi(new CloudClient(async input => {
    const url = new URL(String(input)); paths.push(url.pathname);
    if (url.pathname.endsWith('/items')) { assert.equal(url.searchParams.get('homepageInvoke'), '1'); return reply([{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }]); }
    assert.ok(url.pathname.endsWith(`/vehicleSetInfo/${session.vehicle.vin}`)); return reply({ precisionEndurance: 1 });
  }));
  assert.equal((await api.settings(session))[0].value, '1'); assert.equal(paths.length, 2);
});
test('allowlisted settings produce exact recovered commands, fields and versions', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const api = new ExtensionsApi(new CloudClient(async (input, init) => { assert.equal(init?.method, 'PUT'); calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) }); return reply(null); }));
  await api.writeSetting(session, 'precisionEndurance', '1'); await api.writeSetting(session, 'automaticParking', '0');
  await api.writeSetting(session, 'soundEffectSetting.soundSize', '60'); await api.writeSetting(session, 'motoPlay', '1');
  assert.deepEqual(calls[0].body, { commond: '55', commondParam: '1', relatedFunctions: null, vcu: session.vehicle.vin, version: '' });
  assert.deepEqual(calls[1].body, { commond: '51', commondParam: '0', relatedFunctions: null, vcu: session.vehicle.vin, version: 'v2' });
  assert.deepEqual(calls[2].body, { size: 60, vcu: session.vehicle.vin }); assert.ok(calls[2].path.endsWith('/soundSize'));
  assert.deepEqual(calls[3].body, { vinNo: session.vehicle.vin, motoPlay: 1 });
});
test('all 30 writable setting contracts match an independently recovered inert AST ledger', async () => {
  const contract = JSON.parse(readFileSync(new URL('../../verification/extensions-contract.json', import.meta.url), 'utf8')).settings as {
    key: string; kind: string; endpoint: string; command: string | null; version: string | null; choices: string[];
  }[];
  assert.equal(contract.length, 30);
  assert.deepEqual(settingDefinitions.map(row => row.key).sort(), contract.map(row => row.key).sort());
  for (const recovered of contract) {
    const definition = settingDefinitions.find(row => row.key === recovered.key)!;
    assert.deepEqual(definition.choices?.map(([value]) => value), recovered.choices, recovered.key);
    let expectedValue = '';
    const api = new ExtensionsApi(new CloudClient(async (input, init) => {
      const actual = new URL(String(input)).pathname;
      if (actual.endsWith('/items')) return reply(settingDefinitions.filter(row => row.capability).map(row => ({ functionCode: row.capability, isSupport: true })));
      if (actual.includes('/vehicleSetInfo/')) return reply({ ...Object.fromEntries(settingDefinitions.map(row => [row.key, row.choices?.[0][0]])), rideFunctionVOList: recovered.key === 'ecushionSensor' ? [{ parentCode: 'E_CUSHION_SENSOR', functionCode: '2.0' }] : [] });
      const path = recovered.endpoint === 'set_sound_size' ? 'soundSize' : recovered.endpoint === 'set_motoPlay' ? 'motoPlay/one' : recovered.endpoint === 'set_lowpower' ? 'lowPowerRule/one' : 'propertyOne/one';
      assert.equal(new URL(String(input)).pathname, `/v1.0/app/cfmotoserverapp/vehicleSet/${path}`, recovered.key);
      const body = JSON.parse(String(init?.body));
      if (recovered.kind === 'commond') assert.deepEqual(body, { commond: recovered.command, commondParam: expectedValue, relatedFunctions: null, vcu: session.vehicle.vin, version: recovered.version ?? '' }, recovered.key);
      else if (recovered.kind === 'soundSize') assert.deepEqual(body, { size: Number(expectedValue), vcu: session.vehicle.vin });
      else if (recovered.kind === 'lowPower') assert.deepEqual(body, { ruleId: '', value: expectedValue, vcu: session.vehicle.vin });
      else assert.deepEqual(body, { vinNo: session.vehicle.vin, motoPlay: Number(expectedValue) });
      return reply(null);
    }));
    for (const value of recovered.choices) { expectedValue = value; await api.writeSetting(session, recovered.key, value); }
  }
});

test('account-wide message writes preserve recovered GET contract and never attach a vehicle selector', async () => {
  const calls: URL[] = [];
  const api = new ExtensionsApi(new CloudClient(async (input, init) => { assert.equal(init?.method, 'GET'); calls.push(new URL(String(input))); return reply(null); }));
  await api.updateAlerts(session, 'read'); await api.updateAlerts(session, 'delete');
  assert.deepEqual(calls.map(url => url.pathname.split('/').at(-1)), ['read', 'delete']);
  for (const url of calls) assert.equal(url.search, '?messageKind=3');
});

test('complex settings reread generation and capability; stale seat generation and unsupported RCW never write', async () => {
  let writes = 0;
  const api = new ExtensionsApi(new CloudClient(async (input, init) => {
    if (init?.method === 'PUT') { writes++; return reply(null); }
    return new URL(String(input)).pathname.endsWith('/items') ? reply([{ functionCode: 'E_CUSHION_SENSOR', isSupport: true }])
      : reply({ cushionSensor: 1, ecushionSensor: 0, radarRcw: 1, rideFunctionVOList: [{ parentCode: 'E_CUSHION_SENSOR', functionCode: '2.0' }] });
  }));
  await assert.rejects(api.writeSetting(session, 'cushionSensor', '0'));
  await assert.rejects(api.writeSetting(session, 'radarRcw', '0'));
  await api.writeSetting(session, 'ecushionSensor', '1'); assert.equal(writes, 1);
});
test('unknown setting keys, values and invalid dates never issue requests', async () => {
  let calls = 0; const api = new ExtensionsApi(new CloudClient(async () => { calls++; return reply(null); }));
  await assert.rejects(api.writeSetting(session, 'maximumSpeedLimit', '99'));
  await assert.rejects(api.writeSetting(session, 'precisionEndurance', '2'));
  await assert.rejects(api.writeSetting(session, 'soundEffectSetting.soundSize', '101'));
  await assert.rejects(api.month(session, '2026.11')); await assert.rejects(api.tracks(session, '2026-02-30'));
  await assert.rejects(api.alerts({ ...session, uid: '' })); await assert.rejects(api.tracks(session, '2026-11-07', 0));
  assert.equal(calls, 0);
});
test('writes do not retry ambiguous failures and false acknowledgements are rejected', async () => {
  let calls = 0; const api = new ExtensionsApi(new CloudClient(async () => { calls++; throw new TypeError('synthetic network failure'); }));
  await assert.rejects(api.writeSetting(session, 'precisionEndurance', '1')); assert.equal(calls, 1);
  const rejected = new ExtensionsApi(new CloudClient(async () => reply(false)));
  await assert.rejects(rejected.writeSetting(session, 'precisionEndurance', '1'), (e: unknown) => e instanceof ApiError && e.kind === 'rejected');
});
test('aborted extensions and authentication expiry propagate without follow-up calls', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const api = new ExtensionsApi(new CloudClient(async (_input, init) => { calls++; assert.equal(init?.signal?.aborted, true); throw new DOMException('Cancelled', 'AbortError'); }));
  await assert.rejects(api.tracks(session, '2026-11-07', 1, controller.signal), (e: unknown) => e instanceof DOMException && e.name === 'AbortError');
  assert.equal(calls, 1);
  const expired = new ExtensionsApi(new CloudClient(async () => new Response('', { status: 401 })));
  await assert.rejects(expired.tires(session), (e: unknown) => e instanceof ApiError && e.kind === 'expired');
});
