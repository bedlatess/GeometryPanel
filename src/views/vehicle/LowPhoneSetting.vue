<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonDatetime, IonActionSheet } from '@ionic/vue';
import { useOwnerStore, obj, txt, num } from '../../stores/owner';
import { useSessionStore } from '../../stores/session';
import ListRow from '../../components/ListRow.vue';
import Sheet from '../../components/Sheet.vue';
import AppIcon from '../../components/AppIcon.vue';
const props = defineProps<{ periodOnly?: boolean }>();
const owner = useOwnerStore(),
  session = useSessionStore();
const choosing = ref(false),
  period = ref(false),
  confirming = ref(false);
const start = ref('07:00'),
  end = ref('21:00'),
  next = ref(false);
const settings = computed(() => owner.get('settings'));
const available = computed(() => num(settings.value.ultraLowBatteryReminder) !== null);
const on = computed(() => Number(settings.value.ultraLowBatteryReminder) === 1);
const value = computed(() => (!available.value ? '—' : on.value ? '已开启' : '未开启'));
function prepare() {
  if (!available.value || session.state.preview || owner.busy) return;
  start.value = txt(settings.value.withdrawalStartTime).slice(0, 5) || '07:00';
  end.value = txt(settings.value.withdrawalEndTime).slice(0, 5) || '21:00';
  next.value = on.value;
  if (props.periodOnly) period.value = true;
  else choosing.value = true;
}
function selected(value: boolean) {
  next.value = value;
  confirming.value = true;
}
function time(value: unknown) {
  return String(value).match(/T(\d{2}:\d{2})/)?.[1] || '';
}
async function confirm() {
  confirming.value = false;
  const bound = session.state.session;
  if (!bound) return;
  const x = start.value,
    y = end.value,
    enabled = next.value;
  await owner.mutate(
    (api, signal) => api.lowPhone(bound, enabled, x, y, signal),
    'settings',
    (value) =>
      obj(value).ultraLowBatteryReminder === undefined
        ? null
        : Number(obj(value).ultraLowBatteryReminder) === (enabled ? 1 : 0) &&
          txt(obj(value).withdrawalStartTime).slice(0, 5) === x &&
          txt(obj(value).withdrawalEndTime).slice(0, 5) === y,
  );
}
</script>
<template>
  <ListRow
    :label="periodOnly ? '撤防时段' : '电话提醒'"
    :value="
      periodOnly
        ? available
          ? `${txt(settings.withdrawalStartTime).slice(0, 5)}–` +
            txt(settings.withdrawalEndTime).slice(0, 5)
          : '—'
        : value
    "
    :action="available"
    :disabled="owner.busy || session.state.preview"
    :readonly="!available"
    @activate="prepare"
  />
  <IonActionSheet
    :is-open="choosing"
    header="电话提醒"
    :buttons="[
      { text: '开启', handler: () => selected(true) },
      { text: '关闭', handler: () => selected(false) },
      {
        text: '提醒时段',
        handler: () => {
          period = true;
        },
      },
      { text: '取消', role: 'cancel' },
    ]"
    @did-dismiss="choosing = false"
  />
  <Sheet :open="period" title="提醒时段" @close="period = false">
    <h3>开始时间</h3>
    <IonDatetime
      presentation="time"
      locale="zh-CN"
      hour-cycle="h23"
      :value="`2026-01-01T${start}:00`"
      :prefer-wheel="true"
      @ion-change="start = time($event.detail.value)"
    />
    <h3>结束时间</h3>
    <IonDatetime
      presentation="time"
      locale="zh-CN"
      hour-cycle="h23"
      :value="`2026-01-01T${end}:00`"
      :prefer-wheel="true"
      @ion-change="end = time($event.detail.value)"
    />
    <IonButton
      expand="block"
      @click="
        period = false;
        confirming = true;
      "
      >修改设置</IonButton
    >
  </Sheet>
  <Sheet :open="confirming" title="修改设置" centered @close="confirming = false">
    <div class="confirm-content">
      <span class="confirm-icon"><AppIcon name="phone" /></span>
      <h2>修改设置</h2>
      <p>
        {{ session.state.session?.vehicle.name }}　尾号
        {{ session.state.session?.vehicle.vin.slice(-6) }}<br />从 {{ on ? '开启' : '关闭' }} 改为
        {{ next ? '开启' : '关闭' }}　{{ start }} — {{ end }}
      </p>
      <IonButton expand="block" @click="confirm">修改设置</IonButton>
      <IonButton fill="clear" expand="block" @click="confirming = false">取消</IonButton>
    </div>
  </Sheet>
</template>
