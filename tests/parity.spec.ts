import { test, expect, open, login, VIN_A, VIN_B } from './fixtures';
import type { Page } from '@playwright/test';

async function settings(page: Page) { await page.getByRole('button', { name: '设置', exact: true }).click(); }
async function background(page: Page) { await settings(page); await page.getByRole('button', { name: '后台监控与本机记录', exact: true }).click(); }
async function nativeMock(page: Page, imported = false) {
  await page.addInitScript(({ imported }) => {
    const scope = window as any; scope.__parityCalls = [];
    scope.GeometryNative = { postMessage(raw: string) {
      const call = JSON.parse(raw); scope.__parityCalls.push(call);
      const result = call.method === 'capabilities' ? { platform: 'android', version: 1, features: { background: true, history: true, widget: true, shortcuts: true, officialLogin: true } }
        : call.method === 'background.status' || call.method === 'background.configure' ? { enabled: call.params.enabled === true, running: false, backgroundMode: 'foreground-service' }
        : call.method === 'officialLogin.result' && imported ? { imported: true, accountId: 'native-synthetic', session: { uid: 'imported-user', token: 'imported-token', vehicles: [] } }
        : call.method === 'background.history' ? { items: [], total: 0 } : {};
      queueMicrotask(() => scope.GeometryNative.onmessage?.({ data: JSON.stringify({ id: call.id, ok: true, result }) }));
    } };
  }, { imported });
}
const calls = (page: Page) => page.evaluate(() => (window as any).__parityCalls as { method: string; params: any }[]);
async function secondLogin(page: Page, car = '测试极核 B') {
  await settings(page); await page.getByRole('button', { name: '管理本机账号', exact: true }).click();
  await page.getByRole('button', { name: '添加账号', exact: true }).click();
  await page.getByRole('textbox', { name: '手机号', exact: true }).fill('13900000000'); await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByRole('slider').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: '短信验证码', exact: true }).fill('123456'); await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: car }).click();
  await expect(page.getByRole('heading', { name: car, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况', exact: true })).toBeEnabled();
}

test('multiple encrypted accounts survive reload and saved switching uses the owning credential', async ({ page, mocks }) => {
  mocks.loginReplies = [{ uid: 'user-a', token: 'token-a' }, { uid: 'user-b', token: 'token-b' }];
  await open(page); await login(page); await secondLogin(page);
  await page.reload(); await expect(page.getByRole('heading', { name: '测试极核 B', exact: true })).toBeVisible();
  const sms = mocks.calls.filter(call => call.path.endsWith('/authCode/V2')).length;
  await settings(page); await page.getByRole('button', { name: '管理本机账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '账号 2', exact: true })).toBeVisible();
  await page.locator('[data-account-select]').first().click();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况', exact: true })).toBeEnabled();
  const reads = mocks.calls.filter(call => call.path.includes('/vehicleHomePageV2/'));
  expect(reads.at(-1)).toMatchObject({ authorization: 'Bearer token-a', path: expect.stringContaining(VIN_A) });
  expect(reads.some(call => call.authorization === 'Bearer token-b' && call.path.endsWith(VIN_B))).toBe(true);
  expect(mocks.calls.filter(call => call.path.endsWith('/authCode/V2')).length).toBe(sms);
  const local = await page.evaluate(() => JSON.stringify(localStorage));
  expect(local).not.toContain('token-a'); expect(local).not.toContain('token-b');
});

test('native account consent precedes credential handoff; pause persists and logout revokes all accounts', async ({ page }) => {
  await nativeMock(page); await open(page); await login(page);
  expect((await calls(page)).some(call => call.method === 'accounts.sync')).toBe(false);
  await background(page); await page.getByRole('button', { name: '保存并开启监控', exact: true }).click();
  await expect(page.getByText('已保存监控配置，实际运行状态以系统返回和最近读取时间为准。')).toBeVisible();
  const handoff = (await calls(page)).find(call => call.method === 'accounts.sync')!;
  expect(handoff.params.accounts[0]).toMatchObject({ token: 'synthetic-token', uid: 'synthetic-user' });
  expect(handoff.params.accounts[0].id).not.toContain('synthetic-user');
  expect(handoff.params.accounts[0].vehicles[0].id).not.toContain(VIN_A);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '管理本机账号', exact: true }).click();
  await page.locator('[data-account-enabled]').uncheck();
  await expect(page.getByText('本机账号配置已保存。')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page.getByRole('button', { name: '测试极核 A' }).click();
  await expect(page.getByRole('button', { name: '刷新车况', exact: true })).toBeEnabled();
  expect((await calls(page)).filter(call => call.method === 'accounts.sync').at(-1)!.params.accounts[0].enabled).toBe(false);
  await settings(page); await page.getByRole('button', { name: '退出本机登录', exact: true }).click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.getByText('已退出本机登录。', { exact: true })).toBeVisible();
  expect((await calls(page)).filter(call => call.method === 'accounts.sync').at(-1)!.params).toEqual({ accounts: [], selectedVehicleId: null });
});

test('browser history distinguishes battery from charge records and clearing one category retains the other', async ({ page, mocks }) => {
  mocks.battery = { chargeState: 1 }; await open(page); await login(page);
  mocks.battery = { chargeState: 0 }; await page.getByRole('button', { name: '刷新车况', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新车况', exact: true })).toBeEnabled();
  await background(page); await page.getByRole('button', { name: '充电与电池历史', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '清除此类本机记录', exact: true }).click();
  await page.getByRole('button', { name: '确认清除', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: '充电记录', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.getByText('已中止', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '退出本机登录', exact: true }).click(); await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.getByText('已退出本机登录。', { exact: true })).toBeVisible();
  const count = await page.evaluate(async () => {
    const request = indexedDB.open('zeeho-panel:/panel/:vault-v2', 1);
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('local', 'readonly'), q = tx.objectStore('local').count();
    const result = await new Promise<number>(resolve => { q.onsuccess = () => resolve(q.result); }); db.close(); return result;
  });
  expect(count).toBe(0);
});

test('legacy encrypted session migrates once and retains its opaque account identity across reloads', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ token: 'legacy-synthetic', uid: 'legacy-user', vehicle: { vin: 'LAAAAAAAAAAAAAAA1', name: '迁移测试车辆', type: 'AE8', plate: '' } })));
    const request = indexedDB.open('zeeho-panel:/panel/:vault-v2', 1);
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('local', 'readwrite'); tx.objectStore('local').put({ key, iv: iv.buffer, ciphertext }, 'session'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('storage')); }); db.close();
  });
  await page.reload(); await expect(page.getByRole('heading', { name: '迁移测试车辆', exact: true })).toBeVisible();
  async function identity() {
    await background(page);
    const id = await page.locator('[data-background-vehicle] option').first().getAttribute('value');
    await page.getByRole('button', { name: '关闭', exact: true }).click(); return id;
  }
  const id = await identity(); await page.reload(); await expect(page.getByRole('heading', { name: '迁移测试车辆', exact: true })).toBeVisible();
  expect(await identity()).toBe(id); expect(id).not.toContain('legacy');
});

test('official native login hands off once locally then uses normal verified vehicle selection', async ({ page, mocks }) => {
  await nativeMock(page, true); await open(page); await background(page);
  await page.getByRole('button', { name: '系统工具', exact: true }).click();
  await page.getByRole('button', { name: '查看官方登录连接结果', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择车辆', exact: true })).toBeVisible();
  expect(mocks.calls.filter(call => call.path.endsWith('/vehicle/list')).at(-1)!.authorization).toBe('Bearer imported-token');
  await page.getByRole('button', { name: '测试极核 A' }).click();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('imported-token');
  expect((await calls(page)).find(call => call.method === 'officialLogin.result')!.params).toEqual({ importToPanel: true });
});

test('system shortcut rejects unknown vehicles and requires visible confirmation before a command', async ({ page, mocks }) => {
  await nativeMock(page); await open(page); await login(page); await background(page);
  const id = await page.locator('[data-background-vehicle] option').first().getAttribute('value');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('geometry:native-shortcut', { detail: { vehicleId: 'unknown', action: 'horn' } })));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(vehicleId => window.dispatchEvent(new CustomEvent('geometry:native-shortcut', { detail: { vehicleId, action: 'horn' } })), id);
  await expect(page.getByRole('heading', { name: '系统快捷指令', exact: true })).toBeVisible();
  expect(mocks.calls.some(call => call.path.endsWith('/dbpoint/send'))).toBe(false);
  await page.getByRole('button', { name: '继续核对车辆', exact: true }).click();
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  expect(mocks.calls.some(call => call.path.endsWith('/dbpoint/send'))).toBe(false);
});

test('status picture exports only a bounded PNG through the native save flow', async ({ page }) => {
  await nativeMock(page); await open(page); await login(page); await settings(page);
  await page.getByRole('button', { name: '导出车况图片', exact: true }).click();
  await expect(page.getByText('已打开车况图片保存或分享流程。')).toBeVisible();
  const params = (await calls(page)).find(call => call.method === 'asset.export')!.params;
  expect(Object.keys(params).sort()).toEqual(['data', 'fileName', 'kind']);
  expect(params).toMatchObject({ kind: 'panel', fileName: 'geometry-status.png' });
  const data = Buffer.from(params.data, 'base64'); expect(data.length).toBeLessThanOrEqual(1048576);
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

test('desktop preview, configuration and read-only reset use the selected opaque vehicle', async ({ page }) => {
  await nativeMock(page); await open(page); await login(page); await background(page);
  await page.getByRole('button', { name: '桌面控制', exact: true }).click();
  await expect(page.getByRole('region', { name: '组件内容预览' })).toContainText('电量 82%');
  const id = await page.locator('[data-background-vehicle]').inputValue();
  await page.locator('[data-background-style]').selectOption('4x4'); await page.locator('[data-background-controls]').check();
  await page.getByRole('button', { name: '配置组件', exact: true }).click();
  await expect(page.getByText('组件绑定已保存。', { exact: true })).toBeVisible();
  expect((await calls(page)).filter(call => call.method === 'widget.configure').at(-1)!.params).toEqual({ vehicleId: id, style: '4x4', controls: true });
  await page.getByRole('button', { name: '此尺寸恢复只读配置', exact: true }).click();
  await expect(page.getByText('此尺寸组件已恢复只读车况配置。')).toBeVisible();
  expect((await calls(page)).filter(call => call.method === 'widget.configure').at(-1)!.params).toEqual({ vehicleId: id, style: '4x4', controls: false });
});
