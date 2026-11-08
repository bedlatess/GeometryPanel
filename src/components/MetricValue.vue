<script setup lang="ts">
import { ref, watch } from 'vue';
const props = defineProps<{ value: string | number | null | undefined; unit?: string }>();
const revision = ref(0);
watch(
  () => props.value,
  (value, old) => {
    if (old != null && value !== old) revision.value++;
  },
);
</script>
<template>
  <span class="metric-value num"
    ><span :key="revision" :class="{ changed: revision > 0 }">
      <i
        v-for="(digit, index) in String(value ?? '—')"
        :key="index"
        :style="{ animationDelay: `${index * 30}ms` }"
        >{{ digit }}</i
      > </span
    ><small v-if="unit">{{ unit }}</small></span
  >
</template>
<style scoped src="./MetricValue.css"></style>
