import { navigate, control, report, developerLab, test, expect } from './fixtures';
test('a finished storage transaction still rejects cleanly when its timeout arrives', async ({ page, mocks }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const transaction = { objectStore: () => ({ get: () => ({ result: undefined }) }), abort: () => { throw new DOMException('Synthetic transaction already finished', 'InvalidStateError'); } };
    const database = { transaction: () => transaction, close: () => {} };
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: () => {
      const request: any = { result: database };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    } } });
  });
  await page.goto('./');
  await page.clock.runFor(50);
  await page.clock.fastForward(5100);
  await expect(page.getByRole('button', { name: '登录极核账号', exact: true })).toBeEnabled();
  expect(mocks.calls).toEqual([]);
});
