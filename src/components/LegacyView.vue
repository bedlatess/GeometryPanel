<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IonPage, IonContent, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import PageHeader from './PageHeader.vue';
import { useSessionStore } from '../stores/session';
const host = ref<HTMLElement>();
const route = useRoute();
const ownPath = route.path;
const title = String(route.meta.title || '几何面板');
const session = useSessionStore();
let dispose: (() => void) | undefined;
function toolbar(event: MouseEvent) {
  const button = (event.target as Element).closest<HTMLElement>('[data-page-tool]');
  if (button) session.toolbar(button);
}
function mount() {
  if (route.path !== ownPath || session.state.booting) return;
  dispose?.();
  if (host.value) dispose = session.legacy(host.value, route.path);
}
onIonViewWillEnter(mount);
onIonViewWillLeave(() => {
  dispose?.();
  dispose = undefined;
});
watch(
  () =>
    JSON.stringify([
      session.state.booting,
      session.state.preferences,
      session.state.developer,
      session.state.mapVisible,
      session.state.checkingUpdate,
    ]),
  mount,
);
onBeforeUnmount(() => dispose?.());
</script>
<template>
  <IonPage :data-page="ownPath">
    <PageHeader :title="title"><div class="header-extra" @click="toolbar" /></PageHeader>
    <IonContent><main ref="host" class="legacy-page" /></IonContent>
  </IonPage>
</template>
<style scoped src="./LegacyView.css"></style>
