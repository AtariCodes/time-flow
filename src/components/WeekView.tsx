import { appState, selectedDate, today, view } from '../state/store';
import { blockLabel } from '../state/actions';
import { layoutLanes, occupiedMinutes, segmentsForDay } from '../lib/schedule';
import { addDays, DAY_MINUTES, formatDateShort, formatDuration, rangeDays, startOfWeek } from '../lib/time';
import { readableTextColor } from '../lib/color';
import { Stats } from './Stats';

export function WeekView() {
  const s = appState.value!;
  const monday = startOfWeek(selectedDate.value);
  const days = rangeDays(monday, 7);
  const categories = new Map(s.categories.map((c) => [c.id, c]));

  return (
    <div class="flex flex-col gap-6">
      <section class="card p-4 sm:p-5" aria-label="Týden">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            Týden {formatDateShort(monday)} – {formatDateShort(addDays(monday, 6))}
          </h2>
          <span class="text-xs text-slate-400">Kliknutím otevřete den</span>
        </div>
        <div class="overflow-x-auto">
          <div class="grid min-w-[640px] grid-cols-[32px_repeat(7,1fr)] gap-1.5">
            <div />
            {days.map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => {
                  selectedDate.value = d;
                  view.value = 'day';
                }}
                class={`rounded-lg py-1 text-center text-xs font-semibold ${
                  d === today.value ? 'bg-indigo-600 text-white' : d === selectedDate.value ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {formatDateShort(d)}
              </button>
            ))}
            <div class="relative h-[520px] text-[10px] text-slate-400">
              {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
                <span key={h} class="absolute right-1 -translate-y-1/2 tabular-nums" style={{ top: `clamp(6px, ${(h / 24) * 100}%, calc(100% - 6px))` }}>
                  {h}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const segments = segmentsForDay(s, d);
              const lanes = layoutLanes(segments);
              return (
                <button
                  type="button"
                  key={d}
                  aria-label={`${formatDateShort(d)}: naplánováno ${formatDuration(occupiedMinutes(segments))}`}
                  class="relative h-[520px] overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-left hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-indigo-700"
                  onClick={() => {
                    selectedDate.value = d;
                    view.value = 'day';
                  }}
                >
                  {[6, 12, 18].map((h) => (
                    <div key={h} class="absolute inset-x-0 border-t border-slate-200/70 dark:border-slate-800" style={{ top: `${(h / 24) * 100}%` }} />
                  ))}
                  {segments.map((seg) => {
                    const lane = lanes.get(seg.key) ?? { lane: 0, lanes: 1 };
                    const color = categories.get(seg.block.categoryId)?.color ?? '#64748b';
                    const height = ((seg.end - seg.start) / DAY_MINUTES) * 100;
                    return (
                      <div
                        key={seg.key}
                        class="absolute overflow-hidden rounded px-1 text-[9px] leading-tight font-semibold"
                        style={{
                          top: `${(seg.start / DAY_MINUTES) * 100}%`,
                          height: `calc(${height}% - 1px)`,
                          left: `calc(${(lane.lane / lane.lanes) * 100}% + 1px)`,
                          width: `calc(${100 / lane.lanes}% - 2px)`,
                          backgroundColor: color,
                          color: readableTextColor(color),
                          opacity: seg.spill ? 0.7 : seg.block.done ? 1 : 0.9,
                        }}
                      >
                        {height > 3 && blockLabel(seg.block, s.categories)}
                      </div>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <Stats fixedRange="week" />
    </div>
  );
}
