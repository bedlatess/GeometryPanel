export type InstallContext = 'installed' | 'ios' | 'browser';
export function installContext(userAgent: string, maxTouchPoints: number, standalone: boolean, displayStandalone: boolean): InstallContext {
  if (standalone || displayStandalone) return 'installed';
  return /iPhone|iPad|iPod/i.test(userAgent) || /Macintosh/i.test(userAgent) && maxTouchPoints > 1 ? 'ios' : 'browser';
}
export function currentInstallContext(): InstallContext {
  return installContext(navigator.userAgent, navigator.maxTouchPoints,
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
    matchMedia('(display-mode: standalone)').matches);
}
