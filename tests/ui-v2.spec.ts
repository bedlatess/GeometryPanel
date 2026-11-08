import {
  navigate,
  control,
  report,
  developerLab,
  test,
  expect,
  open,
  login,
  auditData,
  VIN_B,
} from './fixtures';
test('lever keeps short drags inert, accepts the threshold once and waits for vehicle confirmation', async ({
  page,
  mocks,
}) => {
  await page.clock.install();
  mocks.home = {
    refreshTime: Date.now(),
    iotProperties: [{ identify: 'VehicleLock_S', value: 1 }],
  };
  await open(page);
  await login(page);
  const lever = page.locator('main .lever');
  await expect(lever).toBeEnabled();
  await expect.poll(() => lever.boundingBox()).not.toBeNull();
  const box = (await lever.boundingBox())!;
  const start = { x: box.x + 32, y: box.y + 32 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y, { steps: 5 });
  await page.mouse.up();
  expect(mocks.calls.filter((c) => /network\/unlock|dbpoint\/send/.test(c.path))).toHaveLength(0);
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (box.width - 64) * 0.76, start.y, { steps: 8 });
  await page.mouse.up();
  await expect(lever).toHaveClass(/phase-pending/);
  await expect(lever).toHaveText(/等待车辆响应/);
  expect(mocks.calls.filter((c) => c.path.endsWith('/vehicleSet/network/unlock'))).toHaveLength(1);
  const before = mocks.calls.length;
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('zeeho-panel:/panel/:vault-v2');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const count = await new Promise<number>((resolve) => {
          const request = db.transaction('local').objectStore('local').count();
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return count;
      }),
    )
    .toBeGreaterThan(1);
  await page.clock.fastForward(16000);
  await expect(lever).toHaveClass(/phase-error/);
  expect(mocks.calls.length).toBe(before);
  await expect(page.locator('.notice')).toHaveText('没收到车辆响应，先看一眼车');
  mocks.home = {
    refreshTime: Date.now() + 1000,
    iotProperties: [{ identify: 'VehicleLock_S', value: 0 }],
  };
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(lever).toHaveClass(/phase-success/);
  await expect(lever).toContainText('已开锁');
});
test('login sheets close from the backdrop and from a downward handle gesture without sending', async ({
  page,
  mocks,
}) => {
  await open(page);
  const connect = page.getByRole('button', { name: '登录极核账号', exact: true });
  await connect.click();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toBeVisible();
  await page.waitForTimeout(600);
  await page.mouse.click(4, 4);
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
  await connect.click();
  await page.waitForTimeout(600);
  const handle = (await page
    .locator('ion-modal:not(.overlay-hidden) [part=handle]')
    .boundingBox())!;
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Give the gesture recognizer real frame intervals and a decisive travel distance.
  for (let distance = 10; distance <= 220; distance += 10) {
    await page.mouse.move(x, y + distance);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
  expect(mocks.calls).toEqual([]);
});
test('unknown lock supports both keyboard directions and target selection clears the previous readings', async ({
  page,
  mocks,
}) => {
  await open(page);
  await login(page);
  const lever = page.locator('main .lever');
  await lever.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('上电开锁');
  expect(mocks.calls.filter((c) => /network\/unlock|dbpoint\/send/.test(c.path))).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(lever).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(lever).toHaveClass(/phase-pending/);
  expect(mocks.calls.filter((c) => /network\/unlock|dbpoint\/send/.test(c.path))).toHaveLength(2);
  await navigate(page, '/vehicle');
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page
    .locator('#runtime-modal')
    .getByRole('button', { name: /测试极核 B/ })
    .click();
  await expect(page.locator('.battery-number')).toHaveText('45%');
  await expect(page.getByRole('heading', { name: '测试极核 B', exact: true })).toBeVisible();
});
test('record entry summaries use existing readings and clear before a different vehicle responds', async ({
  page,
  mocks,
}) => {
  mocks.extensions = auditData().extensions;
  await open(page);
  await login(page);
  await navigate(page, '/records?tab=tire');
  const pressure = page.locator('main:visible .pressure');
  await expect(pressure.nth(0)).toContainText('2.4bar');
  await expect(pressure.nth(1)).toContainText('2.6bar');
  await navigate(page, '/records?tab=battery');
  await expect(page.locator('main:visible')).not.toContainText('—% → —%');
  await expect(page.getByText('还没有充电记录', { exact: true })).toBeVisible();
  await navigate(page, '/vehicle');
  await page.getByRole('button', { name: '切换车辆', exact: true }).click();
  await page
    .locator('#runtime-modal')
    .getByRole('button', { name: /测试极核 B/ })
    .click();
  await expect(page.getByRole('heading', { name: '测试极核 B', exact: true })).toBeVisible();
  let release!: () => void;
  mocks.extensions.hold = {
    kind: 'tires',
    wait: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  mocks.extensions.tires = {
    realTimeData: [
      { sensorPosition: 1, tirePressure: 2.8 },
      { sensorPosition: 2, tirePressure: 3 },
    ],
  };
  await navigate(page, '/records?tab=tire');
  await expect(pressure.nth(0)).toContainText('—');
  await expect(pressure.nth(0)).not.toContainText('bar');
  await expect(pressure.nth(1)).toContainText('—');
  await expect(pressure.nth(1)).not.toContainText('bar');
  await expect(page.locator('main:visible')).not.toContainText('2.4bar');
  release();
  await expect(pressure.nth(0)).toContainText('2.8bar');
  await expect(pressure.nth(1)).toContainText('3bar');
  expect(mocks.calls.filter((c) => c.path.endsWith('/tire/monitoring')).at(-1)?.query?.vinNo).toBe(
    VIN_B,
  );
});
