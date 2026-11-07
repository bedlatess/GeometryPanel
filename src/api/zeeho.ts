import { ApiError, CloudClient } from './client';
import { object, snapshot, validVehicleId, vehicleList, type Session } from '../core/model';

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
  async horn(session: Session, signal?: AbortSignal) {
    this.binding(session);
    await this.cloud.request(`${APP}/dbpoint/send`, { method: 'POST', token: session.token, signal, body: {
      eventId: 11631,
      param: JSON.stringify({ vinNo: session.vehicle.vin, functionCode: 'LOUDLY_SEARCH_CAR', type: 'LOW' }),
      uuid: '', zeehoParamTypeBO: null,
    } });
  }
  private phone(phone: string) { if (!/^1\d{10}$/.test(phone)) throw new ApiError('format'); }
  private binding(session: Session) { if (!validVehicleId(session.vehicle.vin) || !session.token) throw new ApiError('format'); }
}
