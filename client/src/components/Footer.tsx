import { useI18n } from '../i18n';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-night">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-8 text-xs leading-relaxed text-muted sm:px-6">
        <p className="font-medium text-ink">{t('disclaimer.permits')}</p>
        <p>{t('footer.data')}</p>
        <p>{t('footer.geocoder')}</p>
        <p>{t('footer.places')}</p>
        <p>{t('footer.notAdvice')}</p>
        <p className="pt-2 text-faint">{t('app.tagline')}</p>
      </div>
    </footer>
  );
}
