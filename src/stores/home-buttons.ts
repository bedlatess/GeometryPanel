import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { homeChoices, readHome, writeHome } from '../app/home-layout';
import { useSessionStore } from './session';
const choices = homeChoices;
export const useHomeButtons = defineStore('home-buttons', () => {
  const session = useSessionStore();
  const saved = ref<string[] | null>(null),
    demo = ref<string[] | null>(null);
  saved.value = readHome();
  window.addEventListener('home-layout-change', () => (saved.value = readHome()));
  const buttons = computed(
    () =>
      (session.state.preview ? demo.value : saved.value) || [
        'horn',
        'seat',
        session.state.preferences.shortcut[0] || 'location',
      ],
  );
  function set(index: number, value: string) {
    if (!choices.includes(value) || index < 0 || index > 2) return;
    const next = [...buttons.value];
    next[index] = value;
    if (session.state.preview) demo.value = next;
    else {
      try {
        writeHome(next);
        saved.value = next;
      } catch {
        session.toast('没保存上，再试一次');
      }
    }
  }
  return { buttons, set, choices };
});
