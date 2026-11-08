import { test, expect, open, login, navigate, developerLab, auditData } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

const out = '.tools/ui-v2';
const pages = [
  ['home', '首页', '/vehicle'],
  ['folded', '首页下滑', '/vehicle'],
  ['status', '车况', '/vehicle/status'],
  ['settings', '车辆设置', '/vehicle/settings'],
  ['records', '记录', '/records'],
  ['tools', '工具', '/tools'],
  ['me', '我的', '/me'],
] as const;
const scenes = [
  'normal',
  'unlocked',
  'loading',
  'sending',
  'pending',
  'success',
  'error',
  'offline',
  'vehicleOffline',
  'stale',
  'low',
  'missing',
  'unsupported',
  'long',
  'signedOut',
  'charging',
  'leverTimeout',
  'multi',
  'expired',
  'future',
  'unknown',
];
async function stable(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.waitForTimeout(320);
}
test('synthetic visual delivery and interface checks', async ({ page, mocks }) => {
  await mkdir(`${out}/screens`, { recursive: true });
  Object.assign(mocks, auditData());
  const files: { file: string; label: string; group: string }[] = [];
  const checks: object[] = [],
    texts = new Set<string>();
  const banned =
    /云端|接口|\bAPI\b|原生|桥接|缓存|上报|回读|回执|字段|契约|能力|合成|模拟|脱敏|Safari|PWA|IPA|APK|WebView|token|\bVIN\b|epoch|payload|请求|服务端|客户端|操作失败|未知错误|请稍候|暂无数据/gi;
  await open(page);
  await login(page);
  await expect(page.locator('.result-toast')).toHaveCount(0, { timeout: 6000 });
  for (const theme of ['light', 'dark']) {
    await navigate(page, '/me/appearance');
    await page
      .getByRole('button', { name: theme === 'light' ? '浅色' : '深色', exact: true })
      .click();
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [id, label, path] of pages) {
        await navigate(page, path);
        await stable(page);
        if (id === 'settings') await expect(page.locator('.vehicle-settings-name')).toBeVisible();
        if (id === 'records') {
          await expect(page.locator('#records-panel')).toContainText('2.4 / 2.6 bar');
          await expect(page.locator('#records-panel')).toContainText('暂无充电记录');
        }
        await page.evaluate(
          (folded) =>
            window.scrollTo(
              0,
              folded ? document.querySelector<HTMLElement>('.home-cards')!.offsetTop - 132 : 0,
            ),
          id === 'folded',
        );
        await stable(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        const small = await page
          .locator(
            'main button:not(:disabled), nav button, main input:not(:disabled), main select:not(:disabled), main summary, main a',
          )
          .evaluateAll((els) =>
            els
              .filter((e) => {
                const r = e.getBoundingClientRect(),
                  s = getComputedStyle(e);
                return (
                  r.width > 0 &&
                  r.height > 0 &&
                  s.visibility !== 'hidden' &&
                  (r.width < 43.9 || r.height < 43.9)
                );
              })
              .map((e) => ({
                text: e.getAttribute('aria-label') || e.textContent,
                width: e.getBoundingClientRect().width,
                height: e.getBoundingClientRect().height,
              })),
          );
        const text = await page.locator('main:visible').last().innerText();
        text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => texts.add(s));
        const words = text.replaceAll('状态模拟器', '').match(banned) || [];
        checks.push({ page: id, theme, width, overflow, small, banned: words });
        expect(overflow, `${id}/${theme}/${width}: overflow`).toBe(false);
        expect(small, `${id}/${theme}/${width}: touch targets`).toEqual([]);
        expect(words, `${id}/${theme}/${width}: copy`).toEqual([]);
        const file = `screens/${id}-${theme}-${width}.png`;
        await page.screenshot({
          path: `${out}/${file}`,
          fullPage: !['home', 'folded'].includes(id),
        });
        files.push({ file, label: `${label} · ${theme} · ${width}`, group: 'pages' });
      }
    }
  }
  // Visit every secondary route under the same request-before-fetch isolation.
  const routes = [
    '/vehicle/location',
    '/vehicle/info',
    '/vehicle/messages',
    '/records/rides',
    '/records/rides/2026-11-06',
    '/records/battery',
    '/records/tires',
    '/tools/bluetooth',
    '/tools/meter',
    '/tools/monitor',
    '/tools/widgets',
    '/tools/diagnostics',
    '/tools/tasks',
    '/tools/scan',
    '/me/accounts',
    '/me/appearance',
    '/me/home',
    '/me/art',
    '/me/backup',
    '/me/install',
  ];
  for (const route of routes) {
    await navigate(page, route);
    await stable(page);
    await expect(page.locator('ion-back-button:visible')).toBeVisible();
    const text = await page.locator('main:visible').last().innerText();
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => texts.add(s));
    expect(text.replaceAll('状态模拟器', '').match(banned) || [], route).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      route,
    ).toBe(true);
    const small = await page
      .locator(
        'main button:not(:disabled), main input:not(:disabled), main select:not(:disabled), main summary, main a',
      )
      .evaluateAll((els) =>
        els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.width < 43.9 || r.height < 43.9);
          })
          .map((e) => ({
            text: e.getAttribute('aria-label') || e.textContent,
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
      );
    expect(small, `${route}: touch targets`).toEqual([]);
    checks.push({ route, back: true, overflow: false, banned: [], small });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await developerLab(page);
  for (const theme of ['light', 'dark']) {
    await page.locator('[name="lab-theme"]').selectOption(theme);
    for (const scene of scenes) {
      await page.locator('[name="lab-scene"]').selectOption(scene);
      await stable(page);
      const file = `screens/state-${scene}-${theme}.png`;
      await page.locator('.design-frame').screenshot({ path: `${out}/${file}` });
      files.push({ file, label: `状态 ${scene} · ${theme}`, group: 'states' });
    }
  }
  await navigate(page, '/me/components');
  await stable(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const levers = page.locator('main .lever-control');
    expect(await levers.count()).toBe(9);
    for (let i = 0; i < 9; i++) {
      const file = `screens/lever-${i + 1}-${theme}.png`;
      await levers.nth(i).screenshot({ path: `${out}/${file}` });
      files.push({ file, label: `拨杆 ${i + 1} · ${theme}`, group: 'levers' });
    }
  }
  await writeFile(
    `${out}/visual-manifest.json`,
    JSON.stringify({ synthetic: true, realDeviceVerified: false, files }, null, 2),
  );
  await writeFile(
    `${out}/interface-checks.json`,
    JSON.stringify(
      { synthetic: true, checks, outsideRequests: mocks.external, consolePageErrors: 0 },
      null,
      2,
    ),
  );
  await writeFile(`${out}/visible-copy.json`, JSON.stringify([...texts].sort(), null, 2));
  expect(mocks.external).toEqual([]);
});
