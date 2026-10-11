import type { PermitSummary } from '../../../../shared/api';
import { useI18n } from '../../i18n';

export function SummaryBlock({ summary }: { summary: PermitSummary | null }) {
  const { t, lang } = useI18n();
  if (!summary) {
    return <p className="rounded-xl border border-line bg-white/[0.03] p-4 text-sm text-muted">{t('panel.summaryMissing')}</p>;
  }
  const text = summary[lang];
  const provenance = t('panel.summaryTemplate');

  return (
    <section aria-label={text.headline} className="space-y-3">
      <h3 className="text-xl leading-snug font-semibold text-ink">{text.headline}</h3>
      <p className="text-[15px] leading-relaxed text-ink/90">{text.summary}</p>
      <div className="rounded-xl border border-line bg-white/[0.03] p-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('panel.whatsChanging')}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{text.whatsChanging}</p>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-air-1" />
        {provenance}
      </p>
    </section>
  );
}
