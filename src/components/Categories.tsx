import { useState } from 'preact/hooks';
import { appState, dialog } from '../state/store';
import { categoryUsage, removeCategory, restoreCategory, saveCategory } from '../state/actions';
import type { Category } from '../lib/model';
import { readableTextColor } from '../lib/color';
import { Icon } from './Icon';
import { Modal } from './Modal';

const PALETTE = ['#4f46e5', '#6366f1', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#f43f5e', '#ec4899', '#a855f7', '#64748b'];

function CategoryForm({ initial, onDone }: { initial?: Category; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const [duration, setDuration] = useState(String(initial?.defaultDuration ?? 60));
  const [goal, setGoal] = useState(initial?.weeklyGoal ? String(initial.weeklyGoal / 60) : '');
  const durationNum = Number(duration);
  const goalNum = goal === '' ? 0 : Number(goal);
  const valid = name.trim() !== '' && durationNum >= 5 && durationNum <= 1440 && goalNum >= 0 && goalNum <= 168;

  return (
    <form
      class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        saveCategory({ id: initial?.id, name, color, defaultDuration: durationNum, weeklyGoal: goalNum ? goalNum * 60 : undefined });
        onDone();
      }}
    >
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <input class="input" required maxLength={120} placeholder="Název (např. Čtení)" value={name} onInput={(e) => setName(e.currentTarget.value)} aria-label="Název kategorie" />
        <input type="color" class="h-[38px] w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent dark:border-slate-700" value={color} onInput={(e) => setColor(e.currentTarget.value)} aria-label="Barva" />
      </div>
      <div class="flex flex-wrap gap-1.5">
        {PALETTE.map((p) => (
          <button
            type="button"
            key={p}
            class={`h-6 w-6 rounded-full border-2 ${color === p ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
            style={{ backgroundColor: p }}
            onClick={() => setColor(p)}
            aria-label={`Barva ${p}`}
          />
        ))}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="label">Výchozí délka (min)</label>
          <input type="number" class="input" min={5} max={1440} step={5} value={duration} onInput={(e) => setDuration(e.currentTarget.value)} />
        </div>
        <div>
          <label class="label">Týdenní cíl (h)</label>
          <input type="number" class="input" min={0} max={168} step={0.5} placeholder="bez cíle" value={goal} onInput={(e) => setGoal(e.currentTarget.value)} />
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="rounded-md px-2 py-1 text-xs font-semibold" style={{ backgroundColor: color, color: readableTextColor(color) }}>
          {name.trim() || 'Náhled'}
        </span>
        <div class="flex gap-2">
          <button type="button" class="btn" onClick={onDone}>
            Zrušit
          </button>
          <button type="submit" class="btn-primary" disabled={!valid}>
            {initial ? 'Uložit' : 'Přidat'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CategoriesDialog() {
  const s = appState.value!;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const active = s.categories.filter((c) => !c.archived);
  const archived = s.categories.filter((c) => c.archived);

  return (
    <Modal title="Kategorie" onClose={() => (dialog.value = null)} size="md">
      <div class="space-y-3">
        {editing === 'new' ? (
          <CategoryForm onDone={() => setEditing(null)} />
        ) : (
          <button type="button" class="btn w-full" onClick={() => setEditing('new')}>
            <Icon name="plus" class="h-3.5 w-3.5" /> Nová kategorie
          </button>
        )}
        <ul class="space-y-2">
          {active.map((c) =>
            editing === c.id ? (
              <li key={c.id}>
                <CategoryForm initial={c} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={c.id} class="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span class="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{c.name}</div>
                  <div class="text-[11px] text-slate-400">
                    {c.defaultDuration} min{c.weeklyGoal ? ` · cíl ${c.weeklyGoal / 60} h/týden` : ''} · použito {categoryUsage(c.id)}×
                  </div>
                </div>
                <button type="button" class="btn-icon" onClick={() => setEditing(c.id)} aria-label={`Upravit ${c.name}`}>
                  <Icon name="pencil" class="h-3.5 w-3.5" />
                </button>
                <button type="button" class="btn-icon hover:text-rose-600" onClick={() => removeCategory(c.id)} aria-label={`Odebrat ${c.name}`}>
                  <Icon name="trash" class="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
        {archived.length > 0 && (
          <details class="text-xs">
            <summary class="cursor-pointer text-slate-500">Archivované ({archived.length})</summary>
            <ul class="mt-2 space-y-1">
              {archived.map((c) => (
                <li key={c.id} class="flex items-center gap-2 px-1">
                  <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span class="flex-1">{c.name}</span>
                  <button type="button" class="btn-icon" onClick={() => restoreCategory(c.id)} aria-label={`Obnovit ${c.name}`} title="Obnovit">
                    <Icon name="restore" class="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}
