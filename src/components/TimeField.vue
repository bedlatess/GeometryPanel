<script setup lang="ts">
import { ref, watch } from 'vue';
import { IonDatetime } from '@ionic/vue';
import Sheet from './Sheet.vue';
const props = defineProps<{ label: string; name: string; value: string; disabled?: boolean }>();
const open = ref(false),
  time = ref(props.value);
watch(
  () => props.value,
  (value) => (time.value = value),
);
</script>
<template>
  <input type="hidden" :name="name" :value="time" />
  <button class="time-row" type="button" :disabled="disabled" @click="open = true">
    <span>{{ label }}</span
    ><span>{{ time }} ›</span>
  </button>
  <Sheet :open="open" :title="label" @close="open = false">
    <IonDatetime
      presentation="time"
      locale="zh-CN"
      hour-cycle="h23"
      :prefer-wheel="true"
      :value="`2026-01-01T${time}:00`"
      @ion-change="time = String($event.detail.value).slice(11, 16)"
    />
  </Sheet>
</template>
<style scoped>
.time-row {
  min-height: 52px;
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  font-size: 17px;
  background: var(--card);
  color: var(--t1);
}
.time-row span:last-child {
  color: var(--t2);
}
</style>
