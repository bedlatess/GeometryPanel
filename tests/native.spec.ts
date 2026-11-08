import { navigate, control, report, developerLab, test, expect, open, login } from './fixtures';
import type { Page } from '@playwright/test';

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
test('Safari explains installation without pretending native functions are available', async ({ page, mocks }) => {
  await open(page);await page.getByRole('button',{name:'体验演示',exact:true}).click();
  await navigate(page,'/vehicle/status');
  await navigate(page,'/tools/bluetooth');
  await expect(page.getByText('以下功能需在 App 中使用')).toBeVisible();
  expect(mocks.calls).toHaveLength(0);
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('native demo remains read-only and never prepares cloud keys', async ({ page, mocks }) => {
  await syntheticNative(page); await open(page);
  await page.getByRole('button', { name: '体验演示' }).click();
  await navigate(page,'/vehicle/status');
  await navigate(page,'/tools/bluetooth');
  await expect(page.getByRole('button', { name: '准备资料' })).toBeDisabled();
  await navigate(page,'/tools/bluetooth/more');await expect(page.getByRole('button', { name: '登记手机钥匙' })).toBeDisabled();
  await navigate(page,'/tools/meter');await page.getByRole('button',{name:'仪表壁纸',exact:true}).click();await expect(page.getByRole('button',{name:'选择壁纸模板'})).toBeDisabled();expect(await page.evaluate(()=>(window as any).__nativeCalls)).toEqual([]);
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
  await page.getByRole('dialog').getByRole('button', { name: '退出全部账号' }).click();
  await expect(page.getByText('已退出全部账号', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.method === 'forgetVehicle').length)).toBe(previous + 1);
});
