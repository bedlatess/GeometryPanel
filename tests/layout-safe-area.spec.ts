import { test, expect, open, login, navigate, auditData, ownerData } from './fixtures';

test('R2 home keeps following groups below the first viewport and its footer reachable', async ({
  page,
  mocks,
}) => {
  Object.assign(mocks, auditData());
  mocks.owner = { data: structuredClone(ownerData) };
  await open(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ion-safe-area-top', '54px');
    document.documentElement.style.setProperty('--ion-safe-area-bottom', '34px');
  });
  await expect(page.locator('.notice')).not.toBeVisible();
  const bar = (await page.locator('ion-tab-bar').boundingBox())!;
  const group = (await page.locator('.home-lower .group-title').boundingBox())!;
  expect(bar.height).toBeCloseTo(83, 0);
  expect(group.y).toBeGreaterThanOrEqual(bar.y);
  await page
    .locator('ion-content:visible')
    .evaluate((el: HTMLIonContentElement) => el.scrollToBottom(0));
  const footer = (await page.locator('.home-lower .foot').boundingBox())!;
  expect(footer.y).toBeGreaterThan(98);
  expect(footer.y + footer.height).toBeLessThanOrEqual(bar.y);
  await expect(page.getByRole('button', { name: '刷新车况', exact: true })).toBeInViewport();
  await expect(page.locator('ion-tab-bar ion-tab-button').nth(1).locator('svg')).toHaveAttribute(
    'viewBox',
    '0 0 28 28',
  );
  await navigate(page, '/vehicle/status');
  const refresh = page.locator('ion-toolbar:visible ion-button svg').first();
  await expect(refresh).toHaveAttribute('fill', 'none');
  await expect(refresh).toHaveAttribute('stroke', 'currentColor');
  await expect(refresh).toHaveAttribute('stroke-width', '1.75');
  expect(mocks.external).toEqual([]);
});
