import { test, expect, open, login, loginToList, VIN_B } from './fixtures';

test('demo is labelled, does not call upstream, and fits small screens', async ({ page, mocks }) => {
  await open(page);
  await page.getByRole('button', { name: '体验演示' }).click();
  await expect(page.locator('.home-heading').getByText('演示', { exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name: '寻车' })).toBeEnabled();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
  expect(mocks.calls).toHaveLength(0);
});

test('login, encrypted restore, vehicle switch, confirmed horn, and logout', async ({ page, mocks }) => {
  await open(page); await login(page);
  await expect(page.locator('.battery-number')).toHaveText('82%');
  const vault = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('zeeho-panel:/panel/:vault-v2');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const record = await new Promise<any>(resolve => {
      const req = db.transaction('local').objectStore('local').get('session');
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return { extractable: record.key.extractable, ciphertext: record.ciphertext.byteLength, plaintext: JSON.stringify(record).includes('synthetic-token'), local: JSON.stringify(localStorage) };
  });
  expect(vault.extractable).toBe(false); expect(vault.ciphertext).toBeGreaterThan(20);
  expect(vault.plaintext).toBe(false); expect(vault.local).not.toContain('synthetic-token');
  await page.reload();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page.getByRole('button', { name: '测试极核 B' }).click();
  await expect(page.locator('.battery-number')).toHaveText('45%');
  await page.getByRole('button', { name: '寻车' }).click();
  expect(mocks.calls.filter(call => call.path.endsWith('/dbpoint/send'))).toHaveLength(0);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已发送鸣笛寻车')).toBeVisible();
  const horn = mocks.calls.filter(call => call.path.endsWith('/dbpoint/send'));
  expect(horn).toHaveLength(1); expect(JSON.parse(horn[0].body.param).vinNo).toBe(VIN_B);
  expect(mocks.calls.filter(call => call.path.endsWith(`/vehicleInfo/control/${VIN_B}`))).toHaveLength(1);
  expect(mocks.calls.filter(call => call.path.endsWith('/loginByPhone'))).toHaveLength(1);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '退出本机登录', exact: true }).click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.getByText('尚未连接车辆')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '登录极核账号', exact: true })).toBeVisible();
});

test('SMS countdown and recovery without requesting another message', async ({ page, mocks }) => {
  await open(page);
  await page.clock.install();
  await page.getByRole('button', { name: '登录极核账号', exact: true }).click();
  await page.getByRole('textbox', { name: '手机号', exact: true }).fill('13800000000');
  await page.getByRole('button', { name: '获取验证码' }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuemax', '719');
  await slider.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: '短信验证码', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /秒后重新获取/ })).toBeDisabled();
  await page.getByRole('button', { name: '更换手机号' }).click();
  await page.getByRole('button', { name: '获取验证码' }).click();
  await expect(page.getByRole('textbox', { name: '短信验证码', exact: true })).toBeVisible();
  expect(mocks.calls.filter(call => call.path.endsWith('/authCode/V2'))).toHaveLength(1);
  await page.clock.fastForward(61000);
  await expect(page.getByRole('button', { name: '重新获取验证码', exact: true })).toBeEnabled();
});

test('a failed vehicle list retries the verified account without consuming SMS again', async ({ page, mocks }) => {
  mocks.listFailures = 1;
  await open(page); await loginToList(page);
  await expect(page.locator('#modal-message')).toBeVisible();
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.getByRole('button', { name: '测试极核 A' }).click();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  expect(mocks.calls.filter(call => call.path.endsWith('/loginByPhone'))).toHaveLength(1);
  expect(mocks.calls.filter(call => call.path.endsWith('/vehicle/list'))).toHaveLength(2);
  await expect(page.locator('body')).not.toContainText('synthetic-private-value');
});

test('empty vehicle lists provide retry and account change', async ({ page, mocks }) => {
  mocks.empty = true;
  await open(page); await loginToList(page);
  await expect(page.getByText('未找到车辆')).toBeVisible();
  mocks.empty = false;
  await page.getByRole('button', { name: '重新读取' }).click();
  await expect(page.getByRole('button', { name: '测试极核 A' })).toBeEnabled();
  await page.getByRole('button', { name: '更换账号' }).click();
  await expect(page.getByRole('textbox', { name: '手机号', exact: true })).toBeVisible();
});

test('initial read failure retains selected account and allows refresh', async ({ page, mocks }) => {
  mocks.readFailure = true;
  await open(page); await login(page);
  await expect(page.locator('.notice')).toContainText('加载失败');
  mocks.readFailure = false;
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  await page.reload();
  await expect(page.locator('.battery-number')).toHaveText('82%');
});

test('15 character frame numbers can be selected, restored, and used for confirmed control', async ({ page, mocks }) => {
  const id = '123456789012345';
  mocks.vehicleRows = [{ vinNo: ` ${id} `, vehicleName: '测试极核 A' }];
  await open(page); await login(page);
  await expect(page.locator('.battery-number')).toHaveText('82%');
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '寻车' })).toBeEnabled();
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已发送鸣笛寻车')).toBeVisible();
  const horn = mocks.calls.filter(call => call.path.endsWith('/dbpoint/send'));
  expect(horn).toHaveLength(1); expect(JSON.parse(horn[0].body.param).vinNo).toBe(id);
  expect(mocks.calls.filter(call => call.path.endsWith(`/vehicleInfo/control/${id}`))).toHaveLength(1);
  expect(mocks.calls.some(call => call.path.endsWith(`/vehicleHomePageV2/${id}`))).toBe(true);
});

test('returned but unrecognized vehicles do not produce an empty-account message', async ({ page, mocks }) => {
  mocks.vehicleRows = [{ vinNo: '' }];
  await open(page); await loginToList(page);
  await expect(page.getByText('车辆信息未识别', { exact:true })).toBeVisible();
  await expect(page.locator('#modal')).not.toContainText('本次返回 0 辆车');
  mocks.vehicleRows = [{ vinNo: '123456789012345', vehicleName: '测试极核 A' }];
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.getByRole('button', { name: '测试极核 A' }).click();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  expect(mocks.calls.filter(call => call.path.endsWith('/loginByPhone'))).toHaveLength(1);
  expect(mocks.calls.filter(call => call.path.endsWith('/authCode/V2'))).toHaveLength(1);
});

test('battery outage preserves home data; expired sessions disable control', async ({ page, mocks }) => {
  mocks.batteryFailure = true;
  await open(page); await login(page);
  await expect(page.locator('.battery-number')).toHaveText('82%');
  await expect(page.locator('.metric.voltage strong')).toHaveText('—');
  mocks.expired = true;
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.notice')).toHaveText('登录已过期');
  await expect(page.getByRole('button', { name: '寻车' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重新登录', exact: true })).toBeVisible();
});

test('uncertain horn results do not retry or fall back', async ({ page, mocks }) => {
  await open(page); await login(page);
  mocks.commandResults.prepare = 'network';
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#modal-message')).toContainText('未收到车辆响应');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('未收到车辆响应');
  expect(mocks.calls.filter(call => call.path.endsWith('/dbpoint/send'))).toHaveLength(1);
  expect(mocks.calls.some(call => call.path.includes('/vehicleInfo/control'))).toBe(false);
});

test('closing an in-flight command preserves uncertainty and prevents late success', async ({ page, mocks }) => {
  let release!: () => void;
  mocks.holdCommand = { stage: 'prepare', wait: new Promise<void>(resolve => { release = resolve; }) };
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => mocks.calls.filter(call => call.path.endsWith('/dbpoint/send')).length).toBe(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(page.locator('.notice')).toContainText('未收到车辆响应');
  await expect(page.locator('#modal')).not.toBeVisible();
  expect(mocks.calls.filter(call => call.path.endsWith('/dbpoint/send'))).toHaveLength(1);
  expect(mocks.calls.some(call => call.path.includes('/vehicleInfo/control'))).toBe(false);
});

test('a failed local save keeps the previous vehicle and persisted account', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if ((window as any).__failSave && args[0]?.ciphertext) throw new DOMException('synthetic storage failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await open(page); await login(page);
  await page.evaluate(() => { (window as any).__failSave = true; });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page.getByRole('button', { name: '测试极核 B' }).click();
  await expect(page.locator('#modal-message')).toContainText('本次切换未完成');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.locator('.battery-number')).toHaveText('82%');
});

test('closing a pending login list discards a late response', async ({ page, mocks }) => {
  let release!: () => void;
  mocks.holdList = new Promise<void>(resolve => { release = resolve; });
  await open(page); await loginToList(page);
  await expect(page.locator('dialog').getByText('正在加载', { exact:true }).first()).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '登录极核账号', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '登录极核账号', exact: true })).toBeEnabled();
});
