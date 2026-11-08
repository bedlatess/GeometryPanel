<script setup lang="ts">
import { computed } from 'vue';
import { txt } from '../../stores/owner';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const props = defineProps<{ view: any; host?: HTMLElement }>();
const row = computed(() => props.view.editor.row);
const map = computed(() => {
  const center = props.view.center;
  if (!center) return null;
  const zoom = props.view.mapZoom,
    scale = 256 * 2 ** zoom;
  const left = ((center.longitude + 180) / 360) * scale - 320;
  const top =
    ((1 - Math.log(Math.tan(Math.PI / 4 + (center.latitude * Math.PI) / 360)) / Math.PI) / 2) *
      scale -
    180;
  const tiles = [];
  for (let x = Math.floor(left / 256); x < Math.ceil((left + 640) / 256); x++)
    for (let y = Math.floor(top / 256); y < Math.ceil((top + 360) / 256); y++)
      tiles.push({
        key: `${x}-${y}`,
        x: x * 256 - left,
        y: y * 256 - top,
        url:
          'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&' +
          `x=${x}&y=${y}&z=${zoom}`,
      });
  return {
    tiles,
    radius: Math.min(
      175,
      props.view.radius /
        ((156543.03392 * Math.cos((center.latitude * Math.PI) / 180)) / 2 ** zoom),
    ),
  };
});
function pick(event: MouseEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
  props.host?.dispatchEvent(
    new CustomEvent('fence-point', {
      detail: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      },
    }),
  );
}
</script>
<template>
  <template v-if="view.editor.type === 'plan'">
    <GroupList
      ><button
        class="workflow-row"
        data-owner="plan-time"
        :data-start="txt(row.startTime) || '07:00'"
        :data-end="txt(row.endTime) || '21:00'"
      >
        充电时段</button
      ><ListRow
        label="充电时段"
        :value="`${txt(row.startTime) || '07:00'}–${txt(row.endTime) || '21:00'}`"
    /></GroupList>
    <button class="workflow-primary" data-owner="plan-save">保存并启用</button>
  </template>
  <template v-if="view.editor.type === 'share'">
    <label>姓名<input data-owner-field="name" :value="txt(row.name)" maxlength="80" /></label>
    <label
      >手机号<input data-owner-field="phone" :value="txt(row.phone)" type="tel" maxlength="11"
    /></label>
    <GroupList v-if="view.shareTab === 'temp'"
      ><button class="workflow-row" data-owner="share-hours">
        分享时长　{{ txt(row.hours) || '24' }} 小时
      </button></GroupList
    >
    <button class="workflow-primary" data-owner="share-save">继续</button>
  </template>
  <template v-if="view.editor.type === 'fence'">
    <label
      >围栏名称<input data-owner-field="name" :value="txt(row.rideRangeName)" maxlength="80"
    /></label>
    <GroupList>
      <ListRow
        label="圆心"
        :value="
          view.center
            ? view.center.longitude.toFixed(5) + ', ' + view.center.latitude.toFixed(5)
            : '—'
        "
      />
      <button class="workflow-row" data-owner="fence-radius">半径　{{ view.radius }} m</button>
    </GroupList>
    <div v-if="view.mapLoaded && map" data-fence-map>
      <svg viewBox="0 0 640 360" role="img" aria-label="点击地图选择围栏圆心" @click="pick">
        <image
          v-for="tile in map.tiles"
          :key="tile.key"
          :href="tile.url"
          :x="tile.x"
          :y="tile.y"
          width="256"
          height="256"
        />
        <circle class="radius" cx="320" cy="180" :r="map.radius" />
        <circle class="center" cx="320" cy="180" r="5" />
      </svg>
      <GroupList
        ><button class="workflow-row" data-owner="map-in">放大</button>
        <button class="workflow-row" data-owner="map-out">缩小</button></GroupList
      >
      <p class="foot">© 高德地图</p>
    </div>
    <GroupList v-else
      ><button class="workflow-row" data-owner="fence-map">加载地图</button></GroupList
    >
    <button class="workflow-primary" data-owner="fence-save">保存</button>
  </template>
  <GroupList><button class="workflow-row" data-owner="editor-cancel">取消</button></GroupList>
</template>
<style scoped>
svg {
  width: 100%;
  border-radius: 20px;
  background: var(--fill);
}
.radius {
  stroke: var(--t1);
  fill: var(--fill);
  opacity: 0.4;
}
.center {
  fill: var(--t1);
}
</style>

<style scoped src="../../theme/workflows.css"></style>
