<script setup lang="ts">
import { computed } from 'vue';
import SvgNodes from './SvgNodes';
const props = defineProps<{ name: 'mark' | 'wordmark'; label?: string }>();
const sources = import.meta.glob('../assets/brand/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const source = computed(
  () =>
    new DOMParser().parseFromString(sources[`../assets/brand/${props.name}.svg`], 'image/svg+xml')
      .documentElement,
);
const nodes = computed(() => Array.from(source.value.children));
</script>
<template>
  <svg
    :viewBox="source.getAttribute('viewBox') || undefined"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
    focusable="false"
  >
    <SvgNodes :nodes="nodes" />
  </svg>
</template>
