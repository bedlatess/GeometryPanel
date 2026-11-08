<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import MetricValue from './MetricValue.vue';
defineProps<{
  title: string;
  subtitle?: string;
  warning?: boolean;
  icon?: string;
  metrics: { label: string; value: string | number | null | undefined; unit?: string }[];
}>();
</script>
<template>
  <section class="status-card">
    <div class="heading">
      <span class="status-icon" :class="{ warning, neutral: icon && icon !== 'check' }">
        <AppIcon :name="warning ? 'alert' : icon || 'check'"
      /></span>
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div class="stats">
      <div v-for="metric in metrics" :key="metric.label" class="stat">
        <span>{{ metric.label }}</span
        ><MetricValue :value="metric.value" :unit="metric.unit" />
      </div>
    </div>
  </section>
</template>
<style scoped src="./StatusCard.css"></style>
