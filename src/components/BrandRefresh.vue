<script setup lang="ts">
import { ref } from 'vue';
import { IonRefresher, type RefresherCustomEvent } from '@ionic/vue';
import { useSessionStore } from '../stores/session';
const props = defineProps<{ refresh: () => Promise<unknown> }>();
const progress = ref(0),
  refreshing = ref(false);
const session = useSessionStore();
let armed = false;
async function pull(event: CustomEvent) {
  progress.value = Math.min(1, await (event.target as HTMLIonRefresherElement).getProgress());
  if (progress.value >= 1 && !armed) {
    armed = true;
    session.haptic('light');
  }
}
async function update(event: RefresherCustomEvent) {
  refreshing.value = true;
  try {
    await props.refresh();
  } finally {
    await event.target.complete();
    refreshing.value = false;
    armed = false;
    progress.value = 0;
  }
}
</script>
<template>
  <IonRefresher slot="fixed" :pull-min="64" @ion-pull="pull" @ion-refresh="update">
    <div class="brand-refresh" :class="{ refreshing }" role="status" aria-label="刷新车况">
      <span class="g-mark" /><span class="g-bar" :style="{ '--pull-progress': progress }" />
    </div>
  </IonRefresher>
</template>
<style scoped src="./BrandRefresh.css"></style>
