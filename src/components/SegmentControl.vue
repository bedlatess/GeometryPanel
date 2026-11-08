<script setup lang="ts">
import { IonSegment, IonSegmentButton, IonLabel } from '@ionic/vue';
import { useSessionStore } from '../stores/session';
defineProps<{ modelValue: string; options: [string, string][] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const session = useSessionStore();
function change(value: unknown) {
  emit('update:modelValue', String(value));
  session.haptic('selection');
}
</script>
<template>
  <IonSegment :value="modelValue" @ion-change="change($event.detail.value)">
    <IonSegmentButton v-for="[value, label] in options" :key="value" :value="value">
      <IonLabel>{{ label }}</IonLabel>
    </IonSegmentButton>
  </IonSegment>
</template>
<style scoped src="./SegmentControl.css"></style>
