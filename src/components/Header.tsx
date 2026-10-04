import { appState, canRedo, canUndo, dialog, redo, selectedDate, setTheme, theme, today, undo, view } from '../state/store';
import { exportState } from '../lib/backup';
import { countConflicts, occupiedMinutes, segmentsForDay } from '../lib/schedule';
import { addDays, DAY_MINUTES, formatDateLong, formatDuration } from '../lib/time';
import { Icon } from './Icon';

export function Header() {
  const s = appState.value!;
  const date = selectedDate.value;
  const segments = segmentsForDay(s, date);
  const occupied = occupiedMinutes(segments);
  const conflicts = countConflicts(segments);
  const step = view.value === 'week' ? 7 : 1;
  const nextTheme = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system';

  return (
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div class="flex items-center gap-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white" aria-hidden="true">
            24
          </div>
          <div class="leading-tight">
            <h1 class="text-sm font-bold tracking-tight">TimeFlow</h1>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">plánovač dne</p>
          </div>
        </div>

        <nav class="flex items-center gap-1" aria-label="Navigace v čase">
          <button type="button" class="btn-icon" onClick={() => (selectedDate.value = addDays(date, -step))} aria-label={step === 7 ? 'Předchozí týden' : 'Předchozí den'}>
            <Icon name="chevronLeft" />
          </button>
          <span class="min-w-[11rem] text-center text-sm font-semibold first-letter:uppercase" aria-live="polite">
            {formatDateLong(date)}
          </span>
          <button type="button" class="btn-icon" onClick={() => (selectedDate.value = addDays(date, step))} aria-label={step === 7 ? 'Další týden' : 'Další den'}>
            <Icon name="chevronRight" />
          </button>
          {date !== today.value && (
            <button type="button" class="btn ml-1" onClick={() => (selectedDate.value = today.value)}>
              Dnes
            </button>
          )}
        </nav>

        <div class="segmented" role="group" aria-label="Pohled">
          <button type="button" aria-pressed={view.value === 'day'} onClick={() => (view.value = 'day')}>
            Den
          </button>
          <button type="button" aria-pressed={view.value === 'week'} onClick={() => (view.value = 'week')}>
            Týden
          </button>
        </div>

        <div class="hidden items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs xl:flex dark:border-slate-700 dark:bg-slate-800/70">
          <span>
            Naplánováno <strong class="tabular-nums">{formatDuration(occupied)}</strong>
          </span>
          <span>
            Volno <strong class="tabular-nums">{formatDuration(DAY_MINUTES - occupied)}</strong>
          </span>
          <span>
            Využití <strong class="text-indigo-600 tabular-nums dark:text-indigo-400">{Math.round((occupied / DAY_MINUTES) * 100)} %</strong>
          </span>
          {conflicts > 0 && (
            <span class="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Některé bloky se překrývají">
              <Icon name="alert" class="h-3.5 w-3.5" /> {conflicts}
            </span>
          )}
        </div>

        <div class="ml-auto flex items-center gap-0.5">
          <button type="button" class="btn-icon" onClick={undo} disabled={!canUndo.value} title="Zpět (Ctrl+Z)" aria-label="Zpět">
            <Icon name="undo" />
          </button>
          <button type="button" class="btn-icon" onClick={redo} disabled={!canRedo.value} title="Znovu (Ctrl+Shift+Z)" aria-label="Znovu">
            <Icon name="redo" />
          </button>
          <span class="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button type="button" class="btn-icon" onClick={() => exportState(s)} title="Exportovat zálohu" aria-label="Exportovat zálohu">
            <Icon name="download" />
          </button>
          <button type="button" class="btn-icon" onClick={() => (dialog.value = 'import')} title="Importovat zálohu" aria-label="Importovat zálohu">
            <Icon name="upload" />
          </button>
          <button
            type="button"
            class="btn-icon"
            onClick={() => setTheme(nextTheme)}
            title={`Vzhled: ${theme.value === 'system' ? 'podle systému' : theme.value === 'light' ? 'světlý' : 'tmavý'}`}
            aria-label="Přepnout vzhled"
          >
            <Icon name={theme.value === 'system' ? 'monitor' : theme.value === 'light' ? 'sun' : 'moon'} />
          </button>
          <button type="button" class="btn-icon" onClick={() => (dialog.value = 'help')} title="Nápověda (?)" aria-label="Nápověda">
            <Icon name="keyboard" />
          </button>
          <button type="button" class="btn-icon" onClick={() => (dialog.value = 'settings')} title="Nastavení" aria-label="Nastavení">
            <Icon name="settings" />
          </button>
        </div>
      </div>
    </header>
  );
}
