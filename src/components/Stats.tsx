import { useState } from 'preact/hooks';
import { appState, selectedDate } from '../state/store';
import { statsForRange } from '../lib/schedule';
import { daysInMonth, formatDuration, startOfMonth, startOfWeek, type DateKey } from '../lib/time';
import { Icon } from './Icon';

export type StatsRange = 'day' | 'week' | 'month';

function rangeFor(range: StatsRange, date: DateKey): [DateKey, number] {
  if (range === 'week') return [startOfWeek(date), 7];
  if (range === 'month') return [startOfMonth(date), daysInMonth(date)];
  return [date, 1];
}

export function Stats({ fixedRange }: { fixedRange?: StatsRange }) {
  const s = appState.value!;
  const [range, setRange] = useState<StatsRange>('day');
  const active = fixedRange ?? range;
  const [start, count] = rangeFor(active, selectedDate.value);
  const stats = statsForRange(s, start, count);
  const max = Math.max(1, ...stats.byCategory.map((c) => Math.max(c.planned, goalFor(c.category.weeklyGoal, active, count))));
  const percent = Math.round((stats.occupied / stats.total) * 100);

  return (
    <section class="card flex flex-col p-5" aria-label="Přehled činností">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">Přehled činností</h3>
        {!fixedRange && (
          <div class="segmented" role="group" aria-label="Období">
            {(['day', 'week', 'month'] as const).map((r) => (
              <button type="button" key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r === 'day' ? 'Den' : r === 'week' ? 'Týden' : 'Měsíc'}
              </button>
            ))}
          </div>
        )}
      </div>

      <dl class="mb-4 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <dt class="text-[10px] tracking-wide text-slate-500 uppercase">Naplánováno</dt>
          <dd class="text-sm font-bold tabular-nums">{formatDuration(stats.occupied)}</dd>
        </div>
        <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <dt class="text-[10px] tracking-wide text-slate-500 uppercase">Využití</dt>
          <dd class="text-sm font-bold tabular-nums">{percent} %</dd>
        </div>
        <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <dt class="text-[10px] tracking-wide text-slate-500 uppercase">Splněno</dt>
          <dd class="text-sm font-bold tabular-nums">{formatDuration(stats.done)}</dd>
        </div>
      </dl>

      {stats.conflicts > 0 && (
        <p class="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Icon name="alert" class="h-3.5 w-3.5 shrink-0" /> {stats.conflicts} {stats.conflicts === 1 ? 'překryv' : stats.conflicts < 5 ? 'překryvy' : 'překryvů'} bloků
          (do využití se počítají jen jednou)
        </p>
      )}

      {stats.byCategory.length === 0 ? (
        <p class="py-6 text-center text-xs text-slate-400">V tomto období není nic naplánováno.</p>
      ) : (
        <ul class="flex flex-col gap-3">
          {stats.byCategory.map(({ category, planned, done }) => {
            const goal = goalFor(category.weeklyGoal, active, count);
            return (
              <li key={category.id}>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="flex items-center gap-2 font-semibold">
                    <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.name}
                  </span>
                  <span class="text-slate-500 tabular-nums dark:text-slate-400">
                    {formatDuration(planned)}
                    {done > 0 && <span class="text-emerald-600 dark:text-emerald-400"> · ✓ {formatDuration(done)}</span>}
                    {goal > 0 && <span class="text-slate-400"> / cíl {formatDuration(goal)}</span>}
                  </span>
                </div>
                <div class="relative h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div class="absolute inset-y-0 left-0 rounded-full opacity-40" style={{ width: `${(planned / max) * 100}%`, backgroundColor: category.color }} />
                  <div class="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(done / max) * 100}%`, backgroundColor: category.color }} />
                  {goal > 0 && <div class="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${Math.min(99.5, (goal / max) * 100)}%` }} title="Cíl" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p class="mt-4 text-[11px] text-slate-400">Světlá část = naplánováno, plná = splněno, svislá čára = cíl.</p>
    </section>
  );
}

/** Týdenní cíl přepočtený na zvolené období (u dne se cíl nezobrazuje). */
function goalFor(weeklyGoal: number | undefined, range: StatsRange, days: number): number {
  if (!weeklyGoal || range === 'day') return 0;
  return range === 'week' ? weeklyGoal : Math.round((weeklyGoal * days) / 7);
}
