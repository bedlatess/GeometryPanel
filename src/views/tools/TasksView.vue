<script setup lang="ts">
import ToggleField from '../../components/ToggleField.vue';
import TimeField from '../../components/TimeField.vue';
import AppIcon from '../../components/AppIcon.vue';
import { computed } from 'vue';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import { taskActions } from '../../core/tasks-model';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import StatusCard from '../../components/StatusCard.vue';
const { host, view: v } = useWorkflowPage('tasks');
const session = useSessionStore();
const disabled = computed(
  () => v.value.busy || v.value.loading || session.state.preview || !v.value.account,
);
</script>
<template>
  <PageFrame title="签到与积分">
    <template #toolbar>
      <button
        class="toolbar-refresh"
        aria-label="刷新"
        @click="host?.querySelector<HTMLButtonElement>('[data-task=refresh]')?.click()"
      >
        <AppIcon name="refresh" />
      </button>
    </template>
    <div id="tasks-panel" ref="host" class="workflow">
      <button hidden data-task="refresh" />
      <StatusCard
        :title="
          v.sign?.signed === true
            ? '今日已签到'
            : v.sign?.signed === false
              ? '今日未签到'
              : '状态未知'
        "
        icon="star"
        :metrics="[
          { label: '积分', value: v.summary?.points },
          { label: '连签', value: v.sign?.count, unit: '天' },
        ]"
      />
      <GroupList>
        <button
          v-if="v.accounts?.length > 1"
          class="workflow-row"
          data-task="pick-account"
          :disabled="disabled"
        >
          执行账号　{{ v.account?.label }}
        </button>
        <button
          v-if="v.sign?.signed === false"
          class="workflow-row"
          data-task="signin"
          :disabled="disabled"
        >
          签到
        </button>
        <ListRow
          v-for="task in v.summary?.tasks || []"
          :key="task.code"
          :label="task.title"
          :value="
            task.completed === true ? '已完成' : task.completed === false ? '未完成' : '状态未知'
          "
        />
      </GroupList>
      <form v-if="v.config" data-task-config>
        <GroupList title="执行内容">
          <ToggleField
            v-for="action in taskActions"
            :key="action"
            :label="v.labels[action]"
            :name="action"
            :checked="v.config.actions[action]"
            :disabled="disabled"
          />
        </GroupList>
        <label
          >要发布的文字<textarea
            name="postContent"
            maxlength="500"
            rows="3"
            :disabled="disabled"
            :value="v.config.postContent"
          />
        </label>
        <input name="gap" type="hidden" :value="v.config.requestIntervalMs / 1000" />
        <GroupList>
          <button type="button" class="workflow-row" data-task="pick-gap" :disabled="disabled">
            执行间隔　{{ v.config.requestIntervalMs / 1000 }} 秒
          </button>
          <ToggleField
            label="允许取消已有的点赞"
            name="legacyLikeConfirmed"
            :checked="v.config.legacyLikeConfirmed"
            :disabled="disabled"
          />
          <template v-if="v.nativeTasks">
            <ToggleField
              label="定时执行"
              name="enabled"
              :checked="v.config.enabled"
              :disabled="disabled"
            />
            <TimeField
              label="每天执行时间"
              name="time"
              :value="v.config.time"
              :disabled="disabled"
            />
          </template>
        </GroupList>
        <GroupList
          ><button class="workflow-row" type="submit" :disabled="disabled">保存</button>
          <button
            v-if="v.nativeTasks"
            type="button"
            class="workflow-row"
            data-task="status"
            :disabled="disabled"
          >
            执行状态
          </button></GroupList
        >
      </form>
      <button class="workflow-primary" data-task="run" :disabled="disabled">立即执行</button>
      <p v-if="v.busy" class="foot" role="status">正在执行</p>
      <p class="foot" role="status">{{ v.note }}</p>
      <p class="foot" role="alert">{{ v.error }}</p>
      <GroupList v-if="v.steps?.length" title="上次结果">
        <ListRow
          v-for="(step, index) in v.steps"
          :key="index"
          :label="v.labels[step.action]"
          :value="v.states[step.state] + (step.reason ? '　' + v.reasons[step.reason] : '')"
        />
      </GroupList>
    </div>
  </PageFrame>
</template>
<style scoped>
.toolbar-refresh {
  width: 44px;
  height: 44px;
  background: transparent;
  color: var(--t1);
}
</style>

<style scoped src="../../theme/workflows.css"></style>
