import { test, expect, open, login } from './fixtures';

const settings = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '设置', exact: true }).click();
const reads = (calls: { path: string }[]) => calls.filter(call => call.path.includes('/vehicleHomePageV2/')).length;
const commands = (calls: { path: string }[]) => calls.filter(call => /dbpoint\/send|vehicleSet\/|vehicleInfo\/control/.test(call.path));

test('range uses the homepage even when a battery placeholder says zero, and preserves a real home zero', async ({ page, mocks }) => {
  mocks.home = { hmiRidableMile: 64 }; mocks.battery = { hmiRidableMile: 0 };
  await open(page); await login(page);
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('64km');
  mocks.home.hmiRidableMile = 0;
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('0km');
  mocks.home.hmiRidableMile = [];
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('—');
});

test('map opens inside the panel only after a click, with a safe external fallback and clear find-car wording', async ({ page, mocks }) => {
  mocks.home = { location: { longitude: 116.397, latitude: 39.908 } };
  await open(page); await login(page);
  await page.getByRole('button', { name: '用车', exact: true }).click();
  expect(mocks.maps).toHaveLength(0);
  await expect(page.getByText(/“带我去找车”会在高德规划/)).toBeVisible();
  await page.getByRole('button', { name: '显示车辆地图' }).click();
  const iframe = page.locator('iframe[title="车辆停车位置地图"]');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(iframe).toHaveAttribute('allow', "geolocation 'none'");
  await expect(page.frameLocator('iframe[title="车辆停车位置地图"]').getByText('模拟地图 · 合成停车点')).toBeVisible();
  expect(mocks.maps).toHaveLength(1);
  await expect(page.getByRole('link', { name: '地图未显示？在高德中打开' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('dialog')).toContainText('从你所在位置步行到车辆');
  expect(commands(mocks.calls)).toHaveLength(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await page.locator('iframe').count()).toBe(0);
});

test('configuration controls survive reopen, backup never contains account data, and reset keeps login', async ({ page, mocks }) => {
  await open(page); await login(page); await settings(page);
  await page.getByLabel('打开后的首页', { exact: true }).selectOption('daily');
  await page.getByLabel('首页快捷操作', { exact: true }).selectOption('seat');
  await page.getByRole('switch', { name: '首页显示预估续航' }).click();
  await page.getByRole('switch', { name: '回到面板时自动读取车况' }).click();
  await page.getByRole('button', { name: '备份我的配置' }).click();
  const backup = await page.getByRole('textbox', { name: '配置备份' }).inputValue();
  expect(JSON.parse(backup).preferences.startPage).toBe('daily');
  for (const value of ['synthetic-token', 'synthetic-user', '13800000000', 'LAAAAAAAA', 'Bearer']) expect(backup).not.toContain(value);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '日常用车', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled();
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  expect(await page.locator('.metric').filter({ hasText: '预计续航' }).count()).toBe(0);
  await page.getByRole('button', { name: '座桶', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('测试极核 A');
  expect(commands(mocks.calls)).toHaveLength(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await settings(page);
  await page.getByRole('button', { name: '恢复默认配置', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复默认配置', exact: true }).click();
  await expect(page.getByLabel('打开后的首页', { exact: true })).toHaveValue('vehicle');
  await expect(page.getByRole('switch', { name: '首页显示预估续航' })).toBeChecked();
  await expect(page.getByRole('button', { name: '退出本机登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入配置', exact: true }).click();
  await page.getByLabel('粘贴配置', { exact: true }).fill(backup);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByLabel('打开后的首页', { exact: true })).toHaveValue('daily');
  await expect(page.getByRole('switch', { name: '回到面板时自动读取车况' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: '退出本机登录', exact: true })).toBeVisible();
});

test('invalid configuration does not change the current preferences or account', async ({ page }) => {
  await open(page); await login(page); await settings(page);
  await page.getByRole('button', { name: '导入配置', exact: true }).click();
  await page.getByLabel('粘贴配置', { exact: true }).fill('{"app":"GeometryPanel","schema":1,"token":"synthetic-private-value"}');
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#modal-message')).toContainText('配置格式不正确');
  await expect(page.locator('#modal-message')).not.toContainText('synthetic-private-value');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByLabel('打开后的首页', { exact: true })).toHaveValue('vehicle');
  await expect(page.getByRole('button', { name: '退出本机登录', exact: true })).toBeVisible();
});

test('back-forward restore refreshes once when old enough; disabled auto-read and confirmation prevent extra reads', async ({ page, mocks }) => {
  await page.clock.install(); await open(page); await login(page);
  const initial = reads(mocks.calls);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial);
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => reads(mocks.calls)).toBe(initial + 1);
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await settings(page);
  await page.getByRole('switch', { name: '回到面板时自动读取车况' }).click();
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  expect(commands(mocks.calls)).toHaveLength(0);
});

test('standalone guidance detects an installed iPhone entry without claiming browser logins transfer', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
  await open(page); await settings(page);
  await expect(page.getByText('当前从主屏幕图标独立运行')).toBeVisible();
  await page.getByRole('button', { name: '查看主屏幕使用说明', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('你已经从主屏幕图标独立运行');
});

test('unavailable preference storage leaves the session intact and tells the user changes are temporary', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(':preferences')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await open(page); await login(page); await settings(page);
  await page.getByLabel('打开后的首页', { exact: true }).selectOption('daily');
  await expect(page.locator('.notice')).toContainText('保存失败，请重试');
  await expect(page.getByRole('button', { name: '退出本机登录', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
});
