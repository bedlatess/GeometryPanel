import { readFileSync } from 'node:fs';
import { test, expect, open, login, VIN_A, VIN_B, type Call } from './fixtures';

const contract = JSON.parse(readFileSync(new URL('../verification/recovered-controls-contract.json', import.meta.url), 'utf8'));
const commands = (calls: Call[]) => calls.filter(call => /dbpoint\/send|vehicleInfo\/control|vehicleSet\/(network\/unlock|propertyTwo\/one)/.test(call.path));
const daily = async (page: import('@playwright/test').Page) => page.getByRole('button', { name: '用车', exact: true }).click();
const row = (page: import('@playwright/test').Page, name: string) => page.locator('.detail-row').filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) }).locator('dd');

test('daily page shows recovered units, charging and separate report ages without loading external maps', async ({ page, mocks }) => {
  mocks.home = {
    totalRideMile: 1234.5, rideMileageMonth: 67.8, ridingTimeMonthUnitMinute: 90, avgVelocityMonth: 32.4,
    headLockState: 1, seatLockState: 0, rideState: '已停放', refreshTime: Date.now() - 60_000,
    iotProperties: [{ identify: 'VehicleLock_S', value: 1 }],
    chargeTimeString: '1h 20min', expectFullTimeDescribe: '预计 14:30 充满',
    location: { longitude: 116.397, latitude: 39.908, locationTime: Date.now() - 3600_000 },
    address: '合成测试位置',
  };
  mocks.battery = { current: -3.2, power: -240, batteryTemp: 28, soh: 96.5, chargeCount: 42, chargeState: 1, refreshTime: Date.now() + 3600_000 };
  await open(page); await login(page); await daily(page);
  for (const [name, value] of Object.entries({ '总里程': '1234.5 km', '本月骑行时长': '90 分钟', '本月平均速度': '32.4 km/h',
    '电池电流': '-3.2 A', '电池功率': '-240 W', '电池温度': '28 ℃', '车机循环次数': '42 次',
    '本次已充': '1 小时 20 分钟', '预计充满': '预计 14:30 充满', '充电状态': '充电中', '座桶锁': '未锁' })) {
    await expect(row(page, name)).toHaveText(value);
  }
  await expect(page.getByText(/位置上报.*位置较早/)).toBeVisible();
  await expect(page.getByText(/电池上报.*时间异常/)).toBeVisible();
  const map = new URL((await page.getByRole('link', { name: '查看地图', exact: true }).getAttribute('href'))!);
  expect(map.origin).toBe('https://uri.amap.com');
  expect(map.searchParams.get('position')).toBe('116.397000,39.908000');
  expect(map.searchParams.get('coordinate')).toBe('gaode');
  const walk = new URL((await page.getByRole('link', { name: '步行导航到车辆' }).getAttribute('href'))!);
  expect(walk.searchParams.get('mode')).toBe('walk');
  expect(walk.searchParams.get('to')).toBe('116.397000,39.908000,车辆位置');
  await expect(page.getByRole('link', { name: '查看地图', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(commands(mocks.calls)).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/daily-synthetic-mobile.png', fullPage: true });
});

test('partial battery data and missing reports remain unknown and server text is escaped', async ({ page, mocks }) => {
  mocks.batteryFailure = true;
  mocks.home = { current: 2, voltage: 72, totalRideMile: 0, rideState: '<img src=x onerror=alert(1)>' };
  await open(page); await login(page); await daily(page);
  await expect(row(page, '总里程')).toHaveText('0 km');
  await expect(row(page, '电池功率')).toHaveText('144 W');
  await expect(row(page, '电池健康')).toHaveText('—');
  await expect(row(page, '车机循环次数')).toHaveText('—');
  await expect(row(page, '车头锁')).toHaveText('未知');
  await expect(page.getByText('暂未取得有效车辆位置')).toBeVisible();
  await expect(page.getByText(/车辆上报 上报时间未知/)).toBeVisible();
  await expect(row(page, '车辆状态')).toHaveText('<img src=x onerror=alert(1)>');
  expect(await page.locator('main img').count()).toBe(0);
  await expect(page.getByRole('button', { name: '云开锁 车辆上电' })).toBeEnabled();
});

test('only explicit matching capability flags disable controls; horn setting does not disable search', async ({ page, mocks }) => {
  mocks.home = { supportNetworkUnlock: false, supportUnlock: true, openCushionFlag: '0', loudlySearchCar: 0 };
  await open(page); await login(page); await daily(page);
  await expect(page.locator('[data-value="powerOn"]')).toBeDisabled();
  await expect(page.locator('[data-value="powerOff"]')).toBeDisabled();
  await expect(page.locator('[data-value="seat"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: '鸣笛寻车 普通／高声' })).toBeEnabled();
  mocks.home = { supportUnlock: false, loudlySearchCar: false };
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('[data-value="powerOn"]')).toBeEnabled();
  await expect(page.locator('[data-value="seat"]')).toBeEnabled();
  expect(commands(mocks.calls)).toHaveLength(0);
});

for (const crs of ['wgs84', 'unknown']) {
  test(`navigation handles explicitly reported ${crs} without assuming route coordinates`, async ({ page, mocks }) => {
    mocks.home = { location: { longitude: 116.397, latitude: 39.908, coordinateSystem: crs } };
    await open(page); await login(page); await daily(page);
    expect(await page.getByRole('link', { name: '步行导航到车辆' }).count()).toBe(0);
    if (crs === 'wgs84') {
      const link = new URL((await page.getByRole('link', { name: '查看地图', exact: true }).getAttribute('href'))!);
      expect(link.searchParams.get('coordinate')).toBe('wgs84');
    } else expect(await page.getByRole('link', { name: '查看地图', exact: true }).count()).toBe(0);
  });
}

test('demo and offline daily views never enable commands or navigation', async ({ page, context, mocks }) => {
  await open(page);
  await page.getByRole('button', { name: '先体验面板' }).click(); await daily(page);
  await expect(page.getByText('演示数据 · 不会连接或控制车辆')).toBeVisible();
  for (const button of await page.locator('.control-grid button').all()) await expect(button).toBeDisabled();
  expect(await page.getByRole('link').count()).toBe(0);
  expect(mocks.calls).toHaveLength(0);
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  await page.getByRole('button', { name: '退出演示', exact: true }).click();
  mocks.home = { location: { longitude: 116.397, latitude: 39.908 } };
  await login(page); await daily(page);
  await context.setOffline(true);
  for (const button of await page.locator('.control-grid button').all()) await expect(button).toBeDisabled();
  expect(await page.getByRole('link').count()).toBe(0);
  expect(commands(mocks.calls)).toHaveLength(0);
});

for (const [action, title] of Object.entries({ powerOn: '云开锁（上电）', powerOff: '云关锁（关机）', seat: '打开座桶' })) {
  test(`${action} requires vehicle confirmation and matches the independent recovered contract`, async ({ page, mocks }) => {
    await open(page); await login(page); await daily(page);
    await page.locator(`[data-action="vehicle-action"][data-value="${action}"]`).click();
    await expect(page.getByRole('dialog')).toContainText('测试极核 A');
    await expect(page.getByRole('dialog')).toContainText(VIN_A.slice(-6));
    if (action === 'powerOff') await expect(page.getByRole('dialog')).toContainText('请在停车后操作');
    expect(commands(mocks.calls)).toHaveLength(0);
    await page.getByRole('button', { name: `确认${title}`, exact: true }).click();
    await expect(page.locator('.notice')).toContainText(`${title}请求已提交`);
    expect(commands(mocks.calls).map(({ method, path, body }) => ({ method, path, body }))).toEqual(contract.actions[action]);
    expect(commands(mocks.calls).every(call => call.authorization === 'Bearer synthetic-token')).toBe(true);
    await expect(row(page, '车辆锁状态')).toHaveText('未知');
    await page.getByRole('button', { name: '查看车控结果', exact: true }).click();
    const summary = page.locator('.diagnostic-summary');
    await expect(summary).toContainText(`操作：${title}`);
    await expect(summary).toContainText('车控下发：服务已受理');
    for (const value of [VIN_A, 'synthetic-token', 'synthetic-user', '13800000000', 'secret', 'vinNo']) await expect(summary).not.toContainText(value);
  });
}

for (const stage of ['prepare', 'unlock'] as const) {
  for (const result of ['false', 'network', 'expired'] as const) {
    test(`power command ${stage} ${result} stops the entire chain without fallback or retry`, async ({ page, mocks }) => {
      mocks.commandResults[stage] = result;
      await open(page); await login(page); await daily(page);
      await page.locator('[data-action="vehicle-action"][data-value="powerOn"]').click();
      await page.getByRole('button', { name: '确认云开锁（上电）', exact: true }).click();
      await expect(page.locator('#modal-message')).toContainText(result === 'expired' ? '登录信息已失效' : '执行结果尚未确认');
      if (result === 'expired') await expect(page.locator('[data-action="send-control"]')).toBeDisabled();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.locator('.notice')).not.toContainText('请求已提交');
      expect(commands(mocks.calls)).toHaveLength(stage === 'prepare' ? 1 : 2);
      if (result === 'expired') {
        for (const button of await page.locator('.control-grid button').all()) await expect(button).toBeDisabled();
        await expect(page.getByRole('button', { name: '重新登录', exact: true })).toBeVisible();
      }
    });
  }
}

for (const stage of ['prepare', 'unlock', 'seat'] as const) {
  test(`cancel at ${stage} ignores late acceptance and cannot send an old action from a new confirmation`, async ({ page, mocks }) => {
    let release!: () => void;
    mocks.holdCommand = { stage, wait: new Promise<void>(resolve => { release = resolve; }) };
    await open(page); await login(page); await daily(page);
    const action = stage === 'seat' ? 'seat' : 'powerOn';
    await page.locator(`[data-action="vehicle-action"][data-value="${action}"]`).click();
    await page.locator('[data-action="send-control"]').click();
    const count = stage === 'unlock' ? 2 : 1;
    await expect.poll(() => commands(mocks.calls).length).toBe(count);
    await expect(page.locator('[data-action="send-control"]')).toBeDisabled();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    release();
    await expect(page.locator('.notice')).toContainText('请求结果尚未确认');
    await page.getByRole('button', { name: '查看车控结果', exact: true }).click();
    await expect(page.locator('.diagnostic-summary')).toContainText('已停止等待');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '鸣笛寻车 普通／高声' }).click();
    // A stale/malicious button with the previous action must not bypass intent binding.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.dataset.action = 'send-control'; button.dataset.value = 'powerOn';
      document.querySelector('dialog')!.append(button); button.click(); button.remove();
    });
    expect(commands(mocks.calls)).toHaveLength(count);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  });
}

test('switching vehicles binds new controls to the new selection and logout clears receipts', async ({ page, mocks }) => {
  await open(page); await login(page); await daily(page);
  await page.locator('[data-action="vehicle-action"][data-value="powerOn"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page.getByRole('button', { name: '测试极核 B' }).click();
  await expect(page.getByRole('heading', { name: '测试极核 B' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled(); await daily(page);
  await page.locator('[data-action="vehicle-action"][data-value="seat"]').click();
  await expect(page.getByRole('dialog')).toContainText('测试极核 B');
  await page.locator('[data-action="send-control"]').click();
  await expect(page.locator('.notice')).toContainText('打开座桶请求已提交');
  expect(commands(mocks.calls)).toEqual([expect.objectContaining({ body: expect.objectContaining({ vcu: VIN_B }) })]);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '退出本机登录', exact: true }).click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录并连接' })).toBeEnabled(); await daily(page);
  expect(await page.getByRole('button', { name: '查看车控结果', exact: true }).count()).toBe(0);
  for (const button of await page.locator('.control-grid button').all()) await expect(button).toBeDisabled();
});
