<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useExtensionsStore } from '../../stores/extensions';
import { useOwnerStore } from '../../stores/owner';
import { tireHistory } from '../../core/owner-model';
import { format, age } from '../../stores/presentation';
import { IonButton } from '@ionic/vue';
import AppIcon from '../../components/AppIcon.vue';
import Sheet from '../../components/Sheet.vue';
import SegmentControl from '../../components/SegmentControl.vue';
import LineChart from '../../components/LineChart.vue';
import EmptyState from '../../components/EmptyState.vue';
const ext = useExtensionsStore(),
  owner = useOwnerStore(),
  period = ref('1');
const temperature = ref(false);
const wheels = computed(() => ext.tires?.wheels || []);
const history = computed(() => tireHistory(owner.data.tireHistory));
const color = (position: string) => {
  const wheel = wheels.value.find((item) => item.position === position);
  return wheel?.warningCode
    ? 'var(--alert)'
    : wheel?.pressureBar != null && wheel.pressureBar < 2.2
      ? 'var(--attn)'
      : 'var(--t1)';
};
onMounted(() => {
  void ext.load('tires');
  void owner.load(['tireHistory']);
});
watch(period, (value) => {
  void owner.load(['tireHistory'], { period: value });
});
</script>
<template>
  <section class="wheel-card">
    <svg
      class="bike"
      viewBox="0 0 720 420"
      fill="none"
      stroke="var(--t3)"
      stroke-width="5"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      aria-label="前后轮胎压"
    >
      <circle cx="148" cy="334" r="70" :stroke="color('前轮')" stroke-width="9" />
      <circle cx="584" cy="334" r="70" :stroke="color('后轮')" stroke-width="9" />
      <path
        d="M148 334 L196 206M86 292 C110 258 168 250 210 276M188 58 L262 50M226 54
        L206 138M206 138 C200 160 186 200 176 236 C170 258 178 270 200 274 L232 280 L266
        300 C276 306 286 308 300 308 L452 308 C470 308 482 300 492 288 L548 214 C560 200
        576 196 596 194 L664 190 C684 189 690 200 684 218 L674 246 C668 262 656 268 638
        270 L612 272M206 138 L252 138 C266 138 274 146 276 160 L296 286 C298 300 306 308
        318 308M470 196 C474 176 492 168 514 166 L640 158 C664 157 674 170 672 190M476
        318 L584 334"
      />
    </svg>
    <div
      v-for="(position, index) in ['前轮', '后轮']"
      :key="position"
      class="pressure"
      :class="{ rear: index }"
      :title="age(wheels.find((wheel) => wheel.position === position)?.reportedAt)"
    >
      <b class="num" :style="{ color: color(position) }"
        >{{ format(wheels.find((wheel) => wheel.position === position)?.pressureBar)
        }}<small>bar</small></b
      >
      <span
        >{{ position }}　{{
          format(wheels.find((wheel) => wheel.position === position)?.temperatureC, '°C')
        }}</span
      >
    </div>
  </section>
  <section class="chart-card">
    <SegmentControl
      v-model="period"
      :options="[
        ['1', '24 小时'],
        ['2', '7 天'],
      ]"
    />
    <LineChart
      :points="history.find((wheel) => wheel.position === 2)?.pressure || []"
      :second="history.find((wheel) => wheel.position === 1)?.pressure || []"
      :gap="period === '1' ? 7200000 : 43200000"
      :reference="2.2"
      label="前后轮胎压历史曲线"
    />
    <div class="legend">
      <span class="front">前轮</span><span>后轮</span> <span>┄ 建议不低于 2.2 bar</span>
    </div>
  </section>
  <EmptyState
    v-if="!ext.busy && !wheels.length"
    :text="ext.error || '还没有胎压数据'"
    icon="tire"
    :retry="Boolean(ext.error)"
    @retry="ext.load('tires')"
  />
  <div class="foot">
    {{ age(ext.tires?.updatedAt) }}
    <IonButton fill="clear" aria-label="胎温历史" @click="temperature = true">
      <AppIcon name="info"
    /></IonButton>
  </div>
  <Sheet :open="temperature" title="胎温历史" @close="temperature = false">
    <LineChart
      :points="history.find((wheel) => wheel.position === 2)?.temperature || []"
      :second="history.find((wheel) => wheel.position === 1)?.temperature || []"
      :gap="period === '1' ? 7200000 : 43200000"
      label="前后轮胎温历史曲线"
    />
    <div class="legend"><span>前轮</span><span>后轮</span><span>°C</span></div>
  </Sheet>
</template>
<style scoped src="./TireRecords.css"></style>
