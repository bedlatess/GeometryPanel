import { test as base, expect, type Page } from '@playwright/test';

export const VIN_A = 'LAAAAAAAAAAAAAAA1';
export const VIN_B = 'LBBBBBBBBBBBBBBB2';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO9sAAAAASUVORK5CYII=';
export const cars = [
  { vinNo: VIN_A, vehicleName: '测试极核 A', vehicleType: 'AE8', licensePlate: '' },
  { vinNo: VIN_B, vehicleName: '测试极核 B', vehicleType: 'AE6', licensePlate: '' },
];
export interface Call { path: string; method: string; body: any; authorization: string; query?: Record<string, string>; origin?: string }
export interface ExtensionMocks {
  month: unknown; tracks: unknown; tires: unknown; alerts: unknown; capabilities: unknown; settings: Record<string, unknown>;
  fail?: 'month' | 'tracks' | 'tires' | 'alerts' | 'settings';
  expired?: boolean; hold?: { kind: string; wait: Promise<void> }; writeFailure?: 'network' | 'false';
}
export interface TaskMocks {
  summary: { integralTotal?: unknown; ps0003_01_002_VOList: any[] }; sign: Record<string, unknown>;
  info?: unknown; prize?: unknown; square?: unknown; mine?: any[];
  fail?: 'read' | 'write'; expired?: boolean; unsafePost?: boolean; networkPost?: boolean; noConfirm?: boolean;
  hold?: { kind: 'read' | 'post'; wait: Promise<void> };
}
type CommandStage = 'prepare' | 'normal' | 'high' | 'unlock' | 'seat';
export interface Mocks {
  calls: Call[]; external: string[]; maps: string[]; listFailures: number; empty: boolean;
  expired: boolean; readFailure: boolean; batteryFailure: boolean;
  commandResults: Partial<Record<CommandStage, 'network' | 'false' | 'rejected' | 'expired'>>;
  holdList?: Promise<void>; holdCommand?: { stage: CommandStage; wait: Promise<void> };
  vehicleRows?: unknown[];
  home?: Record<string, unknown>; battery?: Record<string, unknown>;
  extensions?: ExtensionMocks; tasks?: TaskMocks;
  loginReplies?: { uid: string; token: string }[]; roadTiles: string[];
}
export const test = base.extend<{ mocks: Mocks }>({
  mocks: [async ({ context }, use) => {
    const state: Mocks = { calls: [], external: [], maps: [], roadTiles: [], listFailures: 0, empty: false, expired: false, readFailure: false, batteryFailure: false, commandResults: {} };
    const errors: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    // A fetch replacement runs before the application and before service-worker dispatch.
    // WebKit + service workers can bypass context.route(), so network routing alone is insufficient.
    await context.exposeBinding('__mockUpstream', async (_source, call: Call) => {
      state.calls.push(call);
      const reply = (data: unknown, status = 200, code = 10000) => ({ status, body: JSON.stringify({ code, data, message: status === 200 ? '' : 'synthetic-private-value' }) });
      if (call.path.endsWith('/code/generate')) return reply({ imageCaptchaId: 'synthetic', backgroundImage: png, sliderImage: png });
      if (call.path.endsWith('/authCode/V2')) return reply(null);
      if (call.path.endsWith('/loginByPhone')) { const account = state.loginReplies?.shift() ?? { uid: 'synthetic-user', token: 'synthetic-token' }; return reply({ tokenInfo: { access_token: account.token }, id: account.uid }); }
      if (call.path.endsWith('/vehicle/list')) {
        if (state.holdList) await state.holdList;
        if (state.listFailures-- > 0) return reply(null, 503, 50000);
        return reply(state.empty ? [] : state.vehicleRows ?? cars);
      }
      if (call.path.includes('/vehicleHomePageV2/')) {
        if (state.expired) return reply(null, 401, 401);
        if (state.readFailure) return reply(null, 503, 50000);
        return reply({ bmssoc: call.path.endsWith(VIN_B) ? 45 : 82, hmiRidableMile: 91, onlineStatus: 'ONLINE', chargeState: 0, ...state.home });
      }
      if (call.path.includes('/batteryInfo/')) {
        if (state.batteryFailure) return reply(null, 503, 50000);
        return reply({ bmssoc: call.path.endsWith(VIN_B) ? 45 : 82, hmiRidableMile: 91, bmsVoltage: 76.4, chargeState: 0, ...state.battery });
      }
      // Opt-in synthetic extension responses; original tests retain their defaults.
      const tasks = state.tasks;
      if (tasks && (/\/integral\//.test(call.path) || /\/signin(?:\/|$)/.test(call.path) || /\/cfmotoserversocial\//.test(call.path))) {
        const writing = call.method !== 'GET' || call.path.endsWith('/supplementPrize') || call.path.endsWith('/adjustByShare');
        if (tasks.hold?.kind === 'read' && !writing || tasks.hold?.kind === 'post' && call.path.endsWith('/commonArticle')) await tasks.hold!.wait;
        if (tasks.expired) return reply(null, 401, 401);
        if (tasks.fail === (writing ? 'write' : 'read')) return reply(null, 503, 50000);
        const complete = (code: string) => { if (!tasks.noConfirm) { const row = tasks.summary.ps0003_01_002_VOList.find(item => String(item.code) === code); if (row) row.completeFlag = 0; } };
        if (call.path.endsWith('/getByUserId')) return reply(tasks.summary);
        if (call.path.endsWith('/totalIntegral')) return reply({ integralTotal: tasks.summary.integralTotal });
        if (call.path.endsWith('/signin/count')) return reply(tasks.sign);
        if (call.path.endsWith('/H5/signin')) { if (!tasks.noConfirm) { tasks.sign.signStatus = 1; tasks.sign.count = Number(tasks.sign.count ?? 0) + 1; } return reply(null); }
        if (call.path.endsWith('/signin/info')) return reply(tasks.info ?? { signPrizeDate: null });
        if (call.path.endsWith('/supplementPrize')) return reply(tasks.prize ?? { prizesName: '合成奖励', integral: 20 });
        if (call.path.endsWith('/qbTzInfoNewV2')) return reply(tasks.square ?? [{ tuuid: 'square-synthetic', userid: 'another-synthetic', tcontent: '合成广场动态', createDate: '2026-11-07 09:00:00' }]);
        if (call.path.endsWith('/mineArticleInfo')) return reply(tasks.mine ?? []);
        if (call.path.endsWith('/likeFavoriteInfo')) { complete('1026'); return reply(null); }
        if (call.path.includes('/article/share/')) return reply(null);
        if (call.path.endsWith('/adjustByShare')) { complete('1024'); return reply(null); }
        if (call.path.endsWith('/commonArticle')) {
          tasks.mine ??= [];
          tasks.mine.push({ tuuid: 'created-synthetic', userid: 'synthetic-user', tcontent: call.body.postcontent,
            createDate: tasks.unsafePost ? null : new Date(Date.now() + 8 * 3600_000).toISOString().replace('T', ' ').slice(0, 23) });
          complete('1023'); return tasks.networkPost ? { abort: true } : reply(null);
        }
        if (call.path.endsWith('/deleteArticle')) { tasks.mine = (tasks.mine ?? []).filter(row => row.tuuid !== call.query?.articleId); return reply(null); }
      }
      const extension = state.extensions;
      if (extension) {
        const kind = call.path.endsWith('/myRideInfo') ? 'month' : call.path.endsWith('/ridetrack_v2') ? 'tracks'
          : call.path.endsWith('/tire/monitoring') ? 'tires' : call.path.endsWith('/Message/list_v2') ? 'alerts'
          : call.path.endsWith('/vehicleSet/items') || call.path.includes('/vehicleSetInfo/') ? 'settings' : '';
        if (kind) {
          if (extension.hold?.kind === kind) await extension.hold.wait;
          if (extension.expired) return reply(null, 401, 401);
          if (extension.fail === kind) return reply(null, 503, 50000);
          if (kind === 'settings') return reply(call.path.endsWith('/items') ? extension.capabilities : extension.settings);
          return reply(extension[kind as 'month' | 'tracks' | 'tires' | 'alerts']);
        }
        if (/\/Message\/(read|delete)$/.test(call.path)) {
          if (extension.hold?.kind === 'write') await extension.hold.wait;
          if (extension.writeFailure === 'network') return { abort: true };
          if (extension.writeFailure === 'false') return reply(false);
          extension.alerts = call.path.endsWith('/delete') ? { noRead: 0, messageVOList: [] } : { ...(extension.alerts as object), noRead: 0,
            messageVOList: ((extension.alerts as any).messageVOList ?? []).map((row: any) => ({ ...row, unread: '1' })) };
          return reply(null);
        }
        if (/\/vehicleSet\/(propertyOne\/one|soundSize|motoPlay\/one|lowPowerRule\/one)$/.test(call.path)) {
          if (extension.hold?.kind === 'write') await extension.hold.wait;
          if (extension.writeFailure === 'network') return { abort: true };
          if (extension.writeFailure === 'false') return reply(false);
          if (call.body.commond === '55') extension.settings.precisionEndurance = Number(call.body.commondParam);
          const complex: Record<string, string> = { '54': 'inductiveDistance', '33': 'leaveOffTime', '82': 'radarRcw', '142': 'customButtonSingle' };
          if (complex[call.body.commond]) extension.settings[complex[call.body.commond]] = Number(call.body.commondParam);
          if (call.body.commond === '66') extension.settings[(extension.settings.rideFunctionVOList as any[])?.some(row => row.parentCode === 'E_CUSHION_SENSOR' && row.functionCode === '2.0') ? 'ecushionSensor' : 'cushionSensor'] = Number(call.body.commondParam);
          if (call.path.endsWith('/lowPowerRule/one')) extension.settings.lowPower = Number(call.body.value);
          if (call.path.endsWith('/soundSize')) extension.settings.soundEffectSetting = { soundSize: call.body.size };
          if (call.path.endsWith('/motoPlay/one')) extension.settings.motoPlay = call.body.motoPlay;
          return reply(null);
        }
        if (call.path.endsWith('/inductiveUnlock/airLock/setting')) {
          if (extension.hold?.kind === 'write') await extension.hold.wait;
          if (extension.writeFailure === 'network') return { abort: true };
          if (extension.writeFailure === 'false') return reply(false);
          extension.settings.inductiveUnlocking2 = call.body.openStatus;
          return reply(null);
        }
      }
      const stage: CommandStage | null = call.path.endsWith('/dbpoint/send') ? 'prepare'
        : call.path.includes('/vehicleInfo/control/') ? 'normal' : call.path.endsWith('/vehicleInfo/controlV2') ? 'high'
        : call.path.endsWith('/vehicleSet/network/unlock') ? 'unlock' : call.path.endsWith('/vehicleSet/propertyTwo/one') ? 'seat' : null;
      if (stage) {
        if (state.holdCommand?.stage === stage) await state.holdCommand.wait;
        const result = state.commandResults[stage];
        if (result === 'network') return { abort: true };
        if (result === 'expired') return reply(null, 401, 401);
        if (result === 'rejected') return reply(null, 200, 30121);
        if (result === 'false') return reply(false);
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
        if (!['https://tapi.zeehoev.com', 'https://h5.zeehoev.com'].includes(url.origin)) throw new TypeError('Blocked test origin');
        if (request.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const body = await request.text();
        return new Promise<Response>((resolve, reject) => {
          const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
          request.signal.addEventListener('abort', abort, { once: true });
          if (request.signal.aborted) { abort(); return; }
          (window as any).__mockUpstream({ origin: url.origin, path: url.pathname, query: Object.fromEntries(url.searchParams), method: request.method, body: body ? JSON.parse(body) : null, authorization: request.headers.get('authorization') ?? '' }).then((result: any) => {
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
      if (/^webrd0[1-4]\.is\.autonavi\.com$/.test(url.hostname) && url.pathname === '/appmaptile') {
        state.roadTiles.push(url.href);
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/><path d="M0 128H256M128 0V256" stroke="#aaa"/></svg>' }); return;
      }
      if (url.origin === 'https://uri.amap.com' && url.pathname === '/marker') {
        state.maps.push(url.href);
        await route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', headers: { 'Content-Security-Policy': "default-src 'none'" },
          body: '<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width"><body><p>模拟地图 · 合成停车点</p></body></html>' });
        return;
      }
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
