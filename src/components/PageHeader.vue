<script setup lang="ts">
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton } from '@ionic/vue';
import { useRoute } from 'vue-router';
defineProps<{ title: string; back?: string; large?: boolean }>();
const meta = { ...useRoute().meta };
</script>
<template>
  <IonHeader :translucent="true">
    <IonToolbar>
      <IonButtons v-if="!large" slot="start">
        <IonBackButton
          :default-href="String(meta.parent || '/vehicle')"
          :text="back || String(meta.back || '车辆')"
        />
      </IonButtons>
      <IonTitle :role="large ? undefined : 'heading'" :aria-level="large ? undefined : 1">
        {{ title }}
      </IonTitle>
      <IonButtons slot="end"><slot /></IonButtons>
    </IonToolbar>
  </IonHeader>
</template>
<style scoped src="./PageHeader.css"></style>
