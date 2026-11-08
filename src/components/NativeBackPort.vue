<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { useSessionStore } from '../stores/session';

type Overlay = HTMLElement & {
  canDismiss?: boolean;
  dismiss: (data?: unknown, role?: string) => Promise<boolean>;
};
const session = useSessionStore();
const overlays = shallowRef<Overlay[]>([]);
const top = computed(() => overlays.value.at(-1));
const blocked = computed(() => session.state.committing || top.value?.canDismiss === false);
const names = ['ionModal', 'ionActionSheet', 'ionPopover', 'ionAlert', 'ionPicker'];
function presented(event: Event) {
  const target = event.target as Overlay;
  overlays.value = [...overlays.value.filter((item) => item !== target), target];
}
function dismissed(event: Event) {
  overlays.value = overlays.value.filter((item) => item !== event.target && item.isConnected);
}
function close() {
  if (!blocked.value) void top.value?.dismiss(undefined, 'backdrop');
}
onMounted(() => {
  for (const name of names) {
    document.addEventListener(`${name}WillPresent`, presented);
    document.addEventListener(`${name}DidDismiss`, dismissed);
  }
});
onBeforeUnmount(() => {
  for (const name of names) {
    document.removeEventListener(`${name}WillPresent`, presented);
    document.removeEventListener(`${name}DidDismiss`, dismissed);
  }
});
</script>
<template>
  <!-- The existing Android host queries this invisible port before navigating back. -->
  <dialog :open="Boolean(top)" hidden aria-hidden="true" class="native-back-port">
    <button data-action="close" :disabled="blocked" tabindex="-1" @click="close" />
  </dialog>
</template>
<style scoped>
.native-back-port {
  display: none;
}
</style>
