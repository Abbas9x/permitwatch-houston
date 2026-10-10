import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { GreenRouteStatsResponse } from '../../../shared/api';
import { ComparisonBars } from '../components/charts/ComparisonBars';
import { StackedShareBar } from '../components/charts/StackedShareBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { ExternalLink } from '../components/Link';
import { useI18n } from '../i18n';
import { api, ApiError } from '../lib/api';
import { formatNumber, formatPercent, formatUsd, formatWh } from '../lib/format';

/** Categorical slots 1-3 (dark), validated all-pairs on the card surface (#0e131d) with the dataviz palette validator. */
const TIER_COLORS = { router: '#3987e5', small: '#d95926', large: '#199e70', other: '#6b7a90' } as const;
const ACCENT = '#2dd4bf';
const BASELINE_GRAY = '#5b677a';
type Tier = keyof typeof TIER_COLORS;

/** Polls the stats endpoint, keeping the last good render on screen (no skeleton flash on refetch). */
function useLiveStats(intervalMs = 10_000) {
  const [data, setData] = useState<GreenRouteStatsResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      api.stats(controller.signal).then(
        (stats) => {
          if (cancelled) return;
          setData(stats);
          setError(null);
        },
        (err: unknown) => {
          if (!cancelled && !controller.signal.aborted) setError(err instanceof ApiError ? err : new ApiError('unknown', '', 0));
        },
      );
    };
    load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [intervalMs, attempt]);

  return { data, error, retry: () => setAttempt((n) => n + 1) };
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-[#0e131d] p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-[#0e131d] p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function tierOf(model: string | null, models: GreenRouteStatsResponse['models']): Tier {
  if (model === models.router) return 'router';
  if (model === models.small) return 'small';
  if (model === models.large) return 'large';
  return 'other';
}

function StatsView({ stats }: { stats: GreenRouteStatsResponse }) {
  const { t, lang } = useI18n();
  const tierLabel = (tier: Tier) => (tier === 'other' ? '—' : t(`dash.tier.${tier}`));
  const taskLabel = (task: string) =>
    task === 'permit_summary' || task === 'comment_draft' || task === 'permit_qa' ? t(`dash.task.${task}`) : task;
  const mixByTier = (['router', 'small', 'large'] as const).map((tier) => {
    const rows = stats.modelMix.filter((m) => tierOf(m.model, stats.models) === tier);
    const calls = rows.reduce((s, r) => s + r.calls, 0);
    return { tier, calls, model: stats.models[tier] };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-line bg-gradient-to-br from-air-1/15 via-[#0e131d] to-air-3/10 p-6">
          {stats.cost.savedPercent !== null ? (
            <>
              <p className="text-6xl font-semibold tracking-tight text-ink sm:text-7xl">
                {formatPercent(stats.cost.savedPercent, lang)}
              </p>
              <p className="mt-2 text-sm text-muted">{t('dash.hero', { model: stats.baselineModel })}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t('dash.heroNone')}</p>
          )}
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink">
            <span aria-hidden="true" className={`size-2 rounded-full ${stats.mode === 'live' ? 'bg-air-1' : 'bg-sample'}`} />
            {stats.mode === 'live' ? t('dash.modeLive') : t('dash.modeMock')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label={t('dash.tasks')} value={formatNumber(stats.tasks, lang)} />
          <StatTile label={t('dash.summaries')} value={formatNumber(stats.permitsSummarized, lang)} />
          <StatTile label={t('dash.cacheHits')} value={formatNumber(stats.cacheHits, lang)} />
          <StatTile label={t('dash.rules')} value={formatNumber(stats.rulesRouted, lang)} />
          <StatTile label={t('dash.router')} value={formatNumber(stats.routerCalls, lang)} />
          <StatTile label={t('dash.fallbacks')} value={formatNumber(stats.fallbacks, lang)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('dash.costHeading')}>
          <ComparisonBars
            caption={t('dash.costHeading')}
            rows={[
              { key: 'actual', label: t('dash.actual'), value: stats.cost.actualUsd, display: formatUsd(stats.cost.actualUsd, lang), color: ACCENT },
              {
                key: 'baseline',
                label: t('dash.baseline', { model: stats.baselineModel }),
                value: stats.cost.baselineUsd,
                display: formatUsd(stats.cost.baselineUsd, lang),
                color: BASELINE_GRAY,
              },
            ]}
          />
        </Card>
        <Card title={t('dash.energyHeading')}>
          <ComparisonBars
            caption={t('dash.energyHeading')}
            rows={[
              { key: 'actual', label: t('dash.actual'), value: stats.energy.actualWh, display: formatWh(stats.energy.actualWh, lang), color: ACCENT },
              {
                key: 'baseline',
                label: t('dash.baseline', { model: stats.baselineModel }),
                value: stats.energy.baselineWh,
                display: formatWh(stats.energy.baselineWh, lang),
                color: BASELINE_GRAY,
              },
            ]}
          />
          {stats.energy.savedPercent !== null && (
            <p className="mt-4 text-xs text-muted">
              {t('dash.energySaved', { pct: formatPercent(stats.energy.savedPercent, lang) })}
            </p>
          )}
        </Card>
      </div>

      <Card title={t('dash.mixHeading')} subtitle={t('dash.mixSub')}>
        <StackedShareBar
          caption={t('dash.mixHeading')}
          segments={mixByTier.map((m) => ({
            key: m.tier,
            label: `${tierLabel(m.tier)} · ${m.model}`,
            value: m.calls,
            color: TIER_COLORS[m.tier],
            detail: `${formatNumber(m.calls, lang)} ${t('dash.col.calls').toLowerCase()}`,
          }))}
        />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.model')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.tier')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.col.calls')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.col.tokens')}</th>
                <th scope="col" className="py-2 text-right font-medium">{t('dash.col.cost')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.modelMix.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted">{t('dash.empty')}</td>
                </tr>
              )}
              {stats.modelMix.map((m) => {
                const tier = tierOf(m.model, stats.models);
                return (
                  <tr key={m.model} className="border-b border-line/60">
                    <td className="py-2 pr-3 text-ink">
                      <span aria-hidden="true" className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: TIER_COLORS[tier] }} />
                      {m.model}
                    </td>
                    <td className="py-2 pr-3 text-muted">{tierLabel(tier)}</td>
                    <td className="py-2 pr-3 text-right text-ink">{formatNumber(m.calls, lang)}</td>
                    <td className="py-2 pr-3 text-right text-muted">
                      {formatNumber(m.inputTokens, lang)} / {formatNumber(m.outputTokens, lang)}
                    </td>
                    <td className="py-2 text-right text-ink">{formatUsd(m.costUsd, lang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('dash.recentHeading')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.time')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.task')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.route')}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t('dash.col.model')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.col.cost')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.col.latency')}</th>
                <th scope="col" className="py-2 font-medium">{t('dash.col.ok')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-muted">{t('dash.empty')}</td>
                </tr>
              )}
              {stats.recent.map((r, i) => (
                <tr key={`${r.createdAt}-${i}`} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-muted">
                    {new Date(r.createdAt).toLocaleTimeString(lang === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-2 pr-3 text-ink">{taskLabel(r.task)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted">{r.routeReason}</td>
                  <td className="py-2 pr-3 text-ink">{r.model ?? '—'}</td>
                  <td className="py-2 pr-3 text-right text-ink">{formatUsd(r.costUsd, lang)}</td>
                  <td className="py-2 pr-3 text-right text-muted">{formatNumber(r.latencyMs, lang)} ms</td>
                  <td className={`py-2 ${r.success ? 'text-air-1' : 'text-deadline'}`}>{r.success ? t('dash.ok') : t('dash.failed')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="space-y-2 rounded-2xl border border-line p-5 text-xs leading-relaxed text-muted">
        <h2 className="text-sm font-semibold text-ink">{t('dash.methodHeading')}</h2>
        <p>
          {t('dash.methodCost', { date: stats.pricingSource.pageUpdated })}{' '}
          <ExternalLink href={stats.pricingSource.url} className="text-air-2 underline underline-offset-2">
            ai.google.dev/gemini-api/docs/pricing
          </ExternalLink>
        </p>
        <p>{t('dash.methodBaseline', { model: stats.baselineModel })}</p>
        <p>
          {t('dash.methodEnergy', { note: stats.energySource.note })}{' '}
          <ExternalLink href={stats.energySource.url} className="text-air-2 underline underline-offset-2">
            MIT Technology Review (Aug 2025)
          </ExternalLink>
        </p>
      </section>
    </div>
  );
}

export function Dashboard() {
  const { t } = useI18n();
  const { data, error, retry } = useLiveStats();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-air-1 uppercase">{t('dash.kicker')}</p>
        <h1 className="mt-2 text-3xl leading-tight font-semibold text-ink sm:text-4xl">{t('dash.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{t('dash.subtitle')}</p>
        <p className="mt-3 text-sm text-gradient font-semibold">{t('app.tagline')}</p>
      </motion.header>
      {data ? (
        <StatsView stats={data} />
      ) : error ? (
        <ErrorNotice error={error} onRetry={retry} />
      ) : (
        <div role="status" aria-label={t('dash.loading')} className="grid gap-6 lg:grid-cols-2">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl lg:col-span-2" />
        </div>
      )}
    </div>
  );
}
