import { onIonViewDidEnter, onIonViewWillLeave } from '@ionic/vue';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useWorkflowStore } from '../stores/workflows';
export function useWorkflowPage(
  kind: 'native' | 'background' | 'tasks' | 'owner' | 'accounts' | 'extensions',
  extra: Record<string, unknown> = {},
) {
  const host = ref<HTMLElement>(),
    view = shallowRef<any>({});
  const store = useWorkflowStore();
  let dispose: (() => void) | undefined,
    generation = 0,
    mounted = false;
  async function start() {
    if (mounted) return;
    await nextTick();
    if (!host.value) return;
    mounted = true;
    const current = ++generation;
    const stop = await store.mount(kind, host.value, extra, (value) => {
      if (current === generation) view.value = value;
    });
    if (current !== generation) stop();
    else dispose = stop;
  }
  function stop() {
    generation++;
    dispose?.();
    dispose = undefined;
    mounted = false;
  }
  onMounted(start);
  onIonViewDidEnter(start);
  onIonViewWillLeave(stop);
  onBeforeUnmount(stop);
  return { host, view };
}
