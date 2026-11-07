import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionNumber, validMonth, validDay, rideMonth, rideTracks, trajectory, trackPath, tireReadings, vehicleAlerts, vehicleSettings, settingDefinitions } from './extensions-model';

test('extension dates validate calendars without browser-specific parsing', () => {
  assert.equal(validMonth('2026-11'), true); assert.equal(validMonth('2026.11'), false);
  assert.equal(validDay('2028-02-29'), true); assert.equal(validDay('2026-02-29'), false);
  assert.equal(validDay('2026-11-31'), false); assert.equal(validDay('2026-11-07'), true);
});
test('malformed numeric shapes stay unknown; zero and negative temperatures survive', () => {
  for (const value of ['', ' ', [], [0], {}, true, false, NaN, Infinity, '0x10', '2.3bar']) assert.equal(extensionNumber(value), null);
  assert.equal(extensionNumber('0'), 0); assert.equal(extensionNumber('-5'), -5);
});
test('ride month maps only recovered fields and keeps missing readings unknown', () => {
  const data = rideMonth({ rideMileageTotal: 0, rideRecordList: [{ date: '2026.11.07', rideMileage: 0, ridingTimeDayUnitMinute: '12.5', maxSpeed: [] }, { date: '2026.11.06' }] });
  assert.equal(data.totalMileageKm, 0); assert.equal(data.days[0].day, '2026-11-07');
  assert.equal(data.days[0].mileageKm, 0); assert.equal(data.days[0].minutes, 12.5); assert.equal(data.days[0].maxSpeedKmh, null);
  assert.equal(data.days[1].mileageKm, null);
  assert.throws(() => rideMonth({ rideRecordList: {} }));
});
test('history tracks flatten actual groups with safe JSON addresses and raw trajectory points', () => {
  const data = rideTracks([{ historyList: [{ rideId: 'trip', dayTime: '2026-11-07', rideMileage: 3.2, startAddr: '{"name":"合成起点"}', endAddr: 'invalid-json', trajectory: '120,30&120.01,30.01' }] }]);
  assert.equal(data.receivedCount, 1); assert.equal(data.tracks[0].from, '合成起点'); assert.equal(data.tracks[0].to, '');
  assert.equal(data.tracks[0].points.length, 2); assert.equal(data.tracks[0].minutes, null);
  assert.throws(() => rideTracks({ historyList: [] }));
});
test('invalid track points leave a gap rather than connecting unknown route segments', () => {
  const points = trajectory('120,30&invalid,30&120.01,30.01&120.02,30.02&0,0&181,30& ,31');
  assert.equal(points.length, 3); assert.equal(points[1].breakBefore, true); assert.equal(points[2].breakBefore, false);
  const drawing = trackPath(points)!;
  assert.equal(drawing.path.split('M').length - 1, 2);
  assert.equal(drawing.path.split('L').length - 1, 1);
  assert.ok(!/NaN|Infinity/.test(drawing.path)); assert.equal(trackPath([]), null);
  assert.ok(trackPath(trajectory('0,30')));
});
test('tires use explicit front/rear positions and prefer newer reports', () => {
  const now = Date.now();
  const data = tireReadings({ updateTime: now, realTimeData: [
    { sensorPosition: 1, tirePressure: 2.2, tireTemp: -5, warningType: 2, reportTime: now },
    { sensorPosition: '1', tirePressure: 0, reportTime: now - 1000 },
    { sensorPosition: 0, tirePressure: 9 }, { sensorPosition: 3, tirePressure: 9 },
    { sensorPosition: '2', tirePressure: '0', tireTemp: 0 },
  ] });
  assert.equal(data.wheels.length, 2); assert.equal(data.wheels[0].position, '前轮');
  assert.equal(data.wheels[0].pressureBar, 2.2); assert.equal(data.wheels[0].temperatureC, -5);
  assert.equal(data.wheels[0].warningCode, 2); assert.equal(data.wheels[1].pressureBar, 0);
  assert.equal(data.wheels[1].reportedAt, null); assert.equal(data.wheels[1].warningCode, null);
});
test('alerts scope known VINs and explicitly retain unattributed account messages', () => {
  const data = vehicleAlerts({ noRead: '4', messageVOList: [
    { messageId: 'a', vinNo: 'CAR-A', content: '<script>text</script>', unread: '0', extra: '{"detail":"合成详情","address":"{\\"address\\":\\"合成地点\\"}"}' },
    { messageId: 'b', vinNo: 'CAR-B', content: 'other vehicle' },
    { messageId: 'c', content: 'unknown vehicle', unread: 'unknown' },
    { messageId: 'd', extra: '{"carInfo":"{\\"vinNo\\":\\"CAR-A\\"}"}', unread: '1' },
  ] }, 'CAR-A');
  assert.equal(data.receivedCount, 4); assert.equal(data.accountUnread, 4);
  assert.deepEqual(data.alerts.map(row => row.id), ['a', 'c', 'd']);
  assert.equal(data.alerts[0].title, '<script>text</script>'); assert.equal(data.alerts[0].address, '合成地点');
  assert.equal(data.alerts[0].unread, true); assert.equal(data.alerts[1].unread, null); assert.equal(data.alerts[2].unread, false);
});
test('settings retain explicit unsupported, disabled and Bluetooth-only restrictions', () => {
  const data = vehicleSettings([
    { functionCode: 'PRECISION_ENDURANCE', isSupport: false },
    { functionCode: 'AUTOMATIC_PARKING_GO', isSupport: true },
    { functionCode: 'COME_HOME_WITH_YOU', blueToothServiceCodeList: [{ serviceCode: 1 }] },
    { functionCode: 'MOTOPLAY', blueToothServiceCodeList: [{ serviceCode: 0x10000001 }] },
  ], { precisionEndurance: 1, automaticParking: 0, comeHomeWithYou: 1, motoPlay: 1,
    disabledContent: [{ functionName: 'automaticParking_x', content: '合成限制' }] });
  assert.equal(data.find(row => row.key === 'precisionEndurance')?.writable, false);
  assert.equal(data.find(row => row.key === 'automaticParking')?.reason, '合成限制');
  assert.equal(data.find(row => row.key === 'comeHomeWithYou')?.writable, false);
  assert.equal(data.find(row => row.key === 'motoPlay')?.writable, true);
});
test('settings with unknown current values or unknown contracts remain read-only', () => {
  const data = vehicleSettings([{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }, { functionCode: 'UNRECOVERED', functionName: '未适配功能' }], { precisionEndurance: 99, soundEffectSetting: { soundSize: 0 }, mileageUnit: 1 });
  assert.equal(data.find(row => row.key === 'precisionEndurance')?.writable, false);
  assert.equal(data.find(row => row.key === 'UNRECOVERED')?.writable, false);
  assert.equal(data.find(row => row.key === 'soundEffectSetting.soundSize')?.value, '0');
  assert.equal(data.find(row => row.key === 'mileageUnit')?.display, '公制');
  assert.equal(settingDefinitions.find(row => row.key === 'precisionEndurance')?.command, '55');
  assert.equal(settingDefinitions.find(row => row.key === 'automaticParking')?.command, '51');
});
test('cloud inductive setting uses explicit 2.0 state before 1.0, keeping absent state unknown', () => {
  const select = (info: Record<string, unknown>) => vehicleSettings([{ functionCode: 'INDUCTIVE_UNLOCKING_2' }], info).find(row => row.key === 'cloudInductiveEnabled')!;
  assert.equal(select({ inductiveUnlocking2: 0, inductiveUnlocking: 1 }).value, '0');
  assert.equal(select({ inductiveUnlocking: 1 }).value, '1');
  assert.equal(select({}).value, null); assert.equal(select({}).writable, false);
  assert.equal(select({ inductiveUnlocking2: 1, disabledContent: [{ functionName: 'inductiveUnlocking2_x', content: '合成限制' }] }).writable, false);
});
