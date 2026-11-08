<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import { trackPath, type RideTrack } from '../../core/extensions-model';
import { roadTrack } from '../../core/track-map';
import { navigationLinks } from '../../core/navigation';
import { format } from '../../stores/presentation';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import MetricValue from '../../components/MetricValue.vue';
import EmptyState from '../../components/EmptyState.vue';
const route = useRoute(),
  session = useSessionStore();
const { host, view: v } = useWorkflowPage('extensions', {
  initial: 'tracks',
  day: route.params.id,
});
const tracks = computed(() => (v.value.tracks?.tracks || []) as RideTrack[]);
const drawing = (item: RideTrack, index: number) =>
  v.value.roadMaps?.includes(index) && !session.state.preview ? roadTrack(item.points) : null;
function links(point: RideTrack['points'][number] | undefined) {
  return !point || session.state.preview
    ? null
    : navigationLinks({
        ...point,
        altitudeM: null,
        coordinateSystem: 'gcj02',
        coordinateSystemSource: 'legacy-default',
        address: null,
        reportedAt: null,
        reportState: 'unknown',
      });
}
</script>
<template>
  <PageFrame title="单次行程">
    <div ref="host" class="workflow">
      <GroupList
        ><button class="workflow-row" data-ext="pick-day">
          日期 <span>{{ v.day }}</span>
        </button></GroupList
      >
      <section v-for="(item, index) in tracks" :key="item.id" class="trip">
        <h2>{{ item.start.slice(-5) }} — {{ item.end.slice(-5) }}</h2>
        <p>{{ item.from }}<template v-if="item.from && item.to"> → </template>{{ item.to }}</p>
        <div class="metrics">
          <MetricValue :value="item.mileageKm" unit="km" />
          <div>
            <b class="num">{{ format(item.minutes) }}</b> 分钟
            <p>最高 {{ format(item.maxSpeedKmh, 'km/h') }}</p>
          </div>
        </div>
        <svg
          v-if="trackPath(item.points)"
          class="track-drawing"
          :viewBox="drawing(item, index) ? '0 0 640 360' : '0 0 320 200'"
          role="img"
          :aria-label="drawing(item, index) ? '历史轨迹与高德道路底图' : '行程轨迹'"
        >
          <image
            v-for="tile in drawing(item, index)?.tiles || []"
            :key="tile.url"
            data-road-tile
            :href="tile.url"
            :x="tile.x"
            :y="tile.y"
            width="256"
            height="256"
          />
          <path :d="drawing(item, index)?.path || trackPath(item.points)?.path" />
        </svg>
        <EmptyState v-else text="轨迹不可用" icon="t-rec" />
        <button
          v-if="!session.state.preview && !drawing(item, index)"
          class="workflow-secondary"
          data-ext="track-map"
          :data-track-index="index"
        >
          加载道路底图
        </button>
        <p v-if="drawing(item, index)" data-road-status>© 高德地图</p>
        <div class="map-actions">
          <a
            v-if="links(item.points[0])"
            :href="links(item.points[0])!.map"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
            >查看起点</a
          >
          <a
            v-if="links(item.points.at(-1))"
            :href="links(item.points.at(-1))!.map"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
            >查看终点</a
          >
        </div>
      </section>
      <EmptyState
        v-if="!v.busy && !tracks.length"
        :text="v.error || '本月还没有骑行'"
        icon="t-rec"
      />
      <GroupList
        ><button class="workflow-row" data-ext="tracks-prev" :disabled="v.busy || v.trackPage <= 1">
          上一页
        </button>
        <ListRow label="页码" :value="String(v.trackPage || 1)" />
        <button
          class="workflow-row"
          data-ext="tracks-next"
          :disabled="v.busy || (v.tracks?.receivedCount || 0) < 20"
        >
          下一页
        </button></GroupList
      >
    </div>
  </PageFrame>
</template>
<style scoped>
.trip {
  margin: 22px 0;
  padding: 20px;
  border-radius: 20px;
  background: var(--card);
}
h2 {
  font-size: 20px;
}
p {
  font-size: 15px;
  color: var(--t2);
}
.metrics {
  display: flex;
  gap: 24px;
}
.metrics :deep(.metric-value) {
  font-size: 34px;
}
.track-drawing {
  width: 100%;
  border-radius: 14px;
}
.track-drawing path {
  fill: none;
  stroke: var(--t1);
  stroke-width: 2.5;
  stroke-linecap: round;
}
.map-actions {
  display: flex;
  gap: 12px;
}
.map-actions a {
  color: var(--t1);
  padding: 12px;
  background: var(--fill);
  border-radius: 24px;
  text-decoration: none;
  font-size: 15px;
}
.workflow-row span {
  float: right;
  color: var(--t2);
}
</style>

<style scoped src="../../theme/workflows.css"></style>
