import { ApiError, CloudClient } from './client';
import { object, snapshot, validVehicleId, vehicleList, type Session } from '../core/model';
import type { CommandStep, HornMode } from '../core/command-report';

const APP = '/v1.0/app/cfmotoserverapp';
const MINE = '/v1.0/mine/cfmotoservermine';
export interface Point { t: number; type: 'down' | 'move' | 'up'; x: number; y: number }
export interface SliderTrack {
  bgImageWidth: number; bgImageHeight: number; sliderImageWidth: number; sliderImageHeight: number;
  startSlidingTime: string; endSlidingTime: string; trackList: Point[];
}
export interface Captcha {
  imageCaptchaId: string | number; backgroundImage: string; sliderImage: string;
  sliderImageWidth?: number; sliderImageHeight?: number;
}
export class ZeehoApi {
  constructor(private readonly cloud = new CloudClient()) {}
  async captcha(phone: string, signal?: AbortSignal): Promise<Captcha> {
    this.phone(phone);
    const data = object(await this.cloud.request(`${MINE}/authCode/code/generate`, { method: 'POST', body: { phone }, signal }));
    if (!['string', 'number'].includes(typeof data.imageCaptchaId) || typeof data.backgroundImage !== 'string' || typeof data.sliderImage !== 'string') throw new ApiError('format');
    return data as unknown as Captcha;
  }
  async sendCode(phone: string, captcha: Captcha, track: SliderTrack, signal?: AbortSignal) {
    this.phone(phone);
    await this.cloud.request(`${MINE}/authCode/V2`, { method: 'POST', signal, body: {
      areaCode: '86', phone, imageCaptchaId: captcha.imageCaptchaId, imageCaptchaTrackBO: track,
    } });
  }
  async login(phone: string, code: string, signal?: AbortSignal) {
    this.phone(phone);
    if (!/^\d{4,8}$/.test(code)) throw new ApiError('format');
    const data = object(await this.cloud.request(`${MINE}/user/loginByPhone`, {
      method: 'POST', clientAuth: true, appLike: true, signal,
      body: { phone, authCode: code, province: '', city: '', latitude: '', longitude: '', referralCode: '' },
    }));
    const info = data.tokenInfo && typeof data.tokenInfo === 'object' ? object(data.tokenInfo) : {};
    const token = String(info.access_token || data.access_token || data.token || '').replace(/^bearer\s+/i, '');
    if (!token || /\s/.test(token)) throw new ApiError('format');
    return { token, uid: String(data.id ?? '') };
  }
  async list(token: string, signal?: AbortSignal) {
    return vehicleList(await this.cloud.request(`${APP}/vehicle/list`, { token, signal }));
  }
  async read(session: Session, signal?: AbortSignal) {
    this.binding(session);
    const home = object(await this.cloud.request(`${APP}/vehicleHomePageV2/${session.vehicle.vin}`, { token: session.token, signal }));
    signal?.throwIfAborted();
    let battery: Record<string, unknown> | null = null;
    try { battery = object(await this.cloud.request(`${APP}/batteryInfo/${session.vehicle.vin}`, { token: session.token, signal })); }
    catch (error) {
      if (signal?.aborted || error instanceof ApiError && error.kind === 'expired') throw error;
    }
    return snapshot(home, battery);
  }
  async horn(session: Session, signal?: AbortSignal, options: { mode?: HornMode; onProgress?: (step: CommandStep) => void } = {}) {
    this.binding(session);
    const mode = options.mode ?? 'normal';
    if (mode !== 'normal' && mode !== 'high') throw new ApiError('format');
    // The recovered webpage sends BOTH ordinary-search steps. The first ACK
    // alone is not completion. High-volume search is a separate explicit action.
    const steps = mode === 'normal' ? [
      { stage: 'prepare' as const, path: `${APP}/dbpoint/send`, method: 'POST' as const, body: {
        eventId: 11631,
        param: JSON.stringify({ vinNo: session.vehicle.vin, functionCode: 'LOUDLY_SEARCH_CAR', type: 'LOW' }),
        uuid: '', zeehoParamTypeBO: null,
      } },
      { stage: 'control' as const, path: `${APP}/vehicleInfo/control/${session.vehicle.vin}`, method: 'PUT' as const },
    ] : [
      { stage: 'control' as const, path: `${APP}/vehicleInfo/controlV2`, method: 'POST' as const, body: { param: '4', vin: session.vehicle.vin } },
    ];
    for (const step of steps) {
      signal?.throwIfAborted();
      options.onProgress?.({ stage: step.stage, state: 'sending' });
      try {
        const data = await this.cloud.request(step.path, { method: step.method, body: 'body' in step ? step.body : undefined, token: session.token, signal });
        signal?.throwIfAborted();
        if (data === false) throw new ApiError('rejected', undefined, '10000');
        options.onProgress?.({ stage: step.stage, state: 'accepted' });
      } catch (error) {
        options.onProgress?.({ stage: step.stage, state: signal?.aborted ? 'cancelled' : 'failed',
          ...(error instanceof ApiError ? { failure: error.kind, httpStatus: error.httpStatus, businessCode: error.businessCode } : {}) });
        throw error;
      }
    }
  }
  private phone(phone: string) { if (!/^1\d{10}$/.test(phone)) throw new ApiError('format'); }
  private binding(session: Session) { if (!validVehicleId(session.vehicle.vin) || !session.token) throw new ApiError('format'); }
}
