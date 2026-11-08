import { selectIon, navigate, control, report, developerLab, test, expect, open, login } from './fixtures';
import { mkdir } from 'node:fs/promises';

test('design lab is isolated from saved accounts, preferences, upstream and native actions', async ({ page, mocks }) => {
  mocks.home = { refreshTime: Date.now(), iotProperties: [{ identify: 'VehicleLock_S', value: 1 }] };
  await open(page); await login(page);
  await mkdir('.tools/ui', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.tools/ui/connected-${test.info().project.name}.png` });
  const smallTargets = await page.locator('main button:not(:disabled), nav button').evaluateAll(elements => elements.filter(el => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
  }).map(el => el.getAttribute('aria-label') ?? el.textContent));
  expect(smallTargets).toEqual([]);
  await navigate(page,'/me');
  const calls = mocks.calls.length;
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await developerLab(page);
  const lab = page.locator('#design-lab');
  await expect(lab).toContainText('演示数据　只在本页模拟');
  await selectIon(page, 'lab-platform', 'ios');
  await selectIon(page, 'lab-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await lab.getByRole('button', { name: '上电开锁，需要确认', exact: true }).click();
  await expect(page.getByRole('region', { name: '演示操作确认' })).toBeVisible();
  await page.getByRole('button', { name: '确认演示', exact: true }).click();
  await expect(lab.locator('.lever')).toHaveAttribute('aria-busy', 'true');
  await expect(lab.getByRole('status')).toContainText('等待车辆响应');
  for (const scene of ['unlocked','error','offline','vehicleOffline','stale','low','missing','unsupported','long','signedOut','charging','leverTimeout','multi','expired','future','unknown']) {
    await selectIon(page, 'lab-scene', scene);
    if (scene === 'missing') await expect(lab.locator('.battery-number')).toHaveText('—%');
    if (scene === 'low') await expect(lab.locator('.battery-number')).toHaveText('12%');
    if (scene === 'charging') await expect(lab.locator('.home-status')).toContainText('充电中');
    if (scene === 'leverTimeout') await expect(lab.locator('.lever-reason')).toHaveText('未收到车辆响应');
    if (scene === 'multi') await expect(lab.locator('.lever-reason')).toHaveText('AE5i 通勤');
    if (scene === 'unsupported') await expect(lab.getByRole('button', { name: '上电开锁，需要确认', exact: true })).toBeDisabled();
    if (scene === 'signedOut') {
      await lab.getByRole('button', { name: '登录极核账号', exact: true }).click();
      await expect(lab.getByText('界面演示', { exact:true })).toBeVisible();
    }
  }
  await lab.getByRole('button', { name: '恢复初始演示', exact: true }).click();
  await expect(lab.locator('[name="lab-platform"]')).toHaveJSProperty('value','pwa');
  await page.locator('ion-back-button:visible').click();
  expect(mocks.calls.length).toBe(calls);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
  await page.getByRole('tab', { name: '车辆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
  await expect(page.locator('.vehicle-home:visible .state-line')).toContainText('已锁车');
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 60_000));
  await navigate(page,'/me/appearance');
  await page.getByRole('tab', { name: '车辆', exact: true }).click();
  await expect(page.locator('.vehicle-home:visible .state-line')).toContainText('前的数据');
  await expect(page.locator('.vehicle-home:visible .lever')).toContainText('‹ 锁车');
});

test('home controls keep target confirmation, readable stale states and recover keyboard focus', async ({ page, mocks }) => {
  mocks.home = { refreshTime: Date.now() - 3600_000, onlineStatus: 'ONLINE', iotProperties: [{ identify: 'VehicleLock_S', value: 1 }] };
  await open(page); await login(page);
  await expect(page.locator('.vehicle-home:visible .state-line')).toContainText('前的数据');
  await expect(page.locator('.vehicle-stage')).toHaveClass(/old/);
  await page.locator('main .lever').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).toContainText('测试极核 A');
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    expect(await page.locator('ion-modal:not(.overlay-hidden)').evaluate(el => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; for (let node = a as Node | null; node; node = node.parentNode || (node.getRootNode() as ShadowRoot).host) if (node === el) return true; return false; })).toBe(true);
  }
  expect(mocks.calls.filter(call => /network\/unlock|dbpoint\/send/.test(call.path))).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('main .lever')).toBeFocused();
});

test('responsive themes and all preview scenes fit phones, landscape and wide screens', async ({ page, mocks }, info) => {
  await open(page); await page.getByRole('button', { name: '先看看演示', exact: true }).click();
  await mkdir('.tools/ui', { recursive: true });
  for (const [width,height] of [[360,800],[390,844],[430,932],[844,390],[1280,900]]) {
    await page.setViewportSize({ width, height });
    const art = await page.locator('.vehicle-stage .model-mark').boundingBox(), hero = await page.locator('.vehicle-stage').boundingBox();
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
  await navigate(page,'/me/appearance');
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('tab', { name: '车辆', exact: true }).click();
  if (info.project.name === 'chromium-mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.tools/ui/home-light.png', fullPage: true });
    await page.screenshot({ path: '.tools/ui/home-light-viewport.png' });
  }

  await developerLab(page);
  const lab = page.locator('#design-lab');
  for (const scene of ['normal','unlocked','loading','sending','pending','error','offline','stale','low','missing','unsupported','long']) {
    await selectIon(page, 'lab-scene', scene);
    expect(await lab.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (['low','error','long'].includes(scene) && info.project.name === 'chromium-mobile') await page.screenshot({ path: `.tools/ui/lab-${scene}.png` });
  }
  await selectIon(page, 'lab-theme', 'light');
  await selectIon(page, 'lab-platform', 'android');
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect(lab.locator('.design-frame')).toHaveCSS('animation-name','none');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('ion-back-button:visible').click();
  await expect(page.getByRole('tab',{name:'记录',exact:true})).toBeVisible();
  expect(mocks.calls).toHaveLength(0);
});
