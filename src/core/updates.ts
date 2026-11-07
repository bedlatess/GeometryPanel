import { appScope } from './scope';

/** Waiting workers activate only after an explicit action on an idle page. */
export function installUpdates(onReady: () => void, onFailure: () => void) {
  let registration: ServiceWorkerRegistration | undefined;
  let requested = false;
  let reloading = false;
  type Check = 'ready' | 'current' | 'unavailable' | 'failed';
  let checking: Promise<Check> | undefined;
  let resolveRegistration!: (value: ServiceWorkerRegistration | undefined) => void;
  const registered = new Promise<ServiceWorkerRegistration | undefined>(resolve => { resolveRegistration = resolve; });
  const limited = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('update')), 10000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
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
    finally { resolveRegistration(registration); }
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
  return {
    check(): Promise<Check> {
      if (checking) return checking;
      checking = (async (): Promise<Check> => {
        try {
          const current = await limited(registered);
          if (!current) return 'unavailable';
          await limited(current.update());
          const worker = current.installing;
          if (worker && worker.state !== 'installed' && worker.state !== 'activated' && worker.state !== 'redundant') {
            await limited(new Promise<void>((resolve, reject) => {
              const changed = () => {
                if (['installed', 'activated', 'redundant'].includes(worker.state)) {
                  worker.removeEventListener('statechange', changed);
                  worker.state === 'redundant' ? reject(new Error('update')) : resolve();
                }
              };
              worker.addEventListener('statechange', changed); changed();
            }));
          }
          if (current.waiting && navigator.serviceWorker.controller) { onReady(); return 'ready'; }
          return 'current';
        } catch { return 'failed'; }
      })().finally(() => { checking = undefined; });
      return checking;
    },
    activate() {
      if (!registration?.waiting) { onFailure(); return; }
      requested = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => { if (!reloading) { requested = false; onFailure(); } }, 10000);
    },
  };
}
