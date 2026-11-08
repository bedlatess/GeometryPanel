<script setup lang="ts">
import { onMounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { useRouter } from 'vue-router';
import ModalHost from '../components/ModalHost.vue';
import GlobalMessages from '../components/GlobalMessages.vue';
import NativeBackPort from '../components/NativeBackPort.vue';
import { useSessionStore } from '../stores/session';
import { useExtensionsStore } from '../stores/extensions';
const session = useSessionStore(),
  router = useRouter(),
  extensions = useExtensionsStore();
onMounted(() => {
  session.start(router, document.querySelector('#app')!);
  router.beforeEach((to, from) => {
    if (to.path !== from.path) extensions.cancel(from.path);
  });
});
</script>
<template>
  <IonApp><IonRouterOutlet /><GlobalMessages /><ModalHost /><NativeBackPort /></IonApp>
</template>
