<script setup lang="ts">
import { ref, watch } from 'vue';
import { IonToggle } from '@ionic/vue';
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  label: string;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
}>();
const input = ref<HTMLInputElement>(),
  checked = ref(Boolean(props.checked));
watch(
  () => props.checked,
  (value) => (checked.value = Boolean(value)),
);
function change(value: boolean) {
  checked.value = value;
  if (input.value) {
    input.value.checked = value;
    input.value.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
</script>
<template>
  <label class="toggle-field"
    ><span>{{ label }}</span>
    <input
      ref="input"
      v-bind="$attrs"
      type="checkbox"
      hidden
      :name="name"
      :checked="checked"
      :disabled="disabled" />
    <IonToggle
      :aria-label="label"
      :checked="checked"
      :disabled="disabled"
      @ion-change="change($event.detail.checked)"
  /></label>
</template>
<style scoped>
.toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 16px;
  color: var(--t1);
  font-size: 17px;
  background: var(--card);
}
ion-toggle {
  flex-shrink: 0;
}
</style>
