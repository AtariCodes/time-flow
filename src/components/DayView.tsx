import { appState, dayMode, editor, nowMinute, selectedDate, selection, today, zoomHours } from '../state/store';
import { applyTemplate, blockLabel, clearDay, copyDay, deleteBlock, duplicateBlock, templatesForDate, toggleDone, setNote } from '../state/actions';
import { freeGaps, segmentsForDay } from '../lib/schedule';
import { addDays, formatClock, formatDateShort, formatDuration } from '../lib/time';
import { Timeline } from './Timeline';
import { ClockView } from './ClockView';
import { Stats } from './Stats';
import { Icon } from './Icon';

export function DayView() {
  const s = appState.value!;
  const date = selectedDate.value;
  const day = s.days[date];
  const hasBlocks = (day?.blocks.length ?? 0) > 0;

  return (
    <div class="flex min-w-0 flex-col gap-6">
      <section class="card p-4 sm:p-5" aria-label="Plán dne">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="segmented" role="group" aria-label="Zobrazení dne">
            <button type="button" aria-pressed={dayMode.value === 'timeline'} onClick={() => (dayMode.value = 'timeline')}>
              Osa
            </button>
            <button type="button" aria-pressed={dayMode.value === 'clock'} onClick={() => (dayMode.value = 'clock')}>
              Ciferník
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {dayMode.value === 'timeline' && (
              <div class="segmented" role="group" aria-label="Přiblížení">
                {([24, 12, 6, 3] as const).map((h) => (
                  <button type="button" key={h} aria-pressed={zoomHours.value === h} onClick={() => (zoomHours.value = h)}>
                    {h} h
                  </button>
                ))}
              </div>
            )}
            <button type="button" class="btn" onClick={() => editor.value = { kind: 'new', date, start: defaultNewStart(date) }}>
              <Icon name="plus" class="h-3.5 w-3.5" /> Blok
            </button>
            <button type="button" class="btn-danger" onClick={() => clearDay(date)} disabled={!hasBlocks}>
              <Icon name="trash" class="h-3.5 w-3.5" /> <span class="hidden sm:inline">Vyčistit den</span>
            </button>
          </div>
        </div>

        {!hasBlocks && <EmptyDayBanner />}

        {dayMode.value === 'timeline' ? <Timeline date={date} /> : <ClockView date={date} />}

        <SelectionBar />
        <FreeGaps />
      </section>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Stats />
        <section class="card flex flex-col p-5" aria-label="Poznámka">
          <div class="mb-3 flex items-center justify-between">
            <label class="text-sm font-semibold" for="day-note">
              Poznámka ke dni
            </label>
            <span class="text-xs text-slate-400">ukládá se automaticky</span>
          </div>
          <textarea
            id="day-note"
            class="input min-h-[160px] flex-1 resize-y text-sm"
            maxLength={20000}
            placeholder="Hlavní cíle, myšlenky, poznámky k tomuto dni…"
            value={day?.note ?? ''}
            onInput={(e) => setNote(date, e.currentTarget.value)}
          />
        </section>
      </div>
    </div>
  );
}

function defaultNewStart(date: string): number {
  const s = appState.value!;
  const step = s.settings.snap;
  if (date === today.value) return Math.min(1439, Math.ceil(nowMinute.value / step) * step);
  const gap = freeGaps(segmentsForDay(s, date), 6 * 60, 24 * 60, 15)[0];
  return gap?.start ?? 9 * 60;
}

function EmptyDayBanner() {
  const s = appState.value!;
  const date = selectedDate.value;
  const suggested = templatesForDate(date);
  const others = s.templates.filter((t) => !suggested.includes(t));
  const lastWeek = addDays(date, -7);
  const yesterday = addDays(date, -1);
  const canCopyLastWeek = (s.days[lastWeek]?.blocks.length ?? 0) > 0;
  const canCopyYesterday = (s.days[yesterday]?.blocks.length ?? 0) > 0;
  if (s.templates.length === 0 && !canCopyLastWeek && !canCopyYesterday) {
    return (
      <p class="mb-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700">
        Den je prázdný. Klikněte do osy, přetáhněte kategorii, nebo použijte tlačítko „Blok“.
      </p>
    );
  }
  return (
    <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-3 text-xs dark:border-indigo-800 dark:bg-indigo-950/30">
      <span class="font-medium text-indigo-900 dark:text-indigo-200">Prázdný den — začít z:</span>
      {suggested.map((t) => (
        <button type="button" key={t.id} class="btn-primary" onClick={() => applyTemplate(date, t.id)}>
          {t.name}
        </button>
      ))}
      {others.map((t) => (
        <button type="button" key={t.id} class="btn" onClick={() => applyTemplate(date, t.id)}>
          {t.name}
        </button>
      ))}
      {canCopyYesterday && (
        <button type="button" class="btn" onClick={() => copyDay(yesterday, date)}>
          <Icon name="copy" class="h-3.5 w-3.5" /> Včerejšek
        </button>
      )}
      {canCopyLastWeek && (
        <button type="button" class="btn" onClick={() => copyDay(lastWeek, date)}>
          <Icon name="copy" class="h-3.5 w-3.5" /> Jako {formatDateShort(lastWeek)}
        </button>
      )}
    </div>
  );
}

function SelectionBar() {
  const s = appState.value!;
  const sel = selection.value;
  const block = sel ? s.days[sel.date]?.blocks.find((b) => b.id === sel.id) : undefined;
  if (!sel || !block) return null;
  const end = block.start + block.duration;
  return (
    <div class="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800/70">
      <span class="min-w-0 flex-1 truncate">
        <strong>{blockLabel(block, s.categories)}</strong>{' '}
        <span class="text-slate-500 tabular-nums dark:text-slate-400">
          {sel.date !== selectedDate.value && `${formatDateShort(sel.date)} `}
          {formatClock(block.start)}–{formatClock(end)}
          {end > 1440 && ' (+1 den)'} · {formatDuration(block.duration)}
        </span>
      </span>
      <button type="button" class="btn" onClick={() => toggleDone(sel.date, sel.id)} aria-pressed={!!block.done}>
        <Icon name="check" class="h-3.5 w-3.5" /> {block.done ? 'Splněno' : 'Označit splněné'}
      </button>
      <button type="button" class="btn" onClick={() => (editor.value = { kind: 'edit', date: sel.date, id: sel.id })}>
        <Icon name="pencil" class="h-3.5 w-3.5" /> Upravit
      </button>
      <button type="button" class="btn" onClick={() => duplicateBlock(sel.date, sel.id)} aria-label="Duplikovat">
        <Icon name="copy" class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="btn-danger" onClick={() => deleteBlock(sel.date, sel.id)} aria-label="Smazat">
        <Icon name="trash" class="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FreeGaps() {
  const s = appState.value!;
  const date = selectedDate.value;
  const gaps = freeGaps(segmentsForDay(s, date), 0, 1440, 15);
  if (gaps.length === 0 || gaps.length === 1 && gaps[0].end - gaps[0].start === 1440) return null;
  return (
    <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      <span class="mr-1 text-slate-500 dark:text-slate-400">Volná místa:</span>
      {gaps.map((g) => (
        <button
          type="button"
          key={g.start}
          class="rounded-lg border border-dashed border-emerald-400 px-2 py-1 text-emerald-700 tabular-nums transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          onClick={() => (editor.value = { kind: 'new', date, start: g.start, duration: g.end - g.start })}
          title="Vyplnit tento úsek novým blokem"
        >
          {formatClock(g.start)}–{formatClock(g.end)} <span class="opacity-70">({formatDuration(g.end - g.start)})</span>
        </button>
      ))}
    </div>
  );
}
