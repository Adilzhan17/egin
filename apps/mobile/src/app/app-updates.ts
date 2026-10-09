let registration: ServiceWorkerRegistration | undefined;
export const UPDATE_EVENT = 'egin-app-update';
export const waitingUpdate = () => registration?.waiting;
const announce = () => window.dispatchEvent(new Event(UPDATE_EVENT));

export async function registerAppWorker() {
  registration = await navigator.serviceWorker.register('/sw.js');
  const current = registration;
  if (current.waiting && navigator.serviceWorker.controller) announce();
  current.addEventListener('updatefound', () => {
    const installing = current.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) announce();
    });
  });
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine && Date.now() - lastCheck > 300000) {
      lastCheck = Date.now(); void current.update().catch(() => undefined);
    }
  });
}

export function applyWaitingUpdate(): Promise<void> {
  const worker = waitingUpdate();
  if (!worker) return Promise.reject(new Error('Обновление уже применено или недоступно. Перезагрузите страницу.'));
  return new Promise((resolve, reject) => {
    const changed = () => { cleanup(); resolve(); location.reload(); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('Обновление не ответило. Попробуйте ещё раз.')); }, 15000);
    function cleanup() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); }
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    try { worker.postMessage({ type: 'EGIN_ACTIVATE_UPDATE' }); }
    catch { cleanup(); reject(new Error('Не удалось применить обновление. Попробуйте ещё раз.')); }
  });
}
