import { navigate, control, report, developerLab, test, expect, open, login } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function syntheticNative(page: Page) {
  await page.addInitScript(() => {
    const scope = window as any;
    scope.__nativeCalls = [];
    scope.GeometryNative = {
      postMessage(raw: string) {
        const request = JSON.parse(raw);
        scope.__nativeCalls.push(request);
        const result = request.method === 'capabilities' ? { platform: 'android', version: 1, features: { ble: true, proximity: true, notifications: true, widget: true, meter: true }, limitations: ['模拟原生桥，仅自动检查用'] }
          : request.method === 'status' ? { state: 'idle', authenticated: false, vehicleRegistered: false } : {};
        queueMicrotask(() => scope.GeometryNative.onmessage?.({ data: JSON.stringify({ id: request.id, ok: true, result }) }));
      },
    };
  });
}
test('Android host back closes Ionic overlays before navigation and preserves command uncertainty', async ({ page, mocks }) => {
  const activity = readFileSync('android/app/src/main/java/app/geometrypanel/mobile/MainActivity.java', 'utf8');
  const back = activity.match(/CLOSE_DIALOG_SCRIPT = """([\s\S]*?)""";/)![1];
  await syntheticNative(page);
  await open(page); await login(page);
  await expect(page.locator('.notice')).not.toBeVisible();
  await page.getByRole('button', { name: '寻车', exact: true }).click();
  await expect(page.locator('.native-back-port')).toHaveAttribute('open');
  expect(await page.evaluate(back)).toBe(true);
  await expect(page.locator('#runtime-modal')).not.toBeVisible();
  await expect(page.locator('.native-back-port')).not.toHaveAttribute('open');
  await expect(page).toHaveURL(/#\/vehicle$/);
  expect(await page.evaluate(back)).toBe(false);
  expect(mocks.calls.filter(call => /dbpoint\/send$/.test(call.path))).toHaveLength(0);
  let release!: () => void;
  mocks.holdCommand = { stage: 'prepare', wait: new Promise<void>(resolve => { release = resolve; }) };
  await page.getByRole('button', { name: '寻车', exact: true }).click();
  await page.getByRole('button', { name: '鸣笛寻车', exact: true }).click();
  await expect.poll(() => mocks.calls.filter(call => /dbpoint\/send$/.test(call.path)).length).toBe(1);
  expect(await page.evaluate(back)).toBe(true);
  release();
  await expect(page.locator('#runtime-modal')).not.toBeVisible();
  await expect(page.locator('.notice')).toContainText('已发出，结果待确认');
  await expect(page).toHaveURL(/#\/vehicle$/);
  expect(mocks.calls.filter(call => /dbpoint\/send$/.test(call.path))).toHaveLength(1);
  expect(mocks.calls.some(call => call.path.includes('/vehicleInfo/control'))).toBe(false);
});
test('Safari explains installation without pretending native functions are available', async ({ page, mocks }) => {
  await open(page);await page.getByRole('button',{name:'先看看演示',exact:true}).click();
  await navigate(page,'/vehicle/status');
  await navigate(page,'/tools/bluetooth');
  await expect(page.getByRole('button',{name:'准备资料',exact:true})).toBeDisabled();
  expect(mocks.calls).toHaveLength(0);
  await page.locator('ion-back-button:visible').click();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
});
test('native demo remains read-only and never prepares cloud keys', async ({ page, mocks }) => {
  await syntheticNative(page); await open(page);
  await page.getByRole('button', { name: '先看看演示' }).click();
  await navigate(page,'/vehicle/status');
  await navigate(page,'/tools/bluetooth');
  await expect(page.getByRole('button', { name: '准备资料' })).toBeDisabled();
  await navigate(page,'/tools/bluetooth/more');await expect(page.getByRole('button', { name: '登记手机钥匙' })).toBeDisabled();
  await navigate(page,'/tools/meter');await page.getByRole('link',{name:'仪表壁纸',exact:true}).click();await expect(page.getByRole('button',{name:'选择壁纸模板'})).toBeDisabled();expect(await page.evaluate(()=>(window as any).__nativeCalls)).toEqual([]);
  expect(mocks.calls).toHaveLength(0);
});
test('native snapshot contains only display data and logout clears native vehicle scope', async ({ page }) => {
  await syntheticNative(page); await open(page); await login(page);
  await expect.poll(() => page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.method === 'widget.update'))).toBe(true);
  const snapshots = await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.method === 'widget.update').map((call: any) => call.params));
  expect(snapshots[0]).toMatchObject({ vehicleLabel: '测试极核 A', soc: 82, range: 91, voltage: 76.4 });
  expect(snapshots[0].vehicleId).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  expect(JSON.stringify(snapshots)).not.toContain('synthetic-token');
  expect(JSON.stringify(snapshots)).not.toContain('LAAAAAAAAAAAAAAA1');
  await navigate(page,'/me');
  await navigate(page,'/me/accounts'); await page.getByRole('button',{name:'退出全部账号',exact:true}).click();
  const previous = await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.method === 'forgetVehicle').length);
  await page.locator('ion-modal:not(.overlay-hidden)').getByRole('button', { name: '退出全部账号' }).click();
  await expect(page.getByText('已退出全部账号', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.method === 'forgetVehicle').length)).toBe(previous + 1);
});
