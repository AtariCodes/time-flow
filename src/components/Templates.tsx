import { useState } from 'preact/hooks';
import { appState, dialog, selectedDate } from '../state/store';
import { applyTemplate, deleteTemplate, saveDayAsTemplate, updateTemplate } from '../state/actions';
import { WEEKDAY_SHORT, weekdayIndex } from '../lib/time';
import { Icon } from './Icon';
import { Modal } from './Modal';

export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div class="flex gap-1" role="group" aria-label="Dny v týdnu">
      {WEEKDAY_SHORT.map((label, i) => {
        const on = value.includes(i);
        return (
          <button
            type="button"
            key={label}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort())}
            class={`h-7 w-7 rounded-md text-[11px] font-semibold transition-colors ${
              on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Templates() {
  const s = appState.value!;
  const date = selectedDate.value;
  const wd = weekdayIndex(date);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section class="card p-4" aria-label="Šablony dnů">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">Šablony dnů</h2>
        <button
          type="button"
          class="btn"
          onClick={() => (dialog.value = 'save-template')}
          disabled={!s.days[date]?.blocks.length}
          title="Uložit aktuální den jako šablonu"
        >
          <Icon name="save" class="h-3.5 w-3.5" /> Uložit den
        </button>
      </div>
      {s.templates.length === 0 && <p class="text-xs text-slate-400">Zatím žádné šablony. Naplánujte den a uložte ho.</p>}
      <ul class="flex flex-col gap-2">
        {s.templates.map((t) => (
          <li key={t.id} class="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 truncate text-xs font-semibold">
                  {t.name}
                  {t.weekdays.includes(wd) && (
                    <span class="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      pro tento den
                    </span>
                  )}
                </div>
                <div class="text-[10px] text-slate-400">
                  {t.blocks.length} bloků · {t.weekdays.length ? t.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ') : 'bez opakování'}
                </div>
              </div>
              <div class="flex shrink-0 items-center">
                <button
                  type="button"
                  class="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                  onClick={() => applyTemplate(date, t.id, 'replace')}
                  title="Nahradí bloky vybraného dne (lze vrátit)"
                >
                  Použít
                </button>
                <button
                  type="button"
                  class="btn-icon"
                  onClick={() => applyTemplate(date, t.id, 'merge')}
                  title="Přidat bloky šablony k existujícím"
                  aria-label={`Přidat šablonu ${t.name} k existujícím blokům`}
                >
                  <Icon name="plus" class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="btn-icon"
                  onClick={() => setEditing(editing === t.id ? null : t.id)}
                  aria-label={`Upravit šablonu ${t.name}`}
                  aria-expanded={editing === t.id}
                >
                  <Icon name="pencil" class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {editing === t.id && (
              <div class="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                <input
                  class="input py-1.5 text-xs"
                  value={t.name}
                  aria-label="Název šablony"
                  onChange={(e) => e.currentTarget.value.trim() && updateTemplate(t.id, { name: e.currentTarget.value.trim() })}
                />
                <div class="text-[11px] text-slate-500">Nabízet v tyto dny:</div>
                <WeekdayPicker value={t.weekdays} onChange={(weekdays) => updateTemplate(t.id, { weekdays })} />
                <button type="button" class="btn-danger px-0" onClick={() => deleteTemplate(t.id)}>
                  <Icon name="trash" class="h-3.5 w-3.5" /> Smazat šablonu
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SaveTemplateDialog() {
  const date = selectedDate.value;
  const [name, setName] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([weekdayIndex(date)]);
  const close = () => (dialog.value = null);
  return (
    <Modal title="Uložit den jako šablonu" onClose={close}>
      <form
        class="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          saveDayAsTemplate(date, name, weekdays);
          close();
        }}
      >
        <div>
          <label class="label" for="tpl-name">
            Název
          </label>
          <input id="tpl-name" class="input" required maxLength={120} placeholder="např. Home office" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div>
          <span class="label">Nabízet automaticky v tyto dny</span>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} />
          <p class="mt-1.5 text-[11px] text-slate-400">Když otevřete prázdný den, šablona se nabídne jako první.</p>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn" onClick={close}>
            Zrušit
          </button>
          <button type="submit" class="btn-primary" disabled={!name.trim()}>
            Uložit
          </button>
        </div>
      </form>
    </Modal>
  );
}
