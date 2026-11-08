<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import StatusCard from '../../components/StatusCard.vue';
import AppIcon from '../../components/AppIcon.vue';
import { IonButton } from '@ionic/vue';
import { age } from '../../stores/presentation';
const route = useRoute(),
  path = route.path;
const title = String(route.meta.title);
const meter = path.startsWith('/tools/meter'),
  section = path.split('/')[3];
const session = useSessionStore();
const { host, view: v } = useWorkflowPage('native', {
  section: meter ? 'meter' : 'bluetooth',
  view: section,
});
const has = (name: string) => v.value.capabilities?.features?.[name] === true;
const disabled = computed(
  () =>
    !session.state.nativeAvailable ||
    session.state.preview ||
    !session.state.session ||
    v.value.working,
);
const steps = ['准备资料', '搜索车辆', '连接', '认证', '登记或查询', '读取车况'];
const progress = computed(() =>
  v.value.status?.telemetry
    ? 5
    : v.value.status?.vehicleRegistered
      ? 4
      : v.value.status?.authenticated
        ? 3
        : v.value.status?.state === 'connected'
          ? 2
          : v.value.prepared
            ? 1
            : 0,
);
const main = computed(
  () =>
    [
      ['prepare', '准备资料', ''],
      ['scan', '搜索车辆', ''],
      ['command', '认证车辆', 'authenticate'],
      ['command', '查询车端登记', 'query'],
      ['command', '读取蓝牙车况', 'telemetryOn'],
      ['command', '读取蓝牙车况', 'telemetryOn'],
    ][progress.value],
);
const readings = computed(() => {
  const data = v.value.status?.telemetry;
  if (!data || typeof data !== 'object') return [];
  const values: [string, unknown, string, number, number][] = [
    ['蓝牙电量', data.soc ?? data.socPercent, '%', 0, 100],
    ['蓝牙电压', data.voltage ?? data.voltageV, 'V', 0, 200],
    ['蓝牙温度', data.temperature ?? data.temperatureC, '℃', -50, 150],
    ['仪表速度', data.speedKph, 'km/h', 0, 300],
  ];
  return values
    .filter(
      ([, value, , min, max]) =>
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    )
    .map(([label, value, unit]) => ({
      label,
      value: Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' ' + unit,
    }));
});
</script>
<template>
  <PageFrame :title="title">
    <template #toolbar>
      <IonButton
        v-if="!meter && !section"
        fill="clear"
        aria-label="更多操作"
        router-link="/tools/bluetooth/more"
        ><AppIcon name="more"
      /></IonButton>
    </template>
    <div id="native-panel" ref="host" class="workflow">
      <StatusCard :title="v.labels?.[v.status?.state] || '未连接'" icon="bt" :metrics="[]" />
      <template v-if="meter">
        <GroupList v-if="!section">
          <ListRow label="仪表壁纸" to="/tools/meter/wallpaper" />
          <ListRow label="仪表投屏" to="/tools/meter/cast" />
          <ListRow v-if="has('ota')" label="仪表升级" to="/tools/meter/upgrade" />
        </GroupList>
        <template v-if="section === 'wallpaper'">
          <GroupList>
            <button
              class="workflow-row"
              data-native-action="meter"
              data-value="wallpaper"
              :disabled="disabled || !has('meter')"
            >
              选择壁纸模板
            </button>
            <button
              class="workflow-row"
              data-native-action="local-tool"
              data-value="wallpaperZip"
              :disabled="disabled || !has('wallpaperZip')"
            >
              导入 ZIP 壁纸
            </button>
          </GroupList>
          <GroupList v-if="v.wallpapers?.length" title="壁纸模板">
            <button
              v-for="wallpaper in v.wallpapers"
              :key="wallpaper.id"
              class="workflow-row"
              data-native-action="wallpaper"
              :data-value="wallpaper.id"
              :disabled="disabled"
            >
              {{ wallpaper.name }}
            </button>
          </GroupList>
        </template>
        <button
          v-if="section === 'cast'"
          class="workflow-primary"
          data-native-action="meter"
          data-value="cast"
          :disabled="disabled || !has('meter')"
        >
          开始投屏
        </button>
        <button
          v-if="section === 'upgrade'"
          class="workflow-primary"
          data-native-action="local-tool"
          data-value="ota"
          :disabled="disabled || !has('ota')"
        >
          仪表升级
        </button>
      </template>
      <template v-else-if="section === 'more'">
        <GroupList>
          <button
            class="workflow-row"
            data-native-action="connect"
            :disabled="disabled || !v.prepared || !has('ble')"
          >
            连接车辆
          </button>
          <button
            class="workflow-row"
            data-native-action="disconnect"
            :disabled="disabled || !has('ble')"
          >
            断开蓝牙
          </button>
          <button
            v-for="(label, key) in v.commandLabels"
            :key="key"
            class="workflow-row"
            data-native-action="command"
            :data-value="key"
            :disabled="disabled || !v.prepared || !has('ble')"
          >
            {{ label }}
          </button>
        </GroupList>
        <GroupList v-if="has('proximity')" title="连接提醒">
          <button
            class="workflow-row"
            data-native-action="proximity-on"
            :disabled="disabled || !v.prepared"
          >
            开启连接提醒
          </button>
          <button class="workflow-row" data-native-action="proximity-off" :disabled="disabled">
            关闭连接提醒
          </button>
        </GroupList>
        <GroupList v-if="has('notifications') || has('widget')" title="提醒与桌面">
          <button
            v-if="has('notifications')"
            class="workflow-row"
            data-native-action="notifications-on"
            :disabled="disabled"
          >
            开启低电提醒
          </button>
          <button
            v-if="has('notifications')"
            class="workflow-row"
            data-native-action="notifications-off"
            :disabled="disabled"
          >
            关闭低电提醒
          </button>
          <button
            v-if="has('widget')"
            class="workflow-row"
            data-native-action="widget"
            :disabled="disabled || !session.state.reading"
          >
            更新桌面组件
          </button>
        </GroupList>
        <GroupList
          ><button class="workflow-row danger" data-native-action="forget" :disabled="disabled">
            清除车辆资料
          </button></GroupList
        >
      </template>
      <template v-else>
        <ol class="connection-steps">
          <li
            v-for="(label, index) in steps"
            :key="label"
            :aria-current="index === progress ? 'step' : undefined"
          >
            <AppIcon v-if="index < progress" name="check" /><span v-else>{{ index + 1 }}</span>
            {{ label }}
          </li>
        </ol>
        <GroupList v-if="v.devices?.length" title="附近车辆">
          <button
            v-for="device in v.devices"
            :key="device.id"
            class="workflow-row"
            data-native-action="device"
            :data-value="device.id"
            :disabled="disabled || !v.prepared"
          >
            {{ device.name || '附近车辆' }}
          </button>
        </GroupList>
        <GroupList>
          <ListRow label="认证" :value="v.status?.authenticated ? '已确认' : '状态未知'" />
          <ListRow label="手机登记" :value="v.status?.bindAcknowledged ? '已确认' : '状态未知'" />
          <ListRow label="车辆登记" :value="v.status?.vehicleRegistered ? '已确认' : '状态未知'" />
        </GroupList>
        <GroupList v-if="readings.length" title="蓝牙车况">
          <ListRow
            v-for="item in readings"
            :key="item.label"
            :label="item.label"
            :value="item.value"
          />
        </GroupList>
        <p v-if="readings.length" class="foot">
          {{ age(v.status.telemetryAt ?? v.status.telemetry.receivedAt) }}
        </p>
        <button
          class="workflow-primary"
          :data-native-action="main[0]"
          :data-value="main[2]"
          :disabled="disabled || !has('ble')"
        >
          {{ main[1] }}
        </button>
      </template>
      <GroupList
        ><button class="workflow-row" data-native-action="status" :disabled="disabled">
          刷新状态
        </button></GroupList
      >
      <p class="foot" role="status">{{ v.working ? '正在加载' : v.message }}</p>
    </div>
  </PageFrame>
</template>
<style scoped>
.connection-steps {
  list-style: none;
  padding: 16px;
}
.connection-steps li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  color: var(--t2);
}
.connection-steps li[aria-current] {
  color: var(--t1);
  font-weight: 600;
}
.connection-steps span,
.connection-steps .app-icon {
  width: 22px;
  height: 22px;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
