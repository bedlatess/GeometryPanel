<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { IonButton, IonDatetime } from '@ionic/vue';
import { useExtensionsStore } from '../../stores/extensions';
import { chinaDay } from '../../core/extensions-model';
import { useOwnerStore, num } from '../../stores/owner';
import { useVehiclePresentation, format, duration } from '../../stores/presentation';
import MetricValue from '../../components/MetricValue.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import EmptyState from '../../components/EmptyState.vue';
import Sheet from '../../components/Sheet.vue';
const ext = useExtensionsStore(),
  owner = useOwnerStore(),
  vehicle = useVehiclePresentation();
const picking = ref(false);
const monthName = computed(() =>
  ext.month.replace(/^(\d{4})-(\d{2})$/, (_, year, month) => `${year} 年 ${+month} 月`),
);
const days = computed(() => ext.monthly?.days || []);
const bars = computed(() => {
  const [year, month] = ext.month.split('-').map(Number);
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => {
    const value = days.value.find((day) => day.day?.endsWith(`-${String(i + 1).padStart(2, '0')}`));
    return value?.mileageKm ?? null;
  });
});
// The current month uses the vehicle's own monthly totals so this page and the
// home card always agree; earlier months sum the daily rows.
const thisMonth = computed(() => ext.month === chinaDay().slice(0, 7));
const total = computed(() =>
  thisMonth.value && vehicle.daily?.monthMileageKm != null
    ? vehicle.daily.monthMileageKm
    : days.value.some((day) => day.mileageKm != null)
      ? days.value.reduce((sum, day) => sum + (day.mileageKm ?? 0), 0)
      : null,
);
const minutes = computed(() =>
  thisMonth.value && vehicle.daily?.monthRideMinutes != null
    ? vehicle.daily.monthRideMinutes
    : days.value.some((day) => day.minutes != null)
      ? days.value.reduce((sum, day) => sum + (day.minutes ?? 0), 0)
      : null,
);
const hasHabits = computed(() => habits.some(([key]) => num(owner.get('analysis')[key]) != null));
const atCurrentMonth = computed(() => ext.month >= chinaDay().slice(0, 7));
const max = computed(() => Math.max(1, ...bars.value.map((value) => value ?? 0)));
const habits = [
  ['accelerationTimes', '急加速'],
  ['brakesTimes', '急刹车'],
  ['extremeSpeedNumber', '超速'],
  ['bendingTimes', '转弯'],
  ['nightRide', '夜间骑行'],
  ['longDrive', '长时间骑行'],
];
async function load() {
  await Promise.all([ext.load('ride'), owner.load(['analysis'], { month: ext.month })]);
  const day = days.value[0]?.day;
  if (day) {
    ext.day = day;
    await ext.load('tracks');
  }
}
function step(value: number) {
  const date = new Date(`${ext.month}-01T12:00:00`);
  date.setMonth(date.getMonth() + value);
  ext.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  void load();
}
function picked(value: unknown) {
  ext.month = String(value).slice(0, 7);
  picking.value = false;
  void load();
}
const dateLabel = (day: string) =>
  day.replace(/^\d{4}[-.](\d{2})[-.](\d{2})$/, (_, month, date) => `${+month} 月 ${+date} 日`);
onMounted(load);
</script>
<template>
  <div class="month-picker">
    <button aria-label="上个月" @click="step(-1)">
      <AppIcon name="chev-l" /></button
    ><button @click="picking = true">{{ monthName }}</button>
    <button aria-label="下个月" :disabled="atCurrentMonth" @click="step(1)">
      <AppIcon name="chev-r" />
    </button>
  </div>
  <div class="record-metric">
    <MetricValue :value="format(total)" unit="km" />
    <p>
      骑行 {{ duration(minutes) }}， 平均
      {{ total != null && minutes ? format((total / minutes) * 60) : '—' }} km/h
    </p>
    <div class="bars" role="img" aria-label="每日骑行里程">
      <i
        v-for="(value, index) in bars"
        :key="index"
        :class="{ data: value != null }"
        :style="{ height: `${value == null ? 6 : Math.max(6, (value / max) * 120)}px` }"
        :title="`${index + 1} 日　${format(value, 'km')}`"
      />
    </div>
    <div class="axis">
      <span>1 日</span><span>15 日</span><span>{{ bars.length }} 日</span>
    </div>
  </div>
  <template v-if="hasHabits">
    <h2 class="group-title">骑行习惯</h2>
    <div class="habit-grid">
      <div v-for="[key, label] in habits" :key="key" class="habit">
        <span>{{ label }}</span> <MetricValue :value="num(owner.get('analysis')[key])" unit="次" />
      </div>
    </div>
  </template>
  <EmptyState
    v-if="!ext.busy && !days.length"
    :text="ext.error || '本月还没有骑行'"
    icon="t-rec"
    :retry="Boolean(ext.error)"
    @retry="load"
  />
  <GroupList v-for="day in days" :key="day.date" :title="dateLabel(day.date)">
    <ListRow
      v-for="track in ext.tracks?.tracks.filter((item) => item.day === day.day)"
      :key="track.id"
      :label="`${track.start.slice(-5)} — ${track.end.slice(-5)}`"
      :detail="`${duration(track.minutes)}　最高 ${format(track.maxSpeedKmh, 'km/h')}`"
      :value="format(track.mileageKm, 'km')"
      numeric
      :to="`/records/ride/${track.day}`"
    />
    <ListRow
      v-if="!ext.tracks?.tracks.some((item) => item.day === day.day)"
      label="骑行"
      :detail="`${duration(day.minutes)}　最高 ${format(day.maxSpeedKmh, 'km/h')}`"
      :value="format(day.mileageKm, 'km')"
      numeric
      :to="`/records/ride/${day.day}`"
    />
  </GroupList>
  <GroupList
    ><ListRow label="累计里程" :value="format(ext.monthly?.totalMileageKm, 'km')" numeric
  /></GroupList>
  <Sheet :open="picking" title="月份" @close="picking = false">
    <IonDatetime
      presentation="month-year"
      locale="zh-CN"
      :value="ext.month + '-01'"
      :prefer-wheel="true"
      @ion-change="picked($event.detail.value)"
    />
  </Sheet>
</template>
<style scoped src="./RideRecords.css"></style>
