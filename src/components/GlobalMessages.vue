<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '../stores/session';
import { useRoute } from 'vue-router';
import { displayCopy } from '../app/copy';
const route = useRoute();
const session = useSessionStore();
const online = () => navigator.onLine;
const message = computed(() => displayCopy(session.state.notice));
</script>
<template>
  <div
    v-if="session.state.expired && route.path !== '/vehicle'"
    class="global-banner"
    role="status"
  >
    登录已过期<button @click="session.action('connect')">重新登录</button>
  </div>
  <div v-else-if="!online() && route.path !== '/vehicle'" class="global-banner" role="status">
    网络不可用
  </div>
  <div v-else-if="session.state.updateReady" class="global-banner" role="status">
    有新版本<button
      :disabled="session.state.busy || session.sheetOpen"
      @click="session.action('update')"
    >
      更新
    </button>
  </div>
  <Transition name="toast">
    <div
      v-if="message && message !== '正在加载'"
      class="result-toast notice"
      role="status"
      @pointerup="session.state.notice = ''"
    >
      {{ message }}
    </div>
  </Transition>
</template>
<style scoped src="./GlobalMessages.css"></style>
