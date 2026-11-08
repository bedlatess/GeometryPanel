<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { IonButton, IonDatetime } from '@ionic/vue';
import { useExtensionsStore } from '../../stores/extensions';
import { useOwnerStore, num } from '../../stores/owner';
import { useVehiclePresentation, format } from '../../stores/presentation';
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
const total = computed(() =>
  days.value.some((day) => day.mileageKm != null)
    ? days.value.reduce((sum, day) => sum + (day.mileageKm ?? 0), 0)
    : null,
);
const minutes = computed(() =>
  days.value.some((day) => day.minutes != null)
    ? days.value.reduce((sum, day) => sum + (day.minutes ?? 0), 0)
    : null,
);
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
    <button aria-label="下个月" @click="step(1)"><AppIcon name="chev-r" /></button>
  </div>
  <div class="record-metric">
    <MetricValue :value="format(total)" unit="km" />
    <p>
      骑行 {{ minutes == null ? '—' : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` }}，
      平均 {{ total != null && minutes ? format((total / minutes) * 60) : '—' }} km/h
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
  <h2 class="group-title">骑行习惯</h2>
  <div class="habit-grid">
    <div v-for="[key, label] in habits" :key="key" class="habit">
      <span>{{ label }}</span> <MetricValue :value="num(owner.get('analysis')[key])" unit="次" />
    </div>
  </div>
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
      :detail="`${format(track.minutes)} 分钟　最高 ${format(track.maxSpeedKmh, 'km/h')}`"
      :value="format(track.mileageKm, 'km')"
      numeric
      :to="`/records/ride/${track.day}`"
    />
    <ListRow
      v-if="!ext.tracks?.tracks.some((item) => item.day === day.day)"
      label="骑行"
      :detail="`${format(day.minutes)} 分钟　最高 ${format(day.maxSpeedKmh, 'km/h')}`"
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
