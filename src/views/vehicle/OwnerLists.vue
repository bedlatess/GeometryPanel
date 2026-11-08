<script setup lang="ts">
import { computed, ref } from 'vue';
import { rows, txt, num } from '../../stores/owner';
import { useSessionStore } from '../../stores/session';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const props = defineProps<{ view: any; path: string }>();
const session = useSessionStore();
const action = ref<HTMLButtonElement>();
function toggle(name: string, index: number) {
  if (!action.value || disabled.value) return;
  action.value.dataset.owner = name;
  action.value.dataset.index = String(index);
  action.value.click();
}
const list = (key: string) => rows(props.view.data?.[key]);
const disabled = computed(
  () => props.view.busy || session.state.preview || !session.state.session || !navigator.onLine,
);
const phones = computed(() =>
  list('phoneKeys').flatMap((row) =>
    rows(row.inductiveUnlockVOList).length ? rows(row.inductiveUnlockVOList) : [row],
  ),
);
const shareKey = computed(() => (props.view.shareTab === 'long' ? 'shareLong' : 'shareTemp'));
const shares = computed(() =>
  list(shareKey.value).filter(
    (row) =>
      props.view.shareTab === 'long' ||
      (num(row.residualSeconds) !== null && Number(row.residualSeconds) > 0),
  ),
);
const mask = (value: unknown) => txt(value).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
</script>
<template>
  <button ref="action" hidden />
  <template v-if="path.endsWith('/phone-keys')">
    <GroupList
      v-for="(row, index) in phones"
      :key="index"
      :title="txt(row.phoneName) || '手机钥匙'"
    >
      <ListRow label="更新时间" :value="txt(row.modifyTime) || '—'" />
      <ListRow
        v-if="row.uniqueIdentify && view.ownIdentity === row.uniqueIdentify"
        label="当前设备"
        value="不可删除"
      />
      <button
        v-else
        class="workflow-row danger"
        data-owner="remove-phone"
        :data-index="index"
        :disabled="
          disabled ||
          !view.identityReady ||
          (session.state.nativeAvailable && !view.ownIdentity) ||
          !row.id ||
          !row.uniqueIdentify
        "
      >
        删除设备
      </button>
    </GroupList>
  </template>
  <template v-if="path.endsWith('/card-keys')">
    <GroupList
      v-for="(row, index) in list('nfcKeys')"
      :key="index"
      :title="txt(row.nfcName) || '卡钥匙'"
    >
      <ListRow label="卡号尾号" :value="txt(row.nfcNo).slice(-4) || '—'" />
      <button
        class="workflow-row"
        data-owner="rename-card"
        :data-index="index"
        :disabled="disabled || !row.id"
      >
        改名
      </button>
      <button
        class="workflow-row danger"
        data-owner="remove-card"
        :data-index="index"
        :disabled="disabled || !row.nfcNo"
      >
        删除卡钥匙
      </button>
    </GroupList>
  </template>
  <template v-if="path.endsWith('/fences') || /\/fences\//.test(path)">
    <GroupList
      v-for="(row, index) in list('fences')"
      :key="index"
      :title="txt(row.rideRangeName) || '电子围栏'"
    >
      <ListRow
        label="已启用"
        toggle
        :checked="String(row.delFlag) === '0'"
        :disabled="disabled"
        @change="toggle('fence-use', index)"
      />
      <ListRow
        label="半径"
        :value="num(row.radius) === null ? '—' : `${Number(row.radius) * 1000} m`"
      />
      <button class="workflow-row" data-owner="fence-edit" :data-index="index" :disabled="disabled">
        编辑
      </button>
      <button
        class="workflow-row danger"
        data-owner="fence-delete"
        :data-index="index"
        :disabled="disabled"
      >
        删除围栏
      </button>
    </GroupList>
    <button
      v-if="Array.isArray(view.data?.fences)"
      class="workflow-primary"
      data-owner="fence-new"
      :disabled="disabled"
    >
      新建围栏
    </button>
  </template>
  <template v-if="path.endsWith('/charge-plan')">
    <GroupList v-for="(row, index) in list('plans')" :key="index" title="充电计划">
      <ListRow
        label="充电时段"
        :value="`${txt(row.startTime) || '—'}–${txt(row.endTime) || '—'}`"
      />
      <ListRow
        label="已启用"
        toggle
        :checked="String(row.delFlag) === '0'"
        :disabled="disabled"
        @change="toggle('plan-use', index)"
      />
      <button class="workflow-row" data-owner="plan-edit" :data-index="index" :disabled="disabled">
        编辑
      </button>
    </GroupList>
    <button
      v-if="Array.isArray(view.data?.plans) && !list('plans').length"
      class="workflow-primary"
      data-owner="plan-new"
      :disabled="disabled"
    >
      新建计划
    </button>
    <GroupList v-if="view.pendingPlan"
      ><button class="workflow-row" data-owner="plan-retry" :disabled="disabled">
        重试启用
      </button></GroupList
    >
  </template>
  <template v-if="path.endsWith('/sharing')">
    <GroupList
      ><button
        v-for="[key, label] in [
          ['long', '长期'],
          ['temp', '临时'],
        ]"
        :key="key"
        class="workflow-row"
        :data-share-tab="key"
        :aria-pressed="view.shareTab === key"
      >
        {{ label }}
      </button></GroupList
    >
    <GroupList
      v-for="(row, index) in shares"
      :key="index"
      :title="txt(row.shareName ?? row.userName) || '家人用车'"
    >
      <ListRow label="手机号" :value="mask(row.sharePhone ?? row.userPhone)" />
      <button
        class="workflow-row danger"
        data-owner="share-revoke"
        :data-index="list(shareKey).indexOf(row)"
        :disabled="disabled"
      >
        撤销分享
      </button>
    </GroupList>
    <button
      v-if="Array.isArray(view.data?.[shareKey]) && shares.length < 3"
      class="workflow-primary"
      data-owner="share-new"
      :disabled="disabled"
    >
      新增分享
    </button>
  </template>
</template>

<style scoped src="../../theme/workflows.css"></style>
