<script setup lang="ts">
import { onMounted, defineAsyncComponent, ref, watch } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { useRouter } from 'vue-router';
import GlobalMessages from '../components/GlobalMessages.vue';
import NativeBackPort from '../components/NativeBackPort.vue';
import { useWorkflowOverlay } from '../stores/workflow-actions';
const ModalHost = defineAsyncComponent(() => import('../components/ModalHost.vue'));
const WorkflowOverlay = defineAsyncComponent(() => import('../components/WorkflowOverlay.vue'));
const modalLoaded = ref(false),
  overlayLoaded = ref(false);
import { useSessionStore } from '../stores/session';
import { useExtensionsStore } from '../stores/extensions';
const session = useSessionStore(),
  router = useRouter(),
  extensions = useExtensionsStore();
const overlay = useWorkflowOverlay();
watch(
  () => session.sheetOpen,
  (open) => {
    if (open) modalLoaded.value = true;
  },
);
watch(
  () => overlay.sheet,
  (sheet) => {
    if (sheet) overlayLoaded.value = true;
  },
);
onMounted(() => {
  session.start(router, document.querySelector('#app')!);
  router.beforeEach((to, from) => {
    if (to.path !== from.path) extensions.cancel(from.path);
  });
});
</script>
<template>
  <IonApp
    ><IonRouterOutlet /><GlobalMessages /><ModalHost v-if="modalLoaded" />
    <WorkflowOverlay v-if="overlayLoaded" /> <NativeBackPort
  /></IonApp>
</template>
