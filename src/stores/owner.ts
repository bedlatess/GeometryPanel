import { defineStore } from 'pinia';
import { ref, reactive, watch } from 'vue';
import { OwnerApi, type OwnerRead } from '../api/owner';
import { ApiError } from '../api/client';
import {
  changeOnce,
  ownerObject as obj,
  ownerRows as rows,
  ownerNumber as num,
  ownerText as txt,
} from '../core/owner-model';
import { useSessionStore } from './session';
export { obj, rows, num, txt };
export const useOwnerStore = defineStore('owner', () => {
  const session = useSessionStore(),
    api = new OwnerApi();
  const data = reactive<Partial<Record<OwnerRead, unknown>>>({});
  const errors = reactive(new Set<OwnerRead>()),
    known = reactive(new Set<OwnerRead>());
  const busy = ref(false),
    writing = ref(false),
    failed = ref(false),
    note = ref('');
  let scope = new AbortController(),
    generation = 0;
  function reset() {
    scope.abort();
    scope = new AbortController();
    generation++;
    for (const key of Object.keys(data)) delete data[key as OwnerRead];
    errors.clear();
    known.clear();
    busy.value = false;
    writing.value = false;
    note.value = '';
  }
  watch(() => session.state.session, reset);
  const get = (key: OwnerRead) => obj(data[key]);
  const list = (key: OwnerRead) => rows(data[key]);
  const supported = (code: string) =>
    list('caps').some(
      (row) =>
        row.functionCode === code &&
        (row.isSupport === true || row.isSupport === 1 || row.isSupport === '1'),
    );
  async function read(key: OwnerRead, args: Record<string, string> = {}) {
    const bound = session.state.session,
      signal = scope.signal;
    if (!bound || session.state.preview) return;
    try {
      const result = await api.read(bound, key, args, signal);
      if (!signal.aborted) {
        data[key] = result;
        known.add(key);
        errors.delete(key);
      }
      return result;
    } catch (failure) {
      if (signal.aborted) return;
      errors.add(key);
      if (failure instanceof ApiError && failure.kind === 'expired') session.expire();
      throw failure;
    }
  }
  async function load(keys: OwnerRead[], args: Record<string, string> = {}) {
    if (!session.state.session || session.state.preview) return;
    const current = generation;
    busy.value = true;
    const results = await Promise.allSettled(keys.map((key) => read(key, args)));
    if (current !== generation || scope.signal.aborted) return;
    failed.value = results.every((result) => result.status === 'rejected');
    busy.value = false;
  }
  async function mutate(
    write: (api: OwnerApi, signal: AbortSignal) => Promise<unknown>,
    key: OwnerRead,
    matches: (value: unknown) => boolean | null,
  ) {
    if (busy.value || !session.state.session || session.state.preview) return;
    const signal = scope.signal;
    busy.value = true;
    writing.value = true;
    note.value = '';
    try {
      note.value = await changeOnce(
        () => write(api, signal),
        () => read(key),
        matches,
        signal,
      );
    } catch {
      if (!signal.aborted) note.value = '已发送，车辆尚未确认';
    } finally {
      if (!signal.aborted) {
        busy.value = false;
        writing.value = false;
        session.toast(note.value);
      }
    }
  }
  return {
    data,
    errors,
    known,
    busy,
    writing,
    failed,
    note,
    get,
    list,
    supported,
    read,
    load,
    mutate,
    reset,
  };
});
