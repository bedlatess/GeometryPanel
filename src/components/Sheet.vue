<script setup lang="ts">
import { IonModal } from '@ionic/vue';
import AppIcon from './AppIcon.vue';
defineProps<{ open: boolean; title: string; centered?: boolean }>();
defineEmits<{ close: []; closed: [] }>();
</script>
<template>
  <IonModal
    :is-open="open"
    :breakpoints="[0, 1]"
    :initial-breakpoint="1"
    :handle="true"
    :backdrop-breakpoint="0"
    @will-dismiss="open && $emit('close')"
    @did-dismiss="$emit('closed')"
  >
    <section class="sheet-content" :class="{ centered }" :aria-label="title">
      <div v-if="!centered" class="sheet-heading">
        <h2>{{ title }}</h2>
        <button class="sheet-close" aria-label="关闭" @click="$emit('close')">
          <AppIcon name="x" />
        </button>
      </div>
      <slot />
    </section>
  </IonModal>
</template>
