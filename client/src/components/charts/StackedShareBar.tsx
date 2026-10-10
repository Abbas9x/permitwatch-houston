import { useState } from 'react';

export interface ShareSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  detail: string;
}

/**
 * 100% stacked bar (part-to-whole) with a 2px surface gap between segments, a legend
 * (always present for 2+ series), and per-segment hover/focus tooltips.
 */
export function StackedShareBar({ segments, caption }: { segments: ShareSegment[]; caption: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const activeSegment = visible.find((s) => s.key === active);

  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative">
        <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]">
          {visible.map((segment) => (
            <button
              key={segment.key}
              type="button"
              aria-label={`${segment.label}: ${segment.detail}`}
              onMouseEnter={() => setActive(segment.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(segment.key)}
              onBlur={() => setActive(null)}
              className="h-full transition-[flex-grow] duration-700 outline-offset-2"
              style={{ flexGrow: segment.value, flexBasis: 0, background: segment.color }}
            />
          ))}
        </div>
        {activeSegment && (
          <div role="tooltip" className="absolute -top-9 left-0 rounded-lg border border-line bg-night-2 px-2.5 py-1 text-xs text-ink shadow-lg">
            {activeSegment.label}: <span className="font-semibold">{activeSegment.detail}</span>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-ink">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <span className="text-muted tabular-nums">
              {total > 0 ? Math.round((segment.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
