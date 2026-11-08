<script setup lang="ts">
import HistoryPanel from './HistoryPanel.vue';
import ToggleField from '../../components/ToggleField.vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import { age } from '../../stores/presentation';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import StatusCard from '../../components/StatusCard.vue';
import { version } from '../../../package.json';
const route = useRoute(),
  path = route.path,
  session = useSessionStore();
const title = String(route.meta.title);
const initial =
  path === '/tools/monitor' ? 'monitor' : path === '/tools/widgets' ? 'desktop' : 'tools';
const toolGroup = path.endsWith('/android')
  ? 'android'
  : path.endsWith('/scan')
    ? 'scan'
    : path.startsWith('/tools/meter')
      ? 'meter'
      : 'diagnostics';
const { host, view: v } = useWorkflowPage('background', { initial, toolGroup });
const has = (name: string) =>
  session.state.nativeAvailable && v.value.caps?.features[name] === true;
const disabled = computed(() => session.state.preview || v.value.working);
const snapshot = computed(
  () =>
    v.value.status?.vehicles?.find((item: any) => item.id === v.value.selected)?.snapshot ||
    (v.value.selected === session.state.accountBook.selectedVehicleId
      ? session.state.reading
      : null),
);
const selected = computed(() =>
  v.value.vehicles?.find((item: any) => item.id === v.value.selected),
);
</script>
<template>
  <PageFrame :title="title">
    <div id="background-panel" ref="host" class="workflow">
      <StatusCard
        v-if="initial === 'monitor'"
        :title="v.monitorEnabled ? '已开启' : '未开启'"
        icon="bell"
        :metrics="[]"
        :subtitle="age(v.status?.lastRun)"
      />
      <GroupList v-if="initial !== 'tools'">
        <button
          class="workflow-row"
          data-background="pick-vehicle"
          :data-selected-vehicle="v.selected"
          :disabled="disabled"
        >
          目标车辆 <span class="right-value">{{ selected?.label || '—' }}</span>
        </button>
      </GroupList>
      <HistoryPanel v-if="v.section === 'history'" :view="v" :disabled="disabled" />
      <template v-else-if="initial === 'monitor'">
        <GroupList>
          <ListRow
            label="后台提醒"
            toggle
            :checked="Boolean(v.monitorEnabled)"
            :disabled="disabled || !has('background')"
            @change="
              host?.querySelector<HTMLButtonElement>('[data-background=toggle-monitor]')?.click()
            "
          />
          <button hidden data-background="toggle-monitor" />
        </GroupList>
        <template v-if="v.monitorEnabled">
          <GroupList title="提醒分类">
            <ToggleField
              v-for="(label, key) in v.labels"
              :key="key"
              :label="label"
              :data-background-notification="key"
              :checked="v.preferences?.notifications[key]"
              :disabled="disabled"
            />
          </GroupList>
          <GroupList
            ><button class="workflow-row" data-background="pick-threshold" :disabled="disabled">
              低电提醒 <span class="right-value">{{ v.preferences?.lowBatteryThreshold }}%</span>
            </button>
            <button
              class="workflow-row"
              data-background="run"
              :disabled="disabled || !has('background')"
            >
              读取一次
            </button>
            <button class="workflow-row" data-background="history-events" :disabled="disabled">
              提醒记录
            </button></GroupList
          >
        </template>
        <button
          class="workflow-primary"
          data-background="save-monitor"
          :disabled="disabled || !has('background')"
        >
          保存
        </button>
      </template>
      <template v-else-if="initial === 'desktop'">
        <section class="widget-preview" :data-size="v.style" aria-label="组件内容预览">
          <StatusCard
            :title="selected?.label || '—'"
            :subtitle="age(snapshot?.receivedAt)"
            icon="batt"
            :metrics="[
              { label: '电量', value: snapshot?.soc, unit: '%' },
              { label: '可行驶', value: snapshot?.range, unit: 'km' },
              { label: '电压', value: snapshot?.voltage, unit: 'V' },
            ]"
          />
        </section>
        <GroupList
          ><button
            v-for="[key, label] in [
              ['1x1', '小'],
              ['2x2', '中'],
              ['4x2', '宽'],
              ['4x4', '大'],
            ]"
            :key="key"
            class="workflow-row"
            :data-widget-size="key"
            :aria-pressed="v.style === key"
          >
            {{ label }}
          </button>
          <ToggleField
            label="车辆操作入口"
            data-background-controls
            :checked="v.controls"
            :disabled="disabled"
        /></GroupList>
        <GroupList>
          <button
            class="workflow-row"
            data-background="widget-save"
            :disabled="disabled || !has('widget')"
          >
            保存组件
          </button>
          <button
            class="workflow-row"
            data-background="widget-reset"
            :disabled="disabled || !has('widget')"
          >
            恢复只读
          </button>
          <button
            v-if="has('shortcuts')"
            class="workflow-row"
            data-background="shortcuts"
            :disabled="disabled"
          >
            创建快捷指令
          </button>
        </GroupList>
        <button
          class="workflow-primary"
          data-background="widget-pin"
          :disabled="disabled || !has('widget')"
        >
          添加到桌面
        </button>
      </template>
      <template v-else-if="toolGroup === 'scan'">
        <StatusCard title="扫描仪表上的配对码" icon="scan" :metrics="[]" />
        <button
          class="workflow-primary"
          data-background="tool-scanner"
          :disabled="disabled || !has('scanner')"
        >
          开始扫码
        </button>
      </template>
      <template v-else-if="toolGroup === 'android'">
        <GroupList title="极核 App 登录">
          <button
            class="workflow-row"
            data-background="official-start"
            :disabled="disabled || !has('officialLogin')"
          >
            连接
          </button>
          <button
            class="workflow-row"
            data-background="official-result"
            :disabled="disabled || !has('officialLogin')"
          >
            读取结果
          </button>
          <button
            class="workflow-row"
            data-background="official-stop"
            :disabled="disabled || !has('officialLogin')"
          >
            停止
          </button>
        </GroupList>
        <GroupList title="后台常驻模块"
          ><button
            class="workflow-row"
            data-background="keepalive"
            :disabled="disabled || !has('keepalive')"
          >
            导出
          </button></GroupList
        >
      </template>
      <template v-else>
        <GroupList>
          <button
            v-if="has('diagnostics')"
            class="workflow-row"
            data-background="diagnostics"
            :disabled="disabled"
          >
            导出诊断信息
          </button>
          <button class="workflow-row" @click="session.action('export-command-report')">
            导出上次车控结果
          </button>
          <button
            v-if="has('updates')"
            class="workflow-row"
            data-background="update-check"
            :disabled="disabled"
          >
            检查 App 更新　 {{ version }}
          </button>
        </GroupList>
        <button
          v-if="v.updateAvailable"
          class="workflow-primary"
          data-background="update-install"
          :disabled="disabled"
        >
          安装新版
        </button>
      </template>

      <p class="foot" role="status">{{ v.message }}</p>
    </div>
  </PageFrame>
</template>
<style scoped>
.right-value {
  float: right;
  color: var(--t2);
}
</style>

<style scoped src="../../theme/workflows.css"></style>
