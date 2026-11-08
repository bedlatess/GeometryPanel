<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation, format } from '../../stores/presentation';
import { useOwnerStore } from '../../stores/owner';
import { useOwnerPresentation } from '../../app/owner-presentation';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import LocationCard from '../../components/LocationCard.vue';
import Sheet from '../../components/Sheet.vue';
const session = useSessionStore(),
  vehicle = useVehiclePresentation(),
  owner = useOwnerStore();
const { reminders: reasons, summary } = useOwnerPresentation();
const remindersOpen = ref(false);
watch(
  () => session.state.session,
  (bound) => {
    if (bound)
      void owner.load([
        'expiry',
        'recharge',
        'maintenance',
        'tires',
        'sim',
        'examination',
        'unread',
      ]);
  },
  { immediate: true },
);
</script>
<template>
  <div class="home-lower">
    <GroupList v-if="reasons.length" title="车况"
      ><ListRow
        icon="alert"
        :label="`${reasons.length} 项需要留意`"
        :detail="summary"
        action
        @activate="remindersOpen = true"
    /></GroupList>
    <Sheet :open="remindersOpen" title="车辆提醒" @close="remindersOpen = false">
      <GroupList>
        <ListRow v-for="reason in reasons" :key="reason" :label="reason" />
        <ListRow label="车况" to="/vehicle/status" @click="remindersOpen = false" />
      </GroupList>
    </Sheet>
    <h2 class="group-title">位置</h2>
    <LocationCard />
    <GroupList title="本月">
      <ListRow
        label="骑行"
        :value="format(vehicle.daily?.monthMileageKm, 'km')"
        numeric
        icon="t-rec"
        to="/records?tab=ride"
      />
      <ListRow
        label="电池健康"
        :value="
          vehicle.daily?.healthPercent == null ? '—' : `${format(vehicle.daily.healthPercent)}%`
        "
        numeric
        icon="batt"
        to="/vehicle/status?tab=battery"
      />
      <ListRow label="车辆设置" icon="gear" to="/vehicle/settings" />
    </GroupList>
    <button
      class="foot"
      :disabled="session.state.busy"
      aria-label="刷新车况"
      @click="session.refresh()"
    >
      累计骑行 <span class="num">{{ format(vehicle.daily?.totalMileageKm, 'km') }}</span>
    </button>
  </div>
</template>
<style scoped src="./HomeLower.css"></style>
