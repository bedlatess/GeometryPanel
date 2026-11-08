import { test, expect, open, login, navigate, auditData, ownerData } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';

test('R2 component interactions retain confirmation, gestures and fresh-only number motion', async ({
  page,
  mocks,
}, info) => {
  test.setTimeout(120000);
  Object.assign(mocks, auditData());
  mocks.owner = { data: structuredClone(ownerData) };
  mocks.owner.data.home = { ...(mocks.owner.data.home as object), ...mocks.home };
  const dir = `.tools/ui-v3/interactions/${info.project.name}`;
  await mkdir(dir, { recursive: true });
  const frames: { file: string; at: number; route: string }[] = [];
  async function shot(file: string) {
    await page.screenshot({ path: `${dir}/${file}.png` });
    frames.push({ file: `${file}.png`, at: Date.now(), route: page.url() });
  }
  await open(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ion-safe-area-top', '54px');
    document.documentElement.style.setProperty('--ion-safe-area-bottom', '34px');
  });
  await expect(page.locator('.notice')).not.toBeVisible();
  const lever = page.locator('.vehicle-home:visible .lever');
  const bounds = (await lever.boundingBox())!;
  const start = bounds.x + 32,
    y = bounds.y + 32,
    travel = bounds.width - 64;
  await shot('01-滑动-起点');
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + travel * 0.35, y, { steps: 5 });
  await shot('02-滑动-35');
  await page.mouse.move(start + travel * 0.69, y, { steps: 5 });
  await shot('03-滑动-69');
  expect(mocks.calls.filter((call) => /network\/unlock$/.test(call.path))).toHaveLength(0);
  await page.mouse.move(start + travel * 0.76, y, { steps: 3 });
  await shot('04-滑动-76');
  await page.mouse.up();
  await expect(lever).toContainText('等待车辆响应');
  await shot('05-滑动-等待车辆');
  expect(mocks.calls.filter((call) => /network\/unlock$/.test(call.path))).toHaveLength(1);
  mocks.home!.iotProperties = [{ identify: 'VehicleLock_S', value: 0 }];
  mocks.home!.refreshTime = Date.now();
  mocks.owner.data.home = { ...(mocks.owner.data.home as object), ...mocks.home };
  await page
    .locator('ion-content:visible')
    .evaluate((el: HTMLIonContentElement) => el.scrollToBottom(0));
  await expect(page.locator('.folded-header')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '刷新车况', exact: true }).click();
  await page
    .locator('ion-content:visible')
    .evaluate((el: HTMLIonContentElement) => el.scrollToTop(0));
  await expect(lever).toContainText('已开锁');
  await shot('06-滑动-车辆确认');
  await expect(lever).toContainText('滑动关机锁车');
  await expect(page.locator('.notice')).not.toBeVisible();
  const beforeHorn = mocks.calls.filter((call) => /dbpoint\/send$/.test(call.path)).length;
  await page.getByRole('button', { name: '寻车', exact: true }).click();
  await page.waitForTimeout(600);
  await shot('07-弹层-打开');
  const handle = (await page
    .locator('ion-modal:not(.overlay-hidden) [part=handle]')
    .boundingBox())!;
  const hx = handle.x + handle.width / 2,
    hy = handle.y + 3;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy + 90, { steps: 6 });
  await shot('08-弹层-下拉');
  await page.mouse.move(hx, hy + 240, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#runtime-modal')).not.toBeVisible();
  await shot('09-弹层-关闭');
  expect(mocks.calls.filter((call) => /dbpoint\/send$/.test(call.path))).toHaveLength(beforeHorn);
  await page.getByText('电池健康', { exact: true }).click();
  await page.waitForTimeout(150);
  await shot('10-页面-推入');
  await expect(page.locator('[data-page="/vehicle/status"]')).toBeVisible();
  await page.waitForTimeout(500);
  await shot('11-页面-推入完成');
  await page.mouse.move(3, 350);
  await page.mouse.down();
  await page.mouse.move(180, 350, { steps: 12 });
  await shot('12-页面-右滑跟手');
  await page.mouse.move(370, 350, { steps: 6 });
  await page.mouse.up();
  await expect(page).toHaveURL(/#\/vehicle$/);
  await expect(page.locator('[data-page="/vehicle/status"]:not(.ion-page-hidden)')).toHaveCount(0);
  await shot('13-页面-返回完成');
  await page
    .locator('ion-content:visible')
    .evaluate((el: HTMLIonContentElement) => el.scrollToTop(0));
  await expect
    .poll(() =>
      page
        .locator('ion-content:visible')
        .evaluate(async (el: HTMLIonContentElement) => (await el.getScrollElement()).scrollTop),
    )
    .toBe(0);
  await expect(page.locator('.folded-header')).toHaveCSS('opacity', '0');
  let release!: () => void;
  mocks.holdRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = mocks.calls.filter((call) => call.path.includes('/vehicleHomePageV2/')).length;
  await page.mouse.move(195, 180);
  await page.mouse.down();
  // Give the gesture's animation-frame handler the same cadence as a real drag.
  for (let y = 200; y <= 380; y += 20) {
    await page.mouse.move(195, y);
    await page.waitForTimeout(30);
  }
  await expect
    .poll(() =>
      page
        .locator('ion-refresher:visible')
        .evaluate((el: HTMLIonRefresherElement) => el.getProgress()),
    )
    .toBeGreaterThanOrEqual(1);
  await shot('14-刷新-拉动');
  await page.mouse.up();
  await expect(page.locator('.brand-refresh.refreshing:visible')).toBeVisible();
  await shot('15-刷新-等待');
  await expect
    .poll(() => mocks.calls.filter((call) => call.path.includes('/vehicleHomePageV2/')).length)
    .toBe(before + 1);
  mocks.battery!.bmssoc = 63;
  release();
  mocks.holdRead = undefined;
  await expect(page.locator('.battery-number')).toHaveText('63%');
  await shot('16-数字-滚入');
  await page.waitForTimeout(400);
  await shot('17-数字-完成');
  await expect(page.locator('.brand-refresh.refreshing:visible')).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.battery-number i').first()).toHaveCSS('animation-name', 'none');
  expect(mocks.calls.filter((call) => /network\/unlock$/.test(call.path))).toHaveLength(1);
  expect(mocks.external).toEqual([]);
  await writeFile(
    `${dir}/manifest.json`,
    JSON.stringify(
      { synthetic: true, realDevice: false, generatedFrom: 'Vue + Ionic components', frames },
      null,
      2,
    ),
  );
});
