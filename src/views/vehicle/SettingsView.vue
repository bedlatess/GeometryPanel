<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { IonActionSheet, IonButton, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import { useExtensionsStore } from '../../stores/extensions';
import { useOwnerStore, num } from '../../stores/owner';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation } from '../../stores/presentation';
import type { VehicleSetting } from '../../core/extensions-model';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import Sheet from '../../components/Sheet.vue';
import SafetySettings from './SafetySettings.vue';
import LowPhoneSetting from './LowPhoneSetting.vue';
const ext = useExtensionsStore(),
  owner = useOwnerStore(),
  session = useSessionStore();
const vehicle = useVehiclePresentation();
const selection = ref<VehicleSetting | null>(null),
  pending = ref<{
    setting: VehicleSetting;
    value: string;
    label: string;
  } | null>(null);
const unsupportedOpen = ref(false);
const unsupported = computed(
  () =>
    ext.settings?.filter((item) => item.reason === '当前车型不支持' || item.display === '不支持') ||
    [],
);
const groups = ['骑行', '安全', '钥匙与分享', '电量', '驾驶辅助', '仪表', '灯光与声音'];
const group = (item: VehicleSetting) =>
  /light|sound|comeHome|BrakeFlash/i.test(item.key)
    ? '灯光与声音'
    : /Unit|Format|motoPlay|Button|Speed|theme|language/.test(item.key)
      ? '仪表'
      : /inductive|Nfc|password|cloudInductive/.test(item.key)
        ? '钥匙与分享'
        : /Endurance|Range|lowPower/.test(item.key)
          ? '电量'
          : /radar|cruise|barke|Traction|Brake/.test(item.key)
            ? '驾驶辅助'
            : /Vibration|ShutdownSwitch|Parking|withdrawal/.test(item.key)
              ? '安全'
              : '骑行';
const items = (name: string) =>
  ext.settings?.filter((item) => group(item) === name && !unsupported.value.includes(item)) || [];
const title = (item: VehicleSetting) =>
  ({
    cloudInductiveEnabled: '车辆感应钥匙',
    etcsTractionControl: '牵引力控制',
    customButtonSingle: '按键单击',
    cushionSensor: '座垫感应',
    ecushionSensor: '座垫感应 2.0',
    inducedVibration: '震动报警',
    lowPower: '低电量提醒',
  })[item.key] || item.title.replace(' · ', '');
const binary = (item: VehicleSetting) =>
  item.writable &&
  item.value != null &&
  item.choices?.length === 2 &&
  item.choices.every(([value]) => ['0', '1'].includes(value));
function choose(item: VehicleSetting) {
  if (!item.writable || !item.choices || item.value == null || session.state.preview) return;
  if (binary(item)) {
    const choice = item.choices.find(([value]) => value !== item.value)!;
    pending.value = { setting: item, value: choice[0], label: choice[1] };
  } else selection.value = item;
}
const buttons = computed(() => [
  ...(selection.value?.choices || []).map(([value, label]) => ({
    text: label,
    role: value === selection.value?.value ? 'selected' : undefined,
    handler: () => {
      if (selection.value && value !== selection.value.value) {
        pending.value = { setting: selection.value, value, label };
      }
    },
  })),
  { text: '取消', role: 'cancel' },
]);
async function refresh() {
  await Promise.all([ext.load('settings'), owner.load(['settings', 'caps'])]);
}
function confirm() {
  const target = pending.value;
  pending.value = null;
  if (target) void ext.write(target.setting, target.value);
}
onIonViewWillEnter(refresh);
onIonViewWillLeave(() => ext.cancel('/vehicle/settings'));
</script>
<template>
  <PageFrame title="车辆设置" :refresh="refresh">
    <template #toolbar
      ><IonButton aria-label="刷新设置" :disabled="ext.busy" @click="refresh"
        ><AppIcon name="refresh" /></IonButton
    ></template>
    <p v-if="ext.error" class="error" role="alert">{{ ext.error }}</p>
    <template v-for="name in groups" :key="name">
      <GroupList
        v-if="items(name).length || ['安全', '钥匙与分享', '电量'].includes(name)"
        :title="name"
      >
        <SafetySettings v-if="name === '安全'" />
        <ListRow
          v-for="item in items(name)"
          :key="item.key"
          :label="title(item)"
          :value="binary(item) ? undefined : item.value == null ? '—' : item.display"
          :toggle="Boolean(binary(item))"
          :checked="item.value === '1'"
          :action="item.writable"
          :disabled="ext.busy || session.state.preview || item.value == null"
          :busy="ext.writing && pending?.setting.key === item.key"
          @change="choose(item)"
          @activate="choose(item)"
        />
        <template v-if="name === '钥匙与分享'">
          <ListRow label="手机钥匙" icon="phone" to="/vehicle/settings/phone-keys" />
          <ListRow label="卡钥匙" icon="card" to="/vehicle/settings/card-keys" />
          <ListRow label="家人用车" icon="share" to="/vehicle/settings/sharing" />
        </template>
        <template v-if="name === '电量'">
          <LowPhoneSetting />
          <ListRow label="充电计划" to="/vehicle/settings/charge-plan" />
        </template>
      </GroupList>
    </template>
    <GroupList v-if="unsupported.length"
      ><ListRow label="此车型不支持的功能" action @activate="unsupportedOpen = true"
    /></GroupList>
    <IonActionSheet
      :is-open="Boolean(selection)"
      :header="selection ? title(selection) : ''"
      :buttons="buttons"
      @did-dismiss="selection = null"
    />
    <Sheet :open="Boolean(pending)" title="修改设置" centered @close="pending = null">
      <div v-if="pending" class="confirm-content">
        <span class="confirm-icon"><AppIcon name="gear" /></span>
        <h2>修改设置</h2>
        <p>
          {{ vehicle.vehicle?.name }}　尾号 {{ vehicle.vehicle?.vin.slice(-6) }}<br />从
          {{ pending.setting.display }} 改为 {{ pending.label }}
        </p>
        <IonButton expand="block" @click="confirm">修改设置</IonButton>
        <IonButton expand="block" fill="clear" @click="pending = null">取消</IonButton>
      </div>
    </Sheet>
    <Sheet :open="unsupportedOpen" title="此车型不支持的功能" @close="unsupportedOpen = false">
      <GroupList
        ><ListRow
          v-for="item in unsupported"
          :key="item.key"
          :label="title(item)"
          value="此车型不支持"
      /></GroupList>
    </Sheet>
  </PageFrame>
</template>
<style scoped src="./SettingsView.css"></style>
