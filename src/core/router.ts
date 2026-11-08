export const roots = ['vehicle', 'records', 'tools', 'me'] as const;
export type Root = typeof roots[number];
const routes = /^\/(?:vehicle(?:\/(?:status|location(?:\/coordinates)?|settings(?:\/unsupported)?|info|messages(?:\/[A-Za-z0-9_%.-]{1,200})?))?|records(?:\/(?:rides(?:\/20\d{2}-\d{2}-\d{2})?|battery(?:\/info)?|tires))?|tools(?:\/(?:bluetooth(?:\/more)?|meter(?:\/(?:wallpaper|cast|upgrade))?|monitor|widgets|diagnostics|tasks|android|scan))?|me(?:\/(?:accounts|appearance|home|art|backup|install|about(?:\/(?:privacy|disclaimer|licenses(?:\/(?:barlow|lucide|mit))?))?|lab|components))?)$/;
export function validRoute(value: string): string { return routes.test(value) ? value : '/vehicle'; }
export const routeRoot = (path: string): Root => validRoute(path).split('/')[1] as Root;
export const parentRoute = (path: string) => path.split('/').slice(0, -1).join('/') || '/vehicle';

/** Navigation has no access to account, network, or vehicle state. */
export function createRouter(change: (path: string) => void, closeSheet: () => boolean) {
  let path = validRoute(location.hash.slice(1)), position = 0;
  const scrolls = new Map<string, number>();
  try { for (const [key, value] of Object.entries(JSON.parse(sessionStorage.getItem('gp-route-scrolls') ?? '{}'))) if (typeof value === 'number') scrolls.set(validRoute(key), value); } catch { }
  const remember = () => { scrolls.set(path, window.scrollY); try { sessionStorage.setItem('gp-route-scrolls', JSON.stringify(Object.fromEntries(scrolls))); } catch { } };
  history.replaceState({ ...history.state, gpPosition: position }, '', '#' + path);
  function display(next: string) {
    path = next; change(path);
    requestAnimationFrame(() => window.scrollTo({ top: scrolls.get(path) ?? 0, behavior: 'instant' }));
  }
  function navigate(next: string, replace = false) {
    next = validRoute(next);
    closeSheet();
    if (next === path) { window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    remember();
    if (!replace) position++;
    history[replace ? 'replaceState' : 'pushState']({ gpPosition: position }, '', '#' + next);
    display(next);
  }
  const changed = () => {
    const next = validRoute(location.hash.slice(1));
    remember(); closeSheet(); position = history.state?.gpPosition ?? 0;
    if (location.hash !== '#' + next) history.replaceState({ gpPosition: position }, '', '#' + next);
    display(next);
  };
  window.addEventListener('hashchange', changed);
  return {
    get path() { return path; }, get root() { return routeRoot(path); }, navigate,
    back() { if (closeSheet()) return; if (position > 0) history.back(); else navigate(parentRoute(path), true); },
    destroy() { remember(); window.removeEventListener('hashchange', changed); },
  };
}
