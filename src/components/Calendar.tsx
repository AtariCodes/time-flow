import { useEffect, useState } from 'preact/hooks';
import { appState, selectedDate, today, view } from '../state/store';
import { occupiedMinutes, segmentsForDay } from '../lib/schedule';
import {
  addDays,
  DAY_MINUTES,
  daysInMonth,
  formatDuration,
  formatMonth,
  parseDateKey,
  startOfMonth,
  toDateKey,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '../lib/time';
import { Icon } from './Icon';

export function Calendar() {
  const s = appState.value!;
  const [month, setMonth] = useState(startOfMonth(selectedDate.value));

  // Kalendář sleduje vybraný den (např. při přechodu šipkami do jiného měsíce).
  useEffect(() => setMonth(startOfMonth(selectedDate.value)), [selectedDate.value.slice(0, 7)]);

  const shiftMonth = (delta: number) => {
    const d = parseDateKey(month);
    d.setMonth(d.getMonth() + delta);
    setMonth(toDateKey(d));
  };

  const lead = weekdayIndex(month);
  const count = daysInMonth(month);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(month, i))];

  return (
    <section class="card p-4" aria-label="Kalendář">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-bold">{formatMonth(month)}</h2>
        <div class="flex items-center">
          <button type="button" class="btn-icon" onClick={() => shiftMonth(-1)} aria-label="Předchozí měsíc">
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => {
              selectedDate.value = today.value;
              setMonth(startOfMonth(today.value));
            }}
          >
            Dnes
          </button>
          <button type="button" class="btn-icon" onClick={() => shiftMonth(1)} aria-label="Další měsíc">
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
      <div class="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div class="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const day = s.days[date];
          const segments = segmentsForDay(s, date);
          const occupied = occupiedMinutes(segments);
          const fill = occupied / DAY_MINUTES;
          const isSelected = date === selectedDate.value;
          const isToday = date === today.value;
          const weekend = weekdayIndex(date) >= 5;
          const tip = [
            occupied ? `Naplánováno ${formatDuration(occupied)}` : 'Nic naplánováno',
            day?.blocks.length ? `${day.blocks.length} bloků` : '',
            day?.note.trim() ? `Poznámka: ${day.note.trim().slice(0, 60)}${day.note.length > 60 ? '…' : ''}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return (
            <button
              type="button"
              key={date}
              title={tip}
              aria-label={`${parseDateKey(date).getDate()}. ${formatMonth(date)}${isToday ? ', dnes' : ''}`}
              aria-pressed={isSelected}
              onClick={() => {
                selectedDate.value = date;
                view.value = 'day';
              }}
              class={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-indigo-600 font-bold text-white'
                  : isToday
                    ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : `hover:bg-slate-100 dark:hover:bg-slate-800 ${weekend ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`
              }`}
            >
              <span>{parseDateKey(date).getDate()}</span>
              {occupied > 0 && (
                <span
                  class={`absolute bottom-1 h-0.5 rounded-full ${isSelected ? 'bg-white/80' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(15, fill * 70)}%` }}
                />
              )}
              {day?.note.trim() && <span class={`absolute top-1 right-1 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-500'}`} />}
            </button>
          );
        })}
      </div>
      <div class="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
        <span class="flex items-center gap-1.5">
          <span class="h-0.5 w-4 rounded-full bg-emerald-500" /> zaplnění dne
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-1 w-1 rounded-full bg-amber-500" /> poznámka
        </span>
      </div>
    </section>
  );
}
