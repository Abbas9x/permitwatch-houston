import type { PermitType } from '../../../shared/permit';

/** CSS colors per permit type (theme tokens; each meets 4.5:1 contrast on the night background). */
export const TYPE_COLORS: Record<PermitType, string> = {
  new: 'var(--color-new)',
  renewal: 'var(--color-renewal)',
  amendment: 'var(--color-amendment)',
  unknown: 'var(--color-unknown)',
};

/** Literal hex values for canvas/WebGL contexts that can't read CSS variables. */
export const TYPE_HEX: Record<PermitType, string> = {
  new: '#fbbf24',
  renewal: '#22d3ee',
  amendment: '#c4a1ff',
  unknown: '#a3afc2',
};
