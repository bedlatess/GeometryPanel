import { test, expect, open, login } from './fixtures';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
test('initial and restored home load less than 200 KB of compressed JavaScript', async ({
  page,
  mocks,
}, info) => {
  const results: Record<string, unknown> = {};
  async function measure(name: string) {
    await page.waitForTimeout(300);
    const files = await page.evaluate(() => [
      ...new Set(
        performance
          .getEntriesByType('resource')
          .map((item) => item.name)
          .filter((name) => /\/assets\/[^/]+\.js$/.test(name)),
      ),
    ]);
    const sizes = await Promise.all(
      files.map(async (url) => {
        const name = basename(new URL(url).pathname);
        return { name, gzipBytes: gzipSync(await readFile(`dist/assets/${name}`)).length };
      }),
    );
    const gzipBytes = sizes.reduce((sum, item) => sum + item.gzipBytes, 0);
    results[name] = { gzipBytes, sizes };
    expect(gzipBytes).toBeLessThanOrEqual(200000);
  }
  await open(page);
  await measure('welcome');
  await login(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
  await measure('restoredHome');
  expect(mocks.external).toEqual([]);
  await mkdir('../docs/audit/0.9.0/工程检查', { recursive: true });
  await writeFile(
    `../docs/audit/0.9.0/工程检查/首屏-${info.project.name}.json`,
    JSON.stringify(results, null, 2),
  );
});
