<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { onIonViewWillLeave, onIonViewWillEnter } from '@ionic/vue';
import { usePageQuery } from '../../app/page-query';
import PageFrame from '../../components/PageFrame.vue';
import SegmentControl from '../../components/SegmentControl.vue';
import RideRecords from './RideRecords.vue';
import BatteryRecords from './BatteryRecords.vue';
import TireRecords from './TireRecords.vue';
import EmptyState from '../../components/EmptyState.vue';
import { useExtensionsStore } from '../../stores/extensions';
import { useOwnerStore } from '../../stores/owner';
import { useHistoryStore } from '../../stores/history';
const route = useRoute(),
  router = useRouter(),
  ext = useExtensionsStore();
const owner = useOwnerStore(),
  history = useHistoryStore();
const tab = usePageQuery('/records', 'tab', 'ride');
async function refresh() {
  if (tab.value === 'ride') {
    await Promise.all([ext.load('ride'), owner.load(['analysis'], { month: ext.month })]);
    const day = ext.monthly?.days[0]?.day;
    if (day) {
      ext.day = day;
      await ext.load('tracks');
    }
  } else if (tab.value === 'tire')
    await Promise.all([ext.load('tires'), owner.load(['tireHistory'])]);
  else if (route.query.source === 'official') await owner.load(['battery', 'charges', 'uses']);
  else await history.load();
}
onIonViewWillEnter(() => {
  void refresh();
});
watch(tab, () => {
  if (route.path === '/records') void refresh();
});
onIonViewWillLeave(() => ext.cancel('/records'));
</script>
<template>
  <PageFrame title="记录" root :refresh="refresh">
    <SegmentControl
      v-model="tab"
      :options="[
        ['ride', '骑行'],
        ['battery', '电池'],
        ['tire', '胎压'],
      ]"
    />
    <EmptyState v-if="owner.failed && tab !== 'tire'" text="加载失败" retry @retry="refresh" />
    <RideRecords v-if="tab === 'ride'" /><BatteryRecords v-else-if="tab === 'battery'" />
    <TireRecords v-else />
  </PageFrame>
</template>
