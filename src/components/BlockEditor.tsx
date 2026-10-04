import { useState } from 'preact/hooks';
import { appState, editor, lastCategoryId, type EditorTarget } from '../state/store';
import { addBlock, deleteBlock, duplicateBlock, updateBlock } from '../state/actions';
import { findSlot, segmentsForDay } from '../lib/schedule';
import { DAY_MINUTES, formatClock, formatDateLong, formatDuration, parseClock } from '../lib/time';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function BlockEditorHost() {
  const target = editor.value;
  if (!target) return null;
  // key → při otevření jiného bloku se formulář založí znovu
  return <BlockEditor key={target.kind === 'edit' ? target.id : `new:${target.start}`} target={target} />;
}

function BlockEditor({ target }: { target: EditorTarget }) {
  const s = appState.value!;
  const existing = target.kind === 'edit' ? s.days[target.date]?.blocks.find((b) => b.id === target.id) : undefined;
  const activeCategories = s.categories.filter((c) => !c.archived || c.id === existing?.categoryId);

  const lastUsed = activeCategories.find((c) => c.id === lastCategoryId.value)?.id;
  const initialCategory =
    existing?.categoryId ?? (target.kind === 'new' ? target.categoryId : undefined) ?? lastUsed ?? activeCategories[0]?.id ?? '';
  const initialStart = existing?.start ?? (target.kind === 'new' ? target.start : 9 * 60);
  const initialDuration = (() => {
    if (existing) return existing.duration;
    if (target.kind === 'new' && target.duration) return target.duration;
    const cat = s.categories.find((c) => c.id === initialCategory);
    const wanted = cat?.defaultDuration ?? 60;
    // Nový blok se nesmí „rozlézt“ přes následující — zkrátíme ho na volné místo.
    const slot = findSlot(segmentsForDay(s, target.date), wanted, initialStart);
    return slot && slot.start === initialStart ? slot.duration : wanted;
  })();

  const [categoryId, setCategoryId] = useState(initialCategory);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [start, setStart] = useState(formatClock(initialStart));
  const [end, setEnd] = useState(formatClock(initialStart + initialDuration));
  const [done, setDone] = useState(existing?.done ?? false);
  const [note, setNote] = useState(existing?.note ?? '');
  const [touchedDuration, setTouchedDuration] = useState(target.kind === 'edit' || (target.kind === 'new' && !!target.duration));

  if (target.kind === 'edit' && !existing) {
    // Blok mezitím zmizel (např. undo) — editor zavřeme.
    queueMicrotask(() => (editor.value = null));
    return null;
  }

  const close = () => (editor.value = null);
  const startMin = parseClock(start);
  const endMin = parseClock(end);
  let duration: number | null = null;
  if (startMin !== null && endMin !== null && startMin < DAY_MINUTES) {
    duration = endMin > startMin ? endMin - startMin : endMin + DAY_MINUTES - startMin;
    if (endMin === startMin) duration = null;
  }
  const crossesMidnight = duration !== null && startMin !== null && startMin + duration > DAY_MINUTES;
  const error =
    startMin === null || startMin >= DAY_MINUTES
      ? 'Zadejte platný začátek.'
      : endMin === null
        ? 'Zadejte platný konec.'
        : duration === null
          ? 'Konec musí být jiný než začátek.'
          : !categoryId
            ? 'Nejdřív si vytvořte kategorii.'
            : null;

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    // U nového bloku převezmeme výchozí délku kategorie, dokud uživatel délku sám nezměnil.
    if (!touchedDuration && startMin !== null) {
      const cat = s.categories.find((c) => c.id === id);
      if (cat) setEnd(formatClock(startMin + cat.defaultDuration));
    }
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (error || startMin === null || duration === null) return;
    const data = { categoryId, start: startMin, duration, title: title.trim() || undefined, note: note.trim() || undefined, done };
    if (target.kind === 'edit') updateBlock(target.date, target.id, data);
    else addBlock(target.date, data);
    close();
  };

  return (
    <Modal title={target.kind === 'edit' ? 'Upravit blok' : 'Nový blok'} onClose={close} size="md">
      <form class="space-y-4" onSubmit={submit}>
        <p class="text-xs text-slate-500 dark:text-slate-400">{formatDateLong(target.date)}</p>

        <div>
          <label class="label" for="ed-category">
            Kategorie
          </label>
          <div class="flex flex-wrap gap-1.5" id="ed-category" role="radiogroup" aria-label="Kategorie">
            {activeCategories.map((c) => (
              <button
                type="button"
                key={c.id}
                role="radio"
                aria-checked={categoryId === c.id}
                onClick={() => onCategoryChange(c.id)}
                class={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  categoryId === c.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label class="label" for="ed-title">
            Vlastní název <span class="font-normal text-slate-400">(nepovinné)</span>
          </label>
          <input
            id="ed-title"
            class="input"
            maxLength={120}
            value={title}
            placeholder={s.categories.find((c) => c.id === categoryId)?.name}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label" for="ed-start">
              Začátek
            </label>
            <input id="ed-start" type="time" class="input tabular-nums" required value={start} onInput={(e) => setStart(e.currentTarget.value)} />
          </div>
          <div>
            <label class="label" for="ed-end">
              Konec
            </label>
            <input
              id="ed-end"
              type="time"
              class="input tabular-nums"
              required
              value={end === '24:00' ? '00:00' : end}
              onInput={(e) => {
                setEnd(e.currentTarget.value);
                setTouchedDuration(true);
              }}
            />
          </div>
          <div>
            <span class="label">Délka</span>
            <div class="flex h-[38px] items-center text-sm font-medium tabular-nums">{duration ? formatDuration(duration) : '—'}</div>
          </div>
        </div>
        {crossesMidnight && (
          <p class="-mt-2 flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
            <Icon name="clock" class="h-3.5 w-3.5" /> Blok pokračuje přes půlnoc do dalšího dne.
          </p>
        )}

        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4 accent-indigo-600" checked={done} onChange={(e) => setDone(e.currentTarget.checked)} />
          Splněno
        </label>

        <div>
          <label class="label" for="ed-note">
            Poznámka
          </label>
          <textarea id="ed-note" class="input min-h-[70px] resize-y" maxLength={20000} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </div>

        {error && <p class="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div class="flex gap-1">
            {target.kind === 'edit' && (
              <>
                <button
                  type="button"
                  class="btn-danger"
                  onClick={() => {
                    deleteBlock(target.date, target.id);
                    close();
                  }}
                >
                  <Icon name="trash" class="h-3.5 w-3.5" /> Smazat
                </button>
                <button
                  type="button"
                  class="btn"
                  onClick={() => {
                    duplicateBlock(target.date, target.id);
                    close();
                  }}
                >
                  <Icon name="copy" class="h-3.5 w-3.5" /> Duplikovat
                </button>
              </>
            )}
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn" onClick={close}>
              Zrušit
            </button>
            <button type="submit" class="btn-primary" disabled={!!error}>
              {target.kind === 'edit' ? 'Uložit' : 'Přidat'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
