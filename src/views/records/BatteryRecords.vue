<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonActionSheet, IonButton, IonDatetime } from '@ionic/vue';
import { useHistoryStore } from '../../stores/history';
import { useOwnerStore, rows, txt } from '../../stores/owner';
import { useVehiclePresentation, format } from '../../stores/presentation';
import { useSessionStore } from '../../stores/session';
import SegmentControl from '../../components/SegmentControl.vue';
import MetricValue from '../../components/MetricValue.vue';
import LineChart from '../../components/LineChart.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import EmptyState from '../../components/EmptyState.vue';
import Sheet from '../../components/Sheet.vue';
import OfficialBatteryRecords from './OfficialBatteryRecords.vue';
import { usePageQuery } from '../../app/page-query';
import AppIcon from '../../components/AppIcon.vue';
const history = useHistoryStore(),
  owner = useOwnerStore(),
  vehicle = useVehiclePresentation();
const session = useSessionStore(),
  route = useRoute(),
  router = useRouter();
const menu = ref(false),
  clearOpen = ref(false),
  custom = ref(false),
  sourceMenu = ref(false);
defineExpose({
  openMenu: () => {
    menu.value = true;
  },
});
const categoryMenu = ref(false),
  categoryAction = ref(''),
  category = ref<'battery' | 'charge'>('battery');
function chooseCategory(action: string) {
  categoryAction.value = action;
  categoryMenu.value = true;
}
function pickedCategory(kind: 'battery' | 'charge') {
  category.value = kind;
  if (categoryAction.value === 'clear') clearOpen.value = true;
  else history.download(kind);
}
const sourceTab = usePageQuery('/records', 'source', 'local');
const official = computed(() => sourceTab.value === 'official');
const points = computed(() =>
  history.visibleSamples
    .flatMap((sample) => (sample.soc == null ? [] : [{ t: sample.at, v: sample.soc }]))
    .sort((a, b) => a.t - b.t),
);
const time = (value: number) => {
  const date = new Date(value);
  const clock = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${clock}`;
};
const duration = (value: number) =>
  `${Math.floor(value / 3600000)} 小时 ${Math.floor(value / 60000) % 60} 分`;
const buttons = [
  {
    text: '数据来源',
    handler: () => {
      sourceMenu.value = true;
    },
  },
  {
    text: '自定义时段',
    handler: () => {
      custom.value = true;
    },
  },
  {
    text: '电池规格',
    handler: () => {
      session.action('route', '/records/battery/info');
    },
  },
  { text: '导出表格', handler: () => chooseCategory('export') },
  { text: '清除本机记录', role: 'destructive', handler: () => chooseCategory('clear') },
  { text: '取消', role: 'cancel' },
];
function source(value: string) {
  void router.replace({ query: { tab: 'battery', source: value } });
}
onMounted(() => {
  if (!official.value) void history.load();
  void owner.load(['score']);
});
</script>
<template>
  <div class="record-top">
    <MetricValue :value="vehicle.reading?.soc" unit="%" />
  </div>
  <p class="record-sub">
    健康度 {{ format(vehicle.daily?.healthPercent) }}%<template v-if="txt(owner.get('score').score)"
      >　本月评分 {{ txt(owner.get('score').score) }}</template
    >
  </p>
  <template v-if="!official">
    <section class="chart-card">
      <SegmentControl
        v-model="history.period"
        :options="[
          ['24h', '24 小时'],
          ['7d', '7 天'],
          ['30d', '30 天'],
        ]"
      />
      <p v-if="points.length < 2" class="chart-empty" :data-sample-count="points.length">
        数据不足
      </p>
      <LineChart
        v-else
        :points="points"
        energy
        label="本机电量变化曲线"
        :data-sample-count="points.length"
      />
      <div v-if="points.length >= 2" class="axis">
        <span>{{ time(points[0].t) }}</span> <span>现在</span>
      </div>
    </section>
    <GroupList v-if="history.visibleCharges.length" title="充电记录">
      <ListRow
        v-for="charge in history.visibleCharges"
        :key="charge.id"
        :label="time(charge.startedAt)"
        :detail="
          charge.status === 'interrupted'
            ? '中途拔掉'
            : charge.status === 'unknown'
              ? '结果待确认'
              : charge.status === 'charging'
                ? '正在充电'
                : duration((charge.endedAt || Date.now()) - charge.startedAt)
        "
        :value="`${format(charge.startSoc)}% → ${format(charge.endSoc)}%`"
        numeric
      />
    </GroupList>
    <EmptyState
      v-if="!history.busy && !history.visibleCharges.length"
      :text="history.error || '还没有充电记录'"
      icon="batt"
      :retry="Boolean(history.error)"
      @retry="history.load"
    />
    <GroupList v-if="history.hasMore"
      ><ListRow label="加载更多" action @activate="history.load(true)"
    /></GroupList>
  </template>
  <OfficialBatteryRecords v-else />
  <IonActionSheet :is-open="menu" :buttons="buttons" @did-dismiss="menu = false" />
  <IonActionSheet
    :is-open="categoryMenu"
    :header="categoryAction === 'clear' ? '清除本机记录' : '导出表格'"
    :buttons="[
      { text: '电量', handler: () => pickedCategory('battery') },
      { text: '充电记录', handler: () => pickedCategory('charge') },
      { text: '取消', role: 'cancel' },
    ]"
    @did-dismiss="categoryMenu = false"
  />
  <IonActionSheet
    :is-open="sourceMenu"
    header="数据来源"
    :buttons="[
      { text: '官方记录', handler: () => source('official') },
      { text: '本机记录', handler: () => source('local') },
      { text: '取消', role: 'cancel' },
    ]"
    @did-dismiss="sourceMenu = false"
  />
  <Sheet :open="clearOpen" title="清除本机记录" centered @close="clearOpen = false">
    <div class="confirm-content">
      <span class="confirm-icon"><AppIcon name="batt" /></span>
      <h2>清除本机记录</h2>
      <p>
        {{ vehicle.vehicle?.name }}　尾号 {{ vehicle.vehicle?.vin.slice(-6) }}<br />{{
          category === 'battery' ? '电量' : '充电记录'
        }}
      </p>
      <IonButton
        expand="block"
        color="danger"
        @click="
          clearOpen = false;
          history.clear(category);
        "
      >
        清除本机记录</IonButton
      >
      <IonButton fill="clear" expand="block" @click="clearOpen = false">取消</IonButton>
    </div>
  </Sheet>
  <Sheet :open="custom" title="自定义时段" @close="custom = false">
    <h3>开始时间</h3>
    <IonDatetime
      locale="zh-CN"
      :prefer-wheel="true"
      @ion-change="history.start = String($event.detail.value)"
    />
    <h3>结束时间</h3>
    <IonDatetime
      locale="zh-CN"
      :prefer-wheel="true"
      @ion-change="history.end = String($event.detail.value)"
    />
    <IonButton
      expand="block"
      @click="
        history.period = 'custom';
        custom = false;
      "
      >确定</IonButton
    >
  </Sheet>
</template>
<style scoped src="./BatteryRecords.css"></style>
