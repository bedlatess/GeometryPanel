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
        <span class="theme-preview" :data-preview="id"><i /><b /><span /><span /></span>
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
  display: flex;
  flex-direction: column;
  align-items: stretch;
  color: var(--t1);
  background: transparent;
  font-size: 15px;
}
.theme-preview {
  --p-bg: var(--pv-light-bg);
  --p-card: var(--pv-light-card);
  --p-fill: var(--pv-light-fill);
  --p-t1: var(--pv-light-t1);
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 0 0.5px var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 160px;
  padding: 12px;
  border: 2px solid transparent;
  border-radius: 18px;
  background: var(--p-bg);
  margin-bottom: 12px;
}
.theme-preview[data-preview='dark'] {
  --p-bg: var(--pv-dark-bg);
  --p-card: var(--pv-dark-card);
  --p-fill: var(--pv-dark-fill);
  --p-t1: var(--pv-dark-t1);
}
.theme-preview[data-preview='system'] {
  background: linear-gradient(135deg, var(--pv-light-bg) 50%, var(--pv-dark-bg) 50%);
}
.theme-preview > * {
  position: relative;
}
[aria-pressed='true'] .theme-preview {
  border-color: var(--t1);
}
i {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--p-fill);
  margin: 16px auto;
}
b {
  height: 12px;
  width: 40px;
  background: var(--p-t1);
  border-radius: 4px;
}
.theme-preview > span {
  height: 12px;
  background: var(--p-fill);
  border-radius: 4px;
}
</style>
