import { motion, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { useI18n } from '../i18n';
import { chooseBackground, type BackgroundMode } from '../lib/capabilities';

// The WebGL scene is a separate chunk, requested only after first paint, so the search bar is usable instantly.
const ShaderBackground = lazy(() => import('../components/background/ShaderBackground'));

/** Static fallback: also the first paint on every device. */
function StaticGradient() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-20"
      style={{
        background:
          'radial-gradient(60% 50% at 18% 22%, rgb(45 212 191 / 0.16), transparent 70%), radial-gradient(50% 50% at 86% 28%, rgb(167 139 250 / 0.16), transparent 70%), radial-gradient(60% 60% at 50% 105%, rgb(56 189 248 / 0.13), transparent 70%), #05070d',
      }}
    />
  );
}

function whenIdle(callback: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 300);
  return () => clearTimeout(id);
}

export function Landing() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const [background, setBackground] = useState<BackgroundMode>('static');
  const [sceneReady, setSceneReady] = useState(false);
  const [diving, setDiving] = useState(false);

  useEffect(() => whenIdle(() => setBackground(chooseBackground())), []);

  // Search transition: the air field "dives" toward the city while the hero fades, then the map flies in.
  const beforeNavigate = async () => {
    if (reducedMotion) return;
    setDiving(true);
    await new Promise((resolve) => setTimeout(resolve, 420));
  };

  const steps = [
    { n: 1, title: t('how.1.title'), body: t('how.1.body') },
    { n: 2, title: t('how.2.title'), body: t('how.2.body') },
    { n: 3, title: t('how.3.title'), body: t('how.3.body') },
  ];

  return (
    <section className="relative isolate flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
      <StaticGradient />
      {background === 'animated' && (
        <Suspense fallback={null}>
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: sceneReady ? 1 : 0 }}
            transition={{ duration: 1.2 }}
          >
            <ShaderBackground dive={diving} onReady={() => setSceneReady(true)} onFallback={() => setBackground('static')} />
          </motion.div>
        </Suspense>
      )}
      {/* Scrim so text keeps AA contrast over any frame of the animation. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_32%_45%,rgb(5_7_13/0.82),rgb(5_7_13/0.35)_70%,transparent)]"
      />

      <motion.div
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-14 sm:px-6"
        animate={diving ? { opacity: 0, scale: 1.03, filter: 'blur(6px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
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
          className="mt-5 max-w-2xl text-base leading-relaxed text-ink/80 sm:text-lg"
        >
          {t('hero.subtitle')}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8">
          <SearchBar size="hero" onBeforeNavigate={beforeNavigate} />
        </motion.div>
        <p className="mt-6 text-xs text-muted">{t('disclaimer.permits')}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: diving ? 0 : 1 }}
        transition={{ delay: diving ? 0 : 0.35 }}
        className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6"
      >
        <h2 className="sr-only">{t('how.label')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="glass rounded-2xl p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-white/10 text-xs">
                  {step.n}
                </span>
                {step.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </motion.div>
    </section>
  );
}
