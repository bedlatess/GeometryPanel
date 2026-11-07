import { ApiError, CloudClient } from './client';
import { createUnlockSecret } from './legacy-unlock';
import { validVehicleId, type Session } from '../core/model';
import type { CommandStep } from '../core/command-report';

export type VehicleAction = 'powerOn' | 'powerOff' | 'seat';
type Step = {
  stage: CommandStep['stage']; path: string; method: 'POST' | 'PUT';
  body: () => unknown | Promise<unknown>;
};
const APP = '/v1.0/app/cfmotoserverapp';

export class VehicleControls {
  constructor(private readonly cloud = new CloudClient()) {}

  async execute(session: Session, action: VehicleAction, signal?: AbortSignal,
    onProgress?: (step: CommandStep) => void): Promise<void> {
    if (!['powerOn', 'powerOff', 'seat'].includes(action) || !session?.vehicle
      || typeof session.vehicle.vin !== 'string' || !validVehicleId(session.vehicle.vin) || typeof session.token !== 'string'
      || !session.token || /\s/.test(session.token)) throw new ApiError('format');
    // Capture the selected binding before any await. No command may borrow a
    // later vehicle/token from mutable caller state.
    const vin = session.vehicle.vin, token = session.token;
    const flag = action === 'powerOn' ? 1 : 0;
    const steps: Step[] = action === 'seat' ? [{
      stage: 'control', path: `${APP}/vehicleSet/propertyTwo/one`, method: 'PUT',
      body: () => ({ commond: '28', commondParam: '1', relatedFunctions: null, vcu: vin, version: 'v2' }),
    }] : [{
      stage: 'prepare', path: `${APP}/dbpoint/send`, method: 'POST',
      body: () => ({ eventId: 11631,
        param: JSON.stringify({ vinNo: vin, functionCode: 'ON_AND_OFF', type: action === 'powerOn' ? 'ON' : 'OFF' }),
        uuid: '', zeehoParamTypeBO: null }),
    }, {
      stage: 'control', path: `${APP}/vehicleSet/network/unlock`, method: 'POST',
      body: async () => ({ secret: await createUnlockSecret(flag, vin, signal), vinNo: vin, lockFlag: flag }),
    }];
    for (const step of steps) {
      signal?.throwIfAborted();
      onProgress?.({ stage: step.stage, state: 'sending' });
      try {
        const body = await step.body();
        signal?.throwIfAborted();
        const data = await this.cloud.request(step.path, { method: step.method, body, token, signal });
        signal?.throwIfAborted();
        if (data === false) throw new ApiError('rejected', undefined, '10000');
        onProgress?.({ stage: step.stage, state: 'accepted' });
      } catch (error) {
        onProgress?.({ stage: step.stage, state: signal?.aborted ? 'cancelled' : 'failed',
          ...(error instanceof ApiError ? { failure: error.kind, httpStatus: error.httpStatus, businessCode: error.businessCode } : {}) });
        throw error;
      }
    }
  }
}
