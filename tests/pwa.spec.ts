import { test, expect, open, login } from './fixtures';

test.use({ serviceWorkers: 'allow' });
// Worker installation/update exercises browser-managed storage and process
// lifecycles. Keep these cases sequential within each browser project.
test.describe.configure({ mode: 'default' });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { controller: navigator.serviceWorker.controller?.state, installing: reg?.installing?.state,
      waiting: reg?.waiting?.state, active: reg?.active?.state, scope: reg?.scope,
      workers: (await navigator.serviceWorker.getRegistrations()).map(item => ({ scope: item.scope, waiting: item.waiting?.state })) };
  }).catch(() => ({ pageUnavailable: true }));
  console.log('Synthetic service-worker failure state:', JSON.stringify(state));
});

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
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.goto('http://127.0.0.1:4174/other/');
  await expect(page.getByRole('button', { name: '连接我的极核', exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('cache management keeps the active shell, other projects and encrypted login', async ({ page }) => {
  await open(page); await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async () => {
    await caches.open('zeeho-shell:http://127.0.0.1:4174/panel/:synthetic-unused');
    await caches.open('zeeho-shell:http://127.0.0.1:4174/other/:synthetic-unused');
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '查看离线缓存', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('离线页面完整，共 7 个静态文件。');
  await page.getByRole('button', { name: '清理旧页面缓存', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('已清理 1 份旧页面缓存。');
  const names = await page.evaluate(() => caches.keys());
  expect(names).not.toContain('zeeho-shell:http://127.0.0.1:4174/panel/:synthetic-unused');
  expect(names).toContain('zeeho-shell:http://127.0.0.1:4174/other/:synthetic-unused');
  await page.reload(); await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
});

test('waiting updates require an explicit idle action and preserve login', async ({ page, request }, testInfo) => {
  const scope = `/isolated/waiting-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now().toString(36)}/`;
  await page.goto(`http://127.0.0.1:4174${scope}`);
  await expect(page.getByRole('button', { name: '连接我的极核', exact: true })).toBeEnabled();
  await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('首页快捷操作', { exact: true }).selectOption('seat');
  await page.getByRole('button', { name: '车辆', exact: true }).click();
  await page.evaluate(async () => { await caches.open('another-app-cache'); });
  await request.post(`http://127.0.0.1:4174/__test/update?scope=${encodeURIComponent(scope)}`);
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
  const update = page.getByRole('button', { name: '更新并重新打开' });
  await expect(update).toBeVisible();
  await page.getByRole('button', { name: '打开座桶', exact: true }).click();
  await expect(update).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(update).toBeEnabled();
  await Promise.all([page.waitForEvent('load'), update.click()]);
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.locator('.battery-number')).toHaveText('82%');
  await expect(page.getByRole('button', { name: '打开座桶', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => caches.has('another-app-cache'))).toBe(true);
});

test('manual update check reports status and prepares an explicit update without reloading during use', async ({ page, request }, testInfo) => {
  // Each mutating case gets its own URL scope across browsers and workers. Reusing
  // /other/ can expose another case's installed worker/revision under WebKit.
  const scope = `/isolated/manual-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now().toString(36)}/`;
  await page.goto(`http://127.0.0.1:4174${scope}`);
  await expect(page.getByRole('button', { name: '连接我的极核', exact: true })).toBeEnabled();
  await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('离线页面已准备好；车辆数据和控制需要联网。')).toBeVisible();
  await page.getByRole('button', { name: '检查新版本', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText('已检查，目前没有新版本。');
  await request.post(`http://127.0.0.1:4174/__test/update?scope=${encodeURIComponent(scope)}`);
  await page.getByRole('button', { name: '检查新版本', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('新版本已准备好');
  await expect(page.getByRole('button', { name: '更新并重新打开' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '退出本机登录' })).toBeVisible();
});
