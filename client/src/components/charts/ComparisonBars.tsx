import { useState } from 'react';

export interface ComparisonRow {
  key: string;
  label: string;
  value: number;
  display: string;
  color: string;
}

/**
 * Horizontal bars for "actual vs. baseline" (emphasis form: accent vs. gray).
 * Bars are <= 20px thick with a 4px rounded data end, direct-labeled at the tip,
 * and each is focusable with a hover/focus tooltip that mirrors the label.
 */
export function ComparisonBars({ rows, caption }: { rows: ComparisonRow[]; caption: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.value), Number.EPSILON);

  return (
    <figure className="space-y-4">
      <figcaption className="sr-only">{caption}</figcaption>
      {rows.map((row) => {
        const pct = Math.max(0.6, (row.value / max) * 100);
        return (
          <div key={row.key}>
            <p className="mb-1.5 text-xs text-muted">{row.label}</p>
            <div className="relative flex items-center gap-3">
              <div className="relative h-5 flex-1">
                <button
                  type="button"
                  aria-label={`${row.label}: ${row.display}`}
                  onMouseEnter={() => setActive(row.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(row.key)}
                  onBlur={() => setActive(null)}
                  className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-700 ease-out outline-offset-2"
                  style={{ width: `${pct}%`, background: row.color }}
                />
                {active === row.key && (
                  <div
                    role="tooltip"
                    className="absolute -top-9 z-10 rounded-lg border border-line bg-night-2 px-2.5 py-1 text-xs whitespace-nowrap text-ink shadow-lg"
                    style={{ left: `min(${pct}%, calc(100% - 8rem))` }}
                  >
                    {row.label}: <span className="font-semibold">{row.display}</span>
                  </div>
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-ink tabular-nums">{row.display}</span>
            </div>
          </div>
        );
      })}
    </figure>
  );
}
