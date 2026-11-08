import { ownerReads } from '../src/api/owner';
import { ownerData } from './owner-data';
export { ownerData };
import { test as base, expect, type Page } from '@playwright/test';

export const VIN_A = 'LAAAAAAAAAAAAAAA1';
export const VIN_B = 'LBBBBBBBBBBBBBBB2';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO9sAAAAASUVORK5CYII=';
export const cars = [
  { vinNo: VIN_A, vehicleName: '测试极核 A', vehicleType: 'AE8', licensePlate: '' },
  { vinNo: VIN_B, vehicleName: '测试极核 B', vehicleType: 'AE6', licensePlate: '' },
];
/** Shared synthetic input for delivery screenshots; no device or account data. */
export function auditData() {
  return {
    home: {
      refreshTime: Date.now(),
      onlineStatus: 'ONLINE',
      totalRideMile: 8818.9,
      rideMileageMonth: 186,
      ridingTimeMonthUnitMinute: 432,
      avgVelocityMonth: 26,
      headLockState: 1,
      seatLockState: 1,
      rideState: '已停放',
      address: '测试停车点',
      location: { longitude: 116.397, latitude: 39.908, locationTime: Date.now() },
      iotProperties: [
        { identify: 'VehicleLock_S', value: 1 },
        { identify: 'Hmi_TotalOdometer', value: 8818.9 },
      ],
    },
    battery: {
      bmssoc: 82,
      bmsVoltage: 76.4,
      batteryTemp: 24,
      soh: 97,
      chargeCount: 42,
      current: 0,
      power: 0,
      refreshTime: Date.now(),
    },
    extensions: {
      month: {
        rideMileageTotal: 8818.9,
        rideRecordList: [
          { date: '2026.11.06', rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 },
        ],
      },
      tracks: [
        {
          historyList: [
            {
              rideId: 'synthetic-trip',
              dayTime: '2026-11-06',
              startTime: '2026-11-06 08:10',
              endTime: '2026-11-06 08:38',
              rideMileage: 12.4,
              ridingTimeUnitMinute: 28,
              maxSpeed: 39,
              trajectory: '120,30&120.002,30.003&120.006,30.008',
            },
          ],
        },
      ],
      tires: {
        updateTime: Date.now(),
        realTimeData: [
          { sensorPosition: 1, tirePressure: 2.4, tireTemp: 24, reportTime: Date.now() },
          { sensorPosition: 2, tirePressure: 2.6, tireTemp: 25, reportTime: Date.now() },
        ],
      },
      alerts: { noRead: 0, messageVOList: [] },
      capabilities: [
        { functionCode: 'PRECISION_ENDURANCE', isSupport: true },
        { functionCode: 'KINETIC_ENERGY_RECOVERY', isSupport: true },
        { functionCode: 'AUTO_SHUTDOWN_TIME_GO', isSupport: true },
        { functionCode: 'E_TCS_TRACTION_CONTROL', isSupport: true },
        { functionCode: 'AUTOMATIC_PARKING_GO', isSupport: false },
      ],
      settings: {
        precisionEndurance: 1,
        kineticEnergyRecovery: 1,
        automaticShutdown: 0,
        etcsTractionControl: 1,
        mileageUnit: 1,
        temperatureUnit: 1,
        timeFormat: 2,
        soundEffectSetting: { soundSize: 60 },
      },
    } satisfies ExtensionMocks,
    tasks: {
      summary: { integralTotal: 120, ps0003_01_002_VOList: [] },
      sign: { signStatus: 0, count: 3 },
    } satisfies TaskMocks,
  };
}
export interface Call {
  path: string;
  method: string;
  body: any;
  authorization: string;
  query?: Record<string, string>;
  origin?: string;
}
export interface ExtensionMocks {
  month: unknown;
  tracks: unknown;
  tires: unknown;
  alerts: unknown;
  capabilities: unknown;
  settings: Record<string, unknown>;
  fail?: 'month' | 'tracks' | 'tires' | 'alerts' | 'settings';
  expired?: boolean;
  hold?: { kind: string; wait: Promise<void> };
  writeFailure?: 'network' | 'false';
}
export interface TaskMocks {
  summary: { integralTotal?: unknown; ps0003_01_002_VOList: any[] };
  sign: Record<string, unknown>;
  info?: unknown;
  prize?: unknown;
  square?: unknown;
  mine?: any[];
  fail?: 'read' | 'write';
  expired?: boolean;
  unsafePost?: boolean;
  networkPost?: boolean;
  noConfirm?: boolean;
  hold?: { kind: 'read' | 'post'; wait: Promise<void> };
}
type CommandStage = 'prepare' | 'normal' | 'high' | 'unlock' | 'seat';
export interface Mocks {
  calls: Call[];
  external: string[];
  maps: string[];
  listFailures: number;
  empty: boolean;
  expired: boolean;
  readFailure: boolean;
  batteryFailure: boolean;
  commandResults: Partial<Record<CommandStage, 'network' | 'false' | 'rejected' | 'expired'>>;
  holdList?: Promise<void>;
  holdCommand?: { stage: CommandStage; wait: Promise<void> };
  holdRead?: Promise<void>;
  vehicleRows?: unknown[];
  home?: Record<string, unknown>;
  battery?: Record<string, unknown>;
  extensions?: ExtensionMocks;
  tasks?: TaskMocks;
  owner?: {
    data: Record<string, unknown>;
    mode?: 'missing' | 'failure';
    failWrite?: string;
    networkWrite?: string;
    hold?: Promise<void>;
    writes?: number;
    noChange?: boolean;
  };
  loginReplies?: { uid: string; token: string }[];
  roadTiles: string[];
}
export const test = base.extend<{ mocks: Mocks }>({
  mocks: [
    async ({ context }, use) => {
      const state: Mocks = {
        calls: [],
        external: [],
        maps: [],
        roadTiles: [],
        listFailures: 0,
        empty: false,
        expired: false,
        readFailure: false,
        batteryFailure: false,
        commandResults: {},
      };
      const errors: string[] = [];
      context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
      // A fetch replacement runs before the application and before service-worker dispatch.
      // WebKit + service workers can bypass context.route(), so network routing alone is insufficient.
      await context.exposeBinding('__mockUpstream', async (_source, call: Call) => {
        state.calls.push(call);
        if (state.holdRead && call.path.includes('/vehicleHomePageV2/')) await state.holdRead;
        const reply = (data: unknown, status = 200, code = 10000) => ({
          status,
          body: JSON.stringify({
            code,
            data,
            message: status === 200 ? '' : 'synthetic-private-value',
          }),
        });
        if (call.path.endsWith('/code/generate'))
          return reply({ imageCaptchaId: 'synthetic', backgroundImage: png, sliderImage: png });
        if (call.path.endsWith('/authCode/V2')) return reply(null);
        if (call.path.endsWith('/loginByPhone')) {
          const account = state.loginReplies?.shift() ?? {
            uid: 'synthetic-user',
            token: 'synthetic-token',
          };
          return reply({ tokenInfo: { access_token: account.token }, id: account.uid });
        }
        if (call.path.endsWith('/vehicle/list')) {
          if (state.holdList) await state.holdList;
          if (state.listFailures-- > 0) return reply(null, 503, 50000);
          return reply(state.empty ? [] : (state.vehicleRows ?? cars));
        }
        if (state.owner) {
          const owner = state.owner,
            relative = call.path.replace(
              /^\/v1\.0\/(?:app\/cfmotoserverapp|mine\/cfmotoservermine)\//,
              '',
            );
          const match = Object.entries(ownerReads).find(
            ([key, [path]]) =>
              path.replace('{vin}', VIN_A) === relative ||
              path.replace('{vin}', VIN_B) === relative ||
              path === call.path,
          );
          if (match && call.method === 'GET') {
            if (owner.hold) await owner.hold;
            if (owner.mode === 'failure') return reply(null, 503, 50000);
            if (owner.mode === 'missing') return reply(null);
            const key = match[0];
            if (['home', 'settings', 'caps', 'tires'].includes(key)) {
              if (key === 'home')
                return reply({
                  bmssoc: call.path.endsWith(VIN_B) ? 45 : 82,
                  hmiRidableMile: 91,
                  ...auditData().home,
                  ...state.home,
                  ...owner.data.home,
                });
              if (key === 'settings')
                return reply({ ...state.extensions?.settings, ...owner.data.settings });
            }
            return reply(owner.data[key] ?? null);
          }
          if (
            call.method !== 'GET' &&
            /^(?:keepmileage\/reset|vehicleSet\/(?:nfc\/rename|propertyOne\/one|propertyTwo\/one|lowPowerPhoneReminder)|app\/inductiveUnlock\/airLock\/remove\/|electricFence\/one|chargePlan\/one|carShare$|vehicle\/tempShare$)/.test(
              relative,
            )
          ) {
            owner.writes = (owner.writes ?? 0) + 1;
            if (owner.hold) await owner.hold;
            if (owner.networkWrite && relative.endsWith(owner.networkWrite)) return { abort: true };
            if (owner.mode === 'failure' || (owner.failWrite && relative.endsWith(owner.failWrite)))
              return reply(null, 503, 50000);
            if (owner.mode === 'missing') return reply(null);
            if (!owner.noChange) {
              const data = owner.data,
                b = call.body;
              if (relative === 'keepmileage/reset') data.maintenance = { keepMileage: '5000' };
              if (relative.startsWith('app/inductiveUnlock/airLock/remove/'))
                data.phoneKeys = (data.phoneKeys as any[]).filter(
                  (r) => r.id !== relative.split('/').at(-1),
                );
              if (relative === 'vehicleSet/nfc/rename')
                data.nfcKeys = (data.nfcKeys as any[]).map((r) =>
                  r.id === b.nfcId ? { ...r, nfcName: b.nfcName } : r,
                );
              if (relative === 'vehicleSet/propertyOne/one') {
                if (b.commond === '92')
                  data.nfcKeys = (data.nfcKeys as any[]).filter((r) => r.nfcNo !== b.commondParam);
                if (b.commond === '135' || b.commond === '139')
                  data.settings = {
                    ...(data.settings as object),
                    [b.commond === '135' ? 'automaticLock' : 'radarFcw']: Number(b.commondParam),
                  };
              }
              if (relative === 'vehicleSet/lowPowerPhoneReminder')
                data.settings = {
                  ...(data.settings as object),
                  ultraLowBatteryReminder: b.lowPowerPhoneReminder,
                  withdrawalStartTime: b.lowPowerPhoneReminderStartTime,
                  withdrawalEndTime: b.lowPowerPhoneReminderEndTime,
                };
              if (relative === 'electricFence/one')
                data.fences =
                  call.method === 'DELETE'
                    ? (data.fences as any[]).filter((r) => r.id !== call.query?.id)
                    : [
                        ...(data.fences as any[]).filter((r) => r.id !== b.id),
                        { ...b, id: b.id ?? 'created-fence', delFlag: '1' },
                      ];
              if (relative === 'electricFence/one/use')
                data.fences = (data.fences as any[]).map((r) =>
                  r.id === b.id ? { ...r, delFlag: b.delFlag } : r,
                );
              if (relative === 'chargePlan/one') {
                data.plans = [{ ...b, id: b.id ?? 'created-plan', delFlag: '1' }];
                return reply(b.id ?? 'created-plan');
              }
              if (relative === 'chargePlan/one/use')
                data.plans = (data.plans as any[]).map((r) =>
                  r.id === b.id ? { ...r, delFlag: b.delFlag } : r,
                );
              if (relative === 'carShare')
                data.shareLong = [...(data.shareLong as any[]), { ...b, id: 'created-share' }];
              if (relative === 'vehicle/tempShare') {
                if (call.method === 'PUT')
                  for (const k of ['shareLong', 'shareTemp'])
                    data[k] = (data[k] as any[]).filter((r) => r.id !== b.id);
                else
                  data.shareTemp = [
                    ...(data.shareTemp as any[]),
                    {
                      id: 'created-temp',
                      shareName: b.fullName,
                      sharePhone: b.phone,
                      residualSeconds: b.shareHours * 3600,
                    },
                  ];
              }
            }
            return reply(true);
          }
        }
        if (call.path.includes('/vehicleHomePageV2/')) {
          if (state.expired) return reply(null, 401, 401);
          if (state.readFailure) return reply(null, 503, 50000);
          return reply({
            bmssoc: call.path.endsWith(VIN_B) ? 45 : 82,
            hmiRidableMile: 91,
            onlineStatus: 'ONLINE',
            chargeState: 0,
            ...state.home,
          });
        }
        if (call.path.includes('/batteryInfo/')) {
          if (state.batteryFailure) return reply(null, 503, 50000);
          return reply({
            bmssoc: call.path.endsWith(VIN_B) ? 45 : 82,
            hmiRidableMile: 91,
            bmsVoltage: 76.4,
            chargeState: 0,
            ...state.battery,
          });
        }
        // Opt-in synthetic extension responses; original tests retain their defaults.
        const tasks = state.tasks;
        if (
          tasks &&
          (/\/integral\//.test(call.path) ||
            /\/signin(?:\/|$)/.test(call.path) ||
            /\/cfmotoserversocial\//.test(call.path))
        ) {
          const writing =
            call.method !== 'GET' ||
            call.path.endsWith('/supplementPrize') ||
            call.path.endsWith('/adjustByShare');
          if (
            (tasks.hold?.kind === 'read' && !writing) ||
            (tasks.hold?.kind === 'post' && call.path.endsWith('/commonArticle'))
          )
            await tasks.hold!.wait;
          if (tasks.expired) return reply(null, 401, 401);
          if (tasks.fail === (writing ? 'write' : 'read')) return reply(null, 503, 50000);
          const complete = (code: string) => {
            if (!tasks.noConfirm) {
              const row = tasks.summary.ps0003_01_002_VOList.find(
                (item) => String(item.code) === code,
              );
              if (row) row.completeFlag = 0;
            }
          };
          if (call.path.endsWith('/getByUserId')) return reply(tasks.summary);
          if (call.path.endsWith('/totalIntegral'))
            return reply({ integralTotal: tasks.summary.integralTotal });
          if (call.path.endsWith('/signin/count')) return reply(tasks.sign);
          if (call.path.endsWith('/H5/signin')) {
            if (!tasks.noConfirm) {
              tasks.sign.signStatus = 1;
              tasks.sign.count = Number(tasks.sign.count ?? 0) + 1;
            }
            return reply(null);
          }
          if (call.path.endsWith('/signin/info'))
            return reply(tasks.info ?? { signPrizeDate: null });
          if (call.path.endsWith('/supplementPrize'))
            return reply(tasks.prize ?? { prizesName: '合成奖励', integral: 20 });
          if (call.path.endsWith('/qbTzInfoNewV2'))
            return reply(
              tasks.square ?? [
                {
                  tuuid: 'square-synthetic',
                  userid: 'another-synthetic',
                  tcontent: '合成广场动态',
                  createDate: '2026-11-07 09:00:00',
                },
              ],
            );
          if (call.path.endsWith('/mineArticleInfo')) return reply(tasks.mine ?? []);
          if (call.path.endsWith('/likeFavoriteInfo')) {
            complete('1026');
            return reply(null);
          }
          if (call.path.includes('/article/share/')) return reply(null);
          if (call.path.endsWith('/adjustByShare')) {
            complete('1024');
            return reply(null);
          }
          if (call.path.endsWith('/commonArticle')) {
            tasks.mine ??= [];
            tasks.mine.push({
              tuuid: 'created-synthetic',
              userid: 'synthetic-user',
              tcontent: call.body.postcontent,
              createDate: tasks.unsafePost
                ? null
                : new Date(Date.now() + 8 * 3600_000).toISOString().replace('T', ' ').slice(0, 23),
            });
            complete('1023');
            return tasks.networkPost ? { abort: true } : reply(null);
          }
          if (call.path.endsWith('/deleteArticle')) {
            tasks.mine = (tasks.mine ?? []).filter((row) => row.tuuid !== call.query?.articleId);
            return reply(null);
          }
        }
        const extension = state.extensions;
        if (extension) {
          const kind = call.path.endsWith('/myRideInfo')
            ? 'month'
            : call.path.endsWith('/ridetrack_v2')
              ? 'tracks'
              : call.path.endsWith('/tire/monitoring')
                ? 'tires'
                : call.path.endsWith('/Message/list_v2')
                  ? 'alerts'
                  : call.path.endsWith('/vehicleSet/items') ||
                      call.path.includes('/vehicleSetInfo/')
                    ? 'settings'
                    : '';
          if (kind) {
            if (extension.hold?.kind === kind) await extension.hold.wait;
            if (extension.expired) return reply(null, 401, 401);
            if (extension.fail === kind) return reply(null, 503, 50000);
            if (kind === 'settings')
              return reply(
                call.path.endsWith('/items') ? extension.capabilities : extension.settings,
              );
            return reply(extension[kind as 'month' | 'tracks' | 'tires' | 'alerts']);
          }
          if (/\/Message\/(read|delete)$/.test(call.path)) {
            if (extension.hold?.kind === 'write') await extension.hold.wait;
            if (extension.writeFailure === 'network') return { abort: true };
            if (extension.writeFailure === 'false') return reply(false);
            extension.alerts = call.path.endsWith('/delete')
              ? { noRead: 0, messageVOList: [] }
              : {
                  ...(extension.alerts as object),
                  noRead: 0,
                  messageVOList: ((extension.alerts as any).messageVOList ?? []).map(
                    (row: any) => ({ ...row, unread: '1' }),
                  ),
                };
            return reply(null);
          }
          if (
            /\/vehicleSet\/(propertyOne\/one|soundSize|motoPlay\/one|lowPowerRule\/one)$/.test(
              call.path,
            )
          ) {
            if (extension.hold?.kind === 'write') await extension.hold.wait;
            if (extension.writeFailure === 'network') return { abort: true };
            if (extension.writeFailure === 'false') return reply(false);
            if (call.body.commond === '55')
              extension.settings.precisionEndurance = Number(call.body.commondParam);
            const complex: Record<string, string> = {
              '54': 'inductiveDistance',
              '33': 'leaveOffTime',
              '82': 'radarRcw',
              '142': 'customButtonSingle',
            };
            if (complex[call.body.commond])
              extension.settings[complex[call.body.commond]] = Number(call.body.commondParam);
            if (call.body.commond === '66')
              extension.settings[
                (extension.settings.rideFunctionVOList as any[])?.some(
                  (row) => row.parentCode === 'E_CUSHION_SENSOR' && row.functionCode === '2.0',
                )
                  ? 'ecushionSensor'
                  : 'cushionSensor'
              ] = Number(call.body.commondParam);
            if (call.path.endsWith('/lowPowerRule/one'))
              extension.settings.lowPower = Number(call.body.value);
            if (call.path.endsWith('/soundSize'))
              extension.settings.soundEffectSetting = { soundSize: call.body.size };
            if (call.path.endsWith('/motoPlay/one'))
              extension.settings.motoPlay = call.body.motoPlay;
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
        const stage: CommandStage | null = call.path.endsWith('/dbpoint/send')
          ? 'prepare'
          : call.path.includes('/vehicleInfo/control/')
            ? 'normal'
            : call.path.endsWith('/vehicleInfo/controlV2')
              ? 'high'
              : call.path.endsWith('/vehicleSet/network/unlock')
                ? 'unlock'
                : call.path.endsWith('/vehicleSet/propertyTwo/one')
                  ? 'seat'
                  : null;
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
          if (!['https://tapi.zeehoev.com', 'https://h5.zeehoev.com'].includes(url.origin))
            throw new TypeError('Blocked test origin');
          if (request.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const body = await request.text();
          return new Promise<Response>((resolve, reject) => {
            const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
            request.signal.addEventListener('abort', abort, { once: true });
            if (request.signal.aborted) {
              abort();
              return;
            }
            (window as any)
              .__mockUpstream({
                origin: url.origin,
                path: url.pathname,
                query: Object.fromEntries(url.searchParams),
                method: request.method,
                body: body ? JSON.parse(body) : null,
                authorization: request.headers.get('authorization') ?? '',
              })
              .then((result: any) => {
                request.signal.removeEventListener('abort', abort);
                if (request.signal.aborted) {
                  abort();
                  return;
                }
                if (result.abort) {
                  reject(new TypeError('Synthetic network failure'));
                  return;
                }
                resolve(
                  new Response(result.body, {
                    status: result.status,
                    headers: { 'Content-Type': 'application/json' },
                  }),
                );
              }, reject);
          });
        };
      });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.href === 'https://assets.example.invalid/neutral-vehicle.png') {
          await route.fulfill({
            path: 'tests/assets/generic-scooter.png',
            contentType: 'image/png',
          });
          return;
        }
        if (url.origin === 'http://127.0.0.1:4174') {
          await route.continue();
          return;
        }
        if (
          /^webrd0[1-4]\.is\.autonavi\.com$/.test(url.hostname) &&
          url.pathname === '/appmaptile'
        ) {
          state.roadTiles.push(url.href);
          await route.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/><path d="M0 128H256M128 0V256" stroke="#aaa"/></svg>',
          });
          return;
        }
        if (url.origin === 'https://uri.amap.com' && url.pathname === '/marker') {
          state.maps.push(url.href);
          await route.fulfill({
            status: 200,
            contentType: 'text/html;charset=utf-8',
            headers: { 'Content-Security-Policy': "default-src 'none'" },
            body: '<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width"><body><p>模拟地图 · 合成停车点</p></body></html>',
          });
          return;
        }
        // Defense in depth. Any actual external browser request fails the test.
        state.external.push(url.origin);
        await route.abort();
      });
      await use(state);
      expect(state.external).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function open(page: Page) {
  await page.goto('./');
  await expect(page.locator('[data-page="/vehicle"]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: '登录极核账号', exact: true })).toBeEnabled();
}
export async function loginToList(page: Page) {
  await page.getByRole('button', { name: '登录极核账号', exact: true }).click();
  await page.getByRole('textbox', { name: '手机号', exact: true }).fill('13800000000');
  await page.getByRole('button', { name: '获取验证码' }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuemax', '719');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: '输入验证码', exact: true })).toBeEnabled();
  // The code field appears before the synthetic send-code operation finishes.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector('#app') as any).__vue_app__;
        return app.config.globalProperties.$pinia._s.get('session').state.busy;
      }),
    )
    .toBe(false);
  await page.getByRole('textbox', { name: '输入验证码', exact: true }).fill('123456');
}
export async function login(page: Page, car = '测试极核 A') {
  await loginToList(page);
  await page.getByRole('button', { name: car }).click();
  await expect(page.getByRole('heading', { name: car })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled();
  await expect(page.locator('ion-modal:not(.overlay-hidden)')).not.toBeVisible();
}

export async function navigate(page: Page, path: string) {
  const aliases: Record<string, string> = {
    '/vehicle/info': '/vehicle/status?tab=device',
    '/vehicle/firmware': '/vehicle/status/firmware',
    '/records/rides': '/records?tab=ride',
    '/records/tires': '/records?tab=tire',
    '/records/battery': '/records?tab=battery',
    '/records/battery/official': '/records?tab=battery&source=official',
  };
  const target = aliases[path] || path.replace('/records/rides/', '/records/ride/');
  // A preceding link click resolves before Ionic finishes entering its page.
  // Serialize against that route as well as against our own push below.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector('#app') as any).__vue_app__;
        const path = app.config.globalProperties.$router.currentRoute.value.path;
        const active = Array.from(
          document.querySelectorAll(
            '[data-page].ion-page:not(.ion-page-hidden):not(.ion-page-invisible)',
          ),
          (element) => element.getAttribute('data-page'),
        );
        return active.length === 1 && active[0] === path;
      }),
    )
    .toBe(true);
  await page.evaluate(async (value) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    await app.config.globalProperties.$router.push(value);
  }, target);
  await expect(page).toHaveURL(
    new RegExp('#' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
  );
  await expect(
    page
      .locator(`[data-page="${target.split('?')[0]}"]:not(.ion-page-hidden) :is(main, .welcome)`)
      .last(),
  ).toBeVisible();
  // During a tab transition the only active page can still be the outgoing page.
  // Wait until the target itself is the sole active page before the next navigation.
  await expect
    .poll(() =>
      page
        .locator('[data-page].ion-page:not(.ion-page-hidden):not(.ion-page-invisible)')
        .evaluateAll((pages) => pages.map((element) => element.getAttribute('data-page'))),
    )
    .toEqual([target.split('?')[0]]);
  if (target.split('?')[0] === '/vehicle') {
    await expect(page.locator('[data-page="/vehicle"]')).toHaveAttribute('data-ready', 'true');
  }
}
export async function control(page: Page, mode: string) {
  await navigate(page, '/vehicle');
  if (mode === 'seat') {
    await page.getByRole('button', { name: '座桶', exact: true }).click();
    await expect(page.locator('#runtime-modal')).toBeVisible();
    return;
  }
  const lever = page.locator('[data-page="/vehicle"]:not(.ion-page-hidden) .lever');
  await expect(lever).toBeVisible();
  await expect(lever).toBeEnabled();
  const box = (await lever.boundingBox())!;
  await lever.click({ position: { x: mode === 'powerOff' ? 32 : box.width - 32, y: 32 } });
  await expect(page.locator('#runtime-modal')).toBeVisible();
}
export async function report(page: Page) {
  if (!page.url().endsWith('#/tools/diagnostics')) await navigate(page, '/tools/diagnostics');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出上次车控结果', exact: true }).click();
  const download = await pending,
    stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
export async function developerLab(page: Page) {
  await navigate(page, '/me/about');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /版本/ }).click();
  await page.getByRole('link', { name: '开发者选项', exact: true }).click();
  await page.getByRole('link', { name: '状态模拟器', exact: true }).click();
  await expect(page.locator('#design-lab')).toBeVisible();
}
export async function selectIon(page: Page, name: string, value: string) {
  const index = await page
    .locator('ion-select')
    .evaluateAll(
      (items, chosen) => items.findIndex((item) => (item as HTMLIonSelectElement).name === chosen),
      name,
    );
  if (index < 0) throw new Error(`Missing select ${name}`);
  const select = page.locator('ion-select').nth(index);
  const label = await select
    .locator('ion-select-option')
    .evaluateAll(
      (items, chosen) =>
        items.find((item) => (item as HTMLIonSelectOptionElement).value === chosen)?.textContent,
      value,
    );
  if (!label) throw new Error(`Missing option ${name}:${value}`);
  await select.click();
  await page
    .locator('ion-action-sheet:not(.overlay-hidden)')
    .getByRole('radio', { name: label.trim(), exact: true })
    .click();
  await expect(page.locator('ion-action-sheet:not(.overlay-hidden)')).not.toBeVisible();
}
