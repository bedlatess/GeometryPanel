import { ApiError, CloudClient } from './client';
import { validVehicleId, type Session } from '../core/model';
import { rideMonth, rideTracks, tireReadings, vehicleAlerts, vehicleSettings, settingDefinitions, validMonth, validDay } from '../core/extensions-model';

const APP = '/v1.0/app/cfmotoserverapp';
export class ExtensionsApi {
  constructor(private readonly cloud = new CloudClient()) {}
  private binding(session: Session) {
    if (!session.token || !validVehicleId(session.vehicle.vin)) throw new ApiError('format');
  }
  async month(session: Session, month: string, signal?: AbortSignal) {
    this.binding(session);
    if (!validMonth(month)) throw new ApiError('format');
    return rideMonth(await this.cloud.request(`${APP}/myRideInfo`, { token: session.token, signal, query: { month: month.replace('-', '.'), vinNo: session.vehicle.vin } }));
  }
  async tracks(session: Session, day: string, page = 1, signal?: AbortSignal) {
    this.binding(session);
    if (!validDay(day) || !Number.isInteger(page) || page < 1 || page > 500) throw new ApiError('format');
    return rideTracks(await this.cloud.request(`${APP}/ridetrack_v2`, { token: session.token, signal, query: {
      endDate: '', page: String(page), pageSize: '20', startDate: '', startDateTime: day, startTime: day.slice(0, 7), vinNo: session.vehicle.vin,
    } }));
  }
  async tires(session: Session, signal?: AbortSignal) {
    this.binding(session);
    return tireReadings(await this.cloud.request(`${APP}/app/vehicle/tire/monitoring`, { token: session.token, signal, query: { sensorType: 'EXTERNAL', vinNo: session.vehicle.vin } }));
  }
  async alerts(session: Session, page = 1, signal?: AbortSignal) {
    this.binding(session);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(session.uid) || !Number.isInteger(page) || page < 1 || page > 500) throw new ApiError('format');
    return vehicleAlerts(await this.cloud.request('/v1.0/mine/cfmotoservermine/app/Message/list_v2', { token: session.token, signal, query: {
      messageKind: '3', page: String(page), pageSize: '20', userId: session.uid,
    } }), session.vehicle.vin);
  }
  async settings(session: Session, signal?: AbortSignal) {
    this.binding(session);
    const [caps, info] = await Promise.all([
      this.cloud.request(`${APP}/vehicleSet/items`, { token: session.token, signal, query: { homepageInvoke: '1', vinNo: session.vehicle.vin } }),
      this.cloud.request(`${APP}/vehicleSet/vehicleSetInfo/${session.vehicle.vin}`, { token: session.token, signal }),
    ]);
    signal?.throwIfAborted();
    return vehicleSettings(caps, info, session.vehicle.type);
  }
  async updateAlerts(session: Session, action: 'read' | 'delete', signal?: AbortSignal): Promise<void> {
    this.binding(session);
    if (action !== 'read' && action !== 'delete') throw new ApiError('format');
    signal?.throwIfAborted();
    const data = await this.cloud.request(`/v1.0/mine/cfmotoservermine/app/Message/${action}`, {
      token: session.token, signal, query: { messageKind: '3' },
    });
    if (data === false) throw new ApiError('rejected', undefined, '10000');
  }
  async writeSetting(session: Session, key: string, value: string, signal?: AbortSignal): Promise<void> {
    this.binding(session);
    const definition = settingDefinitions.find(row => row.key === key);
    if (!definition?.endpoint || !definition.choices?.some(([n]) => n === value)) throw new ApiError('format');
    if (definition.guarded && !(await this.settings(session, signal)).some(row => row.key === key && row.writable && row.choices?.some(([n]) => n === value))) throw new ApiError('rejected');
    const path = definition.endpoint === 'sound' ? 'soundSize' : definition.endpoint === 'moto' ? 'motoPlay/one' : definition.endpoint === 'lowpower' ? 'lowPowerRule/one' : 'propertyOne/one';
    const body = definition.endpoint === 'sound' ? { size: Number(value), vcu: session.vehicle.vin }
      : definition.endpoint === 'moto' ? { vinNo: session.vehicle.vin, motoPlay: Number(value) }
      : definition.endpoint === 'lowpower' ? { ruleId: '', value, vcu: session.vehicle.vin }
      : { commond: definition.command, commondParam: value, relatedFunctions: null, vcu: session.vehicle.vin, version: definition.version ?? '' };
    signal?.throwIfAborted();
    const data = await this.cloud.request(`${APP}/vehicleSet/${path}`, { method: 'PUT', token: session.token, signal, body });
    signal?.throwIfAborted();
    if (data === false) throw new ApiError('rejected', undefined, '10000');
  }
}
