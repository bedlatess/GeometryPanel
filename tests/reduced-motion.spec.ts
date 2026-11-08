import { test, expect, open, login, auditData } from './fixtures';

test('reduced motion keeps charging, numbers, refresh and result feedback stationary', async ({
  page,
  mocks,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  Object.assign(mocks, auditData());
  mocks.battery!.chargeState = 1;
  await open(page);
  await login(page);
  await expect(page.locator('.notice')).not.toBeVisible();
  await expect(page.locator('.charge-glow')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.charge-line')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.lever-label')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.knob')).toHaveCSS('transition-property', 'opacity');
  await expect(page.locator('.g-bar')).toHaveCSS('transform', 'none');
  await expect(page.locator('.g-bar')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const session = app.config.globalProperties.$pinia._s.get('session');
    session.state = {
      ...session.state,
      reading: { ...session.state.reading, soc: 63 },
      notice: '已更新',
    };
  });
  await expect(page.locator('.battery-number')).toHaveText('63%');
  await expect(page.locator('.battery-number i').first()).toHaveCSS('animation-name', 'none');
  const toast = page.locator('.result-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS('transition-property', 'opacity');
  const box = (await toast.boundingBox())!;
  expect(box.y).toBe(8);
  expect(Math.abs(box.x + box.width / 2 - 195)).toBeLessThan(1);
  expect(mocks.external).toEqual([]);
});
