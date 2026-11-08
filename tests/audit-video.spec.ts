import { test, expect, open, login, auditData, ownerData } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'no-preference',
  video: { mode: 'on', size: { width: 390, height: 844 } },
});
test.beforeEach(async ({ page, mocks }) => {
  Object.assign(mocks, auditData());
  mocks.owner = { data: structuredClone(ownerData) };
  mocks.owner.data.home = { ...(mocks.owner.data.home as object), ...mocks.home };
  await open(page);
  await login(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ion-safe-area-top', '54px');
    document.documentElement.style.setProperty('--ion-safe-area-bottom', '34px');
  });
  await expect(page.locator('.notice')).not.toBeVisible();
});
test.afterEach(async ({ page, mocks }, info) => {
  expect(mocks.external).toEqual([]);
  const video = page.video();
  await page.close();
  const directory = '../docs/audit/0.9.0/录屏';
  await mkdir(directory, { recursive: true });
  if (info.status !== 'passed' || !video) return;
  const source = info.outputPath('viewport.webm');
  await video.saveAs(source);
  const ffmpeg = join(process.env.LOCALAPPDATA!,
    'ms-playwright/ffmpeg-1013/ffmpeg-win64.exe');
  // Scale the continuous recording; no generated/interpolated frames or blank padding.
  await promisify(execFile)(ffmpeg, ['-y', '-i', source, '-vf', 'scale=780:1688',
    '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0',
    `${directory}/${info.title}-${info.project.name}.webm`]);
});

test('01-滑动开锁', async ({ page, mocks }) => {
  await page.waitForTimeout(4500);
  const lever = page.locator('.vehicle-home:visible .lever');
  const box = (await lever.boundingBox())!;
  await page.mouse.move(box.x + 32, box.y + 32);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 32, box.y + 32, { steps: 30 });
  await page.mouse.up();
  await expect(lever).toContainText('等待车辆响应');
  await page.waitForTimeout(800);
  mocks.home!.iotProperties = [{ identify: 'VehicleLock_S', value: 0 }];
  mocks.home!.refreshTime = Date.now();
  mocks.owner!.data.home = { ...(mocks.owner!.data.home as object), ...mocks.home };
  await page.locator('ion-content:visible').evaluate((el: HTMLIonContentElement) =>
    el.scrollToBottom(300));
  await page.getByRole('button', { name: '刷新车况', exact: true }).click();
  await page.locator('ion-content:visible').evaluate((el: HTMLIonContentElement) =>
    el.scrollToTop(300));
  await expect(lever).toContainText('已开锁');
  await expect(lever).toContainText('滑动关机锁车');
  await page.waitForTimeout(4500);
  expect(mocks.calls.filter((call) => /network\/unlock$/.test(call.path))).toHaveLength(1);
});

test('02-页面切换', async ({ page }) => {
  await page.locator('ion-content:visible').evaluate((el: HTMLIonContentElement) =>
    el.scrollToBottom(300));
  await page.getByText('电池健康', { exact: true }).click();
  await expect(page.locator('[data-page="/vehicle/status"]')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.mouse.move(3, 350);
  await page.mouse.down();
  await page.mouse.move(370, 350, { steps: 35 });
  await page.mouse.up();
  await expect(page).toHaveURL(/#\/vehicle$/);
  await page.waitForTimeout(1000);
});

test('03-弹层下拉', async ({ page }) => {
  await page.getByRole('button', { name: '寻车', exact: true }).click();
  await page.waitForTimeout(1000);
  const handle = (await page.locator('ion-modal:not(.overlay-hidden) [part=handle]')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 3);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 250, { steps: 30 });
  await page.mouse.up();
  await expect(page.locator('#runtime-modal')).not.toBeVisible();
  await page.waitForTimeout(1000);
});

test('04-下拉刷新', async ({ page, mocks }) => {
  let release!: () => void;
  mocks.holdRead = new Promise<void>((resolve) => { release = resolve; });
  await page.mouse.move(195, 180);
  await page.mouse.down();
  for (let y = 200; y <= 380; y += 10) {
    await page.mouse.move(195, y);
    await page.waitForTimeout(35);
  }
  await page.mouse.up();
  await expect(page.locator('.brand-refresh.refreshing:visible')).toBeVisible();
  await page.waitForTimeout(1200);
  release();
  mocks.holdRead = undefined;
  await expect(page.locator('.brand-refresh.refreshing:visible')).not.toBeVisible();
  await page.waitForTimeout(1000);
});

test('05-数字滚动', async ({ page, mocks }) => {
  await page.waitForTimeout(700);
  mocks.battery!.bmssoc = 63;
  mocks.home!.refreshTime = Date.now();
  await page.locator('.battery-number').evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    void app.config.globalProperties.$pinia._s.get('session').refresh();
  });
  await expect(page.locator('.battery-number')).toHaveText('63%');
  await page.waitForTimeout(1200);
});
