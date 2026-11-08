import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/** Ionic keeps pages mounted; query changes belong only to the visible route. */
export function usePageQuery(path: string, key: string, fallback: string) {
  const route = useRoute(),
    router = useRouter();
  const saved = ref(String(route.path === path ? route.query[key] || fallback : fallback));
  watch(
    () => [route.path, route.query[key]],
    () => {
      if (route.path === path) saved.value = String(route.query[key] || fallback);
    },
  );
  return computed({
    get: () => saved.value,
    set: (value) => {
      saved.value = value;
      if (route.path === path) void router.replace({ query: { ...route.query, [key]: value } });
    },
  });
}
