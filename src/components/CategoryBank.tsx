import { appState, dialog, nowMinute, selectedDate, today } from '../state/store';
import { addCategoryToFreeSlot } from '../state/actions';
import { formatDurationShort } from '../lib/time';
import { CATEGORY_MIME } from './Timeline';
import { Icon } from './Icon';

export function CategoryBank() {
  const s = appState.value!;
  const active = s.categories.filter((c) => !c.archived);
  const date = selectedDate.value;
  // Dnes přidáváme od aktuálního času, jinak od začátku dne.
  const from = date === today.value ? Math.ceil(nowMinute.value / s.settings.snap) * s.settings.snap : 0;

  return (
    <section class="card p-4" aria-label="Kategorie">
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-sm font-semibold">Kategorie</h2>
        <button type="button" class="btn-icon" onClick={() => (dialog.value = 'categories')} title="Spravovat kategorie" aria-label="Spravovat kategorie">
          <Icon name="settings" />
        </button>
      </div>
      <p class="mb-3 text-[11px] text-slate-400">Klik = přidat do prvního volného místa · přetažení = přesné umístění</p>
      {active.length === 0 ? (
        <button type="button" class="btn w-full" onClick={() => (dialog.value = 'categories')}>
          <Icon name="plus" class="h-3.5 w-3.5" /> Vytvořit kategorii
        </button>
      ) : (
        <div class="flex flex-wrap gap-2">
          {active.map((c) => (
            <button
              type="button"
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData(CATEGORY_MIME, c.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => addCategoryToFreeSlot(date, c.id, from)}
              class="flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left transition-all hover:border-slate-300 hover:shadow-xs active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600"
            >
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span class="flex flex-col">
                <span class="text-xs font-semibold">{c.name}</span>
                <span class="text-[10px] text-slate-400">{formatDurationShort(c.defaultDuration)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
