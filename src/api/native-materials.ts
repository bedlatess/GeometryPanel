import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { ApiError, CloudClient } from './client';
import { object, validVehicleId, type Session } from '../core/model';

const APP = '/v1.0/app/cfmotoserverapp';
export interface NativeBinding {
  vin: string; uid: string; ownerId: string; credentialDigest: string; fetchedAt: number;
  bindingUserId: string; sharedFlag: 0; bluetoothAddress: string; hmiBluetoothAddress: string;
  inductiveGeneration: number; broadcastType: string; cloudEnabled: boolean | null;
  encryptInfo?: { encryptValue: string; key: string; iv: string };
}
const flag = (value: unknown): boolean | null => value === true || value === 1 || value === '1' || value === 'true' ? true
  : value === false || value === 0 || value === '0' || value === 'false' ? false : null;
const scalarId = (value: unknown) => typeof value === 'string' && value.length <= 256 ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
export function nativeBinding(session: Session, home: Record<string, unknown>, settings: Record<string, unknown>, now = Date.now(), requireKey = true): NativeBinding {
  const vin = session.vehicle.vin, uid = session.uid;
  if (!validVehicleId(vin) || !uid || uid.length > 256 || !session.token || /\s/.test(session.token)) throw new ApiError('format');
  for (const [data, required] of [[home, true], [settings, false]] as const) {
    let present = false;
    for (const key of ['vinNo', 'vin']) if (data[key] != null) {
      if (data[key] !== vin) throw new ApiError('format'); present = true;
    }
    if (required && !present) throw new ApiError('format');
    if (data.sharedFlag != null && flag(data.sharedFlag) !== false) throw new ApiError('rejected');
    if ((required || data.bindingUserId != null) && scalarId(data.bindingUserId) !== uid) throw new ApiError('rejected');
  }
  const pick = (key: string) => home[key] ?? settings[key];
  const mergedFlag = (key: string) => flag(home[key]) === true || flag(settings[key]) === true ? true
    : (home[key] != null && flag(home[key]) === null || settings[key] != null && flag(settings[key]) === null) ? null
    : flag(home[key]) ?? flag(settings[key]);
  const enabled = (key: string) => mergedFlag(key) === true;
  const bleEnabled = flag((home.bleStatusVO as any)?.hmiBleMacEnable) === true || flag((settings.bleStatusVO as any)?.hmiBleMacEnable) === true;
  const generation = enabled('inductiveUnlocking3Flag') && bleEnabled ? 3 : enabled('inductiveUnlocking2') ? 2 : enabled('inductiveUnlocking') ? 1
    : ['inductiveUnlocking3Flag', 'inductiveUnlocking2', 'inductiveUnlocking'].every(key => mergedFlag(key) === false) ? 0 : -1;
  const mac = (value: unknown) => typeof value === 'string' && /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(value) ? value.toUpperCase() : '';
  const rawInfo = pick('encryptInfo');
  const info = rawInfo && typeof rawInfo === 'object' && !Array.isArray(rawInfo) ? rawInfo as Record<string, unknown> : {};
  const keyValid = typeof info.encryptValue === 'string' && /^[a-f0-9]{128}$/i.test(info.encryptValue)
    && typeof info.key === 'string' && [16, 24, 32].includes(new TextEncoder().encode(info.key).length)
    && (info.iv == null || typeof info.iv === 'string' && info.iv.length <= 256);
  if (requireKey && !keyValid) throw new ApiError('format');
  const cloudEnabled = flag(settings.inductiveUnlocking2) ?? flag(settings.inductiveUnlocking);
  return { vin, uid, ownerId: uid, credentialDigest: bytesToHex(sha256(new TextEncoder().encode(session.token))), fetchedAt: now,
    bindingUserId: uid, sharedFlag: 0, bluetoothAddress: mac(pick('bluetoothAddress')), hmiBluetoothAddress: mac(pick('hmiBluetoothAddress')),
    inductiveGeneration: generation, broadcastType: scalarId(pick('broadcastType')), cloudEnabled,
    ...(keyValid ? { encryptInfo: { encryptValue: info.encryptValue as string, key: info.key as string, iv: typeof info.iv === 'string' ? info.iv : '' } } : {}) };
}
export class NativeMaterialsApi {
  constructor(private readonly cloud = new CloudClient()) {}
  async prepare(session: Session, signal?: AbortSignal, requireKey = true) {
    this.check(session);
    const home = object(await this.cloud.request(`${APP}/vehicleHomePageV2/${session.vehicle.vin}`, { token: session.token, signal }));
    signal?.throwIfAborted();
    const settings = object(await this.cloud.request(`${APP}/vehicleSet/vehicleSetInfo/${session.vehicle.vin}`, { token: session.token, signal }));
    signal?.throwIfAborted();
    return nativeBinding(session, home, settings, Date.now(), requireKey);
  }
  async register(session: Session, identity: string, signal?: AbortSignal) {
    this.check(session);
    if (!/^[0-9a-f]{16}$/.test(identity)) throw new ApiError('format');
    const result = await this.cloud.request(`${APP}/app/inductiveUnlock/airLock/save`, { method: 'POST', token: session.token, signal,
      body: { inductiveUnlockType: '2.0', openStatus: 1, uniqueIdentify: identity, vinNo: session.vehicle.vin } });
    if (result === false) throw new ApiError('rejected');
  }
  async configureInductive(session: Session, enabled: boolean, signal?: AbortSignal): Promise<{ confirmed: boolean; current: boolean | null }> {
    if (typeof enabled !== 'boolean') throw new ApiError('format');
    // The original native settings operation uses empty type/identity, unlike save.
    // Verify ownership first, then re-read the device setting instead of trusting an HTTP ACK.
    await this.prepare(session, signal, false);
    signal?.throwIfAborted();
    const result = await this.cloud.request(`${APP}/app/inductiveUnlock/airLock/setting`, { method: 'POST', token: session.token, signal,
      body: { inductiveUnlockType: '', openStatus: enabled ? 1 : 0, uniqueIdentify: '', vinNo: session.vehicle.vin } });
    if (result === false) throw new ApiError('rejected');
    signal?.throwIfAborted();
    const settings = object(await this.cloud.request(`${APP}/vehicleSet/vehicleSetInfo/${session.vehicle.vin}`, { token: session.token, signal }));
    for (const key of ['vinNo', 'vin']) if (settings[key] != null && settings[key] !== session.vehicle.vin) throw new ApiError('format');
    if (settings.bindingUserId != null && scalarId(settings.bindingUserId) !== session.uid || settings.sharedFlag != null && flag(settings.sharedFlag) !== false) throw new ApiError('rejected');
    const current = flag(settings.inductiveUnlocking2) ?? flag(settings.inductiveUnlocking);
    return { current, confirmed: current === enabled };
  }
  private check(session: Session) {
    if (!session?.vehicle || !validVehicleId(session.vehicle.vin) || !session.uid || !session.token || /\s/.test(session.token)) throw new ApiError('format');
  }
}
