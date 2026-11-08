import { defineStore } from 'pinia';
import { ref, shallowRef, watch } from 'vue';
import { ApiError } from '../api/client';
import { ExtensionsApi } from '../api/extensions';
import { NativeMaterialsApi } from '../api/native-materials';
import {
  chinaDay,
  rideMonth,
  rideTracks,
  tireReadings,
  vehicleSettings,
  type RideMonth,
  type RideTrack,
  type TireReading,
  type VehicleSetting,
} from '../core/extensions-model';
import { changeOnce } from '../core/owner-model';
import { useSessionStore } from './session';

export const useExtensionsStore = defineStore('extensions', () => {
  const session = useSessionStore();
  const api = new ExtensionsApi(),
    materials = new NativeMaterialsApi();
  const month = ref(chinaDay().slice(0, 7)),
    day = ref(chinaDay());
  const monthly = shallowRef<RideMonth | null>(null);
  const tracks = shallowRef<{ tracks: RideTrack[]; receivedCount: number } | null>(null);
  const tires = shallowRef<{ wheels: TireReading[]; updatedAt: number | null } | null>(null);
  const settings = shallowRef<VehicleSetting[] | null>(null);
  const busy = ref(false),
    writing = ref(false),
    error = ref(''),
    note = ref('');
  let request: AbortController | null = null,
    generation = 0;
  let requestPage = '';
  function reset() {
    generation++;
    request?.abort();
    busy.value = false;
    writing.value = false;
    monthly.value = null;
    tracks.value = null;
    tires.value = null;
    settings.value = null;
    error.value = '';
    note.value = '';
  }
  watch(() => session.state.session, reset);
  async function load(tab: 'ride' | 'tracks' | 'tires' | 'settings', page = 1) {
    const bound = session.state.session;
    if (session.state.expired) return;
    requestPage = location.hash.split('?')[0];
    request?.abort();
    request = new AbortController();
    const signal = request.signal,
      current = ++generation;
    error.value = '';
    note.value = '';
    if (session.state.preview) {
      if (tab === 'ride')
        monthly.value = rideMonth({
          rideMileageTotal: 1256,
          rideRecordList: [
            {
              date: `${month.value.replace('-', '.')}.06`,
              rideMileage: 12.4,
              ridingTimeDayUnitMinute: 28,
              maxSpeed: 39,
            },
          ],
        });
      if (tab === 'tracks')
        tracks.value = rideTracks([
          {
            historyList: [
              {
                rideId: 'demo-trip',
                dayTime: day.value,
                startTime: `${day.value} 08:10`,
                endTime: `${day.value} 08:38`,
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
      if (tab === 'tires')
        tires.value = tireReadings({
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
      if (tab === 'settings')
        settings.value = vehicleSettings(
          [{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }],
          {
            precisionEndurance: 1,
            mileageUnit: 1,
            temperatureUnit: 1,
            timeFormat: 2,
            soundEffectSetting: { soundSize: 60 },
          },
        );
      return;
    }
    if (!bound) return;
    busy.value = true;
    try {
      const result =
        tab === 'ride'
          ? await api.month(bound, month.value, signal)
          : tab === 'tracks'
            ? await api.tracks(bound, day.value, page, signal)
            : tab === 'tires'
              ? await api.tires(bound, signal)
              : await api.settings(bound, signal);
      if (signal.aborted || current !== generation) return;
      if (tab === 'ride') monthly.value = result as RideMonth;
      else if (tab === 'tracks') tracks.value = result as typeof tracks.value;
      else if (tab === 'tires') tires.value = result as typeof tires.value;
      else settings.value = result as VehicleSetting[];
    } catch (failure) {
      if (signal.aborted || current !== generation) return;
      if (failure instanceof ApiError && failure.kind === 'expired') session.expire();
      else error.value = '加载失败';
    } finally {
      if (current === generation && !signal.aborted) busy.value = false;
    }
  }
  async function write(setting: VehicleSetting, value: string) {
    const bound = session.state.session;
    if (
      session.state.expired ||
      busy.value ||
      session.state.preview ||
      !bound ||
      !setting.writable ||
      value === setting.value
    )
      return;
    busy.value = true;
    writing.value = true;
    error.value = '';
    note.value = '';
    requestPage = location.hash.split('?')[0];
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    try {
      let confirmed = true;
      note.value = await changeOnce(
        async () => {
          if (setting.key === 'cloudInductiveEnabled') {
            const result = await materials.configureInductive(bound, value === '1', signal);
            confirmed = result.confirmed;
          } else
            try {
              await api.writeSetting(bound, setting.key, value, signal);
            } catch (failure) {
              if (failure instanceof ApiError && failure.kind === 'expired') session.expire();
              throw failure;
            }
        },
        async () => {
          settings.value = await api.settings(bound, signal);
          return settings.value;
        },
        () => {
          const actual = settings.value?.find((item) => item.key === setting.key)?.value;
          return actual == null || !confirmed ? null : actual === value;
        },
        signal,
      );
    } catch (failure) {
      if (signal.aborted) return;
      if (failure instanceof ApiError && failure.kind === 'expired') session.expire();
      else error.value = '已发送，车辆尚未确认';
    } finally {
      writing.value = false;
      if (!signal.aborted) busy.value = false;
    }
    if (note.value || error.value) session.toast(note.value || error.value);
  }
  function cancel(path: string) {
    if (requestPage !== `#${path}`) return;
    if (writing.value) session.toast('已发出，结果待确认');
    reset();
  }
  return {
    month,
    day,
    monthly,
    tracks,
    tires,
    settings,
    busy,
    writing,
    error,
    note,
    load,
    write,
    cancel,
  };
});
