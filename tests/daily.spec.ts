import { readFileSync } from 'node:fs';
import { navigate, control, report, developerLab, test, expect, open, login, VIN_A, VIN_B, type Call } from './fixtures';

const contract = JSON.parse(readFileSync(new URL('../docs/dev/verification/recovered-controls-contract.json', import.meta.url), 'utf8'));
const commands = (calls: Call[]) => calls.filter(call => /dbpoint\/send|vehicleInfo\/control|vehicleSet\/(network\/unlock|propertyTwo\/one)/.test(call.path));
const daily = async (page: import('@playwright/test').Page) => navigate(page, '/vehicle/status');
const row = (page: import('@playwright/test').Page, name: string) => page.locator('main:visible ion-item').filter({has:page.locator('ion-label').filter({hasText:new RegExp(`^${name}$`)})}).locator('.row-value');
const stat = (page: import('@playwright/test').Page,name:string) => page.locator('main:visible .stat').filter({has:page.locator('span').filter({hasText:new RegExp(`^${name}$`)})}).locator('.metric-value');

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
  await expect(stat(page,'总里程')).toHaveText('1,234.5km');
  for (const [name,value] of Object.entries({'本月时长':'1 小时 30 分','本月均速':'32.4 km/h','座桶':'未锁'})) await expect(row(page,name)).toHaveText(value);
  await navigate(page,'/vehicle/status?tab=battery');
  await expect(stat(page,'温度')).toHaveText('28°C');
  for (const [name,value] of Object.entries({'电流':'-3.2 A','功率':'-240 W','累计充电':'42 次','充电已用时长':'1 小时 20 分钟','预计充满':'预计 14:30 充满'})) await expect(row(page,name)).toHaveText(value);
  await expect(page.locator('main:visible')).toContainText('正在充电');
  await navigate(page,'/vehicle/location');await expect(page.locator('main:visible').getByText(/小时前/).first()).toBeVisible();
  await navigate(page,'/vehicle/status');await page.locator('main:visible .foot').click();await expect(page.locator('#runtime-modal')).toContainText('时间异常');await page.keyboard.press('Escape');await navigate(page,'/vehicle/location');
  await page.getByRole('button',{name:'坐标信息',exact:true}).click();
  const map = new URL((await page.getByRole('link', { name: '在地图中打开', exact: true }).getAttribute('href'))!);
  expect(map.origin).toBe('https://uri.amap.com');
  expect(map.searchParams.get('position')).toBe('116.397000,39.908000');
  expect(map.searchParams.get('coordinate')).toBe('gaode');
  await navigate(page,'/vehicle/location');
  const walk = new URL((await page.getByRole('link', { name: '步行找车' }).getAttribute('href'))!);
  expect(walk.searchParams.get('mode')).toBe('walk');
  expect(walk.searchParams.get('to')).toBe('116.397000,39.908000,车辆位置');
  await navigate(page,'/vehicle/location/coordinates');await expect(page.getByRole('link', { name: '在地图中打开', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(commands(mocks.calls)).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/daily-synthetic-mobile.png', fullPage: true });
});

test('partial battery data and missing reports remain unknown and server text is escaped', async ({ page, mocks }) => {
  mocks.batteryFailure = true;
  mocks.home = { current: 2, voltage: 72, totalRideMile: 0, rideState: '<img src=x onerror=alert(1)>' };
  await open(page); await login(page); await daily(page);
  await expect(stat(page,'总里程')).toHaveText('0km');
  await expect(row(page,'当前')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(row(page,'车头')).toHaveText('—');
  await page.locator('main:visible .foot').click();await expect(page.locator('#runtime-modal')).toContainText('时间未知');await page.keyboard.press('Escape');
  await navigate(page,'/vehicle/status?tab=battery');
  await expect(row(page, '功率')).toHaveText('144 W');
  await expect(stat(page,'健康度')).toHaveText('—%');
  await expect(row(page, '累计充电')).toHaveText('—');
  expect(await page.locator('main img').count()).toBe(0);
  await navigate(page,'/vehicle');await expect(page.locator('main .lever')).toBeEnabled();
});

test('only explicit matching capability flags disable controls; horn setting does not disable search', async ({ page, mocks }) => {
  mocks.home = { supportNetworkUnlock: false, supportUnlock: true, openCushionFlag: '0', loudlySearchCar: 0 };
  await open(page); await login(page); await daily(page);
  await navigate(page,'/vehicle');await expect(page.locator('main .lever')).toBeDisabled();
  await expect(page.getByRole('button',{name:'座桶',exact:true})).toBeDisabled();
  await expect(page.getByRole('button', { name: '寻车',exact:true })).toBeEnabled();
  mocks.home = { supportUnlock: false, loudlySearchCar: false };
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('main .lever')).toBeEnabled();
  await expect(page.getByRole('button',{name:'座桶',exact:true})).toBeEnabled();
  expect(commands(mocks.calls)).toHaveLength(0);
});

for (const crs of ['wgs84', 'bd09']) {
  test(`navigation handles explicitly reported ${crs} without assuming route coordinates`, async ({ page, mocks }) => {
    mocks.home = { location: { longitude: 116.397, latitude: 39.908, coordinateSystem: crs } };
    await open(page); await login(page); await daily(page);
    await navigate(page,'/vehicle/location');expect(await page.getByRole('link', { name: '步行找车' }).count()).toBe(0);
    await navigate(page,'/vehicle/location/coordinates');
    if (crs === 'wgs84') {
    const link = new URL((await page.getByRole('link', { name: '在地图中打开', exact: true }).getAttribute('href'))!);
      expect(link.searchParams.get('coordinate')).toBe('wgs84');
    } else expect(await page.getByRole('link', { name: '在地图中打开', exact: true }).count()).toBe(0);
  });
}

for (const crs of [0, 1, 2, 'unknown']) {
  test(`opaque vehicle coordinate tag ${crs} does not hide the map or invent an address`, async ({ page, mocks }) => {
    mocks.home = { location: { longitude: 116.397, latitude: 39.908, coordinateSystem: crs } };
    await open(page); await login(page); await daily(page);
    await navigate(page,'/vehicle/location');await expect(page.getByText('查看位置').first()).toBeVisible();
    await expect(page.getByText(/位置的坐标类型未标明/)).toHaveCount(0);
    expect(mocks.maps).toHaveLength(0);
    await page.getByRole('button',{name:'坐标信息',exact:true}).click();
    const link = new URL((await page.getByRole('link', { name: '在地图中打开', exact: true }).getAttribute('href'))!);
    expect(link.searchParams.get('coordinate')).toBe('gaode');
    await expect(page.getByRole('heading',{name:'坐标',exact:true})).toBeVisible();
    await expect(page.getByText('高德（GCJ-02）')).toBeVisible();
    await navigate(page,'/vehicle/location');await page.getByRole('button', { name: '查看地图', exact: true }).click();
    await expect(page.frameLocator('iframe.vehicle-map').getByText('模拟地图 · 合成停车点')).toBeVisible();
    expect(mocks.maps).toHaveLength(1);
    expect(commands(mocks.calls)).toHaveLength(0);
    await page.getByRole('button', { name: '关闭地图', exact: true }).click();
    await expect(page.locator('iframe.vehicle-map')).toHaveCount(0);
  });
}

test('demo and offline daily views never enable commands or navigation', async ({ page, context, mocks }) => {
  await open(page);
  await page.getByRole('button', { name: '先看看演示' }).click(); await daily(page);
  await navigate(page,'/vehicle/location');await expect(page.getByText('演示中不可用')).toBeVisible();
  expect(await page.locator('a[href^="https://"]:visible').count()).toBe(0);
  expect(mocks.calls).toHaveLength(0);
  await page.getByRole('tab', { name: '车辆', exact: true }).click();
  await navigate(page,'/me');await page.getByRole('button', { name: '退出演示', exact: true }).click();
  mocks.home = { location: { longitude: 116.397, latitude: 39.908 } };
  await login(page); await daily(page);
  await navigate(page,'/vehicle');await context.setOffline(true);
  for (const button of await page.locator('.vehicle-home:visible .lever,.vehicle-home:visible .quick-action[aria-disabled=true]').all()) await expect(button).toBeDisabled();
  expect(await page.locator('a[href^="https://"]:visible').count()).toBe(0);
  expect(commands(mocks.calls)).toHaveLength(0);
});

for (const [action, title] of Object.entries({ powerOn: '云开锁（上电）', powerOff: '云关锁（关机）', seat: '打开座桶' })) {
  test(`${action} requires vehicle confirmation and matches the independent recovered contract`, async ({ page, mocks }) => {
    await open(page); await login(page); await daily(page);
    await control(page,action);
    await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('测试极核 A');
    await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText(VIN_A.slice(-6));
    if (action === 'powerOff') await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('关机锁车');
    expect(commands(mocks.calls)).toHaveLength(0);
    await page.getByRole('button', { name: action === 'powerOn' ? '上电开锁' : action === 'powerOff' ? '关机锁车' : '打开座桶', exact: true }).click();
    await expect(page.locator('.notice')).toContainText('等待车辆响应');
    expect(commands(mocks.calls).map(({ method, path, body }) => ({ method, path, body }))).toEqual(contract.actions[action]);
    expect(commands(mocks.calls).every(call => call.authorization === 'Bearer synthetic-token')).toBe(true);
    await navigate(page,'/vehicle/status');await expect(row(page,'车辆')).toHaveText('锁状态未知');
    await navigate(page,'/tools/diagnostics');
    const summary = await report(page);
    await expect(summary).toContain(`操作：${title}`);
    await expect(summary).toContain('车控下发：服务已受理');
    for (const value of [VIN_A, 'synthetic-token', 'synthetic-user', '13800000000', 'secret', 'vinNo']) await expect(summary).not.toContain(value);
  });
}

for (const stage of ['prepare', 'unlock'] as const) {
  for (const result of ['false', 'network', 'expired'] as const) {
    test(`power command ${stage} ${result} stops the entire chain without fallback or retry`, async ({ page, mocks }) => {
      mocks.commandResults[stage] = result;
      await open(page); await login(page); await daily(page);
      await control(page,'powerOn');
      await page.getByRole('button', { name: '上电开锁', exact: true }).click();
      await expect(page.locator('#modal-message')).toContainText(result === 'expired' ? '登录已过期' : '没收到车辆响应，先看一眼车');
      if (result === 'expired') await expect(page.locator('ion-button[data-action="send-control"] button')).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.locator('.notice')).not.toContainText('请求已提交');
      expect(commands(mocks.calls)).toHaveLength(stage === 'prepare' ? 1 : 2);
      if (result === 'expired') {
        for (const button of await page.locator('.vehicle-home:visible .lever,.vehicle-home:visible .quick-action[aria-disabled=true]').all()) await expect(button).toBeDisabled();
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
    await control(page,action);
    await page.locator('ion-button[data-action="send-control"] button').click();
    const count = stage === 'unlock' ? 2 : 1;
    await expect.poll(() => commands(mocks.calls).length).toBe(count);
    await expect(page.locator('ion-button[data-action="send-control"] button')).toBeDisabled();
    await page.keyboard.press('Escape');
    release();
    await expect(page.locator('.notice')).toContainText('已发出，结果待确认');
    await navigate(page,'/tools/diagnostics');
    expect(await report(page)).toContain('已停止等待');
    await navigate(page,'/vehicle');
    await page.getByRole('button', { name: '寻车',exact:true }).click();
    // A stale/malicious button with the previous action must not bypass intent binding.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.dataset.action = 'send-control'; button.dataset.value = 'powerOn';
      document.querySelector('#runtime-modal')!.append(button); button.click(); button.remove();
    });
    expect(commands(mocks.calls)).toHaveLength(count);
    await page.keyboard.press('Escape');
  });
}

test('switching vehicles binds new controls to the new selection and logout clears receipts', async ({ page, mocks }) => {
  await open(page); await login(page); await daily(page);
  await control(page,'powerOn');
  await page.keyboard.press('Escape');
  await navigate(page,'/me');
  await navigate(page,'/vehicle'); await page.getByRole('button',{name:'切换车辆',exact:true}).click();
  await page.getByRole('button', { name: '测试极核 B' }).click();
  await expect(page.getByRole('heading', { name: '测试极核 B' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled(); await daily(page);
  await control(page,'seat');
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('测试极核 B');
  await page.locator('ion-button[data-action="send-control"] button').click();
  await expect(page.locator('.notice')).toContainText('等待车辆响应');
  expect(commands(mocks.calls)).toEqual([expect.objectContaining({ body: expect.objectContaining({ vcu: VIN_B }) })]);
  await navigate(page,'/me');
  await navigate(page,'/me/accounts'); await page.getByRole('button',{name:'退出全部账号',exact:true}).click();
  await page.locator('ion-modal:not(.overlay-hidden)').getByRole('button', { name: '退出全部账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录极核账号',exact:true })).toBeEnabled(); await expect(page).toHaveURL(/#\/vehicle$/);
  expect(await page.getByRole('button', { name: '查看车控结果', exact: true }).count()).toBe(0);
  for (const button of await page.locator('.vehicle-home:visible .lever,.vehicle-home:visible .quick-action[aria-disabled=true]').all()) await expect(button).toBeDisabled();
});
