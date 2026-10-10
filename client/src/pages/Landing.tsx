import { motion } from 'framer-motion';
import { SearchBar } from '../components/SearchBar';
import { useI18n } from '../i18n';

export function Landing() {
  const { t } = useI18n();
  return (
    <section className="relative isolate flex min-h-[calc(100dvh-3.5rem)] items-center overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 20%, rgb(45 212 191 / 0.18), transparent 70%), radial-gradient(50% 50% at 85% 30%, rgb(167 139 250 / 0.18), transparent 70%), radial-gradient(60% 60% at 50% 100%, rgb(56 189 248 / 0.14), transparent 70%), #05070d',
        }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 text-xs font-semibold tracking-[0.18em] text-air-1 uppercase sm:text-sm"
        >
          {t('hero.kicker')}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl leading-[1.05] font-semibold text-ink sm:text-6xl"
        >
          {t('hero.title1')} <span className="text-gradient">{t('hero.title2')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
        >
          {t('hero.subtitle')}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8"
        >
          <SearchBar size="hero" />
        </motion.div>
        <p className="mt-8 text-xs text-faint">{t('disclaimer.permits')}</p>
      </div>
    </section>
  );
}
