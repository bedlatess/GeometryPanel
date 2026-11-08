import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { nativeAccountsAuthorized } from '../core/background';
import {
  emptyHistory,
  historyCsv,
  type BatterySample,
  type ChargingSession,
} from '../core/history';
import { clearLocalHistory, readLocalHistory } from '../core/history-store';
import type { NativeCapabilities } from '../core/native';
import { useSessionStore } from './session';
export const useHistoryStore = defineStore('history', () => {
  const session = useSessionStore();
  const samples = shallowRef<BatterySample[]>([]),
    charges = shallowRef<ChargingSession[]>([]);
  const period = ref('24h'),
    start = ref(''),
    end = ref('');
  const busy = ref(false),
    error = ref(''),
    total = ref(0),
    count = ref(500);
  const totals = reactive({ battery: 0, charge: 0 });
  const hasMore = computed(
    () =>
      samples.value.length < Math.min(5000, totals.battery) ||
      charges.value.length < Math.min(5000, totals.charge),
  );
  let scope = new AbortController(),
    nativeHistory = false;
  const from = computed(() =>
    start.value
      ? new Date(start.value).getTime()
      : ['all', 'custom'].includes(period.value)
        ? 0
        : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[period.value] ?? 1) * 86400000,
  );
  const until = computed(() =>
    end.value ? new Date(end.value).getTime() : Number.MAX_SAFE_INTEGER,
  );
  const visibleSamples = computed(() =>
    samples.value.filter((item) => item.at >= from.value && item.at <= until.value),
  );
  const visibleCharges = computed(() =>
    charges.value.filter((item) => item.startedAt >= from.value && item.startedAt <= until.value),
  );
  function reset() {
    scope.abort();
    scope = new AbortController();
    samples.value = [];
    charges.value = [];
    busy.value = false;
    error.value = '';
    count.value = 500;
    total.value = totals.battery = totals.charge = 0;
  }
  watch([() => session.state.accountBook.selectedVehicleId, () => session.state.preview], reset);
  async function load(append = false) {
    const selected = session.state.accountBook.selectedVehicleId;
    if (busy.value || session.state.preview || !selected) return;
    const signal = scope.signal;
    busy.value = true;
    error.value = '';
    if (!append) count.value = 500;
    else count.value = Math.min(5000, count.value + 500);
    try {
      const caps = session.state.nativeAvailable
        ? await session.nativeCall<NativeCapabilities>('capabilities', {}, signal)
        : null;
      nativeHistory = caps?.features.history === true && nativeAccountsAuthorized();
      let result = emptyHistory();
      if (nativeHistory) {
        for (const kind of ['battery', 'charge'] as const) {
          const prior = kind === 'battery' ? samples.value : charges.value;
          const last = append ? prior.at(-1) : null;
          const before = last
            ? kind === 'charge'
              ? (last as ChargingSession).startedAt
              : (last as BatterySample).at
            : undefined;
          const response = await session.nativeCall<{ items: unknown[]; total: number }>(
            'background.history',
            { vehicleId: selected, kind, limit: 500, ...(before ? { before } : {}) },
            signal,
          );
          if (signal.aborted) return;
          const received = Array.isArray(response.items) ? response.items.slice(0, 500) : [];
          const items = (append ? [...prior, ...received] : received).slice(0, 5000);
          totals[kind] =
            append && !received.length ? items.length : (response.total ?? items.length);
          if (kind === 'battery') result.samples = items as BatterySample[];
          else result.chargingSessions = items as ChargingSession[];
        }
      } else {
        result = await readLocalHistory(selected);
        totals.battery = result.samples.length;
        totals.charge = result.chargingSessions.length;
        result.samples = result.samples.slice(-count.value).reverse();
        result.chargingSessions = result.chargingSessions.slice(-count.value).reverse();
      }
      if (signal.aborted) return;
      total.value = Math.max(totals.battery, totals.charge);
      samples.value = result.samples;
      charges.value = result.chargingSessions;
    } catch {
      if (!signal.aborted) error.value = '加载失败';
    } finally {
      if (!signal.aborted) busy.value = false;
    }
  }
  async function clear(kind: 'battery' | 'charge' = 'battery') {
    const selected = session.state.accountBook.selectedVehicleId;
    if (busy.value || session.state.preview || !selected) return;
    try {
      if (nativeHistory)
        await session.nativeCall(
          'history.clear',
          { vehicleId: selected, kind, confirmed: true },
          scope.signal,
        );
      else await clearLocalHistory(selected, kind);
      await load();
      session.toast('已清除');
    } catch {
      session.toast('没保存上，再试一次');
    }
  }
  function download(kind: 'battery' | 'charge' = 'battery') {
    const blob = new Blob(
      [historyCsv(kind === 'battery' ? visibleSamples.value : visibleCharges.value, kind)],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `geometry-${kind}-history.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    samples,
    charges,
    period,
    start,
    end,
    busy,
    error,
    total,
    count,
    visibleSamples,
    visibleCharges,
    hasMore,
    load,
    clear,
    download,
    reset,
  };
});
