import type { OwnerRead } from '../src/api/owner';
export const ownerData: Record<OwnerRead, unknown> = {
  sim: {
    lastUseDate: 365,
    simStatus: '0',
  },
  expiry: {
    rechargeEndDate: '2027-03-01',
    serviceRechargeStatus: '1',
  },
  recharge: {
    rechargeEndDate: '2027-03-01',
    lastUseDate: 113,
  },
  examination: {
    deductScore: 96,
    heteroconstant: 1,
    systemList: [
      {
        inspectionName: '测试电气系统',
        abnormalState: 1,
        advise: '检查测试连接',
        list: [],
      },
    ],
  },
  maintenance: {
    keepMileage: '1240',
  },
  score: {
    score: '86',
    batteryDeductList: [
      {
        batteryDetailList: [
          {
            deductContent: '测试扣分项',
            deductScore: '14',
          },
        ],
      },
    ],
  },
  battery: {
    bmsVoltage: '76.4',
    bmsCurrent: '2',
    chargeState: '1',
  },
  charges: {
    powerChargeMonth: '34.5',
    chargeList: [
      {
        powerChargeDate: '2026-11-06',
        powerChargeValue: '20',
      },
    ],
  },
  uses: {
    powerUseMonth: '25',
    useList: [
      {
        powerUseDate: '2026-11-06',
        powerUseValue: '10',
      },
    ],
  },
  redPoint: 1,
  otaTasks: [
    {
      iotTaskId: 'test-task',
      partName: '测试仪表',
      otaVersion: '2.0.0',
    },
  ],
  otaDetail: {
    nowVersion: '1.0.0',
    lastlyVersion: '2.0.0',
    versionDesc: '测试更新说明',
    updateDate: '2026-11-01',
  },
  otaRecords: [
    {
      id: 'test-record',
      otaVersion: '1.0.0',
      updateDate: '2026-10-01',
    },
  ],
  otaStatus: {
    status: 0,
  },
  analysis: {
    accelerationTimes: '4',
    brakesTimes: '3',
    extremeSpeedNumber: '2',
    bendingTimes: '5',
    nightRide: '1',
    longDrive: '0',
  },
  rideDay: {
    accelerationTimesDay: '1',
    brakesTimesDay: '2',
    bendingTimesDay: '3',
    greenContributionDay: '1.2',
    powerConsumptionDay: '4.2',
    maxSpeed: '40',
  },
  unread: 2,
  phoneKeys: [
    {
      id: 'test-phone',
      phoneName: '测试手机',
      uniqueIdentify: '0102030405060708',
      modifyTime: '2026-11-01',
    },
  ],
  bleStatus: {
    btMacEnable: 1,
    hmiBleMacEnable: 1,
  },
  nfcKeys: [
    {
      id: 'test-card',
      nfcName: '测试卡钥匙',
      nfcNo: '0001',
    },
  ],
  fences: [
    {
      id: 'test-fence',
      rideRangeName: '测试围栏',
      addrPosition: '116.397,39.908',
      radius: '0.5',
      delFlag: '0',
    },
  ],
  plans: [
    {
      id: 'test-plan',
      startTime: '07:00',
      endTime: '21:00',
      delFlag: '0',
    },
  ],
  shareLong: [
    {
      id: 'test-share',
      shareName: '测试家人',
      sharePhone: '13900000000',
      residualSeconds: 86400,
    },
  ],
  shareTemp: [],
  shareTimes: [
    {
      hours: 24,
      count: 1,
      unit: '天',
    },
    {
      hours: 48,
      count: 2,
      unit: '天',
    },
  ],
  settings: {
    automaticLock: 1,
    radarFcw: 2,
    ultraLowBatteryReminder: 1,
    withdrawalStartTime: '07:00',
    withdrawalEndTime: '21:00',
  },
  caps: [
    {
      functionCode: 'AUTOMATIC_LOCK',
      isSupport: true,
    },
    {
      functionCode: 'RADAR_ASSISTED_FCW',
      isSupport: true,
    },
    {
      functionCode: 'PASSWORD_UNLOCKING',
      isSupport: true,
    },
  ],
  home: {
    hmiRidableMile: 91,
    otaVersion: '1.0.0',
    activationDate: '2025-01-01',
    firstBindDate: '2025-01-02',
    bluetoothAddress: 'AA:BB:CC:DD:3F:A1',
    openStorageBoxFlag: true,
  },
  tires: {
    realTimeData: [
      {
        sensorPosition: 1,
        tirePressure: 2.4,
        tireTemp: 24,
        warningType: 0,
      },
    ],
  },
  tireHistory: {
    startTime: 1794000000,
    endTime: 1794086400,
    data: [
      {
        sensorPosition: 1,
        tirePressureStat: {
          list: [
            {
              time: 1794000000,
              value: 2.4,
            },
            {
              time: 1794003600,
              value: 2.3,
            },
            {
              time: 1794040000,
              value: 2.4,
            },
          ],
        },
        tireTempStat: {
          list: [
            {
              time: 1794000000,
              value: 24,
            },
            {
              time: 1794003600,
              value: 25,
            },
          ],
        },
      },
    ],
  },
};
