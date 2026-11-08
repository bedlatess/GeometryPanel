<script setup lang="ts">
import { ref } from 'vue';
import { IonPage, IonContent, IonHeader, IonToolbar, IonTitle } from '@ionic/vue';
import PageHeader from './PageHeader.vue';
import BrandRefresh from './BrandRefresh.vue';
import { useSessionStore } from '../stores/session';
import { useRoute } from 'vue-router';
const ownPath = useRoute().path;
defineProps<{ title: string; root?: boolean; refresh?: () => Promise<unknown> }>();
const session = useSessionStore();
const scrolled = ref(false);
</script>
<template>
  <IonPage :data-page="ownPath">
    <PageHeader :title="title" :large="root" :class="{ expanded: root && !scrolled }">
      <slot name="toolbar" />
    </PageHeader>
    <IonContent
      :fullscreen="true"
      :scroll-events="true"
      @ion-scroll="scrolled = $event.detail.scrollTop > 35"
    >
      <BrandRefresh v-if="refresh" :refresh="refresh" />
      <IonHeader v-if="root" collapse="condense" class="large-heading">
        <IonToolbar
          ><IonTitle size="large" role="heading" aria-level="1">{{ title }}</IonTitle></IonToolbar
        >
      </IonHeader>
      <main class="page-body" :class="{ root }"><slot /></main>
    </IonContent>
  </IonPage>
</template>
<style scoped src="./PageFrame.css"></style>
