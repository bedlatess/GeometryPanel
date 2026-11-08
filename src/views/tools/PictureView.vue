<script setup lang="ts">
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation, format } from '../../stores/presentation';
import PageFrame from '../../components/PageFrame.vue';
import BrandAsset from '../../components/BrandAsset.vue';
import MetricValue from '../../components/MetricValue.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const session = useSessionStore(),
  vehicle = useVehiclePresentation();
</script>
<template>
  <PageFrame title="车况图片"
    ><section class="picture">
      <BrandAsset name="wordmark" />
      <h2>{{ vehicle.vehicle?.name || '—' }}</h2>
      <MetricValue :value="vehicle.reading?.soc" unit="%" />
      <p>可行驶 {{ format(vehicle.reading?.range, 'km') }}</p>
      <p>{{ vehicle.lockText }}</p>
    </section>
    <GroupList><ListRow label="车况" to="/vehicle/status" /></GroupList>
    <button
      class="workflow-primary"
      :disabled="session.state.busy || !vehicle.reading"
      @click="session.action('status-export')"
    >
      分享车况图片
    </button>
  </PageFrame>
</template>
<style scoped>
.picture {
  padding: 32px;
  background: var(--card);
  border-radius: 20px;
}
.picture :deep(img) {
  width: 120px;
}
.picture :deep(.metric-value) {
  font-size: 56px;
}
h2 {
  font-size: 24px;
}
p {
  font-size: 17px;
  color: var(--t2);
}
</style>

<style scoped src="../../theme/workflows.css"></style>
