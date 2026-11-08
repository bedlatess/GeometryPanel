<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import AppIcon from './AppIcon.vue';
defineProps<{ text: string; icon?: string; retry?: boolean }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div class="empty-state" :role="retry ? 'alert' : undefined">
    <AppIcon :name="icon || 'clock'" />
    <p>{{ text }}</p>
    <IonButton v-if="retry" fill="solid" size="small" @click="$emit('retry')">重试</IonButton>
  </div>
</template>
<style scoped src="./EmptyState.css"></style>
