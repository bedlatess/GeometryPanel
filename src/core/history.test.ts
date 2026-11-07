import test from 'node:test';
import assert from 'node:assert/strict';
import { addHistory, emptyHistory, historyCsv } from './history';
import { demoSnapshot, type Snapshot } from './model';
const sample = (receivedAt: number, charging: string, soc = 50): Snapshot => ({ ...demoSnapshot, receivedAt, charging, soc, daily: { ...demoSnapshot.daily, batteryReportState: 'fresh' } });
test('charging history distinguishes full, interruption and gaps rather than inferring completion from 100 percent', () => {
  let history = addHistory(emptyHistory(), sample(1000000, '充电中'), () => 'charge-1');
  history = addHistory(history, sample(1060000, '未充电', 100));
  assert.equal(history.chargingSessions[0].status, 'interrupted');
  history = addHistory(history, sample(1120000, '充电中'), () => 'charge-2');
  history = addHistory(history, sample(1180000, '已充满', 100));
  assert.equal(history.chargingSessions[1].status, 'full');
  history = addHistory(history, sample(1240000, '充电中'), () => 'charge-3');
  history = addHistory(history, sample(2000000, '未充电'));
  assert.equal(history.chargingSessions[2].status, 'unknown');
  assert.equal(history.chargingSessions[2].endedAt, 1240000);
});
test('unknown/stale data does not terminate charging and old responses do not overwrite history', () => {
  let history = addHistory(emptyHistory(), sample(1000000, '充电中'), () => 'charge-1');
  history = addHistory(history, sample(1060000, '充电状态未知'));
  assert.equal(history.chargingSessions[0].status, 'charging');
  const stale = sample(1120000, '未充电'); stale.daily.batteryReportState = 'stale';
  history = addHistory(history, stale);
  assert.equal(history.chargingSessions[0].status, 'charging');
  assert.equal(addHistory(history, sample(1050000, '已充满')).samples.length, 3);
});
test('CSV exports only allowlisted readings, escapes cells and excludes account material', () => {
  const csv = historyCsv([{ at: 1, soc: 82, token: 'synthetic-private', vin: 'CAR_A' }], 'battery');
  assert.equal(csv.includes('synthetic-private'), false); assert.equal(csv.includes('CAR_A'), false); assert.match(csv, /soc/);
});
