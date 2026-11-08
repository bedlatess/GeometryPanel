<script setup lang="ts">
import { computed, reactive, ref, onBeforeUnmount } from 'vue';
import { IonSelect, IonSelectOption } from '@ionic/vue';
import { demoSnapshot, demoVehicle } from '../../core/model';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import SlideControl from '../../components/SlideControl.vue';
import MetricValue from '../../components/MetricValue.vue';
import Sheet from '../../components/Sheet.vue';
import QuickAction from '../../components/QuickAction.vue';
// This local driver has no session, persistence, transport or device access.
const scenes: Record<string, string> = {
  normal: '正常',
  unlocked: '未锁车',
  loading: '正在加载',
  sending: '正在发送',
  pending: '等待车辆响应',
  success: '已开锁',
  error: '未收到车辆响应',
  offline: '手机没网',
  vehicleOffline: '车辆离线',
  stale: '数据过期',
  low: '电量低',
  missing: '读数缺失',
  unsupported: '此车型不支持',
  long: '长车名',
  signedOut: '未登录',
  charging: '充电中',
  leverTimeout: '拨杆超时',
  multi: '多车切换',
  expired: '登录已过期',
  future: '时间异常',
  unknown: '时间未知',
};
const scene = ref('normal'),
  platform = ref('pwa'),
  theme = ref('dark'),
  overlay = ref('');
const selected = ref(0),
  intent = ref('powerOn');
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));
function setScene(value: string) {
  clearTimeout(timer);
  scene.value = value;
  overlay.value = '';
}
const name = computed(() =>
  scene.value === 'long'
    ? '每天陪我穿过城市去看海的那一辆极核电动车'
    : scene.value === 'multi'
      ? ['AE5i 通勤', 'AE8 周末'][selected.value]
      : 'AE5i 通勤',
);
const phase = computed(() =>
  ['sending', 'pending', 'success', 'error'].includes(scene.value)
    ? scene.value
    : scene.value === 'leverTimeout'
      ? 'error'
      : 'idle',
);
const data = computed(() => {
  const d = structuredClone(demoSnapshot);
  d.soc = scene.value === 'missing' ? null : scene.value === 'low' ? 12 : 82;
  d.range = scene.value === 'missing' ? null : scene.value === 'low' ? 9 : 91;
  d.daily.capabilities.networkUnlock = scene.value !== 'unsupported';
  return d;
});
const status = computed(
  () =>
    ({
      offline: '网络不可用',
      expired: '登录已过期',
      stale: '2 小时前的数据',
      future: '更新时间未知',
      unknown: '更新时间未知',
      vehicleOffline: '车辆离线',
      charging: '正在充电',
      missing: '锁状态未知',
      unlocked: '未锁车',
      success: '未锁车',
    })[scene.value] || '已锁车',
);
const presentation = reactive({
  vehicle: computed(() => ({ ...demoVehicle, name: name.value })),
  daily: computed(() => data.value.daily),
  online: computed(() => scene.value !== 'offline'),
  locked: computed(() =>
    ['missing', 'stale', 'future', 'unknown', 'leverTimeout', 'error'].includes(scene.value)
      ? null
      : !['unlocked', 'success'].includes(scene.value),
  ),
});
function confirm(mode: string) {
  intent.value = mode;
  overlay.value = 'confirm';
}
const driver = reactive({
  state: computed(() => ({
    preview: false,
    expired: scene.value === 'expired',
    session: scene.value === 'signedOut' ? null : {},
    busy: scene.value === 'loading',
    leverPhase: phase.value,
    leverTarget: intent.value,
  })),
  haptic() {},
  control: confirm,
});
function send() {
  overlay.value = '';
  setScene('sending');
  timer = setTimeout(() => setScene('pending'), 1100);
}
function reset() {
  setScene('normal');
  platform.value = 'pwa';
  theme.value = 'dark';
}
</script>
<template>
  <PageFrame title="状态模拟器"
    ><div id="design-lab">
      <p class="foot">演示数据　只在本页模拟</p>
      <GroupList>
        <label class="select-row"
          >平台形态<IonSelect
            name="lab-platform"
            interface="action-sheet"
            :value="platform"
            @ion-change="platform = $event.detail.value"
          >
            <IonSelectOption value="pwa">iPhone 主屏幕</IonSelectOption>
            <IonSelectOption value="ios">iOS App</IonSelectOption>
            <IonSelectOption value="android">Android App</IonSelectOption></IonSelect
          ></label
        >
        <label class="select-row"
          >主题<IonSelect
            name="lab-theme"
            interface="action-sheet"
            :value="theme"
            @ion-change="theme = $event.detail.value"
          >
            <IonSelectOption value="dark">深色</IonSelectOption>
            <IonSelectOption value="light">浅色</IonSelectOption></IonSelect
          ></label
        >
        <label class="select-row"
          >状态<IonSelect
            name="lab-scene"
            interface="action-sheet"
            :value="scene"
            @ion-change="setScene($event.detail.value)"
          >
            <IonSelectOption v-for="(label, id) in scenes" :key="id" :value="id">{{
              label
            }}</IonSelectOption>
          </IonSelect></label
        >
        <ListRow label="恢复初始演示" action @activate="reset" />
      </GroupList>
      <section class="design-frame" :data-theme="theme" :data-platform="platform">
        <template v-if="scene === 'signedOut'">
          <button class="workflow-primary" @click="overlay = 'demo'">
            登录极核账号
          </button> </template
        ><template v-else>
          <button class="car-title" @click="overlay = 'cars'">{{ name }}⌄</button>
          <p class="home-status">{{ status }}</p>
          <div class="model-mark">AE5i</div>
          <span v-if="scene === 'loading'" class="skeleton" />
          <div v-else class="battery-number"><MetricValue :value="data.soc" unit="%" /></div>
          <p>可行驶 {{ data.range ?? '—' }}<template v-if="data.range != null"> km</template></p>
          <SlideControl :driver="driver" :presentation="presentation" />
          <p class="lever-reason">
            {{ scene === 'leverTimeout' ? '未收到车辆响应' : scene === 'multi' ? name : '' }}
          </p>
          <div class="quick">
            <QuickAction icon="horn" label="寻车" @activate="overlay = 'horn'" />
            <QuickAction icon="seat" label="座桶" @activate="confirm('seat')" />
            <QuickAction icon="pin" label="位置" @activate="overlay = 'demo'" />
            <QuickAction icon="more" label="更多" @activate="overlay = 'demo'" />
          </div>
          <p role="status">
            {{ phase === 'pending' ? '等待车辆响应' : phase === 'error' ? '未收到车辆响应' : '' }}
          </p>
        </template>
      </section>
      <Sheet
        :open="Boolean(overlay)"
        :title="overlay === 'confirm' ? '演示操作确认' : '演示选择'"
        @close="overlay = ''"
        ><section v-if="overlay === 'confirm'" aria-label="演示操作确认">
          <h2>
            {{ intent === 'powerOff' ? '关机锁车' : intent === 'seat' ? '打开座桶' : '上电开锁' }}
          </h2>
          <p>{{ name }}　尾号 3A9F21</p>
          <button class="workflow-primary" @click="send">确认演示</button>
        </section>
        <GroupList v-else-if="overlay === 'cars'">
          <ListRow
            v-for="(car, index) in ['AE5i 通勤', 'AE8 周末']"
            :key="car"
            :label="car"
            action
            @activate="
              selected = index;
              overlay = '';
            "
        /></GroupList>
        <button v-else-if="overlay === 'horn'" class="workflow-primary" @click="overlay = 'demo'">
          鸣笛寻车
        </button>
        <p v-else>界面演示</p></Sheet
      >
    </div></PageFrame
  >
</template>
<style scoped>
.select-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 52px;
  padding: 0 16px;
  font-size: 17px;
}
.design-frame {
  background: var(--bg);
  color: var(--t1);
  padding: 20px;
  border-radius: 20px;
}
.car-title {
  font-size: 24px;
  font-weight: 600;
  background: transparent;
  min-height: 44px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-status,
p {
  font-size: 15px;
  color: var(--t2);
}
.model-mark {
  font: 700 80px GP;
  text-align: center;
  padding: 32px 0;
  color: var(--t3);
}
.battery-number :deep(.metric-value) {
  font-size: 80px;
}
.quick {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
}
.lever-reason {
  min-height: 20px;
}
@media (prefers-reduced-motion: reduce) {
  .design-frame {
    animation: none;
  }
}
</style>

<style scoped src="../../theme/workflows.css"></style>
