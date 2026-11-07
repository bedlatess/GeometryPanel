import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeClient, NativeError, nativeMessage } from './native';

test('native calls are correlated; unknown and duplicate responses cannot complete a different call', async () => {
  const requests: any[] = [];
  const native = new NativeClient({ send: request => requests.push(request) });
  const first = native.call('status'), second = native.call('capabilities');
  native.receive({ id: 'unrequested', ok: true, result: 'wrong' });
  native.receive({ id: requests[1].id, ok: true, result: 'second' });
  native.receive({ id: requests[1].id, ok: true, result: 'duplicate' });
  native.receive(JSON.stringify({ id: requests[0].id, ok: true, result: 'first' }));
  assert.equal(await first, 'first'); assert.equal(await second, 'second');
});
test('native errors discard raw messages that may contain credentials', async () => {
  let request: any;
  const native = new NativeClient({ send: value => request = value });
  const result = native.call('status');
  native.receive({ id: request.id, ok: false, error: { code: 'permission_denied', message: 'SYNTHETIC-SECRET' } });
  await assert.rejects(result, error => error instanceof NativeError && !nativeMessage(error).includes('SYNTHETIC-SECRET') && error.code === 'permission_denied');
});
test('native timeout, transport exception and cancellation release pending requests', async () => {
  const slow = new NativeClient({ send: () => {} }, 5);
  await assert.rejects(slow.call('status'), error => error instanceof NativeError && error.code === 'timeout');
  const broken = new NativeClient({ send: () => { throw new Error('SYNTHETIC-SECRET'); } });
  await assert.rejects(broken.call('status'), error => error instanceof NativeError && error.code === 'transport');
  const aborter = new AbortController(), active = slow.call('status', {}, aborter.signal);
  aborter.abort(); await assert.rejects(active, { name: 'AbortError' });
  await assert.rejects(slow.call('status', {}, aborter.signal), { name: 'AbortError' });
  slow.dispose(); broken.dispose();
});
test('browser cannot call unlisted native methods or overflow the queue', async () => {
  const native = new NativeClient({ send: () => {} });
  await assert.rejects(native.call('http.proxy' as any), error => error instanceof NativeError && error.code === 'invalid_request');
  const requests = Array.from({ length: 8 }, () => native.call('status').catch(error => error.code));
  await assert.rejects(native.call('status'), error => error instanceof NativeError && error.code === 'busy');
  native.dispose(); assert.deepEqual(await Promise.all(requests), Array(8).fill('cancelled'));
});
test('Safari reports native unavailable without issuing any cloud request', async () => {
  await assert.rejects(new NativeClient(null).call('ble.connect'), error => error instanceof NativeError && error.code === 'unavailable');
});
