<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useVehiclePresentation, age } from '../../stores/presentation';
import { useSessionStore } from '../../stores/session';
import { navigationLinks } from '../../core/navigation';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
const route = useRoute(),
  router = useRouter(),
  vehicle = useVehiclePresentation();
const session = useSessionStore(),
  loaded = ref(false);
const point = computed(() => vehicle.daily?.location);
const links = computed(() =>
  !session.state.preview && navigator.onLine ? navigationLinks(point.value || null) : null,
);
</script>
<template>
  <PageFrame
    :title="route.path.endsWith('/coordinates') ? '坐标' : '车辆位置'"
    :map="!route.path.endsWith('/coordinates')"
  >
    <template v-if="route.path.endsWith('/coordinates')">
      <GroupList v-if="point">
        <ListRow label="纬度" :value="point.latitude.toFixed(6)" numeric />
        <ListRow label="经度" :value="point.longitude.toFixed(6)" numeric />
        <ListRow
          label="坐标类型"
          :value="
            point.coordinateSystem === 'wgs84'
              ? 'GPS（WGS84）'
              : point.coordinateSystem === 'gcj02'
                ? '高德（GCJ-02）'
                : '不支持'
          "
        />
      </GroupList>
      <a
        v-if="links"
        class="workflow-primary external"
        :href="links.map"
        target="_blank"
        rel="noopener noreferrer"
        referrerpolicy="no-referrer"
        >在地图中打开</a
      >
    </template>
    <div v-else class="location-screen">
      <div class="map-stage">
        <iframe
          v-if="loaded && links"
          class="vehicle-map"
          title="车辆停车位置地图"
          :src="links.map"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms
            allow-popups allow-popups-to-escape-sandbox"
          allow="geolocation 'none'"
        />
        <button
          v-else
          class="abstract-map"
          aria-label="查看地图"
          :disabled="!links"
          @click="loaded = true"
        >
          <svg viewBox="0 0 390 470" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path
              v-for="offset in [0, 40, 80, 120, 160, 200, 240, 280, 320, 360]"
              :key="offset"
              :d="`M-30 ${offset} C60 ${offset - 60} 120 ${offset + 80} 240 ${offset + 20}
                S400 ${offset - 30} 430 ${offset + 50}`"
            /></svg
          ><span class="pin"><i /></span>
        </button>
        <button class="floating-back" aria-label="返回车辆" @click="router.back()">
          <AppIcon name="chev-l" />
        </button>
        <button
          class="floating-refresh"
          aria-label="刷新位置"
          :disabled="session.state.busy"
          @click="session.refresh()"
        >
          <AppIcon name="refresh" />
        </button>
      </div>
      <section class="location-panel">
        <span class="handle" />
        <h1>{{ point?.address || '停车位置' }}</h1>
        <p>{{ age(point?.reportedAt, '定位') }}</p>
        <button class="workflow-primary" :disabled="!links?.walk" @click="session.action('walk')">
          步行找车
        </button>
        <GroupList
          ><ListRow label="电子围栏" icon="fence" to="/vehicle/location/fences" />
          <ListRow label="坐标" to="/vehicle/location/coordinates"
        /></GroupList>
        <a
          v-if="loaded && links"
          class="external foot"
          :href="links.map"
          target="_blank"
          rel="noopener noreferrer"
          referrerpolicy="no-referrer"
          >在地图中打开</a
        >
      </section>
    </div>
  </PageFrame>
</template>
<style scoped>
.location-screen {
  margin: 0;
}
.map-stage {
  height: 470px;
  position: relative;
  background: var(--fill);
}
.abstract-map {
  width: 100%;
  height: 100%;
  background: transparent;
}
svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--line);
  stroke-width: 1.4px;
}
.pin {
  position: absolute;
  top: 43%;
  left: 50%;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--ctl-sh);
  display: grid;
  place-items: center;
}
.pin i {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--ink);
}
.floating-back,
.floating-refresh {
  position: absolute;
  top: 16px;
  width: 44px;
  height: 44px;
  background: var(--card);
  color: var(--t1);
  border-radius: 50%;
  box-shadow: var(--ctl-sh);
}
.floating-back {
  left: 16px;
}
.floating-refresh {
  right: 16px;
}
.location-panel {
  margin-top: -24px;
  position: relative;
  padding: 12px 20px 32px;
  border-radius: 30px 30px 0 0;
  background: var(--bg);
}
.handle {
  display: block;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--fill2);
  margin: 0 auto 20px;
}
h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}
p {
  font-size: 15px;
  color: var(--t2);
}
.external {
  text-align: center;
  display: block;
  padding: 14px;
  text-decoration: none;
}
.vehicle-map {
  width: 100%;
  height: 100%;
  border: 0;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
