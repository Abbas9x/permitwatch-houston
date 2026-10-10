import type { PermitType } from '../../../shared/permit';
import { useI18n } from '../i18n';
import { TYPE_COLORS } from '../lib/permitColors';

export function PermitTypeBadge({ type }: { type: PermitType }) {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
      style={{ color: TYPE_COLORS[type], borderColor: `color-mix(in srgb, ${TYPE_COLORS[type]} 45%, transparent)` }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: TYPE_COLORS[type] }} />
      {t(`type.${type}`)}
    </span>
  );
}

export function SampleBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center rounded-full border border-sample/50 bg-sample/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-sample uppercase">
      {t('sample.badge')}
    </span>
  );
}
