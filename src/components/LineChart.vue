<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useSessionStore } from '../stores/session';
const props = defineProps<{
  points: { t: number; v: number }[];
  energy?: boolean;
  label: string;
  second?: { t: number; v: number }[];
  gap?: number;
  minimum?: number;
  reference?: number;
}>();
const session = useSessionStore(),
  selected = ref<number | null>(null);
const areaId = `area-${useId()}`;
const all = computed(() => [...props.points, ...(props.second || [])]);
const start = computed(() => Math.min(...all.value.map((item) => item.t)));
const end = computed(() => Math.max(...all.value.map((item) => item.t)));
const min = computed(() => props.minimum ?? Math.min(...all.value.map((item) => item.v), 0));
const max = computed(() => (props.energy ? 100 : Math.max(...all.value.map((item) => item.v), 1)));
const x = (value: number) =>
  4 + ((value - start.value) / Math.max(1, end.value - start.value)) * 318;
const y = (value: number) =>
  120 - ((value - min.value) / Math.max(0.1, max.value - min.value)) * 110;
function path(points: { t: number; v: number }[]) {
  return points
    .map(
      (point, index) =>
        `${
          !index || point.t - points[index - 1].t > (props.gap ?? 5 * 60000) ? 'M' : 'L'
        }${x(point.t)},${y(point.v)}`,
    )
    .join(' ');
}
const areas = computed(() => {
  const groups: { t: number; v: number }[][] = [];
  props.points.forEach((point, index) => {
    if (!index || point.t - props.points[index - 1].t > (props.gap ?? 5 * 60000)) groups.push([]);
    groups.at(-1)!.push(point);
  });
  return groups
    .filter((group) => group.length > 1)
    .map((group) => `${path(group)} L${x(group.at(-1)!.t)},130 L${x(group[0].t)},130Z`);
});
const gaps = computed(() =>
  props.points
    .flatMap((point, index) =>
      index && point.t - props.points[index - 1].t > (props.gap ?? 5 * 60000)
        ? [
            `M${x(props.points[index - 1].t)},${y(props.points[index - 1].v)}` +
              `L${x(point.t)},${y(point.v)}`,
          ]
        : [],
    )
    .join(' '),
);
function touch(event: PointerEvent) {
  if (!props.points.length) return;
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect();
  const index = Math.min(
    props.points.length - 1,
    Math.max(
      0,
      Math.round(((event.clientX - bounds.left) / bounds.width) * (props.points.length - 1)),
    ),
  );
  if (index !== selected.value) session.haptic('selection');
  selected.value = index;
}
</script>
<template>
  <svg
    viewBox="0 0 326 130"
    role="img"
    :aria-label="label"
    class="line-chart"
    :class="{ energy }"
    @pointerdown="touch"
    @pointermove="$event.buttons && touch($event)"
    @pointerup="selected = null"
    @pointercancel="selected = null"
  >
    <defs>
      <linearGradient :id="areaId" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--energy)" stop-opacity=".28" />
        <stop offset="1" stop-color="var(--energy)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <template v-if="energy">
      <path
        v-for="(area, index) in areas"
        :key="index"
        :d="area"
        :fill="`url(#${areaId})`"
        stroke="none"
      />
    </template>
    <path v-if="reference != null" :d="`M4 ${y(reference)}H322`" class="gap" />
    <path v-if="points.length > 1" :d="path(points)" class="series" />
    <circle v-else-if="points.length" :cx="x(points[0].t)" :cy="y(points[0].v)" r="3" />
    <path v-if="second?.length" :d="path(second)" class="second series" />
    <path v-if="gaps" :d="gaps" class="gap" />
    <path v-if="!points.length" d="M4 65H322" class="gap" />
    <g v-if="selected != null && points[selected]" class="bubble">
      <path :d="`M${x(points[selected].t)} 0V130`" />
      <rect x="128" y="0" width="70" height="24" rx="8" />
      <text x="163" y="16" text-anchor="middle">{{ points[selected].v }}</text>
    </g>
  </svg>
</template>
<style scoped src="./LineChart.css"></style>
