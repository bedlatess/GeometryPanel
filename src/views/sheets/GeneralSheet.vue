<script setup lang="ts">
import { computed } from 'vue';
import { IonButton } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import { age } from '../../stores/presentation';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
const session = useSessionStore();
const body = computed(() => session.state.sheet?.body || {});
const dataRows = computed(() => {
  const data = body.value.snapshot;
  return [
    ['车辆状态', data?.daily.reportedAt, data?.daily.reportState],
    ['电池', data?.daily.batteryReportedAt, data?.daily.batteryReportState],
    ['位置', data?.daily.location?.reportedAt, data?.daily.location?.reportState],
    ['刷新于', data?.receivedAt, 'fresh'],
  ] as const;
});
function submit(event: Event) {
  const button = event.currentTarget as HTMLElement;
  Object.assign(button.dataset, body.value.data || {});
  session.modalEvent({ type: 'click', target: button } as unknown as Event);
}
const releases = 'https://github.com/bedlatess/GeometryPanel/releases/latest';
const online = () => navigator.onLine;
function selectText(event: FocusEvent) {
  (event.target as HTMLTextAreaElement).select();
}
</script>
<template>
  <GroupList v-if="body.kind === 'actions'">
    <ListRow
      v-for="[label, icon, action, value] in body.items"
      :key="label"
      :label="label"
      :icon="icon"
      action
      @activate="session.action(action, value)"
    />
  </GroupList>
  <template v-if="body.kind === 'data'">
    <GroupList>
      <ListRow label="网络" :value="online() ? '已连接' : '不可用'" />
      <ListRow
        v-for="[label, at, state] in dataRows"
        :key="label"
        :label="label"
        :value="
          state === 'future'
            ? '时间异常'
            : state === 'unknown'
              ? '时间未知'
              : age(at) + (at && Date.now() - at > 1800000 ? '　超过 30 分钟' : '')
        "
      />
    </GroupList>
  </template>
  <template v-if="body.kind === 'confirm'">
    <div class="confirm-content">
      <span class="confirm-icon"><AppIcon name="alert" /></span>
      <p>{{ body.name }}<br />{{ body.detail }}</p>
      <button class="workflow-primary" :disabled="session.state.busy" @click.stop="submit">
        {{ body.label }}
      </button>
      <IonButton expand="block" fill="clear" @click.stop="session.close()">取消</IonButton>
    </div>
  </template>
  <template v-if="body.kind === 'download'">
    <GroupList
      ><a :href="releases" target="_blank" rel="noopener noreferrer" class="workflow-row"
        >Android</a
      >
      <a :href="releases" target="_blank" rel="noopener noreferrer" class="workflow-row">
        iPhone 自签</a
      ></GroupList
    >
  </template>
  <template v-if="body.kind === 'preferences'">
    <label
      >选择配置文件<input id="preferences-file" type="file" accept=".json,application/json"
    /></label>
    <form id="preferences-form">
      <label>粘贴配置<textarea id="preferences-import" maxlength="4096" required /></label>
      <button class="workflow-primary" type="submit">导入设置</button>
    </form>
  </template>
  <label v-if="body.kind === 'copyPreferences'"
    >设置
    <textarea id="preferences-backup" readonly :value="body.value" @focus="selectText" />
  </label>
  <template v-if="body.kind === 'accountBackup'">
    <label v-if="!body.exporting"
      >备份文件<input data-account-file type="file" accept=".gpbackup"
    /></label>
    <label
      >备份密码<input
        data-account-password
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="256"
        required
    /></label>
    <button
      class="workflow-primary"
      data-account-backup-confirm
      :disabled="session.state.busy"
      @click.stop="submit"
    >
      {{ body.exporting ? '加密并导出' : '解密并恢复' }}
    </button>
  </template>
</template>
<style scoped>
label {
  display: block;
  margin-top: 16px;
  font-size: 15px;
}
input,
textarea {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--t1);
  border: 0;
}
textarea {
  min-height: 120px;
}
a {
  text-decoration: none;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
