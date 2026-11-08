import {
  rideMonth,
  rideTracks,
  tireReadings,
  vehicleAlerts,
  vehicleSettings,
} from '../../../core/extensions-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.simulated = function () {
    if (ctx.tab === 'ride')
      ctx.monthly = rideMonth({
        rideMileageTotal: 1256,
        rideRecordList: [
          {
            date: `${ctx.month.replace('-', '.')}.06`,
            rideMileage: 12.4,
            ridingTimeDayUnitMinute: 28,
            maxSpeed: 39,
          },
        ],
      });
    if (ctx.tab === 'tracks')
      ctx.tracks = rideTracks([
        {
          historyList: [
            {
              rideId: 'demo-trip',
              dayTime: ctx.day,
              startTime: `${ctx.day} 08:10`,
              endTime: `${ctx.day} 08:38`,
              rideMileage: 12.4,
              ridingTimeUnitMinute: 28,
              maxSpeed: 39,
              startAddr: JSON.stringify({ name: '起点' }),
              endAddr: JSON.stringify({ name: '终点' }),
              trajectory: '120,30&120.002,30.003&120.006,30.003&120.009,30.008',
            },
          ],
        },
      ]);
    if (ctx.tab === 'tires')
      ctx.tires = tireReadings({
        updateTime: Date.now(),
        realTimeData: [
          {
            sensorPosition: 1,
            tirePressure: 2.2,
            tireTemp: 24,
            warningType: 0,
            reportTime: Date.now(),
          },
          {
            sensorPosition: 2,
            tirePressure: 2.3,
            tireTemp: 25,
            warningType: 0,
            reportTime: Date.now(),
          },
        ],
      });
    if (ctx.tab === 'alerts')
      ctx.alerts = vehicleAlerts(
        {
          noRead: 1,
          messageVOList: [
            {
              messageId: 'demo-alert',
              content: '车辆消息',
              messageTime: `${ctx.day} 09:00`,
              unread: '0',
              extra: JSON.stringify({ detail: '演示' }),
            },
          ],
        },
        '',
      );
    if (ctx.tab === 'settings')
      ctx.settings = vehicleSettings([{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }], {
        precisionEndurance: 1,
        mileageUnit: 1,
        temperatureUnit: 1,
        timeFormat: 2,
        soundEffectSetting: { soundSize: 60 },
      });
  };
}
