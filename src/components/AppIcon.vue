<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ name: string }>();
const icons = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const source = computed(() => {
  const aliases: Record<string, string> = { 'wifi-off': 'offline' };
  const raw =
    icons[`../assets/icons/${aliases[props.name] || props.name}.svg`] ??
    icons['../assets/icons/info.svg'];
  return new DOMParser().parseFromString(raw, 'image/svg+xml').documentElement;
});
const attributes = computed(() =>
  Object.fromEntries(Array.from(source.value.attributes).map((attr) => [attr.name, attr.value])),
);
const paths = computed(() => Array.from(source.value.children));
// SVG source is compiled to Vue VNodes, never inserted as HTML.
import SvgNodes from './SvgNodes';
</script>
<template>
  <svg v-bind="attributes" class="app-icon" aria-hidden="true" focusable="false">
    <SvgNodes :nodes="paths" />
  </svg>
</template>
<style scoped src="./AppIcon.css"></style>
