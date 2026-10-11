/** Decides whether the animated WebGL background should run, or the static gradient fallback. */

interface NavigatorHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Low-power or data-saving devices get the static background (no GPU work, no extra JS). */
export function isLowPowerDevice(nav: NavigatorHints = navigator as NavigatorHints): boolean {
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
  return false;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type BackgroundMode = 'animated' | 'static';

export function chooseBackground(): BackgroundMode {
  if (typeof window === 'undefined') return 'static';
  if (prefersReducedMotion() || isLowPowerDevice() || !supportsWebGL()) return 'static';
  return 'animated';
}
