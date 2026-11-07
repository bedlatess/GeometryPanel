import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallpaperChoices, wallpaperSpec, MeterApi } from './meter';
import { CloudClient } from './client';
import type { Session } from '../core/model';
const session: Session = { token: 'synthetic-token', uid: 'synthetic-user', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '测试车辆', type: '', plate: '' } };
test('wallpaper metadata comes from chosen detail without inventing defaults', () => {
  assert.deepEqual(wallpaperSpec({ wallpaperContentZip: JSON.stringify({ wallpaperNum: 12, displayWallpaperSet: '1' }) }), { wallpaperNum: '12', displayWallpaperSet: '1' });
  assert.deepEqual(wallpaperSpec({ detail: { wallpaperNo: 3, displayWallpaperSet: 'both' } }), { wallpaperNum: '3', displayWallpaperSet: 'both' });
  assert.throws(() => wallpaperSpec({ wallpaperContentZip: [{ wallpaperNum: 1 }, { wallpaperNum: 2 }] }));
  assert.throws(() => wallpaperSpec({ wallpaperNum: 1 }));
  assert.throws(() => wallpaperSpec({}));
});
test('wallpaper choices allow bounded single path segment IDs only', () => {
  assert.deepEqual(wallpaperChoices({ records: [{ wallpaperId: '12', name: '测试' }, { id: '../escape' }] }), [{ id: '12', name: '测试' }]);
});
test('official wallpaper ZIP metadata follows recovered inline-16 origin and size contract', () => {
  const meta = { wallpaperNum: 12, displayWallpaperSet: '1', url: 'https://oss-cfmoto-private.zeehoev.com/assets/test.zip', fileName: 'test.zip', fileSize: '1024', md5: 'A'.repeat(32) };
  assert.deepEqual(wallpaperSpec({ wallpaperContentZip: meta }), { ...meta, wallpaperNum: '12', fileSize: 1024, md5: 'a'.repeat(32) });
  for (const url of ['https://example.com/test.zip', 'http://oss-cfmoto-private.zeehoev.com/test.zip', 'https://oss-cfmoto-private.zeehoev.com/test.bin', 'https://oss-cfmoto-private.zeehoev.com/test.zip#fragment']) assert.throws(() => wallpaperSpec({ wallpaperContentZip: { ...meta, url } }));
  for (const fileSize of ['', '1e3', 16777217]) assert.throws(() => wallpaperSpec({ wallpaperContentZip: { ...meta, fileSize } }));
});
test('meter context verifies owner/VIN, narrows pairing, and supports vehicles without BLE material', async () => {
  const paths: string[] = [];
  const api = new MeterApi(new CloudClient(async (input) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    const data = url.pathname.includes('vehicleHomePage') ? { vinNo: session.vehicle.vin, bindingUserId: session.uid, sharedFlag: 0,
      wifiAddress: 'synthetic-pairing', wallpaperResolutionWidth: 800, wallpaperResolutionHeight: 480, mmiWifiIp: '192.168.0.1' }
      : url.pathname.includes('vehicleWallpaperDetail') ? { wallpaperNo: '4', displayWallpaperSet: '1' } : {};
    return new Response(JSON.stringify({ code: 10000, data }));
  }));
  const result = await api.openContext(session, '12');
  assert.equal(result.binding.encryptInfo, undefined);
  assert.deepEqual(result.params, { mode: 'wallpaper', wifiAddress: 'synthetic-pairing', width: 800, height: 480, wallpaperNum: '4', displayWallpaperSet: '1' });
  assert.equal(paths.length, 3); assert.ok(!JSON.stringify(result).includes(session.token));
});
