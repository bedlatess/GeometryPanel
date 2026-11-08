<script setup lang="ts">
import { computed } from 'vue';
import { IonPage, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton } from '@ionic/vue';
import { useRouter, useRoute } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { useSessionStore } from '../stores/session';
const session = useSessionStore();
const route = useRoute();
const signedIn = computed(() => session.state.preview || Boolean(session.state.session));
const tabs = [
  { path: 'vehicle', label: '车辆', icon: 't-car' },
  { path: 'records', label: '记录', icon: 't-rec' },
  { path: 'tools', label: '工具', icon: 't-tool' },
  { path: 'me', label: '我的', icon: 't-me' },
];
function tapTab(path: string) {
  if (route.path === `/${path}`) {
    const content = document.querySelector('.ion-page:not(.ion-page-hidden) ion-content');
    void (content as HTMLIonContentElement | null)?.scrollToTop(350);
  }
}
</script>
<template>
  <IonPage>
    <IonTabs>
      <IonRouterOutlet />
      <IonTabBar v-if="signedIn" slot="bottom" :translucent="true" aria-label="主导航">
        <IonTabButton
          v-for="tab in tabs"
          :key="tab.path"
          :tab="tab.path"
          :href="`/${tab.path}`"
          @click="tapTab(tab.path)"
        >
          <AppIcon :name="tab.icon" /><span>{{ tab.label }}</span>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  </IonPage>
</template>
<style scoped src="./TabsLayout.css"></style>
