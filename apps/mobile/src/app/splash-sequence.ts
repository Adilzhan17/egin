export const SPLASH_KEY = 'egin.splash.next.v1';
export const SPLASH_VARIANTS = ['flow', 'bars', 'pulse'] as const;
export type SplashVariant = typeof SPLASH_VARIANTS[number];
type SequenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Reserve at launch, not on ended: skipping, media errors and quick reloads
// must not strand a device on the same animation forever.
export function reserveSplash(storage?: SequenceStorage): SplashVariant {
  let index = 0;
  try {
    const saved = storage?.getItem(SPLASH_KEY);
    if (saved && /^[012]$/.test(saved)) index = Number(saved);
    storage?.setItem(SPLASH_KEY, String((index + 1) % SPLASH_VARIANTS.length));
  } catch { /* Private/blocked storage must never prevent launching the app. */ }
  return SPLASH_VARIANTS[index];
}

export async function selectLaunchSplash(): Promise<SplashVariant | null> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return null;
  const reserve = () => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage access can throw. */ }
    return reserveSplash(storage);
  };
  if (!navigator.locks) return reserve();
  // Serialize simultaneous launches in tabs/windows sharing this origin. A
  // stuck/older tab cannot hold the launch screen hostage through a held lock.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    return await navigator.locks.request(SPLASH_KEY, { signal: controller.signal }, reserve);
  } catch {
    // Do not race another tab's reservation after a timed-out lock request.
    return null;
  } finally { clearTimeout(timer); }
}
