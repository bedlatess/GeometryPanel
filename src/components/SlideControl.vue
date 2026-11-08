<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { motion, reducedMotion } from '../theme/motion';
import AppIcon from './AppIcon.vue';
import { useSessionStore } from '../stores/session';
import { useVehiclePresentation } from '../stores/presentation';
const props = defineProps<{ driver?: any; presentation?: any }>();
const session = props.driver || useSessionStore(),
  vehicle = props.presentation || useVehiclePresentation();
const route = useRoute(),
  trackWidth = ref(350),
  snapping = ref(false);
const track = ref<HTMLElement>(),
  offset = ref<number | null>(null),
  dragging = ref(false);
const phase = computed(() => session.state.leverPhase);
const working = computed(() => snapping.value || ['sending', 'pending'].includes(phase.value));
const unknown = computed(() => vehicle.locked == null || phase.value === 'error');
const reason = computed(() =>
  session.state.preview
    ? '演示中'
    : !vehicle.online
      ? '网络不可用'
      : session.state.expired
        ? '登录已过期'
        : !session.state.session && !session.state.preview
          ? '请先登录'
          : vehicle.daily?.capabilities.networkUnlock === false
            ? '此车型不支持'
            : '',
);
const width = () => trackWidth.value - 64;
const home = () => (unknown.value ? width() / 2 : vehicle.locked === false ? width() : 0);
const position = computed(
  () =>
    offset.value ??
    (working.value || phase.value === 'success'
      ? session.state.leverTarget === 'powerOn'
        ? width()
        : 0
      : home()),
);
const icon = computed(() =>
  phase.value === 'sending'
    ? ''
    : phase.value === 'pending'
      ? 'clock'
      : phase.value === 'success'
        ? 'check'
        : phase.value === 'error'
          ? 'alert'
          : unknown.value
            ? 'lockq'
            : vehicle.locked
              ? 'lock'
              : 'unlock',
);
const label = computed(
  () =>
    reason.value ||
    (phase.value === 'sending'
      ? session.state.leverTarget === 'powerOn'
        ? '正在开锁'
        : '正在锁车'
      : phase.value === 'pending'
        ? '等待车辆响应'
        : phase.value === 'success'
          ? session.state.leverTarget === 'powerOn'
            ? '已开锁'
            : '已锁车'
          : vehicle.locked === false
            ? '滑动关机锁车'
            : '滑动上电开锁'),
);
let start = 0,
  initial = 0,
  moved = false,
  crossed = false,
  pointer = -1;
let observer: ResizeObserver | undefined, snapTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    trackWidth.value = entries[0].contentRect.width;
  });
  if (track.value) observer.observe(track.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(snapTimer);
});
const progress = computed(() =>
  offset.value == null
    ? 0
    : (unknown.value
        ? Math.abs(offset.value - initial)
        : vehicle.locked === false
          ? initial - offset.value
          : offset.value - initial) / (unknown.value ? width() / 2 : width()),
);
function down(event: PointerEvent) {
  if (reason.value || working.value || session.state.busy || event.clientX < 24) return;
  pointer = event.pointerId;
  start = event.clientX;
  initial = home();
  moved = false;
  crossed = false;
  dragging.value = true;
  track.value?.setPointerCapture(pointer);
}
function move(event: PointerEvent) {
  if (!dragging.value || pointer !== event.pointerId) return;
  const delta = event.clientX - start;
  if (Math.abs(delta) < 4 && !moved) return;
  moved = true;
  const raw = initial + delta,
    max = width();
  offset.value = raw < 0 ? raw * 0.3 : raw > max ? max + (raw - max) * 0.3 : raw;
  if (progress.value >= 0.7 && !crossed) {
    session.haptic('medium');
    crossed = true;
  }
}
function up(event: PointerEvent) {
  if (!dragging.value || pointer !== event.pointerId) return;
  dragging.value = false;
  if (moved && progress.value >= 0.7) {
    const mode = (offset.value ?? initial) > initial ? 'powerOn' : 'powerOff';
    offset.value = mode === 'powerOn' ? width() : 0;
    const vin = vehicle.vehicle?.vin;
    snapping.value = true;
    snapTimer = setTimeout(
      () => {
        snapping.value = false;
        if ((props.driver || route.path === '/vehicle') && vin === vehicle.vehicle?.vin)
          session.control(mode, true);
        else offset.value = null;
      },
      reducedMotion() ? 0 : motion.snap,
    );
  } else {
    offset.value = null;
    if (!moved)
      session.control(
        unknown.value
          ? event.clientX - (track.value?.getBoundingClientRect().left ?? 0) < width() / 2
            ? 'powerOff'
            : 'powerOn'
          : vehicle.locked === false
            ? 'powerOff'
            : 'powerOn',
      );
  }
}
function keyboard(event: KeyboardEvent) {
  if (reason.value || working.value || session.state.busy) return;
  if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) event.preventDefault();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    session.control(event.key === 'ArrowLeft' ? 'powerOff' : 'powerOn', true);
  } else if (event.key === 'Enter' || event.key === ' ') {
    session.control(vehicle.locked === false ? 'powerOff' : 'powerOn');
  }
}
watch(phase, (value) => {
  offset.value = null;
  if (value === 'success') session.haptic('success');
  if (value === 'error') session.haptic('warning');
});
</script>
<template>
  <div
    ref="track"
    class="lever"
    role="button"
    tabindex="0"
    :aria-label="`${vehicle.locked === false ? '关机锁车' : '上电开锁'}，需要确认`"
    :aria-disabled="Boolean(reason || working || session.state.busy)"
    :aria-busy="working"
    :class="[
      `phase-${phase}`,
      {
        ink: working && !snapping,
        warn: phase === 'error',
        off: reason,
        dragging,
        snapping,
        middle: unknown && !working,
        right: vehicle.locked === false,
      },
    ]"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="
      dragging = false;
      offset = null;
    "
    @keydown="keyboard"
  >
    <span class="lever-label" :style="{ opacity: 1 - Math.max(0, Math.min(1, progress / 0.4)) }">
      <template v-if="unknown && !working && phase !== 'success' && !reason">
        <span>‹ 锁车</span><span>开锁 ›</span> </template
      ><template v-else>{{ label }}</template>
    </span>
    <span
      class="knob"
      :class="{ completed: phase === 'success' }"
      :style="{ transform: `translateX(${position}px)` }"
    >
      <span v-if="phase === 'sending'" class="spinner" /><AppIcon v-else :name="icon" />
    </span>
  </div>
</template>
<style scoped src="./SlideControl.css"></style>
