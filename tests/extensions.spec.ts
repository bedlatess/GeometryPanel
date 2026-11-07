import { test, expect, open, login, VIN_A, type ExtensionMocks, type Call } from './fixtures';
import type { Page } from '@playwright/test';

const sample = (): ExtensionMocks => ({
  month: { rideMileageTotal: 1234, rideRecordList: [{ date: '2026.10.06', rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 }] },
  tracks: [{ historyList: [{ rideId: 'trip-a', dayTime: '2026-10-06', startTime: '2026-10-06 08:10', endTime: '2026-10-06 08:38', rideMileage: 12.4, ridingTimeUnitMinute: 28, maxSpeed: 39, startAddr: '{"name":"合成起点"}', endAddr: '{"name":"合成终点"}', trajectory: '120,30&invalid,0&120.01,30.01&120.02,30.02' }] }],
  tires: { updateTime: Date.now(), realTimeData: [{ sensorPosition: 1, tirePressure: 0, tireTemp: -5, warningType: 2, reportTime: Date.now() - 3600_000 }, { sensorPosition: 2, tirePressure: [], tireTemp: 0 }] },
  alerts: { noRead: 2, messageVOList: [{ messageId: 'a', vinNo: VIN_A, content: '<img src=x onerror=alert(1)>', unread: '0', extra: '{"detail":"合成告警详情"}' }, { messageId: 'b', vinNo: 'OTHER-CAR', content: '其他车辆消息不应显示' }, { messageId: 'c', content: '未注明车辆的合成消息' }] },
  capabilities: [{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }, { functionCode: 'AUTOMATIC_PARKING_GO', isSupport: false }],
  settings: { precisionEndurance: 1, automaticParking: 0, mileageUnit: 1 },
});
const panel = (page: Page) => page.locator('#extension-panel');
async function show(page: Page) {
  await page.getByRole('button', { name: '用车', exact: true }).click();
  await page.getByRole('button', { name: '骑行记录、胎压与车辆设置', exact: true }).click();
}
const writes = (calls: Call[]) => calls.filter(call => call.method === 'PUT' && /\/vehicleSet\/(propertyOne\/one|soundSize|motoPlay\/one)$/.test(call.path));

test('extensions load month records and actual track geometry with exact recovered query fields', async ({ page, mocks }) => {
  mocks.extensions = sample(); await open(page); await login(page); await show(page);
  await expect(panel(page).getByText('12.4 km')).toBeVisible();
  await panel(page).getByLabel('选择月份').fill('2026-10');
  await panel(page).getByRole('button', { name: '读取本月记录', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '刷新当前分类', exact: true })).toBeEnabled();
  expect(mocks.calls.filter(call => call.path.endsWith('/myRideInfo')).at(-1)?.query).toEqual({ month: '2026.10', vinNo: VIN_A });
  await panel(page).getByRole('button', { name: '查看当天轨迹' }).click();
  await panel(page).locator('summary').click();
  await expect(panel(page).getByRole('img', { name: '本次行程轨迹示意，不含道路底图' })).toBeVisible();
  const path = await panel(page).locator('svg path').getAttribute('d');
  expect(path?.split('M').length).toBe(3);
  expect(mocks.calls.find(call => call.path.endsWith('/ridetrack_v2'))?.query).toEqual({ page: '1', pageSize: '20', startDateTime: '2026-10-06', startTime: '2026-10', vinNo: VIN_A });
  await expect(panel(page).getByRole('link', { name: '在地图查看起点' })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(mocks.maps).toEqual([]); expect(writes(mocks.calls)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('tires, scoped alerts and failed categories retain clear states and escape upstream text', async ({ page, mocks }) => {
  mocks.extensions = sample(); await open(page); await login(page); await show(page);
  await panel(page).getByRole('button', { name: '胎压', exact: true }).click();
  await expect(panel(page).getByText('0 bar', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('-5 ℃', { exact: true })).toBeVisible();
  await expect(panel(page).getByText(/数据较早/)).toBeVisible();
  await panel(page).getByRole('button', { name: '车辆告警', exact: true }).click();
  await expect(panel(page).getByText('<img src=x onerror=alert(1)> · 未读', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('其他车辆消息不应显示')).toHaveCount(0);
  await expect(panel(page).getByText('未注明车辆的合成消息', { exact: true })).toBeVisible();
  expect(await panel(page).locator('img').count()).toBe(0);
  mocks.extensions.fail = 'tires';
  await panel(page).getByRole('button', { name: '胎压', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('服务端未接受');
  mocks.extensions.fail = undefined;
  await panel(page).getByRole('button', { name: '刷新当前分类', exact: true }).click();
  await expect(panel(page).getByRole('heading', { name: '前轮', exact: true })).toBeVisible();
});

test('settings require explicit confirmation, respect capability blocks and reread after acceptance', async ({ page, mocks }) => {
  mocks.extensions = sample(); await open(page); await login(page); await show(page);
  await panel(page).getByRole('button', { name: '车辆设置', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '修改自动驻车', exact: true })).toBeDisabled();
  await panel(page).getByLabel('精准续航目标设置', { exact: true }).selectOption('0');
  await panel(page).getByRole('button', { name: '修改精准续航', exact: true }).click();
  await expect(panel(page).getByLabel('确认修改车辆设置')).toContainText('测试极核 A');
  expect(writes(mocks.calls)).toEqual([]);
  await panel(page).getByRole('button', { name: '取消', exact: true }).click();
  expect(writes(mocks.calls)).toEqual([]);
  await panel(page).getByLabel('精准续航目标设置', { exact: true }).selectOption('0');
  await panel(page).getByRole('button', { name: '修改精准续航', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认发送修改', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('服务已受理修改');
  expect(writes(mocks.calls)).toHaveLength(1);
  expect(writes(mocks.calls)[0].body).toEqual({ commond: '55', commondParam: '0', relatedFunctions: null, vcu: VIN_A, version: '' });
  await expect(panel(page).getByLabel('精准续航目标设置', { exact: true })).toHaveValue('0');
  expect(await panel(page).textContent()).not.toContain('synthetic-token');
});

test('uncertain setting failure never retries and closing aborts a pending read', async ({ page, mocks }) => {
  mocks.extensions = sample(); mocks.extensions.writeFailure = 'network';
  await open(page); await login(page); await show(page);
  await panel(page).getByRole('button', { name: '车辆设置', exact: true }).click();
  await panel(page).getByLabel('精准续航目标设置', { exact: true }).selectOption('0');
  await panel(page).getByRole('button', { name: '修改精准续航', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认发送修改', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('未自动重发');
  expect(writes(mocks.calls)).toHaveLength(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  mocks.extensions.hold = { kind: 'month', wait: waiting };
  await show(page);
  await expect(panel(page).getByRole('status')).toContainText('正在处理');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '日常用车', exact: true })).toBeVisible();
});

test('demo extensions stay synthetic and cannot write even after a forged form submission', async ({ page, mocks }) => {
  await open(page); await page.getByRole('button', { name: '先体验面板', exact: true }).click(); await show(page);
  await expect(panel(page).getByText(/以下全部为合成数据/)).toBeVisible();
  for (const name of ['历史轨迹', '胎压', '车辆告警', '车辆设置']) await panel(page).getByRole('button', { name, exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '修改精准续航', exact: true })).toBeDisabled();
  await panel(page).locator('form[data-ext-setting]').first().evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(panel(page).getByLabel('确认修改车辆设置')).toHaveCount(0);
  expect(mocks.calls).toEqual([]);
});

test('cloud inductive switch uses owner-checked native materials contract and confirms reported state', async ({ page, mocks }) => {
  mocks.extensions = sample(); mocks.extensions.settings.inductiveUnlocking2 = 0;
  mocks.home = { vinNo: VIN_A, bindingUserId: 'synthetic-user', sharedFlag: false, inductiveUnlocking2: 1 };
  await open(page); await login(page); await show(page);
  await panel(page).getByRole('button', { name: '车辆设置', exact: true }).click();
  await panel(page).getByLabel('车辆感应钥匙开关目标设置', { exact: true }).selectOption('1');
  await panel(page).getByRole('button', { name: '修改车辆感应钥匙开关', exact: true }).click();
  expect(mocks.calls.filter(call => call.path.endsWith('/airLock/setting'))).toHaveLength(0);
  await panel(page).getByRole('button', { name: '确认发送修改', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('云端感应钥匙开关已读后核实');
  const changes = mocks.calls.filter(call => call.path.endsWith('/airLock/setting'));
  expect(changes).toHaveLength(1);
  expect(changes[0].body).toEqual({ inductiveUnlockType: '', openStatus: 1, uniqueIdentify: '', vinNo: VIN_A });
});

test('extension authentication expiry closes the panel and returns to the existing reconnect flow', async ({ page, mocks }) => {
  mocks.extensions = sample(); await open(page); await login(page); await show(page);
  await expect(panel(page).getByText('12.4 km')).toBeVisible();
  mocks.extensions.expired = true;
  await panel(page).getByRole('button', { name: '胎压', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重新登录', exact: true })).toBeVisible();
  expect(writes(mocks.calls)).toEqual([]);
});

test('closing an in-flight setting keeps an uncertain-result warning and never replays it', async ({ page, mocks }) => {
  mocks.extensions = sample();
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  mocks.extensions.hold = { kind: 'write', wait: waiting };
  await open(page); await login(page); await show(page);
  await panel(page).getByRole('button', { name: '车辆设置', exact: true }).click();
  await panel(page).getByLabel('精准续航目标设置', { exact: true }).selectOption('0');
  await panel(page).getByRole('button', { name: '修改精准续航', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认发送修改', exact: true }).click();
  await expect.poll(() => writes(mocks.calls).length).toBe(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('main').getByRole('status')).toContainText('结果尚未确认');
  expect(writes(mocks.calls)).toHaveLength(1);
});
