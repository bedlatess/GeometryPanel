<script setup lang="ts">
import { useSessionStore } from '../../stores/session';
import PageFrame from '../../components/PageFrame.vue';
const session = useSessionStore();
const themes = [
  ['light', '浅色'],
  ['dark', '深色'],
  ['system', '跟随系统'],
];
</script>
<template>
  <PageFrame title="外观">
    <div class="theme-previews">
      <button
        v-for="[id, label] in themes"
        :key="id"
        class="theme-choice"
        :aria-pressed="session.state.preferences.theme === id"
        @click="session.action('theme', id)"
      >
        <span class="theme-preview" :data-theme="id"><i /><b /><span /><span /></span>
        {{ label }}
      </button>
    </div>
  </PageFrame>
</template>
<style scoped>
.theme-previews {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 18px;
}
.theme-choice {
  color: var(--t1);
  background: transparent;
  font-size: 15px;
}
.theme-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 160px;
  padding: 12px;
  border: 2px solid transparent;
  border-radius: 18px;
  background: var(--bg);
  margin-bottom: 12px;
}
[aria-pressed='true'] .theme-preview {
  border-color: var(--t1);
}
i {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--fill2);
  margin: 16px auto;
}
b {
  height: 12px;
  width: 40px;
  background: var(--t1);
  border-radius: 4px;
}
.theme-preview > span {
  height: 12px;
  background: var(--fill2);
  border-radius: 4px;
}
</style>
