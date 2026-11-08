import { test, expect, open, login, navigate, auditData, ownerData } from './fixtures';

const routes = ['/vehicle/messages', '/tools/tasks', '/vehicle/settings', '/me/about'];

test('pages keep their content when re-entered from the Ionic page cache', async ({
  page,
  mocks,
}) => {
  Object.assign(mocks, auditData());
  mocks.owner = { data: structuredClone(ownerData) };
  await open(page);
  await login(page);
  const length = (route: string) =>
    page.evaluate((path) => {
      const pageElement = [...document.querySelectorAll(`[data-page="${path}"]`)].find(
        (element) => !element.classList.contains('ion-page-hidden'),
      );
      return (
        (pageElement?.querySelector('main') as HTMLElement | null)?.innerText.trim().length ?? 0
      );
    }, route);
  for (const route of routes) {
    await navigate(page, route);
    await expect.poll(() => length(route)).toBeGreaterThan(0);
    const first = await length(route);
    await navigate(page, '/vehicle');
    await navigate(page, route);
    await expect.poll(() => length(route)).toBeGreaterThanOrEqual(Math.min(first, 5));
  }
});
