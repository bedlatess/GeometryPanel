import { appScope } from './scope';

/** Waiting workers activate only after an explicit action on an idle page. */
export function installUpdates(onReady: () => void, onFailure: () => void) {
  let registration: ServiceWorkerRegistration | undefined;
  let requested = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requested && !reloading) { reloading = true; location.reload(); }
  });
  const start = async () => {
    try {
      registration = await navigator.serviceWorker.register(`${appScope}sw.js`, { updateViaCache: 'none' });
      const check = () => { if (registration?.waiting && navigator.serviceWorker.controller) onReady(); };
      check();
      registration.addEventListener('updatefound', () => {
        const worker = registration?.installing;
        worker?.addEventListener('statechange', check);
      });
    } catch { /* The online application works without offline installation. */ }
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
  return {
    async check() { try { await registration?.update(); } catch { } },
    activate() {
      if (!registration?.waiting) { onFailure(); return; }
      requested = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => { if (!reloading) { requested = false; onFailure(); } }, 10000);
    },
  };
}
