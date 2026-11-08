<script setup lang="ts">
import ToggleField from '../../components/ToggleField.vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import ListMotion from '../../components/ListMotion.vue';
import { useWorkflowOverlay } from '../../stores/workflow-actions';
const route = useRoute(),
  id = String(route.params.id || ''),
  session = useSessionStore();
const { host, view: v } = useWorkflowPage('accounts');
const account = computed(() => v.value.book?.accounts.find((item: any) => item.id === id));
const disabled = computed(() => v.value.working || session.state.preview);
const phone = (value: string) =>
  /^1\d{10}$/.test(value) ? value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '';
function rename() {
  const overlay = useWorkflowOverlay();
  overlay.show(
    '账号名称',
    {
      kind: 'form',
      label: '保存',
      fields: [{ label: '账号名称', name: 'label', value: account.value.label }],
    },
    (button) => {
      const value = button
        .closest('#runtime-modal')
        ?.querySelector<HTMLInputElement>('input')?.value;
      if (value === undefined) return;
      const input = document.createElement('input');
      input.dataset.accountLabel = id;
      input.value = value;
      host.value?.append(input);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.remove();
      overlay.close();
    },
  );
}
</script>
<template>
  <PageFrame :title="id ? '账号' : '账号与车辆'">
    <div ref="host" class="workflow">
      <template v-if="!id">
        <GroupList>
          <ListMotion>
            <ListRow
              v-for="item in v.book?.accounts || []"
              :key="item.id"
              :label="item.label"
              :detail="phone(item.uid)"
              :value="`${item.vehicles.length} 台车`"
              :to="`/me/accounts/${item.id}`"
            />
          </ListMotion>
        </GroupList>
        <button
          class="workflow-primary"
          data-account-add
          :disabled="disabled || (v.book?.accounts.length || 0) >= 8"
        >
          添加账号
        </button>
        <GroupList v-if="v.book?.accounts.length"
          ><ListRow
            label="退出全部账号"
            action
            danger
            :disabled="disabled"
            @activate="session.action('logout')"
        /></GroupList>
      </template>
      <template v-else-if="account">
        <GroupList>
          <ListRow
            label="账号名称"
            :value="account.label"
            action
            :disabled="disabled"
            @activate="rename"
          />
        </GroupList>
        <GroupList title="车辆">
          <template v-for="car in account.vehicles" :key="car.id">
            <button class="workflow-row" :data-account-select="car.id" :disabled="disabled">
              {{ car.label }}　{{ v.book.selectedVehicleId === car.id ? '当前' : '切换' }}
              <small>尾号 {{ car.vin.slice(-6) }}</small>
            </button>
            <ToggleField
              label="后台读取此车"
              :data-account-vehicle-enabled="car.id"
              :checked="car.enabled"
              :disabled="disabled"
            />
          </template>
        </GroupList>
        <GroupList
          ><button class="workflow-row" :data-account-update="account.id" :disabled="disabled">
            更新登录信息
          </button>
          <ToggleField
            label="后台使用此账号"
            :data-account-enabled="account.id"
            :checked="account.enabled"
            :disabled="disabled"
        /></GroupList>
        <GroupList
          ><button
            class="workflow-row danger"
            :data-account-remove="account.id"
            :disabled="disabled"
          >
            移除此账号
          </button></GroupList
        >
      </template>
      <p class="foot" role="status">{{ v.message }}</p>
    </div>
  </PageFrame>
</template>
<style scoped>
.account-name {
  padding: 12px 16px;
}
small {
  display: block;
  font-size: 13px;
  color: var(--t2);
  margin-top: 4px;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
