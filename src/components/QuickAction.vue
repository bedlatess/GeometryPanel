<script setup lang="ts">
import { IonSpinner } from '@ionic/vue';
import AppIcon from './AppIcon.vue';
defineProps<{ icon: string; label: string; busy?: boolean; unavailable?: boolean }>();
defineEmits<{ activate: [] }>();
</script>
<template>
  <button
    class="quick-action"
    :class="{ unavailable }"
    :aria-disabled="unavailable"
    @click="$emit('activate')"
  >
    <span class="circle"
      ><IonSpinner v-if="busy" name="crescent" /> <AppIcon v-else :name="icon" /></span
    ><span>{{ label }}</span>
  </button>
</template>
<style scoped src="./QuickAction.css"></style>
