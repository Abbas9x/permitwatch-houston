import type { PermitType } from '../../../shared/permit';

/** CSS colors per permit type (theme tokens; each meets 4.5:1 contrast on the night background). */
export const TYPE_COLORS: Record<PermitType, string> = {
  new: 'var(--color-new)',
  renewal: 'var(--color-renewal)',
  amendment: 'var(--color-amendment)',
  unknown: 'var(--color-unknown)',
};
