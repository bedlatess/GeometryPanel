import { test, expect, open, login } from './fixtures';
import { mkdir } from 'node:fs/promises';

test('design lab is isolated from saved accounts, preferences, upstream and native actions', async ({ page, mocks }) => {
  mocks.home = { refreshTime: Date.now(), iotProperties: [{ identify: 'VehicleLock_S', value: 1 }] };
  await open(page); await login(page);
  await mkdir('.tools/ui', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.tools/ui/connected-${test.info().project.name}.png` });
  const smallTargets = await page.locator('main button:not(:disabled), nav button').evaluateAll(elements => elements.filter(el => {
    const box = el.getBoundingClientRect(); return box.width < 44 || box.height < 44;
  }).map(el => el.getAttribute('aria-label') ?? el.textContent));
  expect(smallTargets).toEqual([]);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const calls = mocks.calls.length;
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole('button', { name: '打开状态模拟器', exact: true }).click();
  const lab = page.locator('#design-lab');
  await expect(lab).toContainText('演示数据 · 只在本页模拟');
  await lab.locator('[name="lab-platform"]').selectOption('ios');
  await lab.locator('[name="lab-theme"]').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await lab.getByRole('button', { name: '上电开锁', exact: true }).click();
  await expect(lab.getByRole('region', { name: '演示操作确认' })).toBeVisible();
  await lab.getByRole('button', { name: '确认演示', exact: true }).click();
  await expect(lab.getByRole('button', { name: '正在发送指令', exact: true })).toBeDisabled();
  await expect(lab.getByRole('status')).toContainText('执行结果待确认');
  for (const scene of ['unlocked','error','offline','vehicleOffline','stale','low','missing','unsupported','long','signedOut']) {
    await lab.locator('[name="lab-scene"]').selectOption(scene);
    if (scene === 'missing') await expect(lab.locator('.battery-number')).toHaveText('—%');
    if (scene === 'low') await expect(lab.locator('.battery-number')).toHaveText('12%');
    if (scene === 'unsupported') await expect(lab.getByRole('button', { name: '上电开锁', exact: true })).toBeDisabled();
    if (scene === 'signedOut') {
      await lab.getByRole('button', { name: '连接我的极核', exact: true }).click();
      await expect(lab.getByRole('status')).toContainText('界面演示');
    }
  }
  await lab.getByRole('button', { name: '恢复初始演示', exact: true }).click();
  await expect(lab.locator('[name="lab-platform"]')).toHaveValue('pwa');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  expect(mocks.calls.length).toBe(calls);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '车辆已锁定', exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 60_000));
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  await expect(page.getByText('曾报在线', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '锁定状态未知', exact: true })).toBeVisible();
});

test('home controls keep target confirmation, readable stale states and recover keyboard focus', async ({ page, mocks }) => {
  mocks.home = { refreshTime: Date.now() - 3600_000, onlineStatus: 'ONLINE', iotProperties: [{ identify: 'VehicleLock_S', value: 1 }] };
  await open(page); await login(page);
  await expect(page.getByText('曾报在线', { exact: true })).toBeVisible();
  await expect(page.getByText(/车辆上报较早/)).toBeVisible();
  await page.getByRole('button', { name: '上电开锁', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('目标：测试极核 A');
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    expect(await page.locator('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  expect(mocks.calls.filter(call => /network\/unlock|dbpoint\/send/.test(call.path))).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '上电开锁', exact: true })).toBeFocused();
});

test('responsive themes and all preview scenes fit phones, landscape and wide screens', async ({ page, mocks }, info) => {
  await open(page); await page.getByRole('button', { name: '先体验面板', exact: true }).click();
  await mkdir('.tools/ui', { recursive: true });
  for (const [width,height] of [[360,800],[390,844],[430,932],[844,390],[1280,900]]) {
    await page.setViewportSize({ width, height });
    const art = await page.locator('.vehicle-art').boundingBox(), hero = await page.locator('.hero-body').boundingBox();
    expect(art!.y).toBeGreaterThanOrEqual(hero!.y);
    expect(art!.y + art!.height).toBeLessThanOrEqual(hero!.y + hero!.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 && info.project.name === 'chromium-mobile') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '.tools/ui/home-dark.png', fullPage: true });
      await page.screenshot({ path: '.tools/ui/home-dark-viewport.png' });
    }
  }
  await page.setViewportSize({ width:390,height:844 });
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  if (info.project.name === 'chromium-mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.tools/ui/home-light.png', fullPage: true });
    await page.screenshot({ path: '.tools/ui/home-light-viewport.png' });
  }
  await page.getByText('设计预览与状态模拟', { exact:true }).click();
  await page.getByRole('button', { name: '打开状态模拟器', exact: true }).click();
  const lab = page.locator('#design-lab');
  for (const scene of ['normal','unlocked','loading','sending','pending','error','offline','stale','low','missing','unsupported','long']) {
    await lab.locator('[name="lab-scene"]').selectOption(scene);
    expect(await lab.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (['low','error','long'].includes(scene) && info.project.name === 'chromium-mobile') await page.screenshot({ path: `.tools/ui/lab-${scene}.png` });
  }
  await lab.locator('[name="lab-theme"]').selectOption('light');
  await lab.locator('[name="lab-platform"]').selectOption('android');
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect(lab.locator('.design-frame')).toHaveCSS('animation-name','none');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '用车', exact:true })).toBeVisible();
  expect(mocks.calls).toHaveLength(0);
});
