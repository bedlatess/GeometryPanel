import { test, expect, open, login, ownerData, auditData } from './fixtures';

test('R2 retains every reminder and saved shortcut without issuing control requests', async ({
  page,
  mocks,
}) => {
  Object.assign(mocks, auditData());
  mocks.home!.seatLockState = 0;
  mocks.battery!.bmssoc = 17;
  mocks.owner = { data: structuredClone(ownerData) };
  mocks.owner.data.expiry = { rechargeEndDate: '2020-01-01' };
  mocks.owner.data.sim = { lastUseDate: 0 };
  mocks.owner.data.maintenance = { keepMileage: 100 };
  mocks.owner.data.tires = { realTimeData: [{ tirePressure: 0.5 }] };
  await page.addInitScript(() => {
    localStorage.setItem(
      'zeeho-panel:/panel/:preferences',
      JSON.stringify({
        theme: 'system',
        voltage: true,
        range: true,
        startPage: 'vehicle',
        foregroundRefresh: true,
        shortcut: ['location', 'tires', 'messages', 'high'],
      }),
    );
  });
  await open(page);
  await login(page);
  const reminder = page.getByRole('button', { name: /7 项需要留意/ });
  await expect(reminder).toBeVisible();
  await reminder.click();
  for (const label of [
    '电量低',
    '座桶未锁',
    '胎压过低',
    '智能服务已到期',
    '流量卡已到期',
    '1 项异常',
    '距下次保养 100 km',
  ]) {
    await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText(label);
  }
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toHaveCount(0);
  await page
    .locator('ion-content:visible')
    .evaluate((el: HTMLIonContentElement) => el.scrollToTop(0));
  await page.getByRole('button', { name: '更多', exact: true }).click();
  for (const label of ['胎压', '消息', '高声寻车'])
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  expect(
    mocks.calls.filter((call) => /dbpoint\/send|vehicleInfo\/control/.test(call.path)),
  ).toHaveLength(0);
  expect(mocks.external).toEqual([]);
});
