import { test as base, expect, type Page } from '@playwright/test';

export const VIN_A = 'LAAAAAAAAAAAAAAA1';
export const VIN_B = 'LBBBBBBBBBBBBBBB2';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO9sAAAAASUVORK5CYII=';
export const cars = [
  { vinNo: VIN_A, vehicleName: '测试极核 A', vehicleType: 'AE8', licensePlate: '' },
  { vinNo: VIN_B, vehicleName: '测试极核 B', vehicleType: 'AE6', licensePlate: '' },
];
export interface Call { path: string; method: string; body: any; authorization: string }
export interface Mocks {
  calls: Call[]; external: string[]; listFailures: number; empty: boolean;
  expired: boolean; readFailure: boolean; batteryFailure: boolean; hornFailure: boolean;
  holdList?: Promise<void>; holdHorn?: Promise<void>;
}
export const test = base.extend<{ mocks: Mocks }>({
  mocks: [async ({ context }, use) => {
    const state: Mocks = { calls: [], external: [], listFailures: 0, empty: false, expired: false, readFailure: false, batteryFailure: false, hornFailure: false };
    const errors: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    // A fetch replacement runs before the application and before service-worker dispatch.
    // WebKit + service workers can bypass context.route(), so network routing alone is insufficient.
    await context.exposeBinding('__mockUpstream', async (_source, call: Call) => {
      state.calls.push(call);
      const reply = (data: unknown, status = 200, code = 10000) => ({ status, body: JSON.stringify({ code, data, message: status === 200 ? '' : 'synthetic-private-value' }) });
      if (call.path.endsWith('/code/generate')) return reply({ imageCaptchaId: 'synthetic', backgroundImage: png, sliderImage: png });
      if (call.path.endsWith('/authCode/V2')) return reply(null);
      if (call.path.endsWith('/loginByPhone')) return reply({ tokenInfo: { access_token: 'synthetic-token' }, id: 'synthetic-user' });
      if (call.path.endsWith('/vehicle/list')) {
        if (state.holdList) await state.holdList;
        if (state.listFailures-- > 0) return reply(null, 503, 50000);
        return reply(state.empty ? [] : cars);
      }
      if (call.path.includes('/vehicleHomePageV2/')) {
        if (state.expired) return reply(null, 401, 401);
        if (state.readFailure) return reply(null, 503, 50000);
        return reply({ bmssoc: call.path.endsWith(VIN_B) ? 45 : 82, hmiRidableMile: 91, onlineStatus: 'ONLINE', chargeState: 0 });
      }
      if (call.path.includes('/batteryInfo/')) {
        if (state.batteryFailure) return reply(null, 503, 50000);
        return reply({ bmssoc: call.path.endsWith(VIN_B) ? 45 : 82, hmiRidableMile: 91, bmsVoltage: 76.4, chargeState: 0 });
      }
      if (call.path.endsWith('/dbpoint/send')) {
        if (state.holdHorn) await state.holdHorn;
        if (state.hornFailure) return { abort: true };
        return reply(null);
      }
      return { abort: true };
    });
    await context.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === location.origin) return originalFetch(input, init);
        if (url.origin !== 'https://tapi.zeehoev.com') throw new TypeError('Blocked test origin');
        if (request.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const body = await request.text();
        return new Promise<Response>((resolve, reject) => {
          const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
          request.signal.addEventListener('abort', abort, { once: true });
          if (request.signal.aborted) { abort(); return; }
          (window as any).__mockUpstream({ path: url.pathname, method: request.method, body: body ? JSON.parse(body) : null, authorization: request.headers.get('authorization') ?? '' }).then((result: any) => {
            request.signal.removeEventListener('abort', abort);
            if (request.signal.aborted) { abort(); return; }
            if (result.abort) { reject(new TypeError('Synthetic network failure')); return; }
            resolve(new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } }));
          }, reject);
        });
      };
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === 'http://127.0.0.1:4174') { await route.continue(); return; }
      // Defense in depth. Any actual external browser request fails the test.
      state.external.push(url.origin);
      await route.abort();
    });
    await use(state);
    expect(state.external).toEqual([]);
    expect(errors).toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function open(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '连接我的极核', exact: true })).toBeEnabled();
}
export async function loginToList(page: Page) {
  await page.getByRole('button', { name: '连接我的极核', exact: true }).click();
  await page.getByLabel('手机号', { exact: true }).fill('13800000000');
  await page.getByRole('button', { name: '下一步' }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuemax', '719');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('短信验证码', { exact: true })).toBeEnabled();
  await page.getByLabel('短信验证码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '登录并选择车辆' }).click();
}
export async function login(page: Page) {
  await loginToList(page);
  await page.getByRole('button', { name: '测试极核 A' }).click();
  await expect(page.getByRole('heading', { name: '测试极核 A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled();
}
