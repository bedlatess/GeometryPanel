<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePageQuery } from '../../app/page-query';
import { IonButton, onIonViewWillEnter } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation, format, age } from '../../stores/presentation';
import { useOwnerStore, num } from '../../stores/owner';
import PageFrame from '../../components/PageFrame.vue';
import SegmentControl from '../../components/SegmentControl.vue';
import StatusCard from '../../components/StatusCard.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import Sheet from '../../components/Sheet.vue';
import EmptyState from '../../components/EmptyState.vue';
import { useOwnerPresentation } from '../../app/owner-presentation';
import BatteryStatus from './BatteryStatus.vue';
import DeviceStatus from './DeviceStatus.vue';
const session = useSessionStore(),
  vehicle = useVehiclePresentation(),
  owner = useOwnerStore();
const route = useRoute(),
  router = useRouter(),
  resetOpen = ref(false);
const tab = usePageQuery('/vehicle/status', 'tab', 'state');
const { examination: count } = useOwnerPresentation();
const warn = computed(() => (count.value ?? 0) > 0 || (vehicle.reading?.soc ?? 100) <= 20);
const metrics = computed(() => [
  { label: '电量', value: vehicle.reading?.soc, unit: '%' },
  { label: '可行驶', value: vehicle.reading?.range, unit: 'km' },
  {
    label: '总里程',
    value:
      vehicle.daily?.totalMileageKm == null
        ? null
        : vehicle.daily.totalMileageKm.toLocaleString('zh-CN'),
    unit: 'km',
  },
]);
const lock = (value?: boolean | null) => (value == null ? '—' : value ? '已锁' : '未锁');
const duration = computed(() => {
  const minutes = vehicle.daily?.monthRideMinutes;
  return minutes == null ? '—' : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
});
async function refresh() {
  await session.refresh();
  await owner.load([
    'sim',
    'expiry',
    'recharge',
    'examination',
    'maintenance',
    'score',
    'home',
    'redPoint',
  ]);
}
async function reset() {
  resetOpen.value = false;
  const bound = session.state.session;
  if (!bound) return;
  const old = num(owner.get('maintenance').keepMileage);
  await owner.mutate(
    (api, signal) => api.resetMaintenance(bound, signal),
    'maintenance',
    (value) =>
      num((value as Record<string, unknown>)?.keepMileage) == null
        ? null
        : Number((value as Record<string, unknown>).keepMileage) > Number(old),
  );
}
onIonViewWillEnter(() => {
  void owner.load([
    'sim',
    'expiry',
    'recharge',
    'examination',
    'maintenance',
    'score',
    'home',
    'redPoint',
  ]);
});
</script>
<template>
  <PageFrame title="车况" :refresh="refresh">
    <template #toolbar
      ><IonButton aria-label="刷新车况" :disabled="session.state.busy" @click="refresh"
        ><AppIcon name="refresh" /></IonButton
    ></template>
    <SegmentControl
      v-model="tab"
      :options="[
        ['state', '状态'],
        ['battery', '电池'],
        ['device', '设备'],
      ]"
    />
    <EmptyState v-if="owner.failed" text="加载失败" retry @retry="refresh" />
    <div class="status-content">
      <template v-if="tab === 'state'">
        <StatusCard
          :title="warn ? `${count || 1} 项需要留意` : count === 0 ? '一切正常' : '车况'"
          :warning="warn"
          :icon="count === 0 ? 'check' : 'pulse'"
          :subtitle="
            warn
              ? (vehicle.reading?.soc ?? 100) <= 20
                ? '电量低，记得充电'
                : '体检有异常'
              : undefined
          "
          :metrics="metrics"
        />
        <GroupList title="锁">
          <ListRow label="车辆" :value="vehicle.lockText" />
          <ListRow label="车头" :value="lock(vehicle.daily?.headLocked)" />
          <ListRow label="座桶" :value="lock(vehicle.daily?.seatLocked)" />
        </GroupList>
        <GroupList title="骑行">
          <ListRow label="当前" :value="vehicle.daily?.rideState || '—'" />
          <ListRow label="本月里程" :value="format(vehicle.daily?.monthMileageKm, 'km')" numeric />
          <ListRow label="本月时长" :value="duration" />
          <ListRow
            label="本月均速"
            :value="format(vehicle.daily?.monthAverageSpeedKmh, 'km/h')"
            numeric
          />
        </GroupList>
        <GroupList title="体检">
          <ListRow
            label="体检结果"
            :value="count == null ? '—' : count ? `${count} 项异常` : '无异常'"
            to="/vehicle/health"
          />
          <ListRow
            label="距下次保养"
            :value="format(num(owner.get('maintenance').keepMileage), 'km')"
            action
            :disabled="
              num(owner.get('maintenance').keepMileage) == null ||
              owner.busy ||
              session.state.preview
            "
            @activate="resetOpen = true"
          />
        </GroupList>
        <button class="foot" @click="session.action('data-status')">
          {{ age(vehicle.daily?.reportedAt) }}
        </button>
      </template>
      <BatteryStatus v-else-if="tab === 'battery'" />
      <DeviceStatus v-else />
    </div>
    <Sheet :open="resetOpen" title="重置保养提醒" centered @close="resetOpen = false">
      <div class="confirm-content">
        <span class="confirm-icon"><AppIcon name="pulse" /></span>
        <h2>重置保养提醒</h2>
        <p>{{ vehicle.vehicle?.name }}　尾号 {{ vehicle.vehicle?.vin.slice(-6) }}</p>
        <IonButton expand="block" color="danger" @click="reset">重置保养提醒</IonButton>
        <IonButton expand="block" fill="clear" @click="resetOpen = false">取消</IonButton>
      </div>
    </Sheet>
  </PageFrame>
</template>
<style scoped src="./StatusView.css"></style>
