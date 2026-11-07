import { test, expect, open, login } from './fixtures';

test.use({ serviceWorkers: 'allow' });

test('offline shell loads at a repository subpath and never caches API data', async ({ page, context }) => {
  const response = await page.request.get('./');
  expect(response.headers()['content-security-policy']).toBe("connect-src 'self'");
  await open(page); await login(page);
  await page.getByRole('button', { name: '鸣笛寻车' }).click();
  await page.getByRole('button', { name: '发送鸣笛', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('普通寻车完整流程已提交');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = await page.evaluate(async () => {
    const results: string[] = [];
    for (const key of await caches.keys()) {
      for (const request of await (await caches.open(key)).keys()) results.push(request.url);
    }
    return results;
  });
  expect(cached.length).toBe(7);
  expect(cached.every(url => url.startsWith('http://127.0.0.1:4174/panel/'))).toBe(true);
  expect(cached.some(url => /tapi|captcha|vehicle|token/.test(url))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('网络已断开，显示内容不会更新。联网后可重新读取。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '鸣笛寻车' })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.locator('.battery-number')).toHaveText('82%');
});

test('separate project paths do not share sessions or preferences', async ({ page }) => {
  await open(page); await login(page);
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.goto('http://127.0.0.1:4174/other/');
  await expect(page.getByRole('button', { name: '连接我的极核', exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('waiting updates require an explicit idle action and preserve login', async ({ page, request }) => {
  await open(page); await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => { await caches.open('another-app-cache'); });
  await request.post('http://127.0.0.1:4174/__test/update');
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
  const update = page.getByRole('button', { name: '更新并重新打开' });
  await expect(update).toBeVisible();
  await page.getByRole('button', { name: '鸣笛寻车' }).click();
  await expect(update).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(update).toBeEnabled();
  await Promise.all([page.waitForEvent('load'), update.click()]);
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  expect(await page.evaluate(() => caches.has('another-app-cache'))).toBe(true);
});
