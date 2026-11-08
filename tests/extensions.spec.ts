import {
  navigate,
  control,
  report,
  developerLab,
  test,
  expect,
  open,
  login,
  VIN_A,
  type ExtensionMocks,
  type Call,
} from './fixtures';
import type { Page } from '@playwright/test';

const sample = (): ExtensionMocks => ({
  month: {
    rideMileageTotal: 1234,
    rideRecordList: [
      { date: '2026.10.06', rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 },
    ],
  },
  tracks: [
    {
      historyList: [
        {
          rideId: 'trip-a',
          dayTime: '2026-10-06',
          startTime: '2026-10-06 08:10',
          endTime: '2026-10-06 08:38',
          rideMileage: 12.4,
          ridingTimeUnitMinute: 28,
          maxSpeed: 39,
          startAddr: '{"name":"合成起点"}',
          endAddr: '{"name":"合成终点"}',
          trajectory: '120,30&invalid,0&120.01,30.01&120.02,30.02',
        },
      ],
    },
  ],
  tires: {
    updateTime: Date.now(),
    realTimeData: [
      {
        sensorPosition: 1,
        tirePressure: 0,
        tireTemp: -5,
        warningType: 2,
        reportTime: Date.now() - 3600_000,
      },
      { sensorPosition: 2, tirePressure: [], tireTemp: 0 },
    ],
  },
  alerts: {
    noRead: 2,
    messageVOList: [
      {
        messageId: 'a',
        vinNo: VIN_A,
        content: '<img src=x onerror=alert(1)>',
        unread: '0',
        extra: '{"detail":"合成告警详情"}',
      },
      { messageId: 'b', vinNo: 'OTHER-CAR', content: '其他车辆消息不应显示' },
      { messageId: 'c', content: '未注明车辆的合成消息' },
    ],
  },
  capabilities: [
    { functionCode: 'PRECISION_ENDURANCE', isSupport: true },
    { functionCode: 'AUTOMATIC_PARKING_GO', isSupport: false },
  ],
  settings: { precisionEndurance: 1, automaticParking: 0, mileageUnit: 1 },
});
const panel = (page: Page) => page.locator('main:visible').last();
async function show(page: Page) {
  await navigate(page, '/vehicle/status');
  await navigate(page, '/records/rides');
}
const writes = (calls: Call[]) =>
  calls.filter(
    (call) =>
      call.method === 'PUT' &&
      /\/vehicleSet\/(propertyOne\/one|soundSize|motoPlay\/one)$/.test(call.path),
  );

test('extensions load month records and actual track geometry with exact recovered query fields', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  await open(page);
  await login(page);
  await show(page);
  await expect(panel(page).locator('.record-metric .metric-value')).toHaveText('12.4km');
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await expect
    .poll(
      () => mocks.calls.filter((call) => call.path.endsWith('/myRideInfo')).at(-1)?.query?.month,
    )
    .toBe('2026.10');
  expect(mocks.calls.filter((call) => call.path.endsWith('/myRideInfo')).at(-1)?.query).toEqual({
    month: '2026.10',
    vinNo: VIN_A,
  });
  await panel(page).locator('ion-item').filter({ hasText: '12.4 km' }).click();
  await expect(panel(page).getByRole('heading', { name: /08:10 — 08:38/ })).toBeVisible();
  await expect(panel(page).getByRole('img', { name: '行程轨迹' })).toBeVisible();
  const path = await panel(page).locator('svg.track-drawing path').getAttribute('d');
  expect(path?.split('M').length).toBe(3);
  expect(mocks.calls.find((call) => call.path.endsWith('/ridetrack_v2'))?.query).toEqual({
    page: '1',
    pageSize: '20',
    startDateTime: '2026-10-06',
    startTime: '2026-10',
    vinNo: VIN_A,
  });
  await expect(panel(page).getByRole('link', { name: '查看起点' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(mocks.maps).toEqual([]);
  expect(writes(mocks.calls)).toEqual([]);
  expect(mocks.roadTiles).toEqual([]);
  await panel(page).getByRole('button', { name: '加载道路底图', exact: true }).click();
  await expect(panel(page).getByRole('img', { name: '历史轨迹与高德道路底图' })).toBeVisible();
  await expect.poll(() => mocks.roadTiles.length).toBeGreaterThan(0);
  expect(
    (await panel(page).locator('svg.track-drawing path').getAttribute('d'))?.split('M').length,
  ).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('account-wide message actions require scope confirmation and never run merely by viewing', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/messages');
  const messageWrites = () =>
    mocks.calls.filter((call) => /\/Message\/(read|delete)$/.test(call.path));
  await expect(panel(page)).toContainText('车辆账号');
  expect(messageWrites()).toEqual([]);
  await page.getByRole('button', { name: '全部已读', exact: true }).click();
  expect(messageWrites()).toEqual([]);
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('此账号全部车辆');
  await page
    .locator('ion-modal:not(.overlay-hidden)')
    .getByRole('button', { name: '全部已读', exact: true })
    .click();
  await expect(panel(page).getByRole('status')).toContainText('已更新');
  expect(messageWrites()[0].query).toEqual({ messageKind: '3' });
  await panel(page).getByRole('button', { name: '删除全部', exact: true }).click();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('此账号全部车辆');
  await page
    .locator('ion-modal:not(.overlay-hidden)')
    .getByRole('button', { name: '删除全部', exact: true })
    .click();
  await expect(panel(page).getByRole('status')).toContainText('已更新');
  expect(messageWrites()).toHaveLength(2);
});

test('tires, scoped alerts and failed categories retain clear states and escape upstream text', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/records/tires');
  await expect(panel(page).locator('.pressure').first()).toContainText('0bar');
  await expect(panel(page).locator('.pressure').first()).toContainText('-5 °C');
  await expect(panel(page).locator('.pressure').first()).toHaveAttribute('title', /小时前/);
  await navigate(page, '/vehicle/messages');
  await expect(
    panel(page).getByText('<img src=x onerror=alert(1)>', { exact: true }),
  ).toBeVisible();
  await expect(panel(page).getByText('其他车辆消息不应显示')).toHaveCount(0);
  await panel(page).locator('ion-segment-button').filter({ hasText: '账号' }).click();
  await expect(panel(page).getByText('未注明车辆的合成消息', { exact: true })).toBeVisible();
  expect(await panel(page).locator('img').count()).toBe(0);
  mocks.extensions.fail = 'tires';
  await navigate(page, '/records/tires');
  await expect(panel(page).getByRole('alert').first()).toContainText('加载失败');
  mocks.extensions.fail = undefined;
  await page
    .locator('[data-page="/records"]:not(.ion-page-hidden) ion-refresher')
    .evaluate((el) => el.dispatchEvent(new CustomEvent('ionRefresh', { bubbles: true })));
  await expect(panel(page).locator('.pressure').first()).toContainText('前轮');
});

test('settings require explicit confirmation, respect capability blocks and reread after acceptance', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/settings');
  await panel(page).getByText('此车型不支持的功能', { exact: true }).click();
  await expect(
    page.locator('ion-modal:not(.overlay-hidden)').getByText('自动驻车', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('ion-modal:not(.overlay-hidden)').getByRole('button', { name: /自动驻车/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setting(page, '精准续航', '关闭');
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('测试极核 A');
  expect(writes(mocks.calls)).toEqual([]);
  await page
    .locator('ion-modal:not(.overlay-hidden)')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  expect(writes(mocks.calls)).toEqual([]);
  await setting(page, '精准续航', '关闭');
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('已生效');
  expect(writes(mocks.calls)).toHaveLength(1);
  expect(writes(mocks.calls)[0].body).toEqual({
    commond: '55',
    commondParam: '0',
    relatedFunctions: null,
    vcu: VIN_A,
    version: '',
  });
  await expect(panel(page).getByRole('switch', { name: '精准续航' })).not.toBeChecked();
  expect(await panel(page).textContent()).not.toContain('synthetic-token');
});

test('custom single-key actions use recovered choices while a changed cushion generation blocks stale writes', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  mocks.extensions.capabilities = [
    { functionCode: 'CUSTOM_KEY_SET', isSupport: true },
    { functionCode: 'E_CUSHION_SENSOR', isSupport: true },
  ];
  mocks.extensions.settings = {
    customButtonSingle: 31,
    cushionSensor: 0,
    ecushionSensor: 0,
    maximumSpeedLimit: 45,
    rideFunctionVOList: [{ parentCode: 'E_CUSHION_SENSOR', functionCode: '2.0' }],
  };
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/settings');
  await expect(panel(page).getByRole('button', { name: /最高车速限制/ })).toHaveCount(0);
  await expect(panel(page).locator('.list-row').filter({ hasText: '最高车速限制' })).toContainText(
    '45',
  );
  await expect(panel(page).getByLabel('座垫感应 1.0目标设置', { exact: true })).toHaveCount(0);
  await setting(page, '按键单击', '解锁座垫');
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect(panel(page).locator('ion-item').filter({ hasText: '按键单击' })).toContainText(
    '解锁座垫',
  );
  expect(writes(mocks.calls)[0].body).toEqual({
    commond: '142',
    commondParam: '3',
    relatedFunctions: null,
    vcu: VIN_A,
    version: 'v2',
  });
  await setting(page, '座垫感应 2.0', '开启');
  mocks.extensions.settings.rideFunctionVOList = [];
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('修改未生效');
  expect(writes(mocks.calls)).toHaveLength(1);
});

test('uncertain setting failure never retries and closing aborts a pending read', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  mocks.extensions.writeFailure = 'network';
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/settings');
  await setting(page, '精准续航', '关闭');
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('已发出，车辆尚未确认');
  expect(writes(mocks.calls)).toHaveLength(1);
  await navigate(page, '/tools');
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.extensions.hold = { kind: 'month', wait: waiting };
  await show(page);
  await expect
    .poll(() => mocks.calls.filter((c) => c.path.endsWith('/myRideInfo')).length)
    .toBeGreaterThan(1);
  await navigate(page, '/tools');
  release();
  await expect(page.locator('[data-page="/records"]:not(.ion-page-hidden)')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible();
});

test('demo extensions stay synthetic and cannot write even after a forged form submission', async ({
  page,
  mocks,
}) => {
  await open(page);
  await page.getByRole('button', { name: '先看看演示', exact: true }).click();
  await show(page);
  await expect(panel(page).locator('.record-metric .metric-value')).toHaveText('186km');
  for (const path of [
    '/records/rides/2026-10-06',
    '/records/tires',
    '/vehicle/messages',
    '/vehicle/settings',
  ])
    await navigate(page, path);
  await expect(panel(page).getByRole('switch', { name: '精准续航' })).toBeDisabled();
  await panel(page).evaluate((host) => {
    const b = document.createElement('button');
    b.dataset.ext = 'setting';
    b.dataset.key = 'precisionEndurance';
    host.append(b);
    b.click();
    b.remove();
  });
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
  expect(mocks.calls).toEqual([]);
});

test('cloud inductive switch uses owner-checked native materials contract and confirms reported state', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  mocks.extensions.settings.inductiveUnlocking2 = 0;
  mocks.home = {
    vinNo: VIN_A,
    bindingUserId: 'synthetic-user',
    sharedFlag: false,
    inductiveUnlocking2: 1,
  };
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/settings');
  await setting(page, '车辆感应钥匙', '开启');
  expect(mocks.calls.filter((call) => call.path.endsWith('/airLock/setting'))).toHaveLength(0);
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('已生效');
  const changes = mocks.calls.filter((call) => call.path.endsWith('/airLock/setting'));
  expect(changes).toHaveLength(1);
  expect(changes[0].body).toEqual({
    inductiveUnlockType: '',
    openStatus: 1,
    uniqueIdentify: '',
    vinNo: VIN_A,
  });
});

test('extension authentication expiry closes the panel and returns to the existing reconnect flow', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  await open(page);
  await login(page);
  await show(page);
  await expect(panel(page).locator('.record-metric .metric-value')).toHaveText('12.4km');
  mocks.extensions.expired = true;
  await page.evaluate(() => {
    location.hash = '/records/tires';
  });
  await expect(page.locator('[data-page="/vehicle/settings"]:not(.ion-page-hidden)')).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '重新登录', exact: true })).toBeVisible();
  expect(writes(mocks.calls)).toEqual([]);
});

test('closing an in-flight setting keeps an uncertain-result warning and never replays it', async ({
  page,
  mocks,
}) => {
  mocks.extensions = sample();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.extensions.hold = { kind: 'write', wait: waiting };
  await open(page);
  await login(page);
  await show(page);
  await navigate(page, '/vehicle/settings');
  await setting(page, '精准续航', '关闭');
  await page.getByRole('button', { name: '修改设置', exact: true }).click();
  await expect.poll(() => writes(mocks.calls).length).toBe(1);
  await navigate(page, '/records');
  release();
  await expect(page.locator('[data-page="/vehicle/settings"]:not(.ion-page-hidden)')).toHaveCount(
    0,
  );
  await expect(page.locator('.notice')).toContainText('已发出，结果待确认');
  expect(writes(mocks.calls)).toHaveLength(1);
});

async function setting(page: Page, name: string, value: string) {
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
  const toggle = panel(page).getByRole('switch', { name, exact: true });
  if (await toggle.count()) await toggle.click();
  else {
    await panel(page)
      .locator('ion-item')
      .filter({ has: page.locator('ion-label').getByText(name, { exact: true }) })
      .click();
    await page
      .locator('ion-action-sheet:not(.overlay-hidden)')
      .getByRole('button', { name: value, exact: true })
      .click();
  }
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('修改设置');
}
